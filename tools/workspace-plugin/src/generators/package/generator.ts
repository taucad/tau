import { addProjectConfiguration, formatFiles, generateFiles, offsetFromRoot } from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  },
  libs: {
    tags: ['scope:shared', 'type:lib'],
    private: true,
    layerRequired: false,
    build: true,
  },
  tools: {
    tags: ['scope:shared', 'type:tool'],
    private: true,
    layerRequired: false,
    build: true,
  },
  'apps/libs': {
    tags: ['scope:shared', 'type:app-lib'],
    private: true,
    layerRequired: true,
    build: false,
  },
};

/*
 * The canonical text is single-sourced from the repository rather than copied
 * into templates, so `validate-license-partitions`' byte-identity check cannot
 * drift away from what the generator emits.
 */
export const canonicalLicenseText = (tree: Tree, path: string): string =>
  tree.read(path, 'utf8') ?? readFileSync(resolve(repositoryRoot, path), 'utf8');

export const packageGenerator = async (tree: Tree, schema: PackageGeneratorSchema): Promise<void> => {
  const scope = schema.scope ?? 'packages';
  const placement = placementMetadata[scope];
  if (placement.layerRequired && !schema.layer) {
    throw new Error('--layer is required when --scope=apps/libs');
  }
  if (!placement.layerRequired && schema.layer) {
    throw new Error('--layer is only supported when --scope=apps/libs');
  }

  const projectRoot = `${scope}/${schema.name}`;
  const importPath = `@taucad/${schema.name}`;
  const description = schema.description ?? '';
  const react = schema.react ?? false;
  const build = schema.build ?? placement.build;
  const tags = [
    `scope:${schema.scopeTag ?? 'shared'}`,
    ...placement.tags.slice(1),
    ...(schema.layer ? [`layer:${schema.layer}`] : []),
  ];

  addProjectConfiguration(tree, schema.name, {
    root: projectRoot,
    sourceRoot: projectRoot,
    projectType: 'library',
    tags,
  });

  generateFiles(tree, join(currentDirectory, 'files'), projectRoot, {
    name: schema.name,
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

  await formatFiles(tree);
};

export default packageGenerator;
