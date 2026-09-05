import { addProjectConfiguration, formatFiles, generateFiles, offsetFromRoot } from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertProjectCreationAvailable, writeProjectInstructions } from '#generators/write-project-instructions.js';

type Placement = 'packages' | 'libs' | 'apps/libs' | 'tools';

type PackageGeneratorSchema = {
  name: string;
  description?: string;
  scope?: Placement;
  scopeTag?: 'shared' | 'ui' | 'api';
  layer?: 'feature' | 'ui' | 'data-access' | 'util';
  react?: boolean;
  build?: boolean;
};

type PlacementMetadata = {
  tags: string[];
  private: boolean;
  layerRequired: boolean;
  build: boolean;
  react: boolean;
  scopeTags: ReadonlyArray<NonNullable<PackageGeneratorSchema['scopeTag']>>;
};

type PackageMode = {
  build: boolean;
  react: boolean;
  scopeTag: NonNullable<PackageGeneratorSchema['scopeTag']>;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '../../../../..');
export const apacheLicenseId = 'Apache-2.0';
export const canonicalApacheLicensePath = 'license';

/*
 * Layering, publication, and build defaults derive from placement. Licensing
 * deliberately does not: every generated project is Apache-2.0. `type:app-lib`
 * keeps application capabilities out of published package dependency graphs.
 */
export const placementMetadata: Record<Placement, PlacementMetadata> = {
  packages: {
    // `type:package` is the publishable kind; nothing distinguishes roots from leaves.
    tags: ['scope:shared', 'type:package'],
    private: false,
    layerRequired: false,
    build: true,
    react: false,
    scopeTags: ['shared'],
  },
  libs: {
    tags: ['scope:shared', 'type:lib'],
    private: true,
    layerRequired: false,
    build: true,
    react: false,
    scopeTags: ['shared'],
  },
  tools: {
    tags: ['scope:shared', 'type:tool'],
    private: true,
    layerRequired: false,
    build: true,
    react: false,
    scopeTags: ['shared'],
  },
  'apps/libs': {
    tags: ['scope:shared', 'type:app-lib'],
    private: true,
    layerRequired: true,
    build: false,
    react: true,
    scopeTags: ['shared', 'ui'],
  },
};

/*
 * The canonical text is single-sourced from the repository rather than copied
 * into templates, so `validate-license-partitions`' byte-identity check cannot
 * drift away from what the generator emits.
 */
export const canonicalLicenseText = (tree: Tree, path: string): string =>
  tree.read(path, 'utf8') ?? readFileSync(resolve(repositoryRoot, path), 'utf8');

const packageMode = (schema: PackageGeneratorSchema, scope: Placement, placement: PlacementMetadata): PackageMode => {
  const scopeTag = schema.scopeTag ?? 'shared';
  if (placement.layerRequired && !schema.layer) {
    throw new Error('--layer is required when --scope=apps/libs');
  }
  if (!placement.layerRequired && schema.layer) {
    throw new Error('--layer is only supported when --scope=apps/libs');
  }
  if (schema.build !== undefined && schema.build !== placement.build) {
    throw new Error(`--build=${schema.build} conflicts with the fixed ${scope} build mode (${placement.build}).`);
  }
  if (!placement.scopeTags.includes(scopeTag)) {
    throw new Error(`--scopeTag=${scopeTag} is not supported when --scope=${scope}.`);
  }
  if (schema.react === true && !placement.react) {
    throw new Error(`--react is only supported when --scope=apps/libs.`);
  }
  return { build: placement.build, react: schema.react ?? false, scopeTag };
};

export const packageGenerator = async (tree: Tree, schema: PackageGeneratorSchema): Promise<void> => {
  const { description = '', layer, name } = schema;
  const scope = schema.scope ?? 'packages';
  const placement = placementMetadata[scope];
  const { build, react, scopeTag } = packageMode(schema, scope, placement);

  const projectRoot = `${scope}/${name}`;
  const importPath = `@taucad/${name}`;
  const tags = [`scope:${scopeTag}`, ...placement.tags.slice(1), ...(layer ? [`layer:${layer}`] : [])];

  assertProjectCreationAvailable(tree, name, projectRoot);

  addProjectConfiguration(tree, name, {
    root: projectRoot,
    sourceRoot: projectRoot,
    projectType: 'library',
    tags,
  });

  generateFiles(tree, join(currentDirectory, 'files'), projectRoot, {
    name,
    importPath,
    description,
    scope,
    tags: JSON.stringify(tags),
    private: String(placement.private),
    license: apacheLicenseId,
    react,
    build,
    offset: offsetFromRoot(projectRoot),
    dot: '.',
    tmpl: '',
  });

  if (!build) {
    tree.delete(join(projectRoot, '.size-limit.json'));
    tree.delete(join(projectRoot, 'tsdown.config.ts'));
    tree.delete(join(projectRoot, 'tsconfig.build.json'));
  }
  if (!react) {
    tree.delete(join(projectRoot, 'vitest.setup.ts'));
  }

  tree.write(join(projectRoot, 'LICENSE'), canonicalLicenseText(tree, canonicalApacheLicensePath));
  writeProjectInstructions(tree, {
    projectName: name,
    projectRoot,
    packageName: importPath,
    description: description || `Tau workspace library at \`${projectRoot}\`.`,
    rootOffset: offsetFromRoot(projectRoot),
    facts: [
      `Placement: \`${scope}\``,
      `Build mode: ${build ? 'tsdown ESM build enabled' : 'source-consumed; no build target'}`,
      `React mode: ${react ? 'enabled with jsdom test setup' : 'disabled with Node test environment'}`,
      `Tags: \`${tags.join(', ')}\``,
    ],
    entrypoints: ['src/index.ts', 'package.json', 'project.json'],
    commands: [
      `pnpm nx lint ${name}`,
      `pnpm nx test ${name} --watch=false`,
      `pnpm nx typecheck ${name}`,
      ...(build ? [`pnpm nx build ${name}`] : []),
      ...(placement.private ? [] : [`pnpm nx pkgcheck ${name}`]),
      ...(build ? [`pnpm nx size ${name}`] : []),
    ],
    owners: [
      { label: 'Create Package workflow', path: '.agents/skills/create-package/SKILL.md' },
      { label: 'Learning maintenance', path: '.agents/skills/update-agent-memory/SKILL.md' },
      { label: 'Workspace project policy', path: 'docs/policy/workspace-project-policy.md' },
      { label: 'Testing policy', path: 'docs/policy/testing-policy.md' },
      ...(placement.private ? [] : [{ label: 'Library API policy', path: 'docs/policy/library-api-policy.md' }]),
    ],
  });

  await formatFiles(tree);
};

export default packageGenerator;
