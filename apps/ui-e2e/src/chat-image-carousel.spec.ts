/* oxlint-disable no-await-in-loop -- Carousel key presses and their observable states are deliberately sequential. */
import { beforeEach, describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const carouselRegionName = 'Image preview carousel';
const imageCount = 5;

const expectVisibleDialogImage = async (imageNumber: number): Promise<void> => {
  await target.expectVisible(selectors.getByText(`${imageNumber} / ${imageCount}`, { exact: true }));
  await expect
    .poll(
      async () =>
        target.evaluate(() => {
          const element = document.elementFromPoint(
            Math.floor(window.innerWidth / 2),
            Math.floor(window.innerHeight / 2),
          );
          const image = element instanceof Element ? element.closest('img') : null;
          return image?.getAttribute('alt') ?? null;
        }),
      { message: `center hit-test should resolve to full dialog image ${imageNumber}` },
    )
    .toBe(`Uploaded ${imageNumber}`);
};

const openComposerImage = async (imageNumber: number): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: `Open uploaded image ${imageNumber}` }));
  const carousel = selectors.getByRole('region', { name: carouselRegionName });
  await target.expectVisible(carousel);
  await target.expectFocused(carousel);
  await expectVisibleDialogImage(imageNumber);
};

const closeCarousel = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Close image preview' }));
  await target.expectHidden(selectors.getByRole('region', { name: carouselRegionName }));
};

describe('chat image carousel', () => {
  beforeEach(async () => {
    await target.navigate('/__e2e/chat-image-carousel');
  });

  test('should keep images visible after looping forward through five composer images', async () => {
    await openComposerImage(1);
    for (const imageNumber of [2, 3, 4, 5, 1, 2]) {
      await target.keyboardPress('ArrowRight');
      await expectVisibleDialogImage(imageNumber);
    }
  });

  test('should keep images visible after immediately looping backward from the first composer image', async () => {
    await openComposerImage(1);
    await closeCarousel();
    await openComposerImage(1);
    for (const imageNumber of [5, 4, 3, 2, 1]) {
      await target.keyboardPress('ArrowLeft');
      await expectVisibleDialogImage(imageNumber);
    }
  });
});
