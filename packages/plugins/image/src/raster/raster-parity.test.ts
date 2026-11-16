/**
 * Host parity (a): every fixture runs through `client.transcode` over the node-worker transport and must produce
 * the bytes recorded in `golden.json`. The same corpus and file back the browser and Electron parity checks; a
 * golden hash changes only with a codec release or an encode setting, together with the transcoder's version.
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import { probeImage } from '@taucad/utils/image-probe';

type GoldenCase = {
  readonly fixture: string;
  readonly from: string;
  readonly to: string;
  readonly options: Record<string, unknown>;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
};

const golden = JSON.parse(readFileSync(new URL('fixtures/golden.json', import.meta.url), 'utf8')) as {
  readonly cases: readonly GoldenCase[];
};

/** The worker entry is TypeScript in this workspace, so the worker thread loads it through tsx. */
class TsxWorker extends NodeWorker {
  public constructor(url: string | URL) {
    super(url, { execArgv: ['--import', 'tsx'] });
  }
}

describe('raster transcoder host parity (Node, node-worker transport)', () => {
  let root: string;
  let client: ReturnType<typeof createRuntimeClient>;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-raster-parity-'));
    client = createRuntimeClient({
      transport: nodeWorkerTransport({
        url: new URL('testing/raster-node-runtime.ts', import.meta.url),
        fileSystem: fromNodeFs(root),
        workerCtor: TsxWorker,
      }),
    });
  });

  afterAll(async () => {
    await client.shutdown();
    await rm(root, { recursive: true, force: true });
  });

  it('should cover every source format and every target format', () => {
    expect(new Set(golden.cases.map(({ from }) => from))).toEqual(
      new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff']),
    );
    expect(new Set(golden.cases.map(({ to }) => to))).toEqual(new Set(['jpeg', 'png', 'webp']));
  });

  it.each(
    golden.cases.map((entry) => [`${entry.fixture} → ${entry.to} ${JSON.stringify(entry.options)}`, entry] as const),
  )('should reproduce the golden output of %s', async (_label, entry) => {
    const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${entry.fixture}`, import.meta.url)));
    const result = await client.transcode({
      from: entry.from,
      to: entry.to,
      files: [{ name: entry.fixture, bytes, mimeType: 'application/octet-stream' }],
      options: entry.options,
    });
    if (!result.success) {
      expect.fail(result.issues.map(({ message }) => message).join('; '));
    }
    const [output] = result.data;
    const probe = probeImage(output!.bytes);
    expect({
      sha256: createHash('sha256').update(output!.bytes).digest('hex'),
      width: probe?.width,
      height: probe?.height,
      format: probe?.format,
    }).toEqual({ sha256: entry.sha256, width: entry.width, height: entry.height, format: entry.to });
  });
});
