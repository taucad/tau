import type { RuntimeClient } from '@taucad/runtime';
import { deriveExportTargets, deriveImportExtensions } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { cadmpeg } from '@taucad/cadmpeg';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';

/** @public */
export const converterRuntime = defineRuntime({
  plugins: [gltf(), brep(), cadmpeg(), assimp({ preset: 'all' }), image()],
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
