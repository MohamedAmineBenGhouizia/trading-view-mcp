import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCandles,
  evaluateTimeframeAlignment,
  timeframeToSeconds,
} from '../src/analysis/multi-timeframe.js';

describe('Multi-Timeframe Engine', () => {
  it('converts timeframes to seconds correctly', () => {
    assert.equal(timeframeToSeconds('1'), 60);
    assert.equal(timeframeToSeconds('5'), 300);
    assert.equal(timeframeToSeconds('15'), 900);
    assert.equal(timeframeToSeconds('1H'), 3600);
    assert.equal(timeframeToSeconds('4H'), 14400);
    assert.equal(timeframeToSeconds('1D'), 86400);
    assert.equal(timeframeToSeconds('D'), 86400);
  });

  it('aggregates granular candles into higher timeframe bars preserving OHLCV integrity', () => {
    // 3 x 5m candles = 1 x 15m candle
    const baseTime = 1700000000 - (1700000000 % 900); // 15m aligned
    const candles = [
      { time: baseTime, open: 100, high: 105, low: 99, close: 102, volume: 100 },
      { time: baseTime + 300, open: 102, high: 108, low: 101, close: 106, volume: 150 },
      { time: baseTime + 600, open: 106, high: 107, low: 103, close: 104, volume: 200 },
    ];

    const agg = aggregateCandles(candles, 900);
    assert.equal(agg.length, 1);
    assert.equal(agg[0].time, baseTime);
    assert.equal(agg[0].open, 100);  // Open of first 5m bar
    assert.equal(agg[0].high, 108);  // Highest high across all 3
    assert.equal(agg[0].low, 99);    // Lowest low across all 3
    assert.equal(agg[0].close, 104); // Close of last 5m bar
    assert.equal(agg[0].volume, 450); // Total volume (100+150+200)
  });

  it('evaluates timeframe consensus alignment objectively', () => {
    const mockTfMap = {
      '1D': { trend: 'bullish', rsi: 65 },
      '4H': { trend: 'bullish', rsi: 60 },
      '1H': { trend: 'bullish', rsi: 58 },
      '15m': { trend: 'bullish', rsi: 56 },
    };

    const alignment = evaluateTimeframeAlignment(mockTfMap);
    assert.equal(alignment.consensus, 'strong_bullish_alignment');
    assert.equal(alignment.metrics.bullishCount, 4);
    assert.equal(alignment.metrics.bullishPercentage, 100);
  });
});
