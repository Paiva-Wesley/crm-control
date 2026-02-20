import { useEffect, useState, useMemo } from 'react';
import {
    PieChart, TrendingUp, DollarSign, BarChart3, AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ProductWithCost } from '../types';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { computeProductMetrics } from '../lib/pricing';

interface ProductWithMetrics extends Omit<ProductWithCost, 'cmv'> {
    last_sales_qty: number;
    last_sales_total: number;
    // Calculated fields
    revenue?: number;
    cost?: number; // total cmv cost
    grossProfit?: number; // revenue - cost
    estimatedProfit?: number; // New: Estimated Profit (Total)
    estimatedMarginPercent?: number; // New: Estimated Margin % (Total)
    margin?: number; // margin in R$
    marginPercent?: number; // %
    cmv: number; // % (Overwriting base cmv which is unit cost)
    status?: string;
}

export function CmvAnalysis() {
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('30d');
    const [showAll, setShowAll] = useState(false);

    // Business Settings Hook
    const biz = useBusinessSettings();

    // Raw Data State
    const [rawProducts, setRawProducts] = useState<any[]>([]);
    const [salesMap, setSalesMap] = useState<Map<number, { qty: number, total: number }>>(new Map());
    const [realSalesMap, setRealSalesMap] = useState<Map<number, any>>(new Map());

    useEffect(() => {
        fetchRawData();
    }, [dateRange]);

    async function fetchRawData() {
        try {
            setLoading(true);

            // 1. Fetch Products with Costs
            const { data: prods } = await supabase
                .from('product_costs_view')
                .select('*')
                .order('name');

            // 2. Fetch Direct Product Sales Data
            const { data: productRealSales } = await supabase
                .from('products')
                .select('id, last_sales_qty, last_sales_total, average_sale_price');

            // 3. Fetch Detailed Sales Data
            const { data: sales } = await supabase.from('sales').select('product_id, quantity, sale_price');

            // Process Maps
            const rMap = new Map(productRealSales?.map(p => [p.id, p]));

            const sMap = new Map<number, { qty: number, total: number }>();
            sales?.forEach(s => {
                const current = sMap.get(s.product_id) || { qty: 0, total: 0 };
                sMap.set(s.product_id, {
                    qty: current.qty + s.quantity,
                    total: current.total + (s.quantity * s.sale_price)
                });
            });

            setRawProducts(prods || []);
            setRealSalesMap(rMap);
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
            const directSales = realSalesMap.get(p.id);

            // Imported Data
            const importedTotalOrig = directSales?.last_sales_total !== undefined ? directSales.last_sales_total : p.last_sales_total;
            const importedQtyOrig = directSales?.last_sales_qty !== undefined ? directSales.last_sales_qty : p.last_sales_qty;
            const importedAvgPriceOrig = directSales?.average_sale_price !== undefined ? directSales.average_sale_price : p.average_sale_price;

            const importedTotal = parseNumber(importedTotalOrig);
            const importedQty = parseNumber(importedQtyOrig);
            const importedAvgPrice = parseNumber(importedAvgPriceOrig);

            // --- 1. Determine Quantity & Revenue ---
            let actualQty = 0;
            let revenue = 0;
            let realAvgPrice = 0;

            if (salesData.total > 0) {
                actualQty = salesData.qty;
                revenue = salesData.total;
                realAvgPrice = actualQty > 0 ? (revenue / actualQty) : 0;
            } else if (importedTotal > 0.001) {
                actualQty = importedQty;
                revenue = importedTotal;
                realAvgPrice = actualQty > 0 ? (revenue / actualQty) : 0;
            } else {
                actualQty = importedQty;
                const priceToUse = importedAvgPrice > 0 ? importedAvgPrice : (p.sale_price || 0);
                revenue = actualQty * priceToUse;
                realAvgPrice = priceToUse;
            }

            // Fallback Revenue for margins
            const revenueTotal = revenue > 0 ? revenue : (actualQty * realAvgPrice);

            // --- 2. Determine Cost & Profit (Unit & Total) ---
            const unitCost = parseNumber(p.cmv);
            const totalCost = actualQty * unitCost;
            const grossProfit = revenueTotal - totalCost;

            // --- 3. Compute Estimated Profit Metrics (Using Pricing Engine) ---
            // Unit Calculation
            const priceForCalc = realAvgPrice > 0 ? realAvgPrice : (p.sale_price || 0);

            const metrics = computeProductMetrics({
                cmv: unitCost,
                salePrice: priceForCalc,
                fixedCostPercent: biz.fixedCostPercent,
                variableCostPercent: biz.variableCostPercent, // No channel tax!
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

            // --- 4. Determine Status (Based on Estimated Margin) ---
            let status = 'Crítico';
            const targetMargin = biz.desiredProfitPercent || 15; // Default to 15% if not set

            // Logic:
            // Ideal: Margin >= Target
            // Atenção: Margin is positive but below target (or within a reasonable range, e.g. > 0)
            // Crítico: Margin <= 0

            if (estimatedMarginPercent >= targetMargin) {
                status = 'Ideal';
            } else if (estimatedMarginPercent > 0) {
                status = 'Atenção';
            } else {
                status = 'Crítico';
            }

            return {
                ...p,
                last_sales_qty: actualQty,
                last_sales_total: revenueTotal,
                average_sale_price: realAvgPrice,
                revenue: revenueTotal,
                cost: totalCost,
                grossProfit,
                estimatedProfit: estimatedProfitTotal,
                estimatedMarginPercent,
                margin: grossProfit, // Legacy field kept for safety
                marginPercent: estimatedMarginPercent, // Use Estimated for main prop
                cmv: revenueTotal > 0 ? (totalCost / revenueTotal) * 100 : 0,
                status
            };
        }).filter(p => p.last_sales_qty > 0)
            .sort((a, b: any) => (b.revenue || 0) - (a.revenue || 0));

    }, [rawProducts, salesMap, realSalesMap, biz]);

    // --- KPI Aggregation ---
    const realTotalRevenue = productsWithMetrics.reduce((acc, p) => acc + (p.revenue || 0), 0);
    const realTotalCost = productsWithMetrics.reduce((acc, p) => acc + (p.cost || 0), 0);
    const realTotalEstimatedProfit = productsWithMetrics.reduce((acc, p) => acc + (p.estimatedProfit || 0), 0); // New aggregation
    const globalCmvPercent = realTotalRevenue > 0 ? (realTotalCost / realTotalRevenue) * 100 : 0;

    // const globalGrossProfit = realTotalRevenue - realTotalCost; // Deprecated for display

    const metricsData = {
        totalRevenue: realTotalRevenue,
        globalCmv: globalCmvPercent,
        cmvTrend: -2.5,
        estimatedProfit: realTotalEstimatedProfit, // Use Estimated Profit
        topProduct: productsWithMetrics[0]?.name,
        worstProduct: [...productsWithMetrics].sort((a, b) => (a.marginPercent || 0) - (b.marginPercent || 0))[0]?.name,
        products: productsWithMetrics
    };

    if (loading || biz.loading) return <div className="p-8 text-center text-slate-400">Carregando análise...</div>;

    const displayedProducts = showAll ? metricsData.products : metricsData.products.slice(0, 10);

    return (
        <div className="space-y-6 fade-in">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Análise de CMV</h2>
                    <p className="page-subtitle">Acompanhe o Custo da Mercadoria Vendida e sua evolução</p>
                </div>
                {/* Warning about Data Source */}
                <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 px-3 py-1.5 rounded-lg text-sm border border-amber-500/20">
                    <AlertTriangle size={16} />
                    <span>Dados refletem a última importação (sem histórico por data)</span>
                </div>
                <div className="flex gap-2 self-center md:self-end bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
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
                        {/* Trend removed or kept as dummy? Keeping dummy for structural integrity */}
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

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card p-6">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <TrendingUp size={20} className="text-blue-400" />
                        Evolução do CMV
                    </h3>
                    <div className="h-[300px] flex items-center justify-center text-slate-500 bg-slate-800/30 rounded-lg border border-slate-700/30">
                        {/* Placeholder for Chart */}
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
                        {/* Placeholder for Chart */}
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
                                    <td className="text-right text-slate-300">{product.last_sales_qty}</td>
                                    <td className="text-right text-slate-300">R$ {product.average_sale_price.toFixed(2)}</td>
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
        </div>
    );
}
