import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/batch.js';

export function registerBatchTools(server) {
  server.tool(
    'batch_run',
    'Execute a sequential analytical action across an array of symbols and timeframes (actions: "screenshot", "get_ohlcv", "get_strategy_results"). WHEN TO USE: Call when running automated screening, batch chart captures, or cross-asset data collection. SIDE EFFECTS: STATE_MUTATING (Sequentially navigates chart symbols/timeframes; action may write screenshot files). LIMITATIONS: Runs sequentially with configurable inter-iteration delay.',
    {
      symbols: z.array(z.string()).describe('Array of symbols to iterate (e.g., ["BTCUSD", "ETHUSD", "AAPL"])'),
      timeframes: z.array(z.string()).optional().describe('Array of timeframes (e.g., ["D", "60", "15"])'),
      action: z.string().describe('Action to run: screenshot, get_ohlcv, get_strategy_results'),
      delay_ms: z.coerce.number().optional().describe('Delay between iterations in ms (default 2000)'),
      ohlcv_count: z.coerce.number().optional().describe('Bar count for get_ohlcv action (default 100)'),
    },
    async ({ symbols, timeframes, action, delay_ms, ohlcv_count }) => {
      try { return jsonResult(await core.batchRun({ symbols, timeframes, action, delay_ms, ohlcv_count })); }
      catch (err) { return errorResult(err); }
    }
  );
}
