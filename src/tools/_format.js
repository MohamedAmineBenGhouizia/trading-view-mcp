/**
 * Standard MCP response and error formatting helper.
 * Enforces consistent error schema, error classification, and telemetry.
 */
import { classifyError, TradingViewError } from '../core/errors.js';

/**
 * Formats a successful response or raw object for MCP transport.
 * @param {object} obj
 * @param {boolean} [isError=false]
 * @returns {object} MCP-compliant response
 */
export function jsonResult(obj, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
    ...(isError && { isError: true }),
  };
}

/**
 * Standardized error result adhering to the TradingView MCP Error Contract.
 * Preserves backwards-compatibility with { success: false, error: err.message }
 * while attaching rich, structured errorDetails.
 *
 * @param {Error|TradingViewError|any} err Thrown error
 * @param {object|null} [context=null] Additional contextual data or OperationContext
 * @returns {object} MCP error response
 */
export function errorResult(err, context = null) {
  const contextData = context && typeof context.toJSON === 'function' ? context.toJSON() : (context || {});
  const classified = classifyError(err, contextData);

  const payload = {
    success: false,
    error: classified.message,
    errorDetails: {
      code: classified.code,
      message: classified.message,
      retryable: classified.retryable,
      operationId: classified.operationId || contextData.operationId || null,
      context: classified.context || contextData,
    },
  };

  return jsonResult(payload, true);
}
