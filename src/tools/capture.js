import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/capture.js';

export function registerCaptureTools(server) {
  server.tool(
    'capture_screenshot',
    'Capture lossless PNG screenshot of TradingView window and save locally to disk (regions: "full", "chart", "strategy_tester"). Returns local filesystem path to prevent token exhaustion from raw base64. WHEN TO USE: Call when visual verification of chart patterns, drawings, or UI layout is requested by the user. SIDE EFFECTS: EXTERNAL_SIDE_EFFECT (Writes PNG image file to local screenshots directory). LIMITATIONS: Requires TradingView window to be rendered on screen.',
    {
      region: z.string().optional().describe('Region to capture: full, chart, strategy_tester (default full)'),
      filename: z.string().optional().describe('Custom filename (without extension)'),
      method: z.string().optional().describe('Capture method: cdp (Page.captureScreenshot) or api (chartWidgetCollection.takeScreenshot) (default cdp)'),
    },
    async ({ region, filename, method }) => {
      try { return jsonResult(await core.captureScreenshot({ region, filename, method })); }
      catch (err) { return errorResult(err); }
    }
  );
}
