/* oxlint-disable no-barrel-files/no-barrel-files -- compatibility adapter for the extracted @taucad/vm substrate */
import type { Metafile, Plugin } from 'esbuild-wasm';
import {
  EsbuildBundler as VmEsbuildBundler,
  clearExecuteCache as vmClearExecuteCache,
  createDetectionPlugin as vmCreateDetectionPlugin,
  createVfsPlugin as vmCreateVfsPlugin,
  executeCode as vmExecuteCode,
  extractExternalImports as vmExtractExternalImports,
  extractProjectDependencies as vmExtractProjectDependencies,
  initializeEsbuild as vmInitializeEsbuild,
} from '@taucad/vm/internal';
import type {
  BundleResult as VmBundleResult,
  BundlerOptions as VmBundlerOptions,
  DetectionPluginOptions as VmDetectionPluginOptions,
  EsbuildBundlerContext as VmEsbuildBundlerContext,
  VfsPluginOptions as VmVfsPluginOptions,
  VmExecuteResult,
} from '@taucad/vm/internal';

export type BundleResult = VmBundleResult;
export type BundlerOptions = VmBundlerOptions;
export type DetectionPluginOptions = VmDetectionPluginOptions;
export type EsbuildBundlerContext = VmEsbuildBundlerContext;
export type VfsPluginOptions = VmVfsPluginOptions;

export class EsbuildBundler extends VmEsbuildBundler {}

export async function initializeEsbuild(): Promise<void> {
  return vmInitializeEsbuild();
}

export function createVfsPlugin(options: VfsPluginOptions): Plugin {
  return vmCreateVfsPlugin(options);
}

export function createDetectionPlugin(options: DetectionPluginOptions): Plugin {
  return vmCreateDetectionPlugin(options);
}

export function extractProjectDependencies(metafile: Metafile | undefined, projectPath: string): string[] {
  return vmExtractProjectDependencies(metafile, projectPath);
}

export function extractExternalImports(metafile: Metafile | undefined): string[] {
  return vmExtractExternalImports(metafile);
}

export function clearExecuteCache(code?: string): void {
  vmClearExecuteCache(code);
}

export async function executeCode<T = unknown>(code: string): Promise<VmExecuteResult<T>> {
  return vmExecuteCode<T>(code);
}
