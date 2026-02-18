import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ProductWithCost } from '../types';
import { ProductModal } from '../components/products/ProductModal';
import { useSubscription } from '../hooks/useSubscription';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';

export function Products() {
    const { checkLimit, loading: subLoading } = useSubscription();
    const [products, setProducts] = useState<ProductWithCost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductWithCost | null>(null);
    const { toast } = useToast();

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
            toast.success('Produto excluído com sucesso');
            fetchProducts(); // Refresh list
        } catch (error) {
            console.error('Error deleting product:', error);
            toast.error('Erro ao excluir produto. Verifique dependências.');
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
                <div className="flex gap-2">
                    {!subLoading && !checkLimit('products') && (
                        <div className="text-sm text-red-400 self-center mr-2 border border-red-500/30 px-3 py-1 rounded bg-red-500/10">
                            Limite do plano atingido
                        </div>
                    )}
                    <Button
                        onClick={() => {
                            if (!subLoading && checkLimit('products')) {
                                setEditingProduct(null);
                                setIsModalOpen(true);
                            }
                        }}
                        disabled={!subLoading && !checkLimit('products')}
                        leftIcon={<Plus size={20} />}
                    >
                        Novo Produto
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-dark-800 border border-dark-700 rounded-lg overflow-hidden">
                {filteredProducts.length === 0 && !loading ? (
                    <EmptyState
                        icon={Package}
                        title={searchTerm ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
                        description={searchTerm ? "Tente buscar com outros termos." : "Cadastre seus produtos para calcular o CMV e margens de lucro."}
                        actionLabel={!searchTerm ? "Novo Produto" : undefined}
                        onAction={!searchTerm ? () => {
                            if (!subLoading && checkLimit('products')) {
                                setEditingProduct(null);
                                setIsModalOpen(true);
                            }
                        } : undefined}
                    />
                ) : (
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
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(prod)}
                                                    className="h-8 w-8 p-0"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={18} />
                                                </Button>
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => handleDelete(prod.id)}
                                                    className="h-8 w-8 p-0 ml-1"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={18} />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <ProductModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                editingProduct={editingProduct}
            />
        </div>
    );
}
