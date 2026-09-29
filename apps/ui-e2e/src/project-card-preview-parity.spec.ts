import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { measureProjectCardForeground } from '#support/project-card-framing.js';

test('project card thumbnail and preview parity', async () => {
  await target.setViewport({ width: 1440, height: 1000 });
  await target.navigate('/community');
  const search = selectors.getByRole('searchbox', { name: 'Search examples' });
  await target.expectVisible(search, 60_000);
  await target.fill(search, 'Cycloidal Gear');

  /* The card is named by its link ("Open <name>"); the thumbnail beside the heading is decorative. */
  const card = '[data-slot="card"]:has(a:has-text("Open Cycloidal Gear"))';
  const thumbnail = selectors.getByCss(`${card} img`);
  await target.expectVisible(thumbnail);
  await expect
    .poll(async () =>
      target.evaluateLocator(thumbnail, (element) => {
        const image = element as HTMLImageElement;
        return image.complete ? { width: image.naturalWidth, height: image.naturalHeight } : undefined;
      }),
    )
    .toEqual({ width: 1536, height: 1152 });

  const toggle = `${card} button[aria-label="Preview model"]`;
  const media = `${card} div:has(> button[aria-label="Preview model"])`;
  const thumbnailBounds = await measureProjectCardForeground(media);
  expect(thumbnailBounds?.pixels).toBeGreaterThan(100);

  await target.click(toggle);
  const activeMedia = 'div:has(> button[aria-label="Preview model"][aria-pressed="true"])';
  await target.expectVisible(`${activeMedia} canvas`, 60_000);

  let previewBounds: Awaited<ReturnType<typeof measureProjectCardForeground>>;
  await expect
    .poll(
      async () => {
        previewBounds = await measureProjectCardForeground(activeMedia);
        return previewBounds?.pixels ?? 0;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(100);

  expect(thumbnailBounds).toBeDefined();
  expect(previewBounds).toBeDefined();
  const centerTolerance = 3;
  const widthTolerance = Math.max(4, thumbnailBounds!.width * 0.015);
  const heightTolerance = Math.max(4, thumbnailBounds!.height * 0.015);
  expect(Math.abs(previewBounds!.centerX - thumbnailBounds!.centerX)).toBeLessThanOrEqual(centerTolerance);
  expect(Math.abs(previewBounds!.centerY - thumbnailBounds!.centerY)).toBeLessThanOrEqual(centerTolerance);
  expect(Math.abs(previewBounds!.width - thumbnailBounds!.width)).toBeLessThanOrEqual(widthTolerance);
  expect(Math.abs(previewBounds!.height - thumbnailBounds!.height)).toBeLessThanOrEqual(heightTolerance);
});
