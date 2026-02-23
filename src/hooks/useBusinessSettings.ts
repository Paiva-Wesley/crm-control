import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { computeMarkup } from '../lib/pricing';
import type { BusinessSettings } from '../types';

/**
 * Channel with its aggregated total tax rate from associated fees.
 */
export interface ChannelWithTaxRate {
    id: number;
    name: string;
    totalTaxRate: number;
}

/**
 * Complete business pricing context returned by this hook.
 */
export interface BusinessPricingData {
    settings: BusinessSettings | null;
    /** Total monthly fixed costs in R$ */
    totalFixedCosts: number;
    /** Business variable costs as % of average revenue */
    variableCostPercent: number;
    /** Business variable costs total in R$ */
    variableCostsTotal: number;
    /** Fixed costs as % of average monthly revenue */
    fixedCostPercent: number;
    /** Average monthly revenue */
    averageMonthlyRevenue: number;
    /** Computed markup multiplier */
    markup: number;
    /** Estimated monthly unit sales */
    estimatedMonthlySales: number;
    /** Desired profit % */
    desiredProfitPercent: number;
    /** CMV target % */
    targetCmvPercent: number;
    /** Fixed cost allocation mode */
    fixedCostAllocationMode: 'revenue_based' | 'per_unit';
    /** All sales channels with their tax rates */
    channels: ChannelWithTaxRate[];
    /** Loading state */
    loading: boolean;
    /** Refresh function */
    refresh: () => void;
}

/**
 * Shared hook that fetches all business settings, costs, fees, revenue,
 * and sales channels — then computes the shared markup and cost percentages.
 *
 * This eliminates the duplicated fetch+calc logic that was scattered across
 * PricingModal, Combos, ResaleProducts, CmvAnalysis, etc.
 */
export function useBusinessSettings(): BusinessPricingData {
    const { companyId } = useAuth();

    const [settings, setSettings] = useState<BusinessSettings | null>(null);
    const [totalFixedCosts, setTotalFixedCosts] = useState(0);
    const [variableCostPercent, setVariableCostPercent] = useState(0);
    const [variableCostsTotal, setVariableCostsTotal] = useState(0);
    const [averageMonthlyRevenue, setAverageMonthlyRevenue] = useState(0);
    const [channels, setChannels] = useState<ChannelWithTaxRate[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAll = useCallback(async () => {
        if (!companyId) return;
        try {
            setLoading(true);

            // 1. Business Settings
            const { data: settingsData } = await supabase
                .from('business_settings')
                .select('*')
                .eq('company_id', companyId)
                .limit(1)
                .maybeSingle();

            // 2. Fixed Costs
            const { data: costsData } = await supabase
                .from('fixed_costs')
                .select('monthly_value')
                .eq('company_id', companyId);

            const fixedTotal = (costsData || []).reduce(
                (acc, curr) => acc + (parseFloat(curr.monthly_value as any) || 0),
                0
            );

            // 3. Business Variable Costs (from variable_costs table, NOT fees)
            const { data: varCostsData } = await supabase
                .from('variable_costs')
                .select('type, monthly_value, percentage')
                .eq('company_id', companyId);

            // 4. Monthly Revenue
            const { data: revenueData } = await supabase
                .from('monthly_revenue')
                .select('revenue')
                .eq('company_id', companyId);

            const totalRevenue = (revenueData || []).reduce(
                (acc, curr) => acc + (parseFloat(curr.revenue as any) || 0),
                0
            );
            let avgRev = 0;
            const inputMode = (settingsData as any)?.revenue_input_mode || 'single';

            if (inputMode === 'monthly') {
                avgRev = revenueData && revenueData.length > 0
                    ? totalRevenue / revenueData.length
                    : 0;
            } else {
                avgRev = parseFloat((settingsData as any)?.average_monthly_revenue_input) || 0;
            }

            // Calculate variable costs (spreadsheet logic)
            const variableFixedTotal = (varCostsData || [])
                .filter((v: any) => v.type === 'fixed')
                .reduce((acc, v: any) => acc + (parseFloat(v.monthly_value) || 0), 0);
            const variablePercentTotal = (varCostsData || [])
                .filter((v: any) => v.type === 'percent')
                .reduce((acc, v: any) => acc + (parseFloat(v.percentage) || 0), 0);

            const varTotal = variableFixedTotal + (avgRev > 0 ? avgRev * (variablePercentTotal / 100) : 0);
            const varPercent = avgRev > 0 ? (varTotal / avgRev) * 100 : 0;

            // 5. Fees (only for per-channel tax rates, NOT for business variable costs)
            const { data: feesData } = await supabase
                .from('fees')
                .select('id, percentage')
                .eq('company_id', companyId);

            // 6. Sales Channels with their fees
            const { data: channelsData } = await supabase
                .from('sales_channels')
                .select('id, name')
                .eq('company_id', companyId);

            const channelsWithTaxRates: ChannelWithTaxRate[] = [];
            if (channelsData && channelsData.length > 0) {
                for (const ch of channelsData) {
                    const { data: cfData } = await supabase
                        .from('channel_fees')
                        .select('fee_id')
                        .eq('channel_id', ch.id)
                        .eq('company_id', companyId);

                    const feeIds = cfData?.map((cf: any) => cf.fee_id) || [];
                    let channelTax = 0;

                    if (feeIds.length > 0 && feesData) {
                        channelTax = feesData
                            .filter((f: any) => feeIds.includes(f.id))
                            .reduce((acc, f: any) => acc + (parseFloat(f.percentage) || 0), 0);
                    }

                    channelsWithTaxRates.push({
                        id: ch.id,
                        name: ch.name,
                        totalTaxRate: channelTax,
                    });
                }
            }

            // Set state
            setSettings(settingsData as BusinessSettings | null);
            setTotalFixedCosts(fixedTotal);
            setVariableCostPercent(varPercent);
            setVariableCostsTotal(varTotal);
            setAverageMonthlyRevenue(avgRev);
            setChannels(channelsWithTaxRates);

        } catch (error) {
            console.error('useBusinessSettings: error fetching data', error);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Derived values
    const desiredProfitPercent = settings?.desired_profit_percent ?? 15;
    const estimatedMonthlySales = settings?.estimated_monthly_sales ?? 1000;
    const targetCmvPercent = settings?.target_cmv_percent ?? 35;
    const fixedCostAllocationMode = settings?.fixed_cost_allocation_mode ?? 'revenue_based';
    const fixedCostPercent = averageMonthlyRevenue > 0
        ? (totalFixedCosts / averageMonthlyRevenue) * 100
        : 0;
    const markup = computeMarkup(fixedCostPercent, variableCostPercent, desiredProfitPercent);

    return {
        settings,
        totalFixedCosts,
        variableCostPercent,
        variableCostsTotal,
        fixedCostPercent,
        averageMonthlyRevenue,
        markup,
        estimatedMonthlySales,
        desiredProfitPercent,
        targetCmvPercent,
        fixedCostAllocationMode,
        channels,
        loading,
        refresh: fetchAll,
    };
}
