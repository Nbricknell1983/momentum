#!/usr/bin/env node
/**
 * Detached QA sweep launcher.
 * Spawns the sweep as a fully detached child process that survives
 * bash session timeouts, then writes a done-marker to /tmp/qa-done.txt.
 *
 * Usage:
 *   node tests/qa/launch-sweep.mjs
 */
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const env = { ...process.env };

const child = spawn(
  'npx',
  ['tsx', 'tests/qa/index.ts', '--phase=sweep'],
  {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  },
);

const outStream = [];
const errStream = [];

child.stdout.on('data', d => {
  process.stdout.write(d);
  outStream.push(d);
});
child.stderr.on('data', d => {
  process.stderr.write(d);
  errStream.push(d);
});

child.on('close', (code) => {
  const log = Buffer.concat(outStream).toString();
  const err = Buffer.concat(errStream).toString();
  writeFileSync('/tmp/qa-sweep-result.log', log + '\n=== STDERR ===\n' + err);
  writeFileSync('/tmp/qa-done.txt', `EXIT=${code}\n${new Date().toISOString()}`);
  process.exit(code ?? 0);
});

// Keep this parent alive without blocking the terminal
child.unref();

console.log(`Sweep launched (PID=${child.pid}). Monitor: tail -f /tmp/qa-sweep-result.log`);
