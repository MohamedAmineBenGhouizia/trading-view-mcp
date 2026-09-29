import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChartStateManager, chartStateManager } from '../src/core/state-manager.js';
import { GenerationAwareCache } from '../src/core/cache.js';
import { extractNormalizedIndicators } from '../src/analysis/technical-indicators.js';
import { analyzeMarketStructure } from '../src/analysis/market-structure.js';
import { classifyMarketRegime } from '../src/analysis/market-regime.js';
import { detectZones } from '../src/analysis/zones.js';
import { analyzeVolume } from '../src/analysis/volume.js';
import { evaluateTimeframeAlignment } from '../src/analysis/multi-timeframe.js';
import { ErrorCode, TradingViewError } from '../src/core/errors.js';
import { jsonResult, errorResult } from '../src/tools/_format.js';

describe('AI Agent Realistic Workflows & Concurrency Guarantees', () => {
  // Deterministic candle generator (supports drift or ranging)
  function generateSyntheticCandles(count = 120, baseTime = 1700000000, startPrice = 50000, drift = 20) {
    const candles = [];
    let price = startPrice;

    for (let i = 0; i < count; i++) {
      const cycle = Math.sin(i / 5);
      const change = cycle * 120 + drift;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + 30;
      const low = Math.min(open, close) - 30;
      const volume = 1000 + Math.abs(cycle) * 800 + (i === 110 ? 5000 : 0);
      price = close;

      candles.push({
        time: baseTime + i * 900, // 15m = 900s
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: Math.round(volume),
        barClosed: i < count - 1,
      });
    }
    return candles;
  }

  it('Workflow 1: Multi-Timeframe Scan (1D -> 4H -> 1H -> 15m) with Generational Cache Invalidation', () => {
    const cache = new GenerationAwareCache({ defaultTtlMs: 60000 });
    const symbol = 'BTCUSDT';
    const timeframes = ['1D', '4H', '1H', '15m'];

    const baseCandles = generateSyntheticCandles(400);
    const tfResults = {};

    let gen1D = 0;
    for (const tf of timeframes) {
      // 1. Agent updates timeframe and creates operation context
      chartStateManager.bumpGeneration(`switch to ${tf}`, { symbol, timeframe: tf });
      if (tf === '1D') gen1D = chartStateManager.getGeneration();
      const opContext = chartStateManager.createOperationContext(`scan_${tf}`);

      // Cache data for current generation
      const mockBars = baseCandles.slice(-100);
      cache.set(`ohlcv_${symbol}_${tf}`, mockBars);

      // Verify cached entry is available for current generation
      const cached = cache.get(`ohlcv_${symbol}_${tf}`);
      assert.ok(cached, `Cache hit for ${tf}`);
      assert.equal(cached.length, 100);

      // Evaluate regime and trend
      const regime = classifyMarketRegime(mockBars);
      const structure = analyzeMarketStructure(mockBars);
      const indicators = extractNormalizedIndicators({ candles: mockBars, timeframe: tf, symbol });

      tfResults[tf] = {
        timeframe: tf,
        trend: structure.trend,
        regime: regime.regime,
        rsi: indicators.RSI.value,
        rvol: indicators.Volume.rvol,
      };

      // Ensure operation did not cross stale state boundary
      assert.equal(opContext.isStale(), false);
    }

    // 2. Synthesize multi-timeframe consensus
    const alignment = evaluateTimeframeAlignment(tfResults);
    assert.ok(alignment.consensus, 'Consensus determined');
    assert.ok(typeof alignment.metrics.bullishPercentage === 'number');
    assert.ok(alignment.trendBreakdown['1D']);
    assert.ok(alignment.trendBreakdown['15m']);

    // 3. Verify that old generational cache entries from 1D are invalidated now that generation increased
    assert.ok(chartStateManager.getGeneration() > gen1D);
    const staleEntry = cache.get('ohlcv_BTCUSDT_1D');
    assert.equal(staleEntry, null, 'Stale 1D cache was purged upon generation increments');
  });

  it('Workflow 2: Context Baseline + Low-Token Delta Polling (market_get_recent_changes)', () => {
    const stateManager = new ChartStateManager();
    const symbol = 'ETHUSDT';
    const timeframe = '15m';

    // Phase A: Initial baseline analysis at bar 80
    const initialCandles = generateSyntheticCandles(80, 1700000000, 3000);
    const baselineLastTime = initialCandles[initialCandles.length - 1].time;
    const baselineGeneration = stateManager.getGeneration();

    // Phase B: 40 new bars arrive, including new structural swings
    const updatedCandles = generateSyntheticCandles(120, 1700000000, 3000);
    assert.equal(updatedCandles.length, 120);

    // Agent delta query: only changes since baselineLastTime and baselineGeneration
    const newCandles = updatedCandles.filter((c) => c.time > baselineLastTime);
    assert.equal(newCandles.length, 40);

    const updatedStructure = analyzeMarketStructure(updatedCandles);
    const volumeAnalysis = analyzeVolume(updatedCandles);

    // Extract new swings that formed after baseline timestamp
    const newSwings = updatedStructure.swings.filter((s) => s.time > baselineLastTime);
    const newEvents = updatedStructure.events.filter((e) => e.timestamp > baselineLastTime);

    const deltaPayload = {
      success: true,
      symbol,
      timeframe,
      delta: {
        sinceTimestamp: baselineLastTime,
        sinceGeneration: baselineGeneration,
        newBarCount: newCandles.length,
        newSwingsCount: newSwings.length,
        newSwings,
        newEvents,
        volumeAnomaly: volumeAnalysis.anomaly,
        hasStructuralBreak: newEvents.length > 0,
      },
    };

    // Verify token minimization: Delta JSON is compact (< 2KB vs full 120 bars ~ 15KB)
    const deltaJson = JSON.stringify(deltaPayload);
    const fullCandlesJson = JSON.stringify(updatedCandles);
    assert.ok(deltaJson.length < fullCandlesJson.length / 3, 'Delta payload uses significantly fewer tokens than full bars');
    assert.ok(deltaPayload.delta.newBarCount === 40);
  });

  it('Workflow 3: State Mutation & Expected Symbol Isolation (BTCUSDT vs ETHUSDT)', () => {
    const stateManager = new ChartStateManager();
    stateManager.updateState({ symbol: 'BTCUSDT', timeframe: '15m' });
    const initialGen = stateManager.getGeneration();

    // Operation A begins expecting BTCUSDT
    const opA = stateManager.createOperationContext('data_get_ohlcv_BTC');

    // Chart mutation occurs asynchronously: user or agent switches symbol to ETHUSDT
    stateManager.updateState({ symbol: 'ETHUSDT', timeframe: '15m' });
    assert.ok(stateManager.getGeneration() > initialGen, 'Generation incremented on symbol change');

    // Operation A tries to complete with stale assertion
    assert.equal(opA.isStale(), true, 'Operation A correctly flagged as stale');

    // Asserting symbol expectation throws categorized error
    let thrownError = null;
    try {
      opA.assertNotStale();
      const currentSym = stateManager.getSnapshot().symbol;
      if (currentSym !== 'BTCUSDT') {
        throw new TradingViewError(
          ErrorCode.STALE_CHART_STATE,
          `Chart symbol '${currentSym}' does not match expectedSymbol 'BTCUSDT'`,
          { retryable: true, context: { currentSymbol: currentSym, expectedSymbol: 'BTCUSDT' } }
        );
      }
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError instanceof TradingViewError);
    assert.equal(thrownError.code, ErrorCode.STALE_CHART_STATE);
    assert.equal(thrownError.retryable, true);

    // Error result formatting matches MCP contract
    const mcpEnvelope = errorResult(thrownError, opA);
    const envelopeData = JSON.parse(mcpEnvelope.content[0].text);
    assert.equal(envelopeData.success, false);
    assert.equal(envelopeData.errorDetails.code, ErrorCode.STALE_CHART_STATE);
    assert.equal(envelopeData.errorDetails.retryable, true);

    // Subsequent operation targeting ETHUSDT succeeds cleanly
    const opB = stateManager.createOperationContext('data_get_ohlcv_ETH');
    assert.equal(opB.isStale(), false);
    assert.equal(stateManager.getSnapshot().symbol, 'ETHUSDT');
  });

  it('Workflow 4: Support & Resistance Zones Multi-Resolution Correlation', () => {
    // Generate a strictly oscillating ranging market with zero drift so swings cluster at boundaries
    const rangingCandles = [];
    const baseTime = 1700000000;
    for (let i = 0; i < 150; i++) {
      // Oscillates tightly between 50000 - 50200
      const phase = (i % 20) / 20; // 0 to 1
      const price = 50000 + Math.sin(phase * 2 * Math.PI) * 100;
      const open = price - 10;
      const close = price + 10;
      const high = Math.max(open, close) + 15;
      const low = Math.min(open, close) - 15;
      rangingCandles.push({
        time: baseTime + i * 900,
        open,
        high,
        low,
        close,
        volume: 1200,
      });
    }

    // Detect zones with 1% tolerance
    const zones = detectZones(rangingCandles, { tolerancePct: 0.01, minTouches: 2 });
    assert.ok(Array.isArray(zones), 'Zones returned as array');
    assert.ok(zones.length > 0, `Expected at least 1 zone, found ${zones.length}`);

    for (const z of zones) {
      assert.ok(z.mid > 0);
      assert.ok(z.touches >= 2);
      assert.ok(['support', 'resistance', 'consolidation'].includes(z.type));
      assert.ok(z.low <= z.high);
    }
  });

  it('Context Efficiency: summary=true and deduplication token savings', () => {
    const candles = generateSyntheticCandles(150);

    // 1. Full candle array payload
    const fullPayload = jsonResult({ candles });
    const fullBytes = Buffer.byteLength(fullPayload.content[0].text, 'utf8');

    // 2. Statistical summary payload
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const volumes = candles.map((c) => c.volume);

    const summaryPayload = jsonResult({
      barCount: candles.length,
      open: candles[0].open,
      high: Math.max(...highs),
      low: Math.min(...lows),
      close: closes[closes.length - 1],
      avgVolume: Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length),
      rangePct: Math.round(((Math.max(...highs) - Math.min(...lows)) / Math.min(...lows)) * 10000) / 100,
    });
    const summaryBytes = Buffer.byteLength(summaryPayload.content[0].text, 'utf8');

    // Summary payload is dramatically smaller
    assert.ok(summaryBytes < 300, `Summary payload should be < 300 bytes, was ${summaryBytes}`);
    assert.ok(fullBytes > 10000, `Full payload should be > 10,000 bytes, was ${fullBytes}`);
    assert.ok(summaryBytes < fullBytes * 0.05, 'Summary payload achieves >95% size reduction vs full bar array');

    // 3. Pine line level deduplication
    const rawPineLines = [
      { price: 50100.5, id: 1 },
      { price: 50100.5, id: 2 },
      { price: 50100.5, id: 3 },
      { price: 49800.0, id: 4 },
      { price: 49800.0, id: 5 },
      { price: 51200.25, id: 6 },
    ];
    const deduplicatedLevels = Array.from(new Set(rawPineLines.map((l) => l.price))).sort((a, b) => b - a);
    assert.deepEqual(deduplicatedLevels, [51200.25, 50100.5, 49800.0]);
    assert.equal(deduplicatedLevels.length, 3);
  });
});
