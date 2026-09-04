import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type ShaderFixtureBackend = 'common-webgl' | 'webgpu';
type ShaderFixtureResult = Readonly<{
  actualBackend: ShaderFixtureBackend;
  fragmentShader: string;
  requestedBackend: ShaderFixtureBackend;
  vertexShader: string;
}>;

const readFixture = async (): Promise<ShaderFixtureResult | undefined> =>
  target.evaluate(
    () => (globalThis as typeof globalThis & { __TAU_SHADER_FIXTURE__?: ShaderFixtureResult }).__TAU_SHADER_FIXTURE__,
  );

const expectRenderedPixels = async (pngBase64: string, backend: ShaderFixtureBackend): Promise<void> => {
  const stats = await target.evaluate(async (encoded) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => {
        resolve();
      });
      image.addEventListener('error', () => {
        reject(new Error('Shader fixture screenshot could not be decoded.'));
      });
    });
    image.src = `data:image/png;base64,${encoded}`;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2D canvas is unavailable for shader pixel qualification.');
    }
    context.drawImage(image, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const histogram = new Map<number, number>();
    let centreDarkness = 0;
    let centrePixels = 0;
    let outerDarkness = 0;
    let outerPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const bucket =
        Math.floor(pixels[index]! / 2) * 16_384 +
        Math.floor(pixels[index + 1]! / 2) * 128 +
        Math.floor(pixels[index + 2]! / 2);
      histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
      const pixelIndex = index / 4;
      const x = (pixelIndex % 32) - 15.5;
      const y = Math.floor(pixelIndex / 32) - 15.5;
      const radiusSquared = x * x + y * y;
      const darkness = 255 - (pixels[index]! + pixels[index + 1]! + pixels[index + 2]!) / 3;
      if (radiusSquared <= 36) {
        centreDarkness += darkness;
        centrePixels += 1;
      } else if (radiusSquared >= 100 && radiusSquared <= 169) {
        outerDarkness += darkness;
        outerPixels += 1;
      }
    }
    return {
      centreDarkness: centreDarkness / centrePixels,
      distinctBuckets: histogram.size,
      dominantPixels: Math.max(...histogram.values()),
      outerDarkness: outerDarkness / outerPixels,
    };
  }, pngBase64);

  expect(stats.distinctBuckets, `${backend}: rendered shader fixture must contain visible detail`).toBeGreaterThan(3);
  expect(stats.dominantPixels / 1024, `${backend}: rendered fixture must not collapse to one color`).toBeLessThan(0.99);
  expect(
    stats.centreDarkness - stats.outerDarkness,
    `${backend}: infinite grid must fade radially to the scene background before its proxy edge`,
  ).toBeGreaterThan(5);
};

test.describe('generated shader fixture', () => {
  for (const backend of ['common-webgl', 'webgpu'] as const satisfies readonly ShaderFixtureBackend[]) {
    test(`compiles and renders the infinite grid through Three ${backend}`, async () => {
      const initialEvents = await target.events();
      const pageErrorStart = initialEvents.pageErrors.length;
      await target.navigate(`/__e2e/shader-fixture?backend=${backend}`);
      await target.waitFor(() => {
        const status = document.querySelector<HTMLElement>('[data-testid="shader-fixture-result"]')?.dataset['status'];
        return status !== undefined && status !== 'pending';
      });

      const output = selectors.getByTestId('shader-fixture-result');
      expect(await target.getAttribute(output, 'data-status')).toBe('ready');
      const result = await readFixture();
      expect(result?.requestedBackend).toBe(backend);
      expect(result?.actualBackend).toBe(backend);
      expect(result?.vertexShader.length).toBeGreaterThan(100);
      expect(result?.fragmentShader.length).toBeGreaterThan(100);

      if (backend === 'webgpu') {
        expect(result?.vertexShader).toContain('@vertex');
        expect(result?.fragmentShader).toContain('@fragment');
      } else {
        expect(result?.vertexShader).toContain('#version 300 es');
        expect(result?.fragmentShader).toContain('#version 300 es');
      }

      await target.delay(250);
      const screenshot = await target.screenshot(
        selectors.getByCss('canvas[aria-label="Generated shader fixture"]'),
        `generated-shader-${backend}.png`,
      );
      expect(screenshot.length).toBeGreaterThan(100);
      await expectRenderedPixels(screenshot, backend);

      if (backend === 'webgpu') {
        await target.reload();
        await target.waitFor(
          () =>
            document.querySelector<HTMLElement>('[data-testid="shader-fixture-result"]')?.dataset['status'] === 'ready',
        );
        const reloadedFixture = await readFixture();
        expect(reloadedFixture?.actualBackend).toBe('webgpu');
      }
      const finalEvents = await target.events();
      expect(finalEvents.pageErrors.slice(pageErrorStart)).toEqual([]);
    });
  }
});
