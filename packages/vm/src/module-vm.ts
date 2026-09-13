import type { BuildOptions } from 'esbuild-wasm';
import * as esbuild from 'esbuild-wasm';
import {
  EsbuildBundler,
  createDetectionPlugin,
  executeCode,
  extractExternalImports,
  extractProjectDependencies,
  initializeEsbuild,
} from '#esbuild-core.js';
import type { BundleResult } from '#esbuild-core.js';
import type { BuiltinModule } from '#module-manager.js';
import type { VmExecuteResult, VmFileSystem } from '#types.js';

/**
 * Options for creating an esbuild-backed ESM module VM.
 *
 * @public
 */
export type EsbuildModuleVmOptions = {
  /** Filesystem used for virtual project files and CDN cache writes. */
  filesystem: VmFileSystem;
  /** Absolute project root path used to resolve entry points. */
  projectPath: string;
  /** Enable inline source maps in bundled output. */
  sourceMaps?: boolean;
  /** Names to auto-export from CommonJS-style entry modules. */
  autoExportNames?: string[];
  /**
   * Reuse module exports for identical bundled code strings.
   * Runtime render loops opt into this; standalone test runners usually need repeatable execution.
   */
  cacheExecution?: boolean;
};

/**
 * Result of detecting project and bare-specifier imports.
 *
 * @public
 */
export type DetectImportsResult = {
  /** Bare package/module specifiers discovered transitively. */
  detectedModules: string[];
  /** Absolute project-file dependencies discovered during detection. */
  dependencies: string[];
};

/**
 * Shared ESM module VM used by Tau runtime and standalone test runners.
 *
 * @public
 */
export type ModuleVm = {
  /** Detect imports without requiring builtins to be registered. */
  detectImports(entryPath: string): Promise<DetectImportsResult>;
  /** Bundle an ESM entry point and its transitive dependency graph. */
  bundle(entryPath: string): Promise<BundleResult>;
  /** Execute bundled ESM code in the current JavaScript environment. */
  execute<T = unknown>(code: string): Promise<VmExecuteResult<T>>;
  /** Register an in-memory builtin module. */
  registerModule(name: string, module: BuiltinModule): void;
  /** Resolve dependencies and unresolved paths using the production graph. */
  resolveDependencies(entryPath: string): Promise<{ resolved: string[]; unresolved: string[] }>;
  /** Release VM-owned resources. */
  dispose(): void;
};

/**
 * Create an esbuild-backed ESM module VM.
 *
 * @param options - filesystem, project root, and bundler behavior.
 * @returns a ready-to-use module VM.
 *
 * @public
 *
 * @example <caption>Create a VM and execute a test module.</caption>
 * ```typescript
 * import { createEsbuildModuleVm } from '@taucad/vm';
 * import type { EsbuildModuleVmOptions } from '@taucad/vm';
 *
 * declare const filesystem: EsbuildModuleVmOptions['filesystem'];
 * const vm = await createEsbuildModuleVm({ filesystem, projectPath: '/project' });
 * vm.registerModule('geospec', { version: '0.0.0', code: 'export const describe = () => {}' });
 * const bundled = await vm.bundle('/project/model.test.ts');
 * const module = await vm.execute(bundled.code);
 * ```
 */
export async function createEsbuildModuleVm(options: EsbuildModuleVmOptions): Promise<ModuleVm> {
  const builtinModules = new Map<string, BuiltinModule>();
  await initializeEsbuild();

  const bundler = new EsbuildBundler({
    filesystem: options.filesystem,
    projectPath: options.projectPath,
    builtinModules,
    sourceMaps: options.sourceMaps,
    autoExportNames: options.autoExportNames,
  });
  await bundler.initialize();

  return {
    async detectImports(entryPath) {
      const buildOptions: BuildOptions = {
        entryPoints: [entryPath],
        bundle: true,
        write: false,
        metafile: true,
        format: 'esm',
        target: 'es2022',
        platform: 'browser',
        plugins: [
          createDetectionPlugin({
            filesystem: options.filesystem,
            projectPath: options.projectPath,
          }),
        ],
        external: [],
        logLevel: 'silent',
      };

      try {
        const result = await esbuild.build(buildOptions);
        return {
          detectedModules: extractExternalImports(result.metafile),
          dependencies: extractProjectDependencies(result.metafile, options.projectPath),
        };
      } catch {
        return { detectedModules: [], dependencies: [] };
      }
    },

    async bundle(entryPath) {
      return bundler.bundle(entryPath);
    },

    async execute(code) {
      return executeCode(code, { cache: options.cacheExecution ?? false });
    },

    registerModule(name, module) {
      builtinModules.set(name, module);
      bundler.registerModule(name, module);
    },

    async resolveDependencies(entryPath) {
      const result = await bundler.bundle(entryPath);
      return { resolved: result.dependencies, unresolved: result.unresolvedPaths };
    },

    dispose() {
      bundler.dispose();
    },
  };
}
