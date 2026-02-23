import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { buildMonthlyKpis, type MonthlyKpi } from '../lib/reports/monthlyKpis';
import { TrendingUp, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatPercent(value: number | null) {
    if (value === null || isNaN(value)) return '-';
    return `${value.toFixed(1)}%`;
}

export function Reports() {
    const { companyId } = useAuth();
    const [loading, setLoading] = useState(true);
    const [monthsBack, setMonthsBack] = useState<6 | 12>(6);
    const [data, setData] = useState<MonthlyKpi[]>([]);

    useEffect(() => {
        if (!companyId) return;

        let isMounted = true;

        async function fetchData() {
            setLoading(true);
            try {
                const result = await buildMonthlyKpis({ companyId: companyId!, monthsBack, supabase });
                if (isMounted) setData(result);
            } catch (error) {
                console.error('Error fetching reports:', error);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchData();

        return () => { isMounted = false; };
    }, [companyId, monthsBack]);

    // The last item in the array is the current month
    const currentMonthData = data.length > 0 ? data[data.length - 1] : null;
    const previousMonthData = data.length > 1 ? data[data.length - 2] : null;

    const getCompareElement = (curr: number, prev: number | undefined | null, isPercent = false, inverseGood = false) => {
        if (prev === undefined || prev === null) return <span className="text-slate-500 text-xs ml-2"><Minus size={12} className="inline mr-1" />-</span>;
        if (prev === 0 && curr > 0) return <span className="text-emerald-400 text-xs ml-2"><ArrowUpRight size={12} className="inline mr-1" />100%</span>;
        if (prev === 0 && curr === 0) return <span className="text-slate-500 text-xs ml-2"><Minus size={12} className="inline mr-1" />0%</span>;

        let diff = curr - prev;
        let diffStr = '';

        // For percentages (margins, cmv), diff is in "pp" (percentage points)
        if (isPercent) {
            diffStr = `${Math.abs(diff).toFixed(1)}pp`;
        } else {
            const pChange = (diff / Math.abs(prev)) * 100;
            diffStr = `${Math.abs(pChange).toFixed(1)}%`;
        }

        const isPositive = diff > 0;
        const isNegative = diff < 0;

        // For CMV, lower is better. For profit/revenue/margin, higher is better.
        let colorClass = "text-slate-500";
        let Icon = Minus;

        if (isPositive) {
            colorClass = inverseGood ? "text-red-400" : "text-emerald-400";
            Icon = ArrowUpRight;
        } else if (isNegative) {
            colorClass = inverseGood ? "text-emerald-400" : "text-red-400";
            Icon = ArrowDownRight;
        }

        if (!isPositive && !isNegative) {
            return <span className="text-slate-500 text-xs ml-2"><Minus size={12} className="inline mr-1" />0%</span>;
        }

        return (
            <span className={`${colorClass} text-xs ml-2 font-medium flex items-center`}>
                <Icon size={12} className="mr-0.5" />
                {diffStr}
            </span>
        );
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                        <TrendingUp className="text-primary" />
                        Relatórios Financeiros
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Acompanhe a evolução do seu negócio mês a mês</p>
                </div>

                <div className="flex bg-dark-800 rounded-lg p-1 border border-dark-700">
                    <button
                        onClick={() => setMonthsBack(6)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${monthsBack === 6 ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        6 Meses
                    </button>
                    <button
                        onClick={() => setMonthsBack(12)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${monthsBack === 12 ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        12 Meses
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="bg-dark-800 rounded-xl p-8 border border-dark-700 flex justify-center items-center min-h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : (
                <>
                    {/* Undefined Costs Alert */}
                    {currentMonthData && currentMonthData.undefinedCostQty > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                            <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
                            <div>
                                <h3 className="text-sm font-medium text-amber-500">Atenção aos Custos Indefinidos neste mês!</h3>
                                <p className="text-sm text-slate-300 mt-1">
                                    Existem <strong>{currentMonthData.undefinedCostQty}</strong> unidades vendidas de produtos sem custo unitário definido. Isso afeta <strong>{formatCurrency(currentMonthData.undefinedCostRevenue)}</strong> em receita e mascara sua real margem de lucro. Preencha os custos na ficha técnica para ter indicadores reais.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* KPI Cards (Current Month) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-dark-800 rounded-xl p-5 border border-dark-700 flex flex-col justify-between shadow-sm">
                            <div className="flex justify-between items-start">
                                <span className="text-sm font-medium text-slate-400">Receita Mês Atual</span>
                                <span className="text-xs bg-dark-700 px-2 py-0.5 rounded text-slate-300">{currentMonthData?.label}</span>
                            </div>
                            <div className="mt-4 flex items-baseline">
                                <span className="text-2xl font-bold text-slate-100">
                                    {formatCurrency(currentMonthData?.revenueSales || 0)}
                                </span>
                                {getCompareElement(currentMonthData?.revenueSales || 0, previousMonthData?.revenueSales)}
                            </div>
                            {currentMonthData?.revenueManual !== undefined && currentMonthData.revenueManual !== null && currentMonthData.revenueManual > 0 && (
                                <div className="mt-2 text-xs text-slate-500">
                                    Informada manualmente: {formatCurrency(currentMonthData.revenueManual)}
                                </div>
                            )}
                        </div>

                        <div className="bg-dark-800 rounded-xl p-5 border border-dark-700 flex flex-col justify-between shadow-sm">
                            <span className="text-sm font-medium text-slate-400">Custo Estimado</span>
                            <div className="mt-4 flex items-baseline">
                                <span className="text-2xl font-bold text-slate-100">
                                    {formatCurrency(currentMonthData?.costEstimated || 0)}
                                </span>
                                {getCompareElement(currentMonthData?.costEstimated || 0, previousMonthData?.costEstimated, false, true)}
                            </div>
                        </div>

                        <div className="bg-dark-800 rounded-xl p-5 border border-dark-700 flex flex-col justify-between shadow-sm">
                            <span className="text-sm font-medium text-slate-400">Lucro Estimado</span>
                            <div className="mt-4 flex items-baseline">
                                <span className={`text-2xl font-bold ${currentMonthData && currentMonthData.profitEstimated >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {formatCurrency(currentMonthData?.profitEstimated || 0)}
                                </span>
                                {getCompareElement(currentMonthData?.profitEstimated || 0, previousMonthData?.profitEstimated)}
                            </div>
                        </div>

                        <div className="bg-dark-800 rounded-xl p-5 border border-dark-700 flex flex-col justify-between shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <span className="text-sm font-medium text-slate-400">Margem (%)</span>
                                    <div className="mt-2 flex items-baseline">
                                        <span className="text-xl font-bold text-slate-100">{formatPercent(currentMonthData?.marginPercent ?? null)}</span>
                                        {getCompareElement(currentMonthData?.marginPercent || 0, previousMonthData?.marginPercent || 0, true)}
                                    </div>
                                </div>
                                <div className="w-px h-10 bg-dark-700"></div>
                                <div className="flex-1">
                                    <span className="text-sm font-medium text-slate-400">CMV (%)</span>
                                    <div className="mt-2 flex items-baseline">
                                        <span className="text-xl font-bold text-slate-100">{formatPercent(currentMonthData?.cmvPercent ?? null)}</span>
                                        {getCompareElement(currentMonthData?.cmvPercent || 0, previousMonthData?.cmvPercent || 0, true, true)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Trend Table */}
                    <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden shadow-sm">
                        <div className="p-5 border-b border-dark-700">
                            <h2 className="text-lg font-semibold text-slate-100">Tendência Mensal</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-dark-900/50 text-slate-400">
                                    <tr>
                                        <th className="px-5 py-3 font-medium">Mês</th>
                                        <th className="px-5 py-3 font-medium">Receita (Vendas)</th>
                                        <th className="px-5 py-3 font-medium">Custo Estimado</th>
                                        <th className="px-5 py-3 font-medium">Lucro Estimado</th>
                                        <th className="px-5 py-3 font-medium">Margem %</th>
                                        <th className="px-5 py-3 font-medium">CMV %</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-dark-700 text-slate-300">
                                    {data.slice().reverse().map((row) => (
                                        <tr key={row.label} className="hover:bg-dark-700/30 transition-colors">
                                            <td className="px-5 py-4 font-medium text-slate-200">{row.label}</td>
                                            <td className="px-5 py-4">
                                                <div>{formatCurrency(row.revenueSales)}</div>
                                                {row.revenueManual !== undefined && row.revenueManual !== null && row.revenueManual > 0 && (
                                                    <div className="text-xs text-slate-500 mt-1">Manual: {formatCurrency(row.revenueManual)}</div>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div>{formatCurrency(row.costEstimated)}</div>
                                                {row.undefinedCostQty > 0 && (
                                                    <div className="text-xs text-amber-500 mt-1 flex items-center group relative cursor-help">
                                                        <AlertTriangle size={12} className="mr-1 inline" />
                                                        {row.undefinedCostQty} un. indefinidas
                                                        {/* Simple tooltip for financial impact */}
                                                        <div className="absolute hidden group-hover:block bottom-full mb-1 left-0 z-10 w-48 p-2 bg-dark-900 text-slate-300 text-xs rounded border border-dark-700 shadow-xl">
                                                            Receita afetada: {formatCurrency(row.undefinedCostRevenue)}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className={`px-5 py-4 font-medium ${row.profitEstimated > 0 ? 'text-emerald-400' : row.profitEstimated < 0 ? 'text-red-400' : ''}`}>
                                                {formatCurrency(row.profitEstimated)}
                                            </td>
                                            <td className="px-5 py-4">{formatPercent(row.marginPercent)}</td>
                                            <td className="px-5 py-4">{formatPercent(row.cmvPercent)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
