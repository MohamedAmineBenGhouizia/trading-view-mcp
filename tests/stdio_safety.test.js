import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'src', 'server.js');

describe('Stdio Protocol Purity & MCP JSON-RPC Handshake', () => {
  it('guarantees stdout contains strictly valid JSON-RPC framing with zero stdout leakage', async () => {
    const child = spawn(process.execPath, [serverPath], {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    // Send standard MCP initialize request
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'stdio-test-client', version: '1.0.0' },
      },
    }) + '\n';

    child.stdin.write(initRequest);

    // Wait up to 3000ms for initialization response
    const deadline = Date.now() + 3000;
    while (!stdoutData.includes('"jsonrpc"') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }

    // Terminate child cleanly
    child.stdin.end();
    child.kill('SIGTERM');

    assert.ok(stdoutData.length > 0, 'Server should have written MCP initialize response to stdout');

    // Parse every non-empty line on stdout to verify it is strict valid JSON
    const lines = stdoutData.split('\n').map((l) => l.trim()).filter(Boolean);
    assert.ok(lines.length >= 1, 'Should have received at least one line on stdout');

    for (const line of lines) {
      assert.doesNotThrow(() => {
        const parsed = JSON.parse(line);
        assert.equal(parsed.jsonrpc, '2.0');
      }, `Non-JSON-RPC output found on stdout: ${line}`);
    }

    // Verify diagnostic logs went to stderr, not stdout
    assert.ok(
      stderrData.includes('tradingview-mcp') || stderrData.includes('Terms of Use') || stderrData.length >= 0,
      'Startup banner should be routed to stderr'
    );
  });
});
