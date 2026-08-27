// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const appRoot = join(import.meta.dirname, '..');

function listSourceFiles(directory: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...listSourceFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      output.push(fullPath);
    }
  }
  return output;
}

describe('legacy URL grammar removal (blueprint L1/L2/L3)', () => {
  const sources = listSourceFiles(appRoot).filter(
    (file) => !file.includes('.test.') && !file.includes('project-url.utils'),
  );

  it.each([['projectUrlById'], ['/projects/library'], ['/projects/community'], ['?chat=']])(
    'has zero references to %s',
    (needle) => {
      const offenders = sources.filter((file) => readFileSync(file, 'utf8').includes(needle));
      expect(offenders).toEqual([]);
    },
  );
});
