import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  hasDarkGrayBackground,
  hasLosslessEncoding,
  readCaptureErrorToasts,
  readCaptureEvidence,
  seedVisionModel,
  waitForCaptureAttachments,
  waitForRenderedGeometry,
} from '#support/headless-capture.js';

test('SVG capture renders through resvg when no WebGPU adapter is usable', async () => {
  await seedVisionModel();
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/__e2e/headless-chat-image-capture?kind=svg');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  expect(target.currentWebGpuProfile()).toBe('disabled');
  const qualification = await target.qualifyWebGpu('disabled');
  expect(qualification.adapterAvailable).toBe(false);
  expect(qualification.qualificationErrors).toEqual([]);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);

  await target.expectVisible(selectors.getByRole('button', { name: 'Capture view to chat' }), 60_000);
  await waitForRenderedGeometry('svg');
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  await waitForCaptureAttachments(1);

  const evidence = await readCaptureEvidence(selectors.getByAltText('Uploaded 1'));
  expect(evidence).toMatchObject({ mimeType: 'image/png', width: 2400, height: 1350 });
  expect(hasLosslessEncoding(evidence)).toBe(true);
  expect(hasDarkGrayBackground(evidence)).toBe(true);
  expect(evidence.modelPixels).toBeGreaterThan(100);
  expect(evidence.topLeftPixels).toBeGreaterThan(20);
  expect(evidence.bottomLeftPixels).toBeGreaterThan(20);
  expect(evidence.bottomRightPixels).toBeGreaterThan(20);
  expect(await readCaptureErrorToasts()).toEqual([]);
});
