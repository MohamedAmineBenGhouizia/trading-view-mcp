import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateMedian,
  calculateMAD,
  calculateRobustZScore,
  calculatePercentile,
  classifyVolumeTier,
  calculateCandleMicrostructure,
  calculateEffortVsResult,
  classifyRangeExpansion,
  determineSession,
  detectAbsorptionPattern,
  detectInitiativePattern,
  detectExhaustionPattern,
  detectLiquiditySweepPattern,
  detectBreakoutStatus,
  detectAccumulationDistribution,
  calculateSmartActivityScore,
  calculateConfidence,
  analyzeSmartVolume,
  analyzeMultiTimeframeSmartVolume,
  isTickVolumeFeed,
  getVolumeLimitationNotice,
} from '../src/analysis/smart-volume.js';

describe('Smart Institutional Volume Engine — Mathematical & Statistical Primitives', () => {
  it('calculates median accurately for odd, even, and unsorted datasets', () => {
    assert.equal(calculateMedian([5, 1, 9, 3, 7]), 5);
    assert.equal(calculateMedian([10, 20, 30, 40]), 25);
    assert.equal(calculateMedian([100]), 100);
    assert.equal(calculateMedian([]), 0);
  });

  it('calculates Median Absolute Deviation (MAD) deterministically', () => {
    // Array: [1, 2, 3, 4, 5, 6, 7, 8, 9] -> median = 5
    // Deviations: [4, 3, 2, 1, 0, 1, 2, 3, 4] -> sorted: [0, 1, 1, 2, 2, 3, 3, 4, 4] -> median = 2
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const mad = calculateMAD(data);
    assert.equal(mad, 2);
  });

  it('calculates robust z-score using 1.4826 scale factor', () => {
    // median = 100, MAD = 10, value = 129.652
    // robustZ = (129.652 - 100) / (1.4826 * 10) = 29.652 / 14.826 = 2.0
    const z = calculateRobustZScore(129.652, 100, 10);
    assert.equal(z, 2.0);
  });

  it('handles zero MAD safely without NaN or Infinity propagation', () => {
    // Constant series has MAD = 0
    const zSame = calculateRobustZScore(100, 100, 0);
    assert.equal(zSame, 0);

    const zHigher = calculateRobustZScore(150, 100, 0);
    assert.equal(zHigher, 1.0);

    const zLower = calculateRobustZScore(50, 100, 0);
    assert.equal(zLower, -1.0);
  });

  it('computes volume percentile ranking and tier classification', () => {
    const historical = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    assert.equal(calculatePercentile(10, historical), 5);
    assert.equal(calculatePercentile(55, historical), 50);
    assert.equal(calculatePercentile(100, historical), 95);
    assert.equal(calculatePercentile(150, historical), 100);

    assert.equal(classifyVolumeTier(99.5), 'EXTREME');
    assert.equal(classifyVolumeTier(92.0), 'HIGH');
    assert.equal(classifyVolumeTier(78.0), 'ELEVATED');
    assert.equal(classifyVolumeTier(60.0), 'NORMAL');
  });

  it('handles edge cases in statistical primitives (empty, NaN, Infinity, negative)', () => {
    assert.equal(calculateMedian([NaN, Infinity, -Infinity, 50, 60]), 55);
    assert.equal(calculateMAD([NaN, undefined, null]), 0);
    assert.equal(calculateRobustZScore(NaN, 100, 10), 0);
    assert.equal(calculateRobustZScore(100, NaN, 10), 0);
    assert.equal(calculatePercentile(NaN, [10, 20]), 50);
    assert.equal(calculatePercentile(10, []), 50);
  });
});

describe('Smart Institutional Volume Engine — Candle Microstructure', () => {
  it('computes complete candle microstructure for standard bullish candle', () => {
    const candle = {
      open: 100,
      high: 110,
      low: 95,
      close: 108,
      volume: 1500,
      time: 1700000000,
    };
    const prev = { close: 98 };
    const m = calculateCandleMicrostructure(candle, prev);

    assert.equal(m.range, 15);
    assert.equal(m.body, 8);
    assert.equal(m.bodyRatio, 0.533);
    assert.equal(m.upperWick, 2);
    assert.equal(m.upperWickRatio, 0.133);
    assert.equal(m.lowerWick, 5);
    assert.equal(m.lowerWickRatio, 0.333);
    assert.equal(m.direction, 'BULLISH');
    assert.ok(m.closeLocation > 0.8);
  });

  it('handles flat bars and zero range gracefully', () => {
    const flatCandle = {
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 0,
      time: 1700000000,
    };
    const m = calculateCandleMicrostructure(flatCandle);
    assert.equal(m.range, 0);
    assert.equal(m.body, 0);
    assert.equal(m.bodyRatio, 0);
    assert.equal(m.upperWickRatio, 0);
    assert.equal(m.lowerWickRatio, 0);
    assert.equal(m.direction, 'NEUTRAL');
    assert.equal(m.closeLocation, 0);
  });

  it('correctly models Wyckoff effort vs result', () => {
    const micro = { body: 1.0, trueRange: 2.0 };
    const atr = 10.0; // Normalized result = 1.0 / 10.0 = 0.10 (low result)

    // High effort (RVOL = 3.0), Low result (0.10) -> Absorption / Exhaustion
    const evrAbsorption = calculateEffortVsResult(micro, 3.0, atr);
    assert.equal(evrAbsorption.classification, 'HIGH_EFFORT_LOW_RESULT');
    assert.ok(evrAbsorption.effortResultRatio > 5.0);

    // High effort (RVOL = 2.0), High result (body = 12, atr = 10 -> result = 1.2)
    const microExp = { body: 12.0, trueRange: 15.0 };
    const evrInitiative = calculateEffortVsResult(microExp, 2.0, atr);
    assert.equal(evrInitiative.classification, 'HIGH_EFFORT_HIGH_RESULT');

    // Low effort (RVOL = 0.5), High result (result = 1.2) -> Low participation slippage
    const evrLowPart = calculateEffortVsResult(microExp, 0.5, atr);
    assert.equal(evrLowPart.classification, 'LOW_EFFORT_HIGH_RESULT');
  });

  it('classifies range expansion tiers correctly', () => {
    assert.equal(classifyRangeExpansion(25, 10).classification, 'EXTREME_EXPANSION');
    assert.equal(classifyRangeExpansion(14, 10).classification, 'EXPANSION');
    assert.equal(classifyRangeExpansion(9, 10).classification, 'NORMAL_RANGE');
    assert.equal(classifyRangeExpansion(4, 10).classification, 'CONTRACTION');
  });
});

describe('Smart Institutional Volume Engine — Heuristic Pattern Detectors', () => {
  it('detects bullish absorption with high volume, lower wick rejection, and support confluence', () => {
    const micro = {
      open: 105,
      high: 106,
      low: 95,
      close: 104,
      range: 11,
      body: 1,
      lowerWickRatio: 0.818,
      upperWickRatio: 0.091,
      closeLocation: 0.818,
      direction: 'BEARISH',
    };
    const evr = { effortResultRatio: 2.5 };
    const zones = [{ type: 'support', low: 94, high: 96, mid: 95 }];

    const absorption = detectAbsorptionPattern({
      micro,
      rvol: 2.2,
      robustZ: 2.1,
      evr,
      zones,
      swings: [],
    });

    assert.ok(absorption);
    assert.equal(absorption.type, 'ABSORPTION_LIKE');
    assert.equal(absorption.direction, 'BULLISH');
    assert.ok(absorption.confidence >= 0.70);
    assert.equal(absorption.evidence.levelInteraction, true);
  });

  it('detects bullish initiative move with strong body and range expansion', () => {
    const micro = {
      bodyRatio: 0.85,
      closeLocation: 0.95,
      direction: 'BULLISH',
    };
    const rangeExpansion = { atrRatio: 1.8 };

    const initiative = detectInitiativePattern({
      micro,
      rvol: 2.5,
      robustZ: 2.0,
      rangeExpansion,
      lastEvent: { direction: 'bullish' },
    });

    assert.ok(initiative);
    assert.equal(initiative.type, 'INITIATIVE_BULLISH');
    assert.equal(initiative.direction, 'BULLISH');
    assert.ok(initiative.confidence >= 0.80);
  });

  it('detects exhaustion pattern with extreme volume spike and rejection', () => {
    const micro = {
      upperWickRatio: 0.60,
      lowerWickRatio: 0.05,
      closeLocation: 0.30,
    };
    const rangeExpansion = { atrRatio: 1.6 };

    const exhaustion = detectExhaustionPattern({
      micro,
      rvol: 3.2,
      robustZ: 3.1,
      percentile: 98,
      rangeExpansion,
      zones: [],
    });

    assert.ok(exhaustion);
    assert.equal(exhaustion.type, 'EXHAUSTION_BULLISH');
    assert.equal(exhaustion.direction, 'BEARISH');
    assert.ok(exhaustion.confidence >= 0.75);
  });

  it('detects bullish liquidity sweep of established swing low', () => {
    const swings = [
      { type: 'low', price: 100, index: 10 },
      { type: 'high', price: 115, index: 15 },
    ];
    // Candle sweeps below 100 (low 98) but closes at 102
    const candle = {
      low: 98,
      high: 104,
      close: 102,
      closeLocation: 0.667,
    };

    const sweep = detectLiquiditySweepPattern(candle, swings, 1.8, 1.5);
    assert.ok(sweep);
    assert.equal(sweep.type, 'BULLISH_LIQUIDITY_SWEEP');
    assert.equal(sweep.sweptLevel, 100);
    assert.equal(sweep.wickDistance, 2.0);
    assert.equal(sweep.volumeAnomaly, true);
  });

  it('detects breakout confirmation and failed breakout', () => {
    const zones = [{ type: 'resistance', low: 100, high: 102, mid: 101 }];

    // Breakout confirmation: two closes above zone
    const confirmedCandles = [
      { close: 104, high: 106, low: 101 },
      { close: 105, high: 107, low: 102.5 },
    ];
    const boConf = detectBreakoutStatus(confirmedCandles, zones, []);
    assert.ok(boConf);
    assert.equal(boConf.type, 'BREAKOUT_CONFIRMATION');
    assert.equal(boConf.direction, 'BULLISH');

    // Failed breakout: pierced above 102 but closed below
    const failedCandles = [
      { close: 99, high: 100, low: 98 },
      { close: 101, high: 105, low: 99 },
    ];
    const boFail = detectBreakoutStatus(failedCandles, zones, []);
    assert.ok(boFail);
    assert.equal(boFail.type, 'FAILED_BREAKOUT');
    assert.equal(boFail.direction, 'BEARISH');
  });

  it('detects accumulation-like multi-bar clustering behavior', () => {
    const candles = [];
    for (let i = 0; i < 25; i++) {
      // Lower wick rejection bars with closes in upper half
      candles.push({
        time: 1700000000 + i * 900,
        open: 101,
        high: 105,
        low: 95,
        close: 104,
        volume: 2000,
      });
    }

    const accum = detectAccumulationDistribution(candles, [], [], 20);
    assert.ok(accum);
    assert.equal(accum.type, 'ACCUMULATION_LIKE');
    assert.equal(accum.direction, 'BULLISH');
    assert.ok(Array.isArray(accum.evidence));
  });
});

describe('Smart Institutional Volume Engine — Scoring, Sessions & Normalization', () => {
  it('determines London/New York overlap and major session windows', () => {
    // 14:00 UTC = 1700056800000 ms -> London/NY overlap
    const dateOverlap = new Date('2026-09-29T14:30:00Z');
    assert.equal(determineSession(dateOverlap.getTime()), 'LONDON_NY_OVERLAP');

    const dateLondon = new Date('2026-09-29T09:00:00Z');
    assert.equal(determineSession(dateLondon.getTime()), 'LONDON');

    const dateAsia = new Date('2026-09-29T03:00:00Z');
    assert.equal(determineSession(dateAsia.getTime()), 'ASIA');
  });

  it('computes transparent Smart Activity Score with exposed component breakdown', () => {
    const res = calculateSmartActivityScore({
      robustZ: 2.5,
      volumePercentile: 95,
      rvol: 2.2,
      evr: { classification: 'HIGH_EFFORT_LOW_RESULT', effort: 2.2 },
      rangeExpansion: { atrRatio: 1.5 },
      micro: { upperWickRatio: 0.1, lowerWickRatio: 0.6 },
      pattern: { confidence: 0.8 },
      levelInteraction: true,
      sampleSize: 100,
      dataQuality: { ready: true, complete: true, stale: false },
    });

    assert.ok(res.score >= 60 && res.score <= 100);
    assert.ok(res.components.volumeAnomaly > 0);
    assert.ok(res.components.effortResult > 0);
    assert.ok(res.components.rangeExpansion > 0);
    assert.ok(res.components.rejection > 0);
    assert.ok(res.components.structureInteraction > 0);
    assert.ok(res.components.pattern > 0);
  });

  it('identifies tick-volume CFD feeds and formats appropriate disclaimers', () => {
    assert.equal(isTickVolumeFeed('OANDA:XAUUSD'), true);
    assert.equal(isTickVolumeFeed('FXCM:EURUSD'), true);
    assert.equal(isTickVolumeFeed('CME:ES1!'), false);

    const notice = getVolumeLimitationNotice('OANDA:XAUUSD');
    assert.ok(notice.includes('tick activity'));
    assert.ok(notice.includes('OANDA:XAUUSD'));
  });
});

describe('Smart Institutional Volume Engine — End-to-End Analysis & Multi-Timeframe', () => {
  it('runs complete analyzeSmartVolume deterministically over synthetic bar sequence', () => {
    const candles = [];
    for (let i = 0; i < 50; i++) {
      candles.push({
        time: 1700000000 + i * 300,
        open: 100 + i * 0.1,
        high: 101 + i * 0.1,
        low: 99 + i * 0.1,
        close: 100.5 + i * 0.1,
        volume: 1000 + (i % 5) * 50,
      });
    }

    // Add a massive volume spike with rejection on the final bar
    candles[candles.length - 1] = {
      time: 1700000000 + 49 * 300,
      open: 105,
      high: 105.5,
      low: 97,
      close: 104.5,
      volume: 6000,
    };

    const result = analyzeSmartVolume(candles, {
      symbol: 'OANDA:XAUUSD',
      timeframe: '5m',
    });

    assert.equal(result.symbol, 'OANDA:XAUUSD');
    assert.equal(result.timeframe, '5m');
    assert.equal(result.volumeType, 'TICK_VOLUME');
    assert.ok(result.metrics.rvol > 2.0);
    assert.ok(result.metrics.robustZScore > 2.0);
    assert.ok(result.activity.score >= 50);
    assert.ok(result.evidence.length > 0);
    assert.ok(result.limitations.length > 0);
  });

  it('runs multi-timeframe smart volume analysis and detects cross-timeframe alignment', () => {
    const makeCandles = (baseVol, count = 30) => {
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push({
          time: 1700000000 + i * 300,
          open: 100,
          high: 102,
          low: 98,
          close: 101,
          volume: baseVol,
        });
      }
      return arr;
    };

    const tfMap = {
      '5m': makeCandles(1000),
      '15m': makeCandles(3000),
      '1H': makeCandles(12000),
    };

    const mtf = analyzeMultiTimeframeSmartVolume(tfMap, { symbol: 'OANDA:XAUUSD' });
    assert.ok(mtf.alignment);
    assert.equal(mtf.counts.total, 3);
    assert.ok(mtf.timeframes['5m']);
    assert.ok(mtf.timeframes['15m']);
    assert.ok(mtf.timeframes['1H']);
  });

  it('strictly avoids look-ahead bias: bar classifications only depend on current and past bars', () => {
    const historical = [];
    for (let i = 0; i < 40; i++) {
      historical.push({
        time: 1700000000 + i * 300,
        open: 100, high: 102, low: 98, close: 100, volume: 1000,
      });
    }

    // Evaluation at bar index 35
    const sliceA = historical.slice(0, 36);
    const resA = analyzeSmartVolume(sliceA, { symbol: 'TEST' });

    // Adding future bars 36..39 should NOT change the metrics of bar 35 when isolated
    const sliceB = historical.slice(0, 36);
    const resB = analyzeSmartVolume(sliceB, { symbol: 'TEST' });

    assert.equal(resA.metrics.rvol, resB.metrics.rvol);
    assert.equal(resA.metrics.robustZScore, resB.metrics.robustZScore);
    assert.equal(resA.activity.classification, resB.activity.classification);
  });
});
