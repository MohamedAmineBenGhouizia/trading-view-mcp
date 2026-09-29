#!/usr/bin/env node
/**
 * TradingView MCP Entry Point (build/index.js)
 * Forwarding shim to src/server.js to ensure deterministic runtime execution
 * whether invoked via src/server.js, npm start, or build/index.js.
 */
import '../src/server.js';
