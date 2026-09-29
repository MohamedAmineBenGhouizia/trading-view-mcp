import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/watchlist.js';

export function registerWatchlistTools(server) {
  server.tool(
    'watchlist_get',
    'Get all financial symbols from current TradingView watchlist with real-time last price, absolute price change, and percentage change. WHEN TO USE: Call when scanning market watchlists or monitoring asset universe for opportunities. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires watchlist to have symbols loaded.',
    {},
    async () => {
      try { return jsonResult(await core.get()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'watchlist_add',
    'Add a financial instrument/ticker to the active TradingView watchlist. WHEN TO USE: Call when tracking a newly discovered symbol for continued monitoring. SIDE EFFECTS: STATE_MUTATING (Adds symbol to user watchlist). LIMITATIONS: Symbol must be valid on TradingView.',
    {
      symbol: z.string().describe('Symbol to add (e.g., AAPL, BTCUSD, ES1!, NYMEX:CL1!)'),
    },
    async ({ symbol }) => {
      try { return jsonResult(await core.add({ symbol })); }
      catch (err) {
        // Try to close any open search/input on error
        try {
          const { getClient } = await import('../connection.js');
          const c = await getClient();
          await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        } catch (_) {}
        return errorResult(err);
      }
    }
  );
}
