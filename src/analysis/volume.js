/**
 * Volume Analysis Engine.
 * Analyzes relative volume, volume percentile distribution, anomalous volume spikes,
 * and volume acceleration trends.
 */

import { calculateSMA } from './technical-indicators.js';

/**
 * Computes comprehensive volume profile and metrics.
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume: number}>} candles
 * @param {object} [options]
 * @param {number} [options.length=20] Moving average period
 * @returns {object}
 */
export function analyzeVolume(candles, { length = 20 } = {}) {
  if (!candles || candles.length === 0) {
    return {
      relativeVolume: 1.0,
      percentile: 50,
      anomaly: false,
      acceleration: 'stable',
      currentVolume: 0,
      averageVolume: 0,
    };
  }

  const volumes = candles.map(c => c.volume || 0);
  const lastIdx = candles.length - 1;
  const currentVolume = volumes[lastIdx];

  // 1. 20-period moving average
  const volSMA = calculateSMA(volumes, length);
  const avgVol = volSMA[lastIdx] || currentVolume;
  const relativeVolume = avgVol > 0 ? Math.round((currentVolume / avgVol) * 100) / 100 : 1.0;

  // 2. Percentile ranking across available bars (up to last 100 bars)
  const sample = volumes.slice(-100);
  let countBelow = 0;
  for (const v of sample) {
    if (v < currentVolume) countBelow++;
  }
  const percentile = sample.length > 0 ? Math.round((countBelow / sample.length) * 100) : 50;

  // 3. Anomaly detection (Relative volume >= 2.0 and percentile >= 90)
  const anomaly = relativeVolume >= 2.0 && percentile >= 90;

  // 4. Volume acceleration (3-bar gradient)
  let acceleration = 'stable';
  if (volumes.length >= 3) {
    const v0 = volumes[lastIdx - 2];
    const v1 = volumes[lastIdx - 1];
    const v2 = volumes[lastIdx];
    if (v2 > v1 && v1 > v0) acceleration = 'accelerating';
    else if (v2 < v1 && v1 < v0) acceleration = 'decelerating';
  }

  return {
    relativeVolume,
    percentile,
    anomaly,
    acceleration,
    currentVolume,
    averageVolume: Math.round(avgVol),
  };
}
