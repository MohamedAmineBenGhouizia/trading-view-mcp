import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncQueue } from '../src/connection.js';

describe('AsyncQueue — FIFO and Concurrency Safety', () => {
  it('executes tasks in strict FIFO order', async () => {
    const queue = new AsyncQueue('TestQueue');
    const order = [];

    const p1 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push(1);
      return 'task1';
    }, { label: 'task1' });

    const p2 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 10));
      order.push(2);
      return 'task2';
    }, { label: 'task2' });

    const p3 = queue.enqueue(async () => {
      order.push(3);
      return 'task3';
    }, { label: 'task3' });

    const results = await Promise.all([p1, p2, p3]);
    assert.deepEqual(order, [1, 2, 3]);
    assert.deepEqual(results, ['task1', 'task2', 'task3']);
  });

  it('recovers after a failing task without breaking the queue', async () => {
    const queue = new AsyncQueue('RecoveryQueue');

    const p1 = queue.enqueue(async () => {
      throw new Error('Task 1 boom');
    }, { label: 'failTask' });

    const p2 = queue.enqueue(async () => {
      return 'task 2 success';
    }, { label: 'successTask' });

    await assert.rejects(p1, /Task 1 boom/);
    const r2 = await p2;
    assert.equal(r2, 'task 2 success');
  });

  it('handles task timeout without hanging subsequent tasks', async () => {
    const queue = new AsyncQueue('TimeoutQueue');

    const pTimeout = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 200));
      return 'never';
    }, { label: 'longTask', timeout: 50 });

    const pNext = queue.enqueue(async () => {
      return 'nextTask';
    }, { label: 'nextTask', timeout: 500 });

    await assert.rejects(pTimeout, /timed out after 50ms/);
    const res = await pNext;
    assert.equal(res, 'nextTask');
  });

  it('reports accurate queue stats', async () => {
    const queue = new AsyncQueue('StatsQueue');

    const p1 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 20));
      return 'done';
    });
    const p2 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 20));
      return 'done';
    });

    assert.equal(queue.stats.active, 2);
    assert.equal(queue.stats.depth, 1);

    await Promise.all([p1, p2]);
    assert.equal(queue.stats.active, 0);
    assert.equal(queue.stats.processed, 2);
    assert.equal(queue.stats.depth, 0);
  });

  it('supports cancellation via AbortSignal', async () => {
    const queue = new AsyncQueue('AbortQueue');
    const controller = new AbortController();

    const p1 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 50));
      return 'first';
    });

    const p2 = queue.enqueue(async () => {
      return 'second';
    }, { label: 'abortable', signal: controller.signal });

    // Abort p2 while it is waiting in queue
    controller.abort();

    const r1 = await p1;
    assert.equal(r1, 'first');
    await assert.rejects(p2, /Task "abortable" was aborted/);
  });

  it('rejects tasks with backpressure error when backlog exceeds maxDepth', async () => {
    const queue = new AsyncQueue('BackpressureQueue', { maxDepth: 2 });

    // p1 starts executing
    const p1 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 50));
      return 'p1';
    });

    // p2 is enqueued (activeCount becomes 2)
    const p2 = queue.enqueue(async () => 'p2');

    // p3 exceeds maxDepth (activeCount >= 2) -> immediately rejected
    const p3 = queue.enqueue(async () => 'p3', { label: 'overflowTask' });

    await assert.rejects(p3, /\[BackpressureQueue_BACKPRESSURE\] Queue backlog exceeded maximum depth/);

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, 'p1');
    assert.equal(r2, 'p2');
  });
});
