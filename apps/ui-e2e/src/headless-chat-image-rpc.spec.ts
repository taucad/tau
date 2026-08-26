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
type SectionPlanePair = Readonly<{ onePlane: string; twoPlanes: string }>;

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

const captureSectionPlanePair = async (): Promise<SectionPlanePair> =>
  target.evaluate(async () => {
    const capture = (globalThis as unknown as { __tauCaptureSectionPlanePair?: () => Promise<SectionPlanePair> })
      .__tauCaptureSectionPlanePair;
    if (!capture) {
      throw new Error('Section plane package bridge is not ready');
    }
    return capture();
  });

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

test('packaged browser worker transports a two-plane section request', async () => {
  await seedVisionModel();
  await target.navigate('/__e2e/headless-chat-image-capture');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await waitForRenderedGeometry('gltf');
  await target.waitFor(
    () =>
      typeof (globalThis as unknown as { __tauCaptureSectionPlanePair?: unknown }).__tauCaptureSectionPlanePair ===
      'function',
    undefined,
    { timeout: 60_000 },
  );

  const pair = await captureSectionPlanePair();
  const onePlane = await readDataUrlEvidence(pair.onePlane);
  const twoPlanes = await readDataUrlEvidence(pair.twoPlanes);
  for (const evidence of [onePlane, twoPlanes]) {
    expect(evidence).toMatchObject({ mimeType: 'image/png', encoding: 'png', width: 512, height: 512 });
    expect(evidence.modelPixels).toBeGreaterThan(50);
  }
  expect(twoPlanes.digest).not.toBe(onePlane.digest);
  expect(twoPlanes.modelPixels).toBeLessThan(onePlane.modelPixels);
});
