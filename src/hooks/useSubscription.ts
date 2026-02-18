import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Subscription } from '../types';

export function useSubscription() {
    const { companyId } = useAuth();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [loading, setLoading] = useState(true);
    const [limits, setLimits] = useState({
        products: 0,
        ingredients: 0,
        users: 0
    });
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
            // First try to get the active subscription
            const { data } = await supabase
                .from('subscriptions')
                .select('*, plan:plans(*)')
                .eq('company_id', companyId)
                .in('status', ['active', 'trialing'])
                .single();

            if (data) {
                setSubscription(data);
                if (data.plan?.limits) {
                    setLimits(data.plan.limits);
                }
            } else {
                // If no active subscription, specific logic (e.g., fallback to Free or creating one)
                // For now, let's assume every company is created with a Free plan.
            }
        } catch (error) {
            console.error('Error fetching subscription:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchUsage() {
        if (!companyId) return;

        // Count products
        const { count: productsCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId);

        // Count ingredients
        const { count: ingredientsCount } = await supabase
            .from('ingredients')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId);

        // Count users (company_members)
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
        // If no subscription loaded yet, deny or allow depending on policy. 
        // Let's safe fail to allow for now or block? Block is safer for SaaS.
        if (loading) return false;
        if (!subscription) return false; // No plan = no access

        const limit = limits[feature];
        // -1 or undefined could mean unlimited
        if (limit === undefined || limit === -1) return true;

        return usage[feature] < limit;
    }

    return {
        subscription,
        loading,
        limits,
        usage,
        checkLimit,
        refetch: () => { fetchSubscription(); fetchUsage(); }
    };
}
