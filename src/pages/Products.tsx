import { useEffect, useState, useMemo, useRef } from 'react';
import { Plus, Search, Trash2, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { ProductWithCost } from '../types';
import { ProductModal } from '../components/products/ProductModal';
import { useSubscription } from '../hooks/useSubscription';
import { useLocation } from 'react-router-dom';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { computeProductMetrics } from '../lib/pricing';
import { buildInsights, getWorstInsightLevel } from '../lib/insights/buildInsights';
import { formatMoney } from '../lib/formatMoney';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export function Products() {
    const { checkLimit, canAccess, loading: subLoading } = useSubscription();
    const { companyId } = useAuth();
    const [products, setProducts] = useState<ProductWithCost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductWithCost | null>(null);
    const { toast } = useToast();
    const biz = useBusinessSettings();

    const showInsights = canAccess('insights');

    // Highlight support: read ?highlight=ID from URL
    const location = useLocation();
    const highlightId = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const h = params.get('highlight');
        return h ? parseInt(h) : null;
    }, [location.search]);
    const highlightHandled = useRef(false);

    useEffect(() => {
        if (companyId) fetchProducts();
    }, [companyId]);

    // When products load and highlight is set, scroll and open modal
    useEffect(() => {
        if (!highlightId || highlightHandled.current || loading || !products.length) return;
        const product = products.find(p => p.id === highlightId);
        if (product) {
            highlightHandled.current = true;
            // Scroll to element
            setTimeout(() => {
                const el = document.getElementById(`product-row-${highlightId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-dark-900');
                    setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-dark-900'), 3000);
                }
            }, 100);
            // Open edit modal
            setEditingProduct(product);
            setIsModalOpen(true);
        }
    }, [highlightId, loading, products]);

    async function fetchProducts() {
        if (!companyId) return;
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('product_costs_view')
                .select('*')
                .eq('company_id', companyId)
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

    // Pre-compute metrics + worst badge per product (memoized)
    const productBadges = useMemo(() => {
        if (!showInsights || biz.loading || !filteredProducts.length) return new Map<number, string | null>();

        const map = new Map<number, string | null>();
        for (const prod of filteredProducts) {
            const price = Number(prod.sale_price) || 0;
            const cmv = Number(prod.cmv) || 0;
            if (price <= 0) {
                map.set(prod.id, null);
                continue;
            }

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

            const insights = buildInsights(
                { name: prod.name, sale_price: price },
                m,
                { targetCmvPercent: biz.targetCmvPercent ?? 35, desiredProfitPercent: biz.desiredProfitPercent ?? 15 }
            );

            map.set(prod.id, getWorstInsightLevel(insights));
        }
        return map;
    }, [showInsights, filteredProducts, biz]);

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
            const { error } = await supabase.from('products').delete().eq('id', id).eq('company_id', companyId);
            if (error) throw error;
            toast.success('Produto excluído com sucesso');
            fetchProducts(); // Refresh list
        } catch (error) {
            console.error('Error deleting product:', error);
            toast.error('Erro ao excluir produto. Verifique dependências.');
        }
    }

    const badgeEmoji = (level: string | null) => {
        if (level === 'danger') return '🔴';
        if (level === 'warning') return '🟠';
        return null; // Don't show badge for info / null
    };

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
                                            id={`product-row-${prod.id}`}
                                            className="cursor-pointer transition-colors hover:bg-slate-700/20"
                                            style={{ opacity: prod.active ? 1 : 0.5 }}
                                            onClick={() => handleEdit(prod)}
                                        >
                                            <td className="font-semibold text-slate-100">
                                                <span className="flex items-center gap-2">
                                                    {showInsights && badgeEmoji(productBadges.get(prod.id) ?? null) && (
                                                        <span className="text-sm" title={
                                                            productBadges.get(prod.id) === 'danger' ? 'Prejuízo' :
                                                                productBadges.get(prod.id) === 'warning' ? 'Atenção' : ''
                                                        }>
                                                            {badgeEmoji(productBadges.get(prod.id) ?? null)}
                                                        </span>
                                                    )}
                                                    {prod.name}
                                                </span>
                                            </td>
                                            <td>{prod.category || '-'}</td>
                                            <td>R$ {formatMoney(Number(prod.sale_price))}</td>
                                            <td className="text-slate-400">R$ {formatMoney(Number(prod.cmv))}</td>
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
                                                                R$ {formatMoney(m.profitValue)}
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
