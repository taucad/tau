import { expect, test } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { foregroundMaskIntersectionOverUnion, measureProjectCardForeground } from '#support/project-card-framing.js';

const projectName = 'Thumbnail Generation E2E';

type ThumbnailState = {
  readonly digest: string;
  readonly width: number;
  readonly height: number;
};

async function openProjectThumbnail(): Promise<Locator> {
  await target.navigate('/projects', 'secondary');
  await target.fill(selectors.getByPlaceholder('Search projects...'), projectName, 'secondary');
  const thumbnail = selectors.getByRole('img', { name: projectName });
  await target.expectVisible(thumbnail, 60_000, 'secondary');
  return thumbnail;
}

async function readGeneratedThumbnail(image: Locator): Promise<ThumbnailState | undefined> {
  return target.evaluateLocator(
    image,
    async (element) => {
      const imageElement = element as HTMLImageElement;
      const source = imageElement.currentSrc || imageElement.src;
      if (!imageElement.complete || source.endsWith('/placeholder.svg') || imageElement.naturalWidth === 0) {
        return undefined;
      }

      const response = await fetch(source);
      const bytes = await response.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

      return {
        digest: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
        width: imageElement.naturalWidth,
        height: imageElement.naturalHeight,
      };
    },
    undefined,
    'secondary',
  );
}

test('user project thumbnails follow settled sources, persist, and match the live card preview', async ({ skip }) => {
  await target.navigate('/__e2e/user-project-thumbnail-generation');
  const hasWebGpu = await target.evaluate(() => 'gpu' in navigator);
  skip(!hasWebGpu || server.browser !== 'chromium', 'WebGPU is not available in this browser runtime.');

  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions...'), 'Open parameters');
  await target.click(selectors.getByText('Open parameters', { exact: true }));
  const widthInput = selectors.getByLabelText('Input for Width');
  await target.expectCount(widthInput, 1, 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);

  await target.openSecondary('/projects');
  try {
    let initialThumbnail: ThumbnailState | undefined;
    await expect
      .poll(
        async () => {
          initialThumbnail = await readGeneratedThumbnail(await openProjectThumbnail());
          return initialThumbnail !== undefined;
        },
        { timeout: 120_000, interval: 1000 },
      )
      .toBe(true);

    expect(initialThumbnail).toMatchObject({ width: 768, height: 576 });

    await target.focus(widthInput);
    await target.fill(widthInput, '32');
    await target.press(widthInput, 'Enter');
    await target.expectValue(widthInput, '32');

    let updatedThumbnail: ThumbnailState | undefined;
    await expect
      .poll(
        async () => {
          const candidate = await readGeneratedThumbnail(await openProjectThumbnail());
          if (candidate && candidate.digest !== initialThumbnail!.digest) {
            updatedThumbnail = candidate;
          }
          return updatedThumbnail !== undefined;
        },
        { timeout: 120_000, interval: 1000 },
      )
      .toBe(true);

    expect(updatedThumbnail).toMatchObject({ width: 768, height: 576 });

    await target.reload('secondary');
    await target.fill(selectors.getByPlaceholder('Search projects...'), projectName, 'secondary');
    const reloadedThumbnail = selectors.getByRole('img', { name: projectName });
    await target.expectVisible(reloadedThumbnail, 60_000, 'secondary');
    await expect
      .poll(
        async () => {
          const state = await readGeneratedThumbnail(reloadedThumbnail);
          return state?.digest;
        },
        { timeout: 60_000 },
      )
      .toBe(updatedThumbnail!.digest);

    const card = `[data-slot="card"]:has(img[alt="${projectName}"])`;
    const toggle = `${card} button[aria-label="Preview model"]`;
    const media = `${card} div:has(> button[aria-label="Preview model"])`;
    const thumbnailForeground = await measureProjectCardForeground(media, 'secondary');
    expect(thumbnailForeground?.pixels).toBeGreaterThan(100);

    await target.click(toggle, undefined, 'secondary');
    const activeMedia = 'div:has(> button[aria-label="Preview model"][aria-pressed="true"])';
    await target.expectVisible(`${activeMedia} canvas`, 60_000, 'secondary');
    let previewForeground: Awaited<ReturnType<typeof measureProjectCardForeground>>;
    await expect
      .poll(
        async () => {
          previewForeground = await measureProjectCardForeground(activeMedia, 'secondary');
          return previewForeground?.pixels ?? 0;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(100);

    expect(thumbnailForeground).toBeDefined();
    expect(previewForeground).toBeDefined();
    expect(Math.abs(previewForeground!.centerX - thumbnailForeground!.centerX)).toBeLessThanOrEqual(3);
    expect(Math.abs(previewForeground!.centerY - thumbnailForeground!.centerY)).toBeLessThanOrEqual(3);
    expect(Math.abs(previewForeground!.width - thumbnailForeground!.width)).toBeLessThanOrEqual(
      Math.max(4, thumbnailForeground!.width * 0.015),
    );
    expect(Math.abs(previewForeground!.height - thumbnailForeground!.height)).toBeLessThanOrEqual(
      Math.max(4, thumbnailForeground!.height * 0.015),
    );
    expect(foregroundMaskIntersectionOverUnion(thumbnailForeground!, previewForeground!)).toBeGreaterThanOrEqual(0.94);
  } finally {
    await target.closeSecondary();
  }
});
