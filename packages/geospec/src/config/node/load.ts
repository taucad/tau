import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGeoSpecConfig } from '#config/validate.js';
import type { LoadedGeoSpecConfig, LoadGeoSpecConfigOptions } from '#config/types.js';

const extensions = ['.js', '.mjs', '.ts', '.mts'] as const;

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

/**
 * Load one trusted project config using Node's native module loader.
 *
 * Explicit selection or exactly one geospec.config.js/.mjs/.ts/.mts is allowed.
 * TypeScript must use erasable syntax; JSON imports use standard attributes.
 * Executable config/imports are trusted developer code, not sandboxed code.
 * Node's same-process module cache is unchanged: load once per run and use a
 * fresh process when fresh executable imports are required. No reload guarantee
 * or transitive-source identity is supplied here.
 *
 * @public
 * @param options - Project, optional explicit config and defined option overrides.
 * @returns Real config path when present and validated data without runner defaults.
 */
export const loadGeoSpecConfig = async (options: LoadGeoSpecConfigOptions): Promise<LoadedGeoSpecConfig> => {
  const projectPath = await realpath(options.projectPath);
  let selected = options.configPath;
  if (selected === undefined) {
    const names = extensions.map((extension) => `geospec.config${extension}`);
    const present = await Promise.all(
      names.map(async (name) => ((await existingFile(resolve(projectPath, name))) ? name : undefined)),
    );
    const candidates = present.filter((name) => name !== undefined);
    if (candidates.length > 1) {
      throw new TypeError(`Multiple GeoSpec configs found: ${candidates.join(', ')}. Select configPath explicitly.`);
    }
    [selected] = candidates;
  }
  if (selected === undefined) {
    return { options: resolveGeoSpecConfig({}, options.overrides) };
  }
  const selectedExtension = extname(selected);
  if (!extensions.some((extension) => extension === selectedExtension)) {
    throw new TypeError('GeoSpec configPath must select a .js, .mjs, .ts or .mts file.');
  }
  const configPath = await realpath(resolve(projectPath, selected));
  const projectRelative = relative(projectPath, configPath);
  if (isAbsolute(projectRelative) || projectRelative === '..' || projectRelative.startsWith(`..${sep}`)) {
    throw new TypeError('GeoSpec configPath must resolve within projectPath.');
  }
  const entry = await stat(configPath);
  if (!entry.isFile()) {
    throw new TypeError('GeoSpec configPath must select a file.');
  }
  const imported = (await import(pathToFileURL(configPath).href)) as { default?: unknown };
  return { configPath, options: resolveGeoSpecConfig(imported.default, options.overrides) };
};
