import { createEsbuildModuleVm } from '@taucad/esbuild/vm';
import type { VmFileSystem } from '@taucad/esbuild/vm';
import { defineConfigBuiltinCode } from '#config/define-config.js';
import type { GeoSpecConfigData } from '#config/types.js';
import { resolveGeoSpecConfig } from '#config/validate.js';

/**
 * Outcome of {@link readGeoSpecConfig}. A config the host cannot apply is an expected case with
 * its own recovery, not an error in the run.
 *
 * @public
 */
export type ReadGeoSpecConfigResult =
  | { readonly status: 'absent' }
  | { readonly status: 'applied'; readonly configPath: string; readonly options: GeoSpecConfigData }
  | {
      readonly status: 'not-applied';
      readonly configPath: string;
      /**
       * `unresolved-import`: the config imports a package other than `geospec/config`, which only a
       * native run can provide. `invalid`: it does not bundle, throws, or is not a valid config.
       */
      readonly reason: 'unresolved-import' | 'invalid';
      readonly message: string;
    };

/** Options for {@link readGeoSpecConfig}. @public */
export type ReadGeoSpecConfigOptions = {
  /** The project filesystem; paths are rooted, as the spec VM reads them. */
  readonly filesystem: VmFileSystem;
  /** Rooted directory holding the config, in the filesystem's spelling: `''` for its root, else `'sub/dir'`. */
  readonly projectPath: string;
};

const names = ['geospec.config.ts', 'geospec.config.mts', 'geospec.config.js', 'geospec.config.mjs'] as const;

/**
 * Read a project's `geospec.config.*` data fields through the spec VM, the same way on every host.
 *
 * Discovery is `loadGeoSpecConfig`'s: exactly one of `geospec.config.{ts,mts,js,mjs}`. The config
 * may import `geospec/config` (for `defineConfig`) and project files, nothing from `node_modules`:
 * imports are detected first, without a network call, so a config with exporters is `not-applied`
 * rather than fetched. `exporters` are never returned; a host that reads the config holds its own.
 *
 * @public
 * @param options - The project filesystem and the rooted project directory.
 * @returns `absent`, `applied` with the data fields, or `not-applied` with the reason.
 */
export const readGeoSpecConfig = async (options: ReadGeoSpecConfigOptions): Promise<ReadGeoSpecConfigResult> => {
  const { filesystem } = options;
  const root = options.projectPath === '' ? '' : `${options.projectPath.replace(/\/+$/u, '')}/`;
  const present = await Promise.all(
    names.map(async (name) => ((await filesystem.exists(`${root}${name}`)) ? `${root}${name}` : undefined)),
  );
  const candidates = present.filter((path) => path !== undefined);
  const [configPath] = candidates;
  if (configPath === undefined) {
    return { status: 'absent' };
  }
  const notApplied = (reason: 'unresolved-import' | 'invalid', message: string): ReadGeoSpecConfigResult => ({
    status: 'not-applied',
    configPath,
    reason,
    message,
  });
  if (candidates.length > 1) {
    return notApplied('invalid', `Multiple GeoSpec configs found: ${candidates.join(', ')}. Keep one.`);
  }
  const vm = await createEsbuildModuleVm({ filesystem });
  try {
    vm.registerModule('geospec/config', { version: '0.0.0', code: defineConfigBuiltinCode });
    let detectedModules: readonly string[];
    try {
      ({ detectedModules } = await vm.detectImports(configPath));
    } catch (error) {
      // Detection reads every project file the config imports: a missing one fails here, as BUNDLER_FAILED would.
      return notApplied('invalid', error instanceof Error ? error.message : String(error));
    }
    const foreign = detectedModules.filter((specifier) => specifier !== 'geospec/config');
    if (foreign.length > 0) {
      return notApplied(
        'unresolved-import',
        `The GeoSpec config imports ${foreign.map((specifier) => `'${specifier}'`).join(', ')}, which this host does not provide; only a native run applies it.`,
      );
    }
    const bundle = await vm.bundle(configPath);
    if (!bundle.success) {
      return notApplied('invalid', bundle.issues.map(({ message }) => message).join('\n'));
    }
    const executed = await vm.execute<{ default?: unknown }>(bundle.code);
    if (!executed.success) {
      return notApplied('invalid', executed.issues.map(({ message }) => message).join('\n'));
    }
    const { exporters: _exporters, ...data } = resolveGeoSpecConfig(executed.value.default);
    return { status: 'applied', configPath, options: data };
  } catch (error) {
    if (error instanceof TypeError) {
      return notApplied('invalid', error.message);
    }
    throw error;
  } finally {
    vm.dispose();
  }
};
