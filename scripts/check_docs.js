#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerHealthTools } from '../src/tools/health.js';
import { registerChartTools } from '../src/tools/chart.js';
import { registerPineTools } from '../src/tools/pine.js';
import { registerDataTools } from '../src/tools/data.js';
import { registerCaptureTools } from '../src/tools/capture.js';
import { registerDrawingTools } from '../src/tools/drawing.js';
import { registerAlertTools } from '../src/tools/alerts.js';
import { registerBatchTools } from '../src/tools/batch.js';
import { registerReplayTools } from '../src/tools/replay.js';
import { registerIndicatorTools } from '../src/tools/indicators.js';
import { registerWatchlistTools } from '../src/tools/watchlist.js';
import { registerUiTools } from '../src/tools/ui.js';
import { registerPaneTools } from '../src/tools/pane.js';
import { registerTabTools } from '../src/tools/tab.js';
import { registerMorningTools } from '../src/tools/morning.js';
import { registerAnalysisTools } from '../src/tools/analysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const catalogPath = path.join(rootDir, 'docs', 'tool-catalog.json');
const readmePath = path.join(rootDir, 'README.md');

console.log('Auditing MCP tool documentation consistency...');

// 1. Gather all registered tools
const server = new McpServer({ name: 'doc-checker', version: '1.0.0' });
registerHealthTools(server);
registerChartTools(server);
registerPineTools(server);
registerDataTools(server);
registerCaptureTools(server);
registerDrawingTools(server);
registerAlertTools(server);
registerBatchTools(server);
registerReplayTools(server);
registerIndicatorTools(server);
registerWatchlistTools(server);
registerUiTools(server);
registerPaneTools(server);
registerTabTools(server);
registerMorningTools(server);
registerAnalysisTools(server);

const registeredToolNames = Object.keys(server._registeredTools).sort();
const registeredSet = new Set(registeredToolNames);

// 2. Audit docs/tool-catalog.json
if (!fs.existsSync(catalogPath)) {
  console.error(`❌ docs/tool-catalog.json does not exist. Run 'node scripts/generate_catalog.js' first.`);
  process.exit(1);
}

const catalogRaw = fs.readFileSync(catalogPath, 'utf8');
let catalog;
try {
  catalog = JSON.parse(catalogRaw);
} catch (e) {
  console.error(`❌ Failed to parse docs/tool-catalog.json: ${e.message}`);
  process.exit(1);
}

const catalogTools = catalog.tools || [];
const catalogToolNames = catalogTools.map((t) => t.name).sort();
const catalogSet = new Set(catalogToolNames);

const missingFromCatalog = registeredToolNames.filter((t) => !catalogSet.has(t));
const extraInCatalog = catalogToolNames.filter((t) => !registeredSet.has(t));

if (missingFromCatalog.length > 0) {
  console.error(`❌ Registered tools missing from docs/tool-catalog.json:`, missingFromCatalog);
}
if (extraInCatalog.length > 0) {
  console.error(`❌ Extra tools found in docs/tool-catalog.json:`, extraInCatalog);
}

// Check tool fields in catalog
const invalidCatalogEntries = [];
for (const tool of catalogTools) {
  const missingFields = [];
  if (!tool.name) missingFields.push('name');
  if (!tool.category) missingFields.push('category');
  if (!tool.readWrite || !['READ', 'STATE_MUTATING', 'EXTERNAL_SIDE_EFFECT'].includes(tool.readWrite)) {
    missingFields.push('readWrite');
  }
  if (!tool.description) missingFields.push('description');
  if (!tool.whenToUse) missingFields.push('whenToUse');
  if (!tool.sideEffects) missingFields.push('sideEffects');
  if (!tool.limitations) missingFields.push('limitations');

  if (missingFields.length > 0) {
    invalidCatalogEntries.push({ name: tool.name || 'UNKNOWN', missing: missingFields });
  }
}

if (invalidCatalogEntries.length > 0) {
  console.error(`❌ Invalid catalog entries (missing required metadata):`, invalidCatalogEntries);
}

// 3. Audit README.md
const readme = fs.readFileSync(readmePath, 'utf8');

const missingFromReadme = [];
for (const t of registeredToolNames) {
  const pattern = new RegExp('`' + t + '`');
  if (!pattern.test(readme)) {
    missingFromReadme.push(t);
  }
}

if (missingFromReadme.length > 0) {
  console.error(`❌ Registered tools missing from README.md:`, missingFromReadme);
}

// Check for conflicting tool count mentions (e.g. "exposes 76", "76 tools")
const countMatch = readme.match(/exposes\s+(\d+)\s+purpose-built\s+MCP\s+tools/i);
let countMismatch = false;
if (!countMatch) {
  console.warn(`⚠ Warning: Could not find explicit tool count statement ("exposes X purpose-built MCP tools") in README.md`);
} else {
  const statedCount = parseInt(countMatch[1], 10);
  if (statedCount !== registeredToolNames.length) {
    console.error(`❌ README tool count mismatch: README states ${statedCount} tools, but server registers ${registeredToolNames.length} tools.`);
    countMismatch = true;
  }
}

// Check duplicate and registered tool rows in Complete MCP Tool Catalog section
const catalogSectionStart = readme.indexOf('## 🧰 Complete MCP Tool Catalog');
const catalogSectionEnd = readme.indexOf('## 🚀 Installation & Quickstart', catalogSectionStart);
const catalogSection = catalogSectionStart !== -1 && catalogSectionEnd !== -1
  ? readme.slice(catalogSectionStart, catalogSectionEnd)
  : readme;

const tableRows = catalogSection.split('\n').filter((l) => l.trim().startsWith('| `') && l.includes('|'));
const seenTableTools = new Map();
const duplicateTableTools = [];

for (const row of tableRows) {
  const match = row.match(/\|\s*`([a-z0-9_]+)`\s*\|/i);
  if (match) {
    const tName = match[1];
    if (seenTableTools.has(tName)) {
      duplicateTableTools.push(tName);
    } else {
      seenTableTools.set(tName, true);
    }
  }
}

if (duplicateTableTools.length > 0) {
  console.error(`❌ Duplicate tool rows detected in README tables:`, duplicateTableTools);
}

const extraInTables = [];
for (const tName of seenTableTools.keys()) {
  if (!registeredSet.has(tName)) {
    extraInTables.push(tName);
  }
}

if (extraInTables.length > 0) {
  console.error(`❌ Unknown / obsolete tools found in README tables:`, extraInTables);
}

const missingFromTables = registeredToolNames.filter((t) => !seenTableTools.has(t));
if (missingFromTables.length > 0) {
  console.error(`❌ Registered tools missing from README catalog tables:`, missingFromTables);
}

const failed =
  missingFromCatalog.length > 0 ||
  extraInCatalog.length > 0 ||
  invalidCatalogEntries.length > 0 ||
  missingFromReadme.length > 0 ||
  duplicateTableTools.length > 0 ||
  extraInTables.length > 0 ||
  missingFromTables.length > 0 ||
  countMismatch;

if (failed) {
  console.error(`\n❌ Documentation consistency check FAILED.`);
  process.exit(1);
}

console.log(`✓ Documentation consistency check passed:`);
console.log(`  - Registered tools: ${registeredToolNames.length}`);
console.log(`  - Catalog tools: ${catalogTools.length} in docs/tool-catalog.json`);
console.log(`  - Documented tools: ${seenTableTools.size} in README.md catalog tables`);
console.log(`  - README stated count: ${registeredToolNames.length}`);
console.log(`  - No duplicate table rows, no orphan entries.`);
