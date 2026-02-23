import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, DollarSign, Package, ArrowUpRight, ArrowDownRight, AlertTriangle, Activity, Target, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { ActionCenter } from '../components/performance/ActionCenter';

type DateRange = '7d' | '30d' | '90d';
type SortKey = 'totalProfit' | 'revenue' | 'profitPerUnit' | 'qty';

interface PerformanceRow {
    id: number;
    name: string;
    qty: number;
    revenue: number;
    avgPrice: number;
    unitCost: number;
    profitPerUnit: number;
    totalProfit: number;
    cmvPercent: number;
    impactPlus10: number | null;
}

export function Performance() {
    const { companyId } = useAuth();
    const biz = useBusinessSettings();
    const [dateRange, setDateRange] = useState<DateRange>('30d');
    const [loading, setLoading] = useState(true);
    const [rawProducts, setRawProducts] = useState<any[]>([]);
    const [salesMap, setSalesMap] = useState<Map<number, { qty: number; total: number }>>(new Map());
    const [sortKey, setSortKey] = useState<SortKey>('totalProfit');
    const [sortAsc, setSortAsc] = useState(false);

    useEffect(() => {
        if (companyId) fetchData();
    }, [companyId, dateRange]);

    async function fetchData() {
        if (!companyId) return;
        try {
            setLoading(true);

            const prodQuery = supabase
                .from('product_costs_view')
                .select('*')
                .eq('company_id', companyId)
                .order('name');
            const { data: prods } = await prodQuery;

            // Sales query with date range
            const now = new Date();
            const dateStart = new Date();
            if (dateRange === '7d') dateStart.setDate(now.getDate() - 7);
            else if (dateRange === '30d') dateStart.setDate(now.getDate() - 30);
            else if (dateRange === '90d') dateStart.setDate(now.getDate() - 90);

            const salesQuery = supabase
                .from('sales')
                .select('product_id, quantity, sale_price')
                .eq('company_id', companyId)
                .gte('sold_at', dateStart.toISOString());
            const { data: sales } = await salesQuery;

            // Aggregation: weighted
            const sMap = new Map<number, { qty: number; total: number }>();
            sales?.forEach(s => {
                const current = sMap.get(s.product_id) || { qty: 0, total: 0 };
                sMap.set(s.product_id, {
                    qty: current.qty + s.quantity,
                    total: current.total + (s.quantity * s.sale_price)
                });
            });

            setRawProducts(prods || []);
            setSalesMap(sMap);
        } catch (error) {
            console.error('Error fetching performance data:', error);
        } finally {
            setLoading(false);
        }
    }

    // Days in the selected period
    const periodDays = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;

    // Build performance rows
    const rows: PerformanceRow[] = useMemo(() => {
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
            const qty = salesData.qty;
            const revenue = salesData.total;
            const avgPrice = qty > 0 ? revenue / qty : (p.sale_price || 0);

            const unitCost = parseNumber(p.cmv); // unit cost in R$

            const profitPerUnit = avgPrice - unitCost;
            const totalProfit = qty * profitPerUnit;
            const cmvPercent = avgPrice > 0 ? (unitCost / avgPrice) * 100 : 0;

            // +10 units/day impact (only if profitable)
            const impactPlus10 = profitPerUnit > 0 ? profitPerUnit * 10 * periodDays : null;

            return {
                id: p.id,
                name: p.name,
                qty,
                revenue,
                avgPrice,
                unitCost,
                profitPerUnit,
                totalProfit,
                cmvPercent,
                impactPlus10,
            };
        }).filter(r => r.qty > 0); // Only show products with sales
    }, [rawProducts, salesMap, biz, periodDays]);

    // Sort
    const sortedRows = useMemo(() => {
        return [...rows].sort((a, b) => {
            const va = a[sortKey] ?? 0;
            const vb = b[sortKey] ?? 0;
            return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
        });
    }, [rows, sortKey, sortAsc]);

    // Summary
    const summary = useMemo(() => {
        const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
        const totalProfit = rows.reduce((a, r) => a + r.totalProfit, 0);
        const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        const inLoss = rows.filter(r => r.totalProfit < 0).length;
        return { totalRevenue, totalProfit, avgMargin, inLoss };
    }, [rows]);

    function handleSort(key: SortKey) {
        if (sortKey === key) setSortAsc(!sortAsc);
        else { setSortKey(key); setSortAsc(false); }
    }

    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtPct = (v: number) => `${v.toFixed(1)}%`;

    const SortIcon = ({ col }: { col: SortKey }) => (
        sortKey === col
            ? <ChevronDown size={14} className={`inline ml-1 transition-transform ${sortAsc ? 'rotate-180' : ''}`} />
            : null
    );

    return (
        <div className="space-y-6 fade-in">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h2 className="page-title">Desempenho</h2>
                    <p className="page-subtitle">Rankings de rentabilidade e impacto por produto</p>
                </div>

                {/* Period selector */}
                <div className="flex gap-1 bg-dark-800 rounded-lg p-1">
                    {(['7d', '30d', '90d'] as DateRange[]).map(r => (
                        <button
                            key={r}
                            onClick={() => setDateRange(r)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateRange === r
                                ? 'bg-primary text-white'
                                : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            {r === '7d' ? '7 dias' : r === '30d' ? '30 dias' : '90 dias'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard
                    icon={DollarSign}
                    label="Receita Total"
                    value={fmt(summary.totalRevenue)}
                    color="text-emerald-400"
                />
                <SummaryCard
                    icon={TrendingUp}
                    label="Lucro Total"
                    value={fmt(summary.totalProfit)}
                    color={summary.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}
                />
                <SummaryCard
                    icon={Target}
                    label="Margem Média"
                    value={fmtPct(summary.avgMargin)}
                    color="text-blue-400"
                />
                <SummaryCard
                    icon={AlertTriangle}
                    label="Produtos em Prejuízo"
                    value={String(summary.inLoss)}
                    color={summary.inLoss > 0 ? 'text-red-400' : 'text-emerald-400'}
                />
            </div>

            {/* Action Center */}
            <ActionCenter products={rawProducts} biz={biz} salesMap={salesMap} />

            {loading ? (
                <div className="glass-card p-12 text-center text-slate-400">
                    <Activity className="animate-spin mx-auto mb-2" size={24} />
                    Carregando dados...
                </div>
            ) : rows.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <Package size={48} className="mx-auto mb-4 text-slate-500" />
                    <p className="text-slate-400">Nenhuma venda encontrada no período selecionado.</p>
                    <p className="text-slate-500 text-sm mt-1">Importe vendas para ver o ranking de desempenho.</p>
                </div>
            ) : (
                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table text-sm">
                            <thead>
                                <tr>
                                    <th className="text-left">Produto</th>
                                    <th className="text-right cursor-pointer select-none" onClick={() => handleSort('qty')}>
                                        Qty <SortIcon col="qty" />
                                    </th>
                                    <th className="text-right cursor-pointer select-none" onClick={() => handleSort('revenue')}>
                                        Receita <SortIcon col="revenue" />
                                    </th>
                                    <th className="text-right">Custo Unit. (R$)</th>
                                    <th className="text-right">CMV%</th>
                                    <th className="text-right cursor-pointer select-none" onClick={() => handleSort('profitPerUnit')}>
                                        Lucro/Unit <SortIcon col="profitPerUnit" />
                                    </th>
                                    <th className="text-right cursor-pointer select-none" onClick={() => handleSort('totalProfit')}>
                                        Lucro Total <SortIcon col="totalProfit" />
                                    </th>
                                    <th className="text-right">Impacto +10/dia</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRows.map((r, i) => (
                                    <tr key={r.id} className={i % 2 === 0 ? 'bg-dark-800/30' : ''}>
                                        <td className="font-medium text-white max-w-[200px] truncate">{r.name}</td>
                                        <td className="text-right tabular-nums">{r.qty}</td>
                                        <td className="text-right tabular-nums">{fmt(r.revenue)}</td>
                                        <td className="text-right tabular-nums">{fmt(r.unitCost)}</td>
                                        <td className="text-right tabular-nums">{fmtPct(r.cmvPercent)}</td>
                                        <td className={`text-right tabular-nums font-medium ${r.profitPerUnit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {fmt(r.profitPerUnit)}
                                        </td>
                                        <td className={`text-right tabular-nums font-semibold ${r.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            <span className="inline-flex items-center gap-1">
                                                {r.totalProfit >= 0
                                                    ? <ArrowUpRight size={14} />
                                                    : <ArrowDownRight size={14} />
                                                }
                                                {fmt(r.totalProfit)}
                                            </span>
                                        </td>
                                        <td className="text-right tabular-nums text-slate-400">
                                            {r.impactPlus10 !== null ? fmt(r.impactPlus10) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ icon: Icon, label, value, color }: {
    icon: typeof DollarSign;
    label: string;
    value: string;
    color: string;
}) {
    return (
        <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
                <Icon size={18} className={color} />
                <span className="text-xs text-slate-400">{label}</span>
            </div>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
        </div>
    );
}
