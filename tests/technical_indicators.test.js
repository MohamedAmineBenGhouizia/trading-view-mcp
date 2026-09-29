import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  calculateADX,
  calculateStochastic,
  calculateVWAP,
  extractNormalizedIndicators,
} from '../src/analysis/technical-indicators.js';
import { analyzeVolume } from '../src/analysis/volume.js';

function assertAlmostEqual(actual, expected, tolerance = 1e-4, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${msg} Expected ${actual} to be within ${tolerance} of ${expected} (diff: ${Math.abs(actual - expected)})`
  );
}

describe('Technical Indicators Calculation & Deterministic Fixtures', () => {
  it('calculates SMA with deterministic fixtures and tolerance', () => {
    const input = [10, 20, 30, 40, 50];
    const sma3 = calculateSMA(input, 3);
    assert.ok(isNaN(sma3[0]));
    assert.ok(isNaN(sma3[1]));
    assertAlmostEqual(sma3[2], 20.0, 1e-6, 'SMA period 3 index 2');
    assertAlmostEqual(sma3[3], 30.0, 1e-6, 'SMA period 3 index 3');
    assertAlmostEqual(sma3[4], 40.0, 1e-6, 'SMA period 3 index 4');
  });

  it('calculates EMA with deterministic fixtures and multiplier tolerance', () => {
    const input = [10, 11, 12, 13, 14, 15];
    const ema3 = calculateEMA(input, 3);
    // Initial SMA at index 2 = (10 + 11 + 12) / 3 = 11.0
    assertAlmostEqual(ema3[2], 11.0, 1e-6, 'EMA initial seed');
    // Multiplier k = 2 / (3 + 1) = 0.5
    // idx 3: 13 * 0.5 + 11.0 * 0.5 = 12.0
    assertAlmostEqual(ema3[3], 12.0, 1e-6, 'EMA step 1');
    // idx 4: 14 * 0.5 + 12.0 * 0.5 = 13.0
    assertAlmostEqual(ema3[4], 13.0, 1e-6, 'EMA step 2');
    // idx 5: 15 * 0.5 + 13.0 * 0.5 = 14.0
    assertAlmostEqual(ema3[5], 14.0, 1e-6, 'EMA step 3');
  });

  it('calculates VWAP with deterministic typical prices and volumes', () => {
    const highs = [10, 12, 11];
    const lows = [8, 10, 9];
    const closes = [9, 11, 10];
    const volumes = [100, 200, 100];

    // Typical prices: [9.0, 11.0, 10.0]
    // idx 0: (9 * 100) / 100 = 9.0
    // idx 1: (900 + 11 * 200) / 300 = 3100 / 300 = 10.3333333333...
    // idx 2: (3100 + 10 * 100) / 400 = 4100 / 400 = 10.25
    const vwap = calculateVWAP(highs, lows, closes, volumes);

    assertAlmostEqual(vwap[0], 9.0, 1e-6, 'VWAP bar 0');
    assertAlmostEqual(vwap[1], 10.333333, 1e-4, 'VWAP bar 1');
    assertAlmostEqual(vwap[2], 10.25, 1e-6, 'VWAP bar 2');
  });

  it('calculates Stochastic Oscillator (%K and %D) deterministically', () => {
    const highs = [10, 12, 11, 14, 15];
    const lows = [8, 9, 9, 10, 11];
    const closes = [9, 11, 10, 13, 14];

    // Period K = 3, Period D = 3
    const stoch = calculateStochastic(highs, lows, closes, 3, 3);

    // idx 2: Highest High=12, Lowest Low=8, Close=10 -> %K = ((10-8)/(12-8))*100 = 50.0%
    assertAlmostEqual(stoch.k[2], 50.0, 1e-4, 'Stochastic %K at index 2');
    // idx 3: Highest High=14, Lowest Low=9, Close=13 -> %K = ((13-9)/(14-9))*100 = 80.0%
    assertAlmostEqual(stoch.k[3], 80.0, 1e-4, 'Stochastic %K at index 3');
    // idx 4: Highest High=15, Lowest Low=9, Close=14 -> %K = ((14-9)/(15-9))*100 = 83.3333%
    assertAlmostEqual(stoch.k[4], 83.3333, 1e-4, 'Stochastic %K at index 4');

    // %D (SMA 3 of %K) at index 4 = (50.0 + 80.0 + 83.3333) / 3 = 71.1111%
    assertAlmostEqual(stoch.d[4], 71.1111, 1e-4, 'Stochastic %D at index 4');
  });

  it('calculates ATR with Wilder True Range smoothing deterministically', () => {
    const highs = [10, 12, 11];
    const lows = [8, 9, 9];
    const closes = [9, 11, 10];

    // TR[0] = 10 - 8 = 2
    // TR[1] = max(12-9, |12-9|, |9-9|) = 3
    // TR[2] = max(11-9, |11-11|, |9-11|) = 2
    // Length = 2:
    // ATR[1] = (2 + 3) / 2 = 2.5
    // ATR[2] = (2.5 * 1 + 2) / 2 = 2.25
    const atr = calculateATR(highs, lows, closes, 2);

    assert.ok(isNaN(atr[0]));
    assertAlmostEqual(atr[1], 2.5, 1e-6, 'ATR index 1');
    assertAlmostEqual(atr[2], 2.25, 1e-6, 'ATR index 2');
  });

  it('calculates Bollinger Bands mean, stdDev, and percentB deterministically', () => {
    // 3 identical values: mean = 10, stdDev = 0
    const flatCloses = [10, 10, 10];
    const flatBB = calculateBollingerBands(flatCloses, 3, 2);
    assertAlmostEqual(flatBB.middle[2], 10.0, 1e-6);
    assertAlmostEqual(flatBB.upper[2], 10.0, 1e-6);
    assertAlmostEqual(flatBB.lower[2], 10.0, 1e-6);
    assertAlmostEqual(flatBB.percentB[2], 0.5, 1e-6);

    // Dynamic series: [8, 10, 12]
    // mean = 10, variance = (4 + 0 + 4)/3 = 2.666667 -> stdDev = 1.632993
    // upper = 10 + 2 * 1.632993 = 13.265986
    // lower = 10 - 2 * 1.632993 = 6.734014
    const dynCloses = [8, 10, 12];
    const dynBB = calculateBollingerBands(dynCloses, 3, 2);
    assertAlmostEqual(dynBB.middle[2], 10.0, 1e-4);
    assertAlmostEqual(dynBB.upper[2], 13.266, 1e-3);
    assertAlmostEqual(dynBB.lower[2], 6.734, 1e-3);
    assertAlmostEqual(dynBB.percentB[2], (12 - 6.734014) / (13.265986 - 6.734014), 1e-4);
  });

  it('calculates RSI bounded within [0, 100] with Wilder smoothing', () => {
    // 20 bars of pure positive gains
    const upCloses = [];
    for (let i = 0; i < 20; i++) upCloses.push(100 + i * 2);
    const rsiUp = calculateRSI(upCloses, 14);
    assertAlmostEqual(rsiUp[14], 100.0, 1e-4, 'Pure gains RSI should be 100');

    // Oscillating series
    const oscCloses = [100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102];
    const rsiOsc = calculateRSI(oscCloses, 14);
    assertAlmostEqual(rsiOsc[14], 50.0, 1.0, 'Equal alternating gains/losses RSI should be ~50');
  });

  it('calculates MACD line, signal line, and histogram', () => {
    const closes = [];
    for (let i = 0; i < 50; i++) closes.push(100 + Math.sin(i / 4) * 15);
    const macdData = calculateMACD(closes, 12, 26, 9);

    assert.equal(macdData.macd.length, 50);
    assert.equal(macdData.signal.length, 50);
    assert.equal(macdData.histogram.length, 50);

    const lastIdx = 49;
    assert.ok(!isNaN(macdData.macd[lastIdx]));
    assert.ok(!isNaN(macdData.signal[lastIdx]));
    assert.ok(!isNaN(macdData.histogram[lastIdx]));
    assertAlmostEqual(macdData.histogram[lastIdx], macdData.macd[lastIdx] - macdData.signal[lastIdx], 1e-6);
  });

  it('calculates ADX directional movement indicators', () => {
    const count = 40;
    const highs = [];
    const lows = [];
    const closes = [];
    for (let i = 0; i < count; i++) {
      highs.push(100 + i * 2);
      lows.push(98 + i * 2);
      closes.push(99 + i * 2);
    }
    const adxData = calculateADX(highs, lows, closes, 14);
    assert.equal(adxData.adx.length, count);
    assert.equal(adxData.plusDI.length, count);
    assert.equal(adxData.minusDI.length, count);

    const lastAdx = adxData.adx[count - 1];
    assert.ok(!isNaN(lastAdx));
    assert.ok(lastAdx > 0 && lastAdx <= 100);
    assert.ok(adxData.plusDI[count - 1] > adxData.minusDI[count - 1], 'Plus DI should exceed Minus DI in strong uptrend');
  });

  it('computes volume metrics and flags relative volume anomalies', () => {
    const candles = [];
    for (let i = 0; i < 30; i++) {
      candles.push({
        time: 1700000000 + i * 60,
        open: 100, high: 101, low: 99, close: 100,
        volume: i === 29 ? 5000 : 1000,
      });
    }

    const vol = analyzeVolume(candles, { length: 20 });
    // Average volume over last 20 bars prior to last bar was 1000
    // Last bar is 5000 -> relative volume should be ~4-5x
    assert.ok(vol.relativeVolume >= 4.0, `Relative volume should be >= 4.0, got ${vol.relativeVolume}`);
    assert.equal(vol.anomaly, true, 'Anomaly should be flagged for 5x spike in 90th+ percentile');
    assert.equal(vol.percentile, 97);
  });

  it('normalizes indicators strictly according to Section 21 format', () => {
    const candles = [];
    const baseTime = 1700000000;
    for (let i = 0; i < 50; i++) {
      candles.push({
        time: baseTime + i * 900,
        open: 100 + i,
        high: 102 + i,
        low: 99 + i,
        close: 101 + i,
        volume: 1000 + i * 50,
        barClosed: i < 49,
      });
    }

    const norm = extractNormalizedIndicators({ candles, timeframe: '15m', symbol: 'BTCUSDT' });

    // Validate RSI structure
    assert.ok(norm.RSI);
    assert.equal(norm.RSI.name, 'RSI');
    assert.equal(norm.RSI.timeframe, '15m');
    assert.ok(typeof norm.RSI.value === 'number');
    assert.ok(typeof norm.RSI.timestamp === 'number');
    assert.equal(norm.RSI.barClosed, false);
    assert.ok(['rising', 'falling', 'flat'].includes(norm.RSI.state.direction));

    // Validate MACD structure
    assert.ok(norm.MACD);
    assert.equal(norm.MACD.name, 'MACD');
    assert.ok(norm.MACD.details);

    // Validate EMA structure
    assert.ok(norm.EMA);
    assert.equal(norm.EMA.name, 'EMA');
    assert.ok(norm.EMA.details.ema20);

    // Validate Volume structure
    assert.ok(norm.Volume);
    assert.equal(norm.Volume.name, 'Volume');
    assert.ok(typeof norm.Volume.state.relativeVolume === 'number');
  });
});
