import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useBusinessSettings } from '../../hooks/useBusinessSettings';
import { computeProductMetrics, type ProductMetrics } from '../../lib/pricing';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    productName: string;
    cmv: number;
    currentSalePrice: number;
    productSalesQty?: number;
}

const cmvIcon = (status: string) =>
    status === 'healthy' ? '🟢' : status === 'warning' ? '🟡' : '🔴';
const marginIcon = (status: string) =>
    status === 'healthy' ? '🟢' : status === 'warning' ? '🟡' : '🔴';

export function PricingModal({ isOpen, onClose, productName, cmv, currentSalePrice }: PricingModalProps) {
    const biz = useBusinessSettings();
    const [salePrice, setSalePrice] = useState(currentSalePrice);

    useEffect(() => {
        if (isOpen) {
            setSalePrice(currentSalePrice);
        }
    }, [isOpen, currentSalePrice]);

    // Compute metrics using the pricing engine
    const metrics: ProductMetrics = computeProductMetrics({
        cmv,
        salePrice,
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

    const profitColor = metrics.marginStatus === 'danger'
        ? 'text-red-400' : metrics.marginStatus === 'warning'
            ? 'text-amber-400' : 'text-emerald-400';
    const profitBg = metrics.marginStatus === 'danger'
        ? 'bg-red-500/10' : metrics.marginStatus === 'warning'
            ? 'bg-amber-500/10' : 'bg-emerald-500/10';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Precificação: ${productName}`} maxWidth="800px">
            <div className="flex flex-col gap-5">

                {/* Price Input */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-secondary mb-1">Preço de Venda (Simulação)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-secondary">R$</span>
                            <input
                                type="number"
                                step="0.01"
                                className="pl-8 w-full"
                                value={salePrice}
                                onChange={e => setSalePrice(Number(e.target.value))}
                            />
                        </div>
                    </div>
                    <div className="bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/20">
                        <p className="text-sm text-slate-400 mb-1">Preço Ideal Cardápio</p>
                        <p className="text-2xl font-bold text-emerald-400">
                            R$ {metrics.idealMenuPrice.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Markup: {metrics.markup > 0 ? metrics.markup.toFixed(2) + 'x' : 'N/A'} (CMV × Markup)
                        </p>
                    </div>
                </div>

                {/* ====== INDICADORES DE DECISÃO ====== */}
                <div className="border border-color rounded-lg overflow-hidden">
                    <div className="bg-blue-500/10 p-2 font-bold text-center uppercase text-sm text-blue-400">
                        📊 Indicadores de Decisão
                    </div>

                    {/* CMV Indicator — top block, prominent */}
                    <div className={`grid grid-cols-3 divide-x divide-color border-b border-color ${metrics.cmvStatus === 'danger' ? 'bg-red-500/5' :
                        metrics.cmvStatus === 'warning' ? 'bg-amber-500/5' :
                            'bg-emerald-500/5'
                        }`}>
                        <div className="p-3 text-center">
                            <p className="text-xs text-slate-500 uppercase">CMV (R$)</p>
                            <p className="text-lg font-bold text-white">R$ {cmv.toFixed(2)}</p>
                        </div>
                        <div className="p-3 text-center">
                            <p className="text-xs text-slate-500 uppercase">CMV (%)</p>
                            <p className={`text-lg font-bold ${metrics.cmvStatus === 'danger' ? 'text-red-400' :
                                metrics.cmvStatus === 'warning' ? 'text-amber-400' :
                                    'text-emerald-400'
                                }`}>
                                {metrics.cmvPercent.toFixed(1)}% {cmvIcon(metrics.cmvStatus)}
                            </p>
                        </div>
                        <div className="p-3 text-center">
                            <p className="text-xs text-slate-500 uppercase">Meta CMV</p>
                            <p className="text-lg font-bold text-slate-300">≤ {biz.targetCmvPercent}%</p>
                        </div>
                    </div>

                    {/* Margins grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-color border-b border-color">
                        <div className="p-3 text-center">
                            <p className="text-xs text-slate-500 uppercase">Margem Bruta</p>
                            <p className="text-lg font-bold text-white">{metrics.grossMarginPercent.toFixed(1)}%</p>
                            <p className="text-[10px] text-slate-600">antes de custos op.</p>
                        </div>
                        <div className="p-3 text-center">
                            <p className="text-xs text-slate-500 uppercase">Margem Contribuição</p>
                            <p className="text-lg font-bold text-white">{metrics.contributionMarginPercent.toFixed(1)}%</p>
                            <p className="text-[10px] text-slate-600">após custos variáveis</p>
                        </div>
                        <div className={`p-3 text-center ${profitBg}`}>
                            <p className="text-xs text-slate-500 uppercase">Lucro Estimado</p>
                            <p className={`text-lg font-bold ${profitColor}`}>
                                R$ {metrics.profitValue.toFixed(2)}
                            </p>
                        </div>
                        <div className={`p-3 text-center ${profitBg}`}>
                            <p className="text-xs text-slate-500 uppercase">Lucro (%)</p>
                            <p className={`text-lg font-bold ${profitColor}`}>
                                {metrics.profitPercent.toFixed(1)}% {marginIcon(metrics.marginStatus)}
                            </p>
                        </div>
                    </div>

                    {/* Cost breakdown */}
                    <div className="divide-y divide-color/50 text-sm">
                        <div className="flex justify-between p-2">
                            <span>Custo de Produtos (CMV)</span>
                            <span className="font-medium">R$ {cmv.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between p-2">
                            <span>Custos Variáveis ({biz.variableCostPercent.toFixed(1)}%)</span>
                            <span>R$ {metrics.variableCostValue.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between p-2">
                            <span className="flex items-center gap-1">
                                Custo Fixo
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                                    {metrics.fixedCostMethod === 'revenue_based' ? 'Faturamento' : 'Por Unidade'}
                                </span>
                            </span>
                            <span>R$ {metrics.fixedCostValue.toFixed(2)}</span>
                        </div>
                        <div className="px-2 py-1 text-[10px] text-slate-500 italic">
                            Baseado em {metrics.fixedCostExplanation}
                        </div>
                        <div className="flex justify-between p-2 bg-secondary/20 font-bold">
                            <span>Custo Total Unitário</span>
                            <span>R$ {metrics.totalCost.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Alerts */}
                {metrics.marginStatus === 'warning' && (
                    <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                        Lucro de {metrics.profitPercent.toFixed(1)}% está abaixo do desejado ({biz.desiredProfitPercent}%)
                    </div>
                )}
                {metrics.marginStatus === 'danger' && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
                        ⚠️ Produto com PREJUÍZO — revise preço ou custos
                    </div>
                )}

                {/* Per-Channel Ideal Prices */}
                {metrics.channelPrices.length > 0 && (
                    <div className="border border-color rounded-lg overflow-hidden">
                        <div className="bg-blue-500/10 p-2 font-bold text-center uppercase text-sm text-blue-400">
                            Preço Ideal por Canal de Venda
                        </div>
                        <div className="divide-y divide-color">
                            {metrics.channelPrices.map(cp => (
                                <div key={cp.channelId} className="flex justify-between items-center p-3 hover:bg-dark-700/30 transition-colors">
                                    <div>
                                        <span className="font-medium text-slate-200">{cp.channelName}</span>
                                        <span className="text-xs text-slate-500 ml-2">({cp.totalTaxRate.toFixed(1)}% taxas)</span>
                                    </div>
                                    <span className="font-bold text-blue-400 text-lg">
                                        R$ {cp.idealPrice.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer info */}
                <div className="flex items-center justify-between text-sm text-secondary bg-secondary/5 p-3 rounded-lg">
                    <span>Markup: <strong className="text-white">{metrics.markup.toFixed(2)}x</strong></span>
                    <span>Lucro Desejado: <strong className="text-emerald-400">{biz.desiredProfitPercent}%</strong></span>
                    <span>Meta CMV: <strong className="text-blue-400">≤ {biz.targetCmvPercent}%</strong></span>
                </div>

                <div className="text-center text-xs text-secondary">
                    * Custos e markup calculados automaticamente com base nos Dados do Negócio.
                </div>

                <div className="flex justify-end">
                    <button className="btn btn-primary" onClick={onClose}>Fechar</button>
                </div>
            </div>
        </Modal>
    );
}
