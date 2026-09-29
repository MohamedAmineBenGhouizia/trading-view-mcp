import CDP from 'chrome-remote-interface';

let client = null;
let targetInfo = null;
const CDP_HOST = 'localhost';
const CDP_PORT = 9222;
const MAX_RETRIES = 5;
const BASE_DELAY = 500;

// Known direct API paths discovered via live probing (see PROBE_RESULTS.md)
const KNOWN_PATHS = {
  chartApi: 'window.TradingViewApi._activeChartWidgetWV.value()',
  chartWidgetCollection: 'window.TradingViewApi._chartWidgetCollection',
  bottomWidgetBar: 'window.TradingView.bottomWidgetBar',
  replayApi: 'window.TradingViewApi._replayApi',
  alertService: 'window.TradingViewApi._alertService',
  chartApiInstance: 'window.ChartApiInstance',
  mainSeriesBars: 'window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars()',
  // Phase 1: Strategy data — model().dataSources() → find strategy → .performance().value(), .ordersData(), .reportData()
  strategyStudy: 'chart._chartWidget.model().model().dataSources()',
  // Phase 2: Layouts — getSavedCharts(cb), loadChartFromServer(id)
  layoutManager: 'window.TradingViewApi.getSavedCharts',
  // Phase 5: Symbol search — searchSymbols(query) returns Promise
  symbolSearchApi: 'window.TradingViewApi.searchSymbols',
  // Phase 6: Pine scripts — REST API at pine-facade.tradingview.com/pine-facade/list/?filter=saved
  pineFacadeApi: 'https://pine-facade.tradingview.com/pine-facade',
};

export { KNOWN_PATHS };

class AsyncQueue {
  constructor() {
    this._queue = Promise.resolve();
  }

  /**
   * Enqueues a task and executes it in strict FIFO order.
   * @template T
   * @param {() => Promise<T>|T} task
   * @returns {Promise<T>}
   */
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this._queue = this._queue.then(async () => {
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}

export const cdpQueue = new AsyncQueue();

export function withCDP(fn) {
  return cdpQueue.enqueue(fn);
}

function wrapCDPClient(raw) {
  if (!raw) return raw;
  return new Proxy(raw, {
    get(target, prop) {
      const orig = target[prop];
      if (typeof orig === 'function') {
        return (...args) => cdpQueue.enqueue(() => orig.apply(target, args));
      }
      if (orig && typeof orig === 'object') {
        return new Proxy(orig, {
          get(domainTarget, domainProp) {
            const domainMethod = domainTarget[domainProp];
            if (typeof domainMethod === 'function') {
              return (...args) => cdpQueue.enqueue(() => domainMethod.apply(domainTarget, args));
            }
            return domainMethod;
          }
        });
      }
      return orig;
    }
  });
}

async function getRawClient() {
  if (client) {
    try {
      // Quick liveness check on raw client (bypass queue to avoid deadlock)
      await client.Runtime.evaluate({ expression: '1', returnByValue: true });
      return client;
    } catch {
      client = null;
      targetInfo = null;
    }
  }
  return connect();
}

export async function getClient() {
  const raw = await getRawClient();
  return wrapCDPClient(raw);
}

export async function connect() {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const target = await findChartTarget();
      if (!target) {
        throw new Error('No TradingView chart target found. Is TradingView open with a chart?');
      }
      targetInfo = target;
      client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });

      // Enable required domains
      await client.Runtime.enable();
      await client.Page.enable();
      await client.DOM.enable();

      return client;
    } catch (err) {
      lastError = err;
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), 30000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`CDP connection failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

async function findChartTarget() {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();
  // Prefer targets with tradingview.com/chart in the URL
  return targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
    || targets.find(t => t.type === 'page' && /tradingview/i.test(t.url))
    || null;
}

export async function getTargetInfo() {
  if (!targetInfo) {
    await getRawClient();
  }
  return targetInfo;
}

export async function evaluate(expression, opts = {}) {
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
  });
}

export async function evaluateAsync(expression) {
  return evaluate(expression, { awaitPromise: true });
}

export async function disconnect() {
  return cdpQueue.enqueue(async () => {
    if (client) {
      try { await client.close(); } catch {}
      client = null;
      targetInfo = null;
    }
  });
}

// --- Direct API path helpers ---
// Each returns the STRING expression path after verifying it exists.
// Callers use the returned string in their own evaluate() calls.

async function verifyAndReturn(path, name) {
  const exists = await evaluate(`typeof (${path}) !== 'undefined' && (${path}) !== null`);
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
