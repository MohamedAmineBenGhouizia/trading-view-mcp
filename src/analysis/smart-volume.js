/**
 * Smart Institutional Activity & Volume Analysis Engine.
 *
 * Implements a statistically robust market-volume analysis framework:
 * - Robust relative volume (RVOL, rolling median, MAD, robust z-score)
 * - Volume percentiles (P50, P75, P90, P95, P99)
 * - Candle microstructure features (range, true range, body ratio, wick ratios, close location)
 * - Effort vs Result modeling (normalized volume vs normalized displacement)
 * - Range expansion / contraction classification
 * - Heuristic pattern detectors:
 *   - Absorption-like behavior
 *   - Initiative moves
 *   - Exhaustion
 *   - Liquidity sweeps (swing high/low interaction)
 *   - Breakout confirmation / failure
 *   - Accumulation-like & Distribution-like behavior
 * - Multi-component explainable Smart Activity Score (0-100)
 * - Session awareness (Asia, London, New York, London/NY overlap)
 * - Feed volume type transparency (Tick Volume vs Centralized Transaction Volume)
 *
 * Note: Never assumes direct observation of institutional orders. On OTC/CFD feeds
 * (such as OANDA:XAUUSD), volume represents tick activity (price updates), so all
 * signals represent inferred/heuristic behavioral proxies.
 */

import { calculateATR, calculateSMA, calculateRSI } from './technical-indicators.js';
import { detectSwings, classifySwings } from './market-structure.js';
import { detectZones } from './zones.js';

// ============================================================================
// 1. STATISTICAL & ROBUST RELATIVE VOLUME PRIMITIVES
// ============================================================================

/**
 * Computes the sample median of a numeric array.
 * @param {number[]} values
 * @returns {number}
 */
export function calculateMedian(values) {
  if (!values || values.length === 0) return 0;
  const valid = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes the Median Absolute Deviation (MAD) from median.
 * MAD = median(|x_i - median(X)|)
 * @param {number[]} values
 * @param {number} [medianVal]
 * @returns {number}
 */
export function calculateMAD(values, medianVal = null) {
  if (!values || values.length === 0) return 0;
  const valid = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return 0;
  const med = medianVal !== null && Number.isFinite(medianVal) ? medianVal : calculateMedian(valid);
  const absDeviations = valid.map(v => Math.abs(v - med));
  return calculateMedian(absDeviations);
}

/**
 * Computes robust z-score using median and MAD with finite scale factor 1.4826:
 * robustZ = (x - median) / (1.4826 * MAD)
 * Handles zero MAD gracefully by falling back to Mean Absolute Deviation or 0.
 * @param {number} value
 * @param {number} median
 * @param {number} mad
 * @returns {number}
 */
export function calculateRobustZScore(value, median, mad) {
  if (!Number.isFinite(value) || !Number.isFinite(median)) return 0;
  if (!Number.isFinite(mad) || mad <= 1e-9) {
    // If MAD is zero (e.g. >= 50% identical values), return 0 if equal, or bounded step
    const diff = value - median;
    if (Math.abs(diff) < 1e-9) return 0;
    return diff > 0 ? 1.0 : -1.0;
  }
  const z = (value - median) / (1.4826 * mad);
  return Number.isFinite(z) ? Math.round(z * 100) / 100 : 0;
}

/**
 * Computes the percentile rank (0-100) of a value against a historical sample.
 * @param {number} value
 * @param {number[]} sample
 * @returns {number}
 */
export function calculatePercentile(value, sample) {
  if (!sample || sample.length === 0 || !Number.isFinite(value)) return 50;
  const valid = sample.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return 50;
  let countBelow = 0;
  let countEqual = 0;
  for (const v of valid) {
    if (v < value) countBelow++;
    else if (Math.abs(v - value) < 1e-9) countEqual++;
  }
  // Standard mid-rank percentile
  const rank = (countBelow + 0.5 * countEqual) / valid.length;
  return Math.min(100, Math.max(0, Math.round(rank * 1000) / 10));
}

/**
 * Classifies volume percentile into standardized descriptive tiers.
 * @param {number} percentile
 * @returns {'NORMAL'|'ELEVATED'|'HIGH'|'EXTREME'}
 */
export function classifyVolumeTier(percentile) {
  if (percentile >= 99) return 'EXTREME';
  if (percentile >= 90) return 'HIGH';
  if (percentile >= 75) return 'ELEVATED';
  return 'NORMAL';
}

// ============================================================================
// 2. CANDLE MICROSTRUCTURE ANALYSIS
// ============================================================================

/**
 * Extracts normalized microstructure geometry from a candle bar.
 * Guaranteed no NaN or Infinity outputs.
 * @param {{open: number, high: number, low: number, close: number, volume?: number, time: number}} candle
 * @param {{close: number}} [prevCandle]
 * @returns {object}
 */
export function calculateCandleMicrostructure(candle, prevCandle = null) {
  const open = Number.isFinite(candle?.open) ? candle.open : 0;
  const high = Number.isFinite(candle?.high) ? candle.high : open;
  const low = Number.isFinite(candle?.low) ? candle.low : open;
  const close = Number.isFinite(candle?.close) ? candle.close : open;
  const volume = Number.isFinite(candle?.volume) ? Math.max(0, candle.volume) : 0;

  const range = Math.max(0, high - low);
  const prevClose = prevCandle && Number.isFinite(prevCandle.close) ? prevCandle.close : open;
  const trueRange = Math.max(range, Math.abs(high - prevClose), Math.abs(low - prevClose));

  const body = Math.abs(close - open);
  const epsilon = 1e-7;
  const effectiveRange = Math.max(range, epsilon);

  const bodyRatio = Math.min(1, Math.max(0, body / effectiveRange));
  const upperWick = Math.max(0, high - Math.max(open, close));
  const lowerWick = Math.max(0, Math.min(open, close) - low);
  const upperWickRatio = Math.min(1, Math.max(0, upperWick / effectiveRange));
  const lowerWickRatio = Math.min(1, Math.max(0, lowerWick / effectiveRange));

  const closeLocation = Math.min(1, Math.max(0, (close - low) / effectiveRange));
  const openLocation = Math.min(1, Math.max(0, (open - low) / effectiveRange));

  let direction = 'NEUTRAL';
  if (close > open + epsilon) direction = 'BULLISH';
  else if (close < open - epsilon) direction = 'BEARISH';

  return {
    open,
    high,
    low,
    close,
    volume,
    range: Math.round(range * 1000) / 1000,
    trueRange: Math.round(trueRange * 1000) / 1000,
    body: Math.round(body * 1000) / 1000,
    bodyRatio: Math.round(bodyRatio * 1000) / 1000,
    upperWick: Math.round(upperWick * 1000) / 1000,
    lowerWick: Math.round(lowerWick * 1000) / 1000,
    upperWickRatio: Math.round(upperWickRatio * 1000) / 1000,
    lowerWickRatio: Math.round(lowerWickRatio * 1000) / 1000,
    closeLocation: Math.round(closeLocation * 1000) / 1000,
    openLocation: Math.round(openLocation * 1000) / 1000,
    direction,
  };
}

// ============================================================================
// 3. EFFORT VS RESULT MODELING & RANGE EXPANSION
// ============================================================================

/**
 * Evaluates the Wyckoffian effort vs result relationship.
 * Effort = Normalized volume (RVOL)
 * Result = Normalized displacement (body / ATR)
 * @param {object} micro Microstructure of the bar
 * @param {number} rvol Relative volume ratio
 * @param {number} atr Average True Range
 * @returns {object}
 */
export function calculateEffortVsResult(micro, rvol, atr) {
  const effort = Number.isFinite(rvol) && rvol >= 0 ? rvol : 1.0;
  const safeAtr = Number.isFinite(atr) && atr > 1e-5 ? atr : Math.max(micro.trueRange, 1.0);
  const result = Math.round((micro.body / safeAtr) * 1000) / 1000;
  const effortResultRatio = Math.round((effort / Math.max(result, 0.05)) * 100) / 100;

  let classification = 'NORMAL_CONSOLIDATION';
  if (effort >= 1.5 && result >= 0.9) {
    classification = 'HIGH_EFFORT_HIGH_RESULT'; // Initiative displacement
  } else if (effort >= 1.5 && result < 0.5) {
    classification = 'HIGH_EFFORT_LOW_RESULT';  // Potential absorption or exhaustion
  } else if (effort < 0.8 && result >= 0.9) {
    classification = 'LOW_EFFORT_HIGH_RESULT';   // Low participation displacement / slippage
  } else if (effort < 0.8 && result < 0.5) {
    classification = 'LOW_EFFORT_LOW_RESULT';    // Dull consolidation
  }

  return {
    effort: Math.round(effort * 100) / 100,
    result,
    effortResultRatio,
    classification,
  };
}

/**
 * Classifies range expansion against historical ATR.
 * @param {number} range
 * @param {number} atr
 * @returns {{atrRatio: number, classification: 'NORMAL_RANGE'|'EXPANSION'|'EXTREME_EXPANSION'|'CONTRACTION'}}
 */
export function classifyRangeExpansion(range, atr) {
  const safeAtr = Number.isFinite(atr) && atr > 1e-5 ? atr : Math.max(range, 1.0);
  const atrRatio = Math.round((range / safeAtr) * 100) / 100;

  let classification = 'NORMAL_RANGE';
  if (atrRatio >= 2.0) classification = 'EXTREME_EXPANSION';
  else if (atrRatio >= 1.25) classification = 'EXPANSION';
  else if (atrRatio <= 0.6) classification = 'CONTRACTION';

  return { atrRatio, classification };
}

// ============================================================================
// 4. SESSION AWARENESS (GOLD / FX LIQUIDITY WINDOWS)
// ============================================================================

/**
 * Determines trading session from timestamp (UTC seconds or milliseconds).
 * @param {number} timestamp
 * @param {object} [customConfig]
 * @returns {'ASIA'|'LONDON'|'NEW_YORK'|'LONDON_NY_OVERLAP'|'OFF_HOURS'}
 */
export function determineSession(timestamp, customConfig = {}) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'OFF_HOURS';
  // Normalize seconds to ms if needed
  const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  const date = new Date(ms);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const timeDecimal = hour + minute / 60;

  const overlapStart = customConfig.overlapStart ?? 12.0;
  const overlapEnd = customConfig.overlapEnd ?? 16.0;
  const londonStart = customConfig.londonStart ?? 7.0;
  const londonEnd = customConfig.londonEnd ?? 16.0;
  const nyStart = customConfig.nyStart ?? 12.0;
  const nyEnd = customConfig.nyEnd ?? 21.0;
  const asiaStart = customConfig.asiaStart ?? 0.0;
  const asiaEnd = customConfig.asiaEnd ?? 8.0;

  if (timeDecimal >= overlapStart && timeDecimal < overlapEnd) {
    return 'LONDON_NY_OVERLAP';
  }
  if (timeDecimal >= londonStart && timeDecimal < londonEnd) {
    return 'LONDON';
  }
  if (timeDecimal >= nyStart && timeDecimal < nyEnd) {
    return 'NEW_YORK';
  }
  if (timeDecimal >= asiaStart && timeDecimal < asiaEnd) {
    return 'ASIA';
  }
  return 'OFF_HOURS';
}

// ============================================================================
// 5. HEURISTIC PATTERN DETECTORS (NON-PREDICTIVE BEHAVIORAL PROXIES)
// ============================================================================

/**
 * Detects absorption-like behavior on a bar.
 * Conditions: Elevated/high effort, limited directional result, significant rejection wick,
 * and proximity or interaction with structural level.
 * @param {object} params
 * @returns {object|null}
 */
export function detectAbsorptionPattern({ micro, rvol, robustZ, evr, zones = [], swings = [] }) {
  const isHighEffort = rvol >= 1.4 || robustZ >= 1.3;
  if (!isHighEffort) return null;

  // Bullish absorption: aggressive selling absorbed, long lower wick, close in upper 50%
  const isBullishAbsorption =
    micro.lowerWickRatio >= 0.35 &&
    micro.closeLocation >= 0.45 &&
    evr.effortResultRatio >= 1.4;

  // Bearish absorption: aggressive buying absorbed, long upper wick, close in lower 50%
  const isBearishAbsorption =
    micro.upperWickRatio >= 0.35 &&
    micro.closeLocation <= 0.55 &&
    evr.effortResultRatio >= 1.4;

  if (!isBullishAbsorption && !isBearishAbsorption) return null;

  const direction = isBullishAbsorption ? 'BULLISH' : 'BEARISH';
  const wickRatio = isBullishAbsorption ? micro.lowerWickRatio : micro.upperWickRatio;

  // Proximity to support/resistance or swing levels increases confidence
  let levelInteraction = false;
  let interactingLevel = null;
  const priceToTest = isBullishAbsorption ? micro.low : micro.high;

  for (const z of zones) {
    if (priceToTest >= z.low * 0.998 && priceToTest <= z.high * 1.002) {
      levelInteraction = true;
      interactingLevel = `${z.type} zone (${z.low}-${z.high})`;
      break;
    }
  }

  if (!levelInteraction) {
    for (const sw of swings.slice(-4)) {
      if (Math.abs(priceToTest - sw.price) / sw.price <= 0.003) {
        levelInteraction = true;
        interactingLevel = `swing ${sw.type} (${sw.price})`;
        break;
      }
    }
  }

  let confidence = 0.50;
  if (rvol >= 2.0 || robustZ >= 2.0) confidence += 0.20;
  if (wickRatio >= 0.50) confidence += 0.15;
  if (levelInteraction) confidence += 0.15;
  confidence = Math.min(1.0, Math.round(confidence * 100) / 100);

  return {
    type: 'ABSORPTION_LIKE',
    direction,
    confidence,
    evidence: {
      rvol,
      robustZ,
      effortResultRatio: evr.effortResultRatio,
      wickRatio,
      closeLocation: micro.closeLocation,
      interactingLevel,
      levelInteraction,
    },
  };
}

/**
 * Detects candidate initiative moves.
 * Conditions: Elevated volume, range expansion, strong body, close near extreme.
 * @param {object} params
 * @returns {object|null}
 */
export function detectInitiativePattern({ micro, rvol, robustZ, rangeExpansion, lastEvent = null }) {
  const isVolumeExpansion = rvol >= 1.4 || robustZ >= 1.3;
  const isRangeExpansion = rangeExpansion.atrRatio >= 1.2;
  const isStrongBody = micro.bodyRatio >= 0.55;

  if (!isVolumeExpansion || !isRangeExpansion || !isStrongBody) return null;

  let direction = null;
  if (micro.direction === 'BULLISH' && micro.closeLocation >= 0.70) {
    direction = 'BULLISH';
  } else if (micro.direction === 'BEARISH' && micro.closeLocation <= 0.30) {
    direction = 'BEARISH';
  }

  if (!direction) return null;

  const hasStructuralBreak = lastEvent && lastEvent.direction === direction.toLowerCase();
  let confidence = 0.55;
  if (rvol >= 2.0 || robustZ >= 2.0) confidence += 0.15;
  if (micro.bodyRatio >= 0.70) confidence += 0.15;
  if (hasStructuralBreak) confidence += 0.15;
  confidence = Math.min(1.0, Math.round(confidence * 100) / 100);

  return {
    type: direction === 'BULLISH' ? 'INITIATIVE_BULLISH' : 'INITIATIVE_BEARISH',
    direction,
    confidence,
    evidence: {
      rvol,
      robustZ,
      atrRatio: rangeExpansion.atrRatio,
      bodyRatio: micro.bodyRatio,
      closeLocation: micro.closeLocation,
      hasStructuralBreak: !!hasStructuralBreak,
    },
  };
}

/**
 * Detects potential exhaustion.
 * Conditions: Extreme volume spike, wide range, closing far from the directional extreme.
 * @param {object} params
 * @returns {object|null}
 */
export function detectExhaustionPattern({ micro, rvol, robustZ, percentile, rangeExpansion, zones = [] }) {
  const isExtremeVolume = rvol >= 2.0 || robustZ >= 2.2 || percentile >= 92;
  const isExpandedRange = rangeExpansion.atrRatio >= 1.3;

  if (!isExtremeVolume || !isExpandedRange) return null;

  // Bullish exhaustion (exhaustion of buying pressure at top)
  const isBullishExhaustion = micro.upperWickRatio >= 0.35 && micro.closeLocation <= 0.50;
  // Bearish exhaustion (exhaustion of selling pressure at bottom)
  const isBearishExhaustion = micro.lowerWickRatio >= 0.35 && micro.closeLocation >= 0.50;

  if (!isBullishExhaustion && !isBearishExhaustion) return null;

  const direction = isBullishExhaustion ? 'BEARISH' : 'BULLISH'; // Implication
  const type = isBullishExhaustion ? 'EXHAUSTION_BULLISH' : 'EXHAUSTION_BEARISH';

  let confidence = 0.55;
  if (percentile >= 95 || robustZ >= 2.5) confidence += 0.20;
  if (micro.upperWickRatio >= 0.50 || micro.lowerWickRatio >= 0.50) confidence += 0.15;
  confidence = Math.min(1.0, Math.round(confidence * 100) / 100);

  return {
    type,
    direction,
    confidence,
    evidence: {
      rvol,
      robustZ,
      percentile,
      atrRatio: rangeExpansion.atrRatio,
      closeLocation: micro.closeLocation,
      upperWickRatio: micro.upperWickRatio,
      lowerWickRatio: micro.lowerWickRatio,
    },
  };
}

/**
 * Detects liquidity sweeps of previous swing highs/lows.
 * A sweep occurs when price probes beyond an established swing level but closes back inside.
 * @param {object} candle Microstructure and raw prices
 * @param {Array<object>} swings Classified historical swings
 * @param {number} rvol
 * @param {number} robustZ
 * @returns {object|null}
 */
export function detectLiquiditySweepPattern(candle, swings = [], rvol = 1.0, robustZ = 0) {
  if (!swings || swings.length === 0) return null;

  // Look at recent confirmed swing highs and lows
  const swingHighs = swings.filter(s => s.type === 'high').slice(-3);
  const swingLows = swings.filter(s => s.type === 'low').slice(-3);

  // 1. Bearish liquidity sweep (ran above swing high, closed back below)
  for (const sh of swingHighs) {
    if (candle.high > sh.price && candle.close < sh.price) {
      const wickDistance = Math.round((candle.high - sh.price) * 100) / 100;
      const volumeAnomaly = rvol >= 1.3 || robustZ >= 1.2;
      return {
        type: 'BEARISH_LIQUIDITY_SWEEP',
        direction: 'BEARISH',
        confidence: volumeAnomaly ? 0.80 : 0.60,
        sweptLevel: sh.price,
        wickDistance,
        volumeAnomaly,
        closeLocation: candle.closeLocation,
        structureReference: `Swing High at index ${sh.index} (${sh.price})`,
      };
    }
  }

  // 2. Bullish liquidity sweep (ran below swing low, closed back above)
  for (const sl of swingLows) {
    if (candle.low < sl.price && candle.close > sl.price) {
      const wickDistance = Math.round((sl.price - candle.low) * 100) / 100;
      const volumeAnomaly = rvol >= 1.3 || robustZ >= 1.2;
      return {
        type: 'BULLISH_LIQUIDITY_SWEEP',
        direction: 'BULLISH',
        confidence: volumeAnomaly ? 0.80 : 0.60,
        sweptLevel: sl.price,
        wickDistance,
        volumeAnomaly,
        closeLocation: candle.closeLocation,
        structureReference: `Swing Low at index ${sl.index} (${sl.price})`,
      };
    }
  }

  return null;
}

/**
 * Detects Breakout Confirmation vs Failed Breakout.
 * Distinguishes confirmed breakouts from single-wick probes.
 * @param {Array<object>} candles Last N candles
 * @param {Array<object>} zones
 * @param {Array<object>} swings
 * @returns {object|null}
 */
export function detectBreakoutStatus(candles, zones = [], swings = []) {
  if (!candles || candles.length < 2) return null;
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // Inspect recent resistance and support zones
  for (const z of zones) {
    // Bullish breakout confirmation: prev closed above zone, current holds above
    if (prev.close > z.high && current.close > z.high && current.low >= z.mid * 0.999) {
      return {
        type: 'BREAKOUT_CONFIRMATION',
        direction: 'BULLISH',
        confidence: 0.82,
        level: z.high,
        zoneType: 'RESISTANCE',
        evidence: 'Sustained close and retest hold above resistance zone',
      };
    }
    // Failed bullish breakout: prev or current pierced above zone but closed back inside
    if (current.high > z.high && current.close < z.high) {
      return {
        type: 'FAILED_BREAKOUT',
        direction: 'BEARISH',
        confidence: 0.75,
        level: z.high,
        zoneType: 'RESISTANCE',
        evidence: 'Pierced resistance high but failed to close above; closed back inside zone',
      };
    }
    // Bearish breakout confirmation: prev closed below zone, current holds below
    if (prev.close < z.low && current.close < z.low && current.high <= z.mid * 1.001) {
      return {
        type: 'BREAKOUT_CONFIRMATION',
        direction: 'BEARISH',
        confidence: 0.82,
        level: z.low,
        zoneType: 'SUPPORT',
        evidence: 'Sustained close and rejection below support zone',
      };
    }
    // Failed bearish breakout: pierced below zone but closed back inside
    if (current.low < z.low && current.close > z.low) {
      return {
        type: 'FAILED_BREAKOUT',
        direction: 'BULLISH',
        confidence: 0.75,
        level: z.low,
        zoneType: 'SUPPORT',
        evidence: 'Pierced support low but failed to close below; closed back inside zone',
      };
    }
  }

  return null;
}

/**
 * Detects heuristic Accumulation-like and Distribution-like multi-bar behavior.
 * Evaluates repeated absorption, boundary defense, close clustering, and volume shifts.
 * Note: Strictly reported as "ACCUMULATION_LIKE" or "DISTRIBUTION_LIKE" proxy.
 * @param {Array<object>} candles
 * @param {Array<object>} swings
 * @param {Array<object>} zones
 * @param {number} [window=20]
 * @returns {object|null}
 */
export function detectAccumulationDistribution(candles, swings = [], zones = [], window = 20) {
  if (!candles || candles.length < window) return null;
  const slice = candles.slice(-window);

  let lowerWickSum = 0;
  let upperWickSum = 0;
  let bullishCloses = 0;
  let highVolumeRejections = 0;

  for (let i = 0; i < slice.length; i++) {
    const c = slice[i];
    const prev = i > 0 ? slice[i - 1] : null;
    const micro = calculateCandleMicrostructure(c, prev);
    lowerWickSum += micro.lowerWickRatio;
    upperWickSum += micro.upperWickRatio;
    if (micro.direction === 'BULLISH') bullishCloses++;
    if ((micro.lowerWickRatio > 0.4 || micro.upperWickRatio > 0.4) && micro.volume > 0) {
      highVolumeRejections++;
    }
  }

  const avgLowerWickRatio = lowerWickSum / slice.length;
  const avgUpperWickRatio = upperWickSum / slice.length;
  const bullishClosePct = bullishCloses / slice.length;

  // Accumulation-like heuristic: persistent lower wicks, positive close skew, holding support
  if (avgLowerWickRatio > 0.28 && bullishClosePct >= 0.50 && avgLowerWickRatio > avgUpperWickRatio * 1.3) {
    return {
      type: 'ACCUMULATION_LIKE',
      direction: 'BULLISH',
      confidence: Math.min(0.85, Math.round((0.50 + avgLowerWickRatio) * 100) / 100),
      evidence: [
        `Elevated average lower wick ratio (${Math.round(avgLowerWickRatio * 100)}%) across ${window} bars`,
        `Positive bar close distribution (${Math.round(bullishClosePct * 100)}% bullish closes)`,
        `Support boundary preservation with multiple absorption wicks (${highVolumeRejections} rejection events)`,
      ],
    };
  }

  // Distribution-like heuristic: persistent upper wicks, negative close skew, capping resistance
  if (avgUpperWickRatio > 0.28 && bullishClosePct <= 0.45 && avgUpperWickRatio > avgLowerWickRatio * 1.3) {
    return {
      type: 'DISTRIBUTION_LIKE',
      direction: 'BEARISH',
      confidence: Math.min(0.85, Math.round((0.50 + avgUpperWickRatio) * 100) / 100),
      evidence: [
        `Elevated average upper wick ratio (${Math.round(avgUpperWickRatio * 100)}%) across ${window} bars`,
        `Negative bar close distribution (${Math.round((1 - bullishClosePct) * 100)}% bearish/neutral closes)`,
        `Resistance boundary defense with repeated supply absorption (${highVolumeRejections} rejection events)`,
      ],
    };
  }

  return null;
}

// ============================================================================
// 6. COMPOSITE SMART ACTIVITY SCORE & CONFIDENCE
// ============================================================================

/**
 * Calculates transparent, explainable Smart Activity Score (0-100).
 * Never an opaque black box: all constituent scores are exposed.
 * @param {object} params
 * @returns {{score: number, components: object}}
 */
export function calculateSmartActivityScore({
  robustZ,
  volumePercentile,
  rvol,
  evr,
  rangeExpansion,
  micro,
  pattern,
  levelInteraction,
  sampleSize,
  dataQuality,
}) {
  // 1. Volume Anomaly Score (0-100)
  const zClamped = Math.min(3.5, Math.max(0, robustZ));
  const zPart = (zClamped / 3.5) * 50;
  const pctPart = (volumePercentile / 100) * 50;
  const volumeAnomaly = Math.round(zPart + pctPart);

  // 2. Effort vs Result Score (0-100)
  let effortResult = 50;
  if (evr.classification === 'HIGH_EFFORT_LOW_RESULT' || evr.classification === 'HIGH_EFFORT_HIGH_RESULT') {
    effortResult = Math.min(100, Math.round(50 + Math.min(50, evr.effort * 25)));
  } else if (evr.classification === 'LOW_EFFORT_HIGH_RESULT') {
    effortResult = 40;
  }

  // 3. Range Expansion Score (0-100)
  const rangeExpansionScore = Math.min(100, Math.round(Math.min(3.0, rangeExpansion.atrRatio) * 33.3));

  // 4. Rejection Score (0-100)
  const maxWick = Math.max(micro.upperWickRatio, micro.lowerWickRatio);
  const rejection = Math.min(100, Math.round(maxWick * 120));

  // 5. Structure Interaction Score (0-100)
  const structureInteraction = levelInteraction ? 85 : 40;

  // 6. Pattern Intensity Score (0-100)
  const patternScore = pattern ? Math.round(pattern.confidence * 100) : 30;

  // Composite weighted score
  const composite =
    volumeAnomaly * 0.30 +
    effortResult * 0.20 +
    rangeExpansionScore * 0.15 +
    rejection * 0.15 +
    structureInteraction * 0.10 +
    patternScore * 0.10;

  const score = Math.min(100, Math.max(0, Math.round(composite)));

  return {
    score,
    components: {
      volumeAnomaly,
      effortResult,
      rangeExpansion: rangeExpansionScore,
      rejection,
      structureInteraction,
      pattern: patternScore,
    },
  };
}

/**
 * Computes bounded confidence (0.0 - 1.0) based on sample depth,
 * signal consistency, and data quality.
 * @param {object} params
 * @returns {number}
 */
export function calculateConfidence({ sampleSize, dataQuality, robustZ, hasPattern, levelInteraction }) {
  let conf = 0.50;

  // Sample size depth
  if (sampleSize >= 100) conf += 0.20;
  else if (sampleSize >= 50) conf += 0.10;
  else conf -= 0.15;

  // Pattern presence and structural relevance
  if (hasPattern) conf += 0.15;
  if (levelInteraction) conf += 0.10;
  if (Math.abs(robustZ) >= 1.5) conf += 0.05;

  // Data quality penalties
  if (dataQuality?.stale) conf -= 0.10;
  if (!dataQuality?.complete) conf -= 0.20;

  return Math.min(1.0, Math.max(0.10, Math.round(conf * 100) / 100));
}

// ============================================================================
// 7. HIGH-LEVEL DETERMINISTIC ENGINE
// ============================================================================

/**
 * Analyzes smart institutional-style volume activity over OHLCV series.
 * Completely deterministic, non-repainting on closed bars, no look-ahead bias.
 *
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume: number}>} candles
 * @param {object} [options]
 * @param {string} [options.symbol='']
 * @param {string} [options.timeframe='']
 * @param {number} [options.lookback=100]
 * @param {number} [options.baselineLength=20]
 * @param {object} [options.dataQuality]
 * @returns {object} Structured smart volume analysis result
 */
export function analyzeSmartVolume(candles, options = {}) {
  const {
    symbol = '',
    timeframe = '',
    lookback = 100,
    baselineLength = 20,
    dataQuality = { ready: true, complete: true, stale: false },
  } = options;

  // Handle empty or insufficient series
  if (!candles || candles.length === 0) {
    return {
      symbol,
      timeframe,
      volumeType: isTickVolumeFeed(symbol) ? 'TICK_VOLUME' : 'TRANSACTION_VOLUME',
      activity: {
        classification: 'INSUFFICIENT_DATA',
        direction: 'NEUTRAL',
        score: 0,
        confidence: 0.0,
      },
      metrics: {
        rvol: 1.0,
        volumePercentile: 50,
        robustZScore: 0,
        atrNormalizedRange: 0,
        effortResultRatio: 1.0,
      },
      evidence: ['Insufficient candle history to calculate volume statistics'],
      limitations: [getVolumeLimitationNotice(symbol)],
    };
  }

  const sample = candles.slice(-Math.max(lookback, 30));
  const lastIdx = sample.length - 1;
  const currentCandle = sample[lastIdx];
  const prevCandle = lastIdx > 0 ? sample[lastIdx - 1] : null;

  // Volume series extraction
  const volumes = sample.map(c => (Number.isFinite(c.volume) ? Math.max(0, c.volume) : 0));
  const currentVol = volumes[lastIdx];

  // 1. Baseline & Relative Volume (RVOL)
  const volSMA = calculateSMA(volumes, baselineLength);
  const baselineVol = volSMA[lastIdx] || (calculateMedian(volumes) || currentVol);
  const rvol = baselineVol > 0 ? Math.round((currentVol / baselineVol) * 100) / 100 : 1.0;

  // 2. Robust Median & MAD Anomaly Scoring
  const rollingMedian = calculateMedian(volumes);
  const mad = calculateMAD(volumes, rollingMedian);
  const robustZ = calculateRobustZScore(currentVol, rollingMedian, mad);

  // 3. Volume Percentile Ranking
  const volumePercentile = calculatePercentile(currentVol, volumes);
  const volumeTier = classifyVolumeTier(volumePercentile);

  // 4. Candle Microstructure
  const micro = calculateCandleMicrostructure(currentCandle, prevCandle);

  // 5. ATR and Range Expansion
  const highs = sample.map(c => c.high);
  const lows = sample.map(c => c.low);
  const closes = sample.map(c => c.close);
  const atrs = calculateATR(highs, lows, closes, 14);
  const currentAtr = atrs[lastIdx] || (micro.trueRange > 0 ? micro.trueRange : 1.0);
  const rangeExpansion = classifyRangeExpansion(micro.range, currentAtr);

  // 6. Effort vs Result Model
  const evr = calculateEffortVsResult(micro, rvol, currentAtr);

  // 7. Contextual Structure & Zones
  const swings = classifySwings(detectSwings(sample, { left: 3, right: 3 }));
  const zones = detectZones(sample, { minTouches: 2, tolerancePct: 0.005 });

  // 8. Pattern Detection Pipeline
  const absorption = detectAbsorptionPattern({ micro, rvol, robustZ, evr, zones, swings });
  const initiative = detectInitiativePattern({ micro, rvol, robustZ, rangeExpansion });
  const exhaustion = detectExhaustionPattern({ micro, rvol, robustZ, percentile: volumePercentile, rangeExpansion, zones });
  const sweep = detectLiquiditySweepPattern(micro, swings, rvol, robustZ);
  const breakout = detectBreakoutStatus(sample, zones, swings);
  const accumDist = detectAccumulationDistribution(sample, swings, zones, 20);

  // Prioritize primary pattern
  let primaryPattern = null;
  if (sweep) primaryPattern = sweep;
  else if (breakout) primaryPattern = breakout;
  else if (absorption) primaryPattern = absorption;
  else if (initiative) primaryPattern = initiative;
  else if (exhaustion) primaryPattern = exhaustion;
  else if (accumDist) primaryPattern = accumDist;

  // Default classification if no high-conviction pattern triggered
  const classification = primaryPattern?.type || (rvol >= 1.5 ? 'ELEVATED_ACTIVITY' : evr.classification);
  const direction = primaryPattern?.direction || micro.direction;

  // 9. Session Detection
  const session = determineSession(currentCandle.time);

  // 10. Smart Activity Score & Confidence
  const levelInteraction = !!(absorption?.evidence?.levelInteraction || sweep || breakout);
  const { score, components } = calculateSmartActivityScore({
    robustZ,
    volumePercentile,
    rvol,
    evr,
    rangeExpansion,
    micro,
    pattern: primaryPattern,
    levelInteraction,
    sampleSize: sample.length,
    dataQuality,
  });

  const confidence = calculateConfidence({
    sampleSize: sample.length,
    dataQuality,
    robustZ,
    hasPattern: !!primaryPattern,
    levelInteraction,
  });

  // 11. Compile Explainable Evidence List
  const evidence = [];
  if (rvol >= 2.0 || robustZ >= 2.0) {
    evidence.push(`Anomalous relative volume (RVOL: ${rvol}, Robust Z-Score: ${robustZ})`);
  } else if (rvol >= 1.3) {
    evidence.push(`Elevated relative volume (RVOL: ${rvol}, Percentile: P${volumePercentile})`);
  } else if (rvol <= 0.6) {
    evidence.push(`Volume contraction below baseline (RVOL: ${rvol})`);
  }

  if (rangeExpansion.classification !== 'NORMAL_RANGE') {
    evidence.push(`Range ${rangeExpansion.classification.toLowerCase()} (${rangeExpansion.atrRatio}x ATR)`);
  }

  if (evr.classification === 'HIGH_EFFORT_LOW_RESULT') {
    evidence.push('Disproportionate effort with limited price progress (absorption signature)');
  } else if (evr.classification === 'HIGH_EFFORT_HIGH_RESULT') {
    evidence.push('Strong directional displacement supported by volume expansion');
  }

  if (micro.lowerWickRatio >= 0.35) {
    evidence.push(`Pronounced lower rejection wick (${Math.round(micro.lowerWickRatio * 100)}% of range)`);
  } else if (micro.upperWickRatio >= 0.35) {
    evidence.push(`Pronounced upper rejection wick (${Math.round(micro.upperWickRatio * 100)}% of range)`);
  }

  if (primaryPattern) {
    evidence.push(`Pattern detected: ${primaryPattern.type} (${primaryPattern.direction})`);
  }

  if (evidence.length === 0) {
    evidence.push('Standard market activity within normal statistical boundaries');
  }

  const volumeType = isTickVolumeFeed(symbol) ? 'TICK_VOLUME' : 'TRANSACTION_VOLUME';

  return {
    symbol,
    timeframe,
    volumeType,
    session,
    activity: {
      classification,
      direction,
      score,
      confidence,
      tier: volumeTier,
    },
    components,
    metrics: {
      rvol,
      volumePercentile,
      robustZScore: robustZ,
      currentVolume: currentVol,
      baselineVolume: Math.round(baselineVol),
      rollingMedian: Math.round(rollingMedian),
      mad: Math.round(mad),
      atrNormalizedRange: rangeExpansion.atrRatio,
      effortResultRatio: evr.effortResultRatio,
      microstructure: {
        bodyRatio: micro.bodyRatio,
        upperWickRatio: micro.upperWickRatio,
        lowerWickRatio: micro.lowerWickRatio,
        closeLocation: micro.closeLocation,
      },
    },
    patterns: {
      absorption,
      initiative,
      exhaustion,
      liquiditySweep: sweep,
      breakout,
      accumulationDistribution: accumDist,
    },
    structure: {
      activeSwings: swings.slice(-4),
      activeZones: zones.slice(-3),
      levelInteraction,
    },
    evidence,
    limitations: [
      getVolumeLimitationNotice(symbol),
      'Institutional order execution is inferred heuristically from price-volume microstructure; no direct order-book or tape access is implied.',
    ],
  };
}

// ============================================================================
// 8. MULTI-TIMEFRAME ALIGNMENT ENGINE
// ============================================================================

/**
 * Evaluates smart volume consensus across multiple timeframes.
 * Each timeframe is calculated independently and normalized to its own history.
 *
 * @param {Record<string, Array<object>>} tfCandlesMap Map of timeframe string to candles array
 * @param {object} [options]
 * @returns {object}
 */
export function analyzeMultiTimeframeSmartVolume(tfCandlesMap, options = {}) {
  const timeframes = Object.keys(tfCandlesMap);
  const tfResults = {};

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;

  for (const tf of timeframes) {
    const candles = tfCandlesMap[tf] || [];
    const res = analyzeSmartVolume(candles, { ...options, timeframe: tf });
    tfResults[tf] = res;

    if (res.activity.direction === 'BULLISH') bullishCount++;
    else if (res.activity.direction === 'BEARISH') bearishCount++;
    else neutralCount++;
  }

  // Synthesize alignment
  let alignment = 'MIXED_CONFLICT';
  const total = timeframes.length;

  if (bullishCount === total) {
    alignment = 'STRONG_BULLISH_CONFLUENCE';
  } else if (bearishCount === total) {
    alignment = 'STRONG_BEARISH_CONFLUENCE';
  } else if (bullishCount >= total * 0.6) {
    alignment = 'MODERATE_BULLISH_BIAS';
  } else if (bearishCount >= total * 0.6) {
    alignment = 'MODERATE_BEARISH_BIAS';
  } else {
    // Check hierarchical lower vs higher conflict
    const lowerBullish = tfResults['5m']?.activity.direction === 'BULLISH' || tfResults['15m']?.activity.direction === 'BULLISH';
    const higherBearish = tfResults['4H']?.activity.direction === 'BEARISH' || tfResults['1D']?.activity.direction === 'BEARISH';

    if (lowerBullish && higherBearish) {
      alignment = 'LOWER_TIMEFRAME_BULLISH_AGAINST_HIGHER_TIMEFRAME_BEARISH';
    } else {
      alignment = 'CROSS_TIMEFRAME_CONFLICT';
    }
  }

  return {
    alignment,
    counts: { bullish: bullishCount, bearish: bearishCount, neutral: neutralCount, total },
    timeframes: tfResults,
  };
}

// ============================================================================
// 9. FEED UTILITIES & DISCLAIMERS
// ============================================================================

/**
 * Checks if a symbol represents an OTC/CFD/Forex instrument where volume is tick updates.
 * @param {string} symbol
 * @returns {boolean}
 */
export function isTickVolumeFeed(symbol) {
  if (!symbol) return true; // Default to safe assumption
  const upper = symbol.toUpperCase();
  const tickBrokers = ['OANDA:', 'FXCM:', 'FOREXCOM:', 'PEPPERSTONE:', 'VANTAGE:', 'CAPITALCOM:', 'ICMARKETS:', 'EIGHTCAP:', 'BLACKBULL:'];
  if (tickBrokers.some(b => upper.startsWith(b))) return true;
  if (upper.includes('XAUUSD') || upper.includes('EURUSD') || upper.includes('GBPUSD') || upper.includes('USDJPY')) return true;
  return false;
}

/**
 * Standard disclaimer message regarding tick volume vs transaction volume.
 * @param {string} symbol
 * @returns {string}
 */
export function getVolumeLimitationNotice(symbol) {
  if (isTickVolumeFeed(symbol)) {
    return 'For CFD and Forex feeds (including OANDA:XAUUSD), volume reflects tick activity (price updates) rather than centralized transaction contracts. Activity is inferred/heuristic.';
  }
  return 'TradingView chart volume reflects feed exchange data and may differ from aggregate composite tape.';
}
