#!/usr/bin/env node
/**
 * Compare aligned renderer PNGs using an explicit geometry alpha mask.
 *
 * Required: --reference PNG --candidate PNG --mask PNG --output JSON.
 * Optional: --regions JSON containing [{ name, x, y, width, height }].
 * Usage: node apps/ui/scripts/render-calibration/compare.mts --self-check
 * Exit codes: 0 comparison/self-check completed; 1 invalid inputs or decoder/check failure.
 * Scores describe pixels; they are not human preference, task performance, or an acceptance gate.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

type DecodedImage = { data: Uint8Array<ArrayBuffer>; width: number; height: number; hasAlpha: boolean };
type Rectangle = { name: string; x: number; y: number; width: number; height: number };
type SharpPipeline = {
  metadata(): Promise<{ format?: string; hasAlpha?: boolean }>;
  ensureAlpha(): SharpPipeline;
  toColourspace(space: 'srgb'): SharpPipeline;
  raw(): SharpPipeline;
  png(): SharpPipeline;
  toBuffer(): Promise<Uint8Array<ArrayBuffer>>;
  toBuffer(options: { resolveWithObject: true }): Promise<{
    data: Uint8Array<ArrayBuffer>;
    info: { width: number; height: number; channels: number };
  }>;
};
type SharpFactory = (
  input: Uint8Array<ArrayBuffer>,
  options?: {
    raw?: { width: number; height: number; channels: 4 };
  },
) => SharpPipeline;

// Resolve the already-installed image decoder through its package owner. This
// narrow boundary describes only the documented methods used by this offline CLI.
const decoderRequire = createRequire(new URL('../../../../libs/tau-examples/package.json', import.meta.url));
const loadedDecoder: unknown = decoderRequire('sharp');
assert.equal(typeof loadedDecoder, 'function', 'The installed sharp decoder must be callable');
const sharp = loadedDecoder as SharpFactory;
const decoderPackage = decoderRequire('sharp/package.json') as { version: string };
const thresholds = { geometryAlpha: 128, nearBlackLinearLuminance: 0.01, clippedSrgbCode: 254 };
const hash = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const linearSrgb = Float64Array.from({ length: 256 }, (_, code) => {
  const value = code / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});

const decode = async (bytes: Uint8Array<ArrayBuffer>): Promise<DecodedImage> => {
  const pipeline = sharp(bytes);
  const metadata = await pipeline.metadata();
  assert.equal(metadata.format, 'png', 'Comparison inputs must be PNG files');
  const { data, info } = await pipeline.toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4, 'Expected an 8-bit RGBA decoder result');
  assert.equal(data.length, info.width * info.height * 4, 'Unexpected decoded PNG byte length');
  return { data, width: info.width, height: info.height, hasAlpha: metadata.hasAlpha ?? false };
};

const percentile = (sorted: Float64Array<ArrayBuffer>, fraction: number): number =>
  sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;

const distribution = (values: Float64Array<ArrayBuffer>) => {
  values.sort();
  return { p05: percentile(values, 0.05), p50: percentile(values, 0.5), p95: percentile(values, 0.95) };
};

const compareRegion = (
  images: { reference: DecodedImage; candidate: DecodedImage; mask: DecodedImage },
  region: Rectangle,
) => {
  const { reference, candidate, mask } = images;
  const selected: number[] = [];
  for (let { y } = region; y < region.y + region.height; y++) {
    for (let { x } = region; x < region.x + region.width; x++) {
      const offset = (y * reference.width + x) * 4;
      if (mask.data[offset + 3]! >= thresholds.geometryAlpha) {
        selected.push(offset);
      }
    }
  }
  if (selected.length === 0) {
    return { name: region.name, rectangle: region, pixels: 0, status: 'empty geometry mask' };
  }
  const referenceLuminance = new Float64Array(selected.length);
  const candidateLuminance = new Float64Array(selected.length);
  const errorHistogram = new Uint32Array(766);
  let absoluteError = 0;
  let squaredError = 0;
  const counts = { referenceNearBlack: 0, candidateNearBlack: 0, referenceClipped: 0, candidateClipped: 0 };
  for (const [pixel, offset] of selected.entries()) {
    let difference = 0;
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(reference.data[offset + channel]! - candidate.data[offset + channel]!);
      difference += delta;
      squaredError += delta * delta;
    }
    absoluteError += difference;
    errorHistogram[difference]! += 1;
    referenceLuminance[pixel] =
      linearSrgb[reference.data[offset]!]! * 0.2126 +
      linearSrgb[reference.data[offset + 1]!]! * 0.7152 +
      linearSrgb[reference.data[offset + 2]!]! * 0.0722;
    candidateLuminance[pixel] =
      linearSrgb[candidate.data[offset]!]! * 0.2126 +
      linearSrgb[candidate.data[offset + 1]!]! * 0.7152 +
      linearSrgb[candidate.data[offset + 2]!]! * 0.0722;
    counts.referenceNearBlack += Number(referenceLuminance[pixel] <= thresholds.nearBlackLinearLuminance);
    counts.candidateNearBlack += Number(candidateLuminance[pixel] <= thresholds.nearBlackLinearLuminance);
    counts.referenceClipped += Number(
      Math.max(reference.data[offset]!, reference.data[offset + 1]!, reference.data[offset + 2]!) >=
        thresholds.clippedSrgbCode,
    );
    counts.candidateClipped += Number(
      Math.max(candidate.data[offset]!, candidate.data[offset + 1]!, candidate.data[offset + 2]!) >=
        thresholds.clippedSrgbCode,
    );
  }
  let cumulative = 0;
  let p95 = 0;
  for (const [sum, count] of errorHistogram.entries()) {
    cumulative += count;
    if (cumulative >= Math.ceil(selected.length * 0.95)) {
      p95 = sum / 3;
      break;
    }
  }
  return {
    name: region.name,
    rectangle: region,
    pixels: selected.length,
    srgbError: {
      mae: absoluteError / (selected.length * 3),
      rmse: Math.sqrt(squaredError / (selected.length * 3)),
      p95,
    },
    reference: {
      linearLuminance: distribution(referenceLuminance),
      nearBlackFraction: counts.referenceNearBlack / selected.length,
      clippedFraction: counts.referenceClipped / selected.length,
    },
    candidate: {
      linearLuminance: distribution(candidateLuminance),
      nearBlackFraction: counts.candidateNearBlack / selected.length,
      clippedFraction: counts.candidateClipped / selected.length,
    },
  };
};

const silhouette = (reference: DecodedImage, candidate: DecodedImage) => {
  let referenceForeground = 0;
  let candidateForeground = 0;
  let intersection = 0;
  let union = 0;
  for (let offset = 3; offset < reference.data.length; offset += 4) {
    const referenceInside = reference.data[offset]! >= thresholds.geometryAlpha;
    const candidateInside = candidate.data[offset]! >= thresholds.geometryAlpha;
    referenceForeground += Number(referenceInside);
    candidateForeground += Number(candidateInside);
    intersection += Number(referenceInside && candidateInside);
    union += Number(referenceInside || candidateInside);
  }
  const pixels = reference.width * reference.height;
  const meaningful =
    reference.hasAlpha &&
    candidate.hasAlpha &&
    referenceForeground > 0 &&
    referenceForeground < pixels &&
    candidateForeground > 0 &&
    candidateForeground < pixels;
  return meaningful
    ? {
        iou: intersection / union,
        intersectionPixels: intersection,
        unionPixels: union,
        scope: 'entire image alpha, before ROI masking',
      }
    : {
        iou: null,
        reason:
          'Both PNGs must have alpha containing foreground and background; an opaque background is not a silhouette.',
      };
};

const readRegions = (value: unknown, dimensions: { width: number; height: number }): Rectangle[] => {
  assert.ok(Array.isArray(value), 'Regions JSON must be an array of named integer pixel rectangles');
  const names = new Set<string>();
  return value.map((entry: unknown): Rectangle => {
    assert.ok(entry !== null && typeof entry === 'object', 'Every region must be an object');
    assert.ok('name' in entry && typeof entry.name === 'string' && entry.name.length > 0, 'A region needs a name');
    assert.ok(
      'x' in entry && typeof entry.x === 'number' && Number.isInteger(entry.x) && entry.x >= 0,
      'Invalid region x',
    );
    assert.ok(
      'y' in entry && typeof entry.y === 'number' && Number.isInteger(entry.y) && entry.y >= 0,
      'Invalid region y',
    );
    assert.ok(
      'width' in entry && typeof entry.width === 'number' && Number.isInteger(entry.width) && entry.width > 0,
      'Invalid region width',
    );
    assert.ok(
      'height' in entry && typeof entry.height === 'number' && Number.isInteger(entry.height) && entry.height > 0,
      'Invalid region height',
    );
    assert.ok(
      entry.x + entry.width <= dimensions.width && entry.y + entry.height <= dimensions.height,
      'Region extends outside the image',
    );
    assert.ok(!names.has(entry.name), `Duplicate region name: ${entry.name}`);
    names.add(entry.name);
    return { name: entry.name, x: entry.x, y: entry.y, width: entry.width, height: entry.height };
  });
};

const compare = (
  images: { reference: DecodedImage; candidate: DecodedImage; mask: DecodedImage },
  regions: Rectangle[] = [],
) => {
  const { reference, candidate, mask } = images;
  assert.equal(
    candidate.width,
    reference.width,
    'Reference/candidate widths differ; no automatic resizing or registration',
  );
  assert.equal(
    candidate.height,
    reference.height,
    'Reference/candidate heights differ; no automatic resizing or registration',
  );
  assert.equal(mask.width, reference.width, 'Geometry mask width differs');
  assert.equal(mask.height, reference.height, 'Geometry mask height differs');
  assert.ok(mask.hasAlpha, 'Geometry mask must have an explicit alpha channel; brightness is not a geometry mask');
  const all = compareRegion(images, {
    name: 'all geometry',
    x: 0,
    y: 0,
    width: reference.width,
    height: reference.height,
  });
  assert.ok(all.pixels > 0, 'Geometry mask selects no pixels');
  return {
    width: reference.width,
    height: reference.height,
    all,
    regions: regions.map((region) => compareRegion(images, region)),
    silhouette: silhouette(reference, candidate),
  };
};

const selfCheck = async (): Promise<void> => {
  const referenceRaw = new Uint8Array([100, 100, 100, 255, 200, 200, 200, 255, 17, 44, 230, 0]);
  const candidateRaw = new Uint8Array([110, 110, 110, 255, 210, 210, 210, 255, 250, 3, 0, 0]);
  const encode = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
    sharp(data, { raw: { width: 3, height: 1, channels: 4 } })
      .png()
      .toBuffer();
  const [reference, candidate] = await Promise.all([
    encode(referenceRaw).then(decode),
    encode(candidateRaw).then(decode),
  ]);
  const identical = compare({ reference, candidate: reference, mask: reference });
  assert.ok(identical.all.srgbError);
  assert.equal(identical.all.srgbError.mae, 0);
  assert.equal(identical.all.srgbError.rmse, 0);
  assert.equal(identical.silhouette.iou, 1);
  const offset = compare({ reference, candidate, mask: reference }, [
    { name: 'first pixel', x: 0, y: 0, width: 1, height: 1 },
  ]);
  assert.equal(offset.all.pixels, 2, 'Background colors must not participate');
  assert.ok(offset.all.srgbError);
  assert.equal(offset.all.srgbError.mae, 10);
  assert.equal(offset.all.srgbError.rmse, 10);
  assert.equal(offset.all.srgbError.p95, 10);
  assert.equal(offset.regions[0]!.srgbError?.mae, 10);
  assert.ok(Math.abs(offset.all.reference.linearLuminance.p05 - ((100 / 255 + 0.055) / 1.055) ** 2.4) < 1e-12);
  assert.throws(() => compare({ reference, candidate: { ...candidate, width: 4 }, mask: reference }), /widths differ/u);
  assert.throws(() => compare({ reference, candidate, mask: { ...reference, hasAlpha: false } }), /explicit alpha/u);
  console.log(
    'PNG comparison self-check passed: exact/offset pixels, mask exclusion, luminance, dimensions and alpha semantics.',
  );
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      reference: { type: 'string' },
      candidate: { type: 'string' },
      mask: { type: 'string' },
      regions: { type: 'string' },
      output: { type: 'string' },
      'self-check': { type: 'boolean', default: false },
    },
  });
  if (values['self-check']) {
    await selfCheck();
    return;
  }
  assert.ok(
    values.reference && values.candidate && values.mask && values.output,
    'Pass --reference PNG --candidate PNG --mask PNG --output JSON, or --self-check',
  );
  const [referenceBytes, candidateBytes, maskBytes] = await Promise.all(
    [values.reference, values.candidate, values.mask].map(async (path) => new Uint8Array(await readFile(path))),
  );
  const [reference, candidate, mask] = await Promise.all([
    decode(referenceBytes!),
    decode(candidateBytes!),
    decode(maskBytes!),
  ]);
  const regions = values.regions
    ? readRegions(JSON.parse(await readFile(values.regions, 'utf8')) as unknown, reference)
    : [];
  const scores = compare({ reference, candidate, mask }, regions);
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        decoder: { name: 'sharp', version: decoderPackage.version },
        inputs: {
          reference: { path: resolve(values.reference), sha256: hash(referenceBytes!) },
          candidate: { path: resolve(values.candidate), sha256: hash(candidateBytes!) },
          mask: { path: resolve(values.mask), sha256: hash(maskBytes!) },
        },
        thresholds,
        definitions: {
          srgbError: '8-bit sRGB code values: MAE/RMSE over RGB channels; p95 is nearest-rank per-pixel RGB MAE.',
          luminance: 'Linear-light Rec.709 weights after inverse sRGB transfer; nearest-rank percentiles.',
          clippedFraction: 'Fraction with any sRGB channel >= 254; a diagnostic, not proof of lost source detail.',
          mask: 'Include pixels whose geometry-mask alpha >= 128; no brightness masks or alpha weighting.',
          transforms:
            'Decode PNG to 8-bit sRGB RGBA, including explicit color-space conversion; no resize, registration or exposure normalization.',
          limitation:
            'Pixel differences do not establish human preference or editing task performance; camera/lighting metadata must be matched separately.',
        },
        ...scores,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Compared ${scores.all.pixels} geometry pixels; report: ${output}`);
};

try {
  await main();
} catch (error) {
  console.error('Renderer PNG comparison failed:', error);
  process.exitCode = 1;
}
