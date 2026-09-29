# TradingView MCP (High-Performance Edition)

An optimized, hardened, and lightning-fast Model Context Protocol (MCP) server for TradingView Desktop. This fork has been re-architected to support autonomous AI agents requiring high-frequency execution, parallel tool calling, and absolute reliability.

## ⚡ Key Architectural Improvements

* **Ultra-Low Latency (Zero Hardcoded Sleeps)**
  Removed legacy `setTimeout` blocks (500ms–2.5s) and introduced a reactive 50ms polling loop (`waitForCondition`). The server now yields control back to the LLM the exact millisecond the chart, DOM, or Monaco editor is ready. Saves up to 20 seconds on multi-timeframe analysis.

* **Concurrency & Race-Condition Safe**
  Implemented an AsyncQueue (FIFO Mutex) over the CDP (Chrome DevTools Protocol) connection. Agents can now safely fire multiple parallel tool calls (e.g., fetch OHLCV while simultaneously drawing shapes) without crashing the V8 engine or overlapping execution contexts.

* **Bulletproof JS Injections**
  Hardened all dynamic JavaScript evaluations sent to the TradingView runtime. Replaced vulnerable string concatenations (`'${param}'`) with strict `JSON.stringify()` serialization, completely eliminating syntax errors from special characters and mitigating CWE-94 injection risks.

* **Streamlined Dependencies & Execution**
  Fixed phantom dependencies (explicitly added `zod`) and mapped the `build/index.js` entry point directly to `src/server.js`. Code modifications are now applied instantly upon restart without requiring manual rebuilds.

## 🚀 Installation & Setup

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Make sure TradingView Desktop is running with the remote debugging port exposed:
```bash
# Windows
TradingView.exe --remote-debugging-port=9222
```

3. Add the server to your MCP Client configuration (Claude Desktop, Cursor, Antigravity, etc.):
```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["C:/absolute/path/to/this/repo/build/index.js"]
    }
  }
}
```

## 📝 License
MIT License. Based on the original work by [@tradesdontlie] and [LewisWJackson].