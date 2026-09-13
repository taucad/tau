import type { ConsoleMessage, Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

/**
 * Graphics-backend regression spec.
 *
 * Catches WebGPU validation regressions automatically by installing a `console` listener that
 * fails the test on any line matching one of `webgpuValidationPatterns`. The patterns cover
 * the specific failure modes documented in the `webgpu-override-material-vertex-binding-failure`
 * research doc plus a small set of high-signal validation strings that have historically masked
 * regressions in the override-material / compose-quad area:
 *
 * - `/Vertex buffer slot \d+ required/` — the override-material attribute-mismatch signature.
 * - `/Invalid CommandBuffer/` — symptomatic of broken pass dependencies (e.g. depth attachment
 *   never populated, MRT slots missing).
 * - `/depth-stencil format mismatch/` — composite-quad depth-write contract violation (rule 12).
 *
 * Whenever the in-canvas WebGPU path matches one of those, the test fails fast with the captured
 * line attached so reviewers see the validation message directly in the Playwright report.
 *
 * The screenshot-at-three-angles assertion from the audit's R-test plan
 * (`webgpu-grid-{angle}.png`) is parked as `test.fixme` below until the editor exposes a
 * scriptable camera-orbit API — the gizmo currently requires synthetic pointer drags whose
 * deterministic stop-position varies across headless GPUs.
 *
 * A pixel-histogram fallback (`assertCanvasHasNonBackgroundPixels`) supplements the console
 * listener: it samples the rendered canvas via `drawImage`-into-2D and asserts the frame is not
 * dominated by a single solid-background colour. This catches "everything went invisible"
 * regressions like the composite-quad `depthNode` mis-step documented in
 * `docs/research/webgpu-composite-quad-depth-write-non-functional.md`, where the priority-2
 * overlay scene (grid + axes) depth-tested against stale canvas depth and disappeared at close
 * zoom levels. Without this check, the validation-error listener alone would have passed the
 * frame even though the visual was broken.
 */

const webgpuValidationPatterns: readonly RegExp[] = [
  /Vertex buffer slot \d+ required/,
  /Invalid CommandBuffer/,
  /depth-stencil format mismatch/,
];

function attachWebGpuValidationListener(page: Page): {
  failuresRef: { lines: string[] };
  detach(): void;
} {
  const failuresRef: { lines: string[] } = { lines: [] };

  const listener = (message: ConsoleMessage): void => {
    const text = message.text();
    for (const pattern of webgpuValidationPatterns) {
      if (pattern.test(text)) {
        failuresRef.lines.push(`[${message.type()}] ${text}`);
        break;
      }
    }
  };

  page.on('console', listener);

  return {
    failuresRef,
    detach: () => {
      page.off('console', listener);
    },
  };
}

/**
 * Sample the rendered canvas via `drawImage`-into-2D and return a histogram of pixel-colour
 * buckets quantised to 5 bits per channel (32^3 = 32_768 buckets). The histogram lets the test
 * distinguish "canvas dominated by a single solid colour" (the broken state we want to fail on
 * — either uninitialised, fully-cleared background, or fully-cleared depth that culled every
 * draw) from a "real render" (≥ N distinct buckets each with non-trivial weight).
 *
 * Runs entirely in the page so we don't take a Playwright dependency on `sharp` / `pngjs` for
 * PNG decode. `drawImage(HTMLCanvasElement, ...)` is canvas-context-agnostic — it copies the
 * presented framebuffer regardless of whether the source is WebGL, WebGPU, or 2D.
 */
async function assertCanvasHasNonBackgroundPixels(page: Page, canvasSelector: string, context: string): Promise<void> {
  const stats = await page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (canvas === null) {
      return { distinctBuckets: 0, totalSampled: 0, dominantWeight: 0, error: 'canvas not found' };
    }

    // Sample at a fixed grid resolution so the test stays deterministic across viewport sizes.
    const sampleWidth = 64;
    const sampleHeight = 64;

    const offscreen = document.createElement('canvas');
    offscreen.width = sampleWidth;
    offscreen.height = sampleHeight;
    const offscreenContext = offscreen.getContext('2d');
    if (offscreenContext === null) {
      return { distinctBuckets: 0, totalSampled: 0, dominantWeight: 0, error: '2d context unavailable' };
    }
    offscreenContext.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);

    const { data } = offscreenContext.getImageData(0, 0, sampleWidth, sampleHeight);
    const histogram = new Map<number, number>();
    // Quantise each 8-bit channel to 5 bits (32 levels) via integer division, then pack into a
    // single bucket index `r * 1024 + g * 32 + b`. Equivalent to `(r << 10) | (g << 5) | b` but
    // expressed arithmetically because `eslint(no-bitwise)` is enabled for ui-e2e.
    for (let index = 0; index < data.length; index += 4) {
      const r = Math.floor(data[index]! / 8);
      const g = Math.floor(data[index + 1]! / 8);
      const b = Math.floor(data[index + 2]! / 8);
      const bucket = r * 1024 + g * 32 + b;
      histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
    }

    const totalSampled = sampleWidth * sampleHeight;
    let dominantWeight = 0;
    for (const weight of histogram.values()) {
      if (weight > dominantWeight) {
        dominantWeight = weight;
      }
    }
    return {
      distinctBuckets: histogram.size,
      totalSampled,
      dominantWeight,
      error: undefined as string | undefined,
    };
  }, canvasSelector);

  expect(stats.error, `${context}: canvas sampling failed`).toBeUndefined();
  expect(stats.totalSampled, `${context}: total sampled pixels must be > 0`).toBeGreaterThan(0);

  // The composite-quad-depth regression manifested as ~100% of canvas pixels collapsing to the
  // single background-clear colour (everything else got depth-culled). A healthy render at
  // 64×64 samples produces dozens of distinct quantised buckets across the geometry, lighting,
  // AO, and grid colour ramps. Lower bound chosen to be defensible across headless GPUs while
  // still flagging "single solid colour" regressions.
  expect(
    stats.distinctBuckets,
    `${context}: canvas histogram has too few distinct colour buckets (${stats.distinctBuckets}) — likely a "render went invisible" regression. Total sampled = ${stats.totalSampled}, dominant bucket weight = ${stats.dominantWeight}.`,
  ).toBeGreaterThanOrEqual(8);

  // A frame where one bucket covers >= 99% of sampled pixels is functionally a solid background.
  const dominantRatio = stats.dominantWeight / stats.totalSampled;
  expect(
    dominantRatio,
    `${context}: a single colour bucket covers ${(dominantRatio * 100).toFixed(1)}% of the canvas — render is likely dominated by background.`,
  ).toBeLessThan(0.99);
}

test.describe('Graphics backend regression guard', () => {
  test('no WebGPU validation errors emit during a Birdhouse preview render', async ({ page }) => {
    const listener = attachWebGpuValidationListener(page);

    try {
      await page.goto('/projects/proj_birdhouse/preview');

      const canvas = page.getByRole('img', { name: /3d model preview/i });
      await expect(canvas).toBeVisible({ timeout: 60_000 });

      // Wait for the diagnostic panel to confirm a non-empty render — the same surface the
      // birdhouse-preview spec uses. Once it appears the WebGPU pipelines have been compiled,
      // the scenePass has rasterised at least once, and the composite quad has drawn,
      // which is the window during which override-material / composite-depth bugs surface.
      const bboxViewer = page.getByTestId('bbox-viewer');
      await expect(bboxViewer).toBeVisible({ timeout: 60_000 });

      // Drain any async console messages that have not flushed yet.
      await page.waitForTimeout(250);

      expect(
        listener.failuresRef.lines,
        `WebGPU validation errors leaked to the console:\n${listener.failuresRef.lines.join('\n')}`,
      ).toEqual([]);
    } finally {
      listener.detach();
    }
  });

  test('canvas pixel histogram detects "render went invisible" regressions', async ({ page }) => {
    const listener = attachWebGpuValidationListener(page);

    try {
      await page.goto('/projects/proj_birdhouse/preview');

      const canvas = page.getByRole('img', { name: /3d model preview/i });
      await expect(canvas).toBeVisible({ timeout: 60_000 });

      // Wait for the first non-empty render — the bbox-viewer mounting is the
      // synchronisation point that proves geometry has been delivered to the renderer.
      const bboxViewer = page.getByTestId('bbox-viewer');
      await expect(bboxViewer).toBeVisible({ timeout: 60_000 });

      // Give the canvas a few frames after geometry arrival to let the post-pipeline warmup
      // resolve (compileAsync IIFE in PostProcessingWebGPU) and the priority-2 overlay scene
      // (grid + axes) to land at least one frame into the canvas depth + colour attachments.
      await page.waitForTimeout(750);

      await assertCanvasHasNonBackgroundPixels(
        page,
        'canvas[role="img"][aria-label*="3D model preview" i]',
        'Birdhouse preview canvas after first render',
      );

      // Cross-check: pixel-histogram regressions should not be paired with WebGPU validation
      // noise; if they are, the validation message is more diagnostic than the pixel check.
      expect(
        listener.failuresRef.lines,
        `Pixel-histogram check passed but WebGPU validation errors were observed:\n${listener.failuresRef.lines.join('\n')}`,
      ).toEqual([]);
    } finally {
      listener.detach();
    }
  });

  test.fixme('webgpu + grid screenshot golden at top-down/oblique/bottom-up angles', async () => {
    /* Pending a scriptable camera-orbit API. The orbit-controls integration today only accepts
     * synthetic pointer drags, whose final camera pose varies across headless GPUs because the
     * drag-trajectory is integrated against the canvas's render-frame rate. Re-enable when the
     * editor exposes a `data-testid='camera-orbit'` programmatic seek (issue tracker entry to be
     * filed). The console-listener test above already covers the validation-error regression
     * surface this golden was meant to catch. */
  });
});
