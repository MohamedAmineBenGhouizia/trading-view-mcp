#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const scanDirs = ['src', 'tests', 'scripts', 'build'];
let checkedCount = 0;
let errors = [];

function checkFile(filePath) {
  try {
    execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
    checkedCount++;
  } catch (err) {
    errors.push({ file: filePath, error: err.stderr?.toString() || err.message });
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        walkDir(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      checkFile(fullPath);
    }
  }
}

for (const dir of scanDirs) {
  walkDir(path.join(rootDir, dir));
}

if (errors.length > 0) {
  console.error(`✗ Lint failed with ${errors.length} syntax error(s):`);
  for (const e of errors) {
    console.error(`  - ${e.file}: ${e.error}`);
  }
  process.exit(1);
} else {
  console.log(`✓ Lint passed: ${checkedCount} JavaScript files verified without syntax errors.`);
}
