import { evaluate } from './connection.js';

const DEFAULT_TIMEOUT = 10000;
const POLL_INTERVAL = 50;

/**
 * Reactive condition waiter.
 * Polls `predicateFn` every `interval` ms (default 50ms) until it returns
 * a truthy value or `timeout` ms have elapsed.
 *
 * @template T
 * @param {() => Promise<T>|T} predicateFn Condition to test
 * @param {object} [options]
 * @param {number} [options.timeout=5000] Maximum wait time in milliseconds
 * @param {number} [options.interval=50] Polling interval in milliseconds
 * @param {string} [options.timeoutMsg=null] Optional error message to throw on timeout
 * @returns {Promise<T|false>} The truthy result of predicateFn, or false on timeout
 */
export async function waitForCondition(predicateFn, { timeout = 5000, interval = 50, timeoutMsg = null } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const result = await predicateFn();
      if (result) {
        return result;
      }
    } catch {
      // Ignore transient evaluation errors during transition states
    }
    await new Promise(r => setTimeout(r, interval));
  }
  if (timeoutMsg) {
    throw new Error(timeoutMsg);
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

export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT) {
  const start = Date.now();
  let lastBarCount = -1;
  let stableCount = 0;

  while (Date.now() - start < timeout) {
    const state = await evaluate(`
      (function() {
        // Check for loading spinner
        var spinner = document.querySelector('[class*="loader"]')
          || document.querySelector('[class*="loading"]')
          || document.querySelector('[data-name="loading"]');
        var isLoading = spinner && spinner.offsetParent !== null;

        // Try to get bar count from data window or chart
        var barCount = -1;
        try {
          var bars = document.querySelectorAll('[class*="bar"]');
          barCount = bars.length;
        } catch {}

        // Get current symbol from header
        var symbolEl = document.querySelector('[data-name="legend-source-title"]')
          || document.querySelector('[class*="title"] [class*="apply-common-tooltip"]');
        var currentSymbol = symbolEl ? symbolEl.textContent.trim() : '';

        return { isLoading: !!isLoading, barCount: barCount, currentSymbol: currentSymbol };
      })()
    `);

    if (!state) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    // Not ready if still loading
    if (state.isLoading) {
      stableCount = 0;
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    // Check symbol match if expected
    if (expectedSymbol && state.currentSymbol && !state.currentSymbol.toUpperCase().includes(expectedSymbol.toUpperCase())) {
      stableCount = 0;
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    // Check bar count stability
    if (state.barCount === lastBarCount && state.barCount > 0) {
      stableCount++;
    } else {
      stableCount = 0;
    }
    lastBarCount = state.barCount;

    if (stableCount >= 2) {
      return true;
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  // Timeout — return false, caller should verify
  return false;
}
