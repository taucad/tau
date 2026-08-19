import { test, expect } from '@playwright/test';

/**
 * UI counterpart to `examples/electron/e2e/render.spec.ts`.
 *
 * Flow: load `/`, click the Birdhouse community card, land on the
 * Birdhouse preview, and assert the `TAU_DEBUG`-gated diagnostic panel
 * surfaces the same `bbox-*` / `count-*` / `asset-*` testids that the
 * Electron BoundingBoxViewer publishes — proves the v6 web-worker
 * transport delivers a non-empty glTF payload to the renderer end-to-end.
 *
 * Pre-requisite: `playwright.config.ts` boots `nx run ui:serve` with
 * `TAU_DEBUG=true`, so `useFeature('tauDebug')` resolves true and
 * `<PreviewDebugPanel>` mounts below the "Downloads" section.
 */

test.describe('Birdhouse preview (TAU_DEBUG)', () => {
  test('navigates from the home page to the birdhouse preview and renders a non-empty glTF', async ({ page }) => {
    await page.goto('/');

    /* Birdhouse card lives in the lazily-loaded "From the Community"
     * section. Wait for the title to scroll-trigger the LazySection
     * observer; the link click is the same gesture a user performs. */
    const communityHeading = page.getByRole('heading', { name: /from the community/i });
    await expect(communityHeading).toBeVisible({ timeout: 30_000 });
    await communityHeading.scrollIntoViewIfNeeded();

    const birdhouseLink = page.getByRole('link', { name: /^preview birdhouse$/i });
    await expect(birdhouseLink).toBeVisible({ timeout: 30_000 });
    await birdhouseLink.click();

    await page.waitForURL(/\/examples\/proj_birdhouse$/, { timeout: 30_000 });

    /* The preview canvas is the same accessibility surface as the
     * `proj_hollow_box` smoke spec — both routes share `<CadPreviewViewer>`
     * which exposes `role='img'` / `aria-label='3D model preview'`. */
    const canvas = page.getByRole('img', { name: /3d model preview/i });
    await expect(canvas).toBeVisible({ timeout: 60_000 });

    /* No alert — render succeeded (kernel issues, init errors, etc.
     * surface as alerts via `CadPreviewStatus`). */
    await expect(page.getByRole('alert')).not.toBeVisible();

    /* Debug panel should be in the DOM as soon as the page mounts
     * (TAU_DEBUG is on); first geometry hydrates the `bbox-viewer`
     * subtree once the kernel returns its first glTF payload. */
    const debugPanel = page.getByTestId('preview-debug-panel');
    await expect(debugPanel).toBeVisible({ timeout: 60_000 });

    const bboxViewer = page.getByTestId('bbox-viewer');
    await expect(bboxViewer).toBeVisible({ timeout: 60_000 });

    /* Bounding-box assertions — Birdhouse is a real parametric model so
     * we don't pin exact dimensions; instead we assert the box is
     * non-degenerate and finite, mirroring the Electron suite's
     * "non-empty geometry" contract. */
    const sizeText = (await page.getByTestId('bbox-size').textContent()) ?? '';
    const sizeMatch = /\[\s*([\d+.-]+)\s*,\s*([\d+.-]+)\s*,\s*([\d+.-]+)\s*]/.exec(sizeText);
    expect(sizeMatch, `bbox-size should match "[x, y, z]" but got "${sizeText}"`).not.toBeNull();
    const dims = sizeMatch!.slice(1, 4).map(Number);
    for (const [axis, value] of (['X', 'Y', 'Z'] as const).map((a, i) => [a, dims[i] ?? Number.NaN] as const)) {
      expect(Number.isFinite(value) && value > 0, `bbox ${axis} size must be > 0, got ${value}`).toBe(true);
    }

    /* Mesh / vertex / triangle counts must all be > 0 — empty geometry
     * is a regression we want to catch immediately. */
    const positiveInt = async (testId: string): Promise<number> => {
      const text = (await page.getByTestId(testId).textContent()) ?? '0';
      return Number.parseInt(text, 10);
    };
    expect(await positiveInt('count-meshes')).toBeGreaterThan(0);
    expect(await positiveInt('count-primitives')).toBeGreaterThan(0);
    expect(await positiveInt('count-vertices')).toBeGreaterThan(0);
    expect(await positiveInt('count-triangles')).toBeGreaterThan(0);

    /* Asset header sanity — every glTF emitter (replicad, OCCT, JSCAD,
     * OpenSCAD) writes "2.0" as the spec version. */
    await expect(page.getByTestId('asset-version')).toHaveText('2.0');
  });
});
