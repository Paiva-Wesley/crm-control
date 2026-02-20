import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSubscription } from '../hooks/useSubscription';
import type { Plan } from '../types';

export function Plans() {
    const { subscription, loading: subLoading } = useSubscription();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPlans();
    }, []);

    async function fetchPlans() {
        try {
            const { data } = await supabase.from('plans').select('*').order('price');
            setPlans(data || []);
        } finally {
            setLoading(false);
        }
    }

    async function handleUpgrade(plan: Plan) {
        // TODO: Integrate with Payment Gateway (Mercado Pago)
        // For now, we can just log intent or show a mock alert
        alert(`Upgrade para o plano ${plan.name} iniciado via Mercado Pago (Simulação).`);
        console.log('Upgrade requested:', plan);
    }

    if (loading || subLoading) return <div className="p-8 text-center text-slate-400">Carregando planos...</div>;

    return (
        <div className="space-y-8">
            <div className="page-header justify-center text-center flex-col items-center">
                <h2 className="page-title text-4xl mb-4">Planos e Preços</h2>
                <p className="page-subtitle text-lg">Escolha o plano ideal para o crescimento do seu negócio</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {plans.map(plan => {
                    const isCurrent = subscription?.plan_id === plan.id.toString();
                    let features: string[] = [];
                    try {
                        if (Array.isArray(plan.features)) {
                            features = plan.features;
                        } else if (typeof plan.features === 'string') {
                            const parsed = JSON.parse(plan.features);
                            if (Array.isArray(parsed)) features = parsed;
                        }
                    } catch (e) {
                        console.warn('Failed to parse features for plan', plan.id, e);
                    }

                    return (
                        <div
                            key={plan.id}
                            className={`
                                relative p-8 rounded-2xl border transition-all duration-300 glass-card
                                ${isCurrent
                                    ? 'bg-slate-800/80 border-primary shadow-lg shadow-primary/20 scale-105 z-10'
                                    : 'hover:border-slate-600/50 hover:bg-slate-800/60'
                                }
                            `}
                        >
                            {isCurrent && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-primary/30 tracking-wide uppercase">
                                    Plano Atual
                                </div>
                            )}

                            <div className="text-center mb-8 border-b border-slate-700/50 pb-8">
                                <h3 className="text-xl font-bold text-slate-100 mb-4">{plan.name}</h3>
                                <div className="flex justify-center items-baseline gap-1">
                                    <span className="text-sm text-slate-400 align-top font-medium mt-2">R$</span>
                                    <span className="text-5xl font-extrabold text-white tracking-tight">{plan.price.toFixed(2)}</span>
                                    <span className="text-slate-500 font-medium">/mês</span>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                {features.map((feature, idx) => (
                                    <div key={idx} className="flex items-start gap-3">
                                        <div className="mt-1 bg-emerald-500/10 p-1 rounded-full shrink-0">
                                            <Check size={14} className="text-emerald-500" />
                                        </div>
                                        <span className="text-sm text-slate-300 leading-relaxed">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => !isCurrent && handleUpgrade(plan)}
                                disabled={isCurrent}
                                className={`
                                    w-full py-4 px-6 rounded-xl font-bold transition-all text-sm uppercase tracking-wide
                                    ${isCurrent
                                        ? 'bg-slate-800 text-slate-500 cursor-default border border-slate-700'
                                        : 'btn-primary hover:scale-[1.02] shadow-lg shadow-primary/20'
                                    }
                                `}
                            >
                                {isCurrent ? 'Seu Plano Atual' : 'Escolher este Plano'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
