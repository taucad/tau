import { addProjectConfiguration, formatFiles, generateFiles, offsetFromRoot } from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type PackageGeneratorSchema = {
  name: string;
  description?: string;
  scope?: 'packages' | 'libs';
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export const packageGenerator = async (tree: Tree, schema: PackageGeneratorSchema): Promise<void> => {
  const scope = schema.scope ?? 'packages';
  const projectRoot = `${scope}/${schema.name}`;
  const importPath = `@taucad/${schema.name}`;
  const description = schema.description ?? '';

  addProjectConfiguration(tree, schema.name, {
    root: projectRoot,
    sourceRoot: projectRoot,
    projectType: 'library',
    tags: ['scope:shared', 'type:lib'],
  });

  generateFiles(tree, join(currentDirectory, 'files'), projectRoot, {
    name: schema.name,
    importPath,
    description,
    scope,
    offset: offsetFromRoot(projectRoot),
    dot: '.',
    tmpl: '',
  });

  await formatFiles(tree);
};

export default packageGenerator;
