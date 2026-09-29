/**
 * Support, Resistance & Price Zone Detection Engine.
 * Identifies high-probability price clusters, horizontal support & resistance,
 * consolidation zones, and supply/demand areas.
 */

import { detectSwings } from './market-structure.js';

/**
 * Groups price points into clusters within a tolerance percentage.
 * @param {Array<{price: number, time: number, type: string}>} points
 * @param {number} tolerancePct (e.g. 0.005 for 0.5%)
 */
function clusterPrices(points, tolerancePct = 0.005) {
  const clusters = [];

  for (const pt of points) {
    let matchedCluster = null;
    for (const cluster of clusters) {
      const avg = cluster.total / cluster.points.length;
      if (Math.abs(pt.price - avg) / avg <= tolerancePct) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.points.push(pt);
      matchedCluster.total += pt.price;
      matchedCluster.high = Math.max(matchedCluster.high, pt.price);
      matchedCluster.low = Math.min(matchedCluster.low, pt.price);
      matchedCluster.lastTest = Math.max(matchedCluster.lastTest, pt.time);
    } else {
      clusters.push({
        points: [pt],
        total: pt.price,
        high: pt.price,
        low: pt.price,
        lastTest: pt.time,
      });
    }
  }

  return clusters;
}

/**
 * Detects key support and resistance zones from swings and volume clusters.
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume?: number}>} candles
 * @param {object} [options]
 * @param {number} [options.tolerancePct=0.005] Price clustering tolerance (default 0.5%)
 * @param {number} [options.minTouches=2] Minimum touches required to validate a zone
 * @returns {Array<{type: 'support'|'resistance'|'consolidation', high: number, low: number, mid: number, touches: number, lastTest: number}>}
 */
export function detectZones(candles, options = {}) {
  if (!candles || candles.length < 20) return [];

  const tolerancePct = options.tolerancePct || 0.005;
  const minTouches = options.minTouches || 2;
  const currentPrice = candles[candles.length - 1].close;

  // 1. Identify swing points
  const swings = detectSwings(candles, { left: 3, right: 3 });
  const swingHighs = swings.filter(s => s.type === 'high');
  const swingLows = swings.filter(s => s.type === 'low');

  const resistanceClusters = clusterPrices(swingHighs, tolerancePct);
  const supportClusters = clusterPrices(swingLows, tolerancePct);

  const zones = [];

  // Add validated resistance zones
  for (const c of resistanceClusters) {
    if (c.points.length >= minTouches) {
      zones.push({
        type: 'resistance',
        high: Math.round(c.high * 100) / 100,
        low: Math.round(c.low * 100) / 100,
        mid: Math.round(((c.high + c.low) / 2) * 100) / 100,
        touches: c.points.length,
        lastTest: c.lastTest,
        status: currentPrice > c.high ? 'broken' : (currentPrice >= c.low ? 'testing' : 'active'),
      });
    }
  }

  // Add validated support zones
  for (const c of supportClusters) {
    if (c.points.length >= minTouches) {
      zones.push({
        type: 'support',
        high: Math.round(c.high * 100) / 100,
        low: Math.round(c.low * 100) / 100,
        mid: Math.round(((c.high + c.low) / 2) * 100) / 100,
        touches: c.points.length,
        lastTest: c.lastTest,
        status: currentPrice < c.low ? 'broken' : (currentPrice <= c.high ? 'testing' : 'active'),
      });
    }
  }

  // Sort: Resistances descending, Supports descending
  return zones.sort((a, b) => b.mid - a.mid);
}
