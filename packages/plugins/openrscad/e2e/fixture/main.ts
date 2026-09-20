/**
 * Browser fixture for the OpenRSCAD USDZ e2e suite.
 *
 * Mirrors what `apps/ui` does: a runtime client over a dedicated web worker
 * that hosts `openrscad()` and `assimp()`, driven with the `.scad` source the
 * browser command hands the page before it loads, so both paths export the
 * same bytes. Nothing here is Node-aware — a Node-only module reachable from
 * `@taucad/openrscad` fails this bundle at build time, which is the packaging
 * regression this fixture exists to catch.
 */

import { createRuntimeClient } from '@taucad/runtime/client';
import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { trackEngineBackend } from '#e2e/backend-log.js';

/** Everything the Vitest spec and its Node-side command read back off the page. */
export type OpenrscadBrowserReport = {
  /** Engine payload the kernel bound, parsed from the runtime's own log line. */
  backend?: string;
  /** Every runtime log line, so a failure names what the runtime actually did. */
  logs: string[];
  /** Base64 USDZ, handed to the Node command for the round trip and comparison. */
  usdzBase64?: string;
  usdzByteLength?: number;
  /** First member of the USDZ archive — a USD package must open with its root layer. */
  firstEntryName?: string;
  error?: string;
};

const readSource = (): string => {
  const source: unknown = Reflect.get(globalThis, '__openrscadBrowserSource');
  if (typeof source !== 'string') {
    throw new TypeError('The browser command did not hand the page its .scad source.');
  }
  return source;
};

/**
 * Name of the archive's first member, read from its one local file header.
 *
 * USDZ is an uncompressed ZIP whose first entry must be the root `.usdc`/
 * `.usda` layer, so this is what separates a USD package from an arbitrary
 * archive that happens to start with `PK`.
 *
 * @param bytes - The USDZ archive.
 * @returns The name of its first entry.
 */
const zipFirstEntryName = (bytes: Uint8Array<ArrayBuffer>): string => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(26, true);
  return new TextDecoder().decode(bytes.subarray(30, 30 + nameLength));
};

const run = async (): Promise<OpenrscadBrowserReport> => {
  const source = readSource();
  const client = createRuntimeClient(
    createWebWorkerClientOptions({
      createWorker: () => new Worker(new URL('runtime.worker.ts', import.meta.url), { type: 'module' }),
      renderTimeout: 120_000,
    }),
  );
  const tracker = trackEngineBackend(client);

  try {
    const result = await client.export('usdz', { source: { files: { 'main.scad': source } } });
    if (!result.success) {
      throw new Error(`usdz export failed: ${result.issues.map((issue) => issue.message).join('; ')}`);
    }
    const bytes = new Uint8Array(result.data[0]!.bytes);
    return {
      backend: await tracker.backend(),
      logs: tracker.logs,
      usdzBase64: uint8ArrayToBase64(bytes),
      usdzByteLength: bytes.byteLength,
      firstEntryName: zipFirstEntryName(bytes),
    };
  } finally {
    client.terminate();
  }
};

const report = document.querySelector('#report');

/** Handshake key the Vitest Browser command reads back off the page. */
const browserReportKey = '__openrscadBrowserReport';

try {
  const result = await run();
  Reflect.set(globalThis, browserReportKey, result);
  if (report) {
    report.textContent = JSON.stringify({ ...result, usdzBase64: undefined });
  }
} catch (error) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  Reflect.set(globalThis, browserReportKey, { logs: [], error: message } satisfies OpenrscadBrowserReport);
  if (report) {
    report.textContent = JSON.stringify({ error: message });
  }
}
