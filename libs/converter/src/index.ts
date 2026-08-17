// oxlint-disable-next-line @typescript-eslint/triple-slash-reference -- ensuring package consumers have access to the types
/// <reference path="./types/assimpjs.d.ts" />
// oxlint-disable-next-line @typescript-eslint/triple-slash-reference -- ensuring package consumers have access to the types
/// <reference path="./types/occt-import-js.d.ts" />

// Main conversion functions
export { convertFile, importToGlb, exportFromGlb } from '#conversion.js';

// Format validation and utility functions
export {
  getSupportedInputFormats,
  getSupportedOutputFormats,
  isInputFormatSupported,
  isOutputFormatSupported,
} from '#conversion.js';

// Direct access to import and export pipelines
export { importFiles } from '#import.js';
export { exportFiles } from '#export.js';

// Format metadata (lightweight, no loader dependencies)
export { supportedImportFormats, supportedExportFormats } from '#formats.js';

// Format metadata (re-exported from @taucad/types)
export { formatConfigurations } from '@taucad/types/constants';

// Transform utilities for downstream consumers (e.g. runtime middleware)
export {
  createCoordinateTransform,
  createScalingTransform,
  createReverseCoordinateTransform,
  createReverseScalingTransform,
} from '#gltf.transforms.js';

// Gltf-transform I/O utilities for downstream consumers (e.g. runtime middleware)
export { createNodeIo } from '#gltf.utils.js';
export { allExtensions } from '#gltf.extensions.js';
export { extractReferencedGltfUris } from '#gltf.dependencies.js';

// File resolver for on-demand sidecar asset loading
export type { FileResolver } from '#file-resolver.js';

// Types
export type { SupportedImportFormat, SupportedExportFormat } from '#formats.js';
