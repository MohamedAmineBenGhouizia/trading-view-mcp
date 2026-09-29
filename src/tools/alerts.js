import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/alerts.js';

export function registerAlertTools(server) {
  server.tool(
    'alert_create',
    'Open the TradingView alert configuration dialog and create a server-side price alert. WHEN TO USE: Call when setting conditional triggers on price levels (crossing, greater_than, less_than). SIDE EFFECTS: STATE_MUTATING (Creates an active alert in user account). LIMITATIONS: Requires market symbol to be active.',
    {
      condition: z.string().describe('Alert condition (e.g., "crossing", "greater_than", "less_than")'),
      price: z.coerce.number().describe('Price level for the alert'),
      message: z.string().optional().describe('Alert message'),
    },
    async ({ condition, price, message }) => {
      try { return jsonResult(await core.create({ condition, price, message })); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'alert_list',
    'List all active and triggered alerts from the TradingView alerts panel. WHEN TO USE: Call to inspect currently active alert triggers or verify created alerts. SIDE EFFECTS: None (Read-only). LIMITATIONS: Reads alerts visible in alerts dock.',
    {},
    async () => {
      try { return jsonResult(await core.list()); }
      catch (err) { return errorResult(err); }
    }
  );

  server.tool(
    'alert_delete',
    'Delete active alerts from TradingView alerts list. WHEN TO USE: Call when removing triggered, obsolete, or batch alerts. SIDE EFFECTS: STATE_MUTATING (Deletes alerts from user account). LIMITATIONS: Pass delete_all: true to clear all alerts.',
    {
      delete_all: z.coerce.boolean().optional().describe('Delete all alerts'),
    },
    async ({ delete_all }) => {
      try { return jsonResult(await core.deleteAlerts({ delete_all })); }
      catch (err) { return errorResult(err); }
    }
  );
}
