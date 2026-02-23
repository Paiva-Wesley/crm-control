import { describe, it, expect } from 'vitest';
import { buildInsights, getWorstInsightLevel } from './buildInsights';
import type { ProductMetrics } from '../pricing/computeProductMetrics';

const makeMetrics = (overrides: Partial<ProductMetrics>): ProductMetrics => ({
    cmvPercent: 30,
    cmvStatus: 'healthy',
    grossMarginPercent: 70,
    contributionMarginPercent: 58,
    fixedCostValue: 3,
    variableCostValue: 3.6,
    totalCost: 16.6,
    profitValue: 13.4,
    profitPercent: 44.67,
    marginStatus: 'healthy',
    markup: 1.59,
    idealMenuPrice: 15.9,
    channelPrices: [],
    fixedCostMethod: 'revenue_based',
    fixedCostExplanation: 'test',
    ...overrides,
});

const defaultProduct = { name: 'Test Product', sale_price: 30 };
const defaultSettings = { targetCmvPercent: 35, desiredProfitPercent: 15 };

describe('buildInsights', () => {
    it('returns empty for a healthy product', () => {
        const insights = buildInsights(defaultProduct, makeMetrics({}), defaultSettings);
        expect(insights).toHaveLength(0);
    });

    it('returns empty for product with zero price', () => {
        const insights = buildInsights(
            { name: 'No Price', sale_price: 0 },
            makeMetrics({}),
            defaultSettings
        );
        expect(insights).toHaveLength(0);
    });

    it('detects negative margin (danger)', () => {
        const metrics = makeMetrics({ profitPercent: -5, profitValue: -1.5, marginStatus: 'danger' });
        const insights = buildInsights(defaultProduct, metrics, defaultSettings);
        expect(insights.some(i => i.key === 'negative_margin' && i.level === 'danger')).toBe(true);
    });

    it('detects CMV danger', () => {
        const metrics = makeMetrics({ cmvPercent: 45, cmvStatus: 'danger' });
        const insights = buildInsights(defaultProduct, metrics, defaultSettings);
        const cmvInsight = insights.find(i => i.key === 'cmv_above_target');
        expect(cmvInsight).toBeDefined();
        expect(cmvInsight!.level).toBe('danger');
    });

    it('detects CMV warning', () => {
        const metrics = makeMetrics({ cmvPercent: 37, cmvStatus: 'warning' });
        const insights = buildInsights(defaultProduct, metrics, defaultSettings);
        const cmvInsight = insights.find(i => i.key === 'cmv_above_target');
        expect(cmvInsight).toBeDefined();
        expect(cmvInsight!.level).toBe('warning');
    });

    it('detects profit below desired', () => {
        const metrics = makeMetrics({ profitPercent: 10, marginStatus: 'warning' });
        const insights = buildInsights(defaultProduct, metrics, defaultSettings);
        expect(insights.some(i => i.key === 'profit_below_desired')).toBe(true);
    });

    it('does NOT flag profit_below_desired when margin is negative', () => {
        const metrics = makeMetrics({ profitPercent: -5, marginStatus: 'danger' });
        const insights = buildInsights(defaultProduct, metrics, defaultSettings);
        expect(insights.some(i => i.key === 'profit_below_desired')).toBe(false);
    });

    it('detects price below ideal (>5%)', () => {
        const metrics = makeMetrics({ idealMenuPrice: 40 });
        const product = { name: 'Cheap', sale_price: 30 }; // 25% below ideal
        const insights = buildInsights(product, metrics, defaultSettings);
        expect(insights.some(i => i.key === 'price_below_ideal')).toBe(true);
    });

    it('ignores price below ideal when within 5% tolerance', () => {
        const metrics = makeMetrics({ idealMenuPrice: 31 });
        const product = { name: 'Close', sale_price: 30 }; // ~3% diff
        const insights = buildInsights(product, metrics, defaultSettings);
        expect(insights.some(i => i.key === 'price_below_ideal')).toBe(false);
    });

    it('sorts danger before warning', () => {
        const metrics = makeMetrics({
            profitPercent: -5,
            profitValue: -1.5,
            marginStatus: 'danger',
            cmvPercent: 37,
            cmvStatus: 'warning',
        });
        const insights = buildInsights(defaultProduct, metrics, defaultSettings);
        expect(insights[0].level).toBe('danger');
    });

    it('handles zero idealMenuPrice gracefully', () => {
        const metrics = makeMetrics({ idealMenuPrice: 0 });
        const insights = buildInsights(defaultProduct, metrics, defaultSettings);
        // Should not contain price_below_ideal (guard clause)
        expect(insights.some(i => i.key === 'price_below_ideal')).toBe(false);
    });
});

describe('getWorstInsightLevel', () => {
    it('returns null for empty insights', () => {
        expect(getWorstInsightLevel([])).toBeNull();
    });

    it('returns danger when present', () => {
        const insights = [
            { key: 'a', level: 'warning' as const, title: '', detail: '' },
            { key: 'b', level: 'danger' as const, title: '', detail: '' },
        ];
        expect(getWorstInsightLevel(insights)).toBe('danger');
    });

    it('returns warning when no danger', () => {
        const insights = [
            { key: 'a', level: 'warning' as const, title: '', detail: '' },
            { key: 'b', level: 'info' as const, title: '', detail: '' },
        ];
        expect(getWorstInsightLevel(insights)).toBe('warning');
    });
});
