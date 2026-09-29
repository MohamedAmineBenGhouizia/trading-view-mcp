import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/data.js';

export function registerDataTools(server) {
  server.tool(
    'data_get_ohlcv',
    'Get historical OHLCV bar data from active chart. Supports compact statistical summary mode (summary: true) for context efficiency, and closed-only filtering (closedOnly: true) to avoid unconfirmed candle hallucinations. WHEN TO USE: Call when computing quantitative models or inspecting raw price action. Use summary: true when only high/low/close bounds are needed to conserve token context. SIDE EFFECTS: None (Read-only). LIMITATIONS: Maximum 500 bars per request.',
    {
      count: z.coerce.number().optional().describe('Number of bars to retrieve (max 500, default 100)'),
      summary: z.coerce.boolean().optional().describe('Return summary stats (high, low, open, close, avg volume, range) instead of all bars — much smaller output'),
      closedOnly: z.coerce.boolean().optional().describe('Exclude the active, currently-forming candle so only confirmed historical bars are returned'),
      expectedSymbol: z.string().optional().describe('Assert that the returned data matches this symbol, throwing an error if chart has not switched'),
      expectedTf: z.string().optional().describe('Assert that the returned data matches this timeframe, throwing an error if chart has not switched'),
    },
    async ({ count, summary, closedOnly, expectedSymbol, expectedTf }) => {
      try { return jsonResult(await core.getOhlcv({ count, summary, closedOnly, expectedSymbol, expectedTf })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'data_get_indicator',
    'Get internal study parameters, input values, and configuration of a specific indicator entity by ID. WHEN TO USE: Call to inspect active parameters (e.g., RSI length or MA source) for an indicator found in chart_get_state. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires valid entity ID.',
    {
      entity_id: z.string().describe('Study entity ID (from chart_get_state)'),
    },
    async ({ entity_id }) => {
      try { return jsonResult(await core.getIndicator({ entity_id })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'data_get_strategy_results',
    'Extract performance metrics from the TradingView Strategy Tester panel (Net Profit, Profit Factor, Win Rate, Max Drawdown, Total Trades, Sharpe Ratio). WHEN TO USE: Call after compiling a Pine Script strategy to evaluate quantitative backtest results. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires a strategy script to be actively running on the chart with Strategy Tester panel populated.',
    {},
    async () => {
      try { return jsonResult(await core.getStrategyResults()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'data_get_trades',
    'Extract individual trade execution log from Strategy Tester (entry/exit times, prices, contracts, P&L). WHEN TO USE: Call when conducting granular trade-by-trade review or streak analysis of a backtested Pine strategy. SIDE EFFECTS: None (Read-only). LIMITATIONS: Strategy Tester bottom panel must have trade list populated.',
    {
      max_trades: z.coerce.number().optional().describe('Maximum trades to return'),
    },
    async ({ max_trades }) => {
      try { return jsonResult(await core.getTrades({ max_trades })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'data_get_equity',
    'Extract equity curve data points from Strategy Tester. WHEN TO USE: Call when analyzing equity drawdowns, run-ups, or plotting performance trajectory over backtest span. SIDE EFFECTS: None (Read-only). LIMITATIONS: Strategy Tester must be active on chart.',
    {},
    async () => {
      try { return jsonResult(await core.getEquity()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'quote_get',
    'Get real-time market quote snapshot for a ticker (last price, day open/high/low/close, change %, volume). WHEN TO USE: Call for quick price checks without loading historical bar series. SIDE EFFECTS: None (Read-only). LIMITATIONS: Uses current chart ticker if symbol omitted.',
    {
      symbol: z.string().optional().describe('Symbol to quote (blank = current chart symbol)'),
    },
    async ({ symbol }) => {
      try { return jsonResult(await core.getQuote({ symbol })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'depth_get',
    'Extract order book / Depth of Market (DOM) bid/ask levels from the DOM panel. WHEN TO USE: Call when analyzing order book liquidity or bid-ask imbalance. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires DOM panel to be open in TradingView.',
    {},
    async () => {
      try { return jsonResult(await core.getDepth()); }
      catch (err) { return errorResult(err, { hint: 'Open the DOM panel in TradingView before using this tool.' }); }
    }
  );

  server.tool(
    'data_get_pine_lines',
    'Read horizontal price levels drawn programmatically by Pine Script indicators (line.new). Returns deduplicated, sorted price levels per study. WHEN TO USE: Call when an indicator draws support/resistance or session levels via line.new. Use study_filter to target specific scripts. SIDE EFFECTS: None (Read-only). LIMITATIONS: Only reads lines drawn by active Pine studies.',
    {
      study_filter: z.string().optional().describe('Substring to match study name (e.g., "Profiler", "NY Levels"). Omit for all.'),
      verbose: z.coerce.boolean().optional().describe('Return raw line data with IDs, coordinates, colors (default false — returns only unique price levels)'),
    },
    async ({ study_filter, verbose }) => {
      try { return jsonResult(await core.getPineLines({ study_filter, verbose })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'data_get_pine_labels',
    'Read text annotations and labels drawn by Pine Script indicators (label.new) paired with price coordinates. WHEN TO USE: Call when an indicator displays bias markers, order block tags, or targets via label.new. SIDE EFFECTS: None (Read-only). LIMITATIONS: Only reads labels currently existing in chart memory.',
    {
      study_filter: z.string().optional().describe('Substring to match study name. Omit for all.'),
      max_labels: z.coerce.number().optional().describe('Max labels per study (default 50). Set higher if you need all.'),
      verbose: z.coerce.boolean().optional().describe('Return raw label data with IDs, colors, positions (default false — returns only text + price)'),
    },
    async ({ study_filter, max_labels, verbose }) => {
      try { return jsonResult(await core.getPineLabels({ study_filter, max_labels, verbose })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'data_get_pine_tables',
    'Read table matrices drawn by Pine Script indicators (table.new) as structured rows of text. WHEN TO USE: Call when an indicator outputs dashboard summaries, session statistics, or multi-timeframe matrices in a table. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires study drawing table.new to be attached.',
    {
      study_filter: z.string().optional().describe('Substring to match study name. Omit for all.'),
    },
    async ({ study_filter }) => {
      try { return jsonResult(await core.getPineTables({ study_filter })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'data_get_pine_boxes',
    'Read bounding boxes and zones drawn by Pine Script indicators (box.new) as deduplicated {high, low} price ranges. WHEN TO USE: Call when an indicator plots order blocks, fair value gaps, or consolidation boxes via box.new. SIDE EFFECTS: None (Read-only). LIMITATIONS: Only reads box primitives generated by active studies.',
    {
      study_filter: z.string().optional().describe('Substring to match study name. Omit for all.'),
      verbose: z.coerce.boolean().optional().describe('Return all boxes with IDs and coordinates (default false — returns unique price zones)'),
    },
    async ({ study_filter, verbose }) => {
      try { return jsonResult(await core.getPineBoxes({ study_filter, verbose })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'data_get_study_values',
    'Extract real-time numerical values of all visible indicators from the chart Data Window (RSI, MACD, EMAs, custom plot() outputs). WHEN TO USE: Call when reading current indicator values directly from TradingView without recomputing in Node.js. SIDE EFFECTS: None (Read-only). LIMITATIONS: Indicators must be visible on chart.',
    {},
    async () => {
      try { return jsonResult(await core.getStudyValues()); }
      catch (err) { return errorResult(err); }
    }
  );
}
