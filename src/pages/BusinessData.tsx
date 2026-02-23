
import { useEffect, useState } from 'react';
import { Save, Upload, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { BusinessSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { useSubscription } from '../hooks/useSubscription';
import { ImportSalesModal } from '../components/business/ImportSalesModal';
import { useNavigate } from 'react-router-dom';

interface BusinessSettingsExtended extends BusinessSettings {
    monthly_revenue: Record<string, number>;
}

export function BusinessData() {
    const { companyId } = useAuth();
    const biz = useBusinessSettings();
    const { canAccess } = useSubscription();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<BusinessSettingsExtended | null>(null);
    const [fixedCostsTotal, setFixedCostsTotal] = useState(0);
    const [cmvGlobalPercent, setCmvGlobalPercent] = useState(0);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            setLoading(true);

            // 1. Settings
            const { data: settingsData } = await supabase.from('business_settings').select('*').eq('company_id', companyId).limit(1).maybeSingle();
            const { data: revenueData } = await supabase.from('monthly_revenue').select('*').eq('company_id', companyId);

            // Transform revenue array to object for UI state compatibility
            // Default 0 for all months
            const revenueMap: any = {
                jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
                jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0
            };

            const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

            if (revenueData) {
                revenueData.forEach((rev: any) => {
                    const monthName = monthNames[rev.month - 1];
                    if (monthName) {
                        revenueMap[monthName] = rev.revenue;
                    }
                });
            }

            if (settingsData) {
                setSettings({
                    ...settingsData,
                    revenue_input_mode: settingsData.revenue_input_mode ?? 'single',
                    average_monthly_revenue_input: settingsData.average_monthly_revenue_input ?? 0,
                    monthly_revenue: revenueMap
                } as any);
            } else {
                setSettings({
                    id: 0,
                    desired_profit_percent: 15,
                    platform_tax_rate: 18,
                    estimated_monthly_sales: 1000,
                    fixed_cost_allocation_mode: 'revenue_based',
                    target_cmv_percent: 35,
                    revenue_input_mode: 'single',
                    average_monthly_revenue_input: 0,
                    monthly_revenue: revenueMap // Use default map
                } as any);
            }

            // 2. Fixed Costs Total
            const { data: costs } = await supabase.from('fixed_costs').select('monthly_value').eq('company_id', companyId);
            const total = (costs || []).reduce((acc, curr) => acc + (parseFloat(curr.monthly_value as any) || 0), 0);
            setFixedCostsTotal(total);

            // 3. CMV Global (from active products)
            const { data: products } = await supabase
                .from('product_costs_view')
                .select('sale_price, cmv, active')
                .eq('company_id', companyId);

            let totalCmvPercent = 0;
            let productCount = 0;

            if (products) {
                products.forEach((p: any) => {
                    const price = Number(p.sale_price) || 0;
                    const cmv = Number(p.cmv) || 0;
                    // Filter: active, price > 0, cmv > 0
                    if (p.active && price > 0 && cmv > 0) {
                        const pct = (cmv / price) * 100;
                        totalCmvPercent += pct;
                        productCount++;
                    }
                });
            }

            const globalCmv = productCount > 0 ? totalCmvPercent / productCount : 35; // Default 35 if no data
            setCmvGlobalPercent(globalCmv);

        } catch (error) {
            console.error('Error fetching business data:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveSettings() {
        if (!settings) return;
        try {
            const { data } = await supabase.from('business_settings').select('id').eq('company_id', companyId).limit(1).maybeSingle();

            // Save main settings
            if (data) {
                await supabase.from('business_settings').update({
                    desired_profit_percent: settings.desired_profit_percent,
                    platform_tax_rate: settings.platform_tax_rate,
                    estimated_monthly_sales: settings.estimated_monthly_sales ?? 1000,
                    fixed_cost_allocation_mode: settings.fixed_cost_allocation_mode ?? 'revenue_based',
                    target_cmv_percent: settings.target_cmv_percent ?? 35,
                    revenue_input_mode: settings.revenue_input_mode ?? 'single',
                    average_monthly_revenue_input: settings.average_monthly_revenue_input ?? 0,
                }).eq('id', data.id);
            } else {
                await supabase.from('business_settings').insert({
                    desired_profit_percent: settings.desired_profit_percent,
                    platform_tax_rate: settings.platform_tax_rate,
                    estimated_monthly_sales: settings.estimated_monthly_sales ?? 1000,
                    fixed_cost_allocation_mode: settings.fixed_cost_allocation_mode ?? 'revenue_based',
                    target_cmv_percent: settings.target_cmv_percent ?? 35,
                    revenue_input_mode: settings.revenue_input_mode ?? 'single',
                    average_monthly_revenue_input: settings.average_monthly_revenue_input ?? 0,
                    company_id: companyId
                });
            }

            // Save Monthly Revenue
            // Need to map UI object back to table rows
            const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const year = 2026; // Default year

            const revenueEntries = Object.entries((settings as any).monthly_revenue).map(([key, value]) => {
                const monthIndex = monthNames.indexOf(key) + 1;
                return {
                    company_id: companyId,
                    year,
                    month: monthIndex,
                    revenue: value
                };
            });

            // Upsert each month
            // Note: Supabase upsert requires ON CONFLICT constraint which we added (company_id, year, month)
            const { error } = await supabase.from('monthly_revenue').upsert(revenueEntries, { onConflict: 'company_id, year, month' });

            if (error) throw error;

            alert('Configurações salvas com sucesso!');
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Erro ao salvar configurações.');
        }
    }

    if (loading) return <div className="p-8 text-center text-slate-400">Carregando...</div>;
    if (!settings) return null;

    // --- Calculations ---
    const totalRevenue = Object.values(settings.monthly_revenue).reduce((acc, val) => acc + Number(val), 0);


    // Revenue Logic: Single vs Monthly
    let avgRevenue = 0;
    if (settings.revenue_input_mode === 'monthly') {
        avgRevenue = totalRevenue / 12; // Annual average
    } else {
        avgRevenue = settings.average_monthly_revenue_input || 0;
    }

    // Use hook data for variable costs (from variable_costs table, not platform_tax_rate)
    const variableCostsTotal = biz.variableCostsTotal;
    const variableCostsPercent = biz.variableCostPercent;
    const totalCosts = fixedCostsTotal + variableCostsTotal;

    // Percentages relative to Average Revenue
    const fixedCostsPercent = avgRevenue > 0 ? (fixedCostsTotal / avgRevenue) * 100 : 0;
    const totalCostsPercent = fixedCostsPercent + variableCostsPercent;

    // Indicators
    // Indicators
    // Formula: 1 - (variableCostsTotal / avgRevenue) - (cmvGlobalPercent / 100)
    let contributionMargin = 0;

    if (avgRevenue > 0) {
        const varCostRatio = variableCostsTotal / avgRevenue;
        const cmvRatio = cmvGlobalPercent / 100;
        contributionMargin = 1 - varCostRatio - cmvRatio;
    }

    if (contributionMargin < 0) {
        contributionMargin = 0; // Clamp for UI
    }

    const contributionMarginPercent = contributionMargin * 100;

    // Break Even Point
    // Target = FixedCosts + (Revenue * DesiredProfit%)
    // BE = Target / ContributionMargin
    let breakEvenPoint = 0;
    let breakEvenValid = true;

    if (contributionMargin > 0) {
        const desiredProfitValue = avgRevenue * (settings.desired_profit_percent / 100);
        const targetToCover = fixedCostsTotal + desiredProfitValue;
        breakEvenPoint = targetToCover / contributionMargin;
    } else {
        breakEvenValid = false;
    }

    // Markup suggested
    const targetMarginPercent = fixedCostsPercent + variableCostsPercent + settings.desired_profit_percent;
    const suggestedMarkup = targetMarginPercent < 100 ? 1 / (1 - (targetMarginPercent / 100)) : 0;


    // --- Helper for formatting currency ---
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    // --- Color Logic for Contribution Margin ---
    let marginColorClass = 'text-white';
    let marginBgClass = 'bg-slate-700/30';

    if (contributionMarginPercent > 55) {
        marginColorClass = 'text-emerald-400';
        marginBgClass = 'bg-emerald-500/10';
    } else if (contributionMarginPercent >= 40) {
        marginColorClass = 'text-amber-400';
        marginBgClass = 'bg-amber-500/10';
    } else {
        marginColorClass = 'text-rose-400';
        marginBgClass = 'bg-rose-500/10';
    }

    return (
        <div className="fade-in max-w-[1100px] mx-auto pb-20 font-sans text-slate-200">
            {/* Header */}
            <div className="flex justify-between items-end mb-12 border-b border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Painel Financeiro</h1>
                    <p className="text-slate-400 text-sm max-w-lg">
                        Gerencie seus custos, defina metas de lucro e acompanhe os indicadores vitais para a saúde do seu negócio.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            if (!canAccess('import_sales')) {
                                navigate('/plans');
                                return;
                            }
                            setIsImportModalOpen(true);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all border ${canAccess('import_sales')
                            ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700'
                            : 'text-slate-500 bg-slate-800/50 border-slate-700/50 cursor-not-allowed'
                            }`}
                    >
                        {canAccess('import_sales') ? <Upload size={16} /> : <Lock size={16} />}
                        Importar
                        {!canAccess('import_sales') && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 uppercase tracking-wider leading-none">Pro</span>
                        )}
                    </button>
                    <button
                        onClick={handleSaveSettings}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-900/20 transition-all"
                    >
                        <Save size={16} /> Salvar Alterações
                    </button>
                </div>
            </div>

            {/* --- SECTION 1: HERO INDICATORS --- */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                {/* 1. Margem de Contribuição */}
                <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50 shadow-sm relative overflow-hidden group hover:border-slate-600 transition-colors">
                    <div className={`absolute top-0 left-0 w-1 h-full ${marginBgClass.replace('/10', '')}`}></div>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-slate-400 font-medium text-sm uppercase tracking-wider">Margem de Contribuição</h3>
                        <div className={`px-2 py-1 rounded text-xs font-bold ${marginBgClass} ${marginColorClass}`}>
                            Meta: &gt; 55%
                        </div>
                    </div>
                    <div className={`text-5xl font-bold mb-3 tracking-tighter tabular-nums ${marginColorClass}`}>
                        {contributionMarginPercent.toFixed(1)}%
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        Quanto sobra do faturamento após pagar custos variáveis e mercadorias (CMV).
                        É o que "sobra" para pagar custos fixos e gerar lucro.
                    </p>
                </div>

                {/* 2. Ponto de Equilíbrio */}
                <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50 shadow-sm relative group hover:border-slate-600 transition-colors">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-slate-400 font-medium text-sm uppercase tracking-wider">Ponto de Equilíbrio</h3>
                        <div className="px-2 py-1 rounded text-xs font-bold bg-blue-500/10 text-blue-400">
                            Meta Mínima
                        </div>
                    </div>
                    <div className="text-5xl font-bold text-white mb-3 tracking-tighter tabular-nums">
                        {breakEvenValid ? formatCurrency(breakEvenPoint) : '---'}
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        Faturamento mensal necessário para cobrir todos os custos (Zero a Zero).
                        Abaixo disso é prejuízo.
                    </p>
                </div>
            </section>

            {/* --- SECONDARY INDICATORS & PARAMETERS --- */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-16">
                {/* Lucro Desejado & CMV Global */}
                <div className="lg:col-span-1 space-y-8">
                    <div>
                        <h4 className="text-slate-100 font-semibold mb-6 flex items-center gap-2">
                            Metas & Médias
                        </h4>
                        <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700/50 space-y-6">
                            <div>
                                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Lucro Desejado (Mensal)</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        className="bg-transparent text-2xl font-bold text-white w-24 border-b border-slate-700 focus:border-blue-500 focus:outline-none focus:ring-0 p-0 tabular-nums transition-colors"
                                        value={settings.desired_profit_percent}
                                        onChange={e => setSettings({ ...settings, desired_profit_percent: parseFloat(e.target.value) })}
                                    />
                                    <span className="text-slate-500 text-xl">%</span>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-700/50">
                                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Markup Sugerido</label>
                                <div className="text-2xl font-bold text-emerald-400 tabular-nums">
                                    {suggestedMarkup > 0 ? suggestedMarkup.toFixed(2) : '-'}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">Multiplicador ideal sobre o custo do produto.</p>
                            </div>

                            <div className="pt-6 border-t border-slate-700/50">
                                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">CMV Global (Médio)</label>
                                <div className="text-2xl font-bold text-slate-300 tabular-nums">
                                    {cmvGlobalPercent.toFixed(1)}%
                                </div>
                                <div className="mt-4">
                                    <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Meta CMV Global</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            className="bg-transparent text-xl font-medium text-slate-300 w-20 border-b border-slate-700 focus:border-blue-500 focus:outline-none focus:ring-0 p-0 tabular-nums transition-colors"
                                            value={settings.target_cmv_percent ?? 35}
                                            onChange={e => setSettings({ ...settings, target_cmv_percent: parseFloat(e.target.value) })}
                                        />
                                        <span className="text-slate-500">%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- FATURAMENTO MÉDIO (INPUT) --- */}
                <div className="lg:col-span-2">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="text-slate-100 font-semibold flex items-center gap-2">
                            Faturamento Médio
                        </h4>
                        {/* Toggle Mode */}
                        <div className="flex bg-slate-800 rounded-md p-0.5 border border-slate-700">
                            <button
                                onClick={() => setSettings({ ...settings, revenue_input_mode: 'single' })}
                                className={`px-4 py-1.5 text-xs font-medium rounded transition-all ${settings.revenue_input_mode === 'single' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Valor Único
                            </button>
                            <button
                                onClick={() => setSettings({ ...settings, revenue_input_mode: 'monthly' })}
                                className={`px-4 py-1.5 text-xs font-medium rounded transition-all ${settings.revenue_input_mode === 'monthly' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Mensal
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 overflow-hidden min-h-[300px] flex flex-col">
                        {settings.revenue_input_mode === 'single' ? (
                            <div className="flex-1 flex flex-col justify-center items-center p-12">
                                <label className="block text-sm text-slate-500 mb-4 uppercase tracking-wider font-semibold">Faturamento Mensal (Média)</label>
                                <div className="relative">
                                    <span className="absolute left-0 top-1 text-slate-500 text-4xl font-light">R$</span>
                                    <input
                                        type="number"
                                        className="bg-transparent text-center text-6xl font-bold text-white w-full max-w-md border-b-2 border-slate-700 focus:border-blue-500 focus:outline-none p-2 pl-12 tabular-nums placeholder-slate-700 transition-colors"
                                        placeholder="0.00"
                                        value={settings.average_monthly_revenue_input || ''}
                                        onChange={e => setSettings({ ...settings, average_monthly_revenue_input: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <p className="text-slate-500 mt-6 max-w-sm text-center text-sm">
                                    Este valor baseia todos os cálculos de percentuais de custo e indicadores de performance.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="p-4 bg-slate-800/50 border-b border-slate-700/50 flex justify-end">
                                    <button
                                        className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                                        onClick={() => {
                                            if (!settings.average_monthly_revenue_input) return;
                                            if (!confirm(`Deseja aplicar R$ ${settings.average_monthly_revenue_input} em todos os meses?`)) return;

                                            const newRevenue = { ...settings.monthly_revenue };
                                            Object.keys(newRevenue).forEach(key => {
                                                newRevenue[key] = settings.average_monthly_revenue_input;
                                            });
                                            setSettings({ ...settings, monthly_revenue: newRevenue });
                                        }}
                                    >
                                        Aplicar valor único ({formatCurrency(settings.average_monthly_revenue_input)}) em todos os meses
                                    </button>
                                </div>
                                <div className="flex-1 overflow-auto p-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {Object.entries(settings.monthly_revenue).map(([month, value]) => (
                                            <div key={month} className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                                <label className="block text-xs text-slate-500 capitalize mb-1">{month}</label>
                                                <input
                                                    type="number"
                                                    className="bg-transparent w-full text-white font-medium text-right focus:outline-none border-b border-transparent focus:border-blue-500 tabular-nums"
                                                    value={value as number}
                                                    onChange={e => setSettings({
                                                        ...settings,
                                                        monthly_revenue: {
                                                            ...settings.monthly_revenue,
                                                            [month]: parseFloat(e.target.value) || 0
                                                        }
                                                    })}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-800/50 border-t border-slate-700/50 flex justify-between items-center text-sm">
                                    <span className="text-slate-400">Total Anual</span>
                                    <span className="text-white font-bold">{formatCurrency(totalRevenue)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* --- SECTION 2: COST STRUCTURE --- */}
            <section className="mb-16">
                <h4 className="text-slate-100 font-semibold mb-6">Estrutura de Custos</h4>
                <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-700/50 text-xs uppercase tracking-wider text-slate-500">
                                <th className="p-4 font-medium">Categoria de Custo</th>
                                <th className="p-4 font-medium text-center">Impacto no Faturamento (%)</th>
                                <th className="p-4 font-medium text-right">Valor Mensal (Est.)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30 font-medium text-slate-300">
                            <tr className="hover:bg-slate-700/20 transition-colors">
                                <td className="p-4">
                                    Custos Fixos
                                    <span className="block text-xs text-slate-500 font-normal mt-0.5">Aluguel, salários, software, etc.</span>
                                </td>
                                <td className="p-4 text-center tabular-nums">{fixedCostsPercent.toFixed(2)}%</td>
                                <td className="p-4 text-right tabular-nums">{formatCurrency(fixedCostsTotal)}</td>
                            </tr>
                            <tr className="hover:bg-slate-700/20 transition-colors">
                                <td className="p-4">
                                    Custos Variáveis
                                    <span className="block text-xs text-slate-500 font-normal mt-0.5">Impostos, taxas de cartão, comissões</span>
                                </td>
                                <td className="p-4 text-center tabular-nums">{variableCostsPercent.toFixed(2)}%</td>
                                <td className="p-4 text-right tabular-nums">{formatCurrency(variableCostsTotal)}</td>
                            </tr>
                            <tr className="bg-slate-700/20 font-bold text-white">
                                <td className="p-4">Custo Total (Operacional)</td>
                                <td className="p-4 text-center tabular-nums">{totalCostsPercent.toFixed(2)}%</td>
                                <td className="p-4 text-right tabular-nums">{formatCurrency(totalCosts)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* --- CONFIGURAÇÕES ADICIONAIS --- */}
            <section className="border-t border-slate-800 pt-12">
                <h4 className="text-slate-400 font-medium text-sm uppercase tracking-wider mb-6">Parâmetros Avançados</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                    <div className="flex flex-col gap-2">
                        <label className="text-slate-300 font-medium">Vendas Estimadas / Mês (Unidades)</label>
                        <input
                            type="number"
                            className="bg-slate-800 border border-slate-700 rounded-md p-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors w-full max-w-xs"
                            value={settings.estimated_monthly_sales ?? 1000}
                            onChange={e => setSettings({ ...settings, estimated_monthly_sales: parseFloat(e.target.value) })}
                        />
                        <p className="text-slate-500 text-xs">Usado apenas para rateio de custos fixos por unidade.</p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-slate-300 font-medium">Modo de Rateio de Custo Fixo</label>
                        <select
                            className="bg-slate-800 border border-slate-700 rounded-md p-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors w-full max-w-sm"
                            value={settings.fixed_cost_allocation_mode ?? 'revenue_based'}
                            onChange={e => setSettings({ ...settings, fixed_cost_allocation_mode: e.target.value as any })}
                        >
                            <option value="revenue_based">% do Faturamento (Recomendado)</option>
                            <option value="per_unit">Por Unidade Vendida</option>
                        </select>
                        <p className="text-slate-500 text-xs">Determine como o custo fixo é diluído no custo de cada produto.</p>
                    </div>
                </div>
            </section>

            <ImportSalesModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={fetchData}
            />
        </div>
    );
}
