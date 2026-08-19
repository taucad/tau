import { test, expect } from '@playwright/test';

test.describe('Build Preview', () => {
  test('renders a 3D model for the Hollow Box project', async ({ page }) => {
    const canvas = page.getByRole('img', { name: /3d model preview/i });
    const attempts = test.info().project.metadata['mode'] === 'development' ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const outdatedDependency = page
        .waitForResponse((response) => response.status() === 504 && response.url().includes('/node_modules/.vite/'), {
          timeout: 15_000,
        })
        /* oxlint-disable-next-line promise/prefer-await-to-then -- start the response waiter before navigation. */
        .then(
          () => true,
          () => false,
        );
      /* oxlint-disable-next-line eslint/no-await-in-loop -- retries must navigate sequentially. */
      await page.goto('/examples/proj_hollow_box');
      if (
        attempts === 1 ||
        /* oxlint-disable-next-line eslint/no-await-in-loop -- each navigation races its own response/render waiters. */
        !(await Promise.race([
          outdatedDependency,
          canvas.waitFor({ state: 'visible', timeout: 15_000 }).then(
            () => false,
            () => false,
          ),
        ]))
      ) {
        break;
      }
    }

    await expect(canvas).toBeVisible({ timeout: 45_000 });

    await expect(page.getByRole('alert')).not.toBeVisible();

    /* Assert real geometry was emitted via the `TAU_DEBUG`-gated
     * bbox-viewer rather than pixel-matching the WebGL canvas — screenshot
     * baselines of WebGL output are flaky across GPU/driver/headless modes
     * and don't catch empty-geometry regressions. */
    const bboxViewer = page.getByTestId('bbox-viewer');
    await expect(bboxViewer).toBeVisible({ timeout: 60_000 });

    const sizeText = (await page.getByTestId('bbox-size').textContent()) ?? '';
    const sizeMatch = /\[\s*([\d+.-]+)\s*,\s*([\d+.-]+)\s*,\s*([\d+.-]+)\s*]/.exec(sizeText);
    expect(sizeMatch, `bbox-size should match "[x, y, z]" but got "${sizeText}"`).not.toBeNull();
    const dims = sizeMatch!.slice(1, 4).map(Number);
    for (const [axis, value] of (['X', 'Y', 'Z'] as const).map((a, i) => [a, dims[i] ?? Number.NaN] as const)) {
      expect(Number.isFinite(value) && value > 0, `bbox ${axis} size must be > 0, got ${value}`).toBe(true);
    }

    const positiveInt = async (testId: string): Promise<number> => {
      const text = (await page.getByTestId(testId).textContent()) ?? '0';
      return Number.parseInt(text, 10);
    };
    expect(await positiveInt('count-meshes')).toBeGreaterThan(0);
    expect(await positiveInt('count-vertices')).toBeGreaterThan(0);
    expect(await positiveInt('count-triangles')).toBeGreaterThan(0);
  });

  test('shows loading state before model is ready', async ({ page }) => {
    await page.goto('/examples/proj_hollow_box');

    const loading = page.getByRole('status', { name: /loading preview/i });
    const canvas = page.getByRole('img', { name: /3d model preview/i });

    // One of these must be visible immediately after navigation
    await expect(loading.or(canvas)).toBeVisible({ timeout: 10_000 });
  });

  test('displays an error for a non-existent project', async ({ page }) => {
    await page.goto('/examples/proj_does_not_exist');

    const alert = page.getByRole('alert', { name: /preview error/i });
    await expect(alert).toBeVisible({ timeout: 45_000 });
  });
});
