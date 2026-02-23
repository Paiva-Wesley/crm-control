import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { computeProductMetrics } from '../../lib/pricing';
import { buildInsights, getWorstInsightLevel } from '../../lib/insights/buildInsights';

interface ActionCenterProps {
    products: any[];
    biz: any;
    salesMap: Map<number, { qty: number; total: number }>;
}

export function ActionCenter({ products, biz, salesMap }: ActionCenterProps) {
    const navigate = useNavigate();

    const priorities = useMemo(() => {
        if (!products.length || biz.loading) return [];

        const parseNumber = (value: any): number => {
            if (typeof value === 'number') return value;
            if (!value) return 0;
            const cleanStr = String(value).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim();
            const num = Number(cleanStr);
            return isNaN(num) ? 0 : num;
        };

        const items: {
            id: number;
            name: string;
            level: 'danger' | 'warning' | 'info';
            reason: string;
        }[] = [];

        for (const p of products) {
            const unitCost = parseNumber(p.cmv);
            const salesData = salesMap.get(p.id) || { qty: 0, total: 0 };
            const avgPrice = salesData.qty > 0 ? salesData.total / salesData.qty : (p.sale_price || 0);

            // Check suspicious cost first (adjustment #4)
            if (unitCost <= 0 || parseNumber(p.cmv) <= 0) {
                items.push({
                    id: p.id,
                    name: p.name,
                    level: 'danger',
                    reason: 'Custo suspeito / ficha incompleta',
                });
                continue; // Don't add more alerts for the same product
            }

            const metrics = computeProductMetrics({
                cmv: unitCost,
                salePrice: avgPrice > 0 ? avgPrice : (p.sale_price || 0),
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

            const insights = buildInsights(
                { name: p.name, sale_price: avgPrice > 0 ? avgPrice : (p.sale_price || 0) },
                metrics,
                {
                    targetCmvPercent: biz.targetCmvPercent ?? 35,
                    desiredProfitPercent: biz.desiredProfitPercent ?? 15,
                }
            );

            const worst = getWorstInsightLevel(insights);
            if (worst === 'danger' || worst === 'warning') {
                const topInsight = insights[0];
                items.push({
                    id: p.id,
                    name: p.name,
                    level: worst as 'danger' | 'warning',
                    reason: topInsight?.title || 'Requer atenção',
                });
            }
        }

        // Sort: danger first, then warning
        items.sort((a, b) => {
            const order = { danger: 0, warning: 1, info: 2 };
            return order[a.level] - order[b.level];
        });

        return items.slice(0, 5);
    }, [products, biz, salesMap]);

    if (priorities.length === 0) return null;

    return (
        <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={18} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Centro de Ação</h3>
                <span className="text-xs text-slate-500 ml-auto">{priorities.length} itens prioritários</span>
            </div>

            <div className="space-y-2">
                {priorities.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 transition-colors group cursor-pointer"
                        onClick={() => navigate(`/products?highlight=${item.id}`)}
                    >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.level === 'danger' ? 'bg-red-500' : 'bg-amber-500'
                            }`} />

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{item.name}</p>
                            <p className="text-xs text-slate-400">{item.reason}</p>
                        </div>

                        <button
                            className="text-xs text-slate-500 group-hover:text-primary flex items-center gap-1 transition-colors flex-shrink-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/products?highlight=${item.id}`);
                            }}
                        >
                            Abrir produto
                            <ChevronRight size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
