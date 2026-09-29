import { evaluate, logDebug } from './connection.js';

const DEFAULT_TIMEOUT = 10000;
const POLL_INTERVAL = 50;

/**
 * Normalizes timeframe/resolution strings to allow comparing different formats
 * (e.g., "60" vs "1H", "1D" vs "D").
 */
export function normalizeResolution(res) {
  if (!res) return '';
  const s = String(res).trim().toUpperCase();
  if (s === 'D' || s === '1D') return '1D';
  if (s === 'W' || s === '1W') return '1W';
  if (s === 'M' || s === '1M') return '1M';
  const hourMatch = s.match(/^(\d+)H$/);
  if (hourMatch) return String(parseInt(hourMatch[1], 10) * 60);
  return s;
}

/**
 * Checks whether two symbols match, accounting for exchange prefixes
 * (e.g., "BINANCE:BTCUSDT" vs "BTCUSDT").
 */
export function symbolsMatch(current, expected) {
  if (!expected) return true;
  if (!current) return false;
  const c = String(current).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const e = String(expected).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.includes(e) || e.includes(c);
}

/**
 * Reactive condition waiter.
 * Polls `predicateFn` every `interval` ms (default 50ms) until it returns
 * a truthy value or `timeout` ms have elapsed.
 *
 * Tracks `lastState`, `lastError`, and `attempts`. Does NOT blindly swallow fatal errors.
 *
 * @template T
 * @param {() => Promise<T>|T} predicateFn Condition to test
 * @param {object} [options]
 * @param {number} [options.timeout=5000] Maximum wait time in milliseconds
 * @param {number} [options.interval=50] Polling interval in milliseconds
 * @param {string} [options.label='condition'] Description for diagnostic logging
 * @param {string} [options.timeoutMsg=null] Optional error message to throw on timeout
 * @param {(err: Error) => boolean} [options.isFatal=null] Callback to determine if an error is immediately fatal
 * @returns {Promise<T|false>} The truthy result of predicateFn, or false on timeout
 */
export async function waitForCondition(
  predicateFn,
  {
    timeout = 5000,
    interval = POLL_INTERVAL,
    label = 'condition',
    timeoutMsg = null,
    isFatal = null,
  } = {}
) {
  const start = Date.now();
  let lastState = null;
  let lastError = null;
  let attempts = 0;

  while (Date.now() - start < timeout) {
    attempts++;
    try {
      const result = await predicateFn();
      lastState = result;
      if (result) {
        logDebug('WAIT', `Condition "${label}" satisfied in ${Date.now() - start}ms (${attempts} attempts)`);
        return result;
      }
    } catch (err) {
      lastError = err;
      if (isFatal && isFatal(err)) {
        logDebug('WAIT', `Fatal error during "${label}": ${err.message}`);
        throw new Error(`[FATAL_WAIT_ERROR] in condition "${label}": ${err.message}`);
      }
      // Non-fatal transient evaluation error (e.g., execution context temporarily destroyed on page load)
    }
    await new Promise(r => setTimeout(r, interval));
  }

  const elapsed = Date.now() - start;
  const diag =
    `Condition "${label}" timed out after ${elapsed}ms (${attempts} attempts). ` +
    `Last state: ${JSON.stringify(lastState)}, Last error: ${lastError ? lastError.message : 'none'}`;

  logDebug('WAIT', diag);

  if (timeoutMsg) {
    throw new Error(`${timeoutMsg} -> ${diag}`);
  }

  return false;
}

/**
 * Non-blocking sleep helper.
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Verifies that TradingView chart is completely loaded, stable, and showing the
 * expected symbol and resolution.
 *
 * Validates V8 internal state first (mainSeries bars, symbol, resolution)
 * and uses DOM spinner / header as validation layer.
 *
 * @param {string|null} expectedSymbol Symbol ticker to verify
 * @param {string|null} expectedTf Timeframe/resolution to verify
 * @param {number} timeout Maximum wait in ms (default 10000)
 * @returns {Promise<boolean>} True if ready and verified, false if timed out
 */
export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT) {
  let stableTicks = 0;
  let lastBarCount = -1;
  let lastBarTime = null;

  const result = await waitForCondition(async () => {
    const state = await evaluate(`
      (function() {
        var res = {
          isLoading: false,
          currentSymbol: '',
          currentResolution: '',
          hasBars: false,
          barCount: 0,
          lastBarTime: null,
          apiAvailable: false,
        };

        // 1. Check DOM loading indicators
        var spinner = document.querySelector('[class*="loader"], [class*="loading"], [data-name="loading"]');
        if (spinner && spinner.offsetParent !== null) {
          res.isLoading = true;
        }

        // 2. Query internal TradingView chart engine (authoritative source)
        try {
          if (window.TradingViewApi && window.TradingViewApi._activeChartWidgetWV) {
            var chart = window.TradingViewApi._activeChartWidgetWV.value();
            if (chart) {
              res.apiAvailable = true;
              if (typeof chart.symbol === 'function') res.currentSymbol = chart.symbol();
              if (typeof chart.resolution === 'function') res.currentResolution = String(chart.resolution());

              if (chart._chartWidget && chart._chartWidget.model) {
                var model = chart._chartWidget.model();
                if (model && model.mainSeries) {
                  var ms = model.mainSeries();
                  var bars = ms.bars ? ms.bars() : null;
                  if (bars && typeof bars.size === 'function') {
                    res.barCount = bars.size();
                    res.hasBars = res.barCount > 0;
                    var lastIdx = typeof bars.lastIndex === 'function' ? bars.lastIndex() : -1;
                    if (lastIdx >= 0) {
                      var v = bars.valueAt(lastIdx);
                      if (v && v[0]) res.lastBarTime = v[0];
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          res.apiError = e.message;
        }

        // 3. Fallback header parsing if internal symbol is not yet bound
        if (!res.currentSymbol) {
          var symbolEl = document.querySelector('[data-name="legend-source-title"]')
            || document.querySelector('[class*="title"] [class*="apply-common-tooltip"]');
          if (symbolEl) res.currentSymbol = symbolEl.textContent.trim();
        }

        return res;
      })()
    `, { label: 'checkChartReady' });

    if (!state) return false;

    // Reject if UI still indicates loading
    if (state.isLoading) {
      stableTicks = 0;
      return false;
    }

    // Verify symbol match if requested
    if (expectedSymbol && !symbolsMatch(state.currentSymbol, expectedSymbol)) {
      stableTicks = 0;
      return false;
    }

    // Verify timeframe match if requested
    if (expectedTf) {
      const normActual = normalizeResolution(state.currentResolution);
      const normExpected = normalizeResolution(expectedTf);
      if (normActual && normExpected && normActual !== normExpected) {
        stableTicks = 0;
        return false;
      }
    }

    // Check bar count & lastBarTime stability across ticks (prevent reading half-rendered bars)
    if (state.hasBars && state.barCount === lastBarCount && state.lastBarTime === lastBarTime) {
      stableTicks++;
    } else {
      stableTicks = 0;
    }

    lastBarCount = state.barCount;
    lastBarTime = state.lastBarTime;

    // 2 consecutive stable ticks (100ms) with valid bars and matched state
    if (state.hasBars && stableTicks >= 2) {
      return state;
    }

    return false;
  }, {
    timeout,
    interval: POLL_INTERVAL,
    label: `chartReady(symbol=${expectedSymbol || '*'}, tf=${expectedTf || '*'})`,
  });

  return !!result;
}
