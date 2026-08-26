import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isPluginFactory,
  isPluginInstance,
  runtimePluginAbiVersion,
  runtimePluginAbiVersionOf,
} from '@taucad/runtime/plugin';
import type { PluginFactory, PluginInstance } from '@taucad/runtime/plugin';
import runtimePackage from '@taucad/runtime/package.json' with { type: 'json' };
import { satisfies } from 'semver';

const hasNamedPlugin = (value: unknown): value is { plugin: unknown } =>
  (typeof value === 'object' || typeof value === 'function') && value !== null && Object.hasOwn(value, 'plugin');

const hasNamedPlugins = (value: unknown): value is { plugins: unknown } =>
  (typeof value === 'object' || typeof value === 'function') && value !== null && Object.hasOwn(value, 'plugins');

const resolveFromProject = (specifier: string, projectRoot: string, subject: string): string => {
  try {
    return specifier.startsWith('.') || isAbsolute(specifier)
      ? resolve(projectRoot, specifier)
      : createRequire(join(projectRoot, 'package.json')).resolve(specifier);
  } catch {
    throw new Error(
      `Could not resolve ${subject} "${specifier}" from project root "${projectRoot}". Install it in that project and try again.`,
    );
  }
};

const importFromProject = async (specifier: string, resolvedPath: string, subject: string): Promise<unknown> => {
  try {
    return await import(pathToFileURL(resolvedPath).href);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${subject} "${specifier}" resolved to "${resolvedPath}" but failed during module evaluation: ${detail}`,
      { cause: error },
    );
  }
};

/**
 * Warn when an installed plugin package excludes the runtime bundled by this CLI.
 *
 * @param pluginName - Package name from plugin metadata.
 * @param projectRoot - Invoking project's root directory.
 * @returns A promise settled after the best-effort manifest check.
 * @public
 */
export const warnOnRuntimePeerMismatch = async (pluginName: string, projectRoot: string): Promise<void> => {
  let manifestPath: string;
  try {
    manifestPath = createRequire(join(projectRoot, 'package.json')).resolve(`${pluginName}/package.json`);
  } catch {
    return;
  }

  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      peerDependencies?: Record<string, unknown>;
    };
    const range = manifest.peerDependencies?.['@taucad/runtime'];
    if (typeof range === 'string' && !satisfies(runtimePackage.version, range, { includePrerelease: true })) {
      console.warn(
        `Tau plugin "${pluginName}" declares @taucad/runtime peer "${range}", but this CLI bundles ${runtimePackage.version}.`,
      );
    }
  } catch {
    // Peer warnings are best-effort; malformed or unreadable manifests do not block loading.
  }
};

/**
 * Load a named Tau plugin from an invoking project rather than the CLI dependency tree.
 *
 * @param specifier - Package name or path supplied by `--plugin`.
 * @param projectRoot - Invoking project's root directory.
 * @returns The package's named plugin factory.
 */
export const loadTauPlugin = async (specifier: string, projectRoot: string): Promise<PluginFactory> => {
  const resolvedPath = resolveFromProject(specifier, projectRoot, 'Tau plugin');
  const module = await importFromProject(specifier, resolvedPath, 'Tau plugin');
  if (!hasNamedPlugin(module)) {
    throw new Error(
      `Tau plugin "${specifier}" resolved to "${resolvedPath}" but must export a named "plugin" factory.`,
    );
  }

  const { plugin } = module;
  const abiVersion = runtimePluginAbiVersionOf(plugin);
  if (abiVersion !== undefined && abiVersion !== runtimePluginAbiVersion) {
    throw new TypeError(
      `Tau plugin "${specifier}" uses runtime plugin ABI ${abiVersion}, but this CLI requires ${runtimePluginAbiVersion}. Align @taucad/runtime versions.`,
    );
  }
  if (!isPluginFactory(plugin)) {
    throw new TypeError(
      `Tau plugin "${specifier}" resolved to "${resolvedPath}" but named "plugin" must be a callable Tau plugin factory created by definePlugin.`,
    );
  }

  await warnOnRuntimePeerMismatch(plugin.meta.name, projectRoot);
  return plugin;
};

/**
 * Load a `--config` module whose named `plugins` export contains invoked plugin instances.
 *
 * @param specifier - Config module path supplied by `--config`.
 * @param projectRoot - Invoking project's root directory.
 * @returns Validated plugin instances exported by the config module.
 */
export const loadTauPluginConfig = async (
  specifier: string,
  projectRoot: string,
): Promise<readonly PluginInstance[]> => {
  const resolvedPath = resolveFromProject(specifier, projectRoot, 'Tau plugin config');
  const module = await importFromProject(specifier, resolvedPath, 'Tau plugin config');
  if (!hasNamedPlugins(module) || !Array.isArray(module.plugins)) {
    throw new TypeError(
      `Tau plugin config "${specifier}" resolved to "${resolvedPath}" but must export a named "plugins" array.`,
    );
  }

  const plugins: PluginInstance[] = [];
  for (const [index, plugin] of module.plugins.entries()) {
    const abiVersion = runtimePluginAbiVersionOf(plugin);
    if (abiVersion !== undefined && abiVersion !== runtimePluginAbiVersion) {
      throw new TypeError(
        `Tau plugin config "${specifier}" entry ${index} uses runtime plugin ABI ${abiVersion}, but this CLI requires ${runtimePluginAbiVersion}. Align @taucad/runtime versions.`,
      );
    }
    if (!isPluginInstance(plugin)) {
      throw new TypeError(
        `Tau plugin config "${specifier}" entry ${index} must be an invoked Tau plugin instance such as plugin().`,
      );
    }
    plugins.push(plugin);
  }

  await Promise.all(plugins.map(async ({ meta }) => warnOnRuntimePeerMismatch(meta.name, projectRoot)));
  return plugins;
};
