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
  extractNormalizedIndicators,
} from '../src/analysis/technical-indicators.js';

describe('Technical Indicators Calculation & Normalization', () => {
  it('calculates SMA correctly', () => {
    const values = [10, 20, 30, 40, 50];
    const sma3 = calculateSMA(values, 3);
    assert.ok(isNaN(sma3[0]));
    assert.ok(isNaN(sma3[1]));
    assert.equal(sma3[2], 20); // (10+20+30)/3
    assert.equal(sma3[3], 30); // (20+30+40)/3
    assert.equal(sma3[4], 40); // (30+40+50)/3
  });

  it('calculates EMA correctly', () => {
    const values = [10, 11, 12, 13, 14, 15, 16];
    const ema = calculateEMA(values, 3);
    assert.equal(ema[2], 11); // Initial SMA
    assert.ok(ema[3] > 11 && ema[3] < 13);
  });

  it('calculates RSI within [0, 100]', () => {
    // Generate trending up closes
    const closes = [];
    for (let i = 0; i < 30; i++) closes.push(100 + i * 2);
    const rsi = calculateRSI(closes, 14);
    const lastRsi = rsi[rsi.length - 1];

    assert.ok(!isNaN(lastRsi));
    assert.ok(lastRsi >= 70, `RSI should be overbought (>70) for steady uptrend, got ${lastRsi}`);
    assert.ok(lastRsi <= 100);
  });

  it('calculates MACD line, signal, and histogram', () => {
    const closes = [];
    for (let i = 0; i < 40; i++) closes.push(100 + Math.sin(i / 5) * 10);
    const macdData = calculateMACD(closes, 12, 26, 9);

    assert.ok(macdData.macd.length === 40);
    assert.ok(macdData.signal.length === 40);
    assert.ok(macdData.histogram.length === 40);

    const lastHist = macdData.histogram[39];
    assert.ok(!isNaN(lastHist));
  });

  it('calculates ATR strictly positive', () => {
    const highs = [105, 106, 108, 107, 109, 111, 110, 112, 115, 114, 116, 118, 117, 119, 121, 120];
    const lows =  [100, 101, 103, 102, 104, 106, 105, 107, 110, 109, 111, 113, 112, 114, 116, 115];
    const closes = [103, 104, 105, 106, 108, 108, 109, 111, 112, 113, 115, 115, 116, 118, 119, 118];

    const atr = calculateATR(highs, lows, closes, 14);
    const lastAtr = atr[atr.length - 1];
    assert.ok(!isNaN(lastAtr));
    assert.ok(lastAtr > 0);
  });

  it('calculates Bollinger Bands with upper > middle > lower', () => {
    const closes = [];
    for (let i = 0; i < 30; i++) closes.push(100 + (i % 5));
    const bb = calculateBollingerBands(closes, 20, 2);

    const idx = 29;
    assert.ok(bb.upper[idx] >= bb.middle[idx], 'Upper band should be >= middle');
    assert.ok(bb.middle[idx] >= bb.lower[idx], 'Middle band should be >= lower');
  });

  it('normalizes indicators strictly according to Section 29 format', () => {
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
    assert.equal(norm.RSI.barClosed, false); // Last candle is live/open
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
