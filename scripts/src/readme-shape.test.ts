import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publishable, workspace } from '@taucad/nx';

/**
 * Rule 8 of `docs/policy/npm-policy.md` for the plugin and core packages: the README is
 * the npm landing page, so it must carry the required sections and a quick start
 * that imports real exports from the package's own name.
 *
 * Scope note: `packages/{cli,geospec,geospec-engine,react,runtime}` and
 * `packages/plugins/opencascade-native` do not satisfy Rule 8 yet and are owned
 * elsewhere; widen this gate to every publishable once those READMEs land.
 */
const repositoryRoot = resolve(import.meta.dirname, '../..');
const rule8Roots = ['packages/plugins/', 'packages/core/'];
const pendingRule8 = new Set(['opencascade-native']);

const requiredHeadings = ['## Install', '## Quick start', '## API', '## License'] as const;

/** Every name an `export { … }` clause in a barrel makes public, aliases resolved. */
const exportedNames = (source: string): Set<string> =>
  new Set(
    [...source.matchAll(/export\s+(?:type\s+)?\{(?<clause>[^}]*)\}/gu)].flatMap(({ groups }) =>
      (groups?.['clause'] ?? '')
        .split(',')
        .map((entry) => entry.replace(/\btype\s+/u, '').trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => (entry.includes(' as ') ? (entry.split(' as ')[1] ?? '') : entry).trim()),
    ),
  );

const quickStart = (readme: string): string =>
  /## Quick start\s+[\s\S]*?```typescript\n(?<source>[\s\S]*?)\n```/u.exec(readme)?.groups?.['source'] ?? '';

const packages = publishable(await workspace()).filter(
  (project) => rule8Roots.some((root) => project.root.startsWith(root)) && !pendingRule8.has(project.name),
);

describe('README shape (npm-policy Rule 8)', () => {
  it('covers every plugin and core package', () => {
    expect(packages.length).toBeGreaterThanOrEqual(14);
  });

  it.each(packages)('$root carries the required sections and a real quick start', ({ root, manifest }) => {
    const name = manifest?.name ?? '';
    const readme = readFileSync(join(repositoryRoot, root, 'README.md'), 'utf8');

    for (const heading of requiredHeadings) {
      expect(readme, heading).toContain(heading);
    }

    // The quick start is a consumer's first line of code: it imports from this
    // package's own name, through the alias rather than the mechanical `plugin`.
    const source = quickStart(readme);
    expect(source, 'quick start fence').toContain(`from '${name}'`);
    expect(source).not.toContain('import { plugin }');

    // Every symbol it imports from this package must actually be exported.
    const exported = exportedNames(readFileSync(join(repositoryRoot, root, 'src/index.ts'), 'utf8'));
    const imported = [...source.matchAll(new RegExp(String.raw`import \{(?<names>[^}]*)\} from '${name}'`, 'gu'))]
      .flatMap(({ groups }) => (groups?.['names'] ?? '').split(','))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    expect(imported.length).toBeGreaterThan(0);
    for (const symbol of imported) {
      expect(exported, `${symbol} is exported`).toContain(symbol);
    }
  });
});
