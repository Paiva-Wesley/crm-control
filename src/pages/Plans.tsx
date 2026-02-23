import { useEffect, useState } from 'react';
import { Check, Crown, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { Plan, PlanFeaturesV2 } from '../types';

// Default features for backward compat
const DEFAULT_FEATURES: PlanFeaturesV2 = {
    limits: { products: 15, ingredients: 20, combos: 0, channels: 0, history_days: 7, users: 1 },
    flags: {
        import_sales: false, channels: false, fees: false, fixed_costs: false,
        variable_costs: false, combos: false, cmv_analysis: true, exports: false,
        insights: false, cost_simulation: false
    },
    marketing: []
};

function parseFeatures(raw: unknown): PlanFeaturesV2 {
    if (!raw) return DEFAULT_FEATURES;
    if (Array.isArray(raw)) return { ...DEFAULT_FEATURES, marketing: raw as string[] };
    if (typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        return {
            limits: { ...DEFAULT_FEATURES.limits, ...(typeof obj.limits === 'object' && obj.limits ? obj.limits as Record<string, number> : {}) },
            flags: { ...DEFAULT_FEATURES.flags, ...(typeof obj.flags === 'object' && obj.flags ? obj.flags as Record<string, boolean> : {}) },
            marketing: Array.isArray(obj.marketing) ? obj.marketing as string[] : []
        };
    }
    return DEFAULT_FEATURES;
}

// Plan highlight tiers
const PLAN_TIERS: Record<string, { icon: typeof Star; accent: string; gradient: string; order: number }> = {
    free: { icon: Star, accent: 'text-slate-400', gradient: 'from-slate-500/10 to-slate-600/10', order: 0 },
    pro: { icon: Crown, accent: 'text-blue-400', gradient: 'from-blue-500/10 to-indigo-500/10', order: 1 },
    premium: { icon: Crown, accent: 'text-amber-400', gradient: 'from-amber-500/10 to-orange-500/10', order: 2 }
};

export function Plans() {
    const { subscription, loading: subLoading, refetch } = useSubscription();
    const { companyId } = useAuth();
    const { addToast } = useToast();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [upgrading, setUpgrading] = useState<string | null>(null);

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
        if (!companyId) return;
        setUpgrading(plan.id);

        try {
            // Check if subscription exists
            const { data: existing } = await supabase
                .from('subscriptions')
                .select('id')
                .eq('company_id', companyId)
                .limit(1)
                .maybeSingle();

            if (existing) {
                // Update existing
                await supabase.from('subscriptions').update({
                    plan_id: plan.id,
                    status: 'active',
                    current_period_start: new Date().toISOString(),
                    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                }).eq('id', existing.id).eq('company_id', companyId);
            } else {
                // Insert new
                await supabase.from('subscriptions').insert({
                    company_id: companyId,
                    plan_id: plan.id,
                    status: 'active',
                    current_period_start: new Date().toISOString(),
                    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                });
            }

            // Refresh subscription data
            refetch();
            addToast(`Plano atualizado para ${plan.name} (simulação)`, 'success');
        } catch (error) {
            console.error('Error upgrading:', error);
            addToast('Erro ao atualizar plano', 'error');
        } finally {
            setUpgrading(null);
        }
    }

    if (loading || subLoading) return <div className="p-8 text-center text-slate-400">Carregando planos...</div>;

    return (
        <div className="space-y-8 fade-in">
            <div className="page-header justify-center text-center flex-col items-center">
                <h2 className="page-title text-4xl mb-4">Planos e Preços</h2>
                <p className="page-subtitle text-lg">Escolha o plano ideal para o crescimento do seu negócio</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {plans.map(plan => {
                    const isCurrent = subscription?.plan_id === plan.id;
                    const features = parseFeatures(plan.features);
                    const marketing = features.marketing || [];
                    const tier = PLAN_TIERS[plan.id] || PLAN_TIERS.free;
                    const TierIcon = tier.icon;
                    const isPopular = plan.id === 'pro';

                    return (
                        <div
                            key={plan.id}
                            className={`
                                relative p-8 rounded-2xl border transition-all duration-300 glass-card
                                ${isCurrent
                                    ? 'bg-slate-800/80 border-primary shadow-lg shadow-primary/20 scale-105 z-10'
                                    : isPopular
                                        ? 'border-blue-500/30 hover:border-blue-500/50 hover:bg-slate-800/60'
                                        : 'hover:border-slate-600/50 hover:bg-slate-800/60'
                                }
                            `}
                        >
                            {isCurrent && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-primary/30 tracking-wide uppercase">
                                    Plano Atual
                                </div>
                            )}
                            {!isCurrent && isPopular && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-blue-500/30 tracking-wide uppercase">
                                    Mais Popular
                                </div>
                            )}

                            <div className="text-center mb-8 border-b border-slate-700/50 pb-8">
                                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${tier.gradient} mb-4`}>
                                    <TierIcon size={24} className={tier.accent} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-100 mb-4">{plan.name}</h3>
                                <div className="flex justify-center items-baseline gap-1">
                                    <span className="text-sm text-slate-400 align-top font-medium mt-2">R$</span>
                                    <span className="text-5xl font-extrabold text-white tracking-tight">{Number(plan.price).toFixed(2)}</span>
                                    <span className="text-slate-500 font-medium">/mês</span>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                {marketing.map((feature, idx) => (
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
                                disabled={isCurrent || upgrading !== null}
                                className={`
                                    w-full py-4 px-6 rounded-xl font-bold transition-all text-sm uppercase tracking-wide
                                    ${isCurrent
                                        ? 'bg-slate-800 text-slate-500 cursor-default border border-slate-700'
                                        : upgrading === plan.id
                                            ? 'bg-slate-700 text-slate-400 cursor-wait'
                                            : 'btn-primary hover:scale-[1.02] shadow-lg shadow-primary/20'
                                    }
                                `}
                            >
                                {isCurrent ? 'Seu Plano Atual' : upgrading === plan.id ? 'Atualizando...' : 'Escolher este Plano'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
