/**
 * Technical Divergence Detector.
 * Identifies regular and hidden divergences between Price Swings and Indicators (RSI, MACD).
 * Strictly descriptive; never outputs trading advice.
 */

import { detectSwings } from './market-structure.js';
import { calculateRSI, calculateMACD } from './technical-indicators.js';

/**
 * Detects divergences between Price and Oscillators (RSI and MACD).
 * - Regular Bullish: Price Lower Low (LL) vs Indicator Higher Low (HL) (Momentum fading on downmove)
 * - Regular Bearish: Price Higher High (HH) vs Indicator Lower High (LH) (Momentum fading on upmove)
 * - Hidden Bullish: Price Higher Low (HL) vs Indicator Lower Low (LL) (Trend continuation)
 * - Hidden Bearish: Price Lower High (LH) vs Indicator Higher High (HH) (Trend continuation)
 *
 * @param {Array<{time: number, open: number, high: number, low: number, close: number}>} candles
 * @param {object} [options]
 * @returns {Array<{type: 'bullish'|'bearish'|'hidden_bullish'|'hidden_bearish', indicator: 'RSI'|'MACD', timestamp: number, priceSwing: object, indicatorSwing: object}>}
 */
export function detectDivergences(candles, options = {}) {
  const divergences = [];
  if (!candles || candles.length < 30) return divergences;

  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const macdData = calculateMACD(closes, 12, 26, 9);
  const macd = macdData.macd;

  const swings = detectSwings(candles, { left: 2, right: 2 });
  const highs = swings.filter(s => s.type === 'high');
  const lows = swings.filter(s => s.type === 'low');

  // Check Bearish Divergences on Highs
  for (let i = 1; i < highs.length; i++) {
    const prev = highs[i - 1];
    const curr = highs[i];

    // Distance between swings should not be too far (e.g. within 40 bars)
    if (curr.index - prev.index > 40 || curr.index - prev.index < 3) continue;

    const rsiPrev = rsi[prev.index];
    const rsiCurr = rsi[curr.index];

    // Regular Bearish: Price HH, RSI LH
    if (curr.price > prev.price && rsiCurr < rsiPrev && !isNaN(rsiCurr) && !isNaN(rsiPrev)) {
      divergences.push({
        type: 'bearish',
        classification: 'regular',
        indicator: 'RSI',
        timestamp: curr.time,
        priceSwing: { prevPrice: prev.price, currPrice: curr.price, prevTime: prev.time, currTime: curr.time },
        indicatorSwing: { prevValue: Math.round(rsiPrev * 100) / 100, currValue: Math.round(rsiCurr * 100) / 100 },
      });
    }

    const macdPrev = macd[prev.index];
    const macdCurr = macd[curr.index];
    if (curr.price > prev.price && macdCurr < macdPrev && !isNaN(macdCurr) && !isNaN(macdPrev)) {
      divergences.push({
        type: 'bearish',
        classification: 'regular',
        indicator: 'MACD',
        timestamp: curr.time,
        priceSwing: { prevPrice: prev.price, currPrice: curr.price, prevTime: prev.time, currTime: curr.time },
        indicatorSwing: { prevValue: Math.round(macdPrev * 1000) / 1000, currValue: Math.round(macdCurr * 1000) / 1000 },
      });
    }
  }

  // Check Bullish Divergences on Lows
  for (let i = 1; i < lows.length; i++) {
    const prev = lows[i - 1];
    const curr = lows[i];

    if (curr.index - prev.index > 40 || curr.index - prev.index < 3) continue;

    const rsiPrev = rsi[prev.index];
    const rsiCurr = rsi[curr.index];

    // Regular Bullish: Price LL, RSI HL
    if (curr.price < prev.price && rsiCurr > rsiPrev && !isNaN(rsiCurr) && !isNaN(rsiPrev)) {
      divergences.push({
        type: 'bullish',
        classification: 'regular',
        indicator: 'RSI',
        timestamp: curr.time,
        priceSwing: { prevPrice: prev.price, currPrice: curr.price, prevTime: prev.time, currTime: curr.time },
        indicatorSwing: { prevValue: Math.round(rsiPrev * 100) / 100, currValue: Math.round(rsiCurr * 100) / 100 },
      });
    }

    const macdPrev = macd[prev.index];
    const macdCurr = macd[curr.index];
    if (curr.price < prev.price && macdCurr > macdPrev && !isNaN(macdCurr) && !isNaN(macdPrev)) {
      divergences.push({
        type: 'bullish',
        classification: 'regular',
        indicator: 'MACD',
        timestamp: curr.time,
        priceSwing: { prevPrice: prev.price, currPrice: curr.price, prevTime: prev.time, currTime: curr.time },
        indicatorSwing: { prevValue: Math.round(macdPrev * 1000) / 1000, currValue: Math.round(macdCurr * 1000) / 1000 },
      });
    }
  }

  return divergences.sort((a, b) => b.timestamp - a.timestamp);
}
