import { expect, test } from 'vitest';
import * as target from '#support/external-target.js';
import type { CaptureEvidence } from '#support/headless-capture.js';
import {
  hasDarkGrayBackground,
  hasLosslessEncoding,
  readBase64CaptureEvidence,
  seedVisionModel,
  waitForRenderedGeometry,
} from '#support/headless-capture.js';

type CaptureInput = {
  readonly mode: 'single' | 'multi_angle';
  readonly targetFile: string;
  readonly includeEdges?: boolean;
};
type CaptureResult =
  | { readonly success: true; readonly images: ReadonlyArray<{ readonly view: string; readonly dataUrl: string }> }
  | { readonly success: false; readonly errorCode: string; readonly message: string };
type SectionCutValues =
  | Readonly<{ kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }>
  | Readonly<{
      kind: 'revolution';
      axis: 'x' | 'y' | 'z';
      origin: readonly [number, number, number];
      start: number;
      sweep: number;
    }>;

const captureImages = async (input: CaptureInput): Promise<CaptureResult> =>
  target.evaluate(async (request) => {
    const capture = (globalThis as unknown as { __tauCaptureImages?: (value: CaptureInput) => Promise<CaptureResult> })
      .__tauCaptureImages;
    if (!capture) {
      throw new Error('Capture image RPC bridge is not ready');
    }
    return capture(request);
  }, input);

const readDataUrlEvidence = async (dataUrl: string): Promise<CaptureEvidence> => {
  const [metadata, base64] = dataUrl.split(',', 2);
  const mimeType = /^data:([^;]+);base64$/u.exec(metadata ?? '')?.[1];
  if (!mimeType || !base64) {
    throw new Error('Capture RPC returned a malformed data URL');
  }
  return readBase64CaptureEvidence(base64, mimeType);
};

const captureSectionCuts = async (cutLists: ReadonlyArray<readonly SectionCutValues[]>): Promise<string[]> =>
  target.evaluate(async (lists) => {
    const capture = (
      globalThis as unknown as {
        __tauCaptureSectionCuts?: (value: ReadonlyArray<readonly SectionCutValues[]>) => Promise<string[]>;
      }
    ).__tauCaptureSectionCuts;
    if (!capture) {
      throw new Error('Section cut capture probe is not ready');
    }
    return capture(lists);
  }, cutLists);

const expectAnnotated = (evidence: CaptureEvidence, mimeType: string): void => {
  expect(evidence).toMatchObject({ mimeType, width: 1600, height: 1600 });
  expect(hasLosslessEncoding(evidence), `Expected lossless bytes, received ${evidence.encoding}`).toBe(true);
  expect(
    hasDarkGrayBackground(evidence),
    `Expected dark gray background, received ${JSON.stringify(evidence.background)}`,
  ).toBe(true);
  expect(evidence.modelPixels).toBeGreaterThan(100);
  expect(evidence.topLeftPixels).toBeGreaterThan(20);
  expect(evidence.bottomLeftPixels).toBeGreaterThan(20);
  expect(evidence.bottomRightPixels).toBeGreaterThan(20);
};

test('agent RPC uses the real service for GLTF single and ordered six-view capture', async () => {
  await seedVisionModel();
  await target.navigate('/__e2e/headless-chat-image-capture');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await waitForRenderedGeometry('gltf');
  await target.waitFor(
    () => typeof (globalThis as unknown as { __tauCaptureImages?: unknown }).__tauCaptureImages === 'function',
    undefined,
    { timeout: 60_000 },
  );

  const single = await captureImages({ mode: 'single', targetFile: 'src/main.ts' });
  if (!single.success) {
    throw new Error(single.message);
  }
  expect(single.images.map(({ view }) => view)).toEqual(['isometric']);
  expectAnnotated(await readDataUrlEvidence(single.images[0]!.dataUrl), 'image/webp');

  const multiple = await captureImages({ mode: 'multi_angle', targetFile: 'src/main.ts', includeEdges: false });
  if (!multiple.success) {
    throw new Error(multiple.message);
  }
  expect(multiple.images.map(({ view }) => view)).toEqual(['front', 'back', 'right', 'left', 'top', 'bottom']);
  const evidence: CaptureEvidence[] = [];
  for (const image of multiple.images) {
    // oxlint-disable-next-line no-await-in-loop -- Ordered RPC artifacts are decoded independently.
    evidence.push(await readDataUrlEvidence(image.dataUrl));
  }
  for (const candidate of evidence) {
    expectAnnotated(candidate, 'image/webp');
  }
  expect(new Set(evidence.map(({ digest }) => digest)).size).toBe(6);
});

test('agent RPC returns an SVG drawing and rejects planar multi-angle capture', async () => {
  await seedVisionModel();
  await target.navigate('/__e2e/headless-chat-image-capture?kind=svg');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await waitForRenderedGeometry('svg');
  await target.waitFor(
    () => typeof (globalThis as unknown as { __tauCaptureImages?: unknown }).__tauCaptureImages === 'function',
    undefined,
    { timeout: 60_000 },
  );

  const single = await captureImages({ mode: 'single', targetFile: 'src/main.ts' });
  if (!single.success) {
    throw new Error(single.message);
  }
  expect(single.images.map(({ view }) => view)).toEqual(['drawing']);
  expectAnnotated(await readDataUrlEvidence(single.images[0]!.dataUrl), 'image/png');

  await expect(captureImages({ mode: 'multi_angle', targetFile: 'src/main.ts' })).resolves.toEqual({
    success: false,
    errorCode: 'IO_ERROR',
    message: 'Planar SVG drawings have one canonical view; use a single drawing capture',
  });
});

test('should capture a section of one and of two plane cuts through the packaged browser worker', async () => {
  await seedVisionModel();
  await target.navigate('/__e2e/headless-chat-image-capture');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await waitForRenderedGeometry('gltf');
  await target.waitFor(
    () =>
      typeof (globalThis as unknown as { __tauCaptureSectionCuts?: unknown }).__tauCaptureSectionCuts === 'function',
    undefined,
    { timeout: 60_000 },
  );

  // Unflipped planes through the origin remove their +X and +Y sides.
  const yz: SectionCutValues = { kind: 'plane', plane: 'yz', offset: 0, isFlipped: false };
  const xz: SectionCutValues = { kind: 'plane', plane: 'xz', offset: 0, isFlipped: false };
  const [uncut, oneCut, twoCuts] = await captureSectionCuts([[], [yz], [yz, xz]]);
  // One at a time: each read decodes its image into the same page element.
  const uncutEvidence = await readDataUrlEvidence(uncut!);
  const oneCutEvidence = await readDataUrlEvidence(oneCut!);
  const twoCutsEvidence = await readDataUrlEvidence(twoCuts!);
  const evidence = [uncutEvidence, oneCutEvidence, twoCutsEvidence];
  for (const candidate of evidence) {
    expectAnnotated(candidate, 'image/webp');
  }
  expect(new Set(evidence.map(({ digest }) => digest)).size).toBe(3);
  expect(oneCutEvidence.modelPixels).toBeLessThan(uncutEvidence.modelPixels);
  expect(twoCutsEvidence.modelPixels).toBeLessThan(oneCutEvidence.modelPixels);
});
