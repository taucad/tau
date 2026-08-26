// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Public-surface regression sentinel for `@taucad/runtime` (`packages/runtime/src/index.ts`).
 *
 * Catches accidental re-introductions of internal symbols on the public
 * barrel. Internal layer-3 symbols like `RuntimeWorkerClient` must stay off
 * the package barrel so consumers reach for the high-level `RuntimeClient`
 * facade only.
 *
 * The full sibling-export enforcement runs in `audit-public-surface.mts`.
 * This in-tree vitest sentinel covers the most heavily abused regression
 * vector: silently exporting `RuntimeWorkerClient` again because an internal
 * refactor needed it for one call site.
 */

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'index.ts');
const source = readFileSync(sourcePath, 'utf8');

const forbiddenExports = ['RuntimeWorkerClient', 'presets'] as const;

describe('@taucad/runtime public barrel — forbidden internals', () => {
  for (const symbol of forbiddenExports) {
    it(`should NOT re-export ${symbol} on the public barrel`, () => {
      // Match a top-of-line `export ... ${symbol} ...` clause. Allow the
      // symbol to be referenced inside a JSDoc comment block (e.g. explaining
      // why it is intentionally not exported).
      const exportClausePattern = new RegExp(`^export\\s[^\\n]*\\b${symbol}\\b`, 'm');
      expect(
        exportClausePattern.test(source),
        `expected \`${symbol}\` to NOT appear in any \`export\` clause of index.ts`,
      ).toBe(false);
    });
  }
});
