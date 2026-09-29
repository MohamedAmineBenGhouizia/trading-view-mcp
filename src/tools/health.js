import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/health.js';

export function registerHealthTools(server) {
  server.tool(
    'tv_health_check',
    'Verify CDP connection liveness to TradingView Desktop and return active chart state. WHEN TO USE: Call at session start or when diagnosing connectivity failures before attempting chart commands. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires TradingView Desktop running with remote debugging enabled on port 9222.',
    {},
    async () => {
      try { return jsonResult(await core.healthCheck()); }
      catch (err) { return errorResult(err, { hint: 'TradingView is not running with CDP enabled. Use the tv_launch tool to start it automatically.' }); }
    }
  );

  server.tool(
    'tv_discover',
    'Inspect and discover available TradingView internal API paths, chart widgets, and exposed methods in the active window context. WHEN TO USE: Call when debugging Charting API availability or probing supported internal features. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires an active, loaded chart page.',
    {},
    async () => {
      try { return jsonResult(await core.discover()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'tv_ui_state',
    'Get real-time UI state of TradingView window: detects open/closed bottom panels, visible dialogs, active tabs, and enabled control buttons. WHEN TO USE: Call before interacting with UI panels (Pine Editor, Strategy Tester) to ensure target DOM elements are present. SIDE EFFECTS: None (Read-only). LIMITATIONS: Assumes standard desktop window hierarchy.',
    {},
    async () => {
      try { return jsonResult(await core.uiState()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'tv_launch',
    'Launch TradingView Desktop with Chrome DevTools Protocol (remote debugging) enabled on target port. Auto-detects executable path across Windows, macOS, and Linux. WHEN TO USE: Call automatically when tv_health_check fails due to TradingView not running. SIDE EFFECTS: EXTERNAL_SIDE_EFFECT (Spawns desktop application process, optionally terminates existing instances). LIMITATIONS: Requires TradingView Desktop to be installed on the local system.',
    {
      port: z.coerce.number().optional().describe('CDP port (default 9222)'),
      kill_existing: z.coerce.boolean().optional().describe('Kill existing TradingView instances first (default true)'),
    },
    async ({ port, kill_existing }) => {
      try { return jsonResult(await core.launch({ port, kill_existing })); }
      catch (err) { return errorResult(err); }
    }
  );
}
