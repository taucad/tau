#!/usr/bin/env node
/**
 * Checks a captured log sample for storage grants, receipts and presigned-URL
 * signatures (Hosted Remote Storage DC1; W9 review FR20). Run it over a staging
 * sample of tau-api and tau-storage logs after a push, a fetch and an LFS
 * batch: it prints the line numbers and kinds it found, never the values.
 * Required env: none.
 * Usage: node apps/api/scripts/check-storage-log-sample.mts <log-file>   (or the log on stdin)
 * Exit codes: 0 clean, 1 a leak was found, 2 usage error.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { findLogLeaks } from '#api/git/worker/log-leaks.js';

const [path] = process.argv.slice(2);
let sample: string;
try {
  sample = readFileSync(path ?? 0, 'utf8');
} catch (error) {
  console.error(`Cannot read the log sample: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const leaks = findLogLeaks(sample);
for (const leak of leaks) {
  console.error(`line ${String(leak.line)}: ${leak.kind}`);
}
console.log(`${String(sample.split('\n').length)} lines checked, ${String(leaks.length)} leaks`);
process.exitCode = leaks.length === 0 ? 0 : 1;
