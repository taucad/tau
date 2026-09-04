/**
 * Test-only worker entry for `headless-capture-in-worker.browser.test.ts`.
 *
 * Runs one `HeadlessImageService` GLB capture from inside a dedicated
 * `Worker` — the placement the browser agent host's `screenshot` tool uses
 * (`agent-host.impl.ts` runs in a worker and the image runtime is nested
 * underneath it). The page-side control calls {@link runHeadlessCaptureProbe}
 * directly on the main thread, so the two outcomes are directly comparable.
 */

import { buildCaptureExportOptions, captureFilesToDataUrls } from '@taucad/agent-tools/capture';
import { HeadlessImageService } from '#services/headless-image.service.js';

export type HeadlessCaptureProbeOutcome =
  | { readonly ok: true; readonly mimeTypes: readonly string[] }
  | { readonly ok: false; readonly message: string };

/** One capture through the real service, reported as data rather than thrown. */
export const runHeadlessCaptureProbe = async (
  content: Uint8Array<ArrayBuffer>,
  requested?: { readonly mode: 'single' | 'multi_angle'; readonly size: number },
): Promise<HeadlessCaptureProbeOutcome> => {
  // 256 is the smallest the annotated recipe accepts; the `screenshot` tool
  // itself uses 1600, which the multi-angle leg drives for real.
  const recipe = requested ?? ({ mode: 'single', size: 256 } as const);
  const service = new HeadlessImageService();
  try {
    const files = await service.export({
      kind: 'capture',
      identity: `headless-capture-probe:${recipe.mode}:${String(recipe.size)}`,
      sourceFormat: 'glb',
      sourcePath: 'main.scad',
      geometryHash: 'probe',
      content,
      format: 'webp',
      exportOptions: buildCaptureExportOptions(recipe),
    });
    return { ok: true, mimeTypes: (files ?? []).map((file) => file.mimeType) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    service.dispose();
  }
};

/**
 * Encode capture-sized bytes the way the `screenshot` tool does. A 1600² webp
 * is megabytes, and the encoder is the last step between the raster backend and
 * the transcript.
 */
export const runEncodeProbe = (bytes: Uint8Array<ArrayBuffer>): HeadlessCaptureProbeOutcome => {
  try {
    const [dataUrl] = captureFilesToDataUrls([{ mimeType: 'image/webp', bytes }]);
    return { ok: true, mimeTypes: [dataUrl!.slice(0, dataUrl!.indexOf(';'))] };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
};

type ProbeRequest = {
  readonly mode?: 'capture' | 'encode';
  readonly recipe?: { readonly mode: 'single' | 'multi_angle'; readonly size: number };
  readonly content: Uint8Array<ArrayBuffer>;
};

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<ProbeRequest>) => void): void;
  postMessage(value: unknown): void;
};

const workerScope = globalThis as unknown as WorkerScope;

const respond = async (request: ProbeRequest): Promise<void> => {
  workerScope.postMessage(
    request.mode === 'encode'
      ? runEncodeProbe(request.content)
      : await runHeadlessCaptureProbe(request.content, request.recipe),
  );
};

/** The one probe this worker runs, held so its settlement is tracked rather than voided. */
let probe: Promise<void> | undefined;

workerScope.addEventListener('message', (event) => {
  probe ??= respond(event.data);
});
