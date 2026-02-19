
import { useEffect, useState } from 'react';
import { Save, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { BusinessSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { ImportSalesModal } from '../components/business/ImportSalesModal';

interface BusinessSettingsExtended extends BusinessSettings {
    monthly_revenue: Record<string, number>;
}

export function BusinessData() {
    const { companyId } = useAuth();
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<BusinessSettingsExtended | null>(null);
    const [fixedCostsTotal, setFixedCostsTotal] = useState(0);
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
                    monthly_revenue: revenueMap
                } as any); // Type assertion needed until we fully refactor state type or use new type
            } else {
                setSettings({
                    id: 0,
                    desired_profit_percent: 15,
                    platform_tax_rate: 18,
                    estimated_monthly_sales: 1000,
                    fixed_cost_allocation_mode: 'revenue_based',
                    target_cmv_percent: 35,
                    monthly_revenue: revenueMap // Use default map
                } as any);
            }

            // 2. Fixed Costs Total
            const { data: costs } = await supabase.from('fixed_costs').select('monthly_value').eq('company_id', companyId);
            const total = (costs || []).reduce((acc, curr) => acc + (parseFloat(curr.monthly_value as any) || 0), 0);
            setFixedCostsTotal(total);

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
                }).eq('id', data.id);
            } else {
                await supabase.from('business_settings').insert({
                    desired_profit_percent: settings.desired_profit_percent,
                    platform_tax_rate: settings.platform_tax_rate,
                    estimated_monthly_sales: settings.estimated_monthly_sales ?? 1000,
                    fixed_cost_allocation_mode: settings.fixed_cost_allocation_mode ?? 'revenue_based',
                    target_cmv_percent: settings.target_cmv_percent ?? 35,
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
    const avgRevenue = totalRevenue / 12;

    const variableCostsTotal = avgRevenue > 0 ? avgRevenue * (settings.platform_tax_rate / 100) : 0;
    const totalCosts = fixedCostsTotal + variableCostsTotal;

    // Percentages relative to Average Revenue
    const fixedCostsPercent = avgRevenue > 0 ? (fixedCostsTotal / avgRevenue) * 100 : 0;
    const variableCostsPercent = settings.platform_tax_rate;
    const totalCostsPercent = fixedCostsPercent + variableCostsPercent;

    // Indicators
    const contributionMarginPercent = 100 - variableCostsPercent;
    const breakEvenPoint = contributionMarginPercent > 0 ? fixedCostsTotal / (contributionMarginPercent / 100) : 0;

    // Markup suggested
    // Formula: 1 / (1 - (Fixed% + Var% + Profit%) / 100)
    // Note: Var% is the Tax Rate.
    const targetMarginPercent = fixedCostsPercent + variableCostsPercent + settings.desired_profit_percent;
    const suggestedMarkup = targetMarginPercent < 100 ? 1 / (1 - (targetMarginPercent / 100)) : 0;


    return (
        <div className="space-y-6 fade-in max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-xl font-bold text-slate-100">Dados Gerais</h2>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="btn btn-secondary flex items-center gap-2 text-sm py-1.5"
                    >
                        <Upload size={16} /> Importar
                    </button>
                    <button
                        onClick={handleSaveSettings}
                        className="btn btn-primary flex items-center gap-2 text-sm py-1.5"
                    >
                        <Save size={16} /> Salvar Alterações
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* --- COL 1: Resumo dos Custos --- */}
                <div className="card bg-dark-800 border border-dark-700 p-6 rounded-lg h-full">
                    <h3 className="text-amber-500 font-bold mb-6 flex items-center gap-2">
                        $ Resumo dos Custos
                    </h3>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-500 text-xs border-b border-dark-700 uppercase tracking-wider text-left">
                                    <th className="pb-2 font-medium">Nome</th>
                                    <th className="pb-2 font-medium text-center">%</th>
                                    <th className="pb-2 font-medium text-right">Valor R$</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-700/50">
                                <tr>
                                    <td className="py-4 text-slate-300">Custos Fixos</td>
                                    <td className="py-4 text-center text-slate-400">{fixedCostsPercent.toFixed(2)}%</td>
                                    <td className="py-4 text-right text-white font-medium">R$ {fixedCostsTotal.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td className="py-4 text-slate-300">Custos Variáveis (Taxas)</td>
                                    <td className="py-4 text-center text-slate-400">{variableCostsPercent.toFixed(2)}%</td>
                                    <td className="py-4 text-right text-white font-medium">R$ {variableCostsTotal.toFixed(2)}</td>
                                </tr>
                                <tr className="bg-dark-700/30">
                                    <td className="py-4 text-amber-400 font-bold">TOTAL</td>
                                    <td className="py-4 text-center text-amber-400 font-bold">{totalCostsPercent.toFixed(2)}%</td>
                                    <td className="py-4 text-right text-amber-400 font-bold">R$ {totalCosts.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* --- COL 2: Parâmetros e Indicadores --- */}
                <div className="space-y-6">
                    {/* Parâmetros */}
                    <div className="card bg-dark-800 border border-dark-700 p-6 rounded-lg">
                        <h3 className="text-blue-500 font-bold mb-4 flex items-center gap-2">
                            % Parâmetros
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Lucro Desejado (%)</label>
                                <input
                                    type="number"
                                    className="input w-full bg-dark-900 border border-dark-600 rounded p-2 text-white"
                                    value={settings.desired_profit_percent}
                                    onChange={e => setSettings({ ...settings, desired_profit_percent: parseFloat(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Taxa iFood / Plataforma (%)</label>
                                <input
                                    type="number"
                                    className="input w-full bg-dark-900 border border-dark-600 rounded p-2 text-white"
                                    value={settings.platform_tax_rate}
                                    onChange={e => setSettings({ ...settings, platform_tax_rate: parseFloat(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Qtd Vendas Estimada / Mês</label>
                                <input
                                    type="number"
                                    className="input w-full bg-dark-900 border border-dark-600 rounded p-2 text-white"
                                    value={settings.estimated_monthly_sales ?? 1000}
                                    onChange={e => setSettings({ ...settings, estimated_monthly_sales: parseFloat(e.target.value) })}
                                    placeholder="1000"
                                />
                                <p className="text-xs text-slate-500 mt-1">Usado para rateio de custos fixos por unidade vendida</p>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Meta CMV (%)</label>
                                <input
                                    type="number"
                                    step="1"
                                    className="input w-full bg-dark-900 border border-dark-600 rounded p-2 text-white"
                                    value={settings.target_cmv_percent ?? 35}
                                    onChange={e => setSettings({ ...settings, target_cmv_percent: parseFloat(e.target.value) })}
                                    placeholder="35"
                                />
                                <p className="text-xs text-slate-500 mt-1">Alvo máximo de CMV (padrão 35%)</p>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Modo Rateio Custo Fixo</label>
                                <select
                                    className="input w-full bg-dark-900 border border-dark-600 rounded p-2 text-white"
                                    value={settings.fixed_cost_allocation_mode ?? 'revenue_based'}
                                    onChange={e => setSettings({ ...settings, fixed_cost_allocation_mode: e.target.value as any })}
                                >
                                    <option value="revenue_based">% do Faturamento Médio</option>
                                    <option value="per_unit">Vendas Estimadas / Mês</option>
                                </select>
                                <p className="text-xs text-slate-500 mt-1">
                                    {(settings.fixed_cost_allocation_mode ?? 'revenue_based') === 'revenue_based'
                                        ? 'Custo fixo = preço × (custos fixos / faturamento médio)'
                                        : 'Custo fixo = total fixo mensal ÷ vendas estimadas'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Indicadores */}
                    <div className="card bg-dark-800 border border-dark-700 p-6 rounded-lg">
                        <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                            Indicadores
                        </h3>
                        <div className="space-y-4 text-sm">
                            <div className="flex justify-between items-center border-b border-dark-700 pb-2">
                                <span className="text-slate-400">Markup Sugerido</span>
                                <span className="text-emerald-400 font-bold text-lg">{suggestedMarkup > 0 ? suggestedMarkup.toFixed(2) : '-'}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-dark-700 pb-2">
                                <span className="text-slate-400">Margem Contribuição</span>
                                <span className="text-white font-medium">{contributionMarginPercent.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                                <div>
                                    <span className="text-slate-400 block text-xs">Ponto de Equilíbrio</span>
                                    <span className="text-white font-bold text-lg">R$ {breakEvenPoint.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- COL 3: Faturamento Médio --- */}
                <div className="card bg-dark-800 border border-dark-700 p-6 rounded-lg h-full flex flex-col">
                    <h3 className="text-blue-500 font-bold mb-4 flex items-center gap-2">
                        $ Faturamento Médio (Mensal)
                    </h3>

                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-500 text-xs border-b border-dark-700 uppercase tracking-wider text-left">
                                    <th className="pb-2 font-medium">Mês</th>
                                    <th className="pb-2 font-medium text-right">Valor R$</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-700/50">
                                {Object.entries(settings.monthly_revenue).map(([month, value]) => (
                                    <tr key={month} className="hover:bg-dark-700/20 transition-colors">
                                        <td className="py-2.5 text-slate-300 capitalize">{month}</td>
                                        <td className="py-2.5 text-right">
                                            <input
                                                type="number"
                                                className="bg-transparent text-right text-white w-28 border-none focus:ring-0 p-0 outline-none hover:text-blue-300 focus:text-blue-400 transition-colors arrow-hide"
                                                value={value as number}
                                                onChange={e => setSettings({
                                                    ...settings,
                                                    monthly_revenue: {
                                                        ...settings.monthly_revenue,
                                                        [month]: parseFloat(e.target.value) || 0
                                                    }
                                                })}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            <ImportSalesModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={fetchData}
            />
        </div>
    );
}
