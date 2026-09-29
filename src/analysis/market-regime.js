/**
 * Market Regime Classifier.
 * Classifies market state into TRENDING, RANGING, BREAKOUT, HIGH_VOLATILITY,
 * LOW_VOLATILITY, or TRANSITION using deterministic mathematical indicators.
 */

import { calculateADX, calculateATR } from './technical-indicators.js';

/**
 * Calculates Range Efficiency (ratio of net price displacement to gross price distance traveled).
 * High efficiency (> 0.6) denotes strong trend, low efficiency (< 0.3) denotes chop/ranging.
 * @param {Array<{close: number}>} candles
 * @param {number} [period=20]
 */
export function calculateRangeEfficiency(candles, period = 20) {
  if (!candles || candles.length < period) return 0.5;
  const slice = candles.slice(-period);
  const netDisplacement = Math.abs(slice[slice.length - 1].close - slice[0].close);

  let grossTravel = 0;
  for (let i = 1; i < slice.length; i++) {
    grossTravel += Math.abs(slice[i].close - slice[i - 1].close);
  }

  return grossTravel > 0 ? netDisplacement / grossTravel : 0;
}

/**
 * Calculates ATR Percentile ranking across historical bars.
 * @param {number[]} atrSeries
 * @param {number} currentAtr
 * @param {number} [lookback=100]
 */
export function calculateATRPercentile(atrSeries, currentAtr, lookback = 100) {
  const valid = atrSeries.filter(v => !isNaN(v)).slice(-lookback);
  if (valid.length === 0 || isNaN(currentAtr)) return 50;

  let countBelow = 0;
  for (const v of valid) {
    if (v < currentAtr) countBelow++;
  }
  return Math.round((countBelow / valid.length) * 100);
}

/**
 * Classifies current market regime.
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume: number}>} candles
 * @param {object} [options]
 * @returns {{regime: string, adx: number, atrPercentile: number, rangeEfficiency: number, metrics: object}}
 */
export function classifyMarketRegime(candles, options = {}) {
  if (!candles || candles.length < 30) {
    return {
      regime: 'TRANSITION',
      adx: 0,
      atrPercentile: 50,
      rangeEfficiency: 0.5,
      metrics: { note: 'Insufficient bars for reliable regime classification' },
    };
  }

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const lastIdx = candles.length - 1;

  // 1. ADX
  const adxData = calculateADX(highs, lows, closes, 14);
  const adx = Math.round((adxData.adx[lastIdx] || 0) * 10) / 10;
  const plusDI = Math.round((adxData.plusDI[lastIdx] || 0) * 10) / 10;
  const minusDI = Math.round((adxData.minusDI[lastIdx] || 0) * 10) / 10;

  // 2. ATR & ATR Percentile
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const currentAtr = atrSeries[lastIdx];
  const atrPercentile = calculateATRPercentile(atrSeries, currentAtr, 100);

  // 3. Range Efficiency
  const efficiency = Math.round(calculateRangeEfficiency(candles, 20) * 100) / 100;

  // 4. Bar expansion check (Breakout indicator: last bar range > 2x recent ATR)
  const lastBarRange = highs[lastIdx] - lows[lastIdx];
  const isRangeExpansion = currentAtr > 0 && lastBarRange > 2.0 * currentAtr;

  // Classification Logic
  let regime = 'RANGING';

  if (isRangeExpansion && efficiency > 0.6) {
    regime = 'BREAKOUT';
  } else if (atrPercentile >= 85) {
    regime = 'HIGH_VOLATILITY';
  } else if (atrPercentile <= 15) {
    regime = 'LOW_VOLATILITY';
  } else if (adx >= 25 && efficiency >= 0.5) {
    regime = 'TRENDING';
  } else if (adx < 20 && efficiency < 0.4) {
    regime = 'RANGING';
  } else {
    regime = 'TRANSITION';
  }

  return {
    regime,
    adx,
    atrPercentile,
    rangeEfficiency: efficiency,
    metrics: {
      currentAtr: Math.round(currentAtr * 100) / 100,
      plusDI,
      minusDI,
      trendBias: plusDI > minusDI ? 'bullish' : (minusDI > plusDI ? 'bearish' : 'neutral'),
      isRangeExpansion,
    },
  };
}
