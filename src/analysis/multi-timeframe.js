/**
 * Multi-Timeframe (MTF) Engine and Timeframe Alignment Analyzer.
 * Coordinates multi-timeframe analysis across granular and macro timeframes,
 * aggregates OHLCV data, calculates cross-timeframe indicators, and assesses trend/momentum alignment.
 */

import { extractNormalizedIndicators } from './technical-indicators.js';
import { analyzeMarketStructure } from './market-structure.js';
import { classifyMarketRegime } from './market-regime.js';
import { analyzeVolume } from './volume.js';

/**
 * Aggregates granular lower-timeframe candles into higher-timeframe candles.
 * Allows instant, zero-latency multi-timeframe synthesis when granular bars are available.
 *
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume: number}>} candles
 * @param {number} targetIntervalSeconds (e.g. 3600 for 1H, 86400 for 1D)
 * @returns {Array<{time: number, open: number, high: number, low: number, close: number, volume: number, barClosed: boolean}>}
 */
export function aggregateCandles(candles, targetIntervalSeconds) {
  if (!candles || candles.length === 0 || targetIntervalSeconds <= 0) return [];

  const buckets = new Map();

  for (const c of candles) {
    // Normalise timestamp to seconds if in milliseconds
    const t = c.time > 1e11 ? Math.floor(c.time / 1000) : c.time;
    const bucketTime = Math.floor(t / targetIntervalSeconds) * targetIntervalSeconds;

    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
        count: 1,
      });
    } else {
      const b = buckets.get(bucketTime);
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume += (c.volume || 0);
      b.count++;
    }
  }

  const result = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  const nowSec = Math.floor(Date.now() / 1000);

  // Mark whether last aggregated bar is closed
  return result.map((b, idx) => ({
    ...b,
    barClosed: idx < result.length - 1 || (b.time + targetIntervalSeconds <= nowSec),
  }));
}

/**
 * Converts a timeframe string (e.g. "1", "5", "15", "60", "1H", "4H", "1D", "D") to seconds.
 * @param {string} tf
 * @returns {number}
 */
export function timeframeToSeconds(tf) {
  if (!tf) return 60;
  const s = String(tf).trim().toUpperCase();
  if (s === 'D' || s === '1D') return 86400;
  if (s === 'W' || s === '1W') return 604800;
  if (s === 'M' || s === '1M') return 2592000;
  if (s.endsWith('H')) {
    const hours = parseInt(s.slice(0, -1), 10) || 1;
    return hours * 3600;
  }
  const minutes = parseInt(s, 10);
  return !isNaN(minutes) && minutes > 0 ? minutes * 60 : 60;
}

/**
 * Analyzes multiple timeframes from candle data.
 * @param {object} tfCandleMap Object mapping timeframe label (e.g. "15m", "1H") to its candle array
 * @returns {object}
 */
export function analyzeMultiTimeframes(tfCandleMap) {
  const timeframes = {};

  for (const [tf, candles] of Object.entries(tfCandleMap)) {
    if (!candles || candles.length === 0) continue;

    const indicators = extractNormalizedIndicators({ candles, timeframe: tf });
    const structure = analyzeMarketStructure(candles);
    const regime = classifyMarketRegime(candles);
    const volume = analyzeVolume(candles);

    timeframes[tf] = {
      timeframe: tf,
      barCount: candles.length,
      lastBarTime: candles[candles.length - 1].time,
      close: candles[candles.length - 1].close,
      regime: regime.regime,
      trend: structure.trend,
      rsi: indicators.RSI ? indicators.RSI.value : null,
      adx: regime.adx,
      rvol: volume.relativeVolume,
      range: structure.range,
      indicators,
      structure,
      volume,
    };
  }

  // Cross-Timeframe Alignment Evaluation
  const alignment = evaluateTimeframeAlignment(timeframes);

  return {
    timeframes,
    alignment,
  };
}

/**
 * Compares trend, momentum, volatility, and volume across multiple timeframes.
 * @param {object} tfAnalysisMap
 */
export function evaluateTimeframeAlignment(tfAnalysisMap) {
  const tfKeys = Object.keys(tfAnalysisMap);
  if (tfKeys.length === 0) return { status: 'insufficient_data' };

  let bullishVotes = 0;
  let bearishVotes = 0;
  let totalVotes = 0;

  const trendBreakdown = {};
  const momentumBreakdown = {};

  for (const tf of tfKeys) {
    const data = tfAnalysisMap[tf];
    totalVotes++;

    // Trend analysis
    const isBullTrend = data.trend.includes('bullish');
    const isBearTrend = data.trend.includes('bearish');
    if (isBullTrend) bullishVotes++;
    if (isBearTrend) bearishVotes++;
    trendBreakdown[tf] = data.trend;

    // Momentum (RSI)
    if (data.rsi != null) {
      momentumBreakdown[tf] = {
        rsi: data.rsi,
        bias: data.rsi > 55 ? 'bullish' : (data.rsi < 45 ? 'bearish' : 'neutral'),
      };
    }
  }

  const bullPercent = totalVotes > 0 ? Math.round((bullishVotes / totalVotes) * 100) : 50;
  const bearPercent = totalVotes > 0 ? Math.round((bearishVotes / totalVotes) * 100) : 50;

  let consensus = 'mixed';
  if (bullPercent >= 75) consensus = 'strong_bullish_alignment';
  else if (bullPercent >= 55) consensus = 'moderate_bullish_bias';
  else if (bearPercent >= 75) consensus = 'strong_bearish_alignment';
  else if (bearPercent >= 55) consensus = 'moderate_bearish_bias';

  return {
    consensus,
    metrics: {
      totalTimeframes: totalVotes,
      bullishCount: bullishVotes,
      bearishCount: bearishVotes,
      bullishPercentage: bullPercent,
      bearishPercentage: bearPercent,
    },
    trendBreakdown,
    momentumBreakdown,
  };
}
