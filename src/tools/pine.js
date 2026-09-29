import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/pine.js';

export function registerPineTools(server) {
  server.tool(
    'pine_get_source',
    'Get current Pine Script source code from the active TradingView Monaco editor model. WHEN TO USE: Call before refactoring, fixing errors, or saving an existing Pine script. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires Pine Editor bottom dock panel to be open.',
    {},
    async () => {
      try { return jsonResult(await core.getSource()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_set_source',
    'Inject Pine Script source code directly into the active Monaco editor model. WHEN TO USE: Call when deploying new Pine Script code, applying bug fixes, or loading templates. SIDE EFFECTS: STATE_MUTATING (Replaces entire Monaco editor text buffer). LIMITATIONS: Requires Pine Editor panel to be open.',
    {
      source: z.string().describe('Pine Script source code to inject'),
    },
    async ({ source }) => {
      try { return jsonResult(await core.setSource({ source })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_compile',
    'Trigger compilation ("Add to Chart" or "Save & Update") for the script currently in the Pine Editor. WHEN TO USE: Call after setting source code to apply the indicator or strategy to the chart canvas. SIDE EFFECTS: STATE_MUTATING (Attaches or updates study/strategy on chart canvas). LIMITATIONS: Pine Editor must be open with code loaded.',
    {},
    async () => {
      try { return jsonResult(await core.compile()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_get_errors',
    'Retrieve compiler error messages, line numbers, and syntax markers from Monaco editor model. WHEN TO USE: Call immediately after compilation if errors occur to pinpoint line numbers and syntax issues. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires Pine Editor to be open.',
    {},
    async () => {
      try { return jsonResult(await core.getErrors()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_save',
    'Save the current Pine Script to user library via keyboard shortcut (Ctrl+S / Cmd+S). WHEN TO USE: Call when persisting edits to a saved script in TradingView cloud storage. SIDE EFFECTS: STATE_MUTATING (Saves script changes to user account). LIMITATIONS: Requires Pine Editor to be active.',
    {},
    async () => {
      try { return jsonResult(await core.save()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_get_console',
    'Read runtime logs and compiler messages from the Pine Editor console window (e.g., log.info(), log.error(), log.warning()). WHEN TO USE: Call when debugging Pine Script runtime behavior or inspecting custom log outputs. SIDE EFFECTS: None (Read-only). LIMITATIONS: Console output must be enabled in the script.',
    {},
    async () => {
      try { return jsonResult(await core.getConsole()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_smart_compile',
    'Execute atomic developer compilation loop: detects appropriate compile button, triggers build, polls for Monaco markers, and reports compile status. WHEN TO USE: Preferred tool for compiling Pine Script code directly into the active chart. SIDE EFFECTS: STATE_MUTATING (Modifies chart study state). LIMITATIONS: Requires Pine Editor panel to be open.',
    {},
    async () => {
      try { return jsonResult(await core.smartCompile()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_new',
    'Create a new blank Pine Script draft in the editor from a standard template (indicator, strategy, or library). WHEN TO USE: Call when starting a new script from scratch rather than modifying existing code. SIDE EFFECTS: STATE_MUTATING (Clears current editor and loads starter template). LIMITATIONS: Unsaved changes in active editor will be overwritten.',
    {
      type: z.enum(['indicator', 'strategy', 'library']).describe('Type of script to create'),
    },
    async ({ type }) => {
      try { return jsonResult(await core.newScript({ type })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_open',
    'Open a saved Pine Script from user library by name. WHEN TO USE: Call to load a specific user script into the Pine Editor. SIDE EFFECTS: STATE_MUTATING (Loads chosen script into editor). LIMITATIONS: Script name must match a script in user library.',
    {
      name: z.string().describe('Name of the saved script to open (case-insensitive match)'),
    },
    async ({ name }) => {
      try { return jsonResult(await core.openScript({ name })); }
      catch (err) { return errorResult(err, { source: 'internal_api' }); }
    }
  );

  server.tool(
    'pine_list_scripts',
    'List all user-saved Pine Scripts in TradingView personal library. WHEN TO USE: Call to inspect available saved scripts before opening one with pine_open. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires user to be logged in to TradingView.',
    {},
    async () => {
      try { return jsonResult(await core.listScripts()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_analyze',
    'Run offline static analysis on Pine Script source code: detects array out-of-bounds, unguarded array.get/first/last, invalid loop ranges, lookahead bias, and deprecated syntax. WHEN TO USE: Call before compiling code to verify correctness without needing a live TradingView connection. SIDE EFFECTS: None (Read-only offline parser). LIMITATIONS: Static AST parsing only; does not execute runtime logic.',
    {
      source: z.string().describe('Pine Script source code to analyze'),
    },
    async ({ source }) => {
      try { return jsonResult(core.analyze({ source })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'pine_check',
    'Compile Pine Script via TradingView remote compiler API without touching the UI. Returns compilation errors and warnings. WHEN TO USE: Call for headless validation of Pine Script code before opening editor or chart. SIDE EFFECTS: EXTERNAL_SIDE_EFFECT (Sends code to TradingView cloud compiler endpoint). LIMITATIONS: Requires active internet connection to reach TradingView servers.',
    {
      source: z.string().describe('Pine Script source code to compile/validate'),
    },
    async ({ source }) => {
      try { return jsonResult(await core.check({ source })); }
      catch (err) { return errorResult(err); }
    }
  );
}
