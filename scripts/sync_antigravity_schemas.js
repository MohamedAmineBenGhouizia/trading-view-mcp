#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'src', 'server.js');
const targetDir = 'C:\\Users\\LENOVO\\.gemini\\antigravity\\mcp\\tradingview-mcp-jackson';

console.log(`Connecting to ${serverPath} to dump tool schemas...`);

const child = spawn(process.execPath, [serverPath], {
  cwd: rootDir,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
child.stdout.on('data', (d) => {
  stdout += d.toString();
});

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + '\n');
}

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'schema-syncer', version: '1.0.0' },
  },
});

await new Promise((r) => setTimeout(r, 500));
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

send({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
});

const deadline = Date.now() + 5000;
let tools = [];
while (Date.now() < deadline) {
  const lines = stdout.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line.trim());
      if (parsed.id === 2 && parsed.result?.tools) {
        tools = parsed.result.tools;
        break;
      }
    } catch {}
  }
  if (tools.length > 0) break;
  await new Promise((r) => setTimeout(r, 100));
}

child.stdin.end();
child.kill('SIGTERM');

if (tools.length === 0) {
  console.error('Failed to retrieve tools from server.');
  process.exit(1);
}

console.log(`Retrieved ${tools.length} tools. Writing schemas to ${targetDir}...`);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

let written = 0;
for (const t of tools) {
  const schemaFile = path.join(targetDir, `${t.name}.json`);
  const content = {
    name: t.name,
    description: t.description || '',
    parameters: t.inputSchema || { type: 'object', properties: {} },
  };
  fs.writeFileSync(schemaFile, JSON.stringify(content, null, 2), 'utf8');
  written++;
}

console.log(`✓ Successfully synchronized ${written} tool schemas into Antigravity.`);
