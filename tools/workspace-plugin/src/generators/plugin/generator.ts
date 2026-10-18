import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  names,
  offsetFromRoot,
  readProjectConfiguration,
  updateProjectConfiguration,
} from '@nx/devkit';
import type { TargetConfiguration, Tree } from '@nx/devkit';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  apacheLicenseId,
  canonicalApacheLicensePath,
  canonicalLicenseText,
  placementMetadata,
} from '#generators/package/generator.js';
import { assertProjectCreationAvailable, writeProjectInstructions } from '#generators/write-project-instructions.js';

const capabilityRoles = ['kernel', 'middleware', 'bundler', 'transcoder', 'job', 'machine'] as const;
type CapabilityRole = (typeof capabilityRoles)[number];

type PluginGeneratorSchema = {
  name: string;
  capabilities: string | readonly string[];
  description?: string;
  publishable?: boolean;
  hostTarget?: 'browser' | 'node' | 'daemon' | 'python' | 'native';
};

type CapabilityTemplate = {
  role: CapabilityRole;
  bucket: 'kernels' | 'middleware' | 'bundlers' | 'transcoders' | 'jobs' | 'machines';
  factoryName: string;
  fileName: string;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const parseCapabilities = (input: string | readonly string[]): CapabilityRole[] => {
  const requested = (typeof input === 'string' ? input.split(',') : input)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const unknown = requested.filter((value) => !capabilityRoles.includes(value as CapabilityRole));
  if (unknown.length > 0) {
    throw new Error(`Unknown plugin capabilities: ${unknown.join(', ')}`);
  }
  const selected = capabilityRoles.filter((role) => requested.includes(role));
  if (selected.length === 0) {
    throw new Error('At least one plugin capability is required.');
  }
  if (new Set(requested).size !== requested.length) {
    throw new Error('Plugin capabilities must be unique.');
  }
  return selected;
};

const capabilityTemplate = (role: CapabilityRole, propertyName: string, sourceName: string): CapabilityTemplate => ({
  role,
  bucket:
    role === 'kernel'
      ? 'kernels'
      : role === 'transcoder'
        ? 'transcoders'
        : role === 'bundler'
          ? 'bundlers'
          : role === 'job'
            ? 'jobs'
            : role === 'machine'
              ? 'machines'
              : 'middleware',
  factoryName: `${propertyName}${role[0]?.toUpperCase() ?? ''}${role.slice(1)}`,
  fileName: `${sourceName}.${role}`,
});

/**
 * The payload targets of a Python kernel: `@taucad/python-kernel-core`'s `tau-python-kernel` command, run for this
 * package, writes its `tau-plugin.json` and project template, fills the payload seed, records the golden receipt and
 * runs the worker's Python tests.
 */
const pythonKernelTargets = (projectRoot: string): Record<string, TargetConfiguration> => {
  const command = (verb: string, flags = ''): string =>
    `node --import @oxc-node/core/register packages/core/python-kernel/scripts/tau-python-kernel.mts ${verb} --package ${projectRoot}${flags}`;
  const script = (verb: string): TargetConfiguration => ({
    executor: 'nx:run-commands',
    cache: false,
    options: { cwd: '.', command: command(verb) },
  });
  return {
    'generate-tau-plugin': { ...script('generate'), configurations: { check: { command: command('check') } } },
    'generate-project-template': {
      ...script('template'),
      configurations: { check: { command: command('template', ' --check') } },
    },
    seed: script('seed'),
    'golden-tau-plugin': { ...script('golden'), dependsOn: ['seed'] },
    'test-python': { ...script('test'), dependsOn: ['seed'] },
  };
};

/** Scaffold a publishable multi-capability Tau plugin toolkit. */
export const pluginGenerator = async (tree: Tree, schema: PluginGeneratorSchema): Promise<void> => {
  if (schema.publishable === false) {
    throw new Error('packages/plugins packages are publishable by placement.');
  }

  const scope = 'packages/plugins';
  const projectRoot = `${scope}/${schema.name}`;
  const importPath = `@taucad/${schema.name}`;
  const description = schema.description ?? `Runtime plugin toolkit for ${importPath}`;
  const { fileName: sourceName, propertyName } = names(schema.name);
  const capabilities = parseCapabilities(schema.capabilities).map((role) =>
    capabilityTemplate(role, propertyName, sourceName),
  );
  const selectedRoles = new Set(capabilities.map(({ role }) => role));
  const hostTarget = schema.hostTarget ?? 'browser';
  /* A python or native kernel runs out of process from a prepared closure, so it ships a `/native` deployment. */
  const nativeLanguage =
    selectedRoles.has('kernel') && (hostTarget === 'python' || hostTarget === 'native') ? hostTarget : undefined;
  const hostRoles = selectedRoles.has('job') || selectedRoles.has('machine');
  const usesZod = hostRoles || nativeLanguage !== undefined;
  const { private: isPrivate } = placementMetadata.packages;
  const tags = ['scope:shared', 'type:package'];

  assertProjectCreationAvailable(tree, schema.name, projectRoot);

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
    sourceName,
    alias: propertyName,
    hostTarget,
    capabilities,
    hasHostRoles: hostRoles,
    usesZod,
    nativeLanguage,
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

  for (const role of capabilityRoles) {
    if (!selectedRoles.has(role)) {
      tree.delete(join(projectRoot, 'src', `${sourceName}.${role}.ts`));
    }
  }

  if (nativeLanguage === undefined) {
    tree.delete(join(projectRoot, 'src', 'native.ts'));
    tree.delete(join(projectRoot, 'src', `${sourceName}.schemas.ts`));
    tree.delete(join(projectRoot, 'tau-plugin.json'));
  } else {
    const tsdownConfig = join(projectRoot, 'tsdown.config.ts');
    tree.write(
      tsdownConfig,
      (tree.read(tsdownConfig, 'utf8') ?? '').replace(
        "entry: ['src/index.ts']",
        "entry: ['src/index.ts', 'src/native.ts']",
      ),
    );
  }

  tree.write(join(projectRoot, 'LICENSE'), canonicalLicenseText(tree, canonicalApacheLicensePath));
  writeProjectInstructions(tree, {
    projectName: schema.name,
    projectRoot,
    packageName: importPath,
    description,
    rootOffset: offsetFromRoot(projectRoot),
    facts: [
      'Placement: `packages/plugins`',
      `Capabilities: \`${capabilities.map(({ role }) => role).join(', ')}\``,
      `Host target: \`${hostTarget}\``,
      'Build mode: tsdown ESM build enabled',
    ],
    entrypoints: [
      'src/index.ts',
      `src/${sourceName}.plugin.ts`,
      ...capabilities.map(({ fileName }) => `src/${fileName}.ts`),
      ...(nativeLanguage === undefined ? [] : ['src/native.ts', `src/${sourceName}.schemas.ts`, 'tau-plugin.json']),
      'package.json',
      'project.json',
    ],
    commands: [
      `pnpm nx lint ${schema.name}`,
      `pnpm nx test ${schema.name} --watch=false`,
      `pnpm nx typecheck ${schema.name}`,
      `pnpm nx build ${schema.name}`,
      `pnpm nx pkgcheck ${schema.name}`,
      `pnpm nx size ${schema.name}`,
    ],
    owners: [
      { label: 'Create Plugin workflow', path: '.agents/skills/create-plugin/SKILL.md' },
      ...(selectedRoles.has('kernel')
        ? [{ label: 'Create Kernel workflow', path: '.agents/skills/create-kernel/SKILL.md' }]
        : []),
      { label: 'Learning maintenance', path: '.agents/skills/update-agent-memory/SKILL.md' },
      { label: 'Workspace project policy', path: 'docs/policy/workspace-project-policy.md' },
      { label: 'Runtime architecture policy', path: 'docs/policy/runtime-architecture-policy.md' },
      { label: 'Library API policy', path: 'docs/policy/library-api-policy.md' },
      { label: 'Testing policy', path: 'docs/policy/testing-policy.md' },
    ],
  });
  const project = readProjectConfiguration(tree, schema.name);
  updateProjectConfiguration(tree, schema.name, {
    ...project,
    tags,
    ...(nativeLanguage === 'python' ? { targets: { ...project.targets, ...pythonKernelTargets(projectRoot) } } : {}),
  });
  await formatFiles(tree);
};

export default pluginGenerator;
