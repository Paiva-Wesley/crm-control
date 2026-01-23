import { useEffect, useState } from 'react';
import { TrendingUp, DollarSign, Package, ShoppingCart } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function Dashboard() {
    const [stats, setStats] = useState({
        totalProducts: 0,
        totalIngredients: 0,
        avgMargin: 0,
        totalRevenue: 0
    });

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

            // Get average margin
            const { data: products } = await supabase
                .from('product_costs_view')
                .select('margin_percent');

            const avgMargin = products && products.length > 0
                ? products.reduce((acc, p) => acc + Number(p.margin_percent), 0) / products.length
                : 0;

            setStats({
                totalProducts: productsCount || 0,
                totalIngredients: ingredientsCount || 0,
                avgMargin,
                totalRevenue: 0
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

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
            <div>
                <h2 className="text-2xl font-bold text-slate-100">Dashboard</h2>
                <p className="text-slate-400 mt-1">Visão geral do sistema de custos</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card, index) => (
                    <div
                        key={index}
                        className="bg-dark-800 border border-dark-700 rounded-lg p-6 hover:border-dark-600 transition-colors"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-400 mb-1">{card.title}</p>
                                <p className="text-2xl font-bold text-slate-100">{card.value}</p>
                            </div>
                            <div className={`p-3 rounded-lg ${card.bgColor}`}>
                                <card.icon size={24} className={card.color} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-dark-800 border border-dark-700 rounded-lg p-6">
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
