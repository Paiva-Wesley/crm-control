import { useEffect, useState, useMemo } from 'react';
import {
    PieChart, TrendingUp, DollarSign, BarChart3, AlertTriangle, Download, Lightbulb
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { computeProductMetrics } from '../lib/pricing';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { buildInsights, type Insight } from '../lib/insights/buildInsights';

export function CmvAnalysis() {
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('30d');
    const [showAll, setShowAll] = useState(false);

    // Auth & Business Settings
    const { companyId } = useAuth();
    const biz = useBusinessSettings();
    const { canAccess } = useSubscription();

    // Raw Data State
    const [rawProducts, setRawProducts] = useState<any[]>([]);
    const [salesMap, setSalesMap] = useState<Map<number, { qty: number, total: number }>>(new Map());

    useEffect(() => {
        if (companyId) fetchRawData();
    }, [dateRange, companyId]);

    async function fetchRawData() {
        try {
            setLoading(true);

            // 1. Fetch Products with Costs (filtered by company)
            const prodQuery = supabase
                .from('product_costs_view')
                .select('*')
                .order('name');
            if (companyId) prodQuery.eq('company_id', companyId);
            const { data: prods } = await prodQuery;

            // 2. Fetch Sales — filtered by company_id + dateRange
            const now = new Date();
            const dateStart = new Date();
            if (dateRange === '7d') dateStart.setDate(now.getDate() - 7);
            else if (dateRange === '30d') dateStart.setDate(now.getDate() - 30);
            else if (dateRange === '90d') dateStart.setDate(now.getDate() - 90);

            const salesQuery = supabase
                .from('sales')
                .select('product_id, quantity, sale_price')
                .gte('sold_at', dateStart.toISOString());
            if (companyId) salesQuery.eq('company_id', companyId);
            const { data: sales } = await salesQuery;

            // Process sales into aggregated map
            const sMap = new Map<number, { qty: number, total: number }>();
            sales?.forEach(s => {
                const current = sMap.get(s.product_id) || { qty: 0, total: 0 };
                sMap.set(s.product_id, {
                    qty: current.qty + s.quantity,
                    total: current.total + (s.quantity * s.sale_price) // weighted: qty * unit_price
                });
            });

            setRawProducts(prods || []);
            setSalesMap(sMap);

        } catch (error) {
            console.error('Error fetching analysis:', error);
        } finally {
            setLoading(false);
        }
    }

    // Memoized Calculation of Metrics
    const productsWithMetrics = useMemo(() => {
        if (!rawProducts.length || biz.loading) return [];

        const parseNumber = (value: any): number => {
            if (typeof value === 'number') return value;
            if (!value) return 0;
            const cleanStr = String(value).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
            const num = Number(cleanStr);
            return isNaN(num) ? 0 : num;
        };

        return rawProducts.map(p => {
            const salesData = salesMap.get(p.id) || { qty: 0, total: 0 };

            // Sales data from sales table (official source)
            const actualQty = salesData.qty;
            const revenue = salesData.total;
            const realAvgPrice = actualQty > 0 ? (revenue / actualQty) : 0; // weighted avg

            // Fallback Revenue for margins
            const revenueTotal = revenue > 0 ? revenue : 0;

            // --- Cost & Profit ---
            const unitCost = parseNumber(p.cmv);
            const totalCost = actualQty * unitCost;
            const grossProfit = revenueTotal - totalCost;

            // --- Compute Estimated Profit Metrics ---
            const priceForCalc = realAvgPrice > 0 ? realAvgPrice : (p.sale_price || 0);

            const metrics = computeProductMetrics({
                cmv: unitCost,
                salePrice: priceForCalc,
                fixedCostPercent: biz.fixedCostPercent,
                variableCostPercent: biz.variableCostPercent,
                desiredProfitPercent: biz.desiredProfitPercent,
                totalFixedCosts: biz.totalFixedCosts,
                estimatedMonthlySales: biz.estimatedMonthlySales,
                averageMonthlyRevenue: biz.averageMonthlyRevenue,
                channels: biz.channels,
                fixedCostAllocationMode: biz.fixedCostAllocationMode,
                targetCmvPercent: biz.targetCmvPercent,
            });

            // Total Estimated Profit & Margin
            const estimatedProfitTotal = metrics.profitValue * actualQty;
            const estimatedMarginPercent = revenueTotal > 0
                ? (estimatedProfitTotal / revenueTotal) * 100
                : 0;

            // --- Status ---
            let status = 'Crítico';
            const targetMargin = biz.desiredProfitPercent || 15;

            if (estimatedMarginPercent >= targetMargin) {
                status = 'Ideal';
            } else if (estimatedMarginPercent > 0) {
                status = 'Atenção';
            } else {
                status = 'Crítico';
            }

            return {
                ...p,
                salesQty: actualQty,
                salesTotal: revenueTotal,
                salesAvgPrice: realAvgPrice,
                revenue: revenueTotal,
                cost: totalCost,
                grossProfit,
                estimatedProfit: estimatedProfitTotal,
                estimatedMarginPercent,
                margin: grossProfit,
                marginPercent: estimatedMarginPercent,
                cmv: revenueTotal > 0 ? (totalCost / revenueTotal) * 100 : 0,
                status,
                _metrics: metrics, // Keep reference for insights (no recompute)
            };
        }).filter(p => p.salesQty > 0)
            .sort((a, b: any) => (b.revenue || 0) - (a.revenue || 0));

    }, [rawProducts, salesMap, biz]);

    // Products without sales in this period
    const productsWithoutSales = useMemo(() => {
        if (!rawProducts.length) return [];
        return rawProducts.filter(p => {
            const salesData = salesMap.get(p.id);
            return !salesData || salesData.qty === 0;
        });
    }, [rawProducts, salesMap]);

    // --- Insights (memoized, uses pre-computed _metrics) ---
    const productInsights = useMemo(() => {
        if (!canAccess('insights') || !productsWithMetrics.length) return [];

        return productsWithMetrics
            .map(p => ({
                productId: p.id,
                productName: p.name,
                insights: buildInsights(
                    { name: p.name, sale_price: p.sale_price || p.salesAvgPrice },
                    p._metrics,
                    {
                        targetCmvPercent: biz.targetCmvPercent ?? 35,
                        desiredProfitPercent: biz.desiredProfitPercent ?? 15,
                    }
                ),
            }))
            .filter(p => p.insights.length > 0);
    }, [productsWithMetrics, canAccess, biz.targetCmvPercent, biz.desiredProfitPercent]);

    const insightCounts = useMemo(() => {
        let danger = 0, warning = 0;
        productInsights.forEach(p => {
            p.insights.forEach(i => {
                if (i.level === 'danger') danger++;
                else if (i.level === 'warning') warning++;
            });
        });
        return { danger, warning };
    }, [productInsights]);

    // --- KPI Aggregation ---
    const realTotalRevenue = productsWithMetrics.reduce((acc, p) => acc + (p.revenue || 0), 0);
    const realTotalCost = productsWithMetrics.reduce((acc, p) => acc + (p.cost || 0), 0);
    const realTotalEstimatedProfit = productsWithMetrics.reduce((acc, p) => acc + (p.estimatedProfit || 0), 0);
    const globalCmvPercent = realTotalRevenue > 0 ? (realTotalCost / realTotalRevenue) * 100 : 0;

    const metricsData = {
        totalRevenue: realTotalRevenue,
        globalCmv: globalCmvPercent,
        cmvTrend: -2.5,
        estimatedProfit: realTotalEstimatedProfit,
        topProduct: productsWithMetrics[0]?.name,
        worstProduct: [...productsWithMetrics].sort((a, b) => (a.marginPercent || 0) - (b.marginPercent || 0))[0]?.name,
        products: productsWithMetrics
    };

    // --- CSV Export ---
    function handleExportCsv() {
        const separator = ';';
        const header = ['Produto', 'Qtd Vendida', 'Faturamento', 'CMV %', 'Lucro %', 'Preço Ideal'].join(separator);

        const rows = productsWithMetrics.map(p => {
            const idealPrice = p._metrics?.idealMenuPrice ?? 0;
            return [
                `"${p.name}"`,
                p.salesQty.toString(),
                p.revenue.toFixed(2),
                p.cmv.toFixed(2),
                p.estimatedMarginPercent.toFixed(2),
                idealPrice.toFixed(2),
            ].join(separator);
        });

        const csvContent = '\uFEFF' + [header, ...rows].join('\n'); // BOM for Excel
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cmv-analysis-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    if (loading || biz.loading) return <div className="p-8 text-center text-slate-400">Carregando análise...</div>;

    const displayedProducts = showAll ? metricsData.products : metricsData.products.slice(0, 10);

    return (
        <div className="space-y-6 fade-in">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Análise de CMV</h2>
                    <p className="page-subtitle">Acompanhe o Custo da Mercadoria Vendida e sua evolução</p>
                </div>
                <div className="flex items-center gap-3 self-center md:self-end">
                    {/* CSV Export Button (Premium only) */}
                    {canAccess('exports') && productsWithMetrics.length > 0 && (
                        <button
                            onClick={handleExportCsv}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-all"
                        >
                            <Download size={16} />
                            Exportar CSV
                        </button>
                    )}
                    <div className="flex gap-2 bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
                        <button
                            onClick={() => setDateRange('7d')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${dateRange === '7d' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                        >
                            7 dias
                        </button>
                        <button
                            onClick={() => setDateRange('30d')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${dateRange === '30d' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                        >
                            30 dias
                        </button>
                        <button
                            onClick={() => setDateRange('90d')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${dateRange === '90d' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                        >
                            90 dias
                        </button>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="glass-card p-6 border-l-4 border-l-cyan-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Faturamento</p>
                        <DollarSign className="text-cyan-500 opacity-80" size={20} />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-bold text-white mb-1">
                            R$ {metricsData.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Receita Total</p>
                </div>
                <div className="glass-card p-6 border-l-4 border-l-blue-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">CMV Global</p>
                        <PieChart className="text-blue-500 opacity-80" size={20} />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-white mb-1">
                            {metricsData.globalCmv.toFixed(1)}%
                        </h3>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${metricsData.cmvTrend < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {metricsData.cmvTrend > 0 ? '+' : ''}{metricsData.cmvTrend.toFixed(1)}%
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Média ponderada</p>
                </div>

                <div className="glass-card p-6 border-l-4 border-l-emerald-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Lucro Estimado</p>
                        <DollarSign className="text-emerald-500 opacity-80" size={20} />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-1">
                        R$ {metricsData.estimatedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2">Lucro Líquido Est.</p>
                </div>

                <div className="glass-card p-6 border-l-4 border-l-amber-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Produto Top</p>
                        <TrendingUp className="text-amber-500 opacity-80" size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1 truncate" title={metricsData.topProduct}>
                        {metricsData.topProduct || '-'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2">Maior Faturamento</p>
                </div>

                <div className="glass-card p-6 border-l-4 border-l-purple-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Produto Crítico</p>
                        <AlertTriangle className="text-purple-500 opacity-80" size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1 truncate" title={metricsData.worstProduct}>
                        {metricsData.worstProduct || '-'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2">Menor Margem %</p>
                </div>
            </div>

            {/* ====== INSIGHTS PANEL (Pro+) ====== */}
            {canAccess('insights') && productInsights.length > 0 && (
                <div className="glass-card overflow-hidden">
                    <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <Lightbulb size={20} className="text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Insights do Cardápio</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Alertas baseados nas métricas do período</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {insightCounts.danger > 0 && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full text-sm font-medium text-red-400">
                                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                                    {insightCounts.danger} crítico{insightCounts.danger > 1 ? 's' : ''}
                                </span>
                            )}
                            {insightCounts.warning > 0 && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-sm font-medium text-amber-400">
                                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                                    {insightCounts.warning} alerta{insightCounts.warning > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="divide-y divide-slate-700/30 max-h-[400px] overflow-y-auto">
                        {productInsights.map(pi => (
                            <div key={pi.productId} className="p-4 hover:bg-slate-800/30 transition-colors">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-semibold text-white text-sm">{pi.productName}</span>
                                    <div className="flex gap-1.5">
                                        {pi.insights.map(insight => (
                                            <InsightBadge key={insight.key} insight={insight} />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1 pl-0">
                                    {pi.insights.map(insight => (
                                        <div
                                            key={insight.key}
                                            className={`flex items-start gap-2 text-sm ${insight.level === 'danger' ? 'text-red-300' :
                                                    insight.level === 'warning' ? 'text-amber-300' :
                                                        'text-blue-300'
                                                }`}
                                        >
                                            <span className="shrink-0 mt-0.5">
                                                {insight.level === 'danger' ? '🔴' :
                                                    insight.level === 'warning' ? '🟠' : 'ℹ️'}
                                            </span>
                                            <span>
                                                <strong>{insight.title}</strong>
                                                <span className="opacity-80 ml-1">— {insight.detail}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card p-6">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <TrendingUp size={20} className="text-blue-400" />
                        Evolução do CMV
                    </h3>
                    <div className="h-[300px] flex items-center justify-center text-slate-500 bg-slate-800/30 rounded-lg border border-slate-700/30">
                        <div className="text-center">
                            <BarChart3 size={48} className="mx-auto mb-2 opacity-20" />
                            <p className="text-sm">Gráfico de evolução diária/semanal</p>
                            <p className="text-xs opacity-60">(Implementação de charts.js/recharts pendente)</p>
                        </div>
                    </div>
                </div>

                <div className="glass-card p-6">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <PieChart size={20} className="text-emerald-400" />
                        Distribuição de Custos
                    </h3>
                    <div className="h-[300px] flex items-center justify-center text-slate-500 bg-slate-800/30 rounded-lg border border-slate-700/30">
                        <div className="text-center">
                            <PieChart size={48} className="mx-auto mb-2 opacity-20" />
                            <p className="text-sm">Gráfico de pizza por categoria</p>
                            <p className="text-xs opacity-60">(Implementação de charts.js/recharts pendente)</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="glass-card overflow-hidden">
                <div className="p-6 border-b border-slate-700/50">
                    <h3 className="text-lg font-bold text-white">Detalhamento por Produto</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="data-table text-sm">
                        <thead>
                            <tr>
                                <th className="pl-6 text-left">Produto</th>
                                <th className="text-right">Qtd</th>
                                <th className="text-right">Preço Médio</th>
                                <th className="text-right">Faturamento</th>
                                <th className="text-right">Custo Total</th>
                                <th className="text-right">CMV %</th>
                                <th className="text-right text-emerald-400">Lucro Est. (R$)</th>
                                <th className="text-right text-emerald-400">Margem Est. %</th>
                                <th className="text-right pr-6">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedProducts.map((product: any) => (
                                <tr key={product.id} className="hover:bg-slate-700/20 transition-colors">
                                    <td className="pl-6 font-medium text-slate-200">{product.name}</td>
                                    <td className="text-right text-slate-300">{product.salesQty}</td>
                                    <td className="text-right text-slate-300">R$ {product.salesAvgPrice.toFixed(2)}</td>
                                    <td className="text-right text-slate-300">R$ {product.revenue.toFixed(2)}</td>
                                    <td className="text-right text-slate-300">R$ {product.cost.toFixed(2)}</td>
                                    <td className="text-right font-bold text-slate-300">
                                        {product.cmv.toFixed(1)}%
                                    </td>
                                    <td className="text-right text-emerald-300 font-medium">
                                        R$ {(product.estimatedProfit || 0).toFixed(2)}
                                    </td>
                                    <td className="text-right font-bold text-emerald-300">
                                        {(product.estimatedMarginPercent || 0).toFixed(1)}%
                                    </td>
                                    <td className="text-right pr-6">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${product.status === 'Crítico' ? 'bg-red-500/10 text-red-400' :
                                            product.status === 'Atenção' ? 'bg-amber-500/10 text-amber-400' :
                                                'bg-emerald-500/10 text-emerald-400'
                                            }`}>
                                            {product.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-slate-700/50 text-center">
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="text-sm text-primary hover:text-primary-light font-medium transition-colors"
                    >
                        {showAll ? 'Mostrar menos' : 'Ver todos os produtos'}
                    </button>
                </div>
            </div>

            {/* Products without sales notice */}
            {productsWithoutSales.length > 0 && (
                <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
                    <p className="text-sm text-slate-400">
                        <span className="text-amber-400 font-medium">{productsWithoutSales.length} produto(s)</span> sem vendas registradas neste período ({dateRange === '7d' ? '7 dias' : dateRange === '30d' ? '30 dias' : '90 dias'}).
                    </p>
                </div>
            )}
        </div>
    );
}

/** Small inline badge for insight level */
function InsightBadge({ insight }: { insight: Insight }) {
    const config = {
        danger: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400' },
        warning: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400' },
        info: { bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-400' },
    }[insight.level];

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.bg} ${config.border} ${config.text}`}>
            {insight.title}
        </span>
    );
}
