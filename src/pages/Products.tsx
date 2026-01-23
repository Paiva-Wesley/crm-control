import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ProductWithCost } from '../types';
import { Modal } from '../components/ui/Modal';
import { ProductForm } from '../components/products/ProductForm';

export function Products() {
    const [products, setProducts] = useState<ProductWithCost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductWithCost | null>(null);

    useEffect(() => {
        fetchProducts();
    }, []);

    async function fetchProducts() {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('product_costs_view')
                .select('*')
                .order('name');

            if (error) throw error;
            setProducts(data || []);
        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    }

    const filteredProducts = products
        .filter(p => !p.category?.toLowerCase().includes('bebidas'))
        .filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()))
        );

    function handleEdit(product: ProductWithCost) {
        setEditingProduct(product);
        setIsModalOpen(true);
    }

    function handleCloseModal() {
        setIsModalOpen(false);
        setEditingProduct(null);
        fetchProducts();
    }

    async function handleDelete(id: number) {
        if (!confirm('Tem certeza que deseja excluir este produto?')) return;

        try {
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (error) throw error;
            fetchProducts(); // Refresh list
        } catch (error) {
            console.error('Error deleting product:', error);
            alert('Erro ao excluir produto. Verifique se existem dependências (vendas ou combos).');
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="search-box w-full sm:w-96">
                    <Search size={20} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar produtos..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
                    onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                >
                    <Plus size={20} /> Novo Produto
                </button>
            </div>

            {/* Table */}
            <div className="bg-dark-800 border border-dark-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-dark-700">
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Produto</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Categoria</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Preço Venda</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">CMV</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Margem R$</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-400 uppercase tracking-wider">Margem %</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-slate-400 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhum produto encontrado</td></tr>
                            ) : (
                                filteredProducts.map(prod => (
                                    <tr
                                        key={prod.id}
                                        className="border-b border-dark-700 hover:bg-dark-700/50 transition-colors"
                                        style={{ opacity: prod.active ? 1 : 0.5 }}
                                    >
                                        <td className="px-4 py-4 font-semibold text-slate-100">{prod.name}</td>
                                        <td className="px-4 py-4 text-slate-300">{prod.category || '-'}</td>
                                        <td className="px-4 py-4 text-slate-300">R$ {Number(prod.sale_price).toFixed(2)}</td>
                                        <td className="px-4 py-4 text-slate-400">R$ {Number(prod.cmv).toFixed(2)}</td>
                                        <td className={`px-4 py-4 ${prod.gross_profit > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            R$ {Number(prod.gross_profit).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`
                                                inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold
                                                ${prod.margin_percent > 30
                                                    ? 'bg-emerald-500/10 text-emerald-400'
                                                    : 'bg-red-500/10 text-red-400'
                                                }
                                            `}>
                                                {Number(prod.margin_percent).toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <button
                                                className="p-2 text-slate-400 hover:text-white hover:bg-dark-600 rounded-lg transition-colors"
                                                onClick={() => handleEdit(prod)}
                                                title="Editar"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-dark-600 rounded-lg transition-colors ml-1"
                                                onClick={() => handleDelete(prod.id)}
                                                title="Excluir"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <Modal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    title={editingProduct ? `Editar ${editingProduct.name}` : 'Novo Produto'}
                >
                    <ProductForm
                        product={editingProduct}
                        onSuccess={handleCloseModal}
                        onCancel={() => setIsModalOpen(false)}
                    />
                </Modal>
            )}
        </div>
    );
}
