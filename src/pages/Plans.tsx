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
            <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold text-slate-100">Planos e Preços</h2>
                <p className="text-slate-400">Escolha o plano ideal para o crescimento do seu negócio</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {plans.map(plan => {
                    const isCurrent = subscription?.plan_id === plan.id;
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
                                relative p-6 rounded-2xl border transition-all duration-300
                                ${isCurrent
                                    ? 'bg-dark-800 border-primary shadow-lg shadow-primary/10 scale-105 z-10'
                                    : 'bg-dark-800/50 border-dark-700 hover:border-dark-600'
                                }
                            `}
                        >
                            {isCurrent && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                                    PLANO ATUAL
                                </div>
                            )}

                            <div className="text-center mb-6">
                                <h3 className="text-xl font-bold text-slate-100 mb-2">{plan.name}</h3>
                                <div className="flex justify-center items-baseline gap-1">
                                    <span className="text-sm text-slate-400 align-top">R$</span>
                                    <span className="text-4xl font-extrabold text-white">{plan.price.toFixed(2)}</span>
                                    <span className="text-slate-500">/mês</span>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                {features.map((feature, idx) => (
                                    <div key={idx} className="flex items-start gap-3">
                                        <div className="mt-1 bg-emerald-500/10 p-1 rounded-full">
                                            <Check size={12} className="text-emerald-500" />
                                        </div>
                                        <span className="text-sm text-slate-300">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => !isCurrent && handleUpgrade(plan)}
                                disabled={isCurrent}
                                className={`
                                    w-full py-3 px-4 rounded-xl font-bold transition-all
                                    ${isCurrent
                                        ? 'bg-dark-700 text-slate-500 cursor-default'
                                        : 'bg-primary hover:bg-primary-dark text-white hover:scale-[1.02]'
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
