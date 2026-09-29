import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/indicators.js';

export function registerIndicatorTools(server) {
  server.tool(
    'indicator_set_inputs',
    'Programmatically override input values of an indicator entity (e.g., length, source, period, multiplier). WHEN TO USE: Call when fine-tuning parameters of an attached study without deleting and re-adding it. SIDE EFFECTS: STATE_MUTATING (Alters indicator configuration on chart). LIMITATIONS: Requires study entity ID and valid JSON inputs map.',
    {
      entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
      inputs: z.string().describe('JSON string of input overrides, e.g. \'{"length": 50, "source": "close"}\'. Keys are input IDs, values are the new values.'),
    },
    async ({ entity_id, inputs }) => {
      try { return jsonResult(await core.setInputs({ entity_id, inputs })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'indicator_toggle_visibility',
    'Show or hide an indicator/study plot on the chart canvas. WHEN TO USE: Call when decluttering the chart view before visual analysis or screenshot capture. SIDE EFFECTS: STATE_MUTATING (Toggles indicator visibility). LIMITATIONS: Requires study entity ID from chart_get_state.',
    {
      entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
      visible: z.coerce.boolean().describe('true to show, false to hide'),
    },
    async ({ entity_id, visible }) => {
      try { return jsonResult(await core.toggleVisibility({ entity_id, visible })); }
      catch (err) { return errorResult(err); }
    }
  );
}
