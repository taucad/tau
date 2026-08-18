/**
 * Static engine id → source extensions map for Monaco language warm-up.
 *
 * Keys are runtime engine ids (`defineKernel({ id })`), not catalog
 * `KernelId`s — the runtime reports the engine that rendered a file.
 *
 * Kept free of runtime value imports so SSR and `MonacoModelServiceProvider`
 * never pull the kernel/plugin graph. The `EngineId` union below comes from a
 * type-only engine id export, so adding/removing a UI runtime kernel without
 * updating this map fails `tsc` instead of CI.
 */
import { supportedImportFormats } from '@taucad/converter/formats';
import type { DefaultKernelId } from '#constants/kernel-worker.constants.js';

type EngineId = DefaultKernelId;

export const kernelSourceExtensionsById = {
  openrscad: ['scad'],
  zoo: ['kcl'],
  replicad: ['ts', 'js'],
  opencascade: ['ts', 'js'],
  manifold: ['ts', 'js'],
  jscad: ['ts', 'js'],
  tau: supportedImportFormats,
} as const satisfies Record<EngineId, readonly string[]>;
