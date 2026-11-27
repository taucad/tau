import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Jsdom (and happy-dom) install `localStorage` and `sessionStorage` only where the global has none. From Node 25,
 * Node's own Web Storage accessor is on by default and, without `--localstorage-file`, reads `undefined`, so every
 * jsdom suite that touches storage fails on Node 26 (`Cannot read properties of undefined (reading 'clear')`). Each
 * Vitest config that runs a jsdom or happy-dom suite, by its `environment` or by a file's `@vitest-environment`
 * comment, gives its workers `--no-experimental-webstorage`, Node 24's default
 * (docs/policy/react-testing-policy.md, Environment; Brain research/node-26-ci-migration.md).
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
// `git ls-files -z` was 1,048,174 bytes on main on 2026-11-27, at Node's 1 MiB default; 64 MiB as validate-cross-root-reads.
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter((file) => file !== '' && !file.startsWith('examples/') && !file.includes('/node_modules/'));

/** The node configs Vitest reads by default in a directory, never the browser-mode ones. */
const configs = tracked.filter((file) => /(?:^|\/)(?:vitest|vite)\.config\.[cm]?[jt]s$/u.test(file));
const configDirectories = new Map(configs.map((file) => [dirname(file), file]));
const domEnvironment = /environment:\s*['"](?:jsdom|happy-dom)['"]/u;
const domComment = /@vitest-environment\s+(?:jsdom|happy-dom)/u;

/** The config Vitest would load for a test file: the nearest directory above it that holds one. */
const owningConfig = (file: string): string | undefined => {
  for (let directory = dirname(file); directory !== '.'; directory = dirname(directory)) {
    const config = configDirectories.get(directory);
    if (config !== undefined) {
      return config;
    }
  }
  return undefined;
};

const domConfigs = (): readonly string[] => {
  const found = new Set(configs.filter((config) => domEnvironment.test(read(config))));
  for (const file of tracked) {
    if (
      /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file) &&
      !/\.browser\.test\./u.test(file) &&
      domComment.test(read(file))
    ) {
      const config = owningConfig(file);
      if (config !== undefined) {
        found.add(config);
      }
    }
  }
  return [...found].toSorted();
};

describe('Vitest Web Storage on Node 26', () => {
  it('should give every jsdom and happy-dom Vitest config Node 24 Web Storage default', () => {
    const configsWithDom = domConfigs();
    expect(configsWithDom).toContain('apps/ui/vite.config.ts');
    expect(configsWithDom).toContain('apps/libs/editor-ui/vitest.config.ts');
    expect(configsWithDom).toContain('apps/libs/revisions-ui/vitest.config.ts');
    const missing = configsWithDom.filter(
      (config) => !/execArgv:\s*\[[^\]]*'--no-experimental-webstorage'/u.test(read(config)),
    );
    expect(missing).toEqual([]);
  });
});
