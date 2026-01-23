
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ProductWithCost } from '../../types';
import { RecipeEditor } from './RecipeEditor';

interface ProductFormProps {
    product: ProductWithCost | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export function ProductForm({ product, onSuccess, onCancel }: ProductFormProps) {
    const [formData, setFormData] = useState({
        name: product?.name || '',
        category: product?.category || '',
        sale_price: product?.sale_price?.toString() || '',
        active: product?.active ?? true
    });

    // If we just created a product, we store its ID to show the recipe editor
    const [createdProductId, setCreatedProductId] = useState<number | null>(product?.id || null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            const payload = {
                name: formData.name,
                category: formData.category,
                sale_price: parseFloat(formData.sale_price),
                active: formData.active
            };

            if (product) {
                const { error } = await supabase
                    .from('products')
                    .update(payload)
                    .eq('id', product.id);
                if (error) throw error;
                onSuccess();
            } else {
                const { data, error } = await supabase
                    .from('products')
                    .insert(payload)
                    .select()
                    .single();
                if (error) throw error;
                // Instead of closing, switch to recipe mode
                setCreatedProductId(data.id);
            }
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Erro ao salvar produto');
        }
    }

    async function handlePartialUpdate(field: 'name' | 'sale_price', value: string | number) {
        if (!createdProductId) return;

        try {
            await supabase
                .from('products')
                .update({ [field]: value })
                .eq('id', createdProductId);

            // Update local form data
            setFormData(prev => ({ ...prev, [field]: value.toString() }));
        } catch (error) {
            console.error('Error updating product:', error);
            alert('Erro ao atualizar campo.');
        }
    }

    // If we are in "Recipe Mode" (either editing existing, or after creating new)
    if (createdProductId) {
        return (
            <div>
                <div className="mb-6 pb-4 border-b border-color">
                    <h4 className="text-secondary text-sm uppercase mb-2">Detalhes do Produto</h4>
                    <div className="flex justify-between items-center gap-4">
                        <input
                            type="text"
                            className="text-xl font-bold bg-transparent border-b border-transparent hover:border-dark-600 focus:border-primary focus:outline-none transition-colors w-full"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            onBlur={e => handlePartialUpdate('name', e.target.value)}
                        />
                        <div className="flex items-center gap-1">
                            <span className="text-success text-xl font-bold">R$</span>
                            <input
                                type="number"
                                step="0.01"
                                className="text-success text-xl font-bold bg-transparent border-b border-transparent hover:border-dark-600 focus:border-primary focus:outline-none transition-colors w-32 text-right"
                                value={formData.sale_price}
                                onChange={e => setFormData({ ...formData, sale_price: e.target.value })}
                                onBlur={e => handlePartialUpdate('sale_price', parseFloat(e.target.value) || 0)}
                            />
                        </div>
                    </div>
                </div>

                <RecipeEditor
                    productId={createdProductId}
                    productName={formData.name}
                    salePrice={parseFloat(formData.sale_price) || 0}
                    productSalesQty={0}
                />

                <div className="modal-footer mt-6">
                    <button type="button" className="btn btn-primary" onClick={onSuccess}>
                        Concluir
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
                <label className="block text-sm text-secondary mb-1">Nome do Produto</label>
                <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: X-Bacon"
                />
            </div>

            <div className="flex gap-4">
                <div style={{ flex: 1 }}>
                    <label className="block text-sm text-secondary mb-1">Categoria</label>
                    <input
                        type="text"
                        value={formData.category}
                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                        placeholder="Ex: Lanches"
                    />
                </div>

                <div style={{ flex: 1 }}>
                    <label className="block text-sm text-secondary mb-1">Preço de Venda</label>
                    <div className="relative">
                        <span style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-secondary)' }}>R$</span>
                        <input
                            type="number"
                            step="0.01"
                            required
                            value={formData.sale_price}
                            onChange={e => setFormData({ ...formData, sale_price: e.target.value })}
                            placeholder="0.00"
                            style={{ paddingLeft: '2rem' }}
                        />
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-2">
                <input
                    type="checkbox"
                    id="active"
                    checked={formData.active}
                    onChange={e => setFormData({ ...formData, active: e.target.checked })}
                    style={{ width: 'auto' }}
                />
                <label htmlFor="active">Produto Ativo</label>
            </div>

            <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={onCancel}>
                    Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                    {product ? 'Salvar Alterações' : 'Próximo: Ficha Técnica'}
                </button>
            </div>
        </form>
    );
}
