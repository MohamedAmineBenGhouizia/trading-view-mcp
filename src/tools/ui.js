import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/ui.js';

export function registerUiTools(server) {
  server.tool(
    'ui_click',
    'Click a TradingView DOM element matching selector strategy (aria-label, data-name, text, class-contains). WHEN TO USE: Call when interacting with custom buttons, dropdowns, or navigation elements not covered by high-level tools. SIDE EFFECTS: STATE_MUTATING (Dispatches click event to DOM element). LIMITATIONS: Target element must be present in DOM.',
    {
      by: z.enum(['aria-label', 'data-name', 'text', 'class-contains']).describe('Selector strategy'),
      value: z.string().describe('Value to match against the chosen selector strategy'),
    },
    async ({ by, value }) => {
      try { return jsonResult(await core.click({ by, value })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_open_panel',
    'Open, close, or toggle bottom dock panels in TradingView window (pine-editor, strategy-tester, watchlist, alerts, trading). WHEN TO USE: Call before interacting with Pine Editor or Strategy Tester to ensure panel visibility. SIDE EFFECTS: STATE_MUTATING (Alters bottom panel visibility state). LIMITATIONS: Supported panels: pine-editor, strategy-tester, watchlist, alerts, trading.',
    {
      panel: z.enum(['pine-editor', 'strategy-tester', 'watchlist', 'alerts', 'trading']).describe('Panel name'),
      action: z.enum(['open', 'close', 'toggle']).describe('Action to perform'),
    },
    async ({ panel, action }) => {
      try { return jsonResult(await core.openPanel({ panel, action })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_fullscreen',
    'Toggle TradingView window chart fullscreen mode. WHEN TO USE: Call when expanding chart canvas for clean screenshot captures or presentation view. SIDE EFFECTS: STATE_MUTATING (Toggles fullscreen mode). LIMITATIONS: None.',
    {},
    async () => {
      try { return jsonResult(await core.fullscreen()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'layout_list',
    'List all saved chart layouts in user profile with layout names and IDs. WHEN TO USE: Call before switching layouts to discover valid layout names. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires user profile to have saved layouts.',
    {},
    async () => {
      try { return jsonResult(await core.layoutList()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'layout_switch',
    'Switch active chart workspace to another saved layout by name or ID. WHEN TO USE: Call when transitioning between specialized analytical layouts (e.g. crypto vs macro). SIDE EFFECTS: STATE_MUTATING (Loads different layout, reloads charts and indicators). LIMITATIONS: Layout name or ID must exist in user account.',
    {
      name: z.string().describe('Name or ID of the layout to switch to'),
    },
    async ({ name }) => {
      try { return jsonResult(await core.layoutSwitch({ name })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_keyboard',
    'Dispatch native keyboard key press or key combination (e.g., Enter, Escape, Alt+S, Ctrl+Z) via CDP Input domain. WHEN TO USE: Call when triggering application keyboard shortcuts or dismissing modals. SIDE EFFECTS: STATE_MUTATING (Dispatches keystroke events to focused window element). LIMITATIONS: Requires appropriate window focus.',
    {
      key: z.string().describe('Key to press (e.g., "Enter", "Escape", "Tab", "a", "ArrowUp")'),
      modifiers: z.array(z.enum(['ctrl', 'alt', 'shift', 'meta'])).optional().describe('Modifier keys to hold (e.g., ["ctrl", "shift"])'),
    },
    async ({ key, modifiers }) => {
      try { return jsonResult(await core.keyboard({ key, modifiers })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_type_text',
    'Type text characters directly into currently focused input or textarea element via CDP Input domain. WHEN TO USE: Call when filling out search fields, alert parameters, or text inputs. SIDE EFFECTS: STATE_MUTATING (Inserts text into focused DOM field). LIMITATIONS: Target element must be actively focused.',
    {
      text: z.string().describe('Text to type into the focused element'),
    },
    async ({ text }) => {
      try { return jsonResult(await core.typeText({ text })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_hover',
    'Dispatch mouse move event to hover over a UI element matching selector strategy. WHEN TO USE: Call to trigger tooltips, dropdown menus, or interactive hover states. SIDE EFFECTS: STATE_MUTATING (Dispatches mouse move events). LIMITATIONS: Element must be rendered in DOM.',
    {
      by: z.enum(['aria-label', 'data-name', 'text', 'class-contains']).describe('Selector strategy'),
      value: z.string().describe('Value to match'),
    },
    async ({ by, value }) => {
      try { return jsonResult(await core.hover({ by, value })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_scroll',
    'Dispatch mouse wheel scroll events across chart canvas or page in specified direction. WHEN TO USE: Call when scrolling through long lists, logs, or panning canvas. SIDE EFFECTS: STATE_MUTATING (Dispatches wheel events). LIMITATIONS: Default amount is 300px.',
    {
      direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction'),
      amount: z.coerce.number().optional().describe('Scroll amount in pixels (default 300)'),
    },
    async ({ direction, amount }) => {
      try { return jsonResult(await core.scroll({ direction, amount })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_mouse_click',
    'Dispatch mouse click event at exact pixel coordinates (x, y) on the window canvas. WHEN TO USE: Call when clicking a non-DOM canvas target or specific pixel coordinate. SIDE EFFECTS: STATE_MUTATING (Dispatches mouse click at coordinate). LIMITATIONS: Coordinates must be within viewport bounds.',
    {
      x: z.coerce.number().describe('X coordinate (pixels from left)'),
      y: z.coerce.number().describe('Y coordinate (pixels from top)'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button (default left)'),
      double_click: z.coerce.boolean().optional().describe('Double click (default false)'),
    },
    async ({ x, y, button, double_click }) => {
      try { return jsonResult(await core.mouseClick({ x, y, button, double_click })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_find_element',
    'Locate a UI element by text, aria-label, or CSS selector and return its bounding box coordinates and visibility. WHEN TO USE: Call to verify element existence and obtain coordinates before clicking or hovering. SIDE EFFECTS: None (Read-only DOM query). LIMITATIONS: Scans active DOM tree.',
    {
      query: z.string().describe('Text content, aria-label value, or CSS selector to search for'),
      strategy: z.enum(['text', 'aria-label', 'css']).optional().describe('Search strategy (default: text)'),
    },
    async ({ query, strategy }) => {
      try { return jsonResult(await core.findElement({ query, strategy })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'ui_evaluate',
    'Evaluate arbitrary JavaScript expression directly in the TradingView page context. WHEN TO USE: Call for specialized low-level browser automation or retrieving unexposed DOM properties. SIDE EFFECTS: STATE_MUTATING (Arbitrary JavaScript execution in page context). LIMITATIONS: Advanced tool; expressions run within page sandbox.',
    {
      expression: z.string().describe('JavaScript expression to evaluate in the page context. Wrap in IIFE for complex logic.'),
    },
    async ({ expression }) => {
      try { return jsonResult(await core.uiEvaluate({ expression })); }
      catch (err) { return errorResult(err); }
    }
  );
}
