import type { RuntimeClient } from '@taucad/runtime';
import { deriveExportTargets, deriveImportExtensions } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { rhino } from '@taucad/rhino';

/** @public */
export const converterRuntime = defineRuntime({
  plugins: [gltf(), brep(), rhino(), assimp({ preset: 'all' }), image()],
});

/** @public */
export type ConverterRuntimeClient = RuntimeClient<typeof converterRuntime>;

/** @public */
export const converterImportFormats = deriveImportExtensions(converterRuntime);

/** @public */
export const converterExportFormats = deriveExportTargets(converterRuntime);

/** @public */
export type ConverterExportFormat = (typeof converterExportFormats)[number];

/** @public */
export type ConverterImportFormat = (typeof converterImportFormats)[number];

/** @public */
export type ConverterSource = {
  readonly files: Record<string, Uint8Array<ArrayBuffer>>;
  readonly entry: string;
};

/** @public */
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
