import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/drawing.js';

export function registerDrawingTools(server) {
  server.tool(
    'draw_shape',
    'Create and render a graphical drawing primitive on the chart (horizontal_line, vertical_line, trend_line, rectangle, text, ray). WHEN TO USE: Call when annotating key support/resistance levels, chart patterns, breakout zones, or trade entry/target targets visually. SIDE EFFECTS: STATE_MUTATING (Adds drawing primitive to chart canvas). LIMITATIONS: Requires point coordinates in unix timestamp and price values.',
    {
      shape: z.string().describe('Shape type: horizontal_line, vertical_line, trend_line, rectangle, text'),
      point: z.object({ time: z.coerce.number(), price: z.coerce.number() }).describe('{ time: unix_timestamp, price: number }'),
      point2: z.object({ time: z.coerce.number(), price: z.coerce.number() }).optional().describe('Second point for two-point shapes (trend_line, rectangle)'),
      overrides: z.string().optional().describe('JSON string of style overrides (e.g., \'{"linecolor": "#ff0000", "linewidth": 2}\')'),
      text: z.string().optional().describe('Text content for text shapes'),
    },
    async ({ shape, point, point2, overrides, text }) => {
      try { return jsonResult(await core.drawShape({ shape, point, point2, overrides, text })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'draw_list',
    'List all user drawing shapes and annotations currently active on the chart with entity IDs, types, and coordinates. WHEN TO USE: Call before modifying or deleting drawings to locate specific drawing IDs. SIDE EFFECTS: None (Read-only). LIMITATIONS: Only reports user drawings, not Pine script drawings.',
    {},
    async () => {
      try { return jsonResult(await core.listDrawings()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'draw_clear',
    'Remove all user drawing shapes and annotations from the active chart canvas. WHEN TO USE: Call when resetting or cleaning the chart canvas before drawing a fresh analysis template. SIDE EFFECTS: STATE_MUTATING (Deletes all user drawings on canvas). LIMITATIONS: Irreversible removal of canvas drawings.',
    {},
    async () => {
      try { return jsonResult(await core.clearAll()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'draw_remove_one',
    'Delete a specific drawing shape from the chart canvas by its entity ID. WHEN TO USE: Call when removing an invalid or obsolete level while preserving other drawings. SIDE EFFECTS: STATE_MUTATING (Deletes targeted drawing shape). LIMITATIONS: Requires entity ID obtained from draw_list.',
    {
      entity_id: z.string().describe('Entity ID of the drawing to remove (from draw_list)'),
    },
    async ({ entity_id }) => {
      try { return jsonResult(await core.removeOne({ entity_id })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'draw_get_properties',
    'Get styling properties, line colors, line width, and coordinate points of an existing drawing shape by entity ID. WHEN TO USE: Call when inspecting or confirming coordinates of an annotated price level. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires entity ID from draw_list.',
    {
      entity_id: z.string().describe('Entity ID of the drawing (from draw_list)'),
    },
    async ({ entity_id }) => {
      try { return jsonResult(await core.getProperties({ entity_id })); }
      catch (err) { return errorResult(err); }
    }
  );
}
