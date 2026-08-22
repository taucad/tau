import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  offsetFromRoot,
  readProjectConfiguration,
  updateProjectConfiguration,
} from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalLicenseText, placementMetadata } from '#generators/package/generator.js';

type CoreGeneratorSchema = {
  name: string;
  packageName: string;
  description?: string;
  publishable?: boolean;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));

/** Scaffold a publishable non-plugin Tau core support package. */
export const coreGenerator = async (tree: Tree, schema: CoreGeneratorSchema): Promise<void> => {
  if (schema.publishable === false) {
    throw new Error('packages/core packages are publishable by placement.');
  }
  if (!schema.packageName.startsWith('@taucad/')) {
    throw new Error('Core packageName must use the @taucad/ scope.');
  }

  const scope = 'packages/core';
  const projectRoot = `${scope}/${schema.name}`;
  const projectName = schema.packageName.slice('@taucad/'.length);
  const description = schema.description ?? `Shared implementation helpers for ${schema.packageName}`;
  const { canonicalLicensePath, license, private: isPrivate } = placementMetadata.packages;
  const tags = ['scope:shared', 'type:package-root'];

  addProjectConfiguration(tree, projectName, {
    root: projectRoot,
    sourceRoot: projectRoot,
    projectType: 'library',
    tags,
  });

  const substitutions = {
    name: schema.name,
    projectName,
    importPath: schema.packageName,
    description,
    scope,
    tags: JSON.stringify(tags),
    private: String(isPrivate),
    license,
    offset: offsetFromRoot(projectRoot),
    dot: '.',
    tmpl: '',
  };

  generateFiles(tree, join(currentDirectory, '../package/files'), projectRoot, substitutions);
  generateFiles(tree, join(currentDirectory, 'files'), projectRoot, substitutions);
  tree.write(join(projectRoot, 'LICENSE'), canonicalLicenseText(tree, canonicalLicensePath));
  const project = readProjectConfiguration(tree, projectName);
  updateProjectConfiguration(tree, projectName, { ...project, tags });
  await formatFiles(tree);
};

export default coreGenerator;
