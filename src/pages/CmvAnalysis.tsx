import { useEffect, useState } from 'react';
import {
    PieChart, Activity, TrendingUp, DollarSign, AlertCircle, ArrowDown, ArrowUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { BusinessSettings, ProductWithCost } from '../types';

export function CmvAnalysis() {
    const [loading, setLoading] = useState(true);

    // Data State
    const [products, setProducts] = useState<ProductWithCost[]>([]);
    const [fixedCostsTotal, setFixedCostsTotal] = useState(0);
    const [variableRateTotal, setVariableRateTotal] = useState(0); // Tax %
    const [platformTaxRate, setPlatformTaxRate] = useState(0);

    useEffect(() => {
        fetchAnalysisData();
    }, []);

    async function fetchAnalysisData() {
        try {
            setLoading(true);

            // 1. Fetch Products with Costs (View typically has calculated CMV)
            // Note: product_costs_view might not strictly include new columns if cached, 
            // but usually * does. If not, we might need to join or assume they are there.
            // Current ProductWithCost type includes them as optional.
            const { data: prods } = await supabase
                .from('product_costs_view')
                .select('*')
                .gt('last_sales_qty', 0) // Only interested in what sold
                .order('last_sales_qty', { ascending: false });

            setProducts(prods || []);

            // 2. Fetch Fixed Costs
            const { data: costs } = await supabase.from('fixed_costs').select('monthly_value');
            const totalFixed = (costs || []).reduce((acc, curr) => acc + Number(curr.monthly_value), 0);
            setFixedCostsTotal(totalFixed);

            // 3. Fetch Variable Fees (Taxes)
            const { data: fees } = await supabase.from('fees').select('percentage');
            const totalFees = (fees || []).reduce((acc, curr) => acc + Number(curr.percentage), 0);
            setVariableRateTotal(totalFees);

            // 4. Fetch Settings (for Platform Tax)
            const { data: settings } = await supabase.from('business_settings').select('platform_tax_rate').single();
            if (settings) {
                setPlatformTaxRate(settings.platform_tax_rate || 0);
            }

        } catch (error) {
            console.error('Error fetching analysis:', error);
        } finally {
            setLoading(false);
        }
    }

    // --- Calculations ---

    // 1. Receita Real Total (Soma de: Qtd * Preço Médio Real)
    // Note: last_sales_total is best if accurate, else calc Qty * AvgPrice
    const realTotalRevenue = products.reduce((acc, p) => {
        // Use pre-calculated total if strictly reliable, or recalc to be safe?
        // Let's use last_sales_total if > 0, else recalc
        if (p.last_sales_total && p.last_sales_total > 0) return acc + p.last_sales_total;
        return acc + ((p.last_sales_qty || 0) * (p.average_sale_price || p.sale_price));
    }, 0);

    // 2. CMV Real Total (Soma de: Qtd * CMV Unitário)
    const realTotalCmv = products.reduce((acc, p) => {
        return acc + ((p.last_sales_qty || 0) * (p.cmv || 0)); // p.cmv comes from view
    }, 0);

    // 3. Custos Variáveis Globais (Imposto + Taxa Plataforma) sobre a Receita Real
    // Assuming these rates apply to ALL revenue (simplification, unless we split delivery vs counter)
    const totalVariablePercent = variableRateTotal + platformTaxRate;
    const realTotalVariableCost = (realTotalRevenue * totalVariablePercent) / 100;

    // 4. Margem de Contribuição Global
    const globalContributionMargin = realTotalRevenue - realTotalCmv - realTotalVariableCost;

    // 5. Resultado Operacional
    const operationalResult = globalContributionMargin - fixedCostsTotal;

    // Percentages
    const globalCmvPercent = realTotalRevenue > 0 ? (realTotalCmv / realTotalRevenue) * 100 : 0;
    const globalMarginPercent = realTotalRevenue > 0 ? (globalContributionMargin / realTotalRevenue) * 100 : 0;
    const operationalResultPercent = realTotalRevenue > 0 ? (operationalResult / realTotalRevenue) * 100 : 0;

    if (loading) return <div className="p-8 text-center text-slate-400">Carregando análise...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                    <Activity className="text-primary" />
                    Análise de Saúde (CMV Real)
                </h2>
                <div className="text-sm text-slate-400">
                    Baseado nas últimas vendas importadas
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Faturamento */}
                <div className="card bg-dark-800 border-l-4 border-blue-500 p-4 rounded-lg shadow-lg">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-slate-400 text-sm font-medium">Faturamento Real (Importado)</span>
                        <DollarSign size={18} className="text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                        R$ {realTotalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-slate-500">100% da Receita</div>
                </div>

                {/* CMV Global */}
                <div className={`card bg-dark-800 border-l-4 p-4 rounded-lg shadow-lg ${globalCmvPercent > 35 ? 'border-red-500' : 'border-emerald-500'}`}>
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-slate-400 text-sm font-medium">CMV Global Real</span>
                        <PieChart size={18} className={globalCmvPercent > 35 ? 'text-red-500' : 'text-emerald-500'} />
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                        {globalCmvPercent.toFixed(2)}%
                    </div>
                    <div className="text-xs text-slate-500">
                        R$ {realTotalCmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        {globalCmvPercent > 35 && <span className="text-red-400 ml-2 font-bold">ALERTA!</span>}
                    </div>
                </div>

                {/* Margem Contribuição */}
                <div className="card bg-dark-800 border-l-4 border-amber-500 p-4 rounded-lg shadow-lg">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-slate-400 text-sm font-medium">Margem Contribuição</span>
                        <TrendingUp size={18} className="text-amber-500" />
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">
                        {globalMarginPercent.toFixed(2)}%
                    </div>
                    <div className="text-xs text-slate-500">
                        R$ {globalContributionMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                {/* Resultado Operacional */}
                <div className={`card bg-dark-800 border-l-4 p-4 rounded-lg shadow-lg ${operationalResult > 0 ? 'border-emerald-500' : 'border-red-500'}`}>
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-slate-400 text-sm font-medium">Resultado Operacional</span>
                        {operationalResult > 0 ? <ArrowUp size={18} className="text-emerald-500" /> : <ArrowDown size={18} className="text-red-500" />}
                    </div>
                    <div className={`text-2xl font-bold mb-1 ${operationalResult > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        R$ {operationalResult.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-slate-500">
                        {operationalResultPercent.toFixed(2)}% (Real)
                    </div>
                </div>
            </div>

            {/* Performance Table */}
            <div className="card bg-dark-800 border border-dark-700 rounded-lg p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
                    <AlertCircle className="text-primary" size={20} />
                    Desempenho por Produto (Tabela Real)
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-dark-700 text-left text-xs uppercase text-slate-400">
                                <th className="px-4 py-3">Produto</th>
                                <th className="px-4 py-3 text-right">Qtd Vendida</th>
                                <th className="px-4 py-3 text-right">Preço Médio</th>
                                <th className="px-4 py-3 text-right">CMV Unit (Receita)</th>
                                <th className="px-4 py-3 text-right">Faturamento Total</th>
                                <th className="px-4 py-3 text-right">Lucro Bruto (Total)</th>
                                <th className="px-4 py-3 text-right">Margem %</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-700">
                            {products.map(p => {
                                const qty = p.last_sales_qty || 0;
                                const price = p.average_sale_price || p.sale_price;
                                const revenue = qty * price;
                                const totalCmvCost = qty * (p.cmv || 0);
                                const grossProfit = revenue - totalCmvCost; // Crude Gross Profit (Review - CMV)
                                const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

                                return (
                                    <tr key={p.id} className="hover:bg-dark-700/50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-200">{p.name}</td>
                                        <td className="px-4 py-3 text-right text-slate-400">{qty}</td>
                                        <td className="px-4 py-3 text-right text-slate-400">
                                            R$ {price.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-amber-500">
                                            R$ {(p.cmv || 0).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-blue-400 font-bold">
                                            R$ {revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${grossProfit > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                            R$ {grossProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${margin > 50 ? 'text-emerald-500' : margin > 30 ? 'text-amber-500' : 'text-red-500'}`}>
                                            {margin.toFixed(2)}%
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
