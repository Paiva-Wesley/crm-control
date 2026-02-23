import { SupabaseClient } from '@supabase/supabase-js';

export type MonthlyKpi = {
    year: number;
    month: number;
    label: string; // YYYY-MM
    revenueSales: number;
    revenueManual?: number;
    costEstimated: number;
    profitEstimated: number;
    marginPercent: number | null;
    cmvPercent: number | null;
    undefinedCostQty: number;
    undefinedCostRevenue: number;
};

export async function buildMonthlyKpis({
    companyId,
    monthsBack,
    supabase,
}: {
    companyId: string;
    monthsBack: number;
    supabase: SupabaseClient;
}): Promise<MonthlyKpi[]> {
    // 1. Determine UTC start date (first day of the month, X months ago)
    const now = new Date();
    // Using UTC to avoid timezone shifts
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack + 1, 1, 0, 0, 0, 0));

    // 2. Generate zero-filled skeleton for the last `monthsBack` months
    const kpiMap = new Map<string, MonthlyKpi>();
    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;

        kpiMap.set(label, {
            year,
            month,
            label,
            revenueSales: 0,
            costEstimated: 0,
            profitEstimated: 0,
            marginPercent: null,
            cmvPercent: null,
            undefinedCostQty: 0,
            undefinedCostRevenue: 0,
        });
    }

    // 3. Fetch data in parallel
    const [salesRes, costsRes, manualRevenueRes] = await Promise.all([
        supabase
            .from('sales')
            .select('product_id, quantity, sale_price, sold_at')
            .eq('company_id', companyId)
            .gte('sold_at', startDate.toISOString()),

        supabase
            .from('product_costs_view')
            .select('product_id, unit_cost')
            .eq('company_id', companyId),

        supabase
            .from('monthly_revenue')
            .select('year, month, revenue')
            .eq('company_id', companyId)
            .gte('year', startDate.getUTCFullYear()), // Rough filter, we'll refine in memory
    ]);

    if (salesRes.error) console.error('Error fetching sales for KPIs:', salesRes.error);
    if (costsRes.error) console.error('Error fetching costs for KPIs:', costsRes.error);
    if (manualRevenueRes.error) console.error('Error fetching manual revenue:', manualRevenueRes.error);

    const sales = salesRes.data || [];
    const costs = costsRes.data || [];
    const manualRevenues = manualRevenueRes.data || [];

    // Map costs by product_id
    const costMap = new Map<string, number>();
    for (const c of costs) {
        costMap.set(c.product_id, Number(c.unit_cost) || 0);
    }

    // 4. Aggregate sales data into the KPI map
    for (const sale of sales) {
        if (!sale.sold_at) continue;

        // Parse sale date as UTC
        const d = new Date(sale.sold_at);
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;

        // Skip if it's outside our generated skeleton (e.g. future or too old)
        if (!kpiMap.has(label)) continue;

        const kpi = kpiMap.get(label)!;
        const qty = Number(sale.quantity) || 0;
        const price = Number(sale.sale_price) || 0;
        const revenue = qty * price;

        kpi.revenueSales += revenue;

        const unitCost = costMap.get(sale.product_id) || 0;

        if (unitCost > 0) {
            kpi.costEstimated += qty * unitCost;
        } else {
            kpi.undefinedCostQty += qty;
            kpi.undefinedCostRevenue += revenue;
        }
    }

    // 5. Apply manual revenue
    for (const mr of manualRevenues) {
        const label = `${mr.year}-${String(mr.month).padStart(2, '0')}`;
        if (kpiMap.has(label)) {
            kpiMap.get(label)!.revenueManual = Number(mr.revenue) || 0;
        }
    }

    // 6. Final calculations (Profits & Margins)
    const results = Array.from(kpiMap.values());
    for (const kpi of results) {
        kpi.profitEstimated = kpi.revenueSales - kpi.costEstimated;

        if (kpi.revenueSales > 0) {
            kpi.cmvPercent = (kpi.costEstimated / kpi.revenueSales) * 100;
            kpi.marginPercent = (kpi.profitEstimated / kpi.revenueSales) * 100;
        }
    }

    return results;
}
