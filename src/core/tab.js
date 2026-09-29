/**
 * Core tab management logic.
 * Controls TradingView Desktop tabs via CDP and Electron keyboard shortcuts.
 */
import { getClient, evaluate, closeClient, withChartTransaction } from '../connection.js';
import { waitForCondition } from '../wait.js';

const CDP_HOST = 'localhost';
const CDP_PORT = 9222;

/**
 * List all open chart tabs (CDP page targets).
 */
export async function list() {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`, {
    signal: AbortSignal.timeout(3000),
  });
  const targets = await resp.json();

  const tabs = targets
    .filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
    .map((t, i) => ({
      index: i,
      id: t.id,
      title: (t.title || '').replace(/^Live stock.*charts on /, ''),
      url: t.url,
      chart_id: t.url.match(/\/chart\/([^/?]+)/)?.[1] || null,
    }));

  return { success: true, tab_count: tabs.length, tabs };
}

/**
 * Open a new chart tab via keyboard shortcut (Ctrl+T / Cmd+T).
 */
export async function newTab() {
  return withChartTransaction('tab:newTab', async () => {
    const before = await list();
    const c = await getClient();

    const isMac = process.platform === 'darwin';
    const mod = isMac ? 4 : 2; // 4 = meta (Cmd), 2 = ctrl

    await c.Input.dispatchKeyEvent({
      type: 'keyDown',
      modifiers: mod,
      key: 't',
      code: 'KeyT',
      windowsVirtualKeyCode: 84,
    });
    await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 't', code: 'KeyT' });

    // Reactively wait for a new tab to appear
    const state = await waitForCondition(async () => {
      const current = await list();
      return current.tab_count > before.tab_count ? current : false;
    }, { timeout: 4000, interval: 100, label: 'tab.newTab' });

    return { success: true, action: 'new_tab_opened', ...state };
  });
}

/**
 * Close the current tab via keyboard shortcut (Ctrl+W / Cmd+W).
 */
export async function closeTab() {
  return withChartTransaction('tab:closeTab', async () => {
    const before = await list();
    if (before.tab_count <= 1) {
      throw new Error('Cannot close the last tab. Use tv_launch to restart TradingView instead.');
    }

    const c = await getClient();
    const isMac = process.platform === 'darwin';
    const mod = isMac ? 4 : 2;

    await c.Input.dispatchKeyEvent({
      type: 'keyDown',
      modifiers: mod,
      key: 'w',
      code: 'KeyW',
      windowsVirtualKeyCode: 87,
    });
    await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'w', code: 'KeyW' });

    // Reactively wait for tab count to decrement
    const after = await waitForCondition(async () => {
      const current = await list();
      return current.tab_count < before.tab_count ? current : false;
    }, { timeout: 3000, interval: 100, label: 'tab.closeTab' });

    // Invalidate stale client since the active tab closed
    await closeClient();

    return { success: true, action: 'tab_closed', tabs_before: before.tab_count, tabs_after: after.tab_count };
  });
}

/**
 * Switch to a tab by index. Reconnects CDP to the new target.
 */
export async function switchTab({ index }) {
  return withChartTransaction(`tab:switchTab:${index}`, async () => {
    const tabs = await list();
    const idx = Number(index);

    if (idx >= tabs.tab_count) {
      throw new Error(`Tab index ${idx} out of range (have ${tabs.tab_count} tabs)`);
    }

    const target = tabs.tabs[idx];

    // Use CDP Target.activateTarget to bring the tab to front
    try {
      const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/activate/${target.id}`, {
        signal: AbortSignal.timeout(3000),
      });
      await resp.text();

      // Reset client connection so next command connects to the newly activated target
      await closeClient();

      return { success: true, action: 'switched', index: idx, tab_id: target.id, chart_id: target.chart_id };
    } catch (e) {
      throw new Error(`Failed to activate tab ${idx}: ${e.message}`);
    }
  });
}
