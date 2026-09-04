import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { foregroundMaskIntersectionOverUnion, measureProjectCardForeground } from '#support/project-card-framing.js';

const projectName = 'Thumbnail Generation E2E';
const curvedProjectName = 'Thumbnail Curved Parity E2E';

type ThumbnailState = {
  readonly digest: string;
  readonly width: number;
  readonly height: number;
};

async function openProjectThumbnail(name = projectName): Promise<Locator> {
  await target.navigate('/projects', 'secondary');
  await target.fill(selectors.getByPlaceholder('Search projects...'), name, 'secondary');
  const thumbnail = selectors.getByRole('img', { name, exact: true });
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

async function expectProjectCardParity(name: string, minimumMaskIoU = 0.94): Promise<void> {
  await expect
    .poll(
      async () => {
        const thumbnail = await openProjectThumbnail(name);
        const state = await readGeneratedThumbnail(thumbnail);
        return state?.digest;
      },
      { timeout: 120_000, interval: 1000 },
    )
    .toBeTypeOf('string');

  const card = `[data-slot="card"]:has(img[alt="${name}"])`;
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
  expect(foregroundMaskIntersectionOverUnion(thumbnailForeground!, previewForeground!)).toBeGreaterThanOrEqual(
    minimumMaskIoU,
  );
}

test('user project thumbnails follow settled sources, persist, and match the live card preview', async () => {
  await target.navigate('/__e2e/user-project-thumbnail-generation');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?graphicsBackend=webgpu$/u, 60_000);
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions...'), 'Open parameters');
  await target.click(selectors.getByText('Open parameters', { exact: true }));
  const widthInput = selectors.getByLabelText('Input for Width');
  await target.expectCount(widthInput, 1, 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.expectGraphicsBackend('webgpu');

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
    await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
    await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions...'), 'Update thumbnail');
    await target.click(selectors.getByText('Update thumbnail', { exact: true }));
    /* The operation's terminal state, not its progress. `toast.promise` shows
     * this only once `regenerateThumbnail()` resolves, and it throws on a
     * skipped or failed result (`project-command-items.tsx`), so reaching it is
     * the proof that the command really regenerated. The progress toast this
     * used to wait on is not an observable: against a warm render the promise
     * can settle inside a single poll round trip, so the label was already gone
     * — which is why this leg failed about half the time.
     *
     * The card on the secondary surface cannot serve as the observable either:
     * its object URL is minted per `thumbnail.webp` write, but the write
     * happens in the primary tab and the change channel is per-tab, so a
     * measured 120 s of polling never saw it change. */
    await target.expectVisible(selectors.getByText('Thumbnail updated', { exact: true }), 120_000);

    // Regeneration is deterministic: re-rendering the same settled source is
    // byte-identical, and the bytes survive a fresh load of the projects page.
    const reloadedThumbnail = await openProjectThumbnail();
    await expect
      .poll(
        async () => {
          const state = await readGeneratedThumbnail(reloadedThumbnail);
          return state?.digest;
        },
        { timeout: 60_000 },
      )
      .toBe(updatedThumbnail!.digest);

    await expectProjectCardParity(projectName);
  } finally {
    await target.closeSecondary();
  }
});

test('curved user project thumbnail matches the live AABB-framed card preview', async () => {
  await target.navigate('/__e2e/user-project-thumbnail-generation?fixture=curved');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?graphicsBackend=webgpu$/u, 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.expectGraphicsBackend('webgpu');
  await target.openSecondary('/projects');
  try {
    // The pale curved surface crosses the two renderers' foreground-color threshold differently,
    // while center and extent retain the strict framing tolerances above.
    await expectProjectCardParity(curvedProjectName, 0.85);
  } finally {
    await target.closeSecondary();
  }
});
