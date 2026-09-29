#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerHealthTools } from '../src/tools/health.js';
import { registerChartTools } from '../src/tools/chart.js';
import { registerPineTools } from '../src/tools/pine.js';
import { registerDataTools } from '../src/tools/data.js';
import { registerCaptureTools } from '../src/tools/capture.js';
import { registerDrawingTools } from '../src/tools/drawing.js';
import { registerAlertTools } from '../src/tools/alerts.js';
import { registerBatchTools } from '../src/tools/batch.js';
import { registerReplayTools } from '../src/tools/replay.js';
import { registerIndicatorTools } from '../src/tools/indicators.js';
import { registerWatchlistTools } from '../src/tools/watchlist.js';
import { registerUiTools } from '../src/tools/ui.js';
import { registerPaneTools } from '../src/tools/pane.js';
import { registerTabTools } from '../src/tools/tab.js';
import { registerMorningTools } from '../src/tools/morning.js';
import { registerAnalysisTools } from '../src/tools/analysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');
const catalogPath = path.join(docsDir, 'tool-catalog.json');

const server = new McpServer({ name: 'catalog-generator', version: '1.0.0' });

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

const toolCategories = {
  // Market Intelligence (6)
  market_get_context: 'market_intelligence',
  market_detect_structure: 'market_intelligence',
  market_detect_zones: 'market_intelligence',
  market_compare_timeframes: 'market_intelligence',
  market_get_recent_changes: 'market_intelligence',
  chart_get_state_diagnostics: 'market_intelligence',

  // Chart Navigation & Resolution (12)
  chart_get_state: 'chart_navigation',
  chart_set_symbol: 'chart_navigation',
  chart_set_timeframe: 'chart_navigation',
  chart_set_type: 'chart_navigation',
  chart_manage_indicator: 'chart_navigation',
  chart_get_visible_range: 'chart_navigation',
  chart_set_visible_range: 'chart_navigation',
  chart_scroll_to_date: 'chart_navigation',
  symbol_info: 'chart_navigation',
  symbol_search: 'chart_navigation',
  chart_get_snapshot: 'chart_navigation',
  chart_get_multi_timeframe: 'chart_navigation',

  // Market & Study Data Retrieval (12)
  data_get_ohlcv: 'market_data',
  data_get_indicator: 'market_data',
  data_get_strategy_results: 'market_data',
  data_get_trades: 'market_data',
  data_get_equity: 'market_data',
  quote_get: 'market_data',
  depth_get: 'market_data',
  data_get_pine_lines: 'market_data',
  data_get_pine_labels: 'market_data',
  data_get_pine_tables: 'market_data',
  data_get_pine_boxes: 'market_data',
  data_get_study_values: 'market_data',

  // Pine Script Development & Compilation (12)
  pine_get_source: 'pine_script',
  pine_set_source: 'pine_script',
  pine_compile: 'pine_script',
  pine_get_errors: 'pine_script',
  pine_save: 'pine_script',
  pine_get_console: 'pine_script',
  pine_smart_compile: 'pine_script',
  pine_new: 'pine_script',
  pine_open: 'pine_script',
  pine_list_scripts: 'pine_script',
  pine_analyze: 'pine_script',
  pine_check: 'pine_script',

  // Drawing & Visual Annotations (5)
  draw_shape: 'drawing',
  draw_list: 'drawing',
  draw_clear: 'drawing',
  draw_remove_one: 'drawing',
  draw_get_properties: 'drawing',

  // UI Automation (12)
  ui_click: 'ui_automation',
  ui_open_panel: 'ui_automation',
  ui_fullscreen: 'ui_automation',
  layout_list: 'ui_automation',
  layout_switch: 'ui_automation',
  ui_keyboard: 'ui_automation',
  ui_type_text: 'ui_automation',
  ui_hover: 'ui_automation',
  ui_scroll: 'ui_automation',
  ui_mouse_click: 'ui_automation',
  ui_find_element: 'ui_automation',
  ui_evaluate: 'ui_automation',

  // Pane & Tab Management (8)
  pane_list: 'pane_tab_management',
  pane_set_layout: 'pane_tab_management',
  pane_focus: 'pane_tab_management',
  pane_set_symbol: 'pane_tab_management',
  tab_list: 'pane_tab_management',
  tab_new: 'pane_tab_management',
  tab_close: 'pane_tab_management',
  tab_switch: 'pane_tab_management',

  // Alerts & Watchlist (5)
  alert_create: 'alerts_watchlist',
  alert_list: 'alerts_watchlist',
  alert_delete: 'alerts_watchlist',
  watchlist_get: 'alerts_watchlist',
  watchlist_add: 'alerts_watchlist',

  // Replay & Simulation (6)
  replay_start: 'replay_simulation',
  replay_step: 'replay_simulation',
  replay_autoplay: 'replay_simulation',
  replay_stop: 'replay_simulation',
  replay_trade: 'replay_simulation',
  replay_status: 'replay_simulation',

  // System, Diagnostics & Session (11)
  tv_health_check: 'system_session_diagnostics',
  tv_discover: 'system_session_diagnostics',
  tv_ui_state: 'system_session_diagnostics',
  tv_launch: 'system_session_diagnostics',
  batch_run: 'system_session_diagnostics',
  capture_screenshot: 'system_session_diagnostics',
  indicator_set_inputs: 'system_session_diagnostics',
  indicator_toggle_visibility: 'system_session_diagnostics',
  morning_brief: 'system_session_diagnostics',
  session_save: 'system_session_diagnostics',
  session_get: 'system_session_diagnostics',
};

const toolSideEffects = {
  // READ
  tv_health_check: 'READ',
  tv_discover: 'READ',
  tv_ui_state: 'READ',
  chart_get_state: 'READ',
  chart_get_visible_range: 'READ',
  symbol_info: 'READ',
  symbol_search: 'READ',
  chart_get_snapshot: 'READ',
  chart_get_multi_timeframe: 'READ',
  data_get_ohlcv: 'READ',
  data_get_indicator: 'READ',
  data_get_strategy_results: 'READ',
  data_get_trades: 'READ',
  data_get_equity: 'READ',
  quote_get: 'READ',
  depth_get: 'READ',
  data_get_pine_lines: 'READ',
  data_get_pine_labels: 'READ',
  data_get_pine_tables: 'READ',
  data_get_pine_boxes: 'READ',
  data_get_study_values: 'READ',
  pine_get_source: 'READ',
  pine_get_errors: 'READ',
  pine_get_console: 'READ',
  pine_list_scripts: 'READ',
  pine_analyze: 'READ',
  draw_list: 'READ',
  draw_get_properties: 'READ',
  layout_list: 'READ',
  ui_find_element: 'READ',
  pane_list: 'READ',
  tab_list: 'READ',
  alert_list: 'READ',
  watchlist_get: 'READ',
  replay_status: 'READ',
  morning_brief: 'READ',
  session_get: 'READ',
  chart_get_state_diagnostics: 'READ',
  market_get_context: 'READ',
  market_detect_structure: 'READ',
  market_detect_zones: 'READ',
  market_compare_timeframes: 'READ',
  market_get_recent_changes: 'READ',

  // EXTERNAL_SIDE_EFFECT
  tv_launch: 'EXTERNAL_SIDE_EFFECT',
  pine_check: 'EXTERNAL_SIDE_EFFECT',
  capture_screenshot: 'EXTERNAL_SIDE_EFFECT',
  session_save: 'EXTERNAL_SIDE_EFFECT',

  // STATE_MUTATING (all others)
  chart_set_symbol: 'STATE_MUTATING',
  chart_set_timeframe: 'STATE_MUTATING',
  chart_set_type: 'STATE_MUTATING',
  chart_manage_indicator: 'STATE_MUTATING',
  chart_set_visible_range: 'STATE_MUTATING',
  chart_scroll_to_date: 'STATE_MUTATING',
  pine_set_source: 'STATE_MUTATING',
  pine_compile: 'STATE_MUTATING',
  pine_save: 'STATE_MUTATING',
  pine_smart_compile: 'STATE_MUTATING',
  pine_new: 'STATE_MUTATING',
  pine_open: 'STATE_MUTATING',
  draw_shape: 'STATE_MUTATING',
  draw_clear: 'STATE_MUTATING',
  draw_remove_one: 'STATE_MUTATING',
  alert_create: 'STATE_MUTATING',
  alert_delete: 'STATE_MUTATING',
  batch_run: 'STATE_MUTATING',
  replay_start: 'STATE_MUTATING',
  replay_step: 'STATE_MUTATING',
  replay_autoplay: 'STATE_MUTATING',
  replay_stop: 'STATE_MUTATING',
  replay_trade: 'STATE_MUTATING',
  indicator_set_inputs: 'STATE_MUTATING',
  indicator_toggle_visibility: 'STATE_MUTATING',
  watchlist_add: 'STATE_MUTATING',
  ui_click: 'STATE_MUTATING',
  ui_open_panel: 'STATE_MUTATING',
  ui_fullscreen: 'STATE_MUTATING',
  layout_switch: 'STATE_MUTATING',
  ui_keyboard: 'STATE_MUTATING',
  ui_type_text: 'STATE_MUTATING',
  ui_hover: 'STATE_MUTATING',
  ui_scroll: 'STATE_MUTATING',
  ui_mouse_click: 'STATE_MUTATING',
  ui_evaluate: 'STATE_MUTATING',
  pane_set_layout: 'STATE_MUTATING',
  pane_focus: 'STATE_MUTATING',
  pane_set_symbol: 'STATE_MUTATING',
  tab_new: 'STATE_MUTATING',
  tab_close: 'STATE_MUTATING',
  tab_switch: 'STATE_MUTATING',
};

function parseDescriptionSections(desc) {
  let purpose = desc;
  let whenToUse = '';
  let sideEffects = '';
  let limitations = '';

  const whenIdx = desc.indexOf('WHEN TO USE:');
  const sideIdx = desc.indexOf('SIDE EFFECTS:');
  const noSideIdx = desc.indexOf('NO SIDE EFFECTS');
  const limIdx = desc.indexOf('LIMITATIONS:');

  if (whenIdx !== -1) {
    purpose = desc.slice(0, whenIdx).trim();
    let nextIdx = desc.length;
    if (sideIdx !== -1 && sideIdx > whenIdx && sideIdx < nextIdx) nextIdx = sideIdx;
    if (noSideIdx !== -1 && noSideIdx > whenIdx && noSideIdx < nextIdx) nextIdx = noSideIdx;
    if (limIdx !== -1 && limIdx > whenIdx && limIdx < nextIdx) nextIdx = limIdx;
    whenToUse = desc.slice(whenIdx + 'WHEN TO USE:'.length, nextIdx).trim().replace(/\.$/, '');
  }

  if (sideIdx !== -1) {
    let nextIdx = desc.length;
    if (limIdx !== -1 && limIdx > sideIdx) nextIdx = limIdx;
    sideEffects = desc.slice(sideIdx + 'SIDE EFFECTS:'.length, nextIdx).trim().replace(/\.$/, '');
  } else if (noSideIdx !== -1) {
    sideEffects = 'None (Read-only)';
  }

  if (limIdx !== -1) {
    limitations = desc.slice(limIdx + 'LIMITATIONS:'.length).trim().replace(/\.$/, '');
  }

  return { purpose, whenToUse, sideEffects, limitations };
}

const registeredTools = server._registeredTools;
const toolNames = Object.keys(registeredTools).sort();

const catalog = {
  version: '2.1.0',
  generatedAt: new Date().toISOString(),
  toolCount: toolNames.length,
  categories: {
    market_intelligence: 'Deterministic quantitative market structure, regimes, zones, and MTF alignment',
    chart_navigation: 'Chart symbol, resolution, range, zoom, and multi-timeframe navigation',
    market_data: 'Direct in-memory OHLCV bars, indicators, strategy metrics, DOM, and Pine primitives',
    pine_script: 'Monaco editor manipulation, compilation, marker diagnostics, and static analysis',
    drawing: 'Visual geometric drawing primitives, coordinates, styling, and annotations',
    ui_automation: 'DOM interactions, dock panel toggles, layout switching, and input simulation',
    pane_tab_management: 'Multi-chart split view grid layouts and desktop window tab orchestration',
    alerts_watchlist: 'Cloud price alert triggers, deletion, and active watchlist management',
    replay_simulation: 'Historical bar replay, forward step-through, and simulated execution',
    system_session_diagnostics: 'Connection liveness, UI diagnostics, screenshots, briefs, and desktop launch',
  },
  tools: [],
};

for (const name of toolNames) {
  const t = registeredTools[name];
  const cat = toolCategories[name] || 'uncategorized';
  const readWrite = toolSideEffects[name] || 'STATE_MUTATING';
  const parsedDesc = parseDescriptionSections(t.description || '');

  // Extract zod shape parameters if available
  const schemaProps = {};
  const required = [];
  const rawShape = t.inputSchema?.shape || t.inputSchema?.def?.shape || {};
  for (const [pName, pDef] of Object.entries(rawShape)) {
    schemaProps[pName] = {
      type: pDef?.def?.typeName || typeof pDef,
      description: pDef?.description || '',
    };
    if (!pDef?.isOptional?.()) {
      required.push(pName);
    }
  }

  catalog.tools.push({
    name,
    category: cat,
    readWrite,
    description: t.description || '',
    purpose: parsedDesc.purpose,
    whenToUse: parsedDesc.whenToUse || 'Call when performing ' + name.replace(/_/g, ' ') + '.',
    sideEffects: parsedDesc.sideEffects || (readWrite === 'READ' ? 'None (Read-only)' : readWrite),
    limitations: parsedDesc.limitations || 'Requires active TradingView Desktop session.',
    inputSchema: {
      type: 'object',
      properties: schemaProps,
      required,
    },
  });
}

if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`✓ Successfully generated ${catalogPath} with ${catalog.tools.length} classified tools across ${Object.keys(catalog.categories).length} categories.`);
