export type { ReplicadOptions, ReplicadWasmConfig } from '@taucad/replicad';
export type { OpenCascadeOptions, OpenCascadeWasmConfig } from '@taucad/opencascade';
export type { ZooOptions } from '@taucad/zoo';
export type { ManifoldOptions } from '@taucad/manifold';
import type { KernelPlugin as _KernelPlugin } from '@taucad/runtime';

/**
 * Plugin registration for a CAD kernel.
 * Returned by factory functions like `replicadKernel()`, `opencascadeKernel()`.
 *
 * The actual type includes a phantom generic for compile-time export schema
 * type safety, which is omitted here for documentation clarity.
 */
export type KernelPlugin = Pick<_KernelPlugin, 'id' | 'extensions' | 'detectImport' | 'builtinModuleNames' | 'options'>;
