import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/pane.js';

export function registerPaneTools(server) {
  server.tool(
    'pane_list',
    'List all chart panes in the current split-view workspace with their active symbols, resolutions, and focus state. WHEN TO USE: Call before manipulating multi-chart layouts to discover pane indices. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires multi-chart layout active to list multiple panes.',
    {},
    async () => {
      try { return jsonResult(await core.list()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pane_set_layout',
    'Change the chart grid layout grid (e.g., single "s", "2h", "2v", "4" quad grid). WHEN TO USE: Call when configuring multi-chart views for correlated assets or multi-timeframe monitoring. SIDE EFFECTS: STATE_MUTATING (Alters window grid division and creates/destroys chart panes). LIMITATIONS: Layout codes: s, 2h, 2v, 2-1, 1-2, 3h, 3v, 4, 6, 8.',
    {
      layout: z.string().describe('Layout code: s (single), 2h, 2v, 2-1, 1-2, 3h, 3v, 4 (2x2), 6, 8. Also accepts: single, 2x1, 1x2, 2x2, quad'),
    },
    async ({ layout }) => {
      try { return jsonResult(await core.setLayout({ layout })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pane_focus',
    'Switch active user focus to a specific chart pane by index (0-based). WHEN TO USE: Call before executing chart operations targeted at a secondary pane in a multi-chart layout. SIDE EFFECTS: STATE_MUTATING (Changes active chart focus). LIMITATIONS: Index must be valid within pane_list.',
    {
      index: z.coerce.number().describe('Pane index (0-based, from pane_list)'),
    },
    async ({ index }) => {
      try { return jsonResult(await core.focus({ index })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pane_set_symbol',
    'Set financial ticker symbol directly on a specific pane index without changing active focus. WHEN TO USE: Call when populating multi-pane grids with correlated tickers (e.g. BTCUSD on pane 0, ETHUSD on pane 1). SIDE EFFECTS: STATE_MUTATING (Changes symbol on target pane). LIMITATIONS: Target pane index must exist.',
    {
      index: z.coerce.number().describe('Pane index (0-based)'),
      symbol: z.string().describe('Symbol to set (e.g., NQ1!, ES1!, AAPL)'),
    },
    async ({ index, symbol }) => {
      try { return jsonResult(await core.setSymbol({ index, symbol })); }
      catch (err) { return errorResult(err); }
    }
  );
}
