import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMarketRegime,
  calculateRangeEfficiency,
  calculateATRPercentile,
} from '../src/analysis/market-regime.js';

describe('Market Regime Classification', () => {
  it('calculates range efficiency properly', () => {
    // Monotonic rise -> high efficiency (near 1.0)
    const trending = [];
    for (let i = 0; i < 20; i++) trending.push({ close: 100 + i * 5 });
    const effTrending = calculateRangeEfficiency(trending, 20);
    assert.ok(effTrending > 0.9, `Expected efficiency > 0.9, got ${effTrending}`);

    // Alternating up/down -> low efficiency (near 0)
    const chopping = [];
    for (let i = 0; i < 20; i++) chopping.push({ close: 100 + (i % 2 === 0 ? 5 : -5) });
    const effChopping = calculateRangeEfficiency(chopping, 20);
    assert.ok(effChopping < 0.3, `Expected efficiency < 0.3, got ${effChopping}`);
  });

  it('calculates ATR percentile rank', () => {
    const atrSeries = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const pLow = calculateATRPercentile(atrSeries, 2);
    const pHigh = calculateATRPercentile(atrSeries, 9);
    assert.ok(pLow < pHigh);
  });

  it('classifies market regimes with supporting metrics', () => {
    // Generate trending dataset
    const candles = [];
    for (let i = 0; i < 40; i++) {
      candles.push({
        time: 1700000000 + i * 900,
        open: 100 + i * 2,
        high: 103 + i * 2,
        low: 99 + i * 2,
        close: 102 + i * 2,
        volume: 1000,
      });
    }

    const regime = classifyMarketRegime(candles);
    assert.ok(['TRENDING', 'RANGING', 'BREAKOUT', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'TRANSITION'].includes(regime.regime));
    assert.ok(typeof regime.adx === 'number');
    assert.ok(typeof regime.atrPercentile === 'number');
    assert.ok(typeof regime.rangeEfficiency === 'number');
    assert.ok(regime.metrics);
  });
});
