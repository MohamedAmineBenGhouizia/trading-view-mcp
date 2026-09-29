#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'src', 'server.js');

console.log('Starting Manual MCP Protocol Smoke Test against src/server.js...');

const child = spawn(process.execPath, [serverPath], {
  cwd: rootDir,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdoutBuffer = '';
let stderrBuffer = '';

child.stdout.on('data', (d) => {
  stdoutBuffer += d.toString();
});

child.stderr.on('data', (d) => {
  stderrBuffer += d.toString();
});

function sendRequest(obj) {
  const str = JSON.stringify(obj) + '\n';
  child.stdin.write(str);
}

async function waitForResponse(id, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lines = stdoutBuffer.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line.trim());
        if (parsed.id === id) {
          return parsed;
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for response to id ${id}`);
}

try {
  // 1. Handshake
  console.log('1. Sending initialize...');
  sendRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' },
    },
  });

  const initRes = await waitForResponse(1);
  if (!initRes.result || !initRes.result.serverInfo) {
    throw new Error(`Invalid initialize response: ${JSON.stringify(initRes)}`);
  }
  console.log(`✓ Initialize succeeded. Server: ${initRes.result.serverInfo.name} v${initRes.result.serverInfo.version}`);

  sendRequest({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });

  // 2. tools/list
  console.log('2. Requesting tools/list...');
  sendRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  const listRes = await waitForResponse(2);
  const tools = listRes.result?.tools || [];
  console.log(`✓ tools/list succeeded. Discovered ${tools.length} registered MCP tools.`);

  const requiredTools = [
    'market_get_context',
    'market_detect_structure',
    'market_detect_zones',
    'market_compare_timeframes',
    'market_get_recent_changes',
    'chart_get_state_diagnostics',
    'chart_get_state',
    'chart_set_symbol',
    'chart_set_timeframe',
    'data_get_ohlcv',
    'pine_analyze',
    'tv_health_check',
  ];

  for (const rt of requiredTools) {
    const found = tools.find((t) => t.name === rt);
    if (!found) {
      throw new Error(`Mandatory tool "${rt}" not found in tools/list!`);
    }
  }
  console.log(`✓ Verified presence of all mandatory tools in tool catalog.`);

  // 3. Call read-only offline tool: pine_analyze
  console.log('3. Calling pine_analyze tool...');
  sendRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'pine_analyze',
      arguments: {
        source: '//@version=6\nindicator("Test")\nplot(close)',
      },
    },
  });

  const callRes = await waitForResponse(3);
  if (!callRes.result || !callRes.result.content) {
    throw new Error(`Tool call failed: ${JSON.stringify(callRes)}`);
  }
  const toolOutput = JSON.parse(callRes.result.content[0].text);
  if (toolOutput.success !== true || toolOutput.issue_count !== 0) {
    throw new Error(`Unexpected tool output: ${JSON.stringify(toolOutput)}`);
  }
  console.log(`✓ pine_analyze executed cleanly: success=${toolOutput.success}, issues=${toolOutput.issue_count}`);

  // 4. Clean shutdown
  child.stdin.end();
  child.kill('SIGTERM');
  console.log('\n✓ SMOKE TEST COMPLETE: All MCP handshake, tool discovery, and tool call verifications passed.');
  process.exit(0);
} catch (err) {
  console.error(`✗ Smoke test failed: ${err.message}`);
  if (stderrBuffer) console.error(`stderr: ${stderrBuffer}`);
  child.kill('SIGKILL');
  process.exit(1);
}
