import { computeMarkup } from './computeMarkup';
import { computeIdealMenuPrice, computeAllChannelPrices, type ChannelPricing } from './computeIdealPrice';

/**
 * Margin health status.
 * - healthy: profit% >= desiredProfit%
 * - warning: profit% >= 0 but below desiredProfit%
 * - danger:  profit% < 0 (loss)
 */
export type MarginStatus = 'healthy' | 'warning' | 'danger';

/**
 * CMV health status vs target.
 * - healthy: cmv% <= target
 * - warning: cmv% between target and target+5
 * - danger:  cmv% > target+5
 */
export type CmvStatus = 'healthy' | 'warning' | 'danger';

/**
 * Fixed cost allocation mode.
 * - revenue_based: fixedCostValue = salePrice * (fixedCostPercent / 100)  [spreadsheet method]
 * - per_unit:      fixedCostValue = totalFixedCosts / estimatedMonthlySales
 */
export type FixedCostAllocationMode = 'revenue_based' | 'per_unit';

/**
 * Complete pricing metrics for a single product.
 */
export interface ProductMetrics {
    /** CMV as % of sale price */
    cmvPercent: number;
    /** CMV status vs target (🟢🟡🔴) */
    cmvStatus: CmvStatus;

    /** Gross margin: ((price - cmv) / price) * 100 */
    grossMarginPercent: number;
    /** Contribution margin: ((price - cmv - variableCost) / price) * 100 */
    contributionMarginPercent: number;

    /** Fixed cost per unit in R$ */
    fixedCostValue: number;
    /** Variable cost per unit in R$ */
    variableCostValue: number;
    /** Total cost per unit in R$ (CMV + fixed + variable) */
    totalCost: number;

    /** Estimated profit per unit in R$ */
    profitValue: number;
    /** Estimated profit as % of sale price */
    profitPercent: number;
    /** Visual margin health indicator */
    marginStatus: MarginStatus;

    /** Markup multiplier */
    markup: number;
    /** Ideal menu price (own channel, no platform taxes) */
    idealMenuPrice: number;
    /** Ideal prices per sales channel */
    channelPrices: ChannelPricing[];

    /** Which fixed cost method was used */
    fixedCostMethod: FixedCostAllocationMode;
    /** Human-readable explanation of the method */
    fixedCostExplanation: string;
}

/**
 * Input parameters for computing product metrics.
 */
export interface ProductMetricsInput {
    /** Cost of goods (CMV) in R$ */
    cmv: number;
    /** Current sale price in R$ */
    salePrice: number;
    /** Fixed costs as % of revenue */
    fixedCostPercent: number;
    /** Variable costs/taxes as % of price (sum of all fees) */
    variableCostPercent: number;
    /** Desired profit as % of price */
    desiredProfitPercent: number;
    /** Total monthly fixed costs in R$ */
    totalFixedCosts: number;
    /** Estimated monthly unit sales */
    estimatedMonthlySales: number;
    /** Average monthly revenue */
    averageMonthlyRevenue: number;
    /** Sales channels with their tax rates */
    channels: Array<{ id: number; name: string; totalTaxRate: number }>;
    /** Fixed cost allocation mode (default: revenue_based) */
    fixedCostAllocationMode?: FixedCostAllocationMode;
    /** CMV target % for health indicator (default: 35) */
    targetCmvPercent?: number;
}

/**
 * Computes comprehensive pricing metrics for a product.
 *
 * The function performs:
 * 1. Markup calculation (mathematical, based on cost structure)
 * 2. Ideal menu price = CMV × markup
 * 3. Per-channel ideal prices (adjusting for each channel's taxes)
 * 4. Actual cost breakdown using current sale price
 * 5. Margin analysis (gross, contribution, estimated profit)
 * 6. CMV health + margin health status
 */
export function computeProductMetrics(input: ProductMetricsInput): ProductMetrics {
    const {
        cmv,
        salePrice,
        fixedCostPercent,
        variableCostPercent,
        desiredProfitPercent,
        totalFixedCosts,
        estimatedMonthlySales,
        averageMonthlyRevenue,
        channels,
        fixedCostAllocationMode = 'revenue_based',
        targetCmvPercent = 35,
    } = input;

    // 1. Markup
    const markup = computeMarkup(fixedCostPercent, variableCostPercent, desiredProfitPercent);

    // 2. Ideal prices
    const idealMenuPrice = computeIdealMenuPrice(cmv, markup);
    const channelPrices = computeAllChannelPrices(idealMenuPrice, channels);

    // 3. Cost breakdown
    const variableCostValue = salePrice * (variableCostPercent / 100);

    // Fixed cost — two modes
    let fixedCostValue: number;
    let fixedCostExplanation: string;

    if (fixedCostAllocationMode === 'per_unit') {
        // Mode B: totalFixed / vendas estimadas
        fixedCostValue = estimatedMonthlySales > 0
            ? totalFixedCosts / estimatedMonthlySales
            : 0;
        fixedCostExplanation = `R$ ${totalFixedCosts.toFixed(0)} ÷ ${estimatedMonthlySales} vendas/mês`;
    } else {
        // Mode A (revenue_based): salePrice * fixedCostPercent%  [spreadsheet method]
        fixedCostValue = salePrice * (fixedCostPercent / 100);
        fixedCostExplanation = `${fixedCostPercent.toFixed(2)}% do faturamento médio (R$ ${averageMonthlyRevenue.toFixed(0)})`;
    }

    const totalCost = cmv + variableCostValue + fixedCostValue;

    // 4. Margins
    const cmvPercent = salePrice > 0 ? (cmv / salePrice) * 100 : 0;
    const grossMarginPercent = salePrice > 0
        ? ((salePrice - cmv) / salePrice) * 100
        : 0;
    const contributionMarginPercent = salePrice > 0
        ? ((salePrice - cmv - variableCostValue) / salePrice) * 100
        : 0;

    // 5. Estimated Profit
    const profitValue = salePrice - totalCost;
    const profitPercent = salePrice > 0 ? (profitValue / salePrice) * 100 : 0;

    // 6. CMV status
    let cmvStatus: CmvStatus;
    if (cmvPercent <= targetCmvPercent) {
        cmvStatus = 'healthy';
    } else if (cmvPercent <= targetCmvPercent + 5) {
        cmvStatus = 'warning';
    } else {
        cmvStatus = 'danger';
    }

    // 7. Margin status
    let marginStatus: MarginStatus;
    if (profitPercent < 0) {
        marginStatus = 'danger';
    } else if (profitPercent < desiredProfitPercent) {
        marginStatus = 'warning';
    } else {
        marginStatus = 'healthy';
    }

    return {
        cmvPercent,
        cmvStatus,
        grossMarginPercent,
        contributionMarginPercent,
        fixedCostValue,
        variableCostValue,
        totalCost,
        profitValue,
        profitPercent,
        marginStatus,
        markup,
        idealMenuPrice,
        channelPrices,
        fixedCostMethod: fixedCostAllocationMode,
        fixedCostExplanation,
    };
}
