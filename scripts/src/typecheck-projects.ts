#!/usr/bin/env node
/**
 * Run every selected project config, preserving diagnostics after an earlier failure.
 * Usage: node scripts/src/typecheck-projects.ts <tsconfig> [<tsconfig> ...]
 * No environment variables are required. Exit 0 when all checks pass, otherwise 1.
 * Invoke through the Nx typecheck target; no POSIX shell or Windows command shim is needed.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';

const main = (): void => {
  const configs = process.argv.slice(2);
  if (configs.length === 0) {
    throw new Error('Provide at least one tsconfig path.');
  }

  const require = createRequire(import.meta.url);
  const compilerRoot = dirname(require.resolve('@typescript/native-preview/package.json'));
  const compiler = join(compilerRoot, 'bin/tsgo.js');
  const flags = [
    '--noEmit',
    '--composite',
    'false',
    '--declaration',
    'false',
    '--declarationMap',
    'false',
    '--incremental',
  ];
  let failed = false;
  for (const config of configs) {
    console.log(`Typechecking ${config}`);
    const result = spawnSync(process.execPath, [compiler, '-p', config, ...flags], { stdio: 'inherit' });
    if (result.error) {
      console.error(`Could not start the compiler for ${config}:`, result.error.message);
    }
    failed ||= result.status !== 0;
  }
  process.exitCode = failed ? 1 : 0;
};

try {
  main();
} catch (error) {
  console.error('Typecheck failed:', error);
  process.exitCode = 1;
}
