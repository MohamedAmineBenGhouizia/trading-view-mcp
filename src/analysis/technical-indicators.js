/**
 * Technical Indicators Calculation Engine.
 * Provides deterministic, mathematical indicator calculations over OHLCV candles
 * and standardizes outputs adhering to Section 29.
 */

/**
 * Calculates Simple Moving Average.
 * @param {number[]} values
 * @param {number} length
 * @returns {number[]}
 */
export function calculateSMA(values, length) {
  const result = new Array(values.length).fill(NaN);
  if (values.length < length || length <= 0) return result;

  let sum = 0;
  for (let i = 0; i < length; i++) sum += values[i];
  result[length - 1] = sum / length;

  for (let i = length; i < values.length; i++) {
    sum += values[i] - values[i - length];
    result[i] = sum / length;
  }
  return result;
}

/**
 * Calculates Exponential Moving Average.
 * @param {number[]} values
 * @param {number} length
 * @returns {number[]}
 */
export function calculateEMA(values, length) {
  const result = new Array(values.length).fill(NaN);
  if (values.length < length || length <= 0) return result;

  const k = 2 / (length + 1);
  // Initialize with SMA
  let sum = 0;
  for (let i = 0; i < length; i++) sum += values[i];
  let prevEMA = sum / length;
  result[length - 1] = prevEMA;

  for (let i = length; i < values.length; i++) {
    prevEMA = values[i] * k + prevEMA * (1 - k);
    result[i] = prevEMA;
  }
  return result;
}

/**
 * Calculates Relative Strength Index (Wilder's RSI).
 * @param {number[]} closes
 * @param {number} [length=14]
 * @returns {number[]}
 */
export function calculateRSI(closes, length = 14) {
  const result = new Array(closes.length).fill(NaN);
  if (closes.length <= length) return result;

  const gains = [];
  const losses = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  // Initial average gain / loss
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < length; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= length;
  avgLoss /= length;

  result[length] = avgLoss === 0 ? 100 : (avgGain === 0 ? 0 : 100 - (100 / (1 + (avgGain / avgLoss))));

  // Wilder's smoothing
  for (let i = length + 1; i < closes.length; i++) {
    const gain = gains[i - 1];
    const loss = losses[i - 1];

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    result[i] = avgLoss === 0 ? 100 : (avgGain === 0 ? 0 : 100 - (100 / (1 + (avgGain / avgLoss))));
  }

  return result;
}

/**
 * Calculates MACD (Moving Average Convergence Divergence).
 * @param {number[]} closes
 * @param {number} [fast=12]
 * @param {number} [slow=26]
 * @param {number} [signal=9]
 */
export function calculateMACD(closes, fast = 12, slow = 26, signal = 9) {
  const fastEMA = calculateEMA(closes, fast);
  const slowEMA = calculateEMA(closes, slow);

  const macdLine = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(fastEMA[i]) && !isNaN(slowEMA[i])) {
      macdLine[i] = fastEMA[i] - slowEMA[i];
    }
  }

  // Valid values for signal calculation
  const validMacd = [];
  const validIndices = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (!isNaN(macdLine[i])) {
      validMacd.push(macdLine[i]);
      validIndices.push(i);
    }
  }

  const signalEMA = calculateEMA(validMacd, signal);
  const signalLine = new Array(closes.length).fill(NaN);
  const histogram = new Array(closes.length).fill(NaN);

  for (let j = 0; j < validIndices.length; j++) {
    const idx = validIndices[j];
    signalLine[idx] = signalEMA[j];
    if (!isNaN(macdLine[idx]) && !isNaN(signalLine[idx])) {
      histogram[idx] = macdLine[idx] - signalLine[idx];
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Calculates Average True Range (ATR).
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number} [length=14]
 */
export function calculateATR(highs, lows, closes, length = 14) {
  const tr = new Array(highs.length).fill(NaN);
  tr[0] = highs[0] - lows[0];

  for (let i = 1; i < highs.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  const atr = new Array(highs.length).fill(NaN);
  if (highs.length < length) return atr;

  let sum = 0;
  for (let i = 0; i < length; i++) sum += tr[i];
  let prevATR = sum / length;
  atr[length - 1] = prevATR;

  for (let i = length; i < highs.length; i++) {
    prevATR = (prevATR * (length - 1) + tr[i]) / length;
    atr[i] = prevATR;
  }

  return atr;
}

/**
 * Calculates Bollinger Bands.
 * @param {number[]} closes
 * @param {number} [length=20]
 * @param {number} [multiplier=2]
 */
export function calculateBollingerBands(closes, length = 20, multiplier = 2) {
  const sma = calculateSMA(closes, length);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);
  const percentB = new Array(closes.length).fill(NaN);
  const bandwidth = new Array(closes.length).fill(NaN);

  for (let i = length - 1; i < closes.length; i++) {
    const mean = sma[i];
    let sumSquares = 0;
    for (let j = i - length + 1; j <= i; j++) {
      sumSquares += Math.pow(closes[j] - mean, 2);
    }
    const stdDev = Math.sqrt(sumSquares / length);
    upper[i] = mean + multiplier * stdDev;
    lower[i] = mean - multiplier * stdDev;
    const bandDiff = upper[i] - lower[i];
    bandwidth[i] = mean !== 0 ? (bandDiff / mean) * 100 : 0;
    percentB[i] = bandDiff !== 0 ? (closes[i] - lower[i]) / bandDiff : 0.5;
  }

  return { middle: sma, upper, lower, percentB, bandwidth };
}

/**
 * Calculates ADX (Average Directional Index).
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number} [length=14]
 */
export function calculateADX(highs, lows, closes, length = 14) {
  const n = highs.length;
  const adx = new Array(n).fill(NaN);
  const plusDI = new Array(n).fill(NaN);
  const minusDI = new Array(n).fill(NaN);

  if (n < length * 2) return { adx, plusDI, minusDI };

  const tr = [];
  const plusDM = [];
  const minusDM = [];

  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }

  let trSmooth = 0;
  let plusDMSmooth = 0;
  let minusDMSmooth = 0;

  for (let i = 0; i < length; i++) {
    trSmooth += tr[i];
    plusDMSmooth += plusDM[i];
    minusDMSmooth += minusDM[i];
  }

  const dxList = [];
  for (let i = length; i < tr.length; i++) {
    if (i > length) {
      trSmooth = trSmooth - (trSmooth / length) + tr[i];
      plusDMSmooth = plusDMSmooth - (plusDMSmooth / length) + plusDM[i];
      minusDMSmooth = minusDMSmooth - (minusDMSmooth / length) + minusDM[i];
    }

    const pDI = trSmooth !== 0 ? (plusDMSmooth / trSmooth) * 100 : 0;
    const mDI = trSmooth !== 0 ? (minusDMSmooth / trSmooth) * 100 : 0;

    plusDI[i + 1] = pDI;
    minusDI[i + 1] = mDI;

    const diSum = pDI + mDI;
    const diDiff = Math.abs(pDI - mDI);
    const dx = diSum !== 0 ? (diDiff / diSum) * 100 : 0;
    dxList.push({ index: i + 1, dx });
  }

  if (dxList.length >= length) {
    let sumDX = 0;
    for (let i = 0; i < length; i++) sumDX += dxList[i].dx;
    let currentADX = sumDX / length;
    adx[dxList[length - 1].index] = currentADX;

    for (let i = length; i < dxList.length; i++) {
      currentADX = ((currentADX * (length - 1)) + dxList[i].dx) / length;
      adx[dxList[i].index] = currentADX;
    }
  }

  return { adx, plusDI, minusDI };
}

/**
 * Calculates Stochastic Oscillator (%K and %D).
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number} [kPeriod=14]
 * @param {number} [dPeriod=3]
 */
export function calculateStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  const percentK = new Array(closes.length).fill(NaN);

  for (let i = kPeriod - 1; i < closes.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > highest) highest = highs[j];
      if (lows[j] < lowest) lowest = lows[j];
    }
    const range = highest - lowest;
    percentK[i] = range !== 0 ? ((closes[i] - lowest) / range) * 100 : 50;
  }

  const percentD = calculateSMA(percentK.map(v => isNaN(v) ? 0 : v), dPeriod);
  for (let i = 0; i < kPeriod + dPeriod - 2; i++) {
    percentD[i] = NaN;
  }

  return { k: percentK, d: percentD };
}

/**
 * Calculates VWAP (Volume-Weighted Average Price).
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number[]} volumes
 */
export function calculateVWAP(highs, lows, closes, volumes) {
  const vwap = new Array(closes.length).fill(NaN);
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    const vol = volumes[i] || 0;
    cumulativeTPV += typicalPrice * vol;
    cumulativeVolume += vol;
    vwap[i] = cumulativeVolume !== 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
  }

  return vwap;
}

/**
 * Standardizes normalized indicator outputs according to Section 29.
 * @param {object} params
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume: number, barClosed: boolean}>} params.candles
 * @param {string} params.timeframe
 * @param {string} [params.symbol]
 */
export function extractNormalizedIndicators({ candles, timeframe, symbol = '' }) {
  if (!candles || candles.length === 0) return {};

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const lastIdx = candles.length - 1;
  const prevIdx = Math.max(0, lastIdx - 1);
  const lastCandle = candles[lastIdx];
  const barClosed = !!lastCandle.barClosed;
  const timestamp = lastCandle.time;

  // 1. RSI
  const rsiSeries = calculateRSI(closes, 14);
  const rsiVal = rsiSeries[lastIdx];
  const rsiPrev = rsiSeries[prevIdx];
  const rsiNorm = !isNaN(rsiVal) ? {
    name: 'RSI',
    timeframe,
    value: Math.round(rsiVal * 100) / 100,
    previous: !isNaN(rsiPrev) ? Math.round(rsiPrev * 100) / 100 : null,
    timestamp,
    barClosed,
    state: {
      direction: rsiVal > rsiPrev ? 'rising' : (rsiVal < rsiPrev ? 'falling' : 'flat'),
      level: rsiVal >= 70 ? 'overbought' : (rsiVal <= 30 ? 'oversold' : 'neutral'),
    },
  } : null;

  // 2. MACD
  const macdData = calculateMACD(closes, 12, 26, 9);
  const macdVal = macdData.macd[lastIdx];
  const macdPrev = macdData.macd[prevIdx];
  const sigVal = macdData.signal[lastIdx];
  const histVal = macdData.histogram[lastIdx];
  const histPrev = macdData.histogram[prevIdx];
  const macdNorm = !isNaN(macdVal) ? {
    name: 'MACD',
    timeframe,
    value: Math.round(macdVal * 1000) / 1000,
    previous: !isNaN(macdPrev) ? Math.round(macdPrev * 1000) / 1000 : null,
    timestamp,
    barClosed,
    state: {
      direction: histVal > histPrev ? 'expanding_bullish' : 'contracting_or_bearish',
      cross: (macdVal > sigVal && macdPrev <= macdData.signal[prevIdx]) ? 'bullish_cross' :
             (macdVal < sigVal && macdPrev >= macdData.signal[prevIdx]) ? 'bearish_cross' : 'none',
    },
    details: {
      macd: Math.round(macdVal * 1000) / 1000,
      signal: !isNaN(sigVal) ? Math.round(sigVal * 1000) / 1000 : null,
      histogram: !isNaN(histVal) ? Math.round(histVal * 1000) / 1000 : null,
    },
  } : null;

  // 3. EMA (20 & 50 & 200)
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, Math.min(200, closes.length));
  const ema20Val = ema20[lastIdx];
  const ema50Val = ema50[lastIdx];
  const emaNorm = !isNaN(ema20Val) ? {
    name: 'EMA',
    timeframe,
    value: Math.round(ema20Val * 100) / 100,
    previous: Math.round(ema20[prevIdx] * 100) / 100,
    timestamp,
    barClosed,
    state: {
      trend: (!isNaN(ema50Val) && ema20Val > ema50Val) ? 'bullish' : 'bearish',
      priceVsEma: lastCandle.close > ema20Val ? 'above' : 'below',
    },
    details: {
      ema20: Math.round(ema20Val * 100) / 100,
      ema50: !isNaN(ema50Val) ? Math.round(ema50Val * 100) / 100 : null,
      ema200: !isNaN(ema200[lastIdx]) ? Math.round(ema200[lastIdx] * 100) / 100 : null,
    },
  } : null;

  // 4. ATR
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const atrVal = atrSeries[lastIdx];
  const atrNorm = !isNaN(atrVal) ? {
    name: 'ATR',
    timeframe,
    value: Math.round(atrVal * 100) / 100,
    previous: Math.round(atrSeries[prevIdx] * 100) / 100,
    timestamp,
    barClosed,
    state: {
      direction: atrVal > atrSeries[prevIdx] ? 'rising' : 'falling',
    },
  } : null;

  // 5. Bollinger Bands
  const bb = calculateBollingerBands(closes, 20, 2);
  const bbMid = bb.middle[lastIdx];
  const bbUpper = bb.upper[lastIdx];
  const bbLower = bb.lower[lastIdx];
  const bbNorm = !isNaN(bbMid) ? {
    name: 'Bollinger',
    timeframe,
    value: Math.round(bbMid * 100) / 100,
    previous: Math.round(bb.middle[prevIdx] * 100) / 100,
    timestamp,
    barClosed,
    state: {
      position: lastCandle.close > bbUpper ? 'above_upper' : (lastCandle.close < bbLower ? 'below_lower' : 'inside_bands'),
      bandwidth: Math.round(bb.bandwidth[lastIdx] * 100) / 100,
      percentB: Math.round(bb.percentB[lastIdx] * 100) / 100,
    },
    details: {
      upper: Math.round(bbUpper * 100) / 100,
      middle: Math.round(bbMid * 100) / 100,
      lower: Math.round(bbLower * 100) / 100,
    },
  } : null;

  // 6. ADX
  const adxData = calculateADX(highs, lows, closes, 14);
  const adxVal = adxData.adx[lastIdx];
  const adxNorm = !isNaN(adxVal) ? {
    name: 'ADX',
    timeframe,
    value: Math.round(adxVal * 100) / 100,
    previous: !isNaN(adxData.adx[prevIdx]) ? Math.round(adxData.adx[prevIdx] * 100) / 100 : null,
    timestamp,
    barClosed,
    state: {
      strength: adxVal >= 25 ? 'trending' : 'ranging_or_weak',
      direction: adxData.plusDI[lastIdx] > adxData.minusDI[lastIdx] ? 'bullish' : 'bearish',
    },
    details: {
      plusDI: Math.round(adxData.plusDI[lastIdx] * 100) / 100,
      minusDI: Math.round(adxData.minusDI[lastIdx] * 100) / 100,
    },
  } : null;

  // 7. VWAP
  const vwapSeries = calculateVWAP(highs, lows, closes, volumes);
  const vwapVal = vwapSeries[lastIdx];
  const vwapNorm = !isNaN(vwapVal) ? {
    name: 'VWAP',
    timeframe,
    value: Math.round(vwapVal * 100) / 100,
    previous: Math.round(vwapSeries[prevIdx] * 100) / 100,
    timestamp,
    barClosed,
    state: {
      position: lastCandle.close >= vwapVal ? 'above_vwap' : 'below_vwap',
    },
  } : null;

  // 8. Stochastic
  const stoch = calculateStochastic(highs, lows, closes, 14, 3);
  const stochK = stoch.k[lastIdx];
  const stochD = stoch.d[lastIdx];
  const stochNorm = !isNaN(stochK) ? {
    name: 'Stochastic',
    timeframe,
    value: Math.round(stochK * 100) / 100,
    previous: Math.round(stoch.k[prevIdx] * 100) / 100,
    timestamp,
    barClosed,
    state: {
      level: stochK >= 80 ? 'overbought' : (stochK <= 20 ? 'oversold' : 'neutral'),
      cross: (!isNaN(stochD) && stochK > stochD && stoch.k[prevIdx] <= stoch.d[prevIdx]) ? 'bullish_cross' :
             (!isNaN(stochD) && stochK < stochD && stoch.k[prevIdx] >= stoch.d[prevIdx]) ? 'bearish_cross' : 'none',
    },
    details: {
      k: Math.round(stochK * 100) / 100,
      d: !isNaN(stochD) ? Math.round(stochD * 100) / 100 : null,
    },
  } : null;

  // 9. Volume
  const volSMA = calculateSMA(volumes, 20);
  const currentVol = volumes[lastIdx];
  const avgVol = volSMA[lastIdx] || currentVol;
  const relVol = avgVol > 0 ? currentVol / avgVol : 1;
  const volNorm = {
    name: 'Volume',
    timeframe,
    value: currentVol,
    previous: volumes[prevIdx],
    timestamp,
    barClosed,
    state: {
      relativeVolume: Math.round(relVol * 100) / 100,
      anomaly: relVol >= 2.0,
      trend: currentVol > volumes[prevIdx] ? 'increasing' : 'decreasing',
    },
    details: {
      currentVolume: currentVol,
      averageVolume20: Math.round(avgVol),
    },
  };

  return {
    RSI: rsiNorm,
    MACD: macdNorm,
    EMA: emaNorm,
    ATR: atrNorm,
    Bollinger: bbNorm,
    ADX: adxNorm,
    VWAP: vwapNorm,
    Stochastic: stochNorm,
    Volume: volNorm,
  };
}
