#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function runStep(name, cmd, args) {
  console.log(`\n=== [RUNNING] ${name} ===`);
  const start = Date.now();
  try {
    execFileSync(cmd, args, { cwd: rootDir, stdio: 'inherit' });
    console.log(`=== [PASSED] ${name} in ${Date.now() - start}ms ===`);
  } catch (err) {
    console.error(`=== [FAILED] ${name} ===`);
    process.exit(err.status || 1);
  }
}

console.log('Starting full TradingView MCP project verification...');

// 1. Lint
runStep('Lint', process.execPath, ['scripts/lint.js']);

// 2. Check Documentation Consistency
runStep('Check Docs', process.execPath, ['scripts/check_docs.js']);

// 3. Build
runStep('Build', process.execPath, ['scripts/build.js']);

// 4. Unit & Workflow Tests
runStep('Unit & Workflow Tests', process.execPath, [
  '--test',
  'tests/pine_analyze.test.js',
  'tests/cli.test.js',
  'tests/queue.test.js',
  'tests/state_manager.test.js',
  'tests/technical_indicators.test.js',
  'tests/market_structure.test.js',
  'tests/market_regime.test.js',
  'tests/zones_volume_divergences.test.js',
  'tests/multi_timeframe.test.js',
  'tests/security_serialization.test.js',
  'tests/error_contract.test.js',
  'tests/chaos_concurrency.test.js',
  'tests/stdio_safety.test.js',
  'tests/agent_workflows.test.js',
]);

// 5. Integration Tests
runStep('Integration Tests', process.execPath, [
  '--test',
  'tests/integration.test.js',
]);

console.log('\n✓ ALL VERIFICATION STEPS PASSED SUCCESSFULLY.');
