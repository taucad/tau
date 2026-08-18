/* eslint-disable @typescript-eslint/naming-convention -- Registry fixture surfaces use package export keys. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  collectArtifactImportRequirements,
  findRegistryDependencyIssues,
  findUnavailableDependencies,
} from '#check-registry-dependencies.js';

const fixtureRoot = fileURLToPath(new URL('fixtures/registry-gate/', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('Replicad registry aliases', () => {
  it('pins both forks through catalog aliases without workspace overrides', async () => {
    const workspace = load(await readFile(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8')) as {
      catalog?: Record<string, string>;
      overrides?: Record<string, string>;
    };
    const rootManifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const runtimeManifest = JSON.parse(
      await readFile(join(repositoryRoot, 'packages/runtime/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(workspace.catalog?.['replicad']).toBe('npm:@taulabs/replicad@0.23.4-beta.2');
    expect(workspace.catalog?.['replicad-opencascadejs']).toBe('npm:@taulabs/replicad-opencascadejs@0.23.0-beta.0');
    expect(workspace.overrides).not.toHaveProperty('replicad');
    expect(workspace.overrides).not.toHaveProperty('replicad-opencascadejs');
    expect(rootManifest.dependencies?.['replicad']).toBe('catalog:');
    expect(rootManifest.dependencies?.['replicad-opencascadejs']).toBe('catalog:');
    expect(runtimeManifest.dependencies?.['replicad']).toBe('catalog:');
    expect(runtimeManifest.dependencies?.['replicad-opencascadejs']).toBe('catalog:');
  });
});

describe('findUnavailableDependencies', () => {
  it('reports every unavailable dependency without an allowlist', async () => {
    const unavailable = new Set([
      '@fixture/unavailable@0.1.0',
      'replicad@0.23.4-beta.2',
      'replicad-opencascadejs@0.23.0-beta.0',
    ]);
    const dependencies = Object.fromEntries([
      ['@fixture/unavailable', '0.1.0'],
      ['zod', '^4.0.0'],
      ['replicad', '0.23.4-beta.2'],
      ['replicad-opencascadejs', '0.23.0-beta.0'],
    ]);

    await expect(
      findUnavailableDependencies(dependencies, async (specifier) => !unavailable.has(specifier)),
    ).resolves.toEqual([...unavailable]);
  });

  it('catches missing subpaths, missing named exports, and private workspace transitives', async () => {
    const manifest = JSON.parse(await readFile(join(fixtureRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const privateTransitive = JSON.parse(
      await readFile(join(fixtureRoot, 'workspaces/private-transitive/package.json'), 'utf8'),
    ) as {
      name: string;
      private: boolean;
      dependencies: Record<string, string>;
    };
    const privateLeaf = JSON.parse(
      await readFile(join(fixtureRoot, 'workspaces/private-leaf/package.json'), 'utf8'),
    ) as { name: string; private: boolean; version: string };
    const requirements = collectArtifactImportRequirements(
      join(fixtureRoot, 'dist'),
      Object.keys(manifest.dependencies),
    );
    const workspaceManifests = new Map<
      string,
      { dependencies?: Record<string, string>; private?: boolean; version?: string }
    >();
    workspaceManifests.set(privateTransitive.name, privateTransitive);
    workspaceManifests.set(privateLeaf.name, privateLeaf);

    await expect(findUnavailableDependencies(manifest.dependencies, async () => true)).resolves.toEqual([]);
    await expect(
      findRegistryDependencyIssues({
        dependencies: manifest.dependencies,
        requirements,
        workspaceManifests,
        exists: async () => true,
        inspect: async (specifier) => {
          if (specifier.startsWith('@fixture/missing-subpath@')) {
            return { subpaths: { '.': ['rootExport'] } };
          }
          if (specifier.startsWith('@fixture/missing-export@')) {
            return { subpaths: { '.': ['differentExport'] } };
          }
          return { subpaths: { '.': ['publicEntry'] } };
        },
      }),
    ).resolves.toEqual([
      '@fixture/missing-export@1.0.0: @fixture/missing-export is missing named export requiredExport',
      '@fixture/missing-subpath@1.0.0: @fixture/missing-subpath/bridge is not exported',
      '@fixture/private-transitive@1.0.0: dependency @fixture/private-leaf@1.0.0 is a private workspace package',
    ]);
  });
});
