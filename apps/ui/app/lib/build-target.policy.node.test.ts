// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = join(import.meta.dirname, '..');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '+types' ? [] : sourceFiles(path);
    }
    return /\.(?:ts|tsx)$/u.test(entry.name) && !/\.(?:test|spec)\./u.test(entry.name) ? [path] : [];
  });

describe('build target source boundary', () => {
  it('should keep the raw application target read in build-target.ts only', () => {
    const readers = sourceFiles(appRoot)
      .filter((path) => readFileSync(path, 'utf8').includes('import.meta.env.TAU_TARGET'))
      .map((path) => path.slice(appRoot.length + 1));

    expect(readers).toStrictEqual(['lib/build-target.ts']);
  });

  it('should keep the web and desktop roots independent', () => {
    const webRoot = readFileSync(join(appRoot, 'root.tsx'), 'utf8');
    const desktopRoot = readFileSync(join(appRoot, '../desktop/app/root.tsx'), 'utf8');

    expect(webRoot).not.toContain('desktop/app/root');
    expect(desktopRoot).not.toContain("from '#root.js'");
    expect(webRoot).toContain("from '#root-layout.js'");
    expect(desktopRoot).toContain("from '#root-layout.js'");
  });
});
