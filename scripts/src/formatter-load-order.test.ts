import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');

describe('formatter CSS parser initialization', () => {
  // A fresh process gives each order a fresh ESM module graph. Oxfmt 0.36.0's bundled
  // parser cycle failed when plain CSS initialized before its Tailwind plugin:
  // https://github.com/oxc-project/oxc/issues/20033
  it.each(['css-first', 'tailwind-first'])(
    'should format and sort CSS after %s initialization',
    (order) => {
      const result = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `
            import assert from 'node:assert/strict';
            import { format } from 'oxfmt';
            const plain = async () => assert.deepEqual(
              await format('probe.css', '.a { color: red; }'),
              { code: '.a {\\n  color: red;\\n}\\n', errors: [] },
            );
            const tailwind = async () => assert.deepEqual(
              await format('probe.css', '.a { @apply items-center flex; }', {
                sortTailwindcss: { stylesheet: './apps/ui/app/styles/global.css' },
              }),
              { code: '.a {\\n  @apply flex items-center;\\n}\\n', errors: [] },
            );
            const stages = process.argv[1] === 'css-first' ? [plain, tailwind] : [tailwind, plain];
            for (const stage of stages) await stage();
            await tailwind();
          `,
          order,
        ],
        { cwd: workspaceRoot, encoding: 'utf8', timeout: 30_000 },
      );
      expect(result).toBe('');
    },
    35_000,
  );
});
