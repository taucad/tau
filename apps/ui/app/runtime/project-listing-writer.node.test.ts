// @vitest-environment node
/*
 * The project library is the only writer of the project listing in the query cache (app state orchestration charter
 * D9; plan § 4 A4b). A reader of `['projects']` queries with the library's `listingQuery`, which carries the one key
 * and the one function that write it; a mutation asks the library, which refetches the listing and the project's own
 * queries. So no module outside the library names the key.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** The library's own modules: the service, its commands, its storage and its observations. */
const isLibraryModule = (path: string): boolean => /^runtime\/project-library[^/]*\.ts$/.test(path);

const isTest = (path: string): boolean => /\.(test|test-d|fixture|spec)\.tsx?$|\.browser\.test\.tsx?$/.test(path);

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

/** The listing's key, as code names it: an array literal whose only element is `'projects'`. */
const listingKey = /\[\s*["']projects["']\s*]/;

/** A line that is only a comment does not name the key. */
const isComment = (line: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(line);

describe('project listing writer (D9)', () => {
  it('should name the project listing key in the project library only', () => {
    const offenders = sourceFiles(appRoot)
      .map((path) => relative(appRoot, path))
      .filter((path) => !isTest(path) && !isLibraryModule(path))
      .flatMap((path) =>
        readFileSync(join(appRoot, path), 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            !isComment(line) && listingKey.test(line) ? [`${path}:${String(index + 1)}: ${line.trim()}`] : [],
          ),
      );
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
