import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ChartStateManager } from '../src/core/state-manager.js';
import { GenerationAwareCache } from '../src/core/cache.js';
import { TradingViewError, ErrorCode } from '../src/core/errors.js';

describe('ChartStateManager and OperationContext', () => {
  let manager;

  beforeEach(() => {
    manager = new ChartStateManager();
  });

  it('initializes with generation 1 and default state', () => {
    assert.equal(manager.getGeneration(), 1);
    const snapshot = manager.getSnapshot();
    assert.equal(snapshot.generation, 1);
    assert.equal(snapshot.dataReady, false);
    assert.equal(snapshot.barCount, 0);
  });

  it('bumps generation on demand and preserves updated fields', () => {
    const newGen = manager.bumpGeneration('user changed symbol', { symbol: 'ETHUSDT' });
    assert.equal(newGen, 2);
    assert.equal(manager.getGeneration(), 2);
    const snap = manager.getSnapshot();
    assert.equal(snap.generation, 2);
    assert.equal(snap.symbol, 'ETHUSDT');
  });

  it('auto-bumps generation when symbol or timeframe changes via updateState', () => {
    manager.updateState({ symbol: 'BTCUSDT', timeframe: '15m' });
    assert.equal(manager.getGeneration(), 2);

    // Updating non-identity properties does not bump generation
    manager.updateState({ barCount: 500, lastBarTime: 1700000000, dataReady: true });
    assert.equal(manager.getGeneration(), 2);

    // Changing timeframe bumps generation
    manager.updateState({ timeframe: '1H' });
    assert.equal(manager.getGeneration(), 3);
  });

  it('OperationContext detects stale state', () => {
    manager.updateState({ symbol: 'BTCUSDT', timeframe: '15m' });
    const opContext = manager.createOperationContext('fetch_indicators');

    assert.equal(opContext.isStale(), false);
    assert.doesNotThrow(() => opContext.assertNotStale());

    // Another operation changes the chart
    manager.bumpGeneration('user switched to SOLUSDT', { symbol: 'SOLUSDT' });

    assert.equal(opContext.isStale(), true);
    assert.throws(
      () => opContext.assertNotStale(),
      (err) => {
        return err instanceof TradingViewError &&
          err.code === ErrorCode.STALE_CHART_STATE &&
          err.retryable === true;
      }
    );
  });
});

describe('GenerationAwareCache', () => {
  it('stores and retrieves items matching current generation', () => {
    const cache = new GenerationAwareCache();
    cache.set('test_key', { data: 123 }, 5000);

    const retrieved = cache.get('test_key');
    assert.deepEqual(retrieved, { data: 123 });
  });

  it('purges entries when older than active generation', () => {
    const cache = new GenerationAwareCache();
    cache.set('key1', 'val1');

    // Simulate purge
    cache.purgeOlderThan(999);
    assert.equal(cache.get('key1'), null);
  });

  it('evicts expired TTL items', async () => {
    const cache = new GenerationAwareCache({ defaultTtlMs: 20 });
    cache.set('short_lived', 'value', 20);

    await new Promise(r => setTimeout(r, 40));
    assert.equal(cache.get('short_lived'), null);
  });
});
