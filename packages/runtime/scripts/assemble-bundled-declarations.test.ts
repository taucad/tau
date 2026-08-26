import { existsSync, globSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { bundledLibraryProjects, workspace } from '@taucad/nx';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Unit test for this adjacent, unexported build script.
import { bundledDeclarationProjects, rewriteDeclarationImports } from './assemble-bundled-declarations.mts';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

describe('rewriteDeclarationImports', () => {
  const importer = '/repo/runtime/dist/types/example.d.mts';
  const targets = new Map([
    ['@taucad/memory', '/repo/runtime/dist/memory/src/index.d.mts'],
    ['@taucad/utils/path', '/repo/runtime/dist/utils/src/path.utils.d.mts'],
  ]);

  it('rewrites declaration module nodes without touching comments', () => {
    const source = [
      'import type { SharedPool } from "@taucad/memory";',
      "export { joinPath } from '@taucad/utils/path';",
      "type Path = import('@taucad/utils/path').AbsolutePath;",
      "// import('@taucad/memory') stays documentation",
    ].join('\n');

    expect(rewriteDeclarationImports(source, importer, targets)).toBe(
      [
        'import type { SharedPool } from "../memory/src/index.mjs";',
        "export { joinPath } from '../utils/src/path.utils.mjs';",
        "type Path = import('../utils/src/path.utils.mjs').AbsolutePath;",
        "// import('@taucad/memory') stays documentation",
      ].join('\n'),
    );
  });

  it('rejects an unmapped bundled-package subpath', () => {
    expect(() =>
      rewriteDeclarationImports("export type { Missing } from '@taucad/utils/missing';", importer, targets),
    ).toThrow('Unmapped bundled declaration import: @taucad/utils/missing');
  });

  it('owns the complete private runtime closure and an explicit public type projection', async () => {
    const workspaceValue = await workspace();
    const direct = bundledLibraryProjects(workspaceValue, 'runtime');
    const bundled = bundledDeclarationProjects(workspaceValue, 'runtime');
    const directNames = new Set(direct.map(({ packageName }) => packageName));
    const runtimeManifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'packages/runtime/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const typeEntry = readFileSync(resolve(repositoryRoot, 'packages/runtime/src/types/index.ts'), 'utf8');
    const runtimeDistribution = resolve(repositoryRoot, 'packages/runtime/dist');

    // Two witnesses: the manifest/tag rule says what may bundle, the emitted
    // mirrors say what did. Every mirror must be claimed by the rule.
    expect(bundled.length).toBeGreaterThan(0);
    expect(bundled.map(({ project }) => project.root)).toEqual(
      expect.arrayContaining(
        globSync('libs/*/', { cwd: runtimeDistribution }).map((entry) => entry.replace(/\/$/, '')),
      ),
    );

    for (const { packageName, project } of bundled) {
      const name = basename(project.root);
      const libraryRoot = resolve(repositoryRoot, project.root);
      const manifest = JSON.parse(readFileSync(resolve(libraryRoot, 'package.json'), 'utf8')) as {
        private?: boolean;
        exports?: Record<string, string>;
      };
      expect(manifest.private).toBe(true);
      expect(Object.values(manifest.exports ?? {}).length).toBeGreaterThan(0);
      expect(Object.values(manifest.exports ?? {}).every((entry) => entry.startsWith('./src/'))).toBe(true);
      expect(existsSync(resolve(repositoryRoot, `packages/${name}`))).toBe(false);
      expect(runtimeManifest.dependencies).not.toHaveProperty(packageName);
      if (directNames.has(packageName)) {
        expect(runtimeManifest.devDependencies).toHaveProperty(packageName, 'workspace:*');
      } else {
        expect(runtimeManifest.devDependencies).not.toHaveProperty(packageName);
      }
    }

    expect(directNames.has('@taucad/units')).toBe(false);
    expect(bundled.map(({ packageName }) => packageName)).toContain('@taucad/units');

    for (const name of ['types', 'json-schema', 'units']) {
      expect(existsSync(resolve(repositoryRoot, `libs/${name}/dist/node_modules/.pnpm`))).toBe(false);
    }

    expect(typeEntry).not.toMatch(/export(?:\s+type)?\s+\*\s+from\s+["']@taucad\/(?:types|json-schema)/);
    expect(
      globSync('**/*.d.mts', { cwd: runtimeDistribution }).some((path) =>
        readFileSync(resolve(runtimeDistribution, path), 'utf8').includes('lucide-react'),
      ),
    ).toBe(false);
  });
});
