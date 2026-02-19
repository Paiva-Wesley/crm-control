import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { ProductWithCost, ProductCombo } from '../types';
import { Layers, Plus, Trash2, Save, Calculator, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { computeIdealMenuPrice, computeAllChannelPrices } from '../lib/pricing';

export function Combos() {
    const { companyId } = useAuth();
    const [combos, setCombos] = useState<ProductWithCost[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCombo, setSelectedCombo] = useState<ProductWithCost | null>(null);
    const [comboItems, setComboItems] = useState<ProductCombo[]>([]);

    // For searching products to add
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<ProductWithCost[]>([]);
    const [showSearch, setShowSearch] = useState(false);

    // Business Settings via pricing engine
    const biz = useBusinessSettings();

    // Form State
    const [comboName, setComboName] = useState('');
    const [comboPrice, setComboPrice] = useState(0);

    useEffect(() => {
        fetchCombos();
    }, []);

    useEffect(() => {
        if (selectedCombo) {
            setComboName(selectedCombo.name);
            setComboPrice(selectedCombo.sale_price);
            fetchComboItems(selectedCombo.id);
        } else {
            setComboName('');
            setComboPrice(0);
            setComboItems([]);
        }
    }, [selectedCombo]);

    // --- Data Fetching ---

    async function fetchCombos() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('product_costs_view')
                .select('*')
                .eq('is_combo', true)
                .order('name');

            if (error) throw error;
            setCombos(data || []);
        } catch (err) {
            console.error('Error fetching combos:', err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchComboItems(comboId: number) {
        const { data: items, error } = await supabase
            .from('product_combos')
            .select(`
                *,
                child_product:products!child_product_id (*)
            `)
            .eq('parent_product_id', comboId);

        if (error) {
            console.error('Error fetching combo items:', error);
            return;
        }

        const { data: costs } = await supabase.from('product_costs_view').select('id, cmv');
        const costMap = new Map(costs?.map(c => [c.id, c]) || []);

        const itemsWithCost = items?.map(item => {
            const costData = costMap.get(item.child_product_id);
            return {
                ...item,
                child_product: {
                    ...item.child_product,
                    cmv: costData?.cmv || 0
                }
            };
        });

        setComboItems(itemsWithCost || []);
    }

    async function searchProducts(term: string) {
        if (!term) {
            setSearchResults([]);
            return;
        }

        const { data } = await supabase
            .from('product_costs_view')
            .select('*')
            .ilike('name', `%${term}%`)
            .eq('is_combo', false)
            .limit(10);

        setSearchResults(data || []);
    }

    // --- Actions ---

    async function handleSaveCombo() {
        try {
            let comboId = selectedCombo?.id;

            // 1. Create/Update Product
            const productData = {
                name: comboName,
                sale_price: comboPrice,
                category: 'Combo',
                active: true,
                is_combo: true,
                company_id: companyId
            };

            if (comboId) {
                await supabase.from('products').update(productData).eq('id', comboId);
            } else {
                const { data, error } = await supabase.from('products').insert(productData).select().single();
                if (error) throw error;
                comboId = data.id;
            }

            // 2. Sync Items
            await supabase.from('product_combos').delete().eq('parent_product_id', comboId);

            const itemsToInsert = comboItems.map(item => ({
                parent_product_id: comboId,
                child_product_id: item.child_product_id,
                quantity: item.quantity,
                company_id: companyId
            }));

            if (itemsToInsert.length > 0) {
                const { error: itemsError } = await supabase.from('product_combos').insert(itemsToInsert);
                if (itemsError) throw itemsError;
            }

            fetchCombos();
            setSelectedCombo(null);
            alert('Combo salvo com sucesso!');

        } catch (err) {
            console.error("Error saving combo:", err);
            alert("Erro ao salvar combo.");
        }
    }

    async function handleDeleteCombo(id: number) {
        if (!confirm('Tem certeza que deseja excluir este combo?')) return;
        await supabase.from('products').delete().eq('id', id);
        fetchCombos();
        if (selectedCombo?.id === id) setSelectedCombo(null);
    }

    // --- State Handlers ---

    function addItem(product: ProductWithCost) {
        const existing = comboItems.find(i => i.child_product_id === product.id);
        if (existing) {
            setComboItems(items => items.map(i =>
                i.child_product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
            ));
        } else {
            setComboItems(items => [...items, {
                id: 0,
                parent_product_id: selectedCombo?.id || 0,
                child_product_id: product.id,
                quantity: 1,
                child_product: product
            } as any]);
        }
        setSearchTerm('');
        setShowSearch(false);
    }

    function removeItem(childId: number) {
        setComboItems(items => items.filter(i => i.child_product_id !== childId));
    }

    function updateItemQty(childId: number, qty: number) {
        if (qty <= 0) {
            removeItem(childId);
            return;
        }
        setComboItems(items => items.map(i =>
            i.child_product_id === childId ? { ...i, quantity: qty } : i
        ));
    }

    // --- Calculations ---

    const totalCMV = comboItems.reduce((acc, item) => {
        const unitCost = (item.child_product as any).cmv || 0;
        return acc + (unitCost * item.quantity);
    }, 0);

    const totalFullPrice = comboItems.reduce((acc, item) => {
        return acc + ((item.child_product?.sale_price || 0) * item.quantity);
    }, 0);

    // Pricing Logic
    const suggestedPriceMarkup = computeIdealMenuPrice(totalCMV, biz.markup);
    const channelPrices = computeAllChannelPrices(comboPrice > 0 ? comboPrice : suggestedPriceMarkup, biz.channels);

    const discountValue = totalFullPrice - comboPrice;
    const discountPercent = totalFullPrice > 0 ? (discountValue / totalFullPrice) * 100 : 0;

    return (
        <div className="space-y-6 fade-in">
            <div className="page-header">
                <div>
                    <h2 className="page-title flex items-center gap-2">
                        <Layers className="text-primary" />
                        Fichas Técnicas de Combos
                    </h2>
                    <p className="page-subtitle">Crie combinações de produtos e defina preços promocionais</p>
                </div>
                <button
                    onClick={() => {
                        setSelectedCombo({ id: 0, name: 'Novo Combo', sale_price: 0 } as any);
                        setComboItems([]);
                    }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus size={20} />
                    Novo Combo
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LISTA DE COMBOS */}
                <div className="lg:col-span-1 space-y-4">
                    {combos.map(combo => (
                        <div
                            key={combo.id}
                            onClick={() => setSelectedCombo(combo)}
                            className={`glass-card p-4 cursor-pointer transition-all hover:border-slate-500 ${selectedCombo?.id === combo.id
                                ? 'ring-2 ring-primary border-transparent bg-slate-800/80'
                                : ''
                                }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-slate-200">{combo.name}</h3>
                                    <div className="text-sm text-slate-400 mt-1">
                                        Venda: <span className="text-emerald-400 font-bold">R$ {combo.sale_price.toFixed(2)}</span>
                                    </div>
                                </div>
                                <button
                                    className="text-slate-600 hover:text-red-500 z-10 p-1 rounded hover:bg-slate-700/50 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCombo(combo.id);
                                    }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {combos.length === 0 && !loading && (
                        <div className="text-center text-slate-500 py-8 glass-card">Nenhum combo cadastrado.</div>
                    )}
                </div>

                {/* EDITOR */}
                <div className="lg:col-span-2">
                    {selectedCombo ? (
                        <div className="glass-card p-6 space-y-6">

                            {/* HEADER DO EDITOR */}
                            <div className="flex gap-4 border-b border-slate-700/50 pb-6">
                                <div className="flex-1">
                                    <label className="block text-sm text-slate-400 mb-1">Nome do Combo</label>
                                    <input
                                        className="input w-full bg-slate-900/50 border-slate-700 focus:border-primary"
                                        value={comboName}
                                        onChange={e => setComboName(e.target.value)}
                                        placeholder="Ex: Combo Kids"
                                    />
                                </div>
                                <div className="w-32">
                                    <label className="block text-sm text-emerald-500 mb-1 font-bold">Preço Venda</label>
                                    <input
                                        type="number"
                                        className="input w-full bg-slate-900/50 border-emerald-500/30 focus:border-emerald-500 text-emerald-400 font-bold"
                                        value={comboPrice}
                                        onChange={e => setComboPrice(Number(e.target.value))}
                                    />
                                </div>
                            </div>

                            {/* ITENS */}
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-200">Itens do Combo</h3>
                                    <div className="relative">
                                        <button
                                            className="btn btn-sm btn-secondary flex gap-2"
                                            onClick={() => setShowSearch(!showSearch)}
                                        >
                                            <Plus size={16} /> Adicionar Produto
                                        </button>

                                        {showSearch && (
                                            <div className="absolute right-0 top-10 w-72 bg-slate-800 border border-slate-700 shadow-xl rounded-lg p-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                <div className="flex items-center gap-2 bg-slate-900/50 rounded px-2 border border-slate-700 mb-2">
                                                    <Search size={14} className="text-slate-400" />
                                                    <input
                                                        className="bg-transparent border-none text-sm py-2 ml-1 w-full focus:ring-0 text-slate-200 placeholder:text-slate-500"
                                                        placeholder="Buscar produto..."
                                                        autoFocus
                                                        value={searchTerm}
                                                        onChange={e => {
                                                            setSearchTerm(e.target.value);
                                                            searchProducts(e.target.value);
                                                        }}
                                                    />
                                                </div>
                                                <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                                                    {searchResults.map(p => (
                                                        <div
                                                            key={p.id}
                                                            className="text-sm p-2 hover:bg-slate-700 cursor-pointer rounded flex justify-between text-slate-300"
                                                            onClick={() => addItem(p)}
                                                        >
                                                            <span>{p.name}</span>
                                                            <span className="text-emerald-500 font-bold">R$ {p.sale_price}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="overflow-hidden rounded-lg border border-slate-700/50">
                                    <table className="data-table text-sm">
                                        <thead>
                                            <tr>
                                                <th className="pl-4">Item</th>
                                                <th className="text-center">Qtd</th>
                                                <th className="text-right">Custo Unit</th>
                                                <th className="text-right">Preço Venda</th>
                                                <th className="text-center pr-4">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {comboItems.map(item => {
                                                const cost = (item.child_product as any).cmv || (item.child_product as any).cost_price || 0;
                                                const price = item.child_product?.sale_price || 0;

                                                return (
                                                    <tr key={item.child_product_id} className="hover:bg-slate-700/20">
                                                        <td className="pl-4 font-medium text-slate-200">{item.child_product?.name}</td>
                                                        <td className="text-center">
                                                            <input
                                                                type="number"
                                                                className="w-16 bg-slate-900/50 border border-slate-700 rounded text-center py-1 text-slate-200 focus:border-primary focus:ring-1 focus:ring-primary"
                                                                value={item.quantity}
                                                                onChange={e => updateItemQty(item.child_product_id, Number(e.target.value))}
                                                            />
                                                        </td>
                                                        <td className="text-right text-amber-500">R$ {cost.toFixed(2)}</td>
                                                        <td className="text-right text-slate-300">R$ {price.toFixed(2)}</td>
                                                        <td className="text-center pr-4">
                                                            <button
                                                                onClick={() => removeItem(item.child_product_id)}
                                                                className="text-slate-500 hover:text-red-500 transition-colors"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {comboItems.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="p-8 text-center text-slate-500">
                                                        Adicione itens ao combo para começar
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* RESUMO PRECIFICAÇÃO */}
                            <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-700/50">
                                <h3 className="font-bold text-slate-200 mb-4 flex items-center gap-2">
                                    <Calculator className="text-secondary" size={18} />
                                    Resumo Precificação
                                </h3>

                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between py-2 border-b border-slate-700/50">
                                        <span className="text-slate-400">Custo dos Produtos (CMV)</span>
                                        <span className="font-bold text-amber-500">R$ {totalCMV.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-slate-700/50">
                                        <span className="text-slate-400">Preço Sugerido (Markup {biz.markup > 0 ? biz.markup.toFixed(2) + 'x' : 'N/A'})</span>
                                        <span className="font-bold text-slate-200">R$ {suggestedPriceMarkup.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-slate-700/50">
                                        <span className="text-slate-400">Preço Original (Soma Itens)</span>
                                        <span className="text-slate-300">R$ {totalFullPrice.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-slate-700/50">
                                        <span className="text-slate-400">Desconto Aplicado</span>
                                        <span className="font-bold text-emerald-400">
                                            {discountPercent.toFixed(1)}% (R$ {discountValue.toFixed(2)})
                                        </span>
                                    </div>
                                    {channelPrices.length > 0 && (
                                        <>
                                            <div className="text-xs text-blue-400 font-medium pt-2">Preço por Canal de Venda:</div>
                                            {channelPrices.map(cp => (
                                                <div key={cp.channelId} className="flex justify-between py-1.5 px-3 bg-blue-500/5 rounded border border-blue-500/10 mb-1 last:mb-0">
                                                    <span className="text-slate-400">{cp.channelName} <span className="text-xs text-slate-500">({cp.totalTaxRate.toFixed(1)}%)</span></span>
                                                    <span className="font-bold text-blue-400">R$ {cp.idealPrice.toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* FOOTER ACTIONS */}
                            <div className="flex justify-end pt-4">
                                <button onClick={handleSaveCombo} className="btn btn-primary flex gap-2 items-center">
                                    <Save size={18} />
                                    Salvar Combo
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-700/50 rounded-xl bg-slate-800/20 p-12 glass-card">
                            <Layers size={48} className="mb-4 opacity-30" />
                            <p className="text-lg font-medium">Selecione um combo ou crie um novo</p>
                            <p className="text-sm opacity-60">Gerencie seus combos e promoções aqui</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
