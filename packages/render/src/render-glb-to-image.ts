/* oxlint-disable jsdoc-js/sort-tags -- Tau JSDoc policy places visibility before parameters */
/** Render one GLB view to one owned image file. */

import type { ExportFile } from '@taucad/types';
import { createExportFile } from '@taucad/types/constants';
import { RenderError } from '#render-error.js';
import type { RenderImageOptions } from '#options.js';
import { imageFileName, toImageRequestJson } from '#options.js';
import { renderRaw } from '#renderer.js';

const serialize = (options: RenderImageOptions): string => {
  try {
    return toImageRequestJson(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RenderError('parse', `parse: ${message}`);
  }
};

/**
 * Render a kernel GLB to one owned `thumbnail.<format>` image.
 *
 * @public
 * @param glb - Binary glTF bytes with owned `ArrayBuffer` storage
 * @param options - Camera, format, background, and optional axis-indicator settings
 * @returns The encoded image file
 */
export const renderGlbToImage = async (
  glb: Uint8Array<ArrayBuffer>,
  options: RenderImageOptions,
): Promise<ExportFile> => {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await renderRaw(glb, serialize(options));
  } catch (error) {
    throw RenderError.from(error);
  }
  return createExportFile(options.format, imageFileName(options.format), Uint8Array.from(bytes));
};
