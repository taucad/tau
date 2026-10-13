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
  /** Script global that bundles bind to this module; bound only when `registryExpression` is set. */
  globalName?: string;
  /** JavaScript expression evaluating to the module's exports, which a bundle binds to `globalName`. */
  registryExpression?: string;
};

/** Bundler service exposed to kernels. @public */
export type KernelBundler = {
  /**
   * Identity of the kernel worker this bundler serves. `registerKernelModule` keys built-in
   * modules by it, so workers sharing a realm never resolve each other's modules.
   */
  readonly registryScope?: string;
  bundle(entryPath: string): Promise<BundleResult>;
  resolveDependencies(entryPath: string): Promise<GetDependenciesResult>;
  registerModule(name: string, entry: BuiltinModule): void;
};
