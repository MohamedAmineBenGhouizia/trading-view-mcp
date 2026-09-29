/**
 * Standard error codes and error structures for TradingView MCP.
 */

export const ErrorCode = {
  CDP_DISCONNECTED: 'CDP_DISCONNECTED',
  CDP_TIMEOUT: 'CDP_TIMEOUT',
  TRADINGVIEW_NOT_READY: 'TRADINGVIEW_NOT_READY',
  STALE_CHART_STATE: 'STALE_CHART_STATE',
  INVALID_SYMBOL: 'INVALID_SYMBOL',
  INVALID_TIMEFRAME: 'INVALID_TIMEFRAME',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  DATA_NOT_READY: 'DATA_NOT_READY',
  DATA_STALE: 'DATA_STALE',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

export class TradingViewError extends Error {
  /**
   * @param {string} code Error code from ErrorCode enum
   * @param {string} message Descriptive human-readable error message
   * @param {object} [options]
   * @param {boolean} [options.retryable=false] Whether the client agent should retry this operation
   * @param {string|null} [options.operationId=null] ID of the operation that encountered this error
   * @param {object} [options.context={}] Additional context data (symbol, timeframe, generation, etc.)
   */
  constructor(code, message, { retryable = false, operationId = null, context = {} } = {}) {
    super(message);
    this.name = 'TradingViewError';
    this.code = code;
    this.retryable = retryable;
    this.operationId = operationId;
    this.context = context;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      operationId: this.operationId,
      context: this.context,
    };
  }
}

/**
 * Classifies an arbitrary thrown error into a structured TradingViewError.
 * @param {Error|any} err
 * @param {object} [defaultContext={}]
 * @returns {TradingViewError}
 */
export function classifyError(err, defaultContext = {}) {
  if (err instanceof TradingViewError) {
    return err;
  }

  const msg = err?.message || String(err);

  // CDP Disconnection
  if (/websocket|econnreset|econnrefused|not open|target closed|connection closed/i.test(msg)) {
    return new TradingViewError(
      ErrorCode.CDP_DISCONNECTED,
      `TradingView CDP connection lost: ${msg}`,
      { retryable: true, context: defaultContext }
    );
  }

  // Timeout
  if (/timeout|timed out/i.test(msg)) {
    return new TradingViewError(
      ErrorCode.CDP_TIMEOUT,
      `Operation timed out: ${msg}`,
      { retryable: true, context: defaultContext }
    );
  }

  // Stale state
  if (/stale|generation mismatch|obsolete/i.test(msg)) {
    return new TradingViewError(
      ErrorCode.STALE_CHART_STATE,
      `Operation aborted due to stale chart state: ${msg}`,
      { retryable: true, context: defaultContext }
    );
  }

  // Symbol / Timeframe errors
  if (/invalid symbol|symbol not found|unknown symbol/i.test(msg)) {
    return new TradingViewError(
      ErrorCode.INVALID_SYMBOL,
      msg,
      { retryable: false, context: defaultContext }
    );
  }

  if (/invalid timeframe|timeframe mismatch|resolution mismatch/i.test(msg)) {
    return new TradingViewError(
      ErrorCode.INVALID_TIMEFRAME,
      msg,
      { retryable: false, context: defaultContext }
    );
  }

  // Target not found
  if (/no.*target found|cannot find target/i.test(msg)) {
    return new TradingViewError(
      ErrorCode.TARGET_NOT_FOUND,
      msg,
      { retryable: true, context: defaultContext }
    );
  }

  // Data / Readiness
  if (/loading|not ready|chart may still be loading/i.test(msg)) {
    return new TradingViewError(
      ErrorCode.TRADINGVIEW_NOT_READY,
      msg,
      { retryable: true, context: defaultContext }
    );
  }

  if (/aborted|cancelled|canceled/i.test(msg)) {
    return new TradingViewError(
      ErrorCode.OPERATION_CANCELLED,
      msg,
      { retryable: false, context: defaultContext }
    );
  }

  // Default internal error
  return new TradingViewError(
    ErrorCode.INTERNAL_ERROR,
    msg,
    { retryable: false, context: defaultContext }
  );
}
