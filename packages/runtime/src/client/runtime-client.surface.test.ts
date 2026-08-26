import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Boundary-discipline sentinel for the runtime client surface.
 *
 * Scans the runtime-client public surface files for `as unknown as` casts and
 * asserts each is preceded within 5 lines above by a `// SAFETY:` comment.
 * Catches drive-by escape hatches that the type system alone cannot reject.
 */

const clientDirectory = dirname(fileURLToPath(import.meta.url));
const surfaceFiles = ['runtime-client.ts', 'runtime-client-core.ts'] as const;
const safetyLookbackLines = 5;
const castPattern = /\bas\s+unknown\s+as\b/;
const safetyPattern = /\/\/\s*SAFETY\b/;

describe('runtime client surface — cast discipline', () => {
  for (const filename of surfaceFiles) {
    it(`should bound every \`as unknown as\` cast in ${filename} with a // SAFETY: block within ${safetyLookbackLines} lines above`, () => {
      const lines = readFileSync(join(clientDirectory, filename), 'utf8').split('\n');
      const violations: string[] = [];

      for (const [index, line] of lines.entries()) {
        if (!castPattern.test(line)) {
          continue;
        }
        const lookbackStart = Math.max(0, index - safetyLookbackLines);
        const lookbackWindow = lines.slice(lookbackStart, index).join('\n');
        if (safetyPattern.test(lookbackWindow)) {
          continue;
        }
        violations.push(`${filename}:${index + 1}  ${line.trim()}`);
      }

      expect(violations).toEqual([]);
    });
  }
});
