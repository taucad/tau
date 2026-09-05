import { generateFiles, getProjects, OverwriteStrategy } from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type InstructionOwner = {
  label: string;
  path: string;
};

export type ProjectInstructionOptions = {
  commands: string[];
  description: string;
  entrypoints: string[];
  facts: string[];
  owners: InstructionOwner[];
  packageName: string;
  projectName: string;
  projectRoot: string;
  rootOffset: string;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, '../../../..');

const ancestorInstructions = (tree: Tree, projectRoot: string): Array<{ label: string; path: string }> => {
  const parents: string[] = [];
  for (let directory = dirname(projectRoot); directory !== '.'; directory = dirname(directory)) {
    const path = join(directory, 'AGENTS.md');
    if (tree.isFile(path) || existsSync(resolve(repositoryRoot, path))) {
      parents.push(path);
    }
  }
  return ['AGENTS.md', ...parents.reverse()].map((path) => ({
    label: path === 'AGENTS.md' ? 'root AGENTS' : `${dirname(path)} AGENTS`,
    path: relative(projectRoot, path),
  }));
};

/** Fail a full project scaffold before any mutation when its identity or root is already owned. */
export const assertProjectCreationAvailable = (tree: Tree, projectName: string, projectRoot: string): void => {
  if (getProjects(tree).has(projectName)) {
    throw new Error(`Nx project already exists: ${projectName}.`);
  }
  if (tree.isFile(projectRoot) || tree.children(projectRoot).length > 0) {
    throw new Error(`Project root already exists: ${projectRoot}.`);
  }
};

/** Add missing project instruction files without changing either authored sibling. */
export const writeProjectInstructions = (tree: Tree, options: ProjectInstructionOptions): void => {
  generateFiles(
    tree,
    join(currentDirectory, 'instruction-files'),
    options.projectRoot,
    { ...options, ancestorInstructions: ancestorInstructions(tree, options.projectRoot), tmpl: '' },
    {
      overwriteStrategy: OverwriteStrategy.KeepExisting,
    },
  );
};
