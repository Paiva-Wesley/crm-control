
import { useEffect, useState } from 'react';
import { Trash2, Plus, Calculator, Utensils, Archive, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Ingredient, ProductIngredient } from '../../types';
import { PricingModal } from './PricingModal';

interface RecipeEditorProps {
    productId: number;
    productName?: string;
    salePrice?: number;
    productSalesQty?: number;
}

export function RecipeEditor({ productId, productName, salePrice, productSalesQty }: RecipeEditorProps) {
    const [items, setItems] = useState<ProductIngredient[]>([]);
    const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
    const [showPricing, setShowPricing] = useState(false);

    // UI State
    const [activeCategory, setActiveCategory] = useState<'Insumo' | 'Embalagem' | 'Acompanhamento'>('Insumo');


    // New item state
    const [selectedIngId, setSelectedIngId] = useState<string>('');
    const [quantity, setQuantity] = useState<string>('');
    const [usageUnit, setUsageUnit] = useState<string>('');

    useEffect(() => {
        loadData();
    }, [productId]);

    // Update usage unit when ingredient changes
    useEffect(() => {
        if (selectedIngId) {
            const ing = allIngredients.find(i => i.id === parseInt(selectedIngId));
            if (ing) setUsageUnit(ing.unit);
        } else {
            setUsageUnit('');
        }
    }, [selectedIngId, allIngredients]);

    async function loadData() {
        try {
            const [ingredientsRes, recipeRes] = await Promise.all([
                supabase.from('ingredients').select('*').order('name'),
                supabase.from('product_ingredients').select('*, ingredient:ingredients(*)').eq('product_id', productId)
            ]);

            if (ingredientsRes.error) throw ingredientsRes.error;
            if (recipeRes.error) throw recipeRes.error;

            setAllIngredients(ingredientsRes.data || []);
            setItems(recipeRes.data || []);
        } catch (error) {
            console.error('Error loading recipe:', error);
        }
    }

    // Helper to get available units based on base unit
    function getAvailableUnits(baseUnit: string) {
        if (baseUnit === 'kg') return ['kg', 'g'];
        if (baseUnit === 'l') return ['l', 'ml'];
        return [baseUnit];
    }

    // Convert to base unit for database storage
    function convertToBaseUnit(qty: number, fromUnit: string, toBaseUnit: string): number {
        if (fromUnit === 'g' && toBaseUnit === 'kg') return qty / 1000;
        if (fromUnit === 'ml' && toBaseUnit === 'l') return qty / 1000;
        return qty;
    }

    async function handleAdd() {
        if (!selectedIngId || !quantity) return;

        const ing = allIngredients.find(i => i.id === parseInt(selectedIngId));
        if (!ing) return;

        const baseQty = convertToBaseUnit(parseFloat(quantity), usageUnit, ing.unit);

        try {
            const { error } = await supabase.from('product_ingredients').insert({
                product_id: productId,
                ingredient_id: parseInt(selectedIngId),
                quantity: baseQty
            });

            if (error) throw error;

            setSelectedIngId('');
            setQuantity('');
            // usageUnit resets automatically via useEffect
            loadData();
        } catch (error) {
            console.error('Error adding ingredient:', error);
            alert('Erro ao adicionar ingrediente');
        }
    }

    async function handleRemove(id: number) {
        try {
            const { error } = await supabase.from('product_ingredients').delete().eq('id', id);
            if (error) throw error;
            loadData();
        } catch (error) {
            console.error('Error removing ingredient:', error);
        }
    }

    const currentCost = items.reduce((acc, item) => {
        return acc + (item.quantity * (item.ingredient?.cost_per_unit || 0));
    }, 0);

    // Calculate preview cost for new item
    const selectedIngredient = allIngredients.find(i => i.id === parseInt(selectedIngId));
    let previewCost = 0;
    if (selectedIngredient && quantity) {
        const baseQty = convertToBaseUnit(parseFloat(quantity), usageUnit, selectedIngredient.unit);
        previewCost = baseQty * selectedIngredient.cost_per_unit;
    }

    return (
        <div className="mt-4">
            <h4 className="font-bold mb-2">Ficha Técnica</h4>

            <div className="card bg-secondary p-4 mb-4" style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}>
                <div className="flex gap-2 items-end mb-4">
                    <div className="flex-grow flex flex-col gap-2 min-w-0">
                        <div className="flex gap-2">
                            {[
                                { id: 'Insumo', label: 'Insumos', icon: Utensils },
                                { id: 'Embalagem', label: 'Embalagens', icon: Archive },
                                { id: 'Acompanhamento', label: 'Acomp.', icon: Package },
                            ].map(tab => {
                                const Icon = tab.icon;
                                const isActive = activeCategory === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveCategory(tab.id as any)}
                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${isActive
                                            ? 'bg-primary text-white'
                                            : 'bg-dark-700 text-slate-400 hover:bg-dark-600 hover:text-white'
                                            }`}
                                    >
                                        <Icon size={14} />
                                        <span className="hidden sm:inline">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <label className="text-xs text-slate-400 font-medium">Item ({activeCategory})</label>
                        <select
                            value={selectedIngId}
                            onChange={e => setSelectedIngId(e.target.value)}
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-slate-100 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition duration-200"
                        >
                            <option value="">Selecione...</option>
                            {allIngredients
                                .filter(ing => (ing.category || 'Insumo') === activeCategory)
                                .map(ing => (
                                    <option key={ing.id} value={ing.id} className="bg-dark-800 text-slate-100">
                                        {ing.name} ({ing.unit}) - R$ {ing.cost_per_unit}/{ing.unit}
                                    </option>
                                ))}
                        </select>
                    </div>

                    <div style={{ flex: 1 }}>
                        <label className="text-sm text-secondary mb-1 block">Qtd</label>
                        <div className="flex gap-1">
                            <input
                                type="number"
                                step="0.0001"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                placeholder="0.000"
                                style={{ flex: 1 }}
                            />
                            {selectedIngredient && (
                                <select
                                    value={usageUnit}
                                    onChange={e => setUsageUnit(e.target.value)}
                                    style={{ width: '70px', padding: '0 5px' }}
                                >
                                    {getAvailableUnits(selectedIngredient.unit).map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleAdd}
                        disabled={!selectedIngId || !quantity}
                    >
                        <Plus size={20} />
                    </button>
                </div>

                {previewCost > 0 && (
                    <div className="text-right mb-4 text-sm text-secondary">
                        Custo da adição: <strong className="text-white">R$ {previewCost.toFixed(2)}</strong>
                    </div>
                )}

                <div className="recipe-list">
                    {items.map(item => (
                        <div key={item.id} className="flex justify-between items-center py-2 border-b border-color">
                            <div>
                                <span className="font-medium">{item.ingredient?.name}</span>
                                <span className="text-sm text-secondary ml-2">
                                    {item.quantity} {item.ingredient?.unit} x R$ {item.ingredient?.cost_per_unit}
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="font-bold">
                                    R$ {(item.quantity * (item.ingredient?.cost_per_unit || 0)).toFixed(2)}
                                </span>
                                <button
                                    onClick={() => handleRemove(item.id)}
                                    className="text-red-500 hover:text-red-400"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}


                    <div className="flex justify-between items-center pt-4 mt-2 border-t border-color">
                        <div>
                            <span className="font-bold text-lg mr-4">Custo Total (CMV)</span>
                            <span className="font-bold text-lg text-red-500">R$ {currentCost.toFixed(2)}</span>
                        </div>

                        <button
                            type="button"
                            className="btn btn-ghost text-accent-primary gap-2"
                            onClick={() => setShowPricing(true)}
                        >
                            <Calculator size={18} /> Resumo Precificação
                        </button>
                    </div>
                </div>

                {showPricing && (
                    <PricingModal
                        isOpen={showPricing}
                        onClose={() => setShowPricing(false)}
                        productName={productName || 'Produto'}
                        cmv={currentCost}
                        currentSalePrice={salePrice || 0}
                        productSalesQty={productSalesQty}
                    />
                )}

            </div>
        </div>
    );
}
