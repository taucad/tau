import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

export type CaptureEvidence = {
  readonly digest: string;
  readonly mimeType: string;
  readonly encoding: 'lossless-webp' | 'lossy-webp' | 'png' | 'unknown';
  readonly width: number;
  readonly height: number;
  readonly background: readonly [number, number, number, number];
  readonly modelPixels: number;
  readonly modelBounds: readonly [left: number, top: number, right: number, bottom: number];
  readonly modelCentroid: readonly [x: number, y: number];
  readonly modelColorCentroids: Readonly<{
    red: readonly [number, number] | undefined;
    green: readonly [number, number] | undefined;
    blue: readonly [number, number] | undefined;
  }>;
  readonly coloredModelBounds: readonly [left: number, top: number, right: number, bottom: number];
  readonly topLeftPixels: number;
  readonly bottomLeftPixels: number;
  readonly bottomRightPixels: number;
};

export type LineCoverageEvidence = Readonly<{
  straight: number;
  diagonal: number;
  straightConnectedPixels: number;
  diagonalConnectedPixels: number;
}>;

export const hasDarkGrayBackground = ({ background }: CaptureEvidence): boolean => {
  const [red, green, blue, alpha] = background;
  return alpha > 240 && red >= 28 && red <= 44 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 3;
};

export const hasLosslessEncoding = ({ encoding }: CaptureEvidence): boolean =>
  encoding === 'lossless-webp' || encoding === 'png';

export const seedVisionModel = async (): Promise<void> => {
  await target.addInitScript(
    (model) => {
      const fetchFromNetwork = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        return url.endsWith('/v1/models') ? Response.json([model]) : fetchFromNetwork(input, init);
      };
    },
    {
      id: 'e2e-image-model',
      model: 'e2e-image-model',
      name: 'E2E image model',
      slug: 'e2e-image-model',
      recommended: true,
      provider: { id: 'openai', name: 'OpenAI' },
      details: { family: 'gpt' },
      support: { modalities: { input: ['text', 'image'], output: ['text'] } },
    },
  );
};

export const readCaptureEvidence = async (image: Locator): Promise<CaptureEvidence> =>
  target.evaluateLocator(image, async (element) => {
    const imageElement = element as HTMLImageElement;
    const response = await fetch(imageElement.currentSrc || imageElement.src);
    const blob = await response.blob();
    const bytes = await blob.arrayBuffer();
    const sourceBytes = new Uint8Array(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const readAscii = (offset: number, length: number): string =>
      String.fromCodePoint(...sourceBytes.subarray(offset, offset + length));
    const readWebpEncoding = (): CaptureEvidence['encoding'] => {
      if (readAscii(0, 4) !== 'RIFF' || readAscii(8, 4) !== 'WEBP') {
        return 'unknown';
      }
      const view = new DataView(bytes);
      for (let offset = 12; offset + 8 <= sourceBytes.length; ) {
        const chunk = readAscii(offset, 4);
        if (chunk === 'VP8L') {
          return 'lossless-webp';
        }
        if (chunk === 'VP8 ') {
          return 'lossy-webp';
        }
        const length = view.getUint32(offset + 4, true);
        offset += 8 + length + (length % 2);
      }
      return 'unknown';
    };
    const encoding: CaptureEvidence['encoding'] = blob.type === 'image/png' ? 'png' : readWebpEncoding();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Canvas evidence probe is unavailable');
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelAt = (normalizedX: number, normalizedY: number): readonly [number, number, number, number] => {
      const offset =
        (Math.floor(normalizedY * (canvas.height - 1)) * canvas.width + Math.floor(normalizedX * (canvas.width - 1))) *
        4;
      return [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!, pixels[offset + 3]!];
    };
    const background = (() => {
      const samples: Array<readonly [number, number, number, number]> = [];
      for (let step = 0; step <= 64; step++) {
        const position = step / 64;
        samples.push(
          pixelAt(position, 0.02),
          pixelAt(0.98, position),
          pixelAt(position, 0.98),
          pixelAt(0.02, position),
        );
      }
      const counts = new Map<string, { count: number; pixel: (typeof samples)[number] }>();
      for (const pixel of samples) {
        const key = pixel.join(',');
        const existing = counts.get(key);
        counts.set(key, { count: (existing?.count ?? 0) + 1, pixel });
      }
      return [...counts.values()].sort((left, right) => right.count - left.count)[0]!.pixel;
    })();
    const isEvidencePixel = (offset: number): boolean => {
      const red = pixels[offset]!;
      const green = pixels[offset + 1]!;
      const blue = pixels[offset + 2]!;
      const alpha = pixels[offset + 3]!;
      const isBackground =
        Math.abs(red - background[0]) <= 3 &&
        Math.abs(green - background[1]) <= 3 &&
        Math.abs(blue - background[2]) <= 3;
      return (
        alpha > 40 &&
        !isBackground &&
        (Math.max(red, green, blue) - Math.min(red, green, blue) > 35 || red + green + blue < 570)
      );
    };
    const countEvidence = ([x0, y0, x1, y1]: readonly [number, number, number, number]): number => {
      let count = 0;
      for (let y = Math.floor(y0 * canvas.height); y < Math.floor(y1 * canvas.height); y += 2) {
        for (let x = Math.floor(x0 * canvas.width); x < Math.floor(x1 * canvas.width); x += 2) {
          const offset = (y * canvas.width + x) * 4;
          if (isEvidencePixel(offset)) {
            count++;
          }
        }
      }
      return count;
    };
    const channels = {
      red: { count: 0, x: 0, y: 0 },
      green: { count: 0, x: 0, y: 0 },
      blue: { count: 0, x: 0, y: 0 },
    };
    const coloredHorizontalCounts = new Uint32Array(canvas.width);
    const coloredVerticalCounts = new Uint32Array(canvas.height);
    let coloredPixels = 0;
    const colorChannel = (red: number, green: number, blue: number) => {
      if (red > green * 1.2 && red > blue * 1.2) {
        return channels.red;
      }
      if (green > red * 1.2 && green > blue * 1.2) {
        return channels.green;
      }
      if (blue > red * 1.2 && blue > green * 1.2) {
        return channels.blue;
      }
      return undefined;
    };
    let modelPixels = 0;
    let modelX = 0;
    let modelY = 0;
    let minimumX = canvas.width;
    let minimumY = canvas.height;
    let maximumX = 0;
    let maximumY = 0;
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const normalizedX = x / canvas.width;
        const normalizedY = y / canvas.height;
        const insideAnnotation =
          (normalizedX < 0.58 && normalizedY < 0.18) ||
          (normalizedX < 0.62 && normalizedY > 0.74) ||
          (normalizedX > 0.66 && normalizedY > 0.64);
        const offset = (y * canvas.width + x) * 4;
        if (insideAnnotation || !isEvidencePixel(offset)) {
          continue;
        }
        modelPixels++;
        modelX += normalizedX;
        modelY += normalizedY;
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
        const red = pixels[offset]!;
        const green = pixels[offset + 1]!;
        const blue = pixels[offset + 2]!;
        const channel = colorChannel(red, green, blue);
        if (channel) {
          channel.count++;
          channel.x += normalizedX;
          channel.y += normalizedY;
          coloredHorizontalCounts[x] = (coloredHorizontalCounts[x] ?? 0) + 1;
          coloredVerticalCounts[y] = (coloredVerticalCounts[y] ?? 0) + 1;
          coloredPixels++;
        }
      }
    }
    const colorCentroid = ({ count, x, y }: (typeof channels)[keyof typeof channels]) =>
      count === 0 ? undefined : ([x / count, y / count] as const);
    const quantileIndex = (counts: Uint32Array, quantile: number): number => {
      const target = coloredPixels * quantile;
      let total = 0;
      for (const [index, count] of counts.entries()) {
        total += count;
        if (total >= target) {
          return index;
        }
      }
      return counts.length - 1;
    };
    return {
      digest: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      mimeType: blob.type,
      encoding,
      width: canvas.width,
      height: canvas.height,
      background,
      modelPixels,
      modelBounds:
        modelPixels === 0
          ? ([0, 0, 0, 0] as const)
          : ([
              minimumX / canvas.width,
              minimumY / canvas.height,
              maximumX / canvas.width,
              maximumY / canvas.height,
            ] as const),
      modelCentroid: modelPixels === 0 ? ([0, 0] as const) : ([modelX / modelPixels, modelY / modelPixels] as const),
      modelColorCentroids: {
        red: colorCentroid(channels.red),
        green: colorCentroid(channels.green),
        blue: colorCentroid(channels.blue),
      },
      coloredModelBounds:
        coloredPixels === 0
          ? ([0, 0, 0, 0] as const)
          : ([
              quantileIndex(coloredHorizontalCounts, 0.01) / canvas.width,
              quantileIndex(coloredVerticalCounts, 0.01) / canvas.height,
              quantileIndex(coloredHorizontalCounts, 0.99) / canvas.width,
              quantileIndex(coloredVerticalCounts, 0.99) / canvas.height,
            ] as const),
      topLeftPixels: countEvidence([0, 0, 0.55, 0.22]),
      bottomLeftPixels: countEvidence([0, 0.72, 0.58, 1]),
      bottomRightPixels: countEvidence([0.68, 0.68, 1, 1]),
    };
  });

export const readBase64CaptureEvidence = async (base64: string, mimeType: string): Promise<CaptureEvidence> => {
  const id = '__tau-e2e-capture-evidence';
  await target.evaluate(
    async ({ content, elementId, type }) => {
      document.querySelector(`#${CSS.escape(elementId)}`)?.remove();
      const image = document.createElement('img');
      image.id = elementId;
      image.src = `data:${type};base64,${content}`;
      document.body.append(image);
      await image.decode();
    },
    { content: base64, elementId: id, type: mimeType },
  );
  try {
    return await readCaptureEvidence(selectors.getByCss(`#${id}`));
  } finally {
    await target.evaluate((elementId) => document.querySelector(`#${CSS.escape(elementId)}`)?.remove(), id);
  }
};

export const readLineCoverageEvidence = async (
  withLines: string,
  withoutLines: string,
  size?: Readonly<{ width: number; height: number }>,
): Promise<LineCoverageEvidence> =>
  target.evaluate(
    async ({ displaySize, surfacesUrl, linesUrl }) => {
      const load = async (url: string): Promise<ImageBitmap> => {
        const response = await fetch(url);
        return createImageBitmap(await response.blob());
      };
      const [lines, surfaces] = await Promise.all([load(linesUrl), load(surfacesUrl)]);
      if (lines.width !== surfaces.width || lines.height !== surfaces.height) {
        lines.close();
        surfaces.close();
        throw new Error('Line evidence images must have matching dimensions');
      }
      const width = Math.max(1, Math.round(displaySize?.width ?? lines.width));
      const height = Math.max(1, Math.round(displaySize?.height ?? lines.height));
      const pixels = (bitmap: ImageBitmap): Uint8ClampedArray => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          throw new Error('Line evidence canvas is unavailable');
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const linePixels = pixels(lines);
      const surfacePixels = pixels(surfaces);
      lines.close();
      surfaces.close();
      const opacity = new Float32Array(width * height);
      const linear = (channel: number): number => {
        const value = channel / 255;
        return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (values: Uint8ClampedArray, offset: number): number =>
        linear(values[offset]!) * 0.2126 + linear(values[offset + 1]!) * 0.7152 + linear(values[offset + 2]!) * 0.0722;
      const rowScores = new Float64Array(height);
      const descendingScores = new Float64Array(width + height - 1);
      const ascendingScores = new Float64Array(width + height - 1);
      const left = Math.floor(width * 0.08);
      const right = Math.ceil(width * 0.92);
      const top = Math.floor(height * 0.08);
      const bottom = Math.ceil(height * 0.92);
      let lineFloor = 1;
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const offset = (y * width + x) * 4;
          const line = luminance(linePixels, offset);
          if (line < luminance(surfacePixels, offset)) {
            lineFloor = Math.min(lineFloor, line);
          }
        }
      }
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const pixelIndex = y * width + x;
          const offset = pixelIndex * 4;
          const surface = luminance(surfacePixels, offset);
          const value = Math.max(
            0,
            Math.min(1, (surface - luminance(linePixels, offset)) / Math.max(surface - lineFloor, 1 / 255)),
          );
          opacity[pixelIndex] = value;
          if (value > 0.04) {
            rowScores[y]! += value;
            descendingScores[y - x + width - 1]! += value;
            ascendingScores[x + y]! += value;
          }
        }
      }
      const maximumIndex = (values: Float64Array): number => {
        let best = 0;
        for (let index = 1; index < values.length; index++) {
          if (values[index]! > values[best]!) {
            best = index;
          }
        }
        return best;
      };
      const row = maximumIndex(rowScores);
      const descending = maximumIndex(descendingScores);
      const ascending = maximumIndex(ascendingScores);
      const useDescending = descendingScores[descending]! >= ascendingScores[ascending]!;
      const diagonal = useDescending ? descending : ascending;
      const midpoint = (points: ReadonlyArray<readonly [number, number]>): readonly [number, number] => {
        if (points.length === 0) {
          throw new Error('No coherent line profile was found');
        }
        return points[Math.floor(points.length / 2)]!;
      };
      const straightPoints: Array<readonly [number, number]> = [];
      for (let x = left; x < right; x++) {
        if (opacity[row * width + x]! > 0.12) {
          straightPoints.push([x, row]);
        }
      }
      const diagonalPoints: Array<readonly [number, number]> = [];
      for (let x = left; x < right; x++) {
        const y = useDescending ? x + diagonal - width + 1 : diagonal - x;
        if (y >= top && y < bottom && opacity[y * width + x]! > 0.12) {
          diagonalPoints.push([x, y]);
        }
      }
      const sample = (x: number, y: number): number => {
        const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
        const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
        const x1 = Math.min(width - 1, x0 + 1);
        const y1 = Math.min(height - 1, y0 + 1);
        const xWeight = x - Math.floor(x);
        const yWeight = y - Math.floor(y);
        const topValue = opacity[y0 * width + x0]! * (1 - xWeight) + opacity[y0 * width + x1]! * xWeight;
        const bottomValue = opacity[y1 * width + x0]! * (1 - xWeight) + opacity[y1 * width + x1]! * xWeight;
        return topValue * (1 - yWeight) + bottomValue * yWeight;
      };
      const profile = (
        point: readonly [number, number],
        normal: readonly [number, number],
      ): Readonly<{ coverage: number; connected: number }> => {
        const radius = 12;
        const step = 0.25;
        let coverage = 0;
        let connected = 0;
        let run = 0;
        for (let offset = -radius; offset <= radius; offset += step) {
          coverage += sample(point[0] + normal[0] * offset, point[1] + normal[1] * offset) * step;
        }
        for (let offset = -radius; offset <= radius; offset++) {
          if (sample(point[0] + normal[0] * offset, point[1] + normal[1] * offset) >= 0.18) {
            run++;
            connected = Math.max(connected, run);
          } else {
            run = 0;
          }
        }
        return { coverage, connected };
      };
      const straightProfile = profile(midpoint(straightPoints), [0, 1]);
      const diagonalNormal = Math.SQRT1_2;
      const diagonalProfile = profile(
        midpoint(diagonalPoints),
        useDescending ? [-diagonalNormal, diagonalNormal] : [diagonalNormal, diagonalNormal],
      );
      return {
        straight: straightProfile.coverage,
        diagonal: diagonalProfile.coverage,
        straightConnectedPixels: straightProfile.connected,
        diagonalConnectedPixels: diagonalProfile.connected,
      };
    },
    { displaySize: size, linesUrl: withLines, surfacesUrl: withoutLines },
  );

const captureErrorToasts = (): string[] =>
  [...document.querySelectorAll('[data-sonner-toast][data-type="error"]')]
    .map((element) => element.textContent.trim())
    .filter((text) =>
      /capture|GPU|headless|resvg|WebGPU|disposed|CAD view|geometry|camera direction|drawing/iu.test(text),
    );

export const readCaptureErrorToasts = async (): Promise<string[]> => target.evaluate(captureErrorToasts);

export const waitForRenderedGeometry = async (format: 'gltf' | 'svg'): Promise<void> => {
  try {
    await target.waitFor(
      (expectedFormat) =>
        expectedFormat === 'svg'
          ? (document.querySelector('[data-slot="geometry"]')?.childElementCount ?? 0) > 0
          : ((
              globalThis as {
                __TAU_SECTION_VIEW_TEST__?: { getModelComponents(): readonly unknown[] };
              }
            ).__TAU_SECTION_VIEW_TEST__?.getModelComponents().length ?? 0) > 0,
      format,
      { timeout: 60_000 },
    );
  } catch (error) {
    const diagnostics = await target.events();
    const bridge = await target.evaluate(() => {
      const value = (
        globalThis as {
          __TAU_SECTION_VIEW_TEST__?: {
            getModelComponents(): readonly unknown[];
            getModelHoverState(): unknown;
          };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      return value ? { components: value.getModelComponents(), hover: value.getModelHoverState() } : undefined;
    });
    throw new Error(
      `Timed out waiting for ${format} geometry.\nBridge:\n${JSON.stringify(bridge)}\nPage errors:\n${diagnostics.pageErrors.join('\n')}\nConsole:\n${diagnostics.consoleMessages.map(({ text }) => text).join('\n')}`,
      { cause: error },
    );
  }
};

export const waitForCaptureAttachments = async (count: number): Promise<void> => {
  try {
    await target.evaluate(
      async ({ expectedCount, timeout }) =>
        new Promise<void>((resolve, reject) => {
          const check = (): void => {
            const errors = [...document.querySelectorAll('[data-sonner-toast][data-type="error"]')]
              .map((element) => element.textContent.trim())
              .filter((text) =>
                /capture|GPU|headless|resvg|WebGPU|disposed|CAD view|geometry|camera direction|drawing/iu.test(text),
              );
            if (errors.length > 0) {
              observer.disconnect();
              clearTimeout(timer);
              reject(new Error(errors.join('\n')));
              return;
            }
            if (document.querySelectorAll('button[aria-label^="Open uploaded image"]').length === expectedCount) {
              observer.disconnect();
              clearTimeout(timer);
              resolve();
            }
          };
          const observer = new MutationObserver(check);
          const timer = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timed out waiting for ${expectedCount} capture attachment(s)`));
          }, timeout);
          observer.observe(document.body, { childList: true, subtree: true });
          check();
        }),
      { expectedCount: count, timeout: 120_000 },
    );
  } catch (error) {
    const toasts = await target.evaluate(() =>
      [...document.querySelectorAll('[data-sonner-toast]')].map((element) => element.textContent.trim()),
    );
    const diagnostics = await target.events();
    throw new Error(
      `Attachment capture failed: ${JSON.stringify({
        toasts,
        console: diagnostics.consoleMessages.filter(({ text }) => /headless (?:image|capture)/iu.test(text)),
      })}`,
      { cause: error },
    );
  }
};
