import { expect, test } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const projectName = 'Thumbnail Generation E2E';

type ThumbnailState = {
  readonly digest: string;
  readonly width: number;
  readonly height: number;
};

async function openProjectThumbnail(): Promise<Locator> {
  await target.navigate('/projects', 'secondary');
  await target.fill(selectors.getByPlaceholder('Search projects...'), projectName, 'secondary');
  await target.expectVisible(selectors.getByRole('link', { name: `Open ${projectName}` }), 60_000, 'secondary');
  return selectors.getByRole('img', { name: projectName });
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

test('user project thumbnail generation follows nested settled sources and refreshes the mounted card', async ({
  skip,
}) => {
  const hasWebGpu = await target.evaluate(() => 'gpu' in navigator);
  skip(!hasWebGpu || server.browser !== 'chromium', 'WebGPU is not available in this browser runtime.');

  await target.navigate('/__e2e/user-project-thumbnail-generation');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  const widthInput = selectors.getByLabelText('Input for Width');
  await target.expectCount(widthInput, 1, 60_000);
  await target.expectVisible(selectors.getByRole('img', { name: /3d model preview/i }), 60_000);

  await target.openSecondary('/projects');
  try {
    const thumbnail = await openProjectThumbnail();
    let initialThumbnail: ThumbnailState | undefined;
    await expect
      .poll(
        async () => {
          initialThumbnail = await readGeneratedThumbnail(thumbnail);
          return initialThumbnail !== undefined;
        },
        { timeout: 120_000 },
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
          const candidate = await readGeneratedThumbnail(thumbnail);
          if (candidate && candidate.digest !== initialThumbnail!.digest) {
            updatedThumbnail = candidate;
          }
          return updatedThumbnail !== undefined;
        },
        { timeout: 120_000 },
      )
      .toBe(true);

    expect(updatedThumbnail).toMatchObject({ width: 768, height: 576 });

    await target.reload('secondary');
    await target.fill(selectors.getByPlaceholder('Search projects...'), projectName, 'secondary');
    await target.expectVisible(selectors.getByRole('link', { name: `Open ${projectName}` }), 60_000, 'secondary');
    const reloadedThumbnail = selectors.getByRole('img', { name: projectName });
    await expect
      .poll(
        async () => {
          const state = await readGeneratedThumbnail(reloadedThumbnail);
          return state?.digest;
        },
        { timeout: 60_000 },
      )
      .toBe(updatedThumbnail!.digest);
  } finally {
    await target.closeSecondary();
  }
});
