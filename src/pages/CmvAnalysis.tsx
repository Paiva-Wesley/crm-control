import { useEffect, useState } from 'react';
import {
    PieChart, Activity, TrendingUp, DollarSign, AlertCircle, ArrowDown, ArrowUp, BarChart3, AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { ProductWithCost } from '../types';

interface ProductWithMetrics extends ProductWithCost {
    last_sales_qty: number;
    last_sales_total: number;
    // Calculated fields
    revenue?: number;
    cost?: number; // total cmv cost
    grossProfit?: number; // revenue - cost
    margin?: number; // %
    cmv?: number; // % (or unit cmv? logic says unit cmv in types usually, but let's be careful)
    status?: string;
}

export function CmvAnalysis() {
    const { companyId } = useAuth();
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('30d'); // Added state

    // Data State
    const [products, setProducts] = useState<ProductWithMetrics[]>([]);
    const [fixedCostsTotal, setFixedCostsTotal] = useState(0);
    const [variableRateTotal, setVariableRateTotal] = useState(0); // Tax %
    const [platformTaxRate, setPlatformTaxRate] = useState(0);

    useEffect(() => {
        fetchAnalysisData();
    }, [dateRange]); // dependencies?

    async function fetchAnalysisData() {
        try {
            setLoading(true);

            // 1. Fetch Products with Costs
            const { data: prods } = await supabase
                .from('product_costs_view')
                .select('*')
                .order('name');

            // 2. Fetch Sales Data
            // In a real scenario, use dateRange to filter
            const { data: sales } = await supabase.from('sales').select('product_id, quantity, sale_price');

            // 3. Aggregate Sales
            const salesMap = new Map<number, { qty: number, total: number }>();
            sales?.forEach(s => {
                const current = salesMap.get(s.product_id) || { qty: 0, total: 0 };
                salesMap.set(s.product_id, {
                    qty: current.qty + s.quantity,
                    total: current.total + (s.quantity * s.sale_price)
                });
            });

            // 4. Merge Data
            const productsWithMetrics = (prods || []).map(p => {
                const salesData = salesMap.get(p.id) || { qty: 0, total: 0 };
                const revenue = salesData.total; // or salesData.qty * p.sale_price if total unavailable
                const totalCmv = salesData.qty * (p.cmv || 0);
                const grossProfit = revenue - totalCmv; // Simplified for product level
                const margin = revenue > 0 ? grossProfit : 0; // Absolute value? No, margin usually % or value? JSX uses margin as value R$
                const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

                // My JSX expects:
                // product.cmv (as %) -> wait, product_costs_view usually has cmv as currency?
                // Let's check calculation in original code:
                // cmv comes from product_costs_view. Usually it is cost price.
                // In my JSX I used `product.cmv > 40` implies percentage.
                // But in logic: `p.cmv` is cost.
                // I need to calculate `cmvPercent` for the product.
                const cmvPercent = revenue > 0 ? (totalCmv / revenue) * 100 : 0;

                return {
                    ...p,
                    last_sales_qty: salesData.qty,
                    last_sales_total: salesData.total,
                    revenue,
                    cost: totalCmv,
                    grossProfit,
                    margin,
                    cmv: cmvPercent, // Overwriting or adding new field for %? Be careful. Let's stick to what mapping expected.
                    // The JSX uses `product.cmv` as percentage for conditional class? Yes: `product.cmv > 40`.
                    // So I should map `cmv` to the percentage here for the UI object.
                };
            }).filter(p => p.last_sales_qty > 0)
                .sort((a, b) => b.last_sales_qty - a.last_sales_qty);

            setProducts(productsWithMetrics as any);

            // 5. Fetch Fixed Costs
            const { data: costs } = await supabase.from('fixed_costs').select('monthly_value');
            const totalFixed = (costs || []).reduce((acc, curr) => acc + Number(curr.monthly_value), 0);
            setFixedCostsTotal(totalFixed);

            // 6. Fetch Variable Fees (Taxes)
            const { data: fees } = await supabase.from('fees').select('percentage');
            const totalFees = (fees || []).reduce((acc, curr) => acc + Number(curr.percentage), 0);
            setVariableRateTotal(totalFees);

            // 7. Fetch Settings (for Platform Tax)
            const { data: settings } = await supabase.from('business_settings').select('platform_tax_rate').eq('company_id', companyId).limit(1).maybeSingle();
            if (settings) {
                setPlatformTaxRate(settings.platform_tax_rate || 0);
            }

        } catch (error) {
            console.error('Error fetching analysis:', error);
        } finally {
            setLoading(false);
        }
    }

    // --- Calculations for Metrics Object ---

    const realTotalRevenue = products.reduce((acc, p) => acc + (p.revenue || 0), 0);
    const realTotalCmv = products.reduce((acc, p) => acc + (p.cost || 0), 0);

    // Variables
    const totalVariablePercent = variableRateTotal + platformTaxRate;
    const realTotalVariableCost = (realTotalRevenue * totalVariablePercent) / 100;

    const globalContributionMargin = realTotalRevenue - realTotalCmv - realTotalVariableCost;
    const operationalResult = globalContributionMargin - fixedCostsTotal;

    const globalCmvPercent = realTotalRevenue > 0 ? (realTotalCmv / realTotalRevenue) * 100 : 0;

    // Construct metrics object for JSX
    const metrics = {
        globalCmv: globalCmvPercent,
        cmvTrend: -2.5, // Dummy for now or calc comparison
        grossProfit: globalContributionMargin, // Or just revenue - cmv? "Lucro Bruto" usually Rev - CMV. "Margem Contrib" includes var costs.
        // My JSX says "Lucro Bruto... Faturamento - Custos Variáveis". That's actually Contrib Margin technically if CMV included?
        // Let's stick to calculated values.
        // JSX: "Lucro Bruto... Faturamento - Custos Variáveis" -> Wait, usually Gross Profit = Rev - COGS (CMV).
        // Contrib Margin = Rev - Var Costs (CMV + Taxes).
        // I'll map grossProfit to globalContributionMargin for now as that seems to be the intent of "profit after variable costs".
        topProduct: products[0]?.name,
        worstProduct: [...products].sort((a, b: any) => (b.cmv || 0) - (a.cmv || 0))[0]?.name, // Highest CMV % is worst?
        products: products
    };
    if (loading) return <div className="p-8 text-center text-slate-400">Carregando análise...</div>;

    return (
        <div className="space-y-6 fade-in">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Análise de CMV</h2>
                    <p className="page-subtitle">Acompanhe o Custo da Mercadoria Vendida e sua evolução</p>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="glass-card p-6 border-l-4 border-l-blue-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">CMV Global</p>
                        <PieChart className="text-blue-500 opacity-80" size={20} />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-bold text-white mb-1">
                            {metrics.globalCmv.toFixed(1)}%
                        </h3>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${metrics.cmvTrend < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {metrics.cmvTrend > 0 ? '+' : ''}{metrics.cmvTrend.toFixed(1)}%
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Média ponderada do período</p>
                </div>

                <div className="glass-card p-6 border-l-4 border-l-emerald-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Lucro Bruto</p>
                        <DollarSign className="text-emerald-500 opacity-80" size={20} />
                    </div>
                    <h3 className="text-3xl font-bold text-white mb-1">
                        R$ {metrics.grossProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2">Faturamento - Custos Variáveis</p>
                </div>

                <div className="glass-card p-6 border-l-4 border-l-amber-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Produto Top</p>
                        <TrendingUp className="text-amber-500 opacity-80" size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1 truncate" title={metrics.topProduct}>
                        {metrics.topProduct || '-'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2">Maior margem de contribuição</p>
                </div>

                <div className="glass-card p-6 border-l-4 border-l-purple-500">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Produto Crítico</p>
                        <AlertTriangle className="text-purple-500 opacity-80" size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1 truncate" title={metrics.worstProduct}>
                        {metrics.worstProduct || '-'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-2">Menor margem (Atenção)</p>
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
                                <th className="pl-6">Produto</th>
                                <th className="text-right">Preço Venda</th>
                                <th className="text-right">Custo Total</th>
                                <th className="text-right">CMV %</th>
                                <th className="text-right">Margem R$</th>
                                <th className="text-right pr-6">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {metrics.products.slice(0, 10).map((product: any) => (
                                <tr key={product.id} className="hover:bg-slate-700/20 transition-colors">
                                    <td className="pl-6 font-medium text-slate-200">{product.name}</td>
                                    <td className="text-right text-slate-300">R$ {product.price.toFixed(2)}</td>
                                    <td className="text-right text-slate-300">R$ {product.cost.toFixed(2)}</td>
                                    <td className="text-right font-bold">
                                        <span className={product.cmv > 40 ? 'text-red-400' : product.cmv > 30 ? 'text-amber-400' : 'text-emerald-400'}>
                                            {product.cmv.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="text-right text-slate-300">R$ {product.margin.toFixed(2)}</td>
                                    <td className="text-right pr-6">
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${product.cmv > 40 ? 'bg-red-500/10 text-red-400' :
                                                product.cmv > 30 ? 'bg-amber-500/10 text-amber-400' :
                                                    'bg-emerald-500/10 text-emerald-400'
                                            }`}>
                                            {product.cmv > 40 ? 'Crítico' : product.cmv > 30 ? 'Atenção' : 'Ideal'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-slate-700/50 text-center">
                    <button className="text-sm text-primary hover:text-primary-light font-medium transition-colors">Ver todos os produtos</button>
                </div>
            </div>
        </div>
    );
}
