import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode, TradingViewError, classifyError } from '../src/core/errors.js';
import { errorResult, jsonResult } from '../src/tools/_format.js';

describe('Error Contract and Classification', () => {
  it('classifies WebSocket and connection lost errors as CDP_DISCONNECTED with retryable: true', () => {
    const rawErr = new Error('WebSocket is not open: readyState 3 (CLOSED)');
    const classified = classifyError(rawErr);

    assert.equal(classified.code, ErrorCode.CDP_DISCONNECTED);
    assert.equal(classified.retryable, true);
  });

  it('classifies timeouts as CDP_TIMEOUT with retryable: true', () => {
    const rawErr = new Error('[CDP_TIMEOUT] Task "eval" timed out after 15000ms');
    const classified = classifyError(rawErr);

    assert.equal(classified.code, ErrorCode.CDP_TIMEOUT);
    assert.equal(classified.retryable, true);
  });

  it('classifies stale chart state as STALE_CHART_STATE with retryable: true', () => {
    const rawErr = new Error('chart state changed: generation mismatch');
    const classified = classifyError(rawErr);

    assert.equal(classified.code, ErrorCode.STALE_CHART_STATE);
    assert.equal(classified.retryable, true);
  });

  it('classifies invalid arguments as non-retryable', () => {
    const rawErr = new Error('invalid timeframe specified: 99ZZ');
    const classified = classifyError(rawErr);

    assert.equal(classified.code, ErrorCode.INVALID_TIMEFRAME);
    assert.equal(classified.retryable, false);
  });

  it('formats errorResult conforming to the MCP error protocol and backwards-compatible contract', () => {
    const err = new TradingViewError(
      ErrorCode.STALE_CHART_STATE,
      'Chart state changed during read',
      { retryable: true, operationId: 'op_123', context: { gen: 41 } }
    );

    const mcpRes = errorResult(err);

    assert.equal(mcpRes.isError, true);
    assert.ok(Array.isArray(mcpRes.content));
    assert.equal(mcpRes.content[0].type, 'text');

    const parsed = JSON.parse(mcpRes.content[0].text);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error, 'Chart state changed during read');
    assert.deepEqual(parsed.errorDetails, {
      code: 'STALE_CHART_STATE',
      message: 'Chart state changed during read',
      retryable: true,
      operationId: 'op_123',
      context: { gen: 41 },
    });
  });
});
