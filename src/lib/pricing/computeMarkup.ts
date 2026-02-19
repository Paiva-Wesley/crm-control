/**
 * Computes the mathematical markup multiplier.
 *
 * Formula: 100 / (100 - (fixedCostPercent + variableCostPercent + desiredProfitPercent))
 *
 * NOTE: Platform/channel taxes are NOT included here — they are applied
 * separately per sales channel when computing channel-specific ideal prices.
 *
 * @param fixedCostPercent    - Fixed costs as % of revenue (e.g. 12.5)
 * @param variableCostPercent - Variable costs/taxes as % of price (e.g. 8.0)
 * @param desiredProfitPercent - Desired profit as % of price (e.g. 15.0)
 * @returns The markup multiplier (e.g. 1.55), or 0 if sum >= 100%
 */
export function computeMarkup(
    fixedCostPercent: number,
    variableCostPercent: number,
    desiredProfitPercent: number
): number {
    const totalPercent = fixedCostPercent + variableCostPercent + desiredProfitPercent;

    if (totalPercent >= 100) return 0;

    return 100 / (100 - totalPercent);
}
