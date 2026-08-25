/**
 * Image Transcoder
 *
 * Wraps nanoraster's `renderImage` (Rust/wgpu wasm+napi core) as a
 * transcoder plugin: kernel GLB → factor-only PBR PNG/WebP/JPEG thumbnail via the
 * runtime route planner. The renderer module is loaded once during capability
 * initialization and retained in context; its free functions serialize onto one
 * lazily created renderer per process, so every render after the first reuses a
 * warm GPU device. Rendering never throws through the façade —
 * a malformed GLB, missing adapter, or lost device is contained by the façade
 * and returned as a structured issue, leaving the caller to keep the last
 * thumbnail.
 *
 * Blueprints:
 * - docs/research/headless-thumbnail-rendering-architecture-v4.md
 * - docs/research/render-capture-overlay-annotations.md
 */

import type * as Nanoraster from 'nanoraster';
import { defineTranscoder } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import { loadImageBackend } from '#image-backend.js';
import { imageEdgeSchemas } from '#image-export-options.js';

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

const toExportFile = ({ name, bytes, mimeType }: Nanoraster.RenderedImageFile): ExportFile => ({
  name,
  bytes,
  mimeType,
});

/** GLB-to-image transcoder with strict single and ordered batch modes. @public */
export const imageTranscoder = defineTranscoder({
  id: 'image',
  name: 'ImageTranscoder',
  // Bump whenever the renderer's output bytes change for identical input, or
  // persisted export caches keep serving images from the previous renderer.
  // 7.0.0 = nanoraster 0.4.x, whose restored deterministic Huffman tie-break
  // changes lossless WebP bytes once while making native and WASM output agree.
  version: '7.0.0',
  edges,

  async initialize() {
    return { renderer: await loadImageBackend() };
  },

  async transcode(input, runtime, context: { renderer: typeof Nanoraster }) {
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
    try {
      const options = imageEdgeSchemas[input.to].parse(input.options);
      const { renderImage, renderImages } = context.renderer;
      runtime.logger.log(`Rendering GLB → ${input.to}`);
      if (options.mode === 'batch') {
        const { mode: _, views, ...renderOptions } = options;
        const images = await renderImages(glb, {
          format: input.to,
          up: 'z',
          ...renderOptions,
          views,
        });
        return { success: true, data: images.map(({ file }) => toExportFile(file)), issues: [] };
      }

      const { mode: _, ...renderOptions } = options;
      const file = await renderImage(glb, {
        format: input.to,
        up: 'z',
        ...renderOptions,
      });
      return { success: true, data: [toExportFile(file)], issues: [] };
    } catch (error) {
      const renderError = context.renderer.RenderError.from(error);
      return {
        success: false,
        issues: [
          {
            message: renderError.message,
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            details: { type: 'render', code: renderError.code },
          },
        ],
      };
    }
  },

  async cleanup() {
    // Nothing to release here. nanoraster's free functions share one lazy
    // renderer per process, so the GPU device stays resident for the worker's
    // lifetime (warm after the first render) and is reclaimed when the worker
    // exits; oversized render targets are evicted by the library itself.
  },
});
