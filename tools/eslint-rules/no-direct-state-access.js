#!/usr/bin/env node
/**
 * Static selector-contract checker for Momentum.
 *
 * Scans client/src for useSelector callbacks that access
 * state.leads or state.clients directly (root Redux state access)
 * instead of going through state.app.* or the centralized selectors.
 *
 * Usage:
 *   node tools/eslint-rules/no-direct-state-access.js
 *
 * Exit code 1 on violations, 0 on clean.
 */

import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..', 'client', 'src');

// Patterns that flag violations (direct root-state access inside useSelector)
// Matches: useSelector((s) => s.leads ...) or useSelector((state) => state.leads ...)
const VIOLATION_PATTERNS = [
  /useSelector\s*\(\s*\([^)]*\)\s*=>\s*\w+\.(leads|clients)\b/,
];

// Files that are explicitly exempt from this rule
const EXEMPTIONS = [
  'store/index.ts',
  'store/index.js',
  'state/appSelectors.ts',
  'state/appSelectors.js',
];

function isExempt(filePath) {
  const normalised = filePath.replace(/\\/g, '/');
  return EXEMPTIONS.some(ex => normalised.includes(ex));
}

function scanDir(dir) {
  const violations = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return violations; }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      violations.push(...scanDir(full));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    if (isExempt(full)) continue;

    let content;
    try { content = readFileSync(full, 'utf8'); } catch { continue; }
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      for (const pattern of VIOLATION_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            file: relative(process.cwd(), full),
            line: idx + 1,
            text: trimmed,
          });
        }
      }
    });
  }
  return violations;
}

const violations = scanDir(ROOT);

if (violations.length === 0) {
  console.log('\u2705  Selector contract check passed — no direct state.leads/state.clients access found.\n');
  process.exit(0);
} else {
  console.error(`\n\u274C  Selector contract violations: ${violations.length}\n`);
  console.error('  These components access Redux state.leads or state.clients directly.');
  console.error('  Use selectLeads/selectClients from @/state/appSelectors instead.\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}\n`);
  }
  console.error('  Fix:');
  console.error("    import { selectLeads, selectClients } from '@/state/appSelectors';");
  console.error('    const leads   = useSelector(selectLeads);');
  console.error('    const clients = useSelector(selectClients);\n');
  process.exit(1);
}
