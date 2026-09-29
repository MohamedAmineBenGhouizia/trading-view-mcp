/**
 * High-Level Market Analysis Service.
 * Orchestrates multi-indicator analysis, market structure, regime, zones,
 * and cross-timeframe comparisons into coherent, high-context agent tools.
 */

import { getOhlcv } from './data.js';
import { getChartSnapshot } from './chart.js';
import { getConnectionState, cdpQueue, chartTxQueue } from '../connection.js';
import { chartStateManager } from './state-manager.js';
import { extractNormalizedIndicators } from '../analysis/technical-indicators.js';
import { analyzeMarketStructure } from '../analysis/market-structure.js';
import { classifyMarketRegime } from '../analysis/market-regime.js';
import { detectZones } from '../analysis/zones.js';
import { analyzeVolume } from '../analysis/volume.js';
import { detectDivergences } from '../analysis/divergences.js';
import { aggregateCandles, evaluateTimeframeAlignment, timeframeToSeconds } from '../analysis/multi-timeframe.js';

/**
 * Provides an authoritative diagnostic snapshot of connection, chart state,
 * generation, queue depths, and loaded entities.
 */
export async function getChartState() {
  const snapshot = await getChartSnapshot().catch(() => null);
  const connState = getConnectionState();
  const cdpStats = cdpQueue.stats;
  const txStats = chartTxQueue.stats;

  return {
    success: true,
    connection: connState,
    generation: chartStateManager.getGeneration(),
    targetId: snapshot?.targetId || null,
    symbol: snapshot?.symbol || '',
    timeframe: snapshot?.timeframe || '',
    resolution: snapshot?.resolution || '',
    dataReady: !!snapshot?.dataReady,
    barCount: snapshot?.barCount || 0,
    lastBarTime: snapshot?.lastBarTime || null,
    lastBarClose: snapshot?.lastBarClose || null,
    queue: {
      cdpQueueDepth: cdpStats.depth,
      cdpProcessed: cdpStats.processed,
      txQueueDepth: txStats.depth,
      txProcessed: txStats.processed,
    },
    snapshot,
  };
}

/**
 * Returns comprehensive, high-level market context in a single call.
 */
export async function getMarketContext({
  candleCount = 100,
  includeZones = true,
  includeIndicators = true,
  includeStructure = true,
  expectedSymbol = null,
  expectedTf = null,
} = {}) {
  const ohlcv = await getOhlcv({
    count: candleCount,
    expectedSymbol,
    expectedTf,
  });

  const candles = ohlcv.candles || [];
  const symbol = ohlcv.symbol || 'unknown';
  const timeframe = ohlcv.timeframe || ohlcv.resolution || 'unknown';

  // 1. Market summary
  const lastCandle = candles[candles.length - 1];
  const market = {
    symbol,
    timeframe,
    currentPrice: lastCandle ? lastCandle.close : null,
    barClosed: ohlcv.barClosed,
    firstTimestamp: ohlcv.firstTimestamp,
    lastTimestamp: ohlcv.lastTimestamp,
    barCount: candles.length,
  };

  // 2. Regime
  const regimeData = classifyMarketRegime(candles);

  // 3. Volume
  const volumeData = analyzeVolume(candles);

  // 4. Indicators (if requested)
  let indicators = null;
  let divergences = [];
  if (includeIndicators) {
    indicators = extractNormalizedIndicators({ candles, timeframe, symbol });
    divergences = detectDivergences(candles);
  }

  // 5. Structure (if requested)
  let structure = null;
  if (includeStructure) {
    structure = analyzeMarketStructure(candles);
  }

  // 6. Zones (if requested)
  let zones = [];
  if (includeZones) {
    zones = detectZones(candles);
  }

  return {
    success: true,
    symbol,
    timeframe,
    market,
    regime: regimeData.regime,
    regimeMetrics: regimeData,
    trend: structure ? structure.trend : 'neutral',
    volume: volumeData,
    divergences,
    structure,
    indicators,
    zones,
    dataQuality: ohlcv.dataQuality,
    provenance: ohlcv.provenance,
  };
}

/**
 * Detects market structure (swings, HH/HL/LH/LL, BOS, CHoCH, range).
 */
export async function detectMarketStructureContext({ candleCount = 100 } = {}) {
  const ohlcv = await getOhlcv({ count: candleCount });
  const structure = analyzeMarketStructure(ohlcv.candles || []);
  return {
    success: true,
    symbol: ohlcv.symbol,
    timeframe: ohlcv.timeframe,
    ...structure,
    dataQuality: ohlcv.dataQuality,
    provenance: ohlcv.provenance,
  };
}

/**
 * Detects support/resistance and consolidation zones.
 */
export async function detectZonesContext({ candleCount = 100, tolerancePct = 0.005, minTouches = 2 } = {}) {
  const ohlcv = await getOhlcv({ count: candleCount });
  const zones = detectZones(ohlcv.candles || [], { tolerancePct, minTouches });
  return {
    success: true,
    symbol: ohlcv.symbol,
    timeframe: ohlcv.timeframe,
    zoneCount: zones.length,
    zones,
    dataQuality: ohlcv.dataQuality,
    provenance: ohlcv.provenance,
  };
}

/**
 * Multi-timeframe alignment comparison.
 * Synthesizes higher timeframe candles or reads multi-timeframe structures.
 */
export async function compareTimeframesContext({
  timeframes = ['1D', '4H', '1H', '15m', '5m'],
  candleCount = 300,
} = {}) {
  const ohlcv = await getOhlcv({ count: candleCount });
  const baseCandles = ohlcv.candles || [];
  const baseTfSec = timeframeToSeconds(ohlcv.timeframe || '15');

  const tfCandleMap = {};
  tfCandleMap[ohlcv.timeframe || 'current'] = baseCandles;

  for (const tf of timeframes) {
    const targetSec = timeframeToSeconds(tf);
    if (targetSec > baseTfSec) {
      const agg = aggregateCandles(baseCandles, targetSec);
      if (agg.length >= 5) {
        tfCandleMap[tf] = agg;
      }
    }
  }

  const tfKeys = Object.keys(tfCandleMap);
  const tfAnalysisMap = {};

  for (const tf of tfKeys) {
    const candles = tfCandleMap[tf];
    const indicators = extractNormalizedIndicators({ candles, timeframe: tf });
    const structure = analyzeMarketStructure(candles);
    const regime = classifyMarketRegime(candles);
    const volume = analyzeVolume(candles);

    tfAnalysisMap[tf] = {
      timeframe: tf,
      barCount: candles.length,
      lastBarTime: candles[candles.length - 1]?.time,
      close: candles[candles.length - 1]?.close,
      regime: regime.regime,
      trend: structure.trend,
      rsi: indicators.RSI ? indicators.RSI.value : null,
      adx: regime.adx,
      rvol: volume.relativeVolume,
      range: structure.range,
    };
  }

  const alignment = evaluateTimeframeAlignment(tfAnalysisMap);

  return {
    success: true,
    symbol: ohlcv.symbol,
    baseTimeframe: ohlcv.timeframe,
    timeframes: tfAnalysisMap,
    alignment,
    dataQuality: ohlcv.dataQuality,
    provenance: ohlcv.provenance,
  };
}

/**
 * Returns recent market structural shifts and anomalies since a timestamp or generation.
 */
export async function getRecentChanges({ sinceTimestamp = 0, sinceGeneration = 0 } = {}) {
  const ohlcv = await getOhlcv({ count: 100 });
  const candles = ohlcv.candles || [];
  const structure = analyzeMarketStructure(candles);
  const volume = analyzeVolume(candles);
  const divergences = detectDivergences(candles);
  const currentGen = chartStateManager.getGeneration();

  // Filter events newer than sinceTimestamp
  const recentEvents = (structure.events || []).filter(e => e.timestamp > sinceTimestamp);
  const recentSwings = (structure.swings || []).filter(s => s.time > sinceTimestamp);
  const recentDivergences = divergences.filter(d => d.timestamp > sinceTimestamp);

  return {
    success: true,
    symbol: ohlcv.symbol,
    timeframe: ohlcv.timeframe,
    currentGeneration: currentGen,
    generationsElapsed: Math.max(0, currentGen - sinceGeneration),
    changesDetected: {
      newSwings: recentSwings,
      newStructuralEvents: recentEvents,
      recentDivergences,
      volumeAnomaly: volume.anomaly,
      relativeVolume: volume.relativeVolume,
    },
    provenance: ohlcv.provenance,
  };
}
