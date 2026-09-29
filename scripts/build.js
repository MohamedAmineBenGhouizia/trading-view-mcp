#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const buildIndex = path.join(buildDir, 'index.js');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const content = `#!/usr/bin/env node
/**
 * TradingView MCP Entry Point (build/index.js)
 * Forwarding shim to src/server.js to ensure deterministic runtime execution
 * whether invoked via src/server.js, npm start, or build/index.js.
 */
import '../src/server.js';
`;

fs.writeFileSync(buildIndex, content, { mode: 0o755 });
console.log('✓ Successfully generated build/index.js');
