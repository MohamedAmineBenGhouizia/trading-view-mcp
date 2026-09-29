#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'src', 'server.js');

console.log('Testing market_get_smart_volume over live MCP server protocol...');

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

let reqId = 1;
function sendRequest(method, params = {}) {
  const id = reqId++;
  const msg = { jsonrpc: '2.0', id, method, params };
  child.stdin.write(JSON.stringify(msg) + '\n');
  return id;
}

async function waitForResponse(id, timeoutMs = 15000) {
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
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timeout waiting for response id ${id}. Stderr: ${stderrBuffer.slice(-300)}`);
}

async function run() {
  try {
    // 1. Handshake
    console.log('Handshaking with MCP server...');
    const initId = sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smart-volume-tester', version: '1.0.0' },
    });
    await waitForResponse(initId);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    console.log('✓ Initialized successfully.');

    // 2. Ensure symbol is OANDA:XAUUSD
    console.log('Setting chart symbol to OANDA:XAUUSD...');
    const symId = sendRequest('tools/call', {
      name: 'chart_set_symbol',
      arguments: { symbol: 'OANDA:XAUUSD' },
    });
    const symRes = await waitForResponse(symId);
    console.log('✓ Symbol set response:', symRes.result?.content?.[0]?.text?.slice(0, 100));

    // 3. Test on 15m
    console.log('\n--- TESTING 15m TIMEFRAME ---');
    const tf15Id = sendRequest('tools/call', {
      name: 'chart_set_timeframe',
      arguments: { timeframe: '15' },
    });
    await waitForResponse(tf15Id);

    const call15mId = sendRequest('tools/call', {
      name: 'market_get_smart_volume',
      arguments: {
        lookback: 100,
        includeMultiTimeframe: true,
        expectedSymbol: 'OANDA:XAUUSD',
        expectedTf: '15',
      },
    });
    const res15m = await waitForResponse(call15mId);
    console.log('15m SMART VOLUME RESPONSE:\n', res15m.result?.content?.[0]?.text);

    // 4. Test on 1H
    console.log('\n--- TESTING 1H TIMEFRAME ---');
    const tf1HId = sendRequest('tools/call', {
      name: 'chart_set_timeframe',
      arguments: { timeframe: '60' },
    });
    await waitForResponse(tf1HId);

    const call1HId = sendRequest('tools/call', {
      name: 'market_get_smart_volume',
      arguments: {
        lookback: 100,
        includeMultiTimeframe: false,
        expectedSymbol: 'OANDA:XAUUSD',
        expectedTf: '60',
      },
    });
    const res1H = await waitForResponse(call1HId);
    console.log('1H SMART VOLUME RESPONSE:\n', res1H.result?.content?.[0]?.text);

    // 5. Test on 4H
    console.log('\n--- TESTING 4H TIMEFRAME ---');
    const tf4HId = sendRequest('tools/call', {
      name: 'chart_set_timeframe',
      arguments: { timeframe: '240' },
    });
    await waitForResponse(tf4HId);

    const call4HId = sendRequest('tools/call', {
      name: 'market_get_smart_volume',
      arguments: {
        lookback: 100,
        includeMultiTimeframe: false,
        expectedSymbol: 'OANDA:XAUUSD',
        expectedTf: '240',
      },
    });
    const res4H = await waitForResponse(call4HId);
    console.log('4H SMART VOLUME RESPONSE:\n', res4H.result?.content?.[0]?.text);

    console.log('\n✓ ALL LIVE MCP SMART VOLUME TESTS COMPLETED SUCCESSFULLY.');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    child.stdin.end();
    child.kill('SIGTERM');
  }
}

run();
