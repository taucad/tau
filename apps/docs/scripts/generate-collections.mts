#!/usr/bin/env node
/**
 * Write the `fumadocs-mdx:collections/*` declarations that `tsconfig.app.json`
 * maps onto `node_modules/.cache/fumadocs/apps/docs`. The Vite plugin emits
 * them while building, so without this a fresh checkout raises TS2307 in every
 * lint, typecheck and test run. Paths mirror the `mdx()` options in
 * `vite.config.ts`; a mismatch fails those targets loudly rather than silently.
 * Required env: none.
 * Usage: pnpm nx run docs:generate-collections
 * Exit codes: 0 written, 1 generation failed.
 */
import { resolve } from 'node:path';
import process from 'node:process';

import { postInstall } from 'fumadocs-mdx/vite';

const projectRoot = resolve(import.meta.dirname, '..');

try {
  await postInstall({
    configPath: resolve(projectRoot, 'app/lib/fumadocs/source.config.ts'),
    outDir: resolve(projectRoot, '../../node_modules/.cache/fumadocs/apps/docs'),
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
