import { useEffect, useState } from 'react';
import { Plus, Search, Trash2, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ProductWithCost } from '../types';
import { ProductModal } from '../components/products/ProductModal';
import { useSubscription } from '../hooks/useSubscription';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { computeProductMetrics } from '../lib/pricing';
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
    const biz = useBusinessSettings();

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
            <div className="page-header">
                <div>
                    <h1 className="page-title">Ficha Técnica</h1>
                    <p className="page-subtitle">Gerencie os produtos finais vendidos aos clientes.</p>
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
                        className="btn-primary"
                    >
                        Novo Produto
                    </Button>
                </div>
            </div>

            <div className="flex gap-4 mb-6">
                <div className="search-box w-full sm:w-96">
                    <Search size={20} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar produtos..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
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
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Produto</th>
                                    <th>Categoria</th>
                                    <th>Preço Venda</th>
                                    <th>CMV</th>
                                    <th>CMV %</th>
                                    <th>Lucro Estimado</th>
                                    <th className="text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7} className="text-center text-slate-400 py-8">Carregando...</td></tr>
                                ) : (
                                    filteredProducts.map(prod => (
                                        <tr
                                            key={prod.id}
                                            className="cursor-pointer transition-colors hover:bg-slate-700/20"
                                            style={{ opacity: prod.active ? 1 : 0.5 }}
                                            onClick={() => handleEdit(prod)}
                                        >
                                            <td className="font-semibold text-slate-100">{prod.name}</td>
                                            <td>{prod.category || '-'}</td>
                                            <td>R$ {Number(prod.sale_price).toFixed(2)}</td>
                                            <td className="text-slate-400">R$ {Number(prod.cmv).toFixed(2)}</td>
                                            {/* CMV % and Lucro Estimado via pricing engine */}
                                            {(() => {
                                                const price = Number(prod.sale_price) || 0;
                                                const cmv = Number(prod.cmv) || 0;
                                                const cmvPct = price > 0 ? (cmv / price) * 100 : 0;

                                                const m = computeProductMetrics({
                                                    cmv,
                                                    salePrice: price,
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

                                                const cmvColor = cmvPct <= (biz.targetCmvPercent ?? 35) ? 'text-emerald-400' : cmvPct <= (biz.targetCmvPercent ?? 35) + 5 ? 'text-amber-400' : 'text-red-400';
                                                const cmvBg = cmvPct <= (biz.targetCmvPercent ?? 35) ? 'bg-emerald-500/10' : cmvPct <= (biz.targetCmvPercent ?? 35) + 5 ? 'bg-amber-500/10' : 'bg-red-500/10';
                                                const profitColor = m.profitValue > 0 ? 'text-emerald-400' : 'text-red-400';
                                                return (
                                                    <>
                                                        <td>
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cmvBg} ${cmvColor}`}>
                                                                {cmvPct.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={`font-semibold ${profitColor}`}>
                                                                R$ {m.profitValue.toFixed(2)}
                                                            </span>
                                                            <span className={`block text-xs mt-0.5 ${profitColor} opacity-70`}>
                                                                {m.profitPercent.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </>
                                                );
                                            })()}
                                            <td className="text-right" onClick={e => e.stopPropagation()}>
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => handleDelete(prod.id)}
                                                    className="h-8 w-8 p-0"
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
