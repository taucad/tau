import { addProjectConfiguration, formatFiles, generateFiles, offsetFromRoot } from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Placement = 'packages' | 'libs' | 'apps/libs';

type PackageGeneratorSchema = {
  name: string;
  description?: string;
  scope?: Placement;
};

type PlacementMetadata = {
  tags: string[];
  private: boolean;
  license: string;
  canonicalLicensePath: string;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '../../../../..');

/*
 * Layering, publication, and license are all derived from placement, so a new
 * capability can never be created with an invalid combination. `type:app-lib`
 * is what keeps an application capability out of every published package's
 * dependency allowlist — see
 * `docs/research/workspace-license-boundary-migration.md` Finding 6.
 */
export const placementMetadata: Record<Placement, PlacementMetadata> = {
  packages: {
    tags: ['scope:shared', 'type:lib'],
    private: false,
    license: 'Apache-2.0',
    canonicalLicensePath: 'LICENSE',
  },
  libs: {
    tags: ['scope:shared', 'type:lib'],
    private: true,
    license: 'Apache-2.0',
    canonicalLicensePath: 'LICENSE',
  },
  'apps/libs': {
    tags: ['scope:shared', 'type:app-lib'],
    private: true,
    license: 'AGPL-3.0-only',
    canonicalLicensePath: 'apps/api/LICENSE',
  },
};

/*
 * The canonical texts are single-sourced from the repository rather than copied
 * into templates, so `validate-license-partitions`' byte-identity check cannot
 * drift away from what the generator emits.
 */
export const canonicalLicenseText = (tree: Tree, path: string): string =>
  tree.read(path, 'utf8') ?? readFileSync(resolve(repositoryRoot, path), 'utf8');

export const packageGenerator = async (tree: Tree, schema: PackageGeneratorSchema): Promise<void> => {
  const scope = schema.scope ?? 'packages';
  const placement = placementMetadata[scope];
  const projectRoot = `${scope}/${schema.name}`;
  const importPath = `@taucad/${schema.name}`;
  const description = schema.description ?? '';

  addProjectConfiguration(tree, schema.name, {
    root: projectRoot,
    sourceRoot: projectRoot,
    projectType: 'library',
    tags: placement.tags,
  });

  generateFiles(tree, join(currentDirectory, 'files'), projectRoot, {
    name: schema.name,
    importPath,
    description,
    scope,
    tags: JSON.stringify(placement.tags),
    private: String(placement.private),
    license: placement.license,
    offset: offsetFromRoot(projectRoot),
    dot: '.',
    tmpl: '',
  });

  tree.write(join(projectRoot, 'LICENSE'), canonicalLicenseText(tree, placement.canonicalLicensePath));

  await formatFiles(tree);
};

export default packageGenerator;
