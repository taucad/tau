/**
 * Apply each workspace package's `publishConfig` inside a `pnpm deploy` tree, as `pnpm pack` does on publish.
 *
 * `pnpm deploy` copies a workspace package's `files` but keeps its development manifest, whose `exports`, `imports`
 * and `bin` point at `./src/*.ts`. Node then cannot load the deployed package (`ERR_MODULE_NOT_FOUND` for
 * `@taucad/build123d/src/index.ts`, research lane S29). Rewriting the published fields makes the tree resolve the built
 * `dist` exactly like an installed CLI. Only the deploy root and the injected workspace packages (pnpm's `file+`
 * directories) are touched; registry packages already carry their published manifest.
 *
 * Usage: node packages/host/scripts/apply-publish-config.mts <deploy-dir>
 * Exit codes: 0 applied, 1 failure, 2 usage.
 */
import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** The manifest fields `pnpm pack` replaces from `publishConfig`. */
const publishedFields = [
  'bin',
  'browser',
  'es2015',
  'exports',
  'imports',
  'main',
  'module',
  'types',
  'typings',
  'umd:main',
  'unpkg',
];

const applyTo = (manifestPath: string): boolean => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown> & {
    publishConfig?: Record<string, unknown>;
  };
  const publishConfig = manifest.publishConfig ?? {};
  const fields = publishedFields.filter((field) => field in publishConfig);
  if (fields.length === 0) {
    return false;
  }
  for (const field of fields) {
    manifest[field] = publishConfig[field];
  }
  // `pnpm deploy` hard-links injected packages to their workspace sources: writing in place would rewrite the
  // workspace manifest too, so the new manifest gets its own inode.
  writeFileSync(`${manifestPath}.publish`, `${JSON.stringify(manifest, undefined, 2)}\n`);
  renameSync(`${manifestPath}.publish`, manifestPath);
  return true;
};

/**
 * Every injected workspace package under the deploy's virtual store.
 *
 * @param deployDirectory - The `pnpm deploy` output directory.
 * @returns Each injected package's manifest path.
 */
const workspaceManifests = (deployDirectory: string): string[] => {
  const store = join(deployDirectory, 'node_modules', '.pnpm');
  const manifests: string[] = [];
  for (const entry of readdirSync(store)) {
    if (!entry.includes('@file+')) {
      continue;
    }
    const packages = join(store, entry, 'node_modules');
    for (const scopeOrName of readdirSync(packages)) {
      const names = scopeOrName.startsWith('@')
        ? readdirSync(join(packages, scopeOrName)).map((name) => join(scopeOrName, name))
        : [scopeOrName];
      for (const name of names) {
        const directory = join(packages, name);
        // The entry's own package is the injected one; its dependencies are symlinks to other entries.
        if (entry.startsWith(`${name.replace('/', '+')}@file+`)) {
          manifests.push(join(directory, 'package.json'));
        }
      }
    }
  }
  return manifests;
};

const main = (): void => {
  const [deployDirectory = ''] = process.argv.slice(2);
  if (deployDirectory === '') {
    console.error('Usage: node packages/host/scripts/apply-publish-config.mts <deploy-dir>');
    process.exit(2);
  }
  const manifests = [join(deployDirectory, 'package.json'), ...workspaceManifests(deployDirectory)];
  const applied = manifests.filter((manifest) => applyTo(manifest));
  console.log(`✓ publishConfig applied to ${applied.length} of ${manifests.length} workspace manifests`);
};

try {
  main();
} catch (error) {
  console.error('apply-publish-config failed:', error);
  process.exit(1);
}
