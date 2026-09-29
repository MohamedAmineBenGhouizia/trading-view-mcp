import CDP from 'chrome-remote-interface';
import { ErrorCode, TradingViewError, classifyError } from './core/errors.js';

export { ErrorCode, TradingViewError, classifyError };

// ── Connection States ────────────────────────────────────────────────────────
export const ConnectionState = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  STALE: 'STALE',
  RECONNECTING: 'RECONNECTING',
  FAILED: 'FAILED',
};

let connectionState = ConnectionState.DISCONNECTED;
let client = null;
let rawClientInstance = null;
let targetInfo = null;
let connectingPromise = null;

const CDP_HOST = 'localhost';
const CDP_PORT = 9222;
const MAX_RETRIES = 5;
const BASE_DELAY = 500;
const HTTP_TIMEOUT_MS = 4000;
const CDP_COMMAND_TIMEOUT_MS = 15000;
const TX_DEFAULT_TIMEOUT_MS = 30000;

// Debug logger writing strictly to stderr to preserve MCP stdio protocol
export function logDebug(category, message) {
  if (process.env.DEBUG_TV_MCP || process.env.NODE_ENV === 'test') {
    process.stderr.write(`[${category}] ${new Date().toISOString()} ${message}\n`);
  }
}

export function getConnectionState() {
  return connectionState;
}

// Known direct API paths discovered via live probing
const KNOWN_PATHS = {
  chartApi: 'window.TradingViewApi._activeChartWidgetWV.value()',
  chartWidgetCollection: 'window.TradingViewApi._chartWidgetCollection',
  bottomWidgetBar: 'window.TradingView.bottomWidgetBar',
  replayApi: 'window.TradingViewApi._replayApi',
  alertService: 'window.TradingViewApi._alertService',
  chartApiInstance: 'window.ChartApiInstance',
  mainSeriesBars: 'window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars()',
  strategyStudy: 'chart._chartWidget.model().model().dataSources()',
  layoutManager: 'window.TradingViewApi.getSavedCharts',
  symbolSearchApi: 'window.TradingViewApi.searchSymbols',
  pineFacadeApi: 'https://pine-facade.tradingview.com/pine-facade',
};

export { KNOWN_PATHS };

// ── Async FIFO Queue with Timeout, Cancellation & Diagnostics ───────────────
export class AsyncQueue {
  constructor(name = 'Queue', { maxDepth = 1000 } = {}) {
    this.name = name;
    this.maxDepth = maxDepth;
    this._queue = Promise.resolve();
    this._activeCount = 0;
    this._processedCount = 0;
  }

  /**
   * Enqueues a task and executes it in strict FIFO order with timeout and abort signal support.
   *
   * @template T
   * @param {() => Promise<T>|T} task
   * @param {object} [opts]
   * @param {string} [opts.label]
   * @param {number} [opts.timeout]
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<T>}
   */
  enqueue(task, { label = 'anonymous', timeout = CDP_COMMAND_TIMEOUT_MS, signal = null } = {}) {
    if (signal?.aborted) {
      return Promise.reject(new Error(`[${this.name}_ABORTED] Task "${label}" was aborted before execution`));
    }

    if (this._activeCount >= this.maxDepth) {
      return Promise.reject(
        new Error(`[${this.name}_BACKPRESSURE] Queue backlog exceeded maximum depth (${this.maxDepth}). Task "${label}" rejected.`)
      );
    }

    const enqueuedAt = Date.now();
    this._activeCount++;

    return new Promise((resolve, reject) => {
      this._queue = this._queue.then(async () => {
        if (signal?.aborted) {
          this._activeCount--;
          this._processedCount++;
          reject(new Error(`[${this.name}_ABORTED] Task "${label}" was aborted while waiting in queue`));
          return;
        }

        const startedAt = Date.now();
        const queueWaitMs = startedAt - enqueuedAt;
        let timer = null;

        const timeoutPromise = new Promise((_, timeoutReject) => {
          timer = setTimeout(() => {
            timeoutReject(
              new Error(
                `[${this.name}_TIMEOUT] Task "${label}" timed out after ${timeout}ms (waited in queue: ${queueWaitMs}ms)`
              )
            );
          }, timeout);
        });

        const abortPromise = signal
          ? new Promise((_, abortReject) => {
              signal.addEventListener('abort', () => abortReject(new Error(`[${this.name}_ABORTED] Task "${label}" was aborted`)), { once: true });
            })
          : null;

        const racers = [task(), timeoutPromise];
        if (abortPromise) racers.push(abortPromise);

        try {
          const result = await Promise.race(racers);
          clearTimeout(timer);
          const executionMs = Date.now() - startedAt;
          const totalMs = Date.now() - enqueuedAt;
          logDebug(this.name, `"${label}" ok | wait: ${queueWaitMs}ms, exec: ${executionMs}ms, total: ${totalMs}ms`);
          resolve(result);
        } catch (err) {
          clearTimeout(timer);
          const executionMs = Date.now() - startedAt;
          const totalMs = Date.now() - enqueuedAt;
          logDebug(this.name, `"${label}" error: ${err.message} | wait: ${queueWaitMs}ms, exec: ${executionMs}ms, total: ${totalMs}ms`);
          reject(err);
        } finally {
          this._activeCount--;
          this._processedCount++;
        }
      });
    });
  }

  get stats() {
    return {
      name: this.name,
      active: this._activeCount,
      processed: this._processedCount,
      depth: Math.max(0, this._activeCount - 1),
      maxDepth: this.maxDepth,
    };
  }
}

// Dedicated CDP command queue (serializes low-level CDP frames)
export const cdpQueue = new AsyncQueue('CDP', { maxDepth: 1000 });

// Dedicated Chart Transaction Queue (serializes multi-step high-level chart transactions)
export const chartTxQueue = new AsyncQueue('CHART_TX', { maxDepth: 500 });

/**
 * Execute a composite chart transaction with an exclusive lock on global chart state.
 * Prevents race conditions where concurrent tool calls (e.g., setSymbol A vs setSymbol B)
 * interleave mutations and read corrupted or wrong data.
 *
 * @template T
 * @param {string} label Transaction description for tracing
 * @param {() => Promise<T>|T} fn Transaction function
 * @param {object} [opts]
 * @param {number} [opts.timeout] Timeout in ms (default 30000)
 * @returns {Promise<T>}
 */
export async function withChartTransaction(label, fn, { timeout = TX_DEFAULT_TIMEOUT_MS } = {}) {
  logDebug('TX', `Queuing transaction "${label}"`);
  return chartTxQueue.enqueue(async () => {
    logDebug('TX', `Starting transaction "${label}"`);
    const txStart = Date.now();
    try {
      const res = await fn();
      logDebug('TX', `Finished transaction "${label}" in ${Date.now() - txStart}ms`);
      return res;
    } catch (err) {
      logDebug('TX', `Failed transaction "${label}" in ${Date.now() - txStart}ms: ${err.message}`);
      throw err;
    }
  }, { label, timeout });
}

export function withCDP(fn, opts = {}) {
  return cdpQueue.enqueue(fn, opts);
}

// Wrap raw CDP client with a proxy so every domain method call is serialized through cdpQueue
function wrapCDPClient(raw) {
  if (!raw) return raw;
  return new Proxy(raw, {
    get(target, prop) {
      const orig = target[prop];
      if (typeof orig === 'function') {
        return (...args) => cdpQueue.enqueue(() => orig.apply(target, args), { label: `client.${String(prop)}` });
      }
      if (orig && typeof orig === 'object') {
        return new Proxy(orig, {
          get(domainTarget, domainProp) {
            const domainMethod = domainTarget[domainProp];
            if (typeof domainMethod === 'function') {
              return (...args) =>
                cdpQueue.enqueue(() => domainMethod.apply(domainTarget, args), {
                  label: `${String(prop)}.${String(domainProp)}`,
                });
            }
            return domainMethod;
          },
        });
      }
      return orig;
    },
  });
}

// Raw client getter with liveness check and re-entrancy protection
async function getRawClient() {
  if (client && connectionState === ConnectionState.CONNECTED) {
    try {
      // Direct raw evaluate liveness probe (bypasses queue to prevent re-entrant deadlock)
      await client.Runtime.evaluate({ expression: '1', returnByValue: true });
      return client;
    } catch (err) {
      logDebug('RECONNECT', `Liveness probe failed: ${err.message}. Invalidating client.`);
      connectionState = ConnectionState.STALE;
      client = null;
      rawClientInstance = null;
      targetInfo = null;
    }
  }

  // Prevent multiple simultaneous connection attempts
  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = connectInternal()
    .finally(() => {
      connectingPromise = null;
    });

  return connectingPromise;
}

export async function getClient() {
  const raw = await getRawClient();
  return wrapCDPClient(raw);
}

async function connectInternal() {
  connectionState = client ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING;
  logDebug('CDP', `Connecting to TradingView on ${CDP_HOST}:${CDP_PORT} (state: ${connectionState})...`);

  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const target = await findChartTarget();
      if (!target) {
        throw new Error('No TradingView chart target found. Is TradingView open with a chart?');
      }
      targetInfo = target;

      const newClient = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });

      // Attach proactive disconnect handlers
      newClient.on('disconnect', () => {
        logDebug('CDP', 'WebSocket disconnected from TradingView target');
        connectionState = ConnectionState.STALE;
        client = null;
        rawClientInstance = null;
      });

      // Enable required domains
      await newClient.Runtime.enable();
      await newClient.Page.enable();
      await newClient.DOM.enable();

      client = newClient;
      rawClientInstance = newClient;
      connectionState = ConnectionState.CONNECTED;
      logDebug('CDP', `Successfully connected to target "${target.title || target.id}"`);
      return client;
    } catch (err) {
      lastError = err;
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), 5000);
      logDebug('CDP', `Connection attempt ${attempt + 1}/${MAX_RETRIES} failed (${err.message}). Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  connectionState = ConnectionState.FAILED;
  throw new Error(`CDP connection failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

export async function connect() {
  return getClient();
}

async function findChartTarget() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`CDP HTTP endpoint returned status ${resp.status}`);
    }

    const targets = await resp.json();
    return targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
      || targets.find(t => t.type === 'page' && /tradingview/i.test(t.url))
      || null;
  } catch (err) {
    throw new Error(`Failed to query CDP targets at http://${CDP_HOST}:${CDP_PORT}/json/list: ${err.message}`);
  }
}

export async function getTargetInfo() {
  if (!targetInfo || connectionState !== ConnectionState.CONNECTED) {
    await getRawClient();
  }
  return targetInfo;
}

export async function evaluate(expression, opts = {}) {
  const label = opts.label || `eval(${expression.slice(0, 40).replace(/\s+/g, ' ')})`;
  return cdpQueue.enqueue(async () => {
    const c = await getRawClient();
    const result = await c.Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise: opts.awaitPromise ?? false,
      ...opts,
    });
    if (result.exceptionDetails) {
      const msg = result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || 'Unknown evaluation error';
      throw new Error(`JS evaluation error: ${msg}`);
    }
    return result.result?.value;
  }, { label, timeout: opts.timeout || CDP_COMMAND_TIMEOUT_MS });
}

export async function evaluateAsync(expression, opts = {}) {
  return evaluate(expression, { ...opts, awaitPromise: true });
}

export async function disconnect() {
  return cdpQueue.enqueue(async () => {
    if (client) {
      try {
        await client.close();
      } catch {}
      client = null;
      rawClientInstance = null;
      targetInfo = null;
    }
    connectionState = ConnectionState.DISCONNECTED;
    logDebug('CDP', 'Disconnected and cleaned up references.');
  }, { label: 'disconnect' });
}

export const closeClient = disconnect;

// --- Direct API path helpers ---
async function verifyAndReturn(path, name) {
  const exists = await evaluate(`typeof (${path}) !== 'undefined' && (${path}) !== null`, {
    label: `verify(${name})`,
  });
  if (!exists) {
    throw new Error(`${name} not available at ${path}`);
  }
  return path;
}

export async function getChartApi() {
  return verifyAndReturn(KNOWN_PATHS.chartApi, 'Chart API');
}

export async function getChartCollection() {
  return verifyAndReturn(KNOWN_PATHS.chartWidgetCollection, 'Chart Widget Collection');
}

export async function getBottomBar() {
  return verifyAndReturn(KNOWN_PATHS.bottomWidgetBar, 'Bottom Widget Bar');
}

export async function getReplayApi() {
  return verifyAndReturn(KNOWN_PATHS.replayApi, 'Replay API');
}

export async function getMainSeriesBars() {
  return verifyAndReturn(KNOWN_PATHS.mainSeriesBars, 'Main Series Bars');
}
