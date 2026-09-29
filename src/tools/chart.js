import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/chart.js';

export function registerChartTools(server) {
  server.tool(
    'chart_get_state',
    'Get current chart state including active symbol, timeframe resolution, chart rendering type, and list of attached indicator study entities with their IDs. WHEN TO USE: Call to inspect the current chart configuration or retrieve indicator entity IDs prior to calling chart_manage_indicator or indicator_set_inputs. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires an active chart window.',
    {},
    async () => {
      try { return jsonResult(await core.getState()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_set_symbol',
    'Change the active chart symbol and wait for market data feed confirmation. WHEN TO USE: Call to navigate the chart to a new financial instrument before performing analysis or running strategies. SIDE EFFECTS: STATE_MUTATING (Alters active chart ticker, increments state generation, invalidates generational cache). LIMITATIONS: Requires valid TradingView ticker format (e.g., "BTCUSD", "AAPL", "ES1!", "NYMEX:CL1!").',
    {
      symbol: z.string().describe('Symbol to set (e.g., BTCUSD, AAPL, ES1!, NYMEX:CL1!)'),
    },
    async ({ symbol }) => {
      try { return jsonResult(await core.setSymbol({ symbol })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_set_timeframe',
    'Change the chart timeframe/resolution and reactively wait for candle feed resolution. WHEN TO USE: Call when switching resolutions for multi-timeframe analysis (e.g., switching from 1D to 15m). SIDE EFFECTS: STATE_MUTATING (Alters chart resolution, increments state generation, invalidates generational cache). LIMITATIONS: Supported formats include standard minutes ("1", "5", "15", "60", "240") and calendar periods ("D", "W", "M").',
    {
      timeframe: z.string().describe('Timeframe (e.g., 1, 5, 15, 60, D, W, M)'),
    },
    async ({ timeframe }) => {
      try { return jsonResult(await core.setTimeframe({ timeframe })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_set_type',
    'Change chart candle rendering type (Bars, Candles, Line, Area, Renko, HeikinAshi, etc.). WHEN TO USE: Call when specific analysis requires alternate bar representations (e.g., Heikin Ashi for trend smoothing). SIDE EFFECTS: STATE_MUTATING (Modifies chart canvas display mode). LIMITATIONS: Accepts chart type name or numeric index.',
    {
      chart_type: z.string().describe('Chart type: Bars(0), Candles(1), Line(2), Area(3), Renko(4), Kagi(5), PointAndFigure(6), LineBreak(7), HeikinAshi(8), HollowCandles(9) — pass name or number'),
    },
    async ({ chart_type }) => {
      try { return jsonResult(await core.setType({ chart_type })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_manage_indicator',
    'Add or remove a built-in or public indicator/study on the active chart. WHEN TO USE: Call to attach technical studies (e.g., "Relative Strength Index", "Bollinger Bands") or remove studies using their entity_id from chart_get_state. SIDE EFFECTS: STATE_MUTATING (Modifies chart study collection). LIMITATIONS: Must use full official TradingView indicator names (e.g., "Relative Strength Index", not "RSI").',
    {
      action: z.enum(['add', 'remove']).describe('Action: add or remove'),
      indicator: z.string().describe('Full indicator name: "Relative Strength Index", "MACD", "Volume", "Moving Average", "Bollinger Bands", "Moving Average Exponential". Short names like RSI/EMA do NOT work.'),
      entity_id: z.string().optional().describe('Entity ID to remove (from chart_get_state). Required for remove.'),
      inputs: z.string().optional().describe('JSON string of input overrides for the indicator (e.g., \'{"length": 20}\')'),
    },
    async ({ action, indicator, entity_id, inputs }) => {
      try { return jsonResult(await core.manageIndicator({ action, indicator, entity_id, inputs })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_get_visible_range',
    'Get visible date range (unix timestamps in seconds) and bar index boundaries currently displayed on the viewport. WHEN TO USE: Call before capturing screenshots or inspecting what portion of the historical timeline is in user view. SIDE EFFECTS: None (Read-only). LIMITATIONS: Depends on active screen width and zoom level.',
    {},
    async () => {
      try { return jsonResult(await core.getVisibleRange()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_set_visible_range',
    'Zoom and pan the chart canvas to display a specific date range between two unix timestamps. WHEN TO USE: Call when focusing chart context on a specific historical event or earnings release. SIDE EFFECTS: STATE_MUTATING (Alters chart viewport zoom/pan). LIMITATIONS: Timestamps must be unix seconds within historical data range.',
    {
      from: z.coerce.number().describe('Start of range (unix timestamp in seconds)'),
      to: z.coerce.number().describe('End of range (unix timestamp in seconds)'),
    },
    async ({ from, to }) => {
      try { return jsonResult(await core.setVisibleRange({ from, to })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_scroll_to_date',
    'Jump the chart viewport to center on a specific historical calendar date or timestamp. WHEN TO USE: Call to navigate directly to a past macroeconomic release, news event, or breakout bar. SIDE EFFECTS: STATE_MUTATING (Scrolls chart canvas). LIMITATIONS: Historical data for the specified date must be available.',
    {
      date: z.string().describe('ISO date string (e.g., "2024-01-15") or unix timestamp as a string'),
    },
    async ({ date }) => {
      try { return jsonResult(await core.scrollToDate({ date })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'symbol_info',
    'Get comprehensive instrument metadata for the active symbol (ticker name, exchange, instrument type, tick size, currency, market hours). WHEN TO USE: Call when determining tick precision, pip calculation rules, or exchange session times. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires an active instrument loaded on chart.',
    {},
    async () => {
      try { return jsonResult(await core.symbolInfo()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'symbol_search',
    'Search TradingView database for symbols, exchanges, and financial instruments matching a keyword query. WHEN TO USE: Call to resolve ambiguous ticker names or locate the exact exchange ticker (e.g. searching "crude oil" or "ES"). SIDE EFFECTS: None (Read-only). LIMITATIONS: Relies on TradingView symbol search backend.',
    {
      query: z.string().describe('Search query (e.g., "AAPL", "crude oil", "ES")'),
      type: z.string().optional().describe('Filter by type (e.g., "stock", "futures", "crypto", "forex")'),
    },
    async ({ query, type }) => {
      try { return jsonResult(await core.symbolSearch({ query, type })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_get_snapshot',
    'Get authoritative atomic snapshot of chart state (symbol, resolution, lastBarTime, barCount, generation ID). WHEN TO USE: Call to verify state freshness or obtain atomic synchronization metadata without pulling full bar series. SIDE EFFECTS: None (Read-only). LIMITATIONS: Lightweight snapshot only.',
    {},
    async () => {
      try { return jsonResult(await core.getChartSnapshot()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'chart_get_multi_timeframe',
    'Perform atomic sequential multi-timeframe scan across multiple resolutions (e.g., D, 240, 60, 15, 5) without race conditions. WHEN TO USE: Call when needing raw OHLCV bars across several timeframes in a single coordinated operation. SIDE EFFECTS: None (Read-only - safely preserves original chart state). LIMITATIONS: Changes resolution sequentially, restoring original state upon completion.',
    {
      symbol: z.string().optional().describe('Symbol to scan (defaults to current chart symbol)'),
      timeframes: z.array(z.string()).optional().describe('Array of timeframes to scan (default: ["D", "240", "60", "15", "5"])'),
      count: z.coerce.number().optional().describe('Number of bars per timeframe (default 100)'),
    },
    async ({ symbol, timeframes, count }) => {
      try { return jsonResult(await core.getMultiTimeframeData({ symbol, timeframes, count })); }
      catch (err) { return errorResult(err); }
    }
  );
}
