import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  names,
  offsetFromRoot,
  readProjectConfiguration,
  updateProjectConfiguration,
} from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalLicenseText, placementMetadata } from '#generators/package/generator.js';

type KernelGeneratorSchema = {
  name: string;
  description?: string;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * Scaffold a standalone, publishable `@taucad/*` CAD kernel package under `packages/kernels/`.
 *
 * Kernels are packages, so this reuses the `package` generator's shared config
 * templates (tsconfig*, vitest, project.json, README) and overlays the
 * kernel-specific files: a `package.json` with the `./kernel` subpath export and
 * `@taucad/runtime` dependency, a two-entry `tsdown.config.ts`, a `defineKernel`
 * stub, and a matching test.
 */
export const kernelGenerator = async (tree: Tree, schema: KernelGeneratorSchema): Promise<void> => {
  const scope = 'packages/kernels';
  const projectRoot = `${scope}/${schema.name}`;
  const importPath = `@taucad/${schema.name}`;
  const description = schema.description ?? '';
  const { className, propertyName } = names(schema.name);
  // Kernels are published packages with a veneer layering role.
  const placement = placementMetadata.packages;
  const tags = ['scope:shared', 'type:package-veneer'];

  addProjectConfiguration(tree, schema.name, {
    root: projectRoot,
    sourceRoot: projectRoot,
    projectType: 'library',
    tags,
  });

  const substitutions = {
    name: schema.name,
    importPath,
    description,
    scope,
    className,
    propertyName,
    tags: JSON.stringify(tags),
    private: String(placement.private),
    license: placement.license,
    offset: offsetFromRoot(projectRoot),
    dot: '.',
    tmpl: '',
  };

  // Shared config templates (tsconfig*, vitest, project.json, README) come from
  // the `package` generator so kernels stay in lockstep with plain packages.
  generateFiles(tree, join(currentDirectory, '../package/files'), projectRoot, substitutions);
  // Kernel-specific overlay wins for package.json / tsdown / src.
  generateFiles(tree, join(currentDirectory, 'files'), projectRoot, substitutions);

  tree.write(join(projectRoot, 'LICENSE'), canonicalLicenseText(tree, placement.canonicalLicensePath));

  const project = readProjectConfiguration(tree, schema.name);
  updateProjectConfiguration(tree, schema.name, { ...project, tags });

  await formatFiles(tree);
};

export default kernelGenerator;
