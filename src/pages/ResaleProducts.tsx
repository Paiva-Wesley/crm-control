import { useEffect, useState } from 'react';
import { DollarSign, Search, AlertCircle, TrendingUp, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Product } from '../types';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { computeIdealMenuPrice, computeAllChannelPrices } from '../lib/pricing';

export function ResaleProducts() {
    const { companyId } = useAuth();
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [productCosts, setProductCosts] = useState<Record<number, number>>({});
    const biz = useBusinessSettings();

    // UI
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

            // Fetch Products (Beverages)
            const { data: prods } = await supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .eq('company_id', companyId)
                .ilike('category', '%Bebidas%')
                .order('name');

            setProducts(prods || []);

            // 3. Fetch Costs
            if (prods && prods.length > 0) {
                const ids = prods.map(p => p.id);
                const { data: costsData } = await supabase
                    .from('product_costs') // View name
                    .select('id, cmv')
                    .in('id', ids);

                const costMap: Record<number, number> = {};
                costsData?.forEach((c: any) => {
                    costMap[c.id] = c.cmv;
                });
                setProductCosts(costMap);
            }

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }

    function handleLocalUpdate(id: number, field: 'cost_price' | 'sale_price', value: string) {
        // Only updates local display state temporarily
        const numValue = value === '' ? 0 : parseFloat(value);
        if (isNaN(numValue)) return;

        if (field === 'sale_price') {
            setProducts(prev => prev.map(p => p.id === id ? { ...p, sale_price: numValue } : p));
        } else {
            setProductCosts(prev => ({ ...prev, [id]: numValue }));
        }
    }

    async function handleSaveProduct(id: number, field: 'cost_price' | 'sale_price', value: number) {
        try {
            if (field === 'sale_price') {
                await supabase.from('products').update({ sale_price: value }).eq('id', id);
            } else {
                // Update Cost = Update Ingredient
                // Find Ingredient linked to this product (assuming 1:1 for Bebidas)
                const { data: links } = await supabase
                    .from('product_ingredients')
                    .select('ingredient_id')
                    .eq('product_id', id)
                    .single();

                if (links) {
                    await supabase.from('ingredients').update({ cost_per_unit: value }).eq('id', links.ingredient_id);
                } else {
                    // Create ingredient if missing (Fallback/Lazy Fix)
                    const product = products.find(p => p.id === id);
                    if (product) {
                        const { data: ing } = await supabase.from('ingredients').insert({
                            name: product.name,
                            unit: 'un',
                            cost_per_unit: value,
                            category: 'Insumo',
                            company_id: companyId
                        }).select().single();

                        if (ing) {
                            await supabase.from('product_ingredients').insert({
                                product_id: id,
                                ingredient_id: ing.id,
                                quantity: 1,
                                company_id: companyId
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error updating product:', error);
            alert('Erro ao salvar alteração.');
        }
    }

    async function handleCreateItem(e: React.FormEvent) {
        e.preventDefault();
        try {
            const cost = parseFloat(newItemCost) || 0;
            const price = parseFloat(newItemPrice) || 0;

            // 1. Create Ingredient first
            const { data: ing, error: ingError } = await supabase.from('ingredients').insert({
                name: newItemName,
                unit: 'un',
                cost_per_unit: cost,
                category: 'Insumo', // Start as Insumo
                company_id: companyId
            }).select().single();

            if (ingError) throw ingError;

            // 2. Create Product
            const { data: prod, error: prodError } = await supabase.from('products').insert({
                name: newItemName,
                category: 'Bebidas',
                sale_price: price,
                active: true,
                company_id: companyId
            }).select().single();

            if (prodError) throw prodError;

            // 3. Link
            await supabase.from('product_ingredients').insert({
                product_id: prod.id,
                ingredient_id: ing.id,
                quantity: 1,
                company_id: companyId
            });

            // Update UI
            setProducts(prev => [...prev, prod]);
            setProductCosts(prev => ({ ...prev, [prod.id]: cost }));

            setIsModalOpen(false);
            setNewItemName('');
            setNewItemCost('');
            setNewItemPrice('');
            alert('Item adicionado com sucesso!');
        } catch (error) {
            console.error('Error creating item:', error);
            alert('Erro ao criar item.');
        }
    }

    // Calculations
    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Markup from pricing engine (no platformTax baked in)
    const itemMarkup = biz.markup;

    if (loading) return <div className="p-8 text-center text-slate-400">Carregando...</div>;

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
                                    <th className="px-2 py-3 text-right text-slate-400 border-l border-dark-700">Preço Médio</th>
                                    <th className="px-2 py-3 text-right text-blue-400 bg-blue-900/10 border-l border-dark-700">Preço Tabela</th>
                                    <th className="px-2 py-3 text-right text-emerald-400 bg-emerald-900/10 border-l border-dark-700">Ideal Cardápio</th>
                                    {biz.channels.map(ch => (
                                        <th key={ch.id} className="px-2 py-3 text-right text-amber-400 bg-amber-900/10 border-l border-dark-700 text-xs">Ideal {ch.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-700">
                                {filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                                            Nenhuma bebida encontrada. Clique em "Nova Bebida" para cadastrar.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProducts.map(product => {
                                        const cost = productCosts[product.id] || 0;
                                        const price = product.sale_price || 0;

                                        // Calculations
                                        const cmvPercent = price > 0 ? (cost / price) * 100 : 0;

                                        const fixedVal = price * (biz.fixedCostPercent / 100);
                                        const varVal = price * (biz.variableCostPercent / 100);
                                        const totalDeductions = cost + fixedVal + varVal;
                                        const profitVal = price - totalDeductions;
                                        const profitPercent = price > 0 ? (profitVal / price) * 100 : 0;

                                        const idealPrice = computeIdealMenuPrice(cost, itemMarkup);
                                        const channelIdealPrices = computeAllChannelPrices(idealPrice, biz.channels);

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

                                                <td className="px-2 py-3 text-right text-slate-400">{biz.fixedCostPercent.toFixed(2)}</td>
                                                <td className="px-2 py-3 text-right text-slate-400">{biz.variableCostPercent.toFixed(2)}</td>
                                                <td className="px-2 py-3 text-right text-slate-300">{cmvPercent.toFixed(1)}%</td>

                                                <td className={`px-2 py-3 text-right font-bold ${profitVal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    R$ {profitVal.toFixed(2)}
                                                </td>
                                                <td className={`px-2 py-3 text-right font-bold ${profitPercent >= biz.desiredProfitPercent ? 'text-emerald-400' : profitPercent >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                                    {profitPercent.toFixed(1)}%
                                                </td>

                                                {/* Avg Price removed as column removed from DB, or we can keep it purely optional if we have a way to inject it, but safer to skip or show placeholder */}
                                                <td className="px-2 py-3 text-right text-slate-400 border-l border-dark-700 text-xs">
                                                    -
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

                                                <td className="px-2 py-3 text-right text-emerald-400 border-l border-dark-700 bg-emerald-900/5 font-bold">
                                                    {idealPrice > 0 ? `R$ ${idealPrice.toFixed(2)}` : '-'}
                                                </td>
                                                {channelIdealPrices.map(cp => (
                                                    <td key={cp.channelId} className="px-2 py-3 text-right text-amber-400 border-l border-dark-700 bg-amber-900/5 font-bold">
                                                        {cp.idealPrice > 0 ? `R$ ${cp.idealPrice.toFixed(2)}` : '-'}
                                                    </td>
                                                ))}
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
                                <span className="text-slate-100">{biz.fixedCostPercent.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between border-b border-dark-700 pb-2">
                                <span className="text-slate-400">Custos Variáveis (%)</span>
                                <span className="text-slate-100">{biz.variableCostPercent.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between border-b border-dark-700 pb-2">
                                <span className="text-slate-400">Lucro Desejado (%)</span>
                                <span className="text-emerald-400 font-bold">{biz.desiredProfitPercent.toFixed(2)}%</span>
                            </div>
                            <div className="pt-2">
                                <div className="text-xs text-slate-500 uppercase mb-1">Markup Calculado</div>
                                <div className="text-3xl font-bold text-white">{itemMarkup.toFixed(2)}x</div>
                            </div>
                            {biz.channels.length > 0 && (
                                <div className="pt-2 border-t border-dark-700 mt-2">
                                    <div className="text-xs text-blue-400 uppercase mb-2">Taxas por Canal</div>
                                    {biz.channels.map(ch => (
                                        <div key={ch.id} className="flex justify-between text-xs">
                                            <span className="text-slate-400">{ch.name}</span>
                                            <span className="text-blue-400">{ch.totalTaxRate.toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}
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

            {/* New Drink Modal (Same as before) */}
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
