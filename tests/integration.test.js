import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChartStateManager } from '../src/core/state-manager.js';
import { extractNormalizedIndicators } from '../src/analysis/technical-indicators.js';
import { analyzeMarketStructure } from '../src/analysis/market-structure.js';
import { classifyMarketRegime } from '../src/analysis/market-regime.js';
import { detectZones } from '../src/analysis/zones.js';
import { analyzeVolume } from '../src/analysis/volume.js';
import { detectDivergences } from '../src/analysis/divergences.js';
import { aggregateCandles, evaluateTimeframeAlignment } from '../src/analysis/multi-timeframe.js';
import { ErrorCode, TradingViewError, classifyError } from '../src/core/errors.js';
import { jsonResult, errorResult } from '../src/tools/_format.js';

describe('Integration — High-Level Analysis & MCP Tool Contracts', () => {
  // Deterministic 100-candle market simulation
  function generateSyntheticCandles(count = 100) {
    const candles = [];
    const baseTime = 1700000000;
    let price = 50000;

    for (let i = 0; i < count; i++) {
      const isUp = Math.sin(i / 6) >= 0;
      const change = isUp ? 150 : -120;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + 50;
      const low = Math.min(open, close) - 50;
      const volume = 1000 + (i % 10) * 150;
      price = close;

      candles.push({
        time: baseTime + i * 900,
        open,
        high,
        low,
        close,
        volume,
        barClosed: i < count - 1,
      });
    }
    return candles;
  }

  it('orchestrates complete market context pipeline matching Section 28 contract', () => {
    const candles = generateSyntheticCandles(100);
    const symbol = 'BTCUSDT';
    const timeframe = '15m';

    const regime = classifyMarketRegime(candles);
    const volume = analyzeVolume(candles);
    const structure = analyzeMarketStructure(candles);
    const indicators = extractNormalizedIndicators({ candles, timeframe, symbol });
    const zones = detectZones(candles);
    const divergences = detectDivergences(candles);

    // Form composite context payload
    const context = {
      success: true,
      symbol,
      timeframe,
      market: {
        symbol,
        timeframe,
        currentPrice: candles[candles.length - 1].close,
        barClosed: candles[candles.length - 1].barClosed,
        barCount: candles.length,
      },
      regime: regime.regime,
      regimeMetrics: regime,
      trend: structure.trend,
      volume,
      divergences,
      structure,
      indicators,
      zones,
      dataQuality: {
        ready: true,
        complete: true,
        stale: false,
        ageMs: 50,
        barClosed: false,
      },
      provenance: {
        source: 'TradingView',
        symbol,
        timeframe,
        retrievedAt: Date.now(),
        lastBarTime: candles[candles.length - 1].time,
      },
    };

    // Verify MCP jsonResult envelope
    const toolEnvelope = jsonResult(context);
    assert.equal(!!toolEnvelope.isError, false);
    assert.ok(Array.isArray(toolEnvelope.content));
    assert.equal(toolEnvelope.content[0].type, 'text');

    const parsed = JSON.parse(toolEnvelope.content[0].text);
    assert.equal(parsed.success, true);
    assert.equal(parsed.symbol, 'BTCUSDT');
    assert.equal(parsed.timeframe, '15m');
    assert.ok(['TRENDING', 'RANGING', 'BREAKOUT', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'TRANSITION'].includes(parsed.regime));
    assert.ok(parsed.indicators.RSI);
    assert.ok(parsed.indicators.MACD);
    assert.ok(parsed.dataQuality);
    assert.ok(parsed.provenance);
  });

  it('orchestrates multi-timeframe candle synthesis and alignment', () => {
    const granularCandles = generateSyntheticCandles(300);
    // Aggregate 15m (900s) to 1H (3600s)
    const agg1H = aggregateCandles(granularCandles, 3600);
    assert.ok(agg1H.length > 0);
    assert.ok(agg1H.length <= Math.ceil(granularCandles.length / 4));

    // Verify OHLCV consistency of aggregated bars
    for (const b of agg1H) {
      assert.ok(b.high >= b.low, 'High >= Low');
      assert.ok(b.high >= b.open, 'High >= Open');
      assert.ok(b.high >= b.close, 'High >= Close');
      assert.ok(b.low <= b.open, 'Low <= Open');
      assert.ok(b.low <= b.close, 'Low <= Close');
      assert.ok(b.volume >= 0, 'Volume >= 0');
    }

    const tfMap = {
      '15m': {
        timeframe: '15m',
        trend: 'bullish',
        regime: 'TRENDING',
        rsi: 62.5,
        rvol: 1.4,
      },
      '1H': {
        timeframe: '1H',
        trend: 'bullish',
        regime: 'TRENDING',
        rsi: 58.1,
        rvol: 1.1,
      },
    };

    const alignment = evaluateTimeframeAlignment(tfMap);
    assert.equal(alignment.consensus, 'strong_bullish_alignment');
    assert.equal(alignment.metrics.bullishCount, 2);
    assert.equal(alignment.metrics.bullishPercentage, 100);
  });

  it('formats deterministic error envelope with OperationContext and errorDetails', () => {
    const manager = new ChartStateManager();
    const opContext = manager.createOperationContext('test_action');
    manager.bumpGeneration('user switched symbol', { symbol: 'ETHUSDT' });

    assert.equal(opContext.isStale(), true);

    let caughtErr = null;
    try {
      opContext.assertNotStale();
    } catch (err) {
      caughtErr = err;
    }

    assert.ok(caughtErr);
    const mcpErr = errorResult(caughtErr, opContext);
    assert.equal(mcpErr.isError, true);
    const parsed = JSON.parse(mcpErr.content[0].text);
    assert.equal(parsed.success, false);
    assert.equal(parsed.errorDetails.code, ErrorCode.STALE_CHART_STATE);
    assert.equal(parsed.errorDetails.retryable, true);
    assert.equal(parsed.errorDetails.operationId, opContext.operationId);
  });
});
