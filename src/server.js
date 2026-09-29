import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerHealthTools } from "./tools/health.js";
import { registerChartTools } from "./tools/chart.js";
import { registerPineTools } from "./tools/pine.js";
import { registerDataTools } from "./tools/data.js";
import { registerCaptureTools } from "./tools/capture.js";
import { registerDrawingTools } from "./tools/drawing.js";
import { registerAlertTools } from "./tools/alerts.js";
import { registerBatchTools } from "./tools/batch.js";
import { registerReplayTools } from "./tools/replay.js";
import { registerIndicatorTools } from "./tools/indicators.js";
import { registerWatchlistTools } from "./tools/watchlist.js";
import { registerUiTools } from "./tools/ui.js";
import { registerPaneTools } from "./tools/pane.js";
import { registerTabTools } from "./tools/tab.js";
import { registerMorningTools } from "./tools/morning.js";
import { registerAnalysisTools } from "./tools/analysis.js";

const server = new McpServer(
  {
    name: "tradingview",
    version: "2.1.0",
    description:
      "Enterprise-grade AI TradingView MCP server featuring deterministic market structure, regime detection, MTF analysis, and robust CDP session synchronization",
  },
  {
    instructions: `TradingView MCP — Enterprise tools for reading, analyzing, and controlling a live TradingView Desktop chart.

TOOL SELECTION GUIDE — use this to pick the right tool:

Objective Market Analysis & High-Level Context (RECOMMENDED FOR ANALYSIS):
- market_get_context → ONE-STOP tool for market trend, regime (TRENDING/RANGING/BREAKOUT), RSI/MACD/EMA/ATR/ADX, volume, structure, and zones
- market_detect_structure → Swings, Higher Highs/Lows (HH/HL/LH/LL), Break of Structure (BOS), and Change of Character (CHoCH)
- market_detect_zones → Horizontal support, resistance, and consolidation zones with touch counts
- market_compare_timeframes → Multi-timeframe trend, momentum, and volume alignment across 1D/4H/1H/15m/5m
- market_get_recent_changes → Token-efficient delta polling: new swings, BOS events, and volume anomalies since last turn
- chart_get_state_diagnostics → Authoritative connection health, generation ID, queue depths, and chart readiness

Reading your chart:
- chart_get_state → get symbol, timeframe, all indicator names + entity IDs
- data_get_study_values → get current numeric values from ALL visible indicators (RSI, MACD, BB, EMA, etc.)
- quote_get → get real-time price snapshot (last, OHLC, volume)
- data_get_ohlcv → get price bars with closed vs live bar separation, provenance, and data quality metrics

Reading custom Pine indicator output (line.new/label.new/table.new/box.new drawings):
- data_get_pine_lines → horizontal price levels from custom indicators (deduplicated, sorted)
- data_get_pine_labels → text annotations with prices ("PDH 24550", "Bias Long", etc.)
- data_get_pine_tables → table data as formatted rows (session stats, analytics dashboards)
- data_get_pine_boxes → price zones as {high, low} pairs
- ALWAYS pass study_filter to target a specific indicator by name (e.g., study_filter="Profiler")

Changing the chart:
- chart_set_symbol, chart_set_timeframe, chart_set_type → change ticker/resolution/style
- chart_manage_indicator → add/remove studies. USE FULL NAMES: "Relative Strength Index" not "RSI"
- chart_scroll_to_date → jump to a date (ISO format)
- indicator_set_inputs → change indicator settings (length, source, etc.)

Pine Script development:
- pine_set_source → inject code, pine_smart_compile → compile + check errors
- pine_get_errors → read errors, pine_get_console → read log output

Screenshots: capture_screenshot → regions: "full", "chart", "strategy_tester"
Replay: replay_start → replay_step → replay_trade → replay_status → replay_stop
Batch: batch_run → run action across multiple symbols/timeframes
Drawing: draw_shape → horizontal_line, trend_line, rectangle, text
Alerts: alert_create, alert_list, alert_delete
Launch: tv_launch → auto-detect and start TradingView with CDP on any platform
Panes: pane_list, pane_set_layout, pane_focus, pane_set_symbol
Tabs: tab_list, tab_new, tab_close, tab_switch`,
  },
);

// Register all tool groups
registerHealthTools(server);
registerChartTools(server);
registerPineTools(server);
registerDataTools(server);
registerCaptureTools(server);
registerDrawingTools(server);
registerAlertTools(server);
registerBatchTools(server);
registerReplayTools(server);
registerIndicatorTools(server);
registerWatchlistTools(server);
registerUiTools(server);
registerPaneTools(server);
registerTabTools(server);
registerMorningTools(server);
registerAnalysisTools(server);

// Startup notice (stderr so it doesn't interfere with MCP stdio protocol)
process.stderr.write(
  "⚠  tradingview-mcp  |  Unofficial tool. Not affiliated with TradingView Inc. or Anthropic.\n",
);
process.stderr.write(
  "   Ensure your usage complies with TradingView's Terms of Use.\n\n",
);

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
