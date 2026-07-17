/* oxlint-disable jsdoc-js/sort-tags -- Tau JSDoc policy places visibility before parameters */
/** Render one GLB to an ordered tuple of owned image files. */

import { createExportFile } from '@taucad/types/constants';
import { RenderError } from '#render-error.js';
import type { RenderImageView, RenderImagesOptions, RenderedImages, StrictRenderImagesOptions } from '#options.js';
import { imageViewFileName, toImagesRequestJson } from '#options.js';
import { renderManyRaw } from '#renderer.js';

const serialize = (options: RenderImagesOptions): string => {
  try {
    return toImagesRequestJson(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RenderError('parse', `parse: ${message}`);
  }
};

/**
 * Render ordered identified camera views while parsing and uploading the GLB once.
 *
 * @public
 * @param glb - Binary glTF bytes with owned `ArrayBuffer` storage
 * @param options - Shared settings and the ordered views to render
 * @returns An ordered tuple whose IDs follow the input view tuple
 */
export const renderGlbToImages = async <const Options extends RenderImagesOptions>(
  glb: Uint8Array<ArrayBuffer>,
  options: StrictRenderImagesOptions<Options>,
): Promise<RenderedImages<Options['views']>> => {
  let outputs: ReadonlyArray<Uint8Array<ArrayBuffer>>;
  try {
    outputs = await renderManyRaw(glb, serialize(options));
  } catch (error) {
    throw RenderError.from(error);
  }

  if (outputs.length !== options.views.length) {
    throw new RenderError(
      'unknown',
      `renderer contract violation: expected ${options.views.length} images, received ${outputs.length}`,
    );
  }

  return (options.views as readonly RenderImageView[]).map((view, index) => ({
    id: view.id,
    file: createExportFile(
      options.format,
      imageViewFileName(view.id, options.format),
      Uint8Array.from(outputs[index]!),
    ),
  })) as RenderedImages<Options['views']>;
};
