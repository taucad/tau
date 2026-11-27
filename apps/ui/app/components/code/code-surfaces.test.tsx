import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Each code surface and language is checked in `@taucad/editor-ui` (`components/code/code-surfaces.test.tsx`).
 * The app's own sources are checked here.
 */
describe('code surfaces in the app', () => {
  /* A surface that pins a language bypasses the registry; resolve it from the file instead. */
  it('should never pin a code editor to a literal language', () => {
    const appRoot = join(import.meta.dirname, '../../..');
    const sources: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (path.endsWith('.tsx') && !path.endsWith('.test.tsx')) {
          sources.push(path);
        }
      }
    };
    walk(join(appRoot, 'app'));
    const pinned = sources.filter((path) => /<CodeEditor\b[^>]*\blanguageId=['"]/su.test(readFileSync(path, 'utf8')));
    expect(pinned.map((path) => relative(appRoot, path))).toEqual([]);
  });
});
