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
};

/** Bundler service exposed to kernels. @public */
export type KernelBundler = {
  bundle(entryPath: string): Promise<BundleResult>;
  resolveDependencies(entryPath: string): Promise<GetDependenciesResult>;
  registerModule(name: string, entry: BuiltinModule): void;
};
