export type {
  ReplicadOptions,
  ReplicadWasmConfig,
  OpenCascadeOptions,
  OpenCascadeWasmConfig,
  ZooOptions,
  ManifoldOptions,
} from '@taucad/runtime/kernels';
import type { KernelPlugin as _KernelPlugin } from '@taucad/runtime';

/**
 * Plugin registration for a CAD kernel.
 * Returned by factory functions like `replicad()`, `opencascade()`.
 *
 * The actual type includes a phantom generic for compile-time export schema
 * type safety, which is omitted here for documentation clarity.
 */
export type KernelPlugin = Pick<_KernelPlugin, 'id' | 'extensions' | 'detectImport' | 'builtinModuleNames' | 'options'>;
