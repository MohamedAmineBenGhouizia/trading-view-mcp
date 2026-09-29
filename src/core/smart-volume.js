/**
 * Smart Institutional Activity & Volume Service.
 * Orchestrates OHLCV data retrieval, feed verification, single & multi-timeframe
 * smart volume evaluation, and structured JSON output generation.
 */

import { getOhlcv } from './data.js';
import { chartStateManager } from './state-manager.js';
import {
  analyzeSmartVolume,
  analyzeMultiTimeframeSmartVolume,
  isTickVolumeFeed,
  getVolumeLimitationNotice,
} from '../analysis/smart-volume.js';
import { aggregateCandles, timeframeToSeconds } from '../analysis/multi-timeframe.js';

/**
 * Service function to retrieve and analyze smart institutional volume activity.
 *
 * @param {object} params
 * @param {number} [params.count=100] Number of candles to analyze
 * @param {number} [params.lookback=100] Statistical rolling lookback
 * @param {number} [params.sensitivity=1.0] Detection sensitivity multiplier
 * @param {string} [params.session='AUTO'] Session filter ('AUTO' or explicit)
 * @param {boolean} [params.includeMultiTimeframe=false] Whether to compute multi-timeframe alignment
 * @param {string} [params.expectedSymbol] Optional symbol assertion
 * @param {string} [params.expectedTf] Optional timeframe assertion
 * @returns {Promise<object>} Structured analysis adhering to Section 24 specification
 */
export async function getSmartVolumeAnalysis({
  count = 100,
  lookback = 100,
  sensitivity = 1.0,
  session = 'AUTO',
  includeMultiTimeframe = false,
  expectedSymbol = null,
  expectedTf = null,
} = {}) {
  const effectiveCount = Math.max(count, Math.min(lookback, 300));
  const ohlcv = await getOhlcv({
    count: effectiveCount,
    expectedSymbol,
    expectedTf,
  });

  const chartSnapshot = chartStateManager.getSnapshot();
  const candles = ohlcv.candles || [];
  const symbol = ohlcv.symbol || ohlcv.provenance?.symbol || expectedSymbol || chartSnapshot?.symbol || 'unknown';
  const timeframe = ohlcv.timeframe || ohlcv.resolution || ohlcv.provenance?.timeframe || expectedTf || chartSnapshot?.timeframe || 'unknown';


  // 1. Core single-timeframe smart volume analysis
  const analysis = analyzeSmartVolume(candles, {
    symbol,
    timeframe,
    lookback,
    baselineLength: 20,
    dataQuality: ohlcv.dataQuality,
  });

  // 2. Multi-Timeframe Alignment (if requested)
  let multiTimeframe = null;
  if (includeMultiTimeframe) {
    const baseTfSec = timeframeToSeconds(timeframe);
    const targetTfs = ['1D', '4H', '1H', '15m', '5m'];
    const tfCandleMap = {};
    tfCandleMap[timeframe] = candles;

    for (const tf of targetTfs) {
      const targetSec = timeframeToSeconds(tf);
      if (targetSec > baseTfSec && candles.length >= 20) {
        const aggregated = aggregateCandles(candles, targetSec);
        if (aggregated.length >= 5) {
          tfCandleMap[tf] = aggregated;
        }
      }
    }

    const mtfAnalysis = analyzeMultiTimeframeSmartVolume(tfCandleMap, {
      symbol,
      lookback: 50,
      baselineLength: 14,
      dataQuality: ohlcv.dataQuality,
    });

    // Extract summary per timeframe
    const mtfSummary = {};
    for (const [tfKey, tfRes] of Object.entries(mtfAnalysis.timeframes)) {
      mtfSummary[tfKey] = {
        direction: tfRes.activity.direction,
        classification: tfRes.activity.classification,
        score: tfRes.activity.score,
        rvol: tfRes.metrics.rvol,
        volumePercentile: tfRes.metrics.volumePercentile,
        robustZScore: tfRes.metrics.robustZScore,
      };
    }

    multiTimeframe = {
      alignment: mtfAnalysis.alignment,
      consensus: mtfAnalysis.counts,
      timeframes: mtfSummary,
    };
  }

  return {
    success: true,
    symbol,
    timeframe,
    volumeType: analysis.volumeType,
    session: session === 'AUTO' ? analysis.session : session,
    activity: analysis.activity,
    components: analysis.components,
    metrics: analysis.metrics,
    patterns: analysis.patterns,
    structure: analysis.structure,
    evidence: analysis.evidence,
    limitations: analysis.limitations,
    ...(multiTimeframe ? { multiTimeframe } : {}),
    dataQuality: ohlcv.dataQuality,
    provenance: ohlcv.provenance,
  };
}
