import type { FileExtension } from '#types/mime-types.types.js';
import type { ExportFidelity } from '#types/cad.types.js';

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
 * Map of file extensions to their canonical {@link ExportFidelity}.
 *
 * Boundary representation (`brep`) is used for CAD interchange formats that
 * preserve exact topology (STEP, IGES, BREP). All other formats are treated
 * as tessellated `mesh` exports by default — see {@link lookupExportFidelity}.
 *
 * @public
 */
export const exportFidelities = {
  step: 'brep',
  stp: 'brep',
  iges: 'brep',
  igs: 'brep',
  brep: 'brep',
} as const satisfies Partial<Record<FileExtension, ExportFidelity>>;

/**
 * Resolve the canonical {@link ExportFidelity} for a given file extension.
 *
 * Returns `'brep'` for CAD interchange formats listed in {@link exportFidelities},
 * and `'mesh'` for everything else (mesh formats, animation formats, unknown
 * extensions). The default-to-`mesh` policy mirrors how downstream viewers
 * and toolchains treat unrecognised payloads.
 *
 * @param extension - File extension to classify (case-sensitive, no leading dot).
 * @returns The export fidelity, defaulting to `'mesh'` if not registered as `brep`.
 *
 * @example <caption>Classify a CAD interchange format</caption>
 * ```typescript
 * import { lookupExportFidelity } from '@taucad/types/constants';
 *
 * lookupExportFidelity('step'); // -> 'brep'
 * lookupExportFidelity('glb');  // -> 'mesh'
 * ```
 *
 * @public
 */
export const lookupExportFidelity = (extension: string): ExportFidelity =>
  (exportFidelities as Record<string, ExportFidelity | undefined>)[extension] ?? 'mesh';
