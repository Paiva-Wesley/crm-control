import { useState, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { useBusinessSettings } from '../../hooks/useBusinessSettings';
import { computeProductMetrics, type ProductMetrics } from '../../lib/pricing';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

interface CostSimulatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    productName: string;
    currentCmv: number;
    currentSalePrice: number;
    productId?: number;
}

const PRESETS = [5, 10, 20];

export function CostSimulatorModal({
    isOpen,
    onClose,
    productName,
    currentCmv,
    currentSalePrice,
    productId,
}: CostSimulatorModalProps) {
    const { companyId } = useAuth();
    const biz = useBusinessSettings();
    const { toast } = useToast();
    const [increasePercent, setIncreasePercent] = useState(10);
    const [applying, setApplying] = useState(false);

    // Simulated CMV = original + increase%
    const simulatedCmv = currentCmv * (1 + increasePercent / 100);

    // Build metrics input (shared)
    const metricsInput = useMemo(() => ({
        fixedCostPercent: biz.fixedCostPercent,
        variableCostPercent: biz.variableCostPercent,
        desiredProfitPercent: biz.desiredProfitPercent,
        totalFixedCosts: biz.totalFixedCosts,
        estimatedMonthlySales: biz.estimatedMonthlySales,
        averageMonthlyRevenue: biz.averageMonthlyRevenue,
        channels: biz.channels,
        fixedCostAllocationMode: biz.fixedCostAllocationMode,
        targetCmvPercent: biz.targetCmvPercent,
    }), [biz]);

    // Current metrics (at actual price)
    const currentMetrics: ProductMetrics = useMemo(
        () => computeProductMetrics({ cmv: currentCmv, salePrice: currentSalePrice, ...metricsInput }),
        [currentCmv, currentSalePrice, metricsInput]
    );

    // Simulated metrics (at same sale price but higher CMV)
    const simMetrics: ProductMetrics = useMemo(
        () => computeProductMetrics({ cmv: simulatedCmv, salePrice: currentSalePrice, ...metricsInput }),
        [simulatedCmv, currentSalePrice, metricsInput]
    );

    // New ideal price for the increased CMV
    const newIdealPrice: ProductMetrics = useMemo(
        () => computeProductMetrics({ cmv: simulatedCmv, salePrice: simulatedCmv * (currentMetrics.markup || 1), ...metricsInput }),
        [simulatedCmv, currentMetrics.markup, metricsInput]
    );

    const profitDiff = simMetrics.profitValue - currentMetrics.profitValue;
    const marginDiff = simMetrics.profitPercent - currentMetrics.profitPercent;

    async function handleApplyPrice() {
        if (!productId) return;
        if (!confirm(`Deseja atualizar o preço de venda para R$ ${newIdealPrice.idealMenuPrice.toFixed(2)}?`)) return;

        try {
            setApplying(true);
            const { error } = await supabase
                .from('products')
                .update({ sale_price: parseFloat(newIdealPrice.idealMenuPrice.toFixed(2)) })
                .eq('id', productId)
                .eq('company_id', companyId);

            if (error) throw error;
            toast.success('Preço atualizado com sucesso!');
            onClose();
        } catch (err) {
            console.error('Error updating price:', err);
            toast.error('Erro ao atualizar preço');
        } finally {
            setApplying(false);
        }
    }

    const statusColor = (status: string) =>
        status === 'danger' ? 'text-red-400' : status === 'warning' ? 'text-amber-400' : 'text-emerald-400';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Simulador de Custo: ${productName}`} maxWidth="700px">
            <div className="flex flex-col gap-5">
                {/* Disclaimer */}
                <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-sm">
                    <span className="shrink-0 mt-0.5">ℹ️</span>
                    <span>Simulação baseada no aumento do custo atual. <strong>Nenhum valor será alterado</strong> até você aplicar.</span>
                </div>

                {/* Increase Input */}
                <div>
                    <label className="block text-sm text-slate-400 mb-2">Aumento percentual do custo</label>
                    <div className="flex items-center gap-3">
                        {PRESETS.map(p => (
                            <button
                                key={p}
                                onClick={() => setIncreasePercent(p)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${increasePercent === p
                                    ? 'bg-primary/20 border-primary/50 text-primary'
                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                                    }`}
                            >
                                +{p}%
                            </button>
                        ))}
                        <div className="relative flex-1 max-w-[120px]">
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={increasePercent}
                                onChange={e => setIncreasePercent(Number(e.target.value) || 0)}
                                className="w-full pl-3 pr-8 py-2 text-sm"
                            />
                            <span className="absolute right-3 top-2 text-slate-500 text-sm">%</span>
                        </div>
                    </div>
                </div>

                {/* Comparison Table */}
                <div className="border border-slate-700/50 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-3 text-sm">
                        {/* Header */}
                        <div className="p-3 bg-slate-800/50 font-medium text-slate-400 border-b border-slate-700/50" />
                        <div className="p-3 bg-slate-800/50 font-medium text-slate-400 text-center border-b border-l border-slate-700/50">Atual</div>
                        <div className="p-3 bg-amber-500/5 font-medium text-amber-400 text-center border-b border-l border-slate-700/50">Simulado (+{increasePercent}%)</div>

                        {/* CMV */}
                        <div className="p-3 text-slate-400 border-b border-slate-700/30">CMV (R$)</div>
                        <div className="p-3 text-center text-white border-b border-l border-slate-700/30">R$ {currentCmv.toFixed(2)}</div>
                        <div className="p-3 text-center text-amber-300 font-medium border-b border-l border-slate-700/30">R$ {simulatedCmv.toFixed(2)}</div>

                        {/* CMV % */}
                        <div className="p-3 text-slate-400 border-b border-slate-700/30">CMV %</div>
                        <div className={`p-3 text-center font-medium border-b border-l border-slate-700/30 ${statusColor(currentMetrics.cmvStatus)}`}>
                            {currentMetrics.cmvPercent.toFixed(1)}%
                        </div>
                        <div className={`p-3 text-center font-medium border-b border-l border-slate-700/30 ${statusColor(simMetrics.cmvStatus)}`}>
                            {simMetrics.cmvPercent.toFixed(1)}%
                        </div>

                        {/* Lucro */}
                        <div className="p-3 text-slate-400 border-b border-slate-700/30">Lucro (R$)</div>
                        <div className={`p-3 text-center font-medium border-b border-l border-slate-700/30 ${statusColor(currentMetrics.marginStatus)}`}>
                            R$ {currentMetrics.profitValue.toFixed(2)}
                        </div>
                        <div className={`p-3 text-center font-medium border-b border-l border-slate-700/30 ${statusColor(simMetrics.marginStatus)}`}>
                            R$ {simMetrics.profitValue.toFixed(2)}
                            <span className="block text-xs text-red-400 mt-0.5">
                                ({profitDiff >= 0 ? '+' : ''}R$ {profitDiff.toFixed(2)})
                            </span>
                        </div>

                        {/* Margem % */}
                        <div className="p-3 text-slate-400">Margem %</div>
                        <div className={`p-3 text-center font-medium border-l border-slate-700/30 ${statusColor(currentMetrics.marginStatus)}`}>
                            {currentMetrics.profitPercent.toFixed(1)}%
                        </div>
                        <div className={`p-3 text-center font-medium border-l border-slate-700/30 ${statusColor(simMetrics.marginStatus)}`}>
                            {simMetrics.profitPercent.toFixed(1)}%
                            <span className="block text-xs text-red-400 mt-0.5">
                                ({marginDiff >= 0 ? '+' : ''}{marginDiff.toFixed(1)}pp)
                            </span>
                        </div>
                    </div>
                </div>

                {/* New Ideal Price */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-400">Novo Preço Ideal (com custo +{increasePercent}%)</p>
                            <p className="text-2xl font-bold text-emerald-400 mt-1">
                                R$ {newIdealPrice.idealMenuPrice.toFixed(2)}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                                Atual: R$ {currentSalePrice.toFixed(2)} → Diferença: R$ {(newIdealPrice.idealMenuPrice - currentSalePrice).toFixed(2)}
                            </p>
                        </div>
                        {productId && (
                            <button
                                onClick={handleApplyPrice}
                                disabled={applying}
                                className="px-5 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            >
                                {applying ? 'Aplicando...' : 'Aplicar Preço'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Premium Global Placeholder */}
                <div className="flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/30 rounded-lg">
                    <div>
                        <p className="text-sm font-medium text-slate-300">Simulação Global</p>
                        <p className="text-xs text-slate-500">Simule aumento de custo em todos os produtos de uma vez</p>
                    </div>
                    <span className="px-3 py-1 text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full">
                        Em breve • Premium
                    </span>
                </div>

                <div className="flex justify-end">
                    <button className="btn btn-primary" onClick={onClose}>Fechar</button>
                </div>
            </div>
        </Modal>
    );
}
