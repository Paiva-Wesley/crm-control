import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function OnboardingChecklist() {
    const { companyId } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        hasIngredients: false,
        hasProducts: false,
        hasFixedCosts: false,
        hasChannels: false,
    });

    useEffect(() => {
        if (companyId) checkProgress();
    }, [companyId]);

    async function checkProgress() {
        try {
            const [ing, prod, costs, channels] = await Promise.all([
                supabase.from('ingredients').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
                supabase.from('products').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
                supabase.from('fixed_costs').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
                supabase.from('sales_channels').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
            ]);

            setStats({
                hasIngredients: (ing.count || 0) > 0,
                hasProducts: (prod.count || 0) > 0,
                hasFixedCosts: (costs.count || 0) > 0,
                hasChannels: (channels.count || 0) > 0,
            });
        } finally {
            setLoading(false);
        }
    }

    const steps = [
        {
            id: 'ingredients',
            label: 'Cadastrar Insumos',
            description: 'Cadastre os ingredientes usados nos seus produtos.',
            done: stats.hasIngredients,
            link: '/ingredients'
        },
        {
            id: 'products',
            label: 'Criar Rótulos/Produtos',
            description: 'Crie seus produtos e defina a ficha técnica.',
            done: stats.hasProducts,
            link: '/products'
        },
        {
            id: 'costs',
            label: 'Definir Custos Fixos',
            description: 'Cadastre aluguel, salários e contas mensais.',
            done: stats.hasFixedCosts,
            link: '/fixed-costs'
        },
        {
            id: 'channels',
            label: 'Configurar Canais de Venda',
            description: 'Defina onde você vende (iFood, Salão, etc).',
            done: stats.hasChannels,
            link: '/channels'
        }
    ];

    const completedCount = steps.filter(s => s.done).length;
    const progress = (completedCount / steps.length) * 100;

    if (loading) return null;
    if (completedCount === steps.length) return null; // Hide when fully complete

    return (
        <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-bold text-white">Primeiros Passos</h3>
                    <p className="text-slate-400 text-sm">Complete a configuração para ter dados precisos.</p>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-bold text-primary">{Math.round(progress)}%</span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-dark-700 h-2 rounded-full mb-6 overflow-hidden">
                <div
                    className="bg-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {steps.map((step) => (
                    <div
                        key={step.id}
                        onClick={() => navigate(step.link)}
                        className={`
                            border rounded-lg p-4 cursor-pointer transition-all hover:bg-dark-700/50
                            ${step.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-dark-600 bg-dark-700/20'}
                        `}
                    >
                        <div className="flex items-center justify-between mb-2">
                            {step.done ? (
                                <CheckCircle2 className="text-emerald-500" size={24} />
                            ) : (
                                <Circle className="text-slate-500" size={24} />
                            )}
                            {!step.done && <ArrowRight className="text-slate-500 group-hover:text-primary" size={16} />}
                        </div>
                        <h4 className={`font-medium mb-1 ${step.done ? 'text-emerald-400' : 'text-slate-200'}`}>
                            {step.label}
                        </h4>
                        <p className="text-xs text-slate-500 line-clamp-2">{step.description}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
