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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalLicenseText, placementMetadata } from '#generators/package/generator.js';

const capabilityRoles = ['kernel', 'middleware', 'bundler', 'transcoder'] as const;
type CapabilityRole = (typeof capabilityRoles)[number];

type PluginGeneratorSchema = {
  name: string;
  capabilities: string | readonly string[];
  namespace?: string;
  description?: string;
  publishable?: boolean;
  hostTarget?: 'browser' | 'node' | 'daemon' | 'python' | 'native';
};

type CapabilityTemplate = {
  role: CapabilityRole;
  bucket: 'kernels' | 'middleware' | 'bundlers' | 'transcoders';
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
          : 'middleware',
  factoryName: `${propertyName}${role[0]?.toUpperCase() ?? ''}${role.slice(1)}`,
  fileName: `${sourceName}-${role}`,
});

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
  const { canonicalLicensePath, license, private: isPrivate } = placementMetadata.packages;
  const tags = ['scope:shared', 'type:package-root'];

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
    namespace: schema.namespace ?? schema.name,
    hostTarget: schema.hostTarget ?? 'browser',
    capabilities,
    tags: JSON.stringify(tags),
    private: String(isPrivate),
    license,
    offset: offsetFromRoot(projectRoot),
    dot: '.',
    tmpl: '',
  };

  generateFiles(tree, join(currentDirectory, '../package/files'), projectRoot, substitutions);
  generateFiles(tree, join(currentDirectory, 'files'), projectRoot, substitutions);

  for (const role of capabilityRoles) {
    if (!selectedRoles.has(role)) {
      tree.delete(join(projectRoot, 'src', `${sourceName}-${role}.ts`));
    }
  }

  tree.write(join(projectRoot, 'LICENSE'), canonicalLicenseText(tree, canonicalLicensePath));
  const project = readProjectConfiguration(tree, schema.name);
  updateProjectConfiguration(tree, schema.name, { ...project, tags });
  await formatFiles(tree);
};

export default pluginGenerator;
