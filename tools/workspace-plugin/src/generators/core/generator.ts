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

import {
  apacheLicenseId,
  canonicalApacheLicensePath,
  canonicalLicenseText,
  placementMetadata,
} from '#generators/package/generator.js';
import { assertProjectCreationAvailable, writeProjectInstructions } from '#generators/write-project-instructions.js';

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
  const { private: isPrivate } = placementMetadata.packages;
  const tags = ['scope:shared', 'type:package'];

  assertProjectCreationAvailable(tree, projectName, projectRoot);

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
    license: apacheLicenseId,
    offset: offsetFromRoot(projectRoot),
    dot: '.',
    tmpl: '',
  };

  generateFiles(tree, join(currentDirectory, '../package/files'), projectRoot, substitutions);
  generateFiles(tree, join(currentDirectory, 'files'), projectRoot, substitutions);
  tree.delete(join(projectRoot, 'vitest.setup.ts'));
  tree.write(join(projectRoot, 'LICENSE'), canonicalLicenseText(tree, canonicalApacheLicensePath));
  writeProjectInstructions(tree, {
    projectName,
    projectRoot,
    packageName: schema.packageName,
    description,
    rootOffset: offsetFromRoot(projectRoot),
    facts: [
      'Placement: `packages/core`',
      'Package kind: publishable dependency-light core support',
      'Build mode: tsdown ESM build enabled',
      'Host target: browser',
    ],
    entrypoints: ['src/index.ts', 'package.json', 'project.json'],
    commands: [
      `pnpm nx lint ${projectName}`,
      `pnpm nx test ${projectName} --watch=false`,
      `pnpm nx typecheck ${projectName}`,
      `pnpm nx build ${projectName}`,
      `pnpm nx pkgcheck ${projectName}`,
      `pnpm nx size ${projectName}`,
    ],
    owners: [
      { label: 'Create Core workflow', path: '.agents/skills/create-core/SKILL.md' },
      { label: 'Learning maintenance', path: '.agents/skills/update-agent-memory/SKILL.md' },
      { label: 'Workspace project policy', path: 'docs/policy/workspace-project-policy.md' },
      { label: 'Library API policy', path: 'docs/policy/library-api-policy.md' },
      { label: 'Testing policy', path: 'docs/policy/testing-policy.md' },
    ],
  });
  const project = readProjectConfiguration(tree, projectName);
  updateProjectConfiguration(tree, projectName, { ...project, tags });
  await formatFiles(tree);
};

export default coreGenerator;
