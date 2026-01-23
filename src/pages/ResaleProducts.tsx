/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { Save, DollarSign, Search, AlertCircle, TrendingUp, Filter, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Product, BusinessSettings } from '../types';
import { Modal } from '../components/ui/Modal';

export function ResaleProducts() {
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [settings, setSettings] = useState<BusinessSettings | null>(null);

    // Global Parameters
    const [fixedCostPercent, setFixedCostPercent] = useState(0);
    const [variableRateTotal, setVariableRateTotal] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemCost, setNewItemCost] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            setLoading(true);

            // 1. Fetch Business Settings & Costs
            const { data: settingsData } = await supabase.from('business_settings').select('*').single();
            const { data: costs } = await supabase.from('fixed_costs').select('monthly_value');
            const { data: fees } = await supabase.from('fees').select('percentage');

            let revenue = 33000;
            if (settingsData) {
                setSettings(settingsData);
                const totalRev = Object.values(settingsData.monthly_revenue).reduce((acc: any, val: any) => acc + Number(val), 0);
                revenue = Number(totalRev) / 12 || 33000;
            }

            const totalFixed = (costs || []).reduce((acc, curr) => acc + Number(curr.monthly_value), 0);
            const totalFees = (fees || []).reduce((acc, curr) => acc + Number(curr.percentage), 0);

            const fixedPercent = revenue > 0 ? (totalFixed / revenue) * 100 : 0;

            setFixedCostPercent(fixedPercent);
            setVariableRateTotal(totalFees);

            // 2. Fetch Products (Only 'Bebidas' or created here)
            // We'll filter by category 'Bebidas' to keep it separate.
            const { data: prods } = await supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .ilike('category', '%Bebidas%') // Filter for Bebidas
                .order('name');

            setProducts(prods || []);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    function handleLocalUpdate(id: number, field: 'cost_price' | 'sale_price', value: string) {
        // Update local state for real-time calculation
        // Allow empty string to become 0
        const numValue = value === '' ? 0 : parseFloat(value);
        if (isNaN(numValue)) return; // Invalid number

        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: numValue } : p));
    }

    async function handleSaveProduct(id: number, field: 'cost_price' | 'sale_price', value: number) {
        try {
            await supabase.from('products').update({ [field]: value }).eq('id', id);
        } catch (error) {
            console.error('Error updating product:', error);
            alert('Erro ao salvar alteração. Verifique sua conexão.');
        }
    }

    async function handleCreateItem(e: React.FormEvent) {
        e.preventDefault();
        try {
            const payload = {
                name: newItemName,
                category: 'Bebidas', // Enforce category
                cost_price: parseFloat(newItemCost) || 0,
                sale_price: parseFloat(newItemPrice) || 0,
                active: true
            };

            const { data, error } = await supabase.from('products').insert(payload).select().single();
            if (error) throw error;

            setProducts(prev => [...prev, data]);
            setIsModalOpen(false);
            setNewItemName('');
            setNewItemCost('');
            setNewItemPrice('');
            alert('Item adicionado com sucesso!');
        } catch (error) {
            console.error('Error creating item:', error);
            alert('Erro ao criar item. Verifique os dados.');
        }
    }

    // Calculations
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const platformTax = settings?.platform_tax_rate || 18;
    const desiredProfit = settings?.desired_profit_percent || 15;
    const totalBurdenPercent = fixedCostPercent + variableRateTotal + platformTax + desiredProfit;
    const itemMarkup = totalBurdenPercent < 100 ? (1 / (1 - (totalBurdenPercent / 100))) : 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                    <TrendingUp className="text-emerald-400" />
                    Precificação de Bebidas / Revenda
                </h2>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg w-full md:w-80">
                        <Search size={20} className="text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar bebida..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-transparent border-none outline-none text-slate-100 placeholder-slate-400 w-full focus:ring-0"
                        />
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg flex items-center gap-2 whitespace-nowrap"
                    >
                        <Plus size={20} /> Nova Bebida
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* Main Table Area */}
                <div className="lg:col-span-3 card bg-dark-800 border border-dark-700 rounded-lg overflow-hidden flex flex-col">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-dark-900 border-b border-dark-700 text-slate-400 uppercase text-xs">
                                    <th className="px-4 py-3 text-left sticky left-0 bg-dark-900 z-10 w-48">Item</th>
                                    <th className="px-2 py-3 text-right text-emerald-400 bg-emerald-900/10">Val. Compra</th>
                                    <th className="px-2 py-3 text-right">Fixos %</th>
                                    <th className="px-2 py-3 text-right">Var %</th>
                                    <th className="px-2 py-3 text-right">CMV %</th>
                                    <th className="px-2 py-3 text-right font-bold text-emerald-400">Lucro R$</th>
                                    <th className="px-2 py-3 text-right font-bold">Lucro %</th>
                                    <th className="px-2 py-3 text-right font-bold">Lucro %</th>
                                    <th className="px-2 py-3 text-right text-slate-400 border-l border-dark-700">Preço Médio</th>
                                    <th className="px-2 py-3 text-right text-blue-400 bg-blue-900/10 border-l border-dark-700">Preço Tabela</th>
                                    <th className="px-2 py-3 text-right text-amber-400 bg-amber-900/10 border-l border-dark-700">Ideal iFood</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-700">
                                {filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                                            Nenhuma bebida encontrada. Clique em "Nova Bebida" para cadastrar.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProducts.map(product => {
                                        const cost = product.cost_price || 0;
                                        const price = product.sale_price || 0;

                                        // Calculations
                                        const cmvPercent = price > 0 ? (cost / price) * 100 : 0;

                                        const fixedVal = price * (fixedCostPercent / 100);
                                        const varVal = price * (variableRateTotal / 100);
                                        const taxVal = price * (platformTax / 100);
                                        const totalDeductions = cost + fixedVal + varVal + taxVal;
                                        const profitVal = price - totalDeductions;
                                        const profitPercent = price > 0 ? (profitVal / price) * 100 : 0;

                                        const idealPrice = itemMarkup > 0 ? cost * itemMarkup : 0;

                                        return (
                                            <tr key={product.id} className="hover:bg-dark-700/30 transition-colors">
                                                <td className="px-4 py-3 font-medium text-slate-100 sticky left-0 bg-dark-800">{product.name}</td>

                                                {/* Input Cost */}
                                                <td className="px-2 py-3 text-right bg-emerald-900/5">
                                                    <input
                                                        type="number" step="0.01"
                                                        value={cost || ''}
                                                        onChange={e => handleLocalUpdate(product.id, 'cost_price', e.target.value)}
                                                        onBlur={e => handleSaveProduct(product.id, 'cost_price', parseFloat(e.target.value) || 0)}
                                                        className="w-20 text-right bg-dark-700 border border-dark-600 rounded px-1 text-emerald-400 focus:border-emerald-500 focus:outline-none"
                                                    />
                                                </td>

                                                <td className="px-2 py-3 text-right text-slate-400">{fixedCostPercent.toFixed(2)}</td>
                                                <td className="px-2 py-3 text-right text-slate-400">{variableRateTotal.toFixed(2)}</td>
                                                <td className="px-2 py-3 text-right text-slate-300">{cmvPercent.toFixed(1)}%</td>

                                                <td className={`px-2 py-3 text-right font-bold ${profitVal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    R$ {profitVal.toFixed(2)}
                                                </td>
                                                <td className={`px-2 py-3 text-right font-bold ${profitPercent >= settings?.desired_profit_percent! ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {profitPercent.toFixed(1)}%
                                                </td>

                                                <td className={`px-2 py-3 text-right font-bold ${profitPercent >= settings?.desired_profit_percent! ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {profitPercent.toFixed(1)}%
                                                </td>

                                                {/* Avg Price from Import */}
                                                <td className="px-2 py-3 text-right text-slate-400 border-l border-dark-700 text-xs">
                                                    {product.average_sale_price ? `R$ ${product.average_sale_price.toFixed(2)}` : '-'}
                                                </td>

                                                {/* Input Price (Table Price) */}
                                                <td className="px-2 py-3 text-right border-l border-dark-700 bg-blue-900/5">
                                                    <input
                                                        type="number" step="0.01"
                                                        value={price || ''}
                                                        onChange={e => handleLocalUpdate(product.id, 'sale_price', e.target.value)}
                                                        onBlur={e => handleSaveProduct(product.id, 'sale_price', parseFloat(e.target.value) || 0)}
                                                        className="w-20 text-right bg-dark-700 border border-dark-600 rounded px-1 text-blue-400 focus:border-blue-500 focus:outline-none"
                                                    />
                                                </td>

                                                <td className="px-2 py-3 text-right text-amber-400 border-l border-dark-700 bg-amber-900/5 font-bold">
                                                    {idealPrice > 0 ? `R$ ${idealPrice.toFixed(2)}` : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Panel Summary */}
                <div className="space-y-6">
                    <div className="card bg-dark-800 border border-dark-700 rounded-lg p-6">
                        <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
                            <DollarSign className="text-amber-400" size={20} />
                            Resumo de Custos Global
                        </h3>
                        {/* Summary Details */}
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between border-b border-dark-700 pb-2">
                                <span className="text-slate-400">Custos Fixos (%)</span>
                                <span className="text-slate-100">{fixedCostPercent.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between border-b border-dark-700 pb-2">
                                <span className="text-slate-400">Custos Variáveis (%)</span>
                                <span className="text-slate-100">{variableRateTotal.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between border-b border-dark-700 pb-2">
                                <span className="text-slate-400">Taxa Plataforma (%)</span>
                                <span className="text-slate-100">{platformTax.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between border-b border-dark-700 pb-2">
                                <span className="text-slate-400">Lucro Desejado (%)</span>
                                <span className="text-emerald-400 font-bold">{desiredProfit.toFixed(2)}%</span>
                            </div>
                            <div className="pt-2">
                                <div className="text-xs text-slate-500 uppercase mb-1">Markup Sugerido</div>
                                <div className="text-3xl font-bold text-white">{itemMarkup.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="card bg-dark-800 border border-dark-700 rounded-lg p-6">
                        <div className="flex items-start gap-2 text-slate-400 text-sm">
                            <AlertCircle size={16} className="mt-0.5" />
                            <p>
                                Para ajustar as taxas globais e custos fixos, utilize o menu
                                <strong className="text-white"> Dados</strong>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* New Drink Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Novo Item de Venda (Bebida/Revenda)"
            >
                <form onSubmit={handleCreateItem} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Nome do Item</label>
                        <input
                            type="text" required
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                            className="input w-full bg-dark-700 border border-dark-600 rounded p-2 text-white"
                            placeholder="Ex: Coca-Cola 350ml"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-emerald-400 mb-1">Preço de Custo (Compra)</label>
                            <input
                                type="number" step="0.01" required
                                value={newItemCost}
                                onChange={e => setNewItemCost(e.target.value)}
                                className="input w-full bg-dark-700 border border-dark-600 rounded p-2 text-white"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-blue-400 mb-1">Preço de Venda</label>
                            <input
                                type="number" step="0.01" required
                                value={newItemPrice}
                                onChange={e => setNewItemPrice(e.target.value)}
                                className="input w-full bg-dark-700 border border-dark-600 rounded p-2 text-white"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                    <div className="modal-footer pt-4 flex justify-end gap-2">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 hover:bg-dark-700 rounded text-slate-300">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark">Salvar Bebida</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
