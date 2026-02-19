/**
 * Computes the ideal menu price (own/internal channel, no platform taxes).
 *
 * Formula: cmv × markup
 */
export function computeIdealMenuPrice(cmv: number, markup: number): number {
    if (markup <= 0 || cmv <= 0) return 0;
    return cmv * markup;
}

/**
 * Computes the ideal price for a specific sales channel, accounting for
 * that channel's total tax/fee rate.
 *
 * Formula: menuPrice / (1 - channelTaxRate / 100)
 *
 * This ensures that after the platform takes its cut, the seller
 * still receives the ideal menu price.
 *
 * @param menuPrice       - The ideal menu price (without platform taxes)
 * @param channelTaxRate  - Total tax/fee percentage for this channel (e.g. 27.5 for 27.5%)
 * @returns The adjusted price for the channel, or 0 if taxRate >= 100
 */
export function computeChannelPrice(
    menuPrice: number,
    channelTaxRate: number
): number {
    if (channelTaxRate >= 100 || menuPrice <= 0) return 0;
    if (channelTaxRate <= 0) return menuPrice;

    return menuPrice / (1 - channelTaxRate / 100);
}

/**
 * Represents a sales channel with its computed ideal price.
 */
export interface ChannelPricing {
    channelId: number;
    channelName: string;
    totalTaxRate: number;
    idealPrice: number;
}

/**
 * Computes ideal prices for all registered sales channels.
 *
 * @param menuPrice - The ideal menu price (base, without any platform taxes)
 * @param channels  - Array of channels, each with their name and total tax %
 * @returns Array of ChannelPricing with the ideal price for each channel
 */
export function computeAllChannelPrices(
    menuPrice: number,
    channels: Array<{ id: number; name: string; totalTaxRate: number }>
): ChannelPricing[] {
    return channels.map((ch) => ({
        channelId: ch.id,
        channelName: ch.name,
        totalTaxRate: ch.totalTaxRate,
        idealPrice: computeChannelPrice(menuPrice, ch.totalTaxRate),
    }));
}
