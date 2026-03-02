import type { ExportFile } from '#types/file.types.js';
import type { FileExtension } from '#types/mime-types.types.js';
import { mimeTypes } from '#constants/mime-types.constants.js';

/**
 * MIME type for file drags originating from the headless-tree file explorer.
 * Used by Dockview drop handlers to identify internal file drag-and-drop.
 */
export const tauFileDragMime = 'application/x-tau-file';

/**
 * MIME type set on editor panel tab drags for cross-dockview identification.
 * Payload: JSON-encoded `{ filePath: string }`.
 */
export const tauEditorPanelDragMime = 'application/x-tau-editor-panel';

/**
 * MIME type set on viewer panel tab drags for cross-dockview identification.
 * Payload: JSON-encoded `{ entryFile: string }`.
 */
export const tauViewerPanelDragMime = 'application/x-tau-viewer-panel';

/**
 * The export formats.
 */
export const exportFormats = [
  //
  'stl',
  'stl-binary',
  'step',
  'step-assembly',
  'glb',
  'gltf',
  '3mf',
] as const satisfies string[];

type ExportFormat = (typeof exportFormats)[number];

/**
 * Map of export formats to file extensions
 */
export const fileExtensionFromExportFormat = {
  stl: 'stl',
  'stl-binary': 'stl',
  step: 'step',
  'step-assembly': 'step',
  glb: 'glb',
  gltf: 'gltf',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- File format names don't follow camelCase
  '3mf': '3mf',
} as const satisfies Record<ExportFormat, FileExtension>;

type ExportFileExtension = (typeof fileExtensionFromExportFormat)[ExportFormat];

/**
 * Create an {@link ExportFile} with the MIME type auto-resolved from the export format.
 * Chains through {@link fileExtensionFromExportFormat} into {@link mimeTypes}.
 */
export function createExportFile(format: ExportFormat, name: string, bytes: Uint8Array<ArrayBuffer>): ExportFile {
  const extension: ExportFileExtension = fileExtensionFromExportFormat[format];
  return { name, bytes, mimeType: mimeTypes[extension] };
}
