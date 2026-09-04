import { expect, it } from 'vitest';
import { writeGlb } from '@taucad/geometry-core';
import type { HeadlessCaptureProbeOutcome } from '#workers/headless-capture.probe.worker.js';
import { runEncodeProbe, runHeadlessCaptureProbe } from '#workers/headless-capture.probe.worker.js';

/**
 * Four bytes of `glTF` magic and no chunks: enough for the raster backend to
 * take the job and answer `Invalid glTF 2.0 binary.`, and not enough to make
 * this test depend on real geometry. What is under test is the *placement* —
 * the browser agent host's `screenshot` tool ran this recipe from inside a
 * worker and never returned at all, for 900 s, with no error
 * (`agent-host-transports-and-offline.md`, FIX-CHAT-SPEC escalation).
 */
const truncatedGlb = (): Uint8Array<ArrayBuffer> => new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

/** A megabyte, the order of magnitude of one lossless 1600² webp view. */
const captureSizedBytes = (): Uint8Array<ArrayBuffer> => new Uint8Array(1_048_576).fill(0x42);

/** A 20 mm cube — the geometry the recorded transcript's capture turn shoots. */
const cubeGlb = (): Uint8Array<ArrayBuffer> => {
  const half = 10;
  const corners: Array<readonly [number, number, number]> = [
    [-half, -half, -half],
    [half, -half, -half],
    [half, half, -half],
    [-half, half, -half],
    [-half, -half, half],
    [half, -half, half],
    [half, half, half],
    [-half, half, half],
  ];
  const faces: Array<{
    readonly corners: readonly [number, number, number, number];
    readonly normal: readonly [number, number, number];
  }> = [
    { corners: [0, 1, 2, 3], normal: [0, 0, -1] },
    { corners: [5, 4, 7, 6], normal: [0, 0, 1] },
    { corners: [4, 5, 1, 0], normal: [0, -1, 0] },
    { corners: [3, 2, 6, 7], normal: [0, 1, 0] },
    { corners: [1, 5, 6, 2], normal: [1, 0, 0] },
    { corners: [4, 0, 3, 7], normal: [-1, 0, 0] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const base = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(...corners[corner]!);
      normals.push(...face.normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return writeGlb({
    nodes: [
      {
        name: 'cube',
        primitives: [
          {
            mode: 4,
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            indices: new Uint32Array(indices),
            material: {
              baseColorFactor: [0.8, 0.8, 0.8, 1],
              metallicFactor: 0,
              roughnessFactor: 1,
              doubleSided: false,
              alphaMode: 'OPAQUE',
            },
          },
        ],
      },
    ],
  });
};

/** Milliseconds. Generous: a cold nested worker plus a WebGPU device is seconds, not a minute. */
const probeBudget = 60_000;

type ProbeRequest = {
  readonly mode?: 'encode';
  readonly recipe?: { readonly mode: 'single' | 'multi_angle'; readonly size: number };
  readonly content: Uint8Array<ArrayBuffer>;
};

const inWorker = async (request: ProbeRequest): Promise<HeadlessCaptureProbeOutcome | 'never-settled'> => {
  const worker = new Worker(new URL('headless-capture.probe.worker.ts', import.meta.url), {
    type: 'module',
    name: 'tau-headless-capture-probe',
  });
  try {
    const settled = Promise.withResolvers<HeadlessCaptureProbeOutcome>();
    worker.addEventListener('message', (event: MessageEvent<HeadlessCaptureProbeOutcome>) => {
      settled.resolve(event.data);
    });
    worker.addEventListener('error', (event) => {
      settled.reject(new Error(event.message || 'capture probe worker failed'));
    });
    worker.postMessage(request);
    return await Promise.race([
      settled.promise,
      new Promise<'never-settled'>((resolve) => {
        globalThis.setTimeout(() => {
          resolve('never-settled');
        }, probeBudget);
      }),
    ]);
  } finally {
    worker.terminate();
  }
};

it('settles a headless capture nested inside a worker exactly as it does on the page', async () => {
  expect('gpu' in navigator, 'this suite must launch chromium with --enable-unsafe-webgpu').toBe(true);

  const onPage = await runHeadlessCaptureProbe(truncatedGlb());
  const inside = await inWorker({ content: truncatedGlb() });

  // Pin the page control to the raster backend's own answer: an adapter or
  // option-validation refusal would never reach the worker and would make the
  // equality below vacuous.
  expect(onPage).toStrictEqual({ ok: false, message: 'Invalid glTF 2.0 binary.' });
  expect(inside).toStrictEqual(onPage);
}, 180_000);

it('encodes a capture-sized image to a data URL inside a worker', async () => {
  // A worker's stack is far smaller than the page's, and the capture encoder
  // used to spread 65 535 code points per chunk into `String.fromCodePoint` —
  // fine on the page, `RangeError: Maximum call stack size exceeded` in the
  // agent-host worker, which is what every `screenshot` returned.
  const onPage = runEncodeProbe(captureSizedBytes());
  const inside = await inWorker({ mode: 'encode', content: captureSizedBytes() });

  expect(onPage).toStrictEqual({ ok: true, mimeTypes: ['data:image/webp'] });
  expect(inside).toStrictEqual(onPage);
}, 120_000);

it('captures the six canonical views at full size inside a worker', async () => {
  // The recorded transcript's capture turn: `multi_angle` at 1600², six lossless
  // webp views out of one nested image worker. The page runs it as a control.
  const recipe = { mode: 'multi_angle', size: 1600 } as const;
  const onPage = await runHeadlessCaptureProbe(cubeGlb(), recipe);
  const inside = await inWorker({ recipe, content: cubeGlb() });

  expect(onPage).toStrictEqual({ ok: true, mimeTypes: Array.from({ length: 6 }, () => 'image/webp') });
  expect(inside).toStrictEqual(onPage);
}, 300_000);
