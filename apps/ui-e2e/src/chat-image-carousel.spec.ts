import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const carouselRegionName = 'Image preview carousel';
const imageCount = 5;

async function openComposerImage(page: Page, imageNumber: number): Promise<void> {
  await page.getByRole('button', { name: `Open uploaded image ${imageNumber}` }).click();

  const carousel = page.getByRole('region', { name: carouselRegionName });
  await expect(carousel).toBeVisible();
  await expect(carousel).toBeFocused();
  await expectVisibleDialogImage(page, imageNumber);
}

async function closeCarousel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close image preview' }).click();
  await expect(page.getByRole('region', { name: carouselRegionName })).toBeHidden();
}

async function expectVisibleDialogImage(page: Page, imageNumber: number): Promise<void> {
  await expect(page.getByText(`${imageNumber} / ${imageCount}`, { exact: true })).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
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
}

test.describe('chat image carousel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/__e2e/chat-image-carousel');
  });

  test('should keep images visible after looping forward through five composer images', async ({ page }) => {
    await openComposerImage(page, 1);

    /* oxlint-disable no-await-in-loop -- Carousel keyboard navigation is stateful; each assertion depends on the prior key press settling. */
    for (const imageNumber of [2, 3, 4, 5, 1, 2]) {
      await page.keyboard.press('ArrowRight');
      await expectVisibleDialogImage(page, imageNumber);
    }
    /* oxlint-enable no-await-in-loop -- End sequential carousel navigation. */
  });

  test('should keep images visible after immediately looping backward from the first composer image', async ({
    page,
  }) => {
    await openComposerImage(page, 1);
    await closeCarousel(page);
    await openComposerImage(page, 1);

    /* oxlint-disable no-await-in-loop -- Carousel keyboard navigation is stateful; each assertion depends on the prior key press settling. */
    for (const imageNumber of [5, 4, 3, 2, 1]) {
      await page.keyboard.press('ArrowLeft');
      await expectVisibleDialogImage(page, imageNumber);
    }
    /* oxlint-enable no-await-in-loop -- End sequential carousel navigation. */
  });
});
