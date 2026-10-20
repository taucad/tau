// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The shared shell modules the agent plugin page draws; none may load dockview at runtime (types only). */
const shellModules = [
  'shell/viewer-stage.tsx',
  'shell/viewer-status.tsx',
  'shell/viewer-header-actions.tsx',
  'components/workbench-tab.tsx',
  'component-menu/use-viewer-part-menu.tsx',
];

const sourceRoot = new URL('../', import.meta.url);

/** Runtime (non-`import type`) specifiers of one module. */
const runtimeImports = (source: string): string[] =>
  [
    ...source.matchAll(/^import\s+(?!type\b)[^'"]*?from\s+'([^']+)';/gmu),
    ...source.matchAll(/^import\s+'([^']+)';/gmu),
  ].map((match) => match[1]!);

/** Resolves a `#*` package import to its source file, as the package's `imports` map does. */
const resolveOwn = (specifier: string): string =>
  specifier
    .slice(1)
    .replace(/\.jsx$/u, '.tsx')
    .replace(/\.js$/u, '.ts');

describe('shared viewer shell', () => {
  it('should load no dockview module at runtime through its own imports', () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const pending = [...shellModules];
    for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
      if (seen.has(path)) {
        continue;
      }
      seen.add(path);
      for (const specifier of runtimeImports(readFileSync(new URL(path, sourceRoot), 'utf8'))) {
        if (specifier.startsWith('#')) {
          pending.push(resolveOwn(specifier));
        } else if (specifier.startsWith('dockview')) {
          offenders.push(`${path} → ${specifier}`);
        }
      }
    }

    expect(seen.size).toBeGreaterThan(shellModules.length);
    expect(offenders).toEqual([]);
  });
});
