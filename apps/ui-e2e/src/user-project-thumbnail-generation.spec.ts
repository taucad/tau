import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const projectName = 'Thumbnail Generation E2E';

type ThumbnailState = {
  readonly digest: string;
  readonly width: number;
  readonly height: number;
};

async function openProjectThumbnail(page: Page): Promise<Locator> {
  await page.goto('/projects');
  await page.getByPlaceholder('Search projects...').fill(projectName);
  await expect(page.getByRole('link', { name: `Open ${projectName}` })).toBeVisible({ timeout: 60_000 });
  return page.getByRole('img', { name: projectName });
}

async function readGeneratedThumbnail(image: Locator): Promise<ThumbnailState | undefined> {
  return image.evaluate(async (element: HTMLImageElement) => {
    const source = element.currentSrc || element.src;
    if (!element.complete || source.endsWith('/placeholder.svg') || element.naturalWidth === 0) {
      return undefined;
    }

    const response = await fetch(source);
    const bytes = await response.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

    return {
      digest: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      width: element.naturalWidth,
      height: element.naturalHeight,
    };
  });
}

test('user project thumbnail generation follows nested settled sources and refreshes the mounted card', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);

  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
  test.skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');

  await page.goto('/__e2e/user-project-thumbnail-generation');
  await expect(page).toHaveURL(/\/w\/[^/]+\/[^/]+$/u, { timeout: 60_000 });
  const widthInput = page.getByLabel('Input for Width');
  await widthInput.waitFor({ state: 'attached', timeout: 60_000 });
  await expect(page.getByRole('img', { name: /3d model preview/i })).toBeVisible({ timeout: 60_000 });

  const libraryPage = await context.newPage();
  try {
    const thumbnail = await openProjectThumbnail(libraryPage);
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

    await widthInput.focus();
    await widthInput.fill('32');
    await widthInput.press('Enter');
    await expect(widthInput).toHaveValue('32');

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

    await libraryPage.reload();
    await libraryPage.getByPlaceholder('Search projects...').fill(projectName);
    await expect(libraryPage.getByRole('link', { name: `Open ${projectName}` })).toBeVisible({ timeout: 60_000 });
    const reloadedThumbnail = libraryPage.getByRole('img', { name: projectName });
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
    await libraryPage.close();
  }
});
