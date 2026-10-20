/**
 * Node loader for the Tau project config (`tau.config.{ts,mts,js,mjs}`).
 *
 * @module
 */

import { realpath, stat } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TauConfig } from '#config/tau-config.js';
import { isPluginInstance, runtimePluginAbiVersionOf } from '#plugins/plugin.js';
import type { PluginInstance } from '#plugins/plugin.js';
import { runtimePluginAbiVersion } from '#plugins/plugin-runtime-definition.js';

/**
 * Options for {@link loadTauConfig}.
 *
 * @public
 */
export type LoadTauConfigOptions = {
  /** The project root, the folder that holds `tau.json`. */
  readonly projectPath: string;
  /** A config file to load instead of discovering one, relative to `projectPath` or absolute within it. */
  readonly configPath?: string;
};

/**
 * A loaded Tau project config.
 *
 * @public
 */
export type LoadedTauConfig = {
  /** The real path of the loaded file; absent when the project has none. */
  readonly configPath?: string;
  readonly config: TauConfig;
};

const extensions = ['.ts', '.mts', '.js', '.mjs'] as const;
const configSpecifier = '@taucad/runtime/config';

const existingFile = async (path: string): Promise<boolean> => {
  try {
    const entry = await stat(path);
    return entry.isFile();
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const discover = async (projectPath: string): Promise<string | undefined> => {
  const names = extensions.map((extension) => `tau.config${extension}`);
  const present = await Promise.all(
    names.map(async (name) => ((await existingFile(resolve(projectPath, name))) ? name : undefined)),
  );
  const candidates = present.filter((name) => name !== undefined);
  if (candidates.length > 1) {
    throw new TypeError(`Multiple Tau configs found: ${candidates.join(', ')}. Select configPath explicitly.`);
  }
  return candidates[0];
};

/**
 * Validate a config module's default export.
 *
 * @param value - The default export.
 * @param configPath - The file it came from, for messages.
 * @returns The validated config.
 * @throws TypeError naming the first problem.
 */
const validate = (value: unknown, configPath: string): TauConfig => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Tau config "${configPath}" must default-export defineConfig({ ... }).`);
  }
  const unknown = Object.keys(value).find((key) => key !== 'plugins');
  if (unknown !== undefined) {
    throw new TypeError(`Tau config "${configPath}" has an unknown field "${unknown}"; it declares only "plugins".`);
  }
  const { plugins } = value as { plugins?: unknown };
  if (plugins === undefined) {
    return {};
  }
  if (!Array.isArray(plugins)) {
    throw new TypeError(`Tau config "${configPath}" field "plugins" must be an array of plugin instances.`);
  }
  const instances: PluginInstance[] = [];
  for (const [index, plugin] of plugins.entries()) {
    const abiVersion = runtimePluginAbiVersionOf(plugin);
    if (abiVersion !== undefined && abiVersion !== runtimePluginAbiVersion) {
      throw new TypeError(
        `Tau config "${configPath}" plugin ${index} uses runtime plugin ABI ${abiVersion}, but this runtime requires ${runtimePluginAbiVersion}. Align @taucad/runtime versions.`,
      );
    }
    if (!isPluginInstance(plugin)) {
      throw new TypeError(
        `Tau config "${configPath}" plugin ${index} must be an invoked plugin instance such as zoo(), not the factory.`,
      );
    }
    instances.push(plugin);
  }
  return { plugins: instances };
};

/**
 * Import a config file, resolving `@taucad/runtime/config` to this copy when the project cannot,
 * so a config needs no install of its own (pnpm does not hoist a plugin's runtime peer).
 *
 * @param configPath - The real config path.
 * @returns The module's default export.
 */
const importConfig = async (configPath: string): Promise<unknown> => {
  const fallback = import.meta.resolve(configSpecifier);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (
          specifier === configSpecifier &&
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ERR_MODULE_NOT_FOUND'
        ) {
          return { url: fallback, shortCircuit: true };
        }
        throw error;
      }
    },
  });
  try {
    const imported = (await import(pathToFileURL(configPath).href)) as { default?: unknown };
    return imported.default;
  } finally {
    hooks.deregister();
  }
};

/**
 * Load a project's Tau config: `configPath`, or exactly one of `tau.config.{ts,mts,js,mjs}` in
 * `projectPath`. The file is trusted project code and runs with this process's privileges.
 * Node caches the module for the life of the process; load once per run.
 *
 * @param options - The project root and an optional explicit config file.
 * @returns The config, with `configPath` when a file was loaded; `{ config: {} }` when there is none.
 * @throws TypeError when several configs exist, the path leaves the project, or the config is invalid.
 * @public
 */
export const loadTauConfig = async (options: LoadTauConfigOptions): Promise<LoadedTauConfig> => {
  const projectPath = await realpath(options.projectPath);
  const selected = options.configPath ?? (await discover(projectPath));
  if (selected === undefined) {
    return { config: {} };
  }
  if (!extensions.some((extension) => extension === extname(selected))) {
    throw new TypeError('Tau configPath must select a .ts, .mts, .js or .mjs file.');
  }
  const configPath = await realpath(resolve(projectPath, selected));
  const inside = relative(projectPath, configPath);
  if (isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) {
    throw new TypeError('Tau configPath must resolve within projectPath.');
  }
  const entry = await stat(configPath);
  if (!entry.isFile()) {
    throw new TypeError('Tau configPath must select a file.');
  }
  return { configPath, config: validate(await importConfig(configPath), configPath) };
};
