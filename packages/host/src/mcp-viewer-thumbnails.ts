/**
 * Part thumbnails for the viewer page's Model pane (workbench parity PAR-7). The page has no image renderer of its
 * own (an MCP Apps frame offers WebGL, not the WebGPU the image transcoder needs), so `tau mcp` renders the shown
 * GLB's parts through the project runtime's image transcoder, framed as the Tau app frames its part previews.
 */
import { readFile } from 'node:fs/promises';

import type { RuntimeClient } from '@taucad/runtime';
import type { TauMcpViewerFailure } from '@taucad/mcp';
import { z } from 'zod';

/** The page-only tool's name. */
export const viewerPartThumbnailsToolName = 'app_part_thumbnails';

/** Parts one call renders at most, as the Tau app batches them. */
export const partThumbnailBatchLimit = 4;

/** The largest square side a call may ask for, in CSS pixels; also the default. */
export const partThumbnailSizeLimit = 512;

/** The largest GLB the server renders thumbnails from, as the Tau app caps its source. */
const sourceByteLimit = 64 * 1024 * 1024;

const primitiveSchema = z
  .object({
    nodeIndex: z.number().int().nonnegative(),
    meshIndex: z.number().int().nonnegative(),
    primitiveIndex: z.number().int().nonnegative(),
  })
  .strict();

/** Arguments of `app_part_thumbnails`. */
export const viewerPartThumbnailsInputSchema = z
  .object({
    modelId: z.string().min(1).max(64),
    parts: z
      .array(
        z.object({ id: z.string().min(1).max(256), primitives: z.array(primitiveSchema).min(1).max(4096) }).strict(),
      )
      .min(1)
      .max(partThumbnailBatchLimit),
    size: z.number().int().min(64).max(partThumbnailSizeLimit).optional(),
  })
  .strict();

/** One rendered part: its component id and its WebP bytes, base64. */
export type ViewerPartThumbnail = Readonly<{ id: string; mimeType: 'image/webp'; data: string }>;

/** Structured result of `app_part_thumbnails`. */
export type ViewerPartThumbnailsResult = Readonly<{ thumbnails: readonly ViewerPartThumbnail[] }>;

/** The runtime surface thumbnails need: the image transcoder. */
export type ViewerThumbnailRuntime = Pick<RuntimeClient, 'transcode'>;

/** The shown model thumbnails are drawn from: a drawn file on disk, or a watched source's render in memory. */
export type ViewerThumbnailSource = Readonly<
  { absolutePath: string } | { bytes: Uint8Array<ArrayBuffer>; mimeType: string }
>;

/** Renders part thumbnails from a shown GLB, on disk or in memory. */
export type McpViewerPartThumbnails = (
  input: Readonly<{
    root: string;
    source: ViewerThumbnailSource;
    request: z.infer<typeof viewerPartThumbnailsInputSchema>;
    signal?: AbortSignal | undefined;
  }>,
) => Promise<ViewerPartThumbnailsResult | TauMcpViewerFailure>;

/** The Tau app's part preview camera: an isometric view from the front right, Z up. */
const partCamera = {
  framing: 'fit',
  direction: [0.6123724357, -0.6123724357, 0.5],
  up: [0, 0, 1],
  margin: 0.1,
  projection: { kind: 'perspective', verticalFieldOfView: 45 },
} as const;

const failure = (errorCode: string, message: string): TauMcpViewerFailure => ({ errorCode, message });

/**
 * Create the thumbnail renderer over each project's runtime.
 *
 * @param runtimeFor - The project runtime for a project folder.
 * @returns The renderer the viewer's `app_part_thumbnails` calls.
 */
export const createMcpViewerPartThumbnails =
  (runtimeFor: (root: string) => Promise<ViewerThumbnailRuntime>): McpViewerPartThumbnails =>
  async ({ root, source, request, signal }) => {
    const isGlb =
      'absolutePath' in source
        ? source.absolutePath.toLowerCase().endsWith('.glb')
        : source.mimeType === 'model/gltf-binary';
    if (!isGlb) {
      return failure('UNSUPPORTED_FORMAT', 'Only a shown GLB has parts to render.');
    }
    const bytes = 'absolutePath' in source ? new Uint8Array(await readFile(source.absolutePath)) : source.bytes;
    if (bytes.byteLength > sourceByteLimit) {
      return failure('RESULT_TOO_LARGE', 'The shown model is too large to render part thumbnails from.');
    }
    const size = request.size ?? partThumbnailSizeLimit;
    const runtime = await runtimeFor(root);
    const result = await runtime.transcode({
      from: 'glb',
      to: 'webp',
      files: [{ name: 'render.glb', mimeType: 'model/gltf-binary', bytes }],
      options: {
        mode: 'batch',
        width: size,
        height: size,
        quality: 0.95,
        /* The Tau app's line weight: 2 px at 512. */
        lineWidth: Math.max(1, Math.round((size / 512) * 2)),
        views: request.parts.map((part, index) => ({
          id: `part-${String(index)}`,
          visiblePrimitives: part.primitives.map((primitive) => ({ ...primitive })),
          camera: { ...partCamera, direction: [...partCamera.direction], up: [...partCamera.up] },
        })),
      },
      ...(signal === undefined ? {} : { signal }),
    });
    if (!result.success) {
      return failure('RENDER_FAILED', result.issues[0]?.message ?? 'The part thumbnails could not be rendered.');
    }
    const byName = new Map(result.data.map((file) => [file.name, file]));
    return {
      thumbnails: request.parts.flatMap((part, index): ViewerPartThumbnail[] => {
        const file = byName.get(`render-part-${String(index)}.webp`);
        return file === undefined || file.bytes.byteLength === 0
          ? []
          : [{ id: part.id, mimeType: 'image/webp', data: Buffer.from(file.bytes).toString('base64') }];
      }),
    };
  };
