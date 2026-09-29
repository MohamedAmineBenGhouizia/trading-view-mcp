import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chartTxQueue, withChartTransaction } from '../src/connection.js';
import { ChartStateManager } from '../src/core/state-manager.js';

describe('Chaos & Concurrency Safety', () => {
  it('strictly serializes concurrent chart transactions without interleaved mutation state', async () => {
    const timeline = [];
    const manager = new ChartStateManager();

    // Transaction A
    const txA = withChartTransaction('txA', async () => {
      timeline.push('A:start');
      manager.bumpGeneration('txA symbol=BTC', { symbol: 'BTCUSDT' });
      await new Promise(r => setTimeout(r, 40));
      timeline.push('A:end');
      return { symbol: 'BTCUSDT', gen: manager.getGeneration() };
    });

    // Transaction B scheduled concurrently
    const txB = withChartTransaction('txB', async () => {
      timeline.push('B:start');
      manager.bumpGeneration('txB symbol=ETH', { symbol: 'ETHUSDT' });
      await new Promise(r => setTimeout(r, 20));
      timeline.push('B:end');
      return { symbol: 'ETHUSDT', gen: manager.getGeneration() };
    });

    const [resA, resB] = await Promise.all([txA, txB]);

    // Verify sequential non-interleaved execution
    assert.deepEqual(timeline, ['A:start', 'A:end', 'B:start', 'B:end']);
    assert.equal(resA.gen, 2);
    assert.equal(resB.gen, 3);
    assert.equal(manager.getSnapshot().symbol, 'ETHUSDT');
  });

  it('rejects stale operation context when concurrent transaction mutates state during read', async () => {
    const manager = new ChartStateManager();
    manager.updateState({ symbol: 'BTCUSDT', timeframe: '15m' });

    // Operation starts reading under gen 2
    const opContext = manager.createOperationContext('read_large_dataset');
    assert.equal(opContext.generation, 2);

    // Concurrent user action switches symbol -> generation becomes 3
    manager.bumpGeneration('user changed to SOL', { symbol: 'SOLUSDT' });

    // When the first operation finishes, it asserts not stale
    assert.equal(opContext.isStale(), true);
    assert.throws(
      () => opContext.assertNotStale(),
      (err) => err.code === 'STALE_CHART_STATE' && err.retryable === true
    );
  });

  it('survives burst of 20 concurrent tasks without deadlock or queue leakage', async () => {
    const results = [];
    const burstCount = 20;
    const promises = [];

    for (let i = 0; i < burstCount; i++) {
      promises.push(
        chartTxQueue.enqueue(async () => {
          await new Promise(r => setTimeout(r, 2));
          results.push(i);
          return i;
        }, { label: `burst_${i}` })
      );
    }

    const completed = await Promise.all(promises);
    assert.equal(completed.length, burstCount);
    assert.equal(results.length, burstCount);
    // Strict monotonic sequence preserved
    for (let i = 0; i < burstCount; i++) {
      assert.equal(results[i], i);
    }
  });

  it('prevents cross-contamination between concurrent setTimeframe and getOHLCV', async () => {
    const manager = new ChartStateManager();
    manager.updateState({ symbol: 'BTCUSDT', timeframe: '15m' });

    // Client 1 captures context for 15m read
    const client1Context = manager.createOperationContext('read_15m_ohlcv');
    assert.equal(client1Context.timeframe, '15m');
    assert.equal(client1Context.generation, 2);

    // Client 2 initiates setTimeframe('1H') transaction
    await withChartTransaction('setTimeframe_1H', async () => {
      manager.bumpGeneration('timeframe changed to 1H', { timeframe: '1H', resolution: '1H' });
      await new Promise(r => setTimeout(r, 20));
      return { success: true, timeframe: '1H' };
    });

    // Client 1 checks if its context is still valid before returning data
    assert.equal(client1Context.isStale(), true);
    assert.throws(
      () => client1Context.assertNotStale(),
      (err) => err.code === 'STALE_CHART_STATE' && err.retryable === true
    );
  });

  it('serializes concurrent study operations without entity ID collision', async () => {
    const studyLog = [];
    let nextEntityId = 100;

    const addRSI = withChartTransaction('add_RSI', async () => {
      await new Promise(r => setTimeout(r, 25));
      const entityId = `study_${nextEntityId++}`;
      studyLog.push({ indicator: 'RSI', entityId });
      return { success: true, entityId };
    });

    const addMACD = withChartTransaction('add_MACD', async () => {
      await new Promise(r => setTimeout(r, 10));
      const entityId = `study_${nextEntityId++}`;
      studyLog.push({ indicator: 'MACD', entityId });
      return { success: true, entityId };
    });

    const [rsiRes, macdRes] = await Promise.all([addRSI, addMACD]);

    assert.equal(studyLog.length, 2);
    assert.equal(studyLog[0].indicator, 'RSI');
    assert.equal(studyLog[0].entityId, 'study_100');
    assert.equal(studyLog[1].indicator, 'MACD');
    assert.equal(studyLog[1].entityId, 'study_101');
    assert.notEqual(rsiRes.entityId, macdRes.entityId);
  });
});
