import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { ProductWithCost, ProductCombo, BusinessSettings } from '../types';
import { Layers, Plus, Trash2, Save, Calculator, Search } from 'lucide-react';

export function Combos() {
    const [combos, setCombos] = useState<ProductWithCost[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCombo, setSelectedCombo] = useState<ProductWithCost | null>(null);
    const [comboItems, setComboItems] = useState<ProductCombo[]>([]);

    // For searching products to add
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<ProductWithCost[]>([]);
    const [showSearch, setShowSearch] = useState(false);

    // Business Settings for Pricing
    const [settings, setSettings] = useState<BusinessSettings | null>(null);

    // Form State
    const [comboName, setComboName] = useState('');
    const [comboPrice, setComboPrice] = useState(0);

    useEffect(() => {
        fetchCombos();
        fetchSettings();
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

    async function fetchSettings() {
        const { data } = await supabase.from('business_settings').select('*').single();
        setSettings(data);
    }

    async function fetchComboItems(comboId: number) {
        // We need to fetch the child product details (especially CMV/cost)
        // Since product_combos links to products, we can join with product_costs_view to get costs easily.
        // However, product_costs_view is a view, and joining a table (product_combos) with a view might need explicit query.

        // Let's fetch the combo items first
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

        // Now for each item, we want its cost. The 'child_product' relation gives simple product data.
        // We need the collected CMV from the view for accurate costing.
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
            .from('product_costs_view') // Search in view to get costs directly
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
                company_id: 1 // Default company
            };

            if (comboId) {
                await supabase.from('products').update(productData).eq('id', comboId);
            } else {
                const { data, error } = await supabase.from('products').insert(productData).select().single();
                if (error) throw error;
                comboId = data.id;
            }

            // 2. Sync Items
            // Delete existing
            await supabase.from('product_combos').delete().eq('parent_product_id', comboId);

            // Insert new
            const itemsToInsert = comboItems.map(item => ({
                parent_product_id: comboId,
                child_product_id: item.child_product_id,
                quantity: item.quantity,
                company_id: 1
            }));

            if (itemsToInsert.length > 0) {
                const { error: itemsError } = await supabase.from('product_combos').insert(itemsToInsert);
                if (itemsError) throw itemsError;
            }

            // Refresh
            fetchCombos();
            setSelectedCombo(null); // Return to list
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
                id: 0, // temp
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
    // const desiredProfit = settings?.desired_profit_percent || 15;
    const platformTax = settings?.platform_tax_rate || 18;
    // const taxRate = 0; // Assuming Simples or similar, user usually sets this in pricing modal, here we simplify or fetch fees?
    // Let's fetch fees sum for taxRate like in PricingModal


    /*
    useEffect(() => {
        async function getFees() {
            const { data } = await supabase.from('fees').select('percentage');
            const total = data?.reduce((acc, curr) => acc + curr.percentage, 0) || 0;
            setVariableRate(total);
        }
        getFees();
    }, []);
    */

    // Reverse calc: Price = Cost / (1 - (Margin + Taxes)/100) ? 
    // Or Markup? existing system uses Margin logic
    // Markup Multiplier often used: Price = Cost * 3 (approx 33% COGS)
    const suggestedPriceMarkup = totalCMV * 3;

    // const grossMarginPercent = comboPrice > 0
    //    ? ((comboPrice - totalCMV - (comboPrice * (variableRate / 100))) / comboPrice * 100)
    //    : 0;
    // Just remove it if unused or comment out properly.
    // The previous code had it. I will remove it.

    const discountValue = totalFullPrice - comboPrice;
    const discountPercent = totalFullPrice > 0 ? (discountValue / totalFullPrice) * 100 : 0;

    const ifoodPrice = comboPrice / (1 - (platformTax / 100)); // Price to net the same after iFood tax?
    // Usually: IfoodPrice - Taxes = NormalPrice
    // IfoodPrice * (1 - rate) = NormalPrice -> IfoodPrice = NormalPrice / (1 - rate)

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                    <Layers className="text-primary" />
                    Fichas Técnicas de Combos
                </h2>
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
                            className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedCombo?.id === combo.id
                                ? 'bg-primary/20 border-primary'
                                : 'bg-dark-800 border-dark-700 hover:border-slate-500'
                                }`}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-slate-200">{combo.name}</h3>
                                    <div className="text-sm text-slate-400 mt-1">
                                        Venda: <span className="text-emerald-400 font-bold">R$ {combo.sale_price.toFixed(2)}</span>
                                    </div>
                                </div>
                                <Trash2
                                    size={16}
                                    className="text-slate-600 hover:text-red-500 z-10"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCombo(combo.id);
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                    {combos.length === 0 && !loading && (
                        <div className="text-center text-slate-500 py-8">Nenhum combo cadastrado.</div>
                    )}
                </div>

                {/* EDITOR */}
                <div className="lg:col-span-2">
                    {selectedCombo ? (
                        <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 space-y-6">

                            {/* HEADER DO EDITOR */}
                            <div className="flex gap-4 border-b border-dark-700 pb-6">
                                <div className="flex-1">
                                    <label className="block text-sm text-slate-400 mb-1">Nome do Combo</label>
                                    <input
                                        className="input w-full"
                                        value={comboName}
                                        onChange={e => setComboName(e.target.value)}
                                        placeholder="Ex: Combo Kids"
                                    />
                                </div>
                                <div className="w-32">
                                    <label className="block text-sm text-emerald-500 mb-1 font-bold">Preço Venda</label>
                                    <input
                                        type="number"
                                        className="input w-full border-emerald-500/50 focus:border-emerald-500"
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
                                            className="btn btn-sm btn-outline flex gap-2"
                                            onClick={() => setShowSearch(!showSearch)}
                                        >
                                            <Plus size={16} /> Adicionar Produto
                                        </button>

                                        {showSearch && (
                                            <div className="absolute right-0 top-10 w-72 bg-dark-900 border border-dark-700 shadow-xl rounded-lg p-2 z-50">
                                                <div className="flex items-center gap-2 bg-dark-800 rounded px-2 border border-dark-700 mb-2">
                                                    <Search size={14} className="text-slate-400" />
                                                    <input
                                                        className="bg-transparent border-none text-sm py-2 ml-1 w-full focus:ring-0"
                                                        placeholder="Buscar produto..."
                                                        autoFocus
                                                        value={searchTerm}
                                                        onChange={e => {
                                                            setSearchTerm(e.target.value);
                                                            searchProducts(e.target.value);
                                                        }}
                                                    />
                                                </div>
                                                <div className="max-h-48 overflow-y-auto space-y-1">
                                                    {searchResults.map(p => (
                                                        <div
                                                            key={p.id}
                                                            className="text-sm p-2 hover:bg-dark-700 cursor-pointer rounded flex justify-between"
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

                                <table className="w-full text-sm">
                                    <thead className="bg-dark-900/50 text-slate-400">
                                        <tr>
                                            <th className="p-3 text-left rounded-l">Item</th>
                                            <th className="p-3 text-center">Qtd</th>
                                            <th className="p-3 text-right">Custo Unit</th>
                                            <th className="p-3 text-right">Preço Venda</th>
                                            <th className="p-3 text-center rounded-r">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-dark-700">
                                        {comboItems.map(item => {
                                            const cost = (item.child_product as any).cmv || (item.child_product as any).cost_price || 0;
                                            const price = item.child_product?.sale_price || 0;

                                            return (
                                                <tr key={item.child_product_id}>
                                                    <td className="p-3 font-medium">{item.child_product?.name}</td>
                                                    <td className="p-3 text-center">
                                                        <input
                                                            type="number"
                                                            className="w-16 bg-dark-900 border border-dark-700 rounded text-center"
                                                            value={item.quantity}
                                                            onChange={e => updateItemQty(item.child_product_id, Number(e.target.value))}
                                                        />
                                                    </td>
                                                    <td className="p-3 text-right text-amber-500">R$ {cost.toFixed(2)}</td>
                                                    <td className="p-3 text-right text-slate-300">R$ {price.toFixed(2)}</td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => removeItem(item.child_product_id)}
                                                            className="text-slate-500 hover:text-red-500"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {comboItems.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-slate-500 border-2 border-dashed border-dark-700 rounded">
                                                    Adicione itens ao combo para começar
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* RESUMO PRECIFICAÇÃO */}
                            <div className="bg-dark-900/50 rounded-lg p-4 border border-dark-700">
                                <h3 className="font-bold text-slate-200 mb-4 flex items-center gap-2">
                                    <Calculator className="text-secondary" size={18} />
                                    Resumo Precificação
                                </h3>

                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between py-2 border-b border-dark-700">
                                        <span className="text-slate-400">Custo dos Produtos (CMV)</span>
                                        <span className="font-bold text-amber-500">R$ {totalCMV.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-dark-700">
                                        <span className="text-slate-400">Preço Sugerido (Markup 3x)</span>
                                        <span className="font-bold text-slate-200">R$ {suggestedPriceMarkup.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-dark-700">
                                        <span className="text-slate-400">Preço Original (Soma Itens)</span>
                                        <span className="text-slate-300">R$ {totalFullPrice.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between py-2 border-b border-dark-700">
                                        <span className="text-slate-400">Desconto Aplicado</span>
                                        <span className="font-bold text-emerald-400">
                                            {discountPercent.toFixed(1)}% (R$ {discountValue.toFixed(2)})
                                        </span>
                                    </div>
                                    <div className="flex justify-between py-2 bg-emerald-500/10 px-2 rounded font-bold">
                                        <span className="text-emerald-400">Preço Sugerido iFood (com Taxa {platformTax}%)</span>
                                        <span className="text-emerald-400">R$ {ifoodPrice.toFixed(2)}</span>
                                    </div>
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
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-dark-700 rounded-lg bg-dark-800/50">
                            <Layers size={48} className="mb-4 opacity-50" />
                            <p>Selecione um combo ou crie um novo</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
