import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';

interface PricingModalProps {
    isOpen: boolean;
    onClose: () => void;
    productName: string;
    cmv: number;
    currentSalePrice: number;
    productSalesQty?: number;
}

export function PricingModal({ isOpen, onClose, productName, cmv, currentSalePrice, productSalesQty }: PricingModalProps) {
    const [salePrice, setSalePrice] = useState(currentSalePrice);
    const [taxRate, setTaxRate] = useState(0); // %
    const [fixedCostType, setFixedCostType] = useState<'percent' | 'value'>('percent');

    // For manual entry
    const [fixedCostInput, setFixedCostInput] = useState(0);

    // For "Advanced" Fixed Cost estimation
    const [totalMonthlyFixedCosts, setTotalMonthlyFixedCosts] = useState(0);
    const [estimatedMonthlySales, setEstimatedMonthlySales] = useState(productSalesQty || 1000); // Default or Real
    const [showAdvancedFixedCost, setShowAdvancedFixedCost] = useState(!!productSalesQty); // Auto-show if we have real data

    useEffect(() => {
        if (isOpen) {
            setSalePrice(currentSalePrice);
            fetchFixedCosts();
            fetchFees();
        }
    }, [isOpen, currentSalePrice]);

    async function fetchFixedCosts() {
        try {
            const { data, error } = await supabase.from('fixed_costs').select('monthly_value');
            if (error) throw error;
            const total = data?.reduce((acc, curr) => acc + curr.monthly_value, 0) || 0;
            setTotalMonthlyFixedCosts(total);
        } catch (err) {
            console.error('Error fetching fixed costs', err);
        }
    }

    async function fetchFees() {
        try {
            const { data, error } = await supabase.from('fees').select('percentage');
            if (error) throw error;
            const totalFees = data?.reduce((acc, curr) => acc + curr.percentage, 0) || 0;
            // Only set taxRate if it's currently 0 to allow manual override, 
            // but here we prefer to load the config first.
            setTaxRate(totalFees);
        } catch (err) {
            console.error('Error fetching fees', err);
        }
    }

    // Calculations
    const variableCostValue = salePrice * (taxRate / 100);

    let fixedCostValue = 0;
    let fixedCostPercent = 0;

    if (showAdvancedFixedCost) {
        // Calculate based on total monthly costs / quantity
        // This gives a per-unit cost
        fixedCostValue = estimatedMonthlySales > 0 ? totalMonthlyFixedCosts / estimatedMonthlySales : 0;
        fixedCostPercent = salePrice > 0 ? (fixedCostValue / salePrice) * 100 : 0;
    } else {
        // Manual input
        if (fixedCostType === 'percent') {
            fixedCostPercent = fixedCostInput;
            fixedCostValue = salePrice * (fixedCostInput / 100);
        } else {
            fixedCostValue = fixedCostInput;
            fixedCostPercent = salePrice > 0 ? (fixedCostInput / salePrice) * 100 : 0;
        }
    }

    const cmvPercent = salePrice > 0 ? (cmv / salePrice) * 100 : 0;

    const totalCosts = cmv + variableCostValue + fixedCostValue;
    const profit = salePrice - totalCosts;
    const profitPercent = salePrice > 0 ? (profit / salePrice) * 100 : 0;

    const suggestedPrice = cmv * 3; // Basic markup rule of thumb often used

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Resumo Precificação: ${productName}`} maxWidth="800px">
            <div className="flex flex-col gap-6">

                {/* Configuration Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-secondary/10 p-4 rounded-lg border border-color">
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
                    <div>
                        <label className="block text-sm text-secondary mb-1">Impostos / Taxas Variáveis (%)</label>
                        <input
                            type="number"
                            step="0.1"
                            className="w-full"
                            value={taxRate}
                            onChange={e => setTaxRate(Number(e.target.value))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-secondary mb-1 flex justify-between">
                            <span>Custos Fixos</span>
                            <button
                                className="text-xs text-accent-primary underline"
                                onClick={() => setShowAdvancedFixedCost(!showAdvancedFixedCost)}
                            >
                                {showAdvancedFixedCost ? 'Usar Manual' : 'Usar Auto'}
                            </button>
                        </label>

                        {showAdvancedFixedCost ? (
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-secondary">Total Fixo: R$ {totalMonthlyFixedCosts.toFixed(2)}</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        className="w-full text-sm"
                                        placeholder="Qtd Vendas/Mês"
                                        value={estimatedMonthlySales}
                                        onChange={e => setEstimatedMonthlySales(Number(e.target.value))}
                                        title="Quantidade estimada de vendas mensais para rateio"
                                    />
                                    <span className="text-xs whitespace-nowrap">vendas/mês</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <select
                                    className="w-24 px-1"
                                    value={fixedCostType}
                                    onChange={e => setFixedCostType(e.target.value as any)}
                                >
                                    <option value="percent">%</option>
                                    <option value="value">R$</option>
                                </select>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="w-full"
                                    value={fixedCostInput}
                                    onChange={e => setFixedCostInput(Number(e.target.value))}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary Table */}
                <div className="border border-color rounded-lg overflow-hidden">
                    <div className="bg-accent-primary p-2 font-bold text-center uppercase text-sm">Resumo da Precificação</div>
                    <div className="grid grid-cols-2 divide-x divide-color border-b border-color">

                        {/* Costs Column */}
                        <div className="p-0">
                            <div className="flex justify-between p-2 border-b border-color/50">
                                <span>Custo de Produtos (CMV) (R$)</span>
                                <span className="font-bold">R$ {cmv.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between p-2 border-b border-color/50">
                                <span>Custo de Produtos (CMV) (%)</span>
                                <span className="font-bold">{cmvPercent.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between p-2 border-b border-color/50">
                                <span>Custos Variáveis / Impostos (R$)</span>
                                <span>R$ {variableCostValue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between p-2 border-b border-color/50">
                                <span>Custo Fixo (R$) <span className="text-xs text-secondary">({fixedCostPercent.toFixed(1)}%)</span></span>
                                <span>R$ {fixedCostValue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between p-2 bg-secondary/20 font-bold">
                                <span>Custo Total Unitário</span>
                                <span>R$ {totalCosts.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Result Column */}
                        <div className="p-0">
                            <div className="flex justify-between p-2 border-b border-color/50 bg-yellow-500/10">
                                <span>Preço Atual de Venda</span>
                                <span className="font-bold text-lg">R$ {salePrice.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between p-2 border-b border-color/50">
                                <span>Lucro Estimado (R$)</span>
                                <span className={`font-bold ${profit > 0 ? 'text-success' : 'text-danger'}`}>
                                    R$ {profit.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between p-2 border-b border-color/50">
                                <span>Lucro (%)</span>
                                <span className={`font-bold ${profitPercent > 20 ? 'text-success' : profitPercent > 10 ? 'text-warning' : 'text-danger'}`}>
                                    {profitPercent.toFixed(2)}%
                                </span>
                            </div>
                            <div className="flex justify-between p-2 border-b border-color/50 text-secondary text-sm">
                                <span>Sugestão (CMV x 3)</span>
                                <span>R$ {suggestedPrice.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="text-center text-sm text-secondary">
                    * O Custo Fixo é calculado com base na estimativa de vendas ou percentual manual.
                </div>

                <div className="flex justify-end">
                    <button className="btn btn-primary" onClick={onClose}>Fechar</button>
                </div>
            </div>
        </Modal>
    );
}
