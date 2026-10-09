import type { KernelIssue } from '#types/runtime.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';

/** Result of bundling one entry and its transitive dependencies. @public */
export type BundleResult = {
  code: string;
  sourceMap?: string;
  issues: KernelIssue[];
  success: boolean;
  dependencies: string[];
  unresolvedPaths: string[];
};

/** Result of executing bundled code. @public */
export type ExecuteResult<T = unknown> =
  | { success: true; value: T; entryUrl?: string }
  | { success: false; issues: KernelIssue[] };

/** A preloaded module registered with a runtime bundler. @public */
export type BuiltinModule = {
  code: string;
  version: string;
  globalName?: string;
  /**
   * The npm package this module comes from, as a project declares it in `package.json`.
   *
   * `name` is the dependency key a model imports (`replicad`). `spec` is the exact npm spec of the
   * package Tau runs: a plain version (`3.4.1`) when the installed package publishes under `name`,
   * or an npm alias (`npm:@taulabs/replicad@1.1.0-taulabs.0`) when Tau runs a differently named
   * package, such as a fork, under that key. A subpath module (`manifold-3d/manifoldCAD`) carries
   * the identity of the package that owns it. Absent for a module with no npm package.
   */
  package?: { readonly name: string; readonly spec: string };
};

/** Bundler service exposed to kernels. @public */
export type KernelBundler = {
  bundle(entryPath: string): Promise<BundleResult>;
  resolveDependencies(entryPath: string): Promise<GetDependenciesResult>;
  registerModule(name: string, entry: BuiltinModule): void;
};
