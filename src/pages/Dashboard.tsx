import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, DollarSign, Package, ShoppingCart, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { OnboardingChecklist } from '../components/dashboard/OnboardingChecklist';
import { useSubscription } from '../hooks/useSubscription';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { computeProductMetrics } from '../lib/pricing';
import { useAuth } from '../contexts/AuthContext';

export function Dashboard() {
    const navigate = useNavigate();
    const { canAccess } = useSubscription();
    const biz = useBusinessSettings();
    const { companyId } = useAuth();

    const [stats, setStats] = useState({
        totalProducts: 0,
        totalIngredients: 0,
        avgMargin: 0,
        totalRevenue: 0
    });
    const [products, setProducts] = useState<any[]>([]);

    useEffect(() => {
        fetchStats();
    }, []);

    async function fetchStats() {
        try {
            // Count products
            const { count: productsCount } = await supabase
                .from('products')
                .select('*', { count: 'exact', head: true });

            // Count ingredients
            const { count: ingredientsCount } = await supabase
                .from('ingredients')
                .select('*', { count: 'exact', head: true });

            // Get products for margin and health card
            const prodQuery = supabase
                .from('product_costs_view')
                .select('*');
            if (companyId) prodQuery.eq('company_id', companyId);
            const { data: prods } = await prodQuery;

            const avgMargin = prods && prods.length > 0
                ? prods.reduce((acc, p) => acc + Number(p.margin_percent || 0), 0) / prods.length
                : 0;

            setStats({
                totalProducts: productsCount || 0,
                totalIngredients: ingredientsCount || 0,
                avgMargin,
                totalRevenue: 0
            });

            setProducts(prods || []);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

    // --- Menu health stats (memoized) ---
    const healthStats = useMemo(() => {
        if (!products.length || biz.loading) return { inLoss: 0, cmvAboveTarget: 0 };

        let inLoss = 0;
        let cmvAboveTarget = 0;

        for (const p of products) {
            const price = Number(p.sale_price) || 0;
            const cmv = Number(p.cmv) || 0;
            if (price <= 0) continue;

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

            if (m.marginStatus === 'danger') inLoss++;
            if (m.cmvStatus !== 'healthy') cmvAboveTarget++;
        }

        return { inLoss, cmvAboveTarget };
    }, [products, biz]);

    const cards = [
        {
            title: 'Total de Produtos',
            value: stats.totalProducts,
            icon: ShoppingCart,
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10'
        },
        {
            title: 'Total de Insumos',
            value: stats.totalIngredients,
            icon: Package,
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/10'
        },
        {
            title: 'Margem Média',
            value: `${stats.avgMargin.toFixed(1)}%`,
            icon: TrendingUp,
            color: 'text-purple-400',
            bgColor: 'bg-purple-500/10'
        },
        {
            title: 'Receita Estimada',
            value: `R$ ${stats.totalRevenue.toFixed(2)}`,
            icon: DollarSign,
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/10'
        }
    ];

    return (
        <div className="space-y-6">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Visão geral do sistema de custos</p>
                </div>
            </div>

            <OnboardingChecklist />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card, index) => (
                    <div
                        key={index}
                        className="glass-card p-6 flex flex-col justify-between hover:bg-slate-800/80 transition-all duration-300"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-lg ${card.bgColor}`}>
                                <card.icon size={24} className={card.color} />
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-slate-400 mb-1">{card.title}</p>
                            <p className="text-3xl font-bold text-slate-100 tracking-tight">{card.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ====== MENU HEALTH CARD (Pro+) ====== */}
            {canAccess('insights') && products.length > 0 && (healthStats.inLoss > 0 || healthStats.cmvAboveTarget > 0) && (
                <div className="glass-card overflow-hidden border border-amber-500/20">
                    <div className="p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-amber-500/10 rounded-xl">
                                <AlertTriangle size={24} className="text-amber-400" />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-lg">Saúde Financeira do Cardápio</h3>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Produtos que precisam de atenção
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate('/cmv-analysis')}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-all"
                        >
                            Ver Análise
                            <ArrowRight size={16} />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 border-t border-slate-700/50">
                        <div className="p-5 flex items-center gap-4 border-r border-slate-700/50">
                            <span className="text-3xl font-bold text-red-400">{healthStats.inLoss}</span>
                            <div>
                                <p className="text-sm font-medium text-red-300">em prejuízo</p>
                                <p className="text-xs text-slate-500">margem negativa</p>
                            </div>
                        </div>
                        <div className="p-5 flex items-center gap-4">
                            <span className="text-3xl font-bold text-amber-400">{healthStats.cmvAboveTarget}</span>
                            <div>
                                <p className="text-sm font-medium text-amber-300">CMV acima da meta</p>
                                <p className="text-xs text-slate-500">acima de {biz.targetCmvPercent ?? 35}%</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-card p-8">
                <h3 className="text-lg font-semibold text-slate-100 mb-4">Bem-vindo ao CMV Control</h3>
                <div className="space-y-4 text-slate-300">
                    <p>Sistema completo para gestão de custos e precificação de produtos.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        <div className="space-y-2">
                            <h4 className="font-semibold text-slate-100">Funcionalidades:</h4>
                            <ul className="space-y-1 text-sm text-slate-400">
                                <li>• Cadastro de produtos e ingredientes</li>
                                <li>• Cálculo automático de CMV</li>
                                <li>• Gestão de custos fixos</li>
                                <li>• Precificação inteligente</li>
                            </ul>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-semibold text-slate-100">Próximos passos:</h4>
                            <ul className="space-y-1 text-sm text-slate-400">
                                <li>• Cadastre seus ingredientes</li>
                                <li>• Crie fichas técnicas dos produtos</li>
                                <li>• Configure custos fixos</li>
                                <li>• Analise margens de lucro</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
