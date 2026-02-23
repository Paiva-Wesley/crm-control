import type { ReactNode } from 'react';
import { useSubscription } from '../../hooks/useSubscription';
import { FeatureLocked } from './FeatureLocked';

interface FeatureGateProps {
    flag: string;
    children: ReactNode;
    requiredPlanLabel?: 'Pro' | 'Premium';
    title?: string;
    description?: string;
}

export function FeatureGate({
    flag,
    children,
    requiredPlanLabel = 'Pro',
    title,
    description
}: FeatureGateProps) {
    const { canAccess, loading } = useSubscription();

    // While loading, show nothing (or could show skeleton)
    if (loading) return null;

    if (!canAccess(flag)) {
        return (
            <FeatureLocked
                title={title}
                description={description}
                requiredPlan={requiredPlanLabel}
                featureKey={flag}
            />
        );
    }

    return <>{children}</>;
}
