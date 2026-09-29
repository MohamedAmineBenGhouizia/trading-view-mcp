import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/replay.js';

export function registerReplayTools(server) {
  server.tool(
    'replay_start',
    'Enter TradingView Bar Replay mode at a specified historical date or first available bar. WHEN TO USE: Call when initiating historical simulated forward-testing or practicing trade executions bar by bar. SIDE EFFECTS: STATE_MUTATING (Switches chart into Replay mode, rewinds visible price action). LIMITATIONS: Requires market symbol with historical data at chosen date.',
    {
      date: z.string().optional().describe('Date to start replay from (YYYY-MM-DD format). If omitted, selects first available date.'),
    },
    async ({ date }) => {
      try { return jsonResult(await core.start({ date })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'replay_step',
    'Advance replay forward by exactly one candle bar. WHEN TO USE: Call during manual forward simulation to reveal subsequent market price action step by step. SIDE EFFECTS: STATE_MUTATING (Advances replay state by one bar). LIMITATIONS: Requires Replay mode to be active.',
    {},
    async () => {
      try { return jsonResult(await core.step()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'replay_autoplay',
    'Toggle automatic bar playback in replay mode with configurable speed. WHEN TO USE: Call when letting historical playback run continuously at set speed. SIDE EFFECTS: STATE_MUTATING (Starts or pauses replay autoplay). LIMITATIONS: Requires Replay mode to be active.',
    {
      speed: z.coerce.number().optional().describe('Autoplay delay in ms (lower = faster). Leave empty to just toggle. (default 0)'),
    },
    async ({ speed }) => {
      try { return jsonResult(await core.autoplay({ speed })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'replay_stop',
    'Exit Replay mode and restore the live real-time chart data feed. WHEN TO USE: Call when finishing simulation practice to return chart to current live market conditions. SIDE EFFECTS: STATE_MUTATING (Exits replay mode and jumps to live feed). LIMITATIONS: Closes any active replay session.',
    {},
    async () => {
      try { return jsonResult(await core.stop()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'replay_trade',
    'Execute a simulated trade action in replay mode (buy, sell, or close position). WHEN TO USE: Call when taking practice trades against historical bar replay data. SIDE EFFECTS: STATE_MUTATING (Updates simulated paper trading position in replay). LIMITATIONS: Requires Replay mode to be active.',
    {
      action: z.string().describe('Trade action: buy, sell, or close'),
    },
    async ({ action }) => {
      try { return jsonResult(await core.trade({ action })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'replay_status',
    'Get current status of Bar Replay mode (active, current replay timestamp, position). WHEN TO USE: Call to check whether chart is currently in replay mode and what timestamp is displaying. SIDE EFFECTS: None (Read-only). LIMITATIONS: None.',
    {},
    async () => {
      try { return jsonResult(await core.status()); }
      catch (err) { return errorResult(err); }
    }
  );
}
