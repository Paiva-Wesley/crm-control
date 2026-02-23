import { useNavigate } from 'react-router-dom';
import { Lock, Star } from 'lucide-react';

interface FeatureLockedProps {
    title?: string;
    description?: string;
    requiredPlan?: 'Pro' | 'Premium';
    featureKey?: string;
}

export function FeatureLocked({
    title = 'Recurso não disponível no seu plano',
    description = 'Faça upgrade para acessar este recurso e desbloquear todo o potencial da plataforma.',
    requiredPlan = 'Pro'
}: FeatureLockedProps) {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 fade-in">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-8 border border-amber-500/20">
                <Lock size={36} className="text-amber-400" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
            <p className="text-slate-400 max-w-md mb-2 leading-relaxed">{description}</p>

            <div className="flex items-center gap-1.5 text-amber-400 text-sm font-medium mb-8">
                <Star size={14} />
                <span>Disponível a partir do plano {requiredPlan}</span>
            </div>

            <button
                onClick={() => navigate('/plans')}
                className="btn-primary px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
            >
                Ver Planos
            </button>
        </div>
    );
}
