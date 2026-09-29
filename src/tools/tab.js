import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/tab.js';

export function registerTabTools(server) {
  server.tool(
    'tab_list',
    'List all open TradingView desktop application tabs with index, title, and active focus status. WHEN TO USE: Call before managing application tabs to locate specific tab indices. SIDE EFFECTS: None (Read-only). LIMITATIONS: Operates across TradingView Desktop tabs.',
    {},
    async () => {
      try { return jsonResult(await core.list()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'tab_new',
    'Open a new chart tab in TradingView Desktop window. WHEN TO USE: Call when opening a fresh chart workspace without disrupting the current tab. SIDE EFFECTS: STATE_MUTATING (Creates new desktop window tab). LIMITATIONS: TradingView Desktop must support multi-tab mode.',
    {},
    async () => {
      try { return jsonResult(await core.newTab()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'tab_close',
    'Close the currently active chart tab in TradingView Desktop. WHEN TO USE: Call when finished with a temporary workspace tab to release system memory. SIDE EFFECTS: STATE_MUTATING (Closes active tab). LIMITATIONS: Will not close window if only one tab remains.',
    {},
    async () => {
      try { return jsonResult(await core.closeTab()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'tab_switch',
    'Switch active desktop window focus to a target tab by index (0-based). WHEN TO USE: Call when toggling between multiple open chart tabs. SIDE EFFECTS: STATE_MUTATING (Changes active tab focus). LIMITATIONS: Index must be valid within tab_list.',
    {
      index: z.coerce.number().describe('Tab index (0-based, from tab_list)'),
    },
    async ({ index }) => {
      try { return jsonResult(await core.switchTab({ index })); }
      catch (err) { return errorResult(err); }
    }
  );
}
