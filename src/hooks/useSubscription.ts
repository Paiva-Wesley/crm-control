import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PlanFeatures {
    products_limit: number | null;
    import_sales: boolean;
}

interface SubscriptionData {
    id: number;
    company_id: string;
    plan_id: string;
    status: string;
    plan?: {
        id: string;
        name: string;
        price: number;
        description: string;
        features: PlanFeatures;
    };
}

export function useSubscription() {
    const { companyId } = useAuth();
    const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [usage, setUsage] = useState({
        products: 0,
        ingredients: 0,
        users: 0
    });

    useEffect(() => {
        if (companyId) {
            fetchSubscription();
            fetchUsage();
        } else {
            setLoading(false);
        }
    }, [companyId]);

    async function fetchSubscription() {
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
    }

    async function fetchUsage() {
        if (!companyId) return;

        const { count: productsCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId);

        const { count: ingredientsCount } = await supabase
            .from('ingredients')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId);

        const { count: usersCount } = await supabase
            .from('company_members')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId);

        setUsage({
            products: productsCount || 0,
            ingredients: ingredientsCount || 0,
            users: usersCount || 0
        });
    }

    function checkLimit(feature: 'products' | 'ingredients' | 'users'): boolean {
        if (loading) return false;

        // No subscription = block
        if (!subscription) return false;

        const features = subscription.plan?.features;
        if (!features) return true; // Plan exists but no features = allow

        // Get limit from features
        let limit: number | null = null;

        if (feature === 'products') {
            limit = features.products_limit;
        } else {
            // Ingredients and users have no explicit limit in the DB
            // They follow the products_limit logic: null = unlimited
            limit = features.products_limit;
        }

        // null = unlimited
        if (limit === null || limit === undefined) return true;

        // -1 = unlimited (backward compatibility)
        if (limit === -1) return true;

        return usage[feature] < limit;
    }

    return {
        subscription,
        loading,
        usage,
        checkLimit,
        planName: subscription?.plan?.name || 'Sem Plano',
        canImportSales: subscription?.plan?.features?.import_sales || false,
        refetch: () => { fetchSubscription(); fetchUsage(); }
    };
}
