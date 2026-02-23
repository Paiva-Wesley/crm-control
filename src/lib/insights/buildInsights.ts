import type { ProductMetrics } from '../pricing/computeProductMetrics';

/**
 * Severity level of an insight.
 */
export type InsightLevel = 'info' | 'warning' | 'danger';

/**
 * A single actionable insight for a product.
 */
export interface Insight {
    key: string;
    level: InsightLevel;
    title: string;
    detail: string;
}

/**
 * Minimal product data needed to generate insights.
 */
export interface InsightProductData {
    name: string;
    sale_price: number;
}

/**
 * Business settings needed for insight generation.
 */
export interface InsightBusinessSettings {
    targetCmvPercent: number;
    desiredProfitPercent: number;
}

// Priority order for sorting (lower = more urgent)
const LEVEL_PRIORITY: Record<InsightLevel, number> = {
    danger: 0,
    warning: 1,
    info: 2,
};

// Sort key order within same level (lower = more urgent)
const KEY_PRIORITY: Record<string, number> = {
    negative_margin: 0,
    cmv_above_target: 1,
    price_below_ideal: 2,
    profit_below_desired: 3,
};

/**
 * Generates actionable insights for a product based on pre-computed metrics.
 *
 * IMPORTANT: This function does NOT call computeProductMetrics.
 * It receives already-computed metrics to avoid duplicating computation.
 *
 * @param product  - Minimal product data (name, sale_price)
 * @param metrics  - Pre-computed ProductMetrics from computeProductMetrics
 * @param settings - Business target settings
 * @returns Sorted array of insights (danger first, then warning, then info)
 */
export function buildInsights(
    product: InsightProductData,
    metrics: ProductMetrics,
    settings: InsightBusinessSettings
): Insight[] {
    // Guard: skip products without a valid price
    if (!product.sale_price || product.sale_price <= 0) return [];

    // Guard: skip if ideal price is invalid (avoids NaN)
    const hasValidIdealPrice = metrics.idealMenuPrice > 0 && isFinite(metrics.idealMenuPrice);

    const insights: Insight[] = [];

    // 1. DANGER: Negative margin (loss)
    if (metrics.profitPercent < 0) {
        insights.push({
            key: 'negative_margin',
            level: 'danger',
            title: 'Margem NEGATIVA (prejuízo)',
            detail: `Lucro de ${metrics.profitPercent.toFixed(1)}% — cada unidade vendida gera perda de R$ ${Math.abs(metrics.profitValue).toFixed(2)}.`,
        });
    }

    // 2. DANGER/WARNING: CMV above target
    if (metrics.cmvStatus === 'danger') {
        insights.push({
            key: 'cmv_above_target',
            level: 'danger',
            title: 'CMV muito acima do alvo',
            detail: `CMV de ${metrics.cmvPercent.toFixed(1)}% está ${(metrics.cmvPercent - settings.targetCmvPercent).toFixed(1)}pp acima da meta de ${settings.targetCmvPercent}%.`,
        });
    } else if (metrics.cmvStatus === 'warning') {
        insights.push({
            key: 'cmv_above_target',
            level: 'warning',
            title: 'CMV acima do alvo',
            detail: `CMV de ${metrics.cmvPercent.toFixed(1)}% está ${(metrics.cmvPercent - settings.targetCmvPercent).toFixed(1)}pp acima da meta de ${settings.targetCmvPercent}%.`,
        });
    }

    // 3. WARNING: Price below ideal (>5% tolerance to avoid floating-point noise)
    if (hasValidIdealPrice) {
        const priceDiffPercent = (metrics.idealMenuPrice - product.sale_price) / metrics.idealMenuPrice;
        if (priceDiffPercent > 0.05) {
            insights.push({
                key: 'price_below_ideal',
                level: 'warning',
                title: 'Preço abaixo do ideal',
                detail: `Preço atual R$ ${product.sale_price.toFixed(2)} está ${(priceDiffPercent * 100).toFixed(0)}% abaixo do preço ideal de R$ ${metrics.idealMenuPrice.toFixed(2)}.`,
            });
        }
    }

    // 4. WARNING: Profit below desired (but positive — don't overlap with negative_margin)
    if (metrics.profitPercent >= 0 && metrics.profitPercent < settings.desiredProfitPercent) {
        insights.push({
            key: 'profit_below_desired',
            level: 'warning',
            title: 'Lucro abaixo do desejado',
            detail: `Lucro de ${metrics.profitPercent.toFixed(1)}% está abaixo da meta de ${settings.desiredProfitPercent}%.`,
        });
    }

    // Sort: danger first, then warning, then info; within same level, by key priority
    insights.sort((a, b) => {
        const levelDiff = LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level];
        if (levelDiff !== 0) return levelDiff;
        return (KEY_PRIORITY[a.key] ?? 99) - (KEY_PRIORITY[b.key] ?? 99);
    });

    return insights;
}

/**
 * Returns the most severe insight level for a product.
 * Useful for showing a single badge on the products list.
 */
export function getWorstInsightLevel(insights: Insight[]): InsightLevel | null {
    if (insights.length === 0) return null;
    if (insights.some(i => i.level === 'danger')) return 'danger';
    if (insights.some(i => i.level === 'warning')) return 'warning';
    return 'info';
}
