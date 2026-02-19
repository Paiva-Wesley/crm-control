import { describe, it, expect } from 'vitest';
import { computeMarkup } from './computeMarkup';
import {
    computeIdealMenuPrice,
    computeChannelPrice,
    computeAllChannelPrices,
} from './computeIdealPrice';
import { computeProductMetrics } from './computeProductMetrics';

// ---------- computeMarkup ----------
describe('computeMarkup', () => {
    it('calculates standard markup', () => {
        // 100 / (100 - (10 + 12 + 15)) = 100 / 63 ≈ 1.5873
        const markup = computeMarkup(10, 12, 15);
        expect(markup).toBeCloseTo(1.5873, 3);
    });

    it('returns 0 when burden >= 100', () => {
        expect(computeMarkup(50, 40, 20)).toBe(0);
    });

    it('handles zero inputs', () => {
        // 100 / (100 - 0) = 1.0
        expect(computeMarkup(0, 0, 0)).toBeCloseTo(1.0);
    });
});

// ---------- computeIdealMenuPrice ----------
describe('computeIdealMenuPrice', () => {
    it('calculates menu price = cmv × markup', () => {
        expect(computeIdealMenuPrice(10, 2.5)).toBeCloseTo(25, 2);
    });

    it('returns 0 for zero markup', () => {
        expect(computeIdealMenuPrice(10, 0)).toBe(0);
    });
});

// ---------- computeChannelPrice ----------
describe('computeChannelPrice', () => {
    it('adjusts for channel tax rate', () => {
        // menuPrice / (1 - 12/100) = 25 / 0.88 ≈ 28.41
        expect(computeChannelPrice(25, 12)).toBeCloseTo(28.41, 1);
    });

    it('returns 0 for 100% tax', () => {
        expect(computeChannelPrice(25, 100)).toBe(0);
    });
});

// ---------- computeAllChannelPrices ----------
describe('computeAllChannelPrices', () => {
    it('computes prices for multiple channels', () => {
        const channels = [
            { id: 1, name: 'iFood', totalTaxRate: 12 },
            { id: 2, name: 'Próprio', totalTaxRate: 5 },
        ];
        const result = computeAllChannelPrices(25, channels);
        expect(result).toHaveLength(2);
        expect(result[0].idealPrice).toBeCloseTo(28.41, 1);
        expect(result[1].idealPrice).toBeCloseTo(26.32, 1);
    });
});

// ---------- computeProductMetrics ----------
describe('computeProductMetrics', () => {
    const baseInput = {
        cmv: 10,
        salePrice: 30,
        fixedCostPercent: 10,
        variableCostPercent: 12,
        desiredProfitPercent: 15,
        totalFixedCosts: 5000,
        estimatedMonthlySales: 1000,
        averageMonthlyRevenue: 50000,
        channels: [{ id: 1, name: 'iFood', totalTaxRate: 12 }],
    };

    it('calculates cmvPercent', () => {
        const m = computeProductMetrics(baseInput);
        // 10 / 30 * 100 = 33.33%
        expect(m.cmvPercent).toBeCloseTo(33.33, 1);
    });

    it('cmvStatus healthy when <= target', () => {
        const m = computeProductMetrics({ ...baseInput, targetCmvPercent: 35 });
        expect(m.cmvStatus).toBe('healthy');
    });

    it('cmvStatus warning when between target and target+5', () => {
        // cmv% = 33.33, target = 30 → warning (33.33 > 30 but <= 35)
        const m = computeProductMetrics({ ...baseInput, targetCmvPercent: 30 });
        expect(m.cmvStatus).toBe('warning');
    });

    it('cmvStatus danger when > target+5', () => {
        // cmv% = 33.33, target = 25 → danger (33.33 > 25+5 = 30)
        const m = computeProductMetrics({ ...baseInput, targetCmvPercent: 25 });
        expect(m.cmvStatus).toBe('danger');
    });

    it('calculates grossMarginPercent', () => {
        const m = computeProductMetrics(baseInput);
        // (30 - 10) / 30 * 100 = 66.67%
        expect(m.grossMarginPercent).toBeCloseTo(66.67, 1);
    });

    it('calculates contributionMarginPercent', () => {
        const m = computeProductMetrics(baseInput);
        // variableCost = 30 * 0.12 = 3.6
        // (30 - 10 - 3.6) / 30 * 100 = 54.67%
        expect(m.contributionMarginPercent).toBeCloseTo(54.67, 1);
    });

    describe('fixed cost allocation modes', () => {
        it('revenue_based: fixedCost = salePrice * fixedCostPercent%', () => {
            const m = computeProductMetrics({
                ...baseInput,
                fixedCostAllocationMode: 'revenue_based',
            });
            // 30 * (10 / 100) = 3.0
            expect(m.fixedCostValue).toBeCloseTo(3.0, 2);
            expect(m.fixedCostMethod).toBe('revenue_based');
            expect(m.fixedCostExplanation).toContain('faturamento');
        });

        it('per_unit: fixedCost = totalFixed / estimatedSales', () => {
            const m = computeProductMetrics({
                ...baseInput,
                fixedCostAllocationMode: 'per_unit',
            });
            // 5000 / 1000 = 5.0
            expect(m.fixedCostValue).toBeCloseTo(5.0, 2);
            expect(m.fixedCostMethod).toBe('per_unit');
            expect(m.fixedCostExplanation).toContain('vendas/mês');
        });

        it('different modes produce different fixedCostValues', () => {
            const revenue = computeProductMetrics({ ...baseInput, fixedCostAllocationMode: 'revenue_based' });
            const perUnit = computeProductMetrics({ ...baseInput, fixedCostAllocationMode: 'per_unit' });
            // 3.0 vs 5.0, should be different
            expect(revenue.fixedCostValue).not.toBeCloseTo(perUnit.fixedCostValue, 1);
        });
    });

    it('profit and margin status healthy', () => {
        const m = computeProductMetrics(baseInput);
        // revenue_based: fixedCost = 3.0, varCost = 3.6
        // profit = 30 - 10 - 3.6 - 3.0 = 13.4
        // profitPercent = 13.4 / 30 = 44.67%
        expect(m.profitValue).toBeCloseTo(13.4, 1);
        expect(m.profitPercent).toBeCloseTo(44.67, 1);
        expect(m.marginStatus).toBe('healthy');
    });

    it('margin status warning', () => {
        // salePrice = 13 → profit% will be low but positive
        const m = computeProductMetrics({ ...baseInput, salePrice: 13 });
        // varCost = 13 * 0.12 = 1.56, fixedCost = 13 * 0.10 = 1.30
        // profit = 13 - 10 - 1.56 - 1.30 = 0.14
        // profitPercent = 0.14 / 13 = 1.08% (below 15% = warning)
        expect(m.marginStatus).toBe('warning');
    });

    it('margin status danger (loss)', () => {
        const m = computeProductMetrics({ ...baseInput, salePrice: 8 });
        expect(m.profitValue).toBeLessThan(0);
        expect(m.marginStatus).toBe('danger');
    });

    it('generates ideal menu price and channel prices', () => {
        const m = computeProductMetrics(baseInput);
        expect(m.idealMenuPrice).toBeGreaterThan(0);
        expect(m.channelPrices).toHaveLength(1);
        expect(m.channelPrices[0].idealPrice).toBeGreaterThan(m.idealMenuPrice);
    });

    it('handles zero sale price', () => {
        const m = computeProductMetrics({ ...baseInput, salePrice: 0 });
        expect(m.cmvPercent).toBe(0);
        expect(m.grossMarginPercent).toBe(0);
        expect(m.contributionMarginPercent).toBe(0);
        expect(m.profitPercent).toBe(0);
    });
});
