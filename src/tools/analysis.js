/**
 * High-Level Market Analysis MCP Tools.
 * Provides objective, context-rich analysis tools designed for LLM agents.
 */

import { z } from 'zod';
import { jsonResult, errorResult } from './_format.js';
import * as core from '../core/analysis.js';
import { chartStateManager } from '../core/state-manager.js';

export function registerAnalysisTools(server) {
  server.tool(
    'chart_get_state_diagnostics',
    'Get authoritative diagnostic state of chart, generation ID, CDP connection status, and task queue depths. WHEN TO USE: Call whenever diagnosing connection liveness, queue backpressure, or verifying generation freshness. NO SIDE EFFECTS.',
    {},
    async () => {
      const opContext = chartStateManager.createOperationContext('chart_get_state_diagnostics');
      try {
        const state = await core.getChartState();
        return jsonResult(state);
      } catch (err) {
        return errorResult(err, opContext);
      }
    }
  );

  server.tool(
    'market_get_context',
    'Get comprehensive, multi-dimensional market context (trend, regime, key indicators, volume, market structure, and zones) in a single deterministic call. WHEN TO USE: Call when orienting yourself on a ticker/timeframe before planning actions or answering user analysis queries. LIMITATIONS: Requires price bars loaded on chart. NO SIDE EFFECTS.',
    {
      candleCount: z.coerce.number().optional().default(100).describe('Number of OHLCV bars to analyze (default 100, max 500)'),
      includeZones: z.boolean().optional().default(true).describe('Whether to calculate support and resistance zones'),
      includeIndicators: z.boolean().optional().default(true).describe('Whether to calculate RSI, MACD, EMA, ATR, Bollinger, ADX, VWAP, Stochastic'),
      includeStructure: z.boolean().optional().default(true).describe('Whether to calculate Swings, BOS, CHoCH, and range position'),
      expectedSymbol: z.string().optional().describe('Optional symbol to verify against chart state'),
      expectedTf: z.string().optional().describe('Optional timeframe to verify against chart state'),
    },
    async (args) => {
      const opContext = chartStateManager.createOperationContext('market_get_context');
      try {
        const context = await core.getMarketContext(args);
        return jsonResult(context);
      } catch (err) {
        return errorResult(err, opContext);
      }
    }
  );

  server.tool(
    'market_detect_structure',
    'Detect deterministic market structure: Swing Highs/Lows, HH/HL/LH/LL classifications, Break of Structure (BOS), Change of Character (CHoCH), and Equilibrium/Range bounds. WHEN TO USE: Call when evaluating trend continuity or structural breakouts. NO SIDE EFFECTS.',
    {
      candleCount: z.coerce.number().optional().default(100).describe('Number of bars to analyze (default 100)'),
    },
    async ({ candleCount }) => {
      const opContext = chartStateManager.createOperationContext('market_detect_structure');
      try {
        const result = await core.detectMarketStructureContext({ candleCount });
        return jsonResult(result);
      } catch (err) {
        return errorResult(err, opContext);
      }
    }
  );

  server.tool(
    'market_detect_zones',
    'Detect objective horizontal support & resistance zones and price consolidation clusters with touch counts and test recency. WHEN TO USE: Call when locating key price levels for take-profit, stop-loss, or reaction areas. NO SIDE EFFECTS.',
    {
      candleCount: z.coerce.number().optional().default(100).describe('Number of bars to analyze (default 100)'),
      tolerancePct: z.coerce.number().optional().default(0.005).describe('Price clustering tolerance (default 0.005 = 0.5%)'),
      minTouches: z.coerce.number().optional().default(2).describe('Minimum touches to qualify a zone (default 2)'),
    },
    async ({ candleCount, tolerancePct, minTouches }) => {
      const opContext = chartStateManager.createOperationContext('market_detect_zones');
      try {
        const result = await core.detectZonesContext({ candleCount, tolerancePct, minTouches });
        return jsonResult(result);
      } catch (err) {
        return errorResult(err, opContext);
      }
    }
  );

  server.tool(
    'market_compare_timeframes',
    'Compare market regime, trend direction, momentum (RSI), and volume consensus across multiple timeframes (e.g., 1D, 4H, 1H, 15m, 5m). WHEN TO USE: Call when performing multi-timeframe top-down analysis to identify timeframe alignment or conflicts. NO SIDE EFFECTS.',
    {
      timeframes: z.array(z.string()).optional().default(['1D', '4H', '1H', '15m', '5m']).describe('List of timeframes to evaluate'),
      candleCount: z.coerce.number().optional().default(300).describe('Granular base candles to retrieve for aggregation (default 300)'),
    },
    async ({ timeframes, candleCount }) => {
      const opContext = chartStateManager.createOperationContext('market_compare_timeframes');
      try {
        const result = await core.compareTimeframesContext({ timeframes, candleCount });
        return jsonResult(result);
      } catch (err) {
        return errorResult(err, opContext);
      }
    }
  );

  server.tool(
    'market_get_recent_changes',
    'Detect structural shifts, new swings, volume spikes, and divergences that occurred since a given timestamp or generation. WHEN TO USE: Call when periodically polling or checking what changed on the chart since your last analysis turn, saving LLM token bandwidth. NO SIDE EFFECTS.',
    {
      sinceTimestamp: z.coerce.number().optional().default(0).describe('Unix timestamp in seconds or milliseconds to filter changes from'),
      sinceGeneration: z.coerce.number().optional().default(0).describe('Chart generation ID from previous analysis'),
    },
    async ({ sinceTimestamp, sinceGeneration }) => {
      const opContext = chartStateManager.createOperationContext('market_get_recent_changes');
      try {
        const result = await core.getRecentChanges({ sinceTimestamp, sinceGeneration });
        return jsonResult(result);
      } catch (err) {
        return errorResult(err, opContext);
      }
    }
  );
}
