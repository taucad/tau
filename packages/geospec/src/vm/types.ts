/**
 * The module VM contract GeoSpec runs specs and configs through.
 *
 * GeoSpec owns these types structurally, so a host can inject any VM that satisfies them, Tau's
 * `createEsbuildModuleVm` from Tau's esbuild plugin among them, while `geospec` itself depends on no Tau package.
 */

/**
 * A diagnostic emitted while bundling or executing a VM module.
 *
 * @public
 */
export type VmIssue = {
  /** Human-readable diagnostic message. */
  message: string;
  /** Stable machine-readable code. */
  code: string;
  /** Diagnostic category. */
  type: string;
  /** Diagnostic severity. */
  severity: 'error' | 'warning' | 'info';
  /** Optional source location. */
  location?: {
    fileName?: string;
    startLineNumber?: number;
    startColumn?: number;
    endLineNumber?: number;
    endColumn?: number;
  };
  /** Optional original error object or metadata. */
  details?: unknown;
};

/**
 * Minimal filesystem contract required by the VM bundler. Paths are rooted: `''` is the root and descendants carry
 * no leading slash.
 *
 * @public
 */
export type VmFileSystem = {
  /** Return true when a path exists. */
  exists(path: string): Promise<boolean>;
  /** Read a file as binary bytes. */
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Read a file as UTF-8 text. */
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  /** Write a UTF-8 text file. */
  writeFile(path: string, content: string): Promise<void>;
  /** Ensure a directory exists, creating parents as needed. */
  ensureDir(path: string): Promise<void>;
};

/**
 * A pre-bundled module served from memory under its import specifier.
 *
 * @public
 */
export type BuiltinModule = {
  /** ESM source of the module. */
  code: string;
  /** Version reported for the module. */
  version: string;
  /** Script global that bundles bind to this module; bound only when `registryExpression` is set. */
  globalName?: string;
  /** The npm package this module stands for, as a project declares it in `package.json`. */
  package?: { readonly name: string; readonly spec: string };
  /** JavaScript expression evaluating to the module's exports, which a bundle binds to `globalName`. */
  registryExpression?: string;
};

/**
 * Outcome of bundling an entry point: executable code plus diagnostics.
 *
 * @public
 */
export type BundleResult = {
  code: string;
  sourceMap?: string;
  issues: VmIssue[];
  success: boolean;
  dependencies: string[];
  unresolvedPaths: string[];
};

/**
 * Result of executing bundled ESM code.
 *
 * @public
 */
export type VmExecuteResult<T = unknown> =
  | { success: true; value: T; entryUrl?: string }
  | { success: false; issues: VmIssue[] };

/**
 * The ESM module VM GeoSpec bundles and executes specs and configs with.
 *
 * @public
 */
export type ModuleVm = {
  /** Detect bare specifiers and project dependencies without fetching anything. */
  detectImports(
    entryPath: string,
    signal?: AbortSignal,
  ): Promise<{ detectedModules: string[]; dependencies: string[] }>;
  /** Bundle an ESM entry point and its transitive dependency graph. */
  bundle(entryPath: string, signal?: AbortSignal): Promise<BundleResult>;
  /** Execute bundled ESM code in the current JavaScript environment. */
  execute<T = unknown>(code: string, signal?: AbortSignal): Promise<VmExecuteResult<T>>;
  /** Register an in-memory builtin module. */
  registerModule(name: string, module: BuiltinModule): void;
  /** Release VM-owned resources. */
  dispose(): void;
};

/**
 * Options GeoSpec passes when it creates a module VM.
 *
 * @public
 */
export type ModuleVmOptions = {
  /** Filesystem the VM reads project files from. */
  filesystem: VmFileSystem;
};

/**
 * Create a module VM. A host injects one to replace GeoSpec's plain default (see `createPlainModuleVm`), for
 * example to resolve npm packages; Tau injects `createEsbuildModuleVm` from its esbuild plugin.
 *
 * @public
 */
export type CreateModuleVm = (options: ModuleVmOptions) => Promise<ModuleVm>;

/**
 * A module a Node pool worker imports by URL for its module VM: a worker receives strings only, so a host that
 * injects a VM into a pool names a module whose default export is the factory.
 *
 * @public
 */
export type GeoSpecModuleVmModule = {
  default: CreateModuleVm;
};
