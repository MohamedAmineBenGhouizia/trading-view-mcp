import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSwings,
  classifySwings,
  detectBOSandCHoCH,
  detectTradingRange,
  analyzeMarketStructure,
} from '../src/analysis/market-structure.js';

describe('Market Structure Engine', () => {
  // Construct a synthetic wave: Low(100) -> High(120) -> Low(105) -> High(130) -> Low(110)
  function createSyntheticWave() {
    const prices = [
      100, 105, 110, 115, 120, 115, 110, 105, 107, 112, 118, 125, 130, 122, 116, 110, 115, 120, 125, 135
    ];
    return prices.map((p, i) => ({
      time: 1700000000 + i * 900,
      open: p - 1,
      high: p + 2,
      low: p - 2,
      close: p,
      volume: 1000,
    }));
  }

  it('detects swing highs and swing lows correctly', () => {
    const candles = createSyntheticWave();
    const swings = detectSwings(candles, { left: 2, right: 2 });

    assert.ok(swings.length >= 2, `Should detect swings, found ${swings.length}`);
    const types = swings.map(s => s.type);
    assert.ok(types.includes('high'));
    assert.ok(types.includes('low'));
  });

  it('classifies swings into HH, HL, LH, LL', () => {
    const mockSwings = [
      { type: 'low', price: 100, time: 1, index: 1 },
      { type: 'high', price: 120, time: 2, index: 2 },
      { type: 'low', price: 105, time: 3, index: 3 }, // HL (105 > 100)
      { type: 'high', price: 130, time: 4, index: 4 }, // HH (130 > 120)
      { type: 'low', price: 95, time: 5, index: 5 },   // LL (95 < 105)
      { type: 'high', price: 110, time: 6, index: 6 }, // LH (110 < 130)
    ];

    const classified = classifySwings(mockSwings);
    assert.equal(classified[2].classification, 'HL');
    assert.equal(classified[3].classification, 'HH');
    assert.equal(classified[4].classification, 'LL');
    assert.equal(classified[5].classification, 'LH');
  });

  it('detects BOS and CHoCH events with supporting references', () => {
    const candles = [
      { time: 10, open: 100, high: 101, low: 99, close: 100 },
      { time: 20, open: 100, high: 120, low: 100, close: 119 }, // High at 120
      { time: 30, open: 119, high: 119, low: 105, close: 106 }, // Low at 105
      { time: 40, open: 106, high: 125, low: 106, close: 124 }, // Closes above 120 -> Break
    ];

    const swings = [
      { type: 'high', price: 120, time: 20, index: 1, classification: 'HH' },
      { type: 'low', price: 105, time: 30, index: 2, classification: 'HL' },
    ];

    const events = detectBOSandCHoCH(candles, swings);
    assert.ok(events.length > 0);
    assert.equal(events[0].direction, 'bullish');
    assert.equal(events[0].referenceSwing.price, 120);
  });

  it('calculates trading range bounds and premium/discount position', () => {
    const candles = [
      { time: 1, high: 150, low: 100, close: 130 },
      { time: 2, high: 145, low: 95, close: 105 },
    ];
    const range = detectTradingRange(candles, 2);

    assert.equal(range.high, 150);
    assert.equal(range.low, 95);
    assert.equal(range.rangeSize, 55);
    assert.equal(range.currentPosition, 'discount'); // close 105 < equilibrium (122.5)
  });

  it('executes full analyzeMarketStructure without error', () => {
    const candles = createSyntheticWave();
    const result = analyzeMarketStructure(candles);

    assert.ok(result);
    assert.ok(result.trend);
    assert.ok(Array.isArray(result.swings));
    assert.ok(result.range);
  });
});
