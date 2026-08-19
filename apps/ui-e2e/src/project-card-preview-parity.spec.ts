import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

type ForegroundBounds = {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
};

const measureForeground = async (page: Page, media: Locator): Promise<ForegroundBounds | undefined> => {
  const screenshot = await media.screenshot({ animations: 'disabled' });
  return page.evaluate(async (pngBase64) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.addEventListener(
        'load',
        () => {
          resolve();
        },
        { once: true },
      );
      image.addEventListener(
        'error',
        () => {
          reject(new Error('Project-card media screenshot could not be decoded.'));
        },
        { once: true },
      );
      image.src = `data:image/png;base64,${pngBase64}`;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('2D canvas context is unavailable.');
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();
    const isMasked = (x: number, y: number) => x >= image.width - 70 && y < 70;
    const isSampledPixel = (x: number, y: number): boolean =>
      !isMasked(x, y) && pixels[(y * image.width + x) * 4 + 3]! >= 128;

    for (let y = 2; y < image.height - 2; y++) {
      for (let x = 2; x < image.width - 2; x++) {
        const offset = (y * image.width + x) * 4;
        if (!isSampledPixel(x, y)) {
          continue;
        }
        const red = pixels[offset]!;
        const green = pixels[offset + 1]!;
        const blue = pixels[offset + 2]!;
        const key = Math.floor(red / 8) * 1024 + Math.floor(green / 8) * 32 + Math.floor(blue / 8);
        const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
        bucket.count++;
        bucket.red += red;
        bucket.green += green;
        bucket.blue += blue;
        buckets.set(key, bucket);
      }
    }

    const background = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
    if (!background) {
      return undefined;
    }
    const backgroundRed = background.red / background.count;
    const backgroundGreen = background.green / background.count;
    const backgroundBlue = background.blue / background.count;
    const foregroundMask = new Uint8Array(image.width * image.height);

    for (let y = 2; y < image.height - 2; y++) {
      for (let x = 2; x < image.width - 2; x++) {
        const offset = (y * image.width + x) * 4;
        if (!isSampledPixel(x, y)) {
          continue;
        }
        const redDelta = pixels[offset]! - backgroundRed;
        const greenDelta = pixels[offset + 1]! - backgroundGreen;
        const blueDelta = pixels[offset + 2]! - backgroundBlue;
        if (redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta <= 18 * 18) {
          continue;
        }
        foregroundMask[y * image.width + x] = 1;
      }
    }

    // Rounded card clipping and transparent canvas backgrounds can create a
    // large background-difference region attached to the screenshot boundary.
    // The model is the largest enclosed foreground component once that border
    // region and the masked preview button are removed.
    const visited = new Uint8Array(foregroundMask.length);
    const queue = new Int32Array(foregroundMask.length);
    type Component = { minX: number; minY: number; maxX: number; maxY: number; pixels: number };
    const neighborDeltas = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ] as const;
    const measureComponent = (startIndex: number): Component & { touchesBoundary: boolean } => {
      let head = 0;
      let tail = 0;
      const startX = startIndex % image.width;
      const startY = Math.floor(startIndex / image.width);
      let minX = startX;
      let minY = startY;
      let maxX = startX;
      let maxY = startY;
      let componentPixels = 0;
      let touchesBoundary = false;
      queue[tail++] = startIndex;
      visited[startIndex] = 1;

      while (head < tail) {
        const index = queue[head++]!;
        const x = index % image.width;
        const y = Math.floor(index / image.width);
        componentPixels++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        touchesBoundary ||= x === 2 || y === 2 || x === image.width - 3 || y === image.height - 3;

        for (const [offsetX, offsetY] of neighborDeltas) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 2 ||
            nextX >= image.width - 2 ||
            nextY < 2 ||
            nextY >= image.height - 2 ||
            isMasked(nextX, nextY)
          ) {
            continue;
          }
          const nextIndex = nextY * image.width + nextX;
          if (foregroundMask[nextIndex] === 0 || visited[nextIndex] === 1) {
            continue;
          }
          visited[nextIndex] = 1;
          queue[tail++] = nextIndex;
        }
      }

      return { minX, minY, maxX, maxY, pixels: componentPixels, touchesBoundary };
    };
    let bestComponent: Component | undefined;

    for (let startY = 2; startY < image.height - 2; startY++) {
      for (let startX = 2; startX < image.width - 2; startX++) {
        const startIndex = startY * image.width + startX;
        if (foregroundMask[startIndex] === 0 || visited[startIndex] === 1) {
          continue;
        }

        const component = measureComponent(startIndex);
        if (!component.touchesBoundary && component.pixels > (bestComponent?.pixels ?? 0)) {
          bestComponent = component;
        }
      }
    }

    if (!bestComponent) {
      return undefined;
    }

    return {
      centerX: (bestComponent.minX + bestComponent.maxX) / 2,
      centerY: (bestComponent.minY + bestComponent.maxY) / 2,
      width: bestComponent.maxX - bestComponent.minX + 1,
      height: bestComponent.maxY - bestComponent.minY + 1,
      pixels: bestComponent.pixels,
    };
  }, screenshot.toString('base64'));
};

test('project card thumbnail and preview parity', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/community');
  await page.getByPlaceholder('Search projects...').fill('Involute Gear');

  const card = page.getByRole('link', { name: 'Preview Involute Gear' }).locator('..');
  const thumbnail = card.getByRole('img', { name: 'Involute Gear' });
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(async () => thumbnail.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
    .toBe(768);

  const toggle = card.getByRole('button', { name: 'Preview model' });
  const media = toggle.locator('..');
  const thumbnailBounds = await measureForeground(page, media);
  expect(thumbnailBounds?.pixels).toBeGreaterThan(100);

  await toggle.click();
  await expect(card.locator('canvas')).toBeVisible({ timeout: 60_000 });

  let previewBounds: ForegroundBounds | undefined;
  await expect
    .poll(
      async () => {
        previewBounds = await measureForeground(page, media);
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
