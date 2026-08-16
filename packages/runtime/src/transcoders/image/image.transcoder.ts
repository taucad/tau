/**
 * Image Transcoder
 *
 * Wraps nanoraster's `renderGlbToImage` (Rust/wgpu wasm+napi core) as a
 * transcoder plugin: kernel GLB → factor-only PBR PNG/WebP/JPEG thumbnail via the
 * runtime route planner. The renderer is lazy-imported per call so no GPU
 * device or wasm module is created until the first image export. Never throws —
 * a malformed GLB, missing adapter, or lost device is contained by the façade
 * and returned as a structured issue, leaving the caller to keep the last
 * thumbnail.
 *
 * Blueprints:
 * - docs/research/headless-thumbnail-rendering-architecture-v4.md
 * - docs/research/render-capture-overlay-annotations.md
 */

import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { imageEdgeSchemas } from '#transcoders/image/image-export-options.js';
import type * as Nanoraster from 'nanoraster';

/**
 * Static edges declared as a `readonly` tuple so each element keeps its literal
 * `to` type for {@link TranscodeInput} narrowing. Every edge carries an
 * `optionsSchema` from {@link imageEdgeSchemas}; a drift-guard test asserts the
 * tuple and that map stay in sync.
 */
const edges = [
  {
    from: 'glb',
    to: 'png',
    fidelity: 'mesh',
    optionsSchema: imageEdgeSchemas.png,
    content: ['includeEdges'],
    sourceOptions: { coordinateSystem: 'z-up', unit: { length: 'meter' } },
  },
  {
    from: 'glb',
    to: 'webp',
    fidelity: 'mesh',
    optionsSchema: imageEdgeSchemas.webp,
    content: ['includeEdges'],
    sourceOptions: { coordinateSystem: 'z-up', unit: { length: 'meter' } },
  },
  {
    from: 'glb',
    to: 'jpeg',
    fidelity: 'mesh',
    optionsSchema: imageEdgeSchemas.jpeg,
    content: ['includeEdges'],
    sourceOptions: { coordinateSystem: 'z-up', unit: { length: 'meter' } },
  },
] as const;

const rendererLoadErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.cause instanceof Error) {
    return error.cause.message;
  }
  return error instanceof Error ? error.message : String(error);
};

/** GLB-to-image transcoder with strict single and ordered batch modes. @public */
export const imageTranscoder = defineTranscoder({
  id: 'image',
  name: 'ImageTranscoder',
  version: '5.0.0',
  edges,

  async initialize() {
    // Keep bootstrap cheap: the renderer (wasm/napi) loads lazily on first export.
    return {};
  },

  async transcode(input, runtime) {
    if (input.files.length !== 1) {
      return {
        success: false,
        issues: [
          {
            message: `Image transcoding expected exactly one GLB source artifact, received ${input.files.length}`,
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }

    const glb = input.files[0]!.bytes;
    let renderer: typeof Nanoraster | undefined;

    try {
      const options = imageEdgeSchemas[input.to].parse(input.options);
      renderer = await import('nanoraster');
      const { renderGlbToImage, renderGlbToImages } = renderer;
      runtime.logger.log(`Rendering GLB → ${input.to}`);
      if (options.mode === 'batch') {
        const { mode: _, ...renderOptions } = options;
        const images = await renderGlbToImages(glb, { format: input.to, up: 'z', ...renderOptions });
        return { success: true, data: images.map(({ file }) => file), issues: [] };
      }

      const { mode: _, ...renderOptions } = options;
      const file = await renderGlbToImage(glb, { format: input.to, up: 'z', ...renderOptions });
      return { success: true, data: [file], issues: [] };
    } catch (error) {
      const renderError = renderer?.RenderError.from(error);
      return {
        success: false,
        issues: [
          {
            message: renderError?.message ?? rendererLoadErrorMessage(error),
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            details: { type: 'render', code: renderError?.code ?? 'unknown' },
          },
        ],
      };
    }
  },

  async cleanup() {
    // No resident resources: the core creates and drops its GPU device per render.
  },
});
