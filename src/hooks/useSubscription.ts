import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PlanFeaturesV2 } from '../types';

// Default features for backward compatibility (Free plan defaults)
const DEFAULT_FEATURES: PlanFeaturesV2 = {
    limits: { products: 15, ingredients: 20, combos: 0, channels: 0, history_days: 7, users: 1 },
    flags: {
        import_sales: false, channels: false, fees: false, fixed_costs: false,
        variable_costs: false, combos: false, cmv_analysis: true, exports: false,
        insights: false, cost_simulation: false
    },
    marketing: []
};

type LimitResource = 'products' | 'ingredients' | 'combos' | 'channels' | 'users';

interface SubscriptionPlan {
    id: string;
    name: string;
    price: number;
    description: string;
    features: PlanFeaturesV2 | null;
}

interface SubscriptionData {
    id: number;
    company_id: string;
    plan_id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    plan?: SubscriptionPlan;
}

interface UsageData {
    products: number;
    ingredients: number;
    combos: number;
    channels: number;
    users: number;
}

/**
 * Parse features from DB, handling backward compat:
 * - null → Free defaults
 * - array (legacy format) → Free defaults with marketing = array
 * - object with limits/flags → use directly
 */
function parseFeatures(raw: unknown): PlanFeaturesV2 {
    if (!raw) return DEFAULT_FEATURES;

    if (Array.isArray(raw)) {
        return { ...DEFAULT_FEATURES, marketing: raw as string[] };
    }

    if (typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        return {
            limits: {
                ...DEFAULT_FEATURES.limits,
                ...(typeof obj.limits === 'object' && obj.limits ? obj.limits as Record<string, number> : {})
            },
            flags: {
                ...DEFAULT_FEATURES.flags,
                ...(typeof obj.flags === 'object' && obj.flags ? obj.flags as Record<string, boolean> : {})
            },
            marketing: Array.isArray(obj.marketing) ? obj.marketing as string[] : []
        };
    }

    return DEFAULT_FEATURES;
}

export function useSubscription() {
    const { companyId } = useAuth();
    const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [usage, setUsage] = useState<UsageData>({
        products: 0,
        ingredients: 0,
        combos: 0,
        channels: 0,
        users: 0
    });

    const fetchSubscription = useCallback(async () => {
        if (!companyId) return;
        try {
            const { data } = await supabase
                .from('subscriptions')
                .select('*, plan:plans(*)')
                .eq('company_id', companyId)
                .in('status', ['active', 'trialing'])
                .single();

            if (data) {
                setSubscription(data);
            }
        } catch (error) {
            console.error('Error fetching subscription:', error);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    const fetchUsage = useCallback(async () => {
        if (!companyId) return;

        const [products, ingredients, combos, channels, users] = await Promise.all([
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
            supabase.from('ingredients').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
            supabase.from('products').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_combo', true),
            supabase.from('sales_channels').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
            supabase.from('company_members').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
        ]);

        setUsage({
            products: products.count || 0,
            ingredients: ingredients.count || 0,
            combos: combos.count || 0,
            channels: channels.count || 0,
            users: users.count || 0
        });
    }, [companyId]);

    useEffect(() => {
        if (companyId) {
            fetchSubscription();
            fetchUsage();
        } else {
            setLoading(false);
        }
    }, [companyId, fetchSubscription, fetchUsage]);

    const features = parseFeatures(subscription?.plan?.features);

    /**
     * Check if the user is within the limit for a given resource.
     * Returns true if they can add more; false if at/over limit.
     * While loading, returns true to avoid false blocking.
     */
    function checkLimit(resource: LimitResource): boolean {
        if (loading) return true;
        if (!subscription) return false;

        const limit = features.limits[resource];

        // null/undefined or -1 = unlimited
        if (limit === null || limit === undefined || limit === -1) return true;

        // 0 means the feature is not available at all
        if (limit === 0) return false;

        return usage[resource] < limit;
    }

    /**
     * Check if the user's plan grants access to a specific feature flag.
     * Missing flags default to true for backward compatibility.
     * While loading, returns true to avoid flashing locked UI.
     */
    function canAccess(flag: string): boolean {
        if (loading) return true;
        if (!subscription) return false;

        const value = features.flags[flag];
        // Missing flag = default true (backward compat)
        if (value === undefined) return true;
        return value;
    }

    const refetch = useCallback(() => {
        fetchSubscription();
        fetchUsage();
    }, [fetchSubscription, fetchUsage]);

    return {
        subscription,
        loading,
        usage,
        features,
        checkLimit,
        canAccess,
        planName: subscription?.plan?.name || 'Sem Plano',
        refetch
    };
}
