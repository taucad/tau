import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- Unit test for this adjacent, unexported build script.
import { rewriteDeclarationImports } from './assemble-bundled-declarations.mts';
// eslint-disable-next-line no-restricted-imports -- Unit test exercises adjacent build-only metadata.
import { runtimeBundledPackages } from './runtime-bundled-packages.mts';

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

  it('owns the complete private runtime closure and an explicit public type projection', () => {
    expect(runtimeBundledPackages).toEqual([
      'converter',
      'events',
      'filesystem',
      'fs-bridge',
      'gltf-extensions',
      'json-schema',
      'memory',
      'rpc',
      'types',
      'units',
      'utils',
      'vm',
    ]);

    const runtimeManifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'packages/runtime/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const typeEntry = readFileSync(resolve(repositoryRoot, 'packages/runtime/src/types/index.ts'), 'utf8');
    const runtimeDistribution = resolve(repositoryRoot, 'packages/runtime/dist');

    for (const name of runtimeBundledPackages) {
      const libraryRoot = resolve(repositoryRoot, `libs/${name}`);
      const manifest = JSON.parse(readFileSync(resolve(libraryRoot, 'package.json'), 'utf8')) as {
        private?: boolean;
        exports?: Record<string, string>;
      };
      expect(manifest.private).toBe(true);
      expect(Object.values(manifest.exports ?? {}).length).toBeGreaterThan(0);
      expect(Object.values(manifest.exports ?? {}).every((entry) => entry.startsWith('./src/'))).toBe(true);
      expect(existsSync(resolve(repositoryRoot, `packages/${name}`))).toBe(false);
      expect(runtimeManifest.dependencies).not.toHaveProperty(`@taucad/${name}`);
      expect(runtimeManifest.devDependencies).toHaveProperty(`@taucad/${name}`, 'workspace:*');
    }

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
