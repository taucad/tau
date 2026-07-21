/**
 * Kernel Dependency Types
 *
 * Discriminated union of dependency types used for cache key computation.
 * Ensures all factors affecting the output are captured.
 */

/**
 * A file dependency representing a source file or font file.
 * The contentHash is a SHA-256 hash of the file's contents.
 * @public
 */
export type FileDependency = {
  type: 'file';
  /** Path of the dependency within the runtime filesystem. */
  path: string;
  /** SHA-256 hash of the file contents */
  contentHash: string;
};

/**
 * A middleware dependency representing a middleware in the chain.
 * The index preserves the execution order in the chain.
 * @public
 */
export type MiddlewareDependency = {
  type: 'middleware';
  /** Name of the middleware */
  name: string;
  /** Version of the middleware */
  version: string;
  /** Position in the middleware chain (0-indexed) */
  index: number;
  /** Raw options object -- serialized in the final dependency hash pass */
  options: Record<string, unknown>;
};

/**
 * A framework dependency representing the Tau framework version.
 * @public
 */
export type FrameworkDependency = {
  type: 'framework';
  /** Framework name (always 'tau') */
  name: 'tau';
  /** Version string from package.json */
  version: string;
};

/**
 * An option dependency representing a kernel configuration option.
 * Used to track mesh tolerances, backend arguments, etc.
 * @public
 */
export type OptionDependency = {
  type: 'option';
  /** Option key (e.g., 'tessellation', 'arguments') */
  key: string;
  /** Option value (serialized to JSON for hashing) */
  value: unknown;
};

/**
 * A parameter dependency representing user-provided parameter values.
 * Used to invalidate cache when parameter values change.
 * @public
 */
export type ParameterDependency = {
  type: 'parameter';
  /** Raw parameters object -- serialized in the final dependency hash pass */
  parameters: Record<string, unknown>;
};

/**
 * A render option dependency representing user-provided kernel render options.
 * Used to invalidate geometry and export caches when render settings change.
 * @public
 */
export type RenderOptionsDependency = {
  type: 'render-options';
  /** Zod-validated render options object -- serialized in the final dependency hash pass */
  options: Record<string, unknown>;
};

/**
 * A kernel dependency representing the selected kernel for the active file.
 * Used to invalidate caches when two kernels can handle the same source path.
 * @public
 */
export type KernelDependency = {
  type: 'kernel';
  /** Selected kernel identifier */
  id: string;
  /** Selected kernel semantic version */
  version: string;
};

/**
 * An export dependency representing the target file format and export options.
 * Used to invalidate export caches when format-specific settings change.
 * @public
 */
export type ExportDependency = {
  type: 'export';
  /** Export file format identifier */
  format: string;
  /** Zod-validated export options object -- serialized in the final dependency hash pass */
  options: Record<string, unknown>;
  /** Selected export route identity and validated route options. */
  route?: {
    kind: 'direct' | 'transcoded';
    kernelId?: string;
    sourceFormat?: string;
    targetFormat: string;
    transcoderId?: string;
    sourceOptions?: Record<string, unknown>;
    edgeOptions?: Record<string, unknown>;
  };
};

/**
 * An asset dependency representing a bundled asset (font, WASM, etc.).
 * Used to invalidate cache when assets change between deployments.
 * @public
 */
export type AssetDependency = {
  type: 'asset';
  /** Asset identifier (e.g., 'font:Geist-Regular.ttf', 'wasm:opencascade') */
  name: string;
  /** SHA-256 hash of the asset content */
  contentHash: string;
};

/**
 * Discriminated union of all dependency types.
 * Used for cache key computation to ensure all factors affecting
 * the output are captured.
 * @public
 */
export type Dependency =
  | FileDependency
  | MiddlewareDependency
  | FrameworkDependency
  | OptionDependency
  | ParameterDependency
  | RenderOptionsDependency
  | KernelDependency
  | ExportDependency
  | AssetDependency;
