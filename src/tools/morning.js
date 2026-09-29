import { z } from "zod";
import { jsonResult, errorResult } from "./_format.js";
import * as core from "../core/morning.js";

export function registerMorningTools(server) {
  server.tool(
    "morning_brief",
    "Scan user watchlist, read indicator values across symbols, and extract structured market data for a pre-market or daily briefing according to rules.json. WHEN TO USE: Call at the start of a trading day to synthesize cross-asset market bias and momentum. SIDE EFFECTS: None (Read-only). LIMITATIONS: Requires rules.json in workspace or specified via rules_path.",
    {
      rules_path: z
        .string()
        .optional()
        .describe(
          "Optional path to rules.json. Defaults to rules.json in the project root.",
        ),
    },
    async ({ rules_path } = {}) => {
      try {
        return jsonResult(await core.runBrief({ rules_path }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "session_save",
    "Save generated session brief markdown or analysis summary to local session archive (~/.tradingview-mcp/sessions/YYYY-MM-DD.json). WHEN TO USE: Call after completing a morning briefing or daily market analysis to archive observations for future reference. SIDE EFFECTS: EXTERNAL_SIDE_EFFECT (Writes session JSON file to local disk). LIMITATIONS: None.",
    {
      brief: z
        .string()
        .describe(
          "The brief text to save (output from morning_brief after Claude applies the rules).",
        ),
      date: z
        .string()
        .optional()
        .describe("Date string YYYY-MM-DD. Defaults to today."),
    },
    async ({ brief, date } = {}) => {
      try {
        return jsonResult(core.saveSession({ brief, date }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    "session_get",
    "Retrieve archived session briefing from local session history. Returns today's brief if available, otherwise previous session. WHEN TO USE: Call when reviewing past daily biases or comparing today's price action against previous morning briefings. SIDE EFFECTS: None (Read-only filesystem read). LIMITATIONS: Requires previously saved session file.",
    {
      date: z
        .string()
        .optional()
        .describe("Date string YYYY-MM-DD. Defaults to today."),
    },
    async ({ date } = {}) => {
      try {
        return jsonResult(core.getSession({ date }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
