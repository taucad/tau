/**
 * Renders one project's thumbnail through a composed runtime client: the shared
 * pipeline for checked-in example thumbnails and workspace regeneration.
 */

import sharp from 'sharp';
import { asKnownArtifact } from '@taucad/runtime';
import type { createExampleRuntimeClient, createWorkspaceRuntimeClient } from '#scripts/runtime.js';

type ThumbnailClient =
  | Awaited<ReturnType<typeof createExampleRuntimeClient>>
  | Awaited<ReturnType<typeof createWorkspaceRuntimeClient>>;

/** Card thumbnails are 1536 × 1152: twice the largest card slot, so 2× displays stay sharp. */
export const thumbnailOptions = { width: 1536, height: 1152 } as const;
/** WebP quality for every generated thumbnail. */
export const thumbnailQuality = 0.95;
const thumbnailMargin = 0.1;

export const isWebp = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  bytes.byteLength >= 12 &&
  new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
  new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';

const renderSvgThumbnail = async (svg: string): Promise<Uint8Array<ArrayBuffer>> => {
  const { width, height } = thumbnailOptions;
  const foreground = await sharp(Buffer.from(svg))
    .resize({
      width: Math.round(width * (1 - 2 * thumbnailMargin)),
      height: Math.round(height * (1 - 2 * thumbnailMargin)),
      fit: 'contain',
    })
    .png()
    .toBuffer();
  const thumbnail = await sharp({
    create: { width, height, channels: 4, background: '#000' },
  })
    .composite([{ input: foreground, gravity: 'center' }])
    .webp({ quality: Math.round(thumbnailQuality * 100) })
    .toBuffer();
  return new Uint8Array(thumbnail);
};

/**
 * Evaluate `sourcePath` and render one WebP per requested edge width, in order.
 * Throws with the project label on any evaluation, render or export failure.
 */
export async function renderThumbnails(
  client: ThumbnailClient,
  {
    label,
    sourcePath,
    lineWidths,
    isExactLane = false,
  }: {
    readonly label: string;
    readonly sourcePath: string;
    readonly lineWidths: readonly number[];
    readonly isExactLane?: boolean;
  },
): Promise<Array<Uint8Array<ArrayBuffer>>> {
  const document = client.open({
    source: { path: sourcePath },
    watch: false,
    ...(isExactLane ? { evaluateOptions: { lane: 'exact' } } : {}),
  });
  let closeView: (() => void) | undefined;
  try {
    const evaluated = await document.evaluation();
    if (evaluated.superseded) {
      throw new Error(`Thumbnail evaluation was superseded for ${label}`);
    }
    const view =
      evaluated.evaluation.success && evaluated.evaluation.views.some(({ id }) => id === 'model')
        ? document.view('model', { content: { includeEdges: true } })
        : document.view();
    closeView = () => {
      view.close();
    };
    const outcome = await view.rendering();
    if (outcome.superseded) {
      throw new Error(`Thumbnail render failed for ${label}: render was superseded`);
    }
    const artifact = outcome.rendering.success ? asKnownArtifact(outcome.rendering.artifact) : undefined;
    if (artifact?.mimeType === 'image/svg+xml') {
      const bytes = await renderSvgThumbnail(artifact.content);
      return lineWidths.map(() => bytes);
    }
    const exported = await document.export('glb', { content: { includeEdges: true } });
    if (!exported.success) {
      throw new Error(
        `Thumbnail model export failed for ${label}: ${exported.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    const images: Array<Uint8Array<ArrayBuffer>> = [];
    for (const lineWidth of lineWidths) {
      // oxlint-disable-next-line no-await-in-loop -- Each variant has a distinct edge width on the shared render queue.
      const result = await client.transcode({
        from: 'glb',
        to: 'webp',
        files: [...exported.files],
        options: {
          mode: 'single',
          ...thumbnailOptions,
          lineWidth,
          camera: {
            framing: 'bounds',
            direction: [0.6123724357, -0.6123724357, 0.5],
            up: [0, 0, 1],
            margin: thumbnailMargin,
            projection: { kind: 'perspective', verticalFieldOfView: 45 },
          },
          quality: thumbnailQuality,
          ao: {},
        },
      });
      if (!result.success) {
        throw new Error(
          `Thumbnail export failed for ${label}: ${result.issues.map((issue) => issue.message).join('; ')}`,
        );
      }
      const thumbnail = result.data[0];
      if (result.data.length !== 1 || thumbnail?.mimeType !== 'image/webp' || !isWebp(thumbnail.bytes)) {
        throw new Error(
          `Thumbnail export expected exactly one valid image/webp artifact, received: ${result.data.map((file) => `${file.mimeType} (${file.bytes.length} bytes)`).join(', ')}`,
        );
      }
      images.push(thumbnail.bytes);
    }
    return images;
  } finally {
    closeView?.();
    document.close();
  }
}
