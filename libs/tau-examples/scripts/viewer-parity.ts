/**
 * Viewer parity gate helpers (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6, metric D2): the fixture
 * manifest, the viewer references, the nanoraster builds under test, and the mean absolute RGB difference over model
 * pixels. Node only; the options and render call both builds share are in `viewer-parity-render.ts`.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { viewerParityReferenceName } from '#scripts/viewer-parity-files.js';
import type { ViewerParityBackend } from '#scripts/viewer-parity-files.js';
import type { ViewerParityCameraState, ViewerParityNanorasterModule } from '#scripts/viewer-parity-render.js';

/** D2: every fixture under this mean absolute RGB difference, percent of full scale. */
export const viewerParityThresholdPercent = 1;
/** Native and WASM D2 further apart than this, in percentage points, is reported as a backend difference. */
export const viewerParityBackendTolerancePoints = 0.05;
/** The dark-scheme capture background, `#242424`, one channel. */
const backgroundChannel = 0x24;
/** Viewer coverage above this alpha is a model pixel. */
const coverageAlpha = 8;
/** Rendered pixels further than this (sum of channel distances) from the background are model pixels. */
const renderedCoverageDistance = 9;
/** AO correlation counts only fully covered viewer pixels and nanoraster pixels visibly off the background. */
const aoCoverageAlpha = 250;
const aoRenderedLuminanceDistance = 3;

/** One parity fixture. @public */
export type ViewerParityFixture = Readonly<{
  /** Stable name: the reference directory and the test title. */
  name: string;
  /** GLB path, relative to the workspace root unless absolute. */
  glb: string;
  /** Where the GLB came from: `<kernel>/<example>` for tau-examples exports. */
  source: string;
  /** Geometry class (D3). */
  class: string;
  /** Why the fixture is in the set (D3). */
  rationale: string;
  /** Set while the fixture is known to fail D2: the reason and its owner. The gate then expects it to fail. */
  knownFailure?: string;
}>;

/** The parity fixture manifest. @public */
export type ViewerParityManifest = Readonly<{ fixtures: readonly ViewerParityFixture[] }>;

/** A viewer reference written by `packages/viewer` `viewer-parity-capture.browser.test.tsx`. @public */
export type ViewerParityReference = Readonly<{
  /** The captured frame, a PNG with the canvas's own alpha: the viewer's coverage. */
  png: string;
  /**
   * The frame as the page shows it, an opaque PNG: the canvas's premultiplied bytes composited on `#242424`. The gate
   * compares against this, not the straight-alpha frame flattened, whose antialiased silhouettes clamp dark.
   */
  composited: string;
  camera: ViewerParityCameraState;
  size: readonly [number, number];
  isWebGPUBackend: boolean;
  adapter: unknown;
}>;

/**
 * Read the fixture manifest.
 *
 * @param manifestPath - `fixtures.json` path.
 * @returns The manifest.
 */
export const readViewerParityManifest = (manifestPath: string): ViewerParityManifest =>
  JSON.parse(readFileSync(manifestPath, 'utf8')) as ViewerParityManifest;

/**
 * A fixture's GLB path.
 *
 * @param workspaceRoot - The Tau checkout.
 * @param fixture - The fixture.
 * @returns The absolute GLB path.
 */
export const resolveFixturePath = (workspaceRoot: string, fixture: ViewerParityFixture): string =>
  isAbsolute(fixture.glb) ? fixture.glb : resolve(workspaceRoot, fixture.glb);

/**
 * SHA-256 of bytes, hex.
 *
 * @param bytes - The bytes.
 * @returns The digest.
 */
export const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Read one viewer reference.
 *
 * @param viewerDirectory - The capture output directory.
 * @param name - The fixture name.
 * @param ao - Whether the viewer ran its ambient occlusion.
 * @returns The reference, or undefined when it was not captured.
 */
export const readViewerParityReference = (
  viewerDirectory: string,
  name: string,
  ao: boolean,
): ViewerParityReference | undefined => {
  const json = join(viewerDirectory, name, viewerParityReferenceName(ao));
  const png = json.replace(/\.json$/u, '.png');
  if (!existsSync(png) || !existsSync(json)) {
    return undefined;
  }
  const meta = JSON.parse(readFileSync(json, 'utf8')) as Omit<ViewerParityReference, 'png'>;
  if (typeof meta.composited !== 'string' || !existsSync(join(dirname(json), meta.composited))) {
    throw new Error(
      `${json} names no page composite; recapture the viewer references with viewer:capture:viewer-parity`,
    );
  }
  return { ...meta, png, composited: join(dirname(json), meta.composited) };
};

/** The nanoraster module under test and where it came from. @public */
export type ViewerParityRenderer = Readonly<{
  module: ViewerParityNanorasterModule;
  /** `package nanoraster@<version>`. */
  source: string;
}>;

/** Where one nanoraster build's entry point is. @public */
export type ViewerParityNanorasterEntry = Readonly<{
  /** Absolute path of the entry module. */
  entry: string;
  /** `package nanoraster@<version>`. */
  source: string;
}>;

/** The first nanoraster release that declares every viewer-parity option (charter D10). */
const parityReleaseMajorMinor = [0, 9] as const;

const declaresParityOptions = (version: string): boolean => {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return (
    major > parityReleaseMajorMinor[0] || (major === parityReleaseMajorMinor[0] && minor >= parityReleaseMajorMinor[1])
  );
};

/**
 * Locate the nanoraster under test for one build: the package `@taucad/image` installs, which must be the parity
 * release (0.9.0) or later; an older one cannot accept the viewer-parity options.
 *
 * The native build is the Node entry (`index.node`), which installs the addon. The WASM build is the universal entry
 * (`index`), the one a browser bundle such as the web app's image worker resolves: it has no addon and renders through
 * the WASM artifact on the page's WebGPU.
 *
 * @param input - The Tau checkout and the build.
 * @param input.workspaceRoot - The Tau checkout.
 * @param input.backend - The nanoraster build.
 * @returns The entry module and its source.
 */
export const resolveViewerParityNanorasterEntry = ({
  workspaceRoot,
  backend,
}: Readonly<{
  workspaceRoot: string;
  backend: ViewerParityBackend;
}>): ViewerParityNanorasterEntry => {
  // `require.resolve('nanoraster')` returns the CommonJS stub that throws; locate the ESM builds by path.
  const requireFromImage = createRequire(join(workspaceRoot, 'packages', 'plugins', 'image', 'package.json'));
  const packageJsonPath = requireFromImage.resolve('nanoraster/package.json');
  const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };
  if (!declaresParityOptions(version)) {
    throw new Error(
      `The installed nanoraster ${version} predates the viewer-parity options (0.9.0); install the catalog's nanoraster with \`pnpm install\``,
    );
  }
  return {
    entry: join(dirname(packageJsonPath), 'dist', backend === 'native' ? 'index.node.mjs' : 'index.mjs'),
    source: `package nanoraster@${version}`,
  };
};

/**
 * Load nanoraster's native build for the Node gate.
 *
 * @param workspaceRoot - The Tau checkout.
 * @returns The module and its source.
 */
export const loadViewerParityRenderer = async (workspaceRoot: string): Promise<ViewerParityRenderer> => {
  const { entry, source } = resolveViewerParityNanorasterEntry({ workspaceRoot, backend: 'native' });
  const module = (await import(pathToFileURL(entry).href)) as ViewerParityNanorasterModule;
  return { module, source };
};

/** Raw RGB of an image flattened on the capture background; an opaque image (a page composite) passes unchanged. */
export const flattenedRgb = async (image: string | Uint8Array<ArrayBuffer>): Promise<ArrayLike<number>> =>
  sharp(image)
    .flatten({ background: { r: backgroundChannel, g: backgroundChannel, b: backgroundChannel } })
    .removeAlpha()
    .raw()
    .toBuffer();

/** The alpha channel of the viewer's frame: its coverage. */
export const coverage = async (png: string): Promise<ArrayLike<number>> =>
  sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer();

/** One D2 measurement. @public */
export type ViewerParityDifference = Readonly<{
  /** Mean absolute RGB difference over model pixels, percent of full scale. */
  percent: number;
  /** Model pixels: viewer coverage or nanoraster pixels off the background. */
  pixels: number;
}>;

/**
 * D2 (coordinator run, metric of record): the mean absolute RGB difference over model pixels, in percent of full
 * scale. Model pixels are those the viewer covers (alpha above 8) or nanoraster draws off the background.
 *
 * @param rendered - nanoraster RGB.
 * @param viewer - Viewer RGB flattened on the background.
 * @param alpha - Viewer coverage.
 * @returns The difference.
 */
export const meanAbsoluteRgbDifference = (
  rendered: ArrayLike<number>,
  viewer: ArrayLike<number>,
  alpha: ArrayLike<number>,
): ViewerParityDifference => {
  let sum = 0;
  let pixels = 0;
  const pixelCount = alpha.length;
  for (let index = 0; index < pixelCount; index++) {
    const offset = index * 3;
    const offBackground =
      Math.abs(rendered[offset]! - backgroundChannel) +
      Math.abs(rendered[offset + 1]! - backgroundChannel) +
      Math.abs(rendered[offset + 2]! - backgroundChannel);
    if (alpha[index]! <= coverageAlpha && offBackground <= renderedCoverageDistance) {
      continue;
    }
    pixels++;
    sum +=
      Math.abs(rendered[offset]! - viewer[offset]!) +
      Math.abs(rendered[offset + 1]! - viewer[offset + 1]!) +
      Math.abs(rendered[offset + 2]! - viewer[offset + 2]!);
  }
  return { percent: pixels === 0 ? 0 : (100 * sum) / (pixels * 3 * 255), pixels };
};

const luminance = (rgb: ArrayLike<number>, index: number): number =>
  (rgb[index * 3]! + rgb[index * 3 + 1]! + rgb[index * 3 + 2]!) / 3;

/**
 * Agreement of the two renderers' ambient occlusion alone: the Pearson correlation of each one's AO-off minus AO-on
 * luminance over pixels both cover. NaN when neither darkens anything (no AO to compare).
 *
 * @param frames - Viewer and nanoraster RGB with AO on and off, and the viewer's coverage.
 * @returns The correlation.
 */
export const ambientOcclusionCorrelation = (
  frames: Readonly<{
    viewerOn: ArrayLike<number>;
    viewerOff: ArrayLike<number>;
    renderedOn: ArrayLike<number>;
    renderedOff: ArrayLike<number>;
    alpha: ArrayLike<number>;
  }>,
): number => {
  let sumX = 0;
  let sumY = 0;
  let sumXx = 0;
  let sumYy = 0;
  let sumXy = 0;
  let count = 0;
  const pixelCount = frames.alpha.length;
  for (let index = 0; index < pixelCount; index++) {
    if (
      frames.alpha[index]! <= aoCoverageAlpha ||
      Math.abs(luminance(frames.renderedOff, index) - backgroundChannel) <= aoRenderedLuminanceDistance
    ) {
      continue;
    }
    const viewerAo = luminance(frames.viewerOff, index) - luminance(frames.viewerOn, index);
    const renderedAo = luminance(frames.renderedOff, index) - luminance(frames.renderedOn, index);
    sumX += viewerAo;
    sumY += renderedAo;
    sumXx += viewerAo * viewerAo;
    sumYy += renderedAo * renderedAo;
    sumXy += viewerAo * renderedAo;
    count++;
  }
  return (count * sumXy - sumX * sumY) / Math.sqrt((count * sumXx - sumX * sumX) * (count * sumYy - sumY * sumY));
};
