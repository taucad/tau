import type { RuntimeClient } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime/worker';
import { deriveExportTargets, deriveImportExtensions } from '@taucad/runtime/plugin';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { rhino } from '@taucad/rhino';

export const converterRuntime = defineRuntime({
  plugins: [gltf(), brep(), rhino(), assimp({ preset: 'all' }), image()],
});

export type ConverterRuntimeClient = RuntimeClient<typeof converterRuntime>;

export const converterImportFormats = deriveImportExtensions(converterRuntime);
export const converterExportFormats = deriveExportTargets(converterRuntime);

export type ConverterExportFormat = (typeof converterExportFormats)[number];
export type ConverterImportFormat = (typeof converterImportFormats)[number];
export type ConverterSource = {
  readonly files: Record<string, Uint8Array<ArrayBuffer>>;
  readonly entry: string;
};

export const createConverterSource = (
  entries: ReadonlyArray<readonly [string, Uint8Array<ArrayBuffer>]>,
  entry: string,
): ConverterSource => {
  const files = Object.fromEntries(entries);
  if (Object.keys(files).length !== entries.length) {
    throw new Error('Selected files contain duplicate runtime paths');
  }
  return { files, entry };
};
