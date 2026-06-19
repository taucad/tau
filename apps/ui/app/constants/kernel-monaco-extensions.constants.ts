/**
 * Static kernel id → source extensions map for Monaco language warm-up.
 *
 * Kept free of runtime value imports so SSR and `MonacoModelServiceProvider`
 * never pull the kernel/plugin graph. The `KernelId` union below comes from a
 * type-only kernel id export, so adding/removing a UI runtime kernel without
 * updating this map fails `tsc` instead of CI.
 */
import { supportedImportFormats } from '@taucad/converter/formats';
import type { DefaultKernelId } from '#constants/kernel-worker.constants.js';

type KernelId = DefaultKernelId;

export const kernelSourceExtensionsById = {
  openscad: ['scad'],
  zoo: ['kcl'],
  replicad: ['ts', 'js'],
  opencascade: ['ts', 'js'],
  manifold: ['ts', 'js'],
  jscad: ['ts', 'js'],
  tau: supportedImportFormats,
} as const satisfies Record<KernelId, readonly string[]>;
