/**
 * Deterministic Market Structure Engine.
 * Identifies Swing Highs/Lows, HH/HL/LH/LL, Break of Structure (BOS),
 * Change of Character (CHoCH), and trading ranges without predictive bias.
 */

/**
 * Identifies Swing Highs and Swing Lows from OHLCV candles.
 * A Swing High at index i requires candle[i].high > candle[i-k].high and candle[i+k].high for k in [1..pivotRange].
 * @param {Array<{time: number, open: number, high: number, low: number, close: number}>} candles
 * @param {object} [options]
 * @param {number} [options.left=3] Lookback bars
 * @param {number} [options.right=3] Lookforward bars
 * @returns {Array<{type: 'high'|'low', index: number, price: number, time: number}>}
 */
export function detectSwings(candles, { left = 3, right = 3 } = {}) {
  const swings = [];
  if (!candles || candles.length < left + right + 1) return swings;

  for (let i = left; i < candles.length - right; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= currentHigh) isHigh = false;
      if (candles[j].low <= currentLow) isLow = false;
    }

    if (isHigh) {
      swings.push({
        type: 'high',
        index: i,
        price: currentHigh,
        time: candles[i].time,
      });
    }

    if (isLow) {
      swings.push({
        type: 'low',
        index: i,
        price: currentLow,
        time: candles[i].time,
      });
    }
  }

  return swings.sort((a, b) => a.index - b.index);
}

/**
 * Classifies swings into Higher Highs (HH), Higher Lows (HL), Lower Highs (LH), Lower Lows (LL).
 * @param {Array<{type: 'high'|'low', index: number, price: number, time: number}>} swings
 */
export function classifySwings(swings) {
  let prevHigh = null;
  let prevLow = null;

  return swings.map(swing => {
    let classification = null;
    if (swing.type === 'high') {
      if (prevHigh !== null) {
        classification = swing.price > prevHigh.price ? 'HH' : 'LH';
      }
      prevHigh = swing;
    } else {
      if (prevLow !== null) {
        classification = swing.price > prevLow.price ? 'HL' : 'LL';
      }
      prevLow = swing;
    }

    return {
      ...swing,
      classification,
    };
  });
}

/**
 * Detects Break of Structure (BOS) and Change of Character (CHoCH).
 * - BOS Bullish: Price closes above previous swing high in an established uptrend.
 * - BOS Bearish: Price closes below previous swing low in an established downtrend.
 * - CHoCH Bullish: Price closes above previous swing high following an established downtrend.
 * - CHoCH Bearish: Price closes below previous swing low following an established uptrend.
 *
 * @param {Array<{time: number, open: number, high: number, low: number, close: number}>} candles
 * @param {Array<{type: 'high'|'low', index: number, price: number, time: number, classification: string}>} classifiedSwings
 */
export function detectBOSandCHoCH(candles, classifiedSwings) {
  const events = [];
  if (!classifiedSwings || classifiedSwings.length < 2) return events;

  let trend = null; // 'bullish' | 'bearish'
  let activeSwingHigh = null;
  let activeSwingLow = null;

  for (let i = 0; i < classifiedSwings.length; i++) {
    const sw = classifiedSwings[i];
    if (sw.type === 'high') {
      if (sw.classification === 'HH') trend = 'bullish';
      else if (sw.classification === 'LH' && trend === 'bullish') trend = 'transition';
      activeSwingHigh = sw;
    } else if (sw.type === 'low') {
      if (sw.classification === 'LL') trend = 'bearish';
      else if (sw.classification === 'HL' && trend === 'bearish') trend = 'transition';
      activeSwingLow = sw;
    }

    // Inspect bars between this swing and next swing (or current bar)
    const nextSwingIndex = (i + 1 < classifiedSwings.length) ? classifiedSwings[i + 1].index : candles.length - 1;
    for (let b = sw.index + 1; b <= nextSwingIndex; b++) {
      const candle = candles[b];

      // Break above swing high
      if (activeSwingHigh && candle.close > activeSwingHigh.price) {
        const isBOS = trend === 'bullish';
        events.push({
          type: isBOS ? 'BOS' : 'CHoCH',
          direction: 'bullish',
          price: candle.close,
          timestamp: candle.time,
          barIndex: b,
          referenceSwing: {
            type: activeSwingHigh.classification || 'high',
            price: activeSwingHigh.price,
            timestamp: activeSwingHigh.time,
          },
        });
        // Prevent duplicate trigger for the same swing high
        activeSwingHigh = null;
        trend = 'bullish';
      }

      // Break below swing low
      if (activeSwingLow && candle.close < activeSwingLow.price) {
        const isBOS = trend === 'bearish';
        events.push({
          type: isBOS ? 'BOS' : 'CHoCH',
          direction: 'bearish',
          price: candle.close,
          timestamp: candle.time,
          barIndex: b,
          referenceSwing: {
            type: activeSwingLow.classification || 'low',
            price: activeSwingLow.price,
            timestamp: activeSwingLow.time,
          },
        });
        activeSwingLow = null;
        trend = 'bearish';
      }
    }
  }

  return events;
}

/**
 * Calculates current market range (High, Low, Mid Equilibrium).
 * @param {Array<{time: number, open: number, high: number, low: number, close: number}>} candles
 * @param {number} [lookback=50]
 */
export function detectTradingRange(candles, lookback = 50) {
  if (!candles || candles.length === 0) return null;
  const slice = candles.slice(-lookback);
  const high = Math.max(...slice.map(c => c.high));
  const low = Math.min(...slice.map(c => c.low));
  const mid = (high + low) / 2;
  const current = slice[slice.length - 1].close;

  return {
    high,
    low,
    equilibrium: Math.round(mid * 100) / 100,
    rangeSize: Math.round((high - low) * 100) / 100,
    currentPosition: current >= mid ? 'premium' : 'discount',
    percentOfRange: high !== low ? Math.round(((current - low) / (high - low)) * 10000) / 100 : 50,
  };
}

/**
 * High-level deterministic market structure analysis.
 * @param {Array<{time: number, open: number, high: number, low: number, close: number}>} candles
 * @param {object} [options]
 */
export function analyzeMarketStructure(candles, options = {}) {
  const rawSwings = detectSwings(candles, options);
  const swings = classifySwings(rawSwings);
  const structuralEvents = detectBOSandCHoCH(candles, swings);
  const range = detectTradingRange(candles, options.rangeLookback || 50);

  const lastEvent = structuralEvents.length > 0 ? structuralEvents[structuralEvents.length - 1] : null;
  const recentSwings = swings.slice(-6);

  // Overall current trend assessment based on last 2 swings
  let currentTrend = 'neutral';
  if (recentSwings.length >= 2) {
    const lastHigh = [...recentSwings].reverse().find(s => s.type === 'high');
    const lastLow = [...recentSwings].reverse().find(s => s.type === 'low');
    if (lastHigh?.classification === 'HH' && lastLow?.classification === 'HL') currentTrend = 'bullish';
    else if (lastHigh?.classification === 'LH' && lastLow?.classification === 'LL') currentTrend = 'bearish';
    else if (lastHigh?.classification === 'HH') currentTrend = 'bullish_bias';
    else if (lastLow?.classification === 'LL') currentTrend = 'bearish_bias';
  }

  return {
    trend: currentTrend,
    swings: recentSwings,
    totalSwingsIdentified: swings.length,
    events: structuralEvents.slice(-5),
    lastEvent,
    range,
  };
}
