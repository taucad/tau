import type { ConsoleMessage, Page, TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';

type SectionViewBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setSectionView(state: {
      plane: 'xy' | 'xz' | 'yz';
      direction?: 1 | -1;
      rotationRadians?: readonly [number, number, number];
      pivot?: readonly [number, number, number];
      translation?: number;
    }): void;
    setCamera(camera: {
      position: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
      zoom?: number;
    }): void;
    projectWorldPoint(point: readonly [number, number, number]): {
      x: number;
      y: number;
      visible: boolean;
    };
    getSectionCapOverlapDiagnostics():
      | {
          sourceCount: number;
          sourcePairCount: number;
          broadphaseCandidatePairCount: number;
          exactIntersectionPairCount: number;
          positiveAreaPairCount: number;
          renderedOverlapArea: number;
          splitFailed: boolean;
          diagnostics: ReadonlyArray<{ code: string; message: string }>;
        }
      | undefined;
    getSectionCapPerformanceDiagnostics?():
      | {
          latestFrame: {
            topologyKey?: string;
            styleKey?: string;
            baseCapTopologyKey?: string;
            baseCapIsCurrent?: boolean;
            exactDiagnosticIsCurrent?: boolean;
            pendingReason?: string;
            counters: Record<string, number>;
          };
        }
      | undefined;
  };
};

type CanvasSample = Readonly<{
  darkRedDiagnostic: number;
  yellowDiagnostic: number;
  blackContour: number;
  greenSource: number;
  blueSource: number;
  yellowTransitionsAlongNormalAxis: number;
  yellowTransitionsAlongOverlapAxis: number;
  distinctBuckets: number;
}>;

type CanvasRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

type CaptureCanvasOptions = Readonly<{
  fileName: string;
  region: CanvasRegion;
  testInfo: TestInfo;
}>;

const webgpuValidationPatterns: readonly RegExp[] = [
  /Vertex buffer slot \d+ required/,
  /Invalid CommandBuffer/,
  /depth-stencil format mismatch/,
];

const attachWebGpuValidationListener = (
  page: Page,
): {
  failuresRef: { lines: string[] };
  detach(): void;
} => {
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
};

const driveOverlapSectionView = async (page: Page, translation: number): Promise<void> => {
  await page.evaluate((nextTranslation) => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [76, -70, 48],
      target: [32, 0, 0],
      fov: 38,
      zoom: 1.2,
    });
    bridge.setSectionView({
      plane: 'xy',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 0],
      translation: nextTranslation,
    });
  }, translation);
};

const overlapRegionForCanvas = async (page: Page): Promise<CanvasRegion> => {
  const canvas = page.locator('[role="img"][aria-label*="3D model preview" i] canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('3D preview canvas bounding box is unavailable.');
  }

  const projected = await page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.projectWorldPoint([30, 0, 0]);
  });

  expect(projected.visible).toBe(true);

  const centerX = (projected.x - box.x) / box.width;
  const centerY = (projected.y - box.y) / box.height;
  const width = 0.18;
  const height = 0.18;

  return {
    x: Math.max(0, Math.min(1 - width, centerX - width / 2)),
    y: Math.max(0, Math.min(1 - height, centerY - height / 2)),
    width,
    height,
  };
};

const getOverlapDiagnostics = async (
  page: Page,
): Promise<
  NonNullable<SectionViewBridgeWindow['__TAU_SECTION_VIEW_TEST__']> extends infer Bridge
    ? Bridge extends { getSectionCapOverlapDiagnostics(): infer Result }
      ? Result
      : never
    : never
> =>
  page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionCapOverlapDiagnostics();
  });

const getPerformanceDiagnostics = async (
  page: Page,
): Promise<
  | {
      latestFrame: {
        topologyKey?: string;
        styleKey?: string;
        baseCapTopologyKey?: string;
        baseCapIsCurrent?: boolean;
        exactDiagnosticIsCurrent?: boolean;
        pendingReason?: string;
        counters: Record<string, number>;
      };
    }
  | undefined
> =>
  page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionCapPerformanceDiagnostics?.();
  });

const waitForExactOverlapDiagnostics = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const diagnostics = bridge?.getSectionCapOverlapDiagnostics();
      return Boolean(
        diagnostics &&
        diagnostics.positiveAreaPairCount > 0 &&
        diagnostics.renderedOverlapArea > 0 &&
        !diagnostics.splitFailed,
      );
    },
    undefined,
    { timeout: 15_000 },
  );
};

const captureAndSampleCanvas = async (page: Page, options: CaptureCanvasOptions): Promise<CanvasSample> => {
  const canvas = page.locator('[role="img"][aria-label*="3D model preview" i] canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('3D preview canvas bounding box is unavailable.');
  }

  const screenshot = await canvas.screenshot({
    animations: 'disabled',
    path: options.testInfo.outputPath(options.fileName),
  });

  return page.evaluate(
    async ({ canvasBox, pngBase64, sampleRegion }) => {
      const sampleWidth = 128;
      const sampleHeight = 128;
      const image = new Image();
      const imageLoaded = new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => {
          resolve();
        });
        image.addEventListener('error', () => {
          reject(new Error('3D preview canvas screenshot could not be decoded.'));
        });
      });
      image.src = `data:image/png;base64,${pngBase64}`;
      await imageLoaded;

      const offscreen = document.createElement('canvas');
      offscreen.width = sampleWidth;
      offscreen.height = sampleHeight;
      const context = offscreen.getContext('2d');
      if (!context) {
        throw new Error('2D sampling context unavailable.');
      }

      context.drawImage(
        image,
        image.width * sampleRegion.x,
        image.height * sampleRegion.y,
        image.width * sampleRegion.width,
        image.height * sampleRegion.height,
        0,
        0,
        sampleWidth,
        sampleHeight,
      );

      const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
      const histogram = new Map<number, number>();
      const yellowMask = new Uint8Array(sampleWidth * sampleHeight);
      let darkRedDiagnostic = 0;
      let yellowDiagnostic = 0;
      let blackContour = 0;
      let greenSource = 0;
      let blueSource = 0;

      for (let index = 0; index < data.length; index += 4) {
        const r = data[index]!;
        const g = data[index + 1]!;
        const b = data[index + 2]!;
        const pixelIndex = index / 4;
        const bucket = Math.floor(r / 8) * 1024 + Math.floor(g / 8) * 32 + Math.floor(b / 8);
        histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);

        if (r > 110 && g < 120 && b < 120 && r > g + 35 && r > b + 35) {
          darkRedDiagnostic++;
        }

        if (r > 165 && g > 120 && b < 135 && r > b + 45 && g > b + 30) {
          yellowDiagnostic++;
          yellowMask[pixelIndex] = 1;
        }

        if (Math.max(r, g, b) < 72 && Math.max(r, g, b) - Math.min(r, g, b) < 28) {
          blackContour++;
        }

        if (g > 120 && r < 140 && b < 140) {
          greenSource++;
        }

        if (b > 130 && r < 140 && g > 70) {
          blueSource++;
        }
      }

      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Section view e2e bridge is not installed.');
      }

      const stripeScale = 6;
      const centerWorld = [30, 0, 0] as const;
      const normalAxisEndWorld = [30 + Math.SQRT1_2 * stripeScale, Math.SQRT1_2 * stripeScale, 0] as const;
      const overlapAxisEndWorld = [30 + Math.SQRT1_2 * stripeScale, -Math.SQRT1_2 * stripeScale, 0] as const;
      const centerProjected = bridge.projectWorldPoint(centerWorld);
      const normalAxisProjected = bridge.projectWorldPoint(normalAxisEndWorld);
      const overlapAxisProjected = bridge.projectWorldPoint(overlapAxisEndWorld);

      const toSamplePoint = (point: { x: number; y: number }): { x: number; y: number } => ({
        x: (((point.x - canvasBox.x) / canvasBox.width - sampleRegion.x) / sampleRegion.width) * sampleWidth,
        y: (((point.y - canvasBox.y) / canvasBox.height - sampleRegion.y) / sampleRegion.height) * sampleHeight,
      });

      const normalize = (direction: { x: number; y: number }): { x: number; y: number } => {
        const length = Math.hypot(direction.x, direction.y);
        if (length <= 1e-6) {
          return { x: 1, y: 0 };
        }

        return { x: direction.x / length, y: direction.y / length };
      };

      const center = toSamplePoint(centerProjected);
      const normalEnd = toSamplePoint(normalAxisProjected);
      const overlapEnd = toSamplePoint(overlapAxisProjected);
      const normalDirection = normalize({ x: normalEnd.x - center.x, y: normalEnd.y - center.y });
      const overlapDirection = normalize({ x: overlapEnd.x - center.x, y: overlapEnd.y - center.y });

      const countDirectionalTransitions = (direction: { x: number; y: number }): number => {
        const perpendicular = { x: -direction.y, y: direction.x };
        let transitionTotal = 0;
        let sampledLines = 0;

        for (let offset = -42; offset <= 42; offset += 7) {
          let previous = -1;
          let transitions = 0;
          let sampleCount = 0;

          for (let step = -54; step <= 54; step += 1) {
            const x = Math.round(center.x + direction.x * step + perpendicular.x * offset);
            const y = Math.round(center.y + direction.y * step + perpendicular.y * offset);
            if (x < 0 || x >= sampleWidth || y < 0 || y >= sampleHeight) {
              continue;
            }

            const current = yellowMask[y * sampleWidth + x]!;
            if (previous !== -1 && current !== previous) {
              transitions += 1;
            }

            previous = current;
            sampleCount += 1;
          }

          if (sampleCount > 24) {
            transitionTotal += transitions;
            sampledLines += 1;
          }
        }

        return sampledLines === 0 ? 0 : transitionTotal / sampledLines;
      };

      return {
        darkRedDiagnostic,
        yellowDiagnostic,
        blackContour,
        greenSource,
        blueSource,
        yellowTransitionsAlongNormalAxis: countDirectionalTransitions(normalDirection),
        yellowTransitionsAlongOverlapAxis: countDirectionalTransitions(overlapDirection),
        distinctBuckets: histogram.size,
      };
    },
    { canvasBox: box, pngBase64: screenshot.toString('base64'), sampleRegion: options.region },
  );
};

test.describe('Section view overlap cap shading', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`renders red overlap caps only for positive-area overlaps in ${backend}`, async ({ page }, testInfo) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
        test.skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      const listener = backend === 'webgpu' ? attachWebGpuValidationListener(page) : undefined;

      try {
        await page.goto(`/projects/jscad_section_overlap_fixture/preview?graphicsBackend=${backend}`);
        await expect(page.getByRole('img', { name: /3d model preview/i })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('bbox-viewer')).toBeVisible({ timeout: 60_000 });
        await page.waitForFunction(() =>
          Boolean((globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__),
        );

        await driveOverlapSectionView(page, 0);
        await waitForExactOverlapDiagnostics(page);
        await page.waitForTimeout(250);
        const region = await overlapRegionForCanvas(page);
        const overlapDiagnostics = await getOverlapDiagnostics(page);
        expect(overlapDiagnostics, `${backend}: exact overlap diagnostics should be published`).toBeDefined();
        expect(overlapDiagnostics?.splitFailed, `${backend}: exact source splitting should succeed`).toBe(false);
        expect(
          overlapDiagnostics?.exactIntersectionPairCount,
          `${backend}: every broadphase candidate should run exact intersection`,
        ).toBe(overlapDiagnostics?.broadphaseCandidatePairCount);
        expect(overlapDiagnostics?.positiveAreaPairCount).toBeGreaterThan(0);
        expect(overlapDiagnostics?.renderedOverlapArea).toBeGreaterThan(0);
        expect(Object.keys(overlapDiagnostics ?? {}).sort()).toEqual([
          'broadphaseCandidatePairCount',
          'diagnostics',
          'exactIntersectionPairCount',
          'positiveAreaPairCount',
          'renderedOverlapArea',
          'sourceCount',
          'sourcePairCount',
          'splitFailed',
        ]);
        const overlap = await captureAndSampleCanvas(page, {
          fileName: `section-overlap-cap-${backend}.png`,
          region,
          testInfo,
        });

        expect(
          overlap.distinctBuckets,
          `${backend}: sampled overlap region should contain shaded geometry`,
        ).toBeGreaterThan(8);
        expect(
          overlap.darkRedDiagnostic,
          `${backend}: positive-area overlap should render a dark-red cap diagnostic`,
        ).toBeGreaterThan(18);
        expect(
          overlap.yellowDiagnostic,
          `${backend}: positive-area overlap should render yellow diagnostic stripes`,
        ).toBeGreaterThan(8);
        expect(
          overlap.blackContour,
          `${backend}: generated cap outlines should remain visible alongside overlap diagnostics`,
        ).toBeGreaterThan(8);
        expect(
          Math.max(overlap.yellowTransitionsAlongNormalAxis, overlap.yellowTransitionsAlongOverlapAxis),
          `${backend}: yellow diagnostic stripes should produce directional variation`,
        ).toBeGreaterThan(4);
        expect(
          Math.abs(overlap.yellowTransitionsAlongNormalAxis - overlap.yellowTransitionsAlongOverlapAxis),
          `${backend}: yellow diagnostic stripe variation should be anisotropic`,
        ).toBeGreaterThan(2);
        expect(
          overlap.greenSource + overlap.blueSource,
          `${backend}: normal/tangent source cap colors should remain visible around diagnostics`,
        ).toBeGreaterThan(12);

        const canvas = page.locator('[role="img"][aria-label*="3D model preview" i] canvas');
        const canvasBox = await canvas.boundingBox();
        if (!canvasBox) {
          throw new Error('3D preview canvas bounding box is unavailable.');
        }
        const beforeHoverPerformance = await getPerformanceDiagnostics(page);
        await page.mouse.move(
          canvasBox.x + canvasBox.width * (region.x + region.width / 2),
          canvasBox.y + canvasBox.height * (region.y + region.height / 2),
        );
        const hoverFrames = [0, 1, 2] as const;
        const assertHoverFrame = async (frameIndex: number): Promise<void> => {
          const frame = hoverFrames[frameIndex];
          if (frame === undefined) {
            return;
          }

          await page.waitForTimeout(80);
          const hover = await captureAndSampleCanvas(page, {
            fileName: `section-overlap-cap-hover-${backend}-${frame}.png`,
            region,
            testInfo,
          });
          expect(
            hover.darkRedDiagnostic,
            `${backend}: hover frame ${frame} should not flash red diagnostics invisible`,
          ).toBeGreaterThan(Math.max(10, Math.floor(overlap.darkRedDiagnostic * 0.5)));
          expect(
            hover.yellowDiagnostic,
            `${backend}: hover frame ${frame} should not flash yellow diagnostics invisible`,
          ).toBeGreaterThan(Math.max(5, Math.floor(overlap.yellowDiagnostic * 0.5)));
          await assertHoverFrame(frameIndex + 1);
        };
        await assertHoverFrame(0);
        const afterHoverPerformance = await getPerformanceDiagnostics(page);
        if (beforeHoverPerformance && afterHoverPerformance) {
          expect(afterHoverPerformance.latestFrame.pendingReason).not.toBe('style-change');
          expect(afterHoverPerformance.latestFrame.counters['styleInvalidatedWorkerRequestCount'] ?? 0).toBe(0);
          expect(afterHoverPerformance.latestFrame.topologyKey).toBeTruthy();
          expect(afterHoverPerformance.latestFrame.styleKey).toBeTruthy();
        }

        await driveOverlapSectionView(page, 14);
        await page.waitForTimeout(80);
        const pendingMovePerformance = await getPerformanceDiagnostics(page);
        expect(
          pendingMovePerformance?.latestFrame.baseCapIsCurrent,
          `${backend}: base caps should stay current immediately after a topology-changing plane move`,
        ).toBe(true);
        expect(
          pendingMovePerformance?.latestFrame.counters['baseFillVertexCount'] ?? 0,
          `${backend}: pending exact diagnostics should not prevent current base cap uploads`,
        ).toBeGreaterThan(0);
        expect(
          pendingMovePerformance?.latestFrame.counters['baseBoundarySegmentCount'] ?? 0,
          `${backend}: pending exact diagnostics should not prevent current cap outlines`,
        ).toBeGreaterThan(0);
        await page.waitForTimeout(750);
        const disjointDiagnostics = await getOverlapDiagnostics(page);
        expect(disjointDiagnostics?.positiveAreaPairCount).toBe(0);
        expect(disjointDiagnostics?.renderedOverlapArea).toBe(0);
        const disjoint = await captureAndSampleCanvas(page, {
          fileName: `section-overlap-cap-disjoint-${backend}.png`,
          region,
          testInfo,
        });

        expect(
          disjoint.darkRedDiagnostic,
          `${backend}: moving the section plane outside true cuts should remove overlap diagnostics`,
        ).toBeLessThan(Math.max(6, Math.floor(overlap.darkRedDiagnostic * 0.25)));
        expect(
          disjoint.yellowDiagnostic,
          `${backend}: moving the section plane outside true cuts should remove overlap stripe diagnostics`,
        ).toBeLessThan(Math.max(4, Math.floor(overlap.yellowDiagnostic * 0.25)));

        expect(
          listener?.failuresRef.lines ?? [],
          `WebGPU validation errors leaked to the console:\n${listener?.failuresRef.lines.join('\n') ?? ''}`,
        ).toEqual([]);
      } finally {
        listener?.detach();
      }
    });
  }
});
