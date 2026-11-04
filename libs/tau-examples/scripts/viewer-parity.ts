/**
 * Viewer parity gate helpers (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6, metric D2): the fixture
 * manifest, the image options Tau's editor capture sends for a viewer camera, the nanoraster module under test, and
 * the mean absolute RGB difference over model pixels.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { buildViewerCaptureImageOptions } from '@taucad/agent-tools/capture';
import { imageEdgeSchemas, toNanorasterCamera } from '@taucad/image';

/** D2: every fixture under this mean absolute RGB difference, percent of full scale. */
export const viewerParityThresholdPercent = 1;
/** The parity frame: the viewer's reference viewport in CSS pixels at pixel ratio 1. */
export const viewerParitySize = { width: 768, height: 576 } as const;
/** The dark-scheme capture background, `#242424`, one channel. */
const backgroundChannel = 0x24;
const captureBackground = '#242424';
/** Tau's root frame, as every capture sends it. */
const tauWorld = { up: '+z', forward: '-y', unit: 'meter' } as const;
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
  /** SHA-256 of the pinned GLB bytes. */
  sha256: string;
  /** Set while the fixture is known to fail D2: the reason and its owner. The gate then expects it to fail. */
  knownFailure?: string;
}>;

/** The parity fixture manifest. @public */
export type ViewerParityManifest = Readonly<{ fixtures: readonly ViewerParityFixture[] }>;

/** The viewer camera a reference was captured with: Tau's renderer-neutral camera state. */
export type ViewerParityCameraState = Parameters<typeof toNanorasterCamera>[0]['cameraState'];

/** A viewer reference written by `packages/viewer` `viewer-parity-capture.browser.test.tsx`. @public */
export type ViewerParityReference = Readonly<{
  /** The captured frame, a PNG with the canvas's own alpha. */
  png: string;
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
  const stem = join(viewerDirectory, name, `viewer.webgpu.${ao ? 'ao-on' : 'ao-off'}`);
  if (!existsSync(`${stem}.png`) || !existsSync(`${stem}.json`)) {
    return undefined;
  }
  const meta = JSON.parse(readFileSync(`${stem}.json`, 'utf8')) as Omit<ViewerParityReference, 'png'>;
  return { ...meta, png: `${stem}.png` };
};

/**
 * The image export options Tau's editor capture sends for a viewer camera at the parity frame
 * (`apps/ui/app/services/headless-capture.ts`): the viewer render profile through `buildViewerCaptureImageOptions`,
 * the dark-scheme background, Tau's world, and the viewer camera through `toNanorasterCamera`, validated by the image
 * transcoder's own schema. With `ao: false` only the AO intensity changes, to 0: the AO-off diagnostic split.
 *
 * @param input - The viewer camera and whether ambient occlusion is on.
 * @param input.camera - The viewer camera state of the reference frame.
 * @param input.ao - Whether ambient occlusion is on.
 * @returns The validated single-image options, exactly as the transcoder receives them.
 */
export type ViewerParityImageOptions = ReturnType<typeof imageEdgeSchemas.png.parse>;

export const buildViewerParityImageOptions = ({
  camera,
  ao,
}: {
  camera: ViewerParityCameraState;
  ao: boolean;
}): ViewerParityImageOptions => {
  const look = buildViewerCaptureImageOptions({ ...viewerParitySize, colorScheme: 'dark' });
  return imageEdgeSchemas.png.parse({
    mode: 'single',
    ...viewerParitySize,
    ...look,
    ao: ao ? look.ao : { ...look.ao, intensity: 0 },
    background: captureBackground,
    world: tauWorld,
    camera: toNanorasterCamera({ cameraState: camera }),
  });
};

/**
 * The part of nanoraster's module the gate calls. Structural, because tau-examples reaches nanoraster only through
 * `@taucad/image` and the module under test may be a checkout of a newer version than the installed types.
 */
export type ViewerParityNanorasterModule = Readonly<{
  renderImages: (
    glb: Uint8Array<ArrayBuffer>,
    options: Readonly<Record<string, unknown>>,
  ) => Promise<ReadonlyArray<{ readonly file: { readonly bytes: Uint8Array<ArrayBuffer> } }>>;
  describeAdapter: () => Promise<unknown>;
}>;

/** The nanoraster module under test and where it came from. @public */
export type ViewerParityRenderer = Readonly<{
  module: ViewerParityNanorasterModule;
  /** `package nanoraster@<version>` or `checkout <path>`. */
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
 * Load the nanoraster under test. `TAU_PARITY_NANORASTER` names a nanoraster checkout with a built native addon
 * (`pnpm run build:napi`): the program branch until its release. Without it the package `@taucad/image` installs is
 * used, which must be the parity release (0.9.0) or later; an older one cannot accept the viewer-parity options.
 *
 * @param checkout - `TAU_PARITY_NANORASTER`, if set.
 * @param workspaceRoot - The Tau checkout.
 * @returns The module and its source.
 */
export const loadViewerParityRenderer = async (
  checkout: string | undefined,
  workspaceRoot: string,
): Promise<ViewerParityRenderer> => {
  if (checkout) {
    const entry = join(resolve(checkout), 'src', 'index.node.ts');
    if (!existsSync(entry)) {
      throw new Error(`TAU_PARITY_NANORASTER is not a nanoraster checkout: ${entry} does not exist`);
    }
    const module = (await import(pathToFileURL(entry).href)) as ViewerParityNanorasterModule;
    return { module, source: `checkout ${resolve(checkout)}` };
  }
  // `require.resolve('nanoraster')` returns the CommonJS stub that throws; load the Node ESM build by path.
  const requireFromImage = createRequire(join(workspaceRoot, 'packages', 'plugins', 'image', 'package.json'));
  const packageJsonPath = requireFromImage.resolve('nanoraster/package.json');
  const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };
  if (!declaresParityOptions(version)) {
    throw new Error(
      `The installed nanoraster ${version} predates the viewer-parity options (0.9.0); set TAU_PARITY_NANORASTER to a nanoraster checkout built with \`pnpm run build:napi\``,
    );
  }
  const module = (await import(
    pathToFileURL(join(dirname(packageJsonPath), 'dist', 'index.node.mjs')).href
  )) as ViewerParityNanorasterModule;
  return { module, source: `package nanoraster@${version}` };
};

/**
 * Render the options as the image transcoder does for a single image (`image.transcoder.ts`), with every
 * viewer-parity option passed through: the transcoder withholds them only while the installed nanoraster predates
 * them.
 *
 * @param renderer - The nanoraster module.
 * @param glb - The fixture bytes.
 * @param options - Options from {@link buildViewerParityImageOptions}.
 * @returns The PNG bytes.
 */
export const renderViewerParityImage = async (
  renderer: ViewerParityNanorasterModule,
  glb: Uint8Array<ArrayBuffer>,
  options: ViewerParityImageOptions,
): Promise<Uint8Array<ArrayBuffer>> => {
  if (options.mode !== 'single') {
    throw new TypeError('Viewer parity renders single images');
  }
  const { mode: _mode, camera, label, sections: _sections, ...renderOptions } = options;
  const [image] = await renderer.renderImages(glb, {
    format: 'png',
    ...renderOptions,
    views: [{ id: 'single', camera, label }],
  });
  if (!image) {
    throw new Error('nanoraster returned no image');
  }
  return image.file.bytes;
};

/** Raw RGB of an image flattened on the capture background. */
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
