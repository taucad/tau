// S2 smoke test: load the napi addon, render the gear fixture on the native
// GPU (Metal locally; lavapipe/WARP in CI), and assert the PNG shape.
// createRequire is the sanctioned way to load a .node addon from ESM.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const requireNative = createRequire(import.meta.url);
const native =
  /** @type {{ renderGlbToImage: (glb: Buffer, optionsJson: string) => Buffer, renderGlbToImages: (glb: Buffer, optionsJson: string) => Buffer[], describeAdapter: () => string }} */ (
    requireNative('./render-napi.node')
  );

console.log('adapter:', native.describeAdapter());

const glb = readFileSync(join(here, 'fixtures', 'gear-12.glb'));
const interleavedGlb = readFileSync(join(here, 'fixtures', 'interleaved-instanced-lines.glb'));
const started = Date.now();
const png = native.renderGlbToImage(glb, JSON.stringify({ width: 768, height: 432, format: 'png' }));
console.log(`rendered in ${Date.now() - started}ms, ${png.length} bytes`);

if (!(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47)) {
  throw new Error('output is not a PNG');
}
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (width !== 768 || height !== 432) {
  throw new Error(`expected 768x432, got ${width}x${height}`);
}
const interleavedPng = native.renderGlbToImage(
  interleavedGlb,
  JSON.stringify({ width: 768, height: 576, format: 'png' }),
);
if (
  !(interleavedPng[0] === 0x89 && interleavedPng[1] === 0x50) ||
  interleavedPng.readUInt32BE(16) !== 768 ||
  interleavedPng.readUInt32BE(20) !== 576
) {
  throw new Error('interleaved/instanced fixture did not produce a 768x576 PNG');
}
const webp = native.renderGlbToImage(glb, JSON.stringify({ width: 768, height: 432, format: 'webp' }));
if (webp.toString('latin1', 0, 4) !== 'RIFF' || webp.toString('latin1', 8, 12) !== 'WEBP') {
  throw new Error('webp output is not a WebP');
}

const jpeg = native.renderGlbToImage(
  glb,
  JSON.stringify({ width: 768, height: 432, format: 'jpeg', quality: 0.85, background: [1, 1, 1, 1] }),
);
if (!(jpeg[0] === 0xff && jpeg[1] === 0xd8)) {
  throw new Error('jpeg output is not a JPEG');
}

// The taxonomy contract: jpeg on a transparent background must refuse.
let transparentJpegError = '';
try {
  native.renderGlbToImage(glb, JSON.stringify({ width: 768, height: 432, format: 'jpeg' }));
} catch (error) {
  transparentJpegError = String(error instanceof Error ? error.message : error);
}
if (!transparentJpegError.startsWith('encode:')) {
  throw new Error(`expected encode: error for transparent jpeg, got: ${transparentJpegError || 'no error'}`);
}

const shared = { width: 768, height: 432, format: 'png' };
const views = [
  { id: 'front', phi: 90, theta: 0 },
  { id: 'top', phi: 0, theta: 0 },
];
const batch = native.renderGlbToImages(glb, JSON.stringify({ ...shared, views }));
if (batch.length !== views.length || !Buffer.isBuffer(batch[0]) || !Buffer.isBuffer(batch[1])) {
  throw new Error('batch output is not an ordered Buffer array');
}
for (const [index, view] of views.entries()) {
  const singularView = native.renderGlbToImage(glb, JSON.stringify({ ...shared, phi: view.phi, theta: view.theta }));
  if (!batch[index].equals(singularView)) {
    throw new Error(`batch view ${view.id} differs from singular bytes`);
  }
}
const axesRequest = { ...shared, phi: 60, theta: -45, includeAxes: true };
const explicitAxesOff = native.renderGlbToImage(
  glb,
  JSON.stringify({ ...shared, phi: 60, theta: -45, includeAxes: false }),
);
const axes = native.renderGlbToImage(glb, JSON.stringify(axesRequest));
const axesBatch = native.renderGlbToImages(
  glb,
  JSON.stringify({ ...shared, includeAxes: true, views: [{ id: 'isometric', phi: 60, theta: -45 }] }),
);
if (!explicitAxesOff.equals(png) || axes.equals(png) || axesBatch.length !== 1 || !axesBatch[0].equals(axes)) {
  throw new Error('axes output must differ from axes-off and match one-view batch bytes');
}

const parityViews = [
  { id: 'isometric', phi: 60, theta: -45 },
  { id: 'front', phi: 90, theta: 0 },
  { id: 'top', phi: 0, theta: 0 },
  { id: 'right', phi: 90, theta: 90 },
];
let parityCases = 0;
const parityOptions = ['png', 'webp', 'jpeg'].flatMap((format) =>
  ['perspective', 'orthographic'].flatMap((projection) =>
    [undefined, false, true].map((includeAxes) => ({ format, projection, includeAxes })),
  ),
);
for (const { format, projection, includeAxes } of parityOptions) {
  const common = {
    width: 320,
    height: 240,
    format,
    projection,
    ...(format === 'jpeg' ? { background: [1, 1, 1, 1] } : {}),
    ...(includeAxes === undefined ? {} : { includeAxes }),
  };
  const images = native.renderGlbToImages(glb, JSON.stringify({ ...common, views: parityViews }));
  for (const [index, view] of parityViews.entries()) {
    const one = native.renderGlbToImage(glb, JSON.stringify({ ...common, phi: view.phi, theta: view.theta }));
    if (!images[index].equals(one)) {
      throw new Error(`${format}/${projection}/axes=${String(includeAxes)} view ${view.id} differs`);
    }
    parityCases += 1;
  }
  const reordered = [
    { ...parityViews[3], id: 'right-first' },
    parityViews[0],
    { ...parityViews[3], id: 'right-second' },
  ];
  const repeated = native.renderGlbToImages(glb, JSON.stringify({ ...common, views: reordered }));
  if (!repeated[0].equals(repeated[2])) {
    throw new Error(`${format}/${projection}/axes=${String(includeAxes)} repeated view differs`);
  }
}

let validationError = '';
try {
  native.renderGlbToImages(Buffer.from([0]), JSON.stringify({ views: [], unexpected: true }));
} catch (error) {
  validationError = String(error instanceof Error ? error.message : error);
}
if (!validationError.startsWith('parse:') || validationError.includes('GLB')) {
  throw new Error(`request validation did not precede GLB parsing: ${validationError || 'no error'}`);
}
let glbError = '';
try {
  native.renderGlbToImage(Buffer.from([0]), JSON.stringify(shared));
} catch (error) {
  glbError = String(error instanceof Error ? error.message : error);
}
if (!glbError.startsWith('parse:')) {
  throw new Error(`invalid GLB did not produce a parse: error: ${glbError || 'no error'}`);
}
let atomicError = '';
try {
  native.renderGlbToImages(glb, JSON.stringify({ format: 'jpeg', views: parityViews.slice(0, 2) }));
} catch (error) {
  atomicError = String(error instanceof Error ? error.message : error);
}
if (!atomicError.startsWith('encode: view "isometric":')) {
  throw new Error(`expected a view-qualified atomic batch failure, got: ${atomicError || 'no error'}`);
}

mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out', 'napi.png'), png);
writeFileSync(join(here, 'out', 'napi.webp'), webp);
writeFileSync(join(here, 'out', 'napi.jpg'), jpeg);
writeFileSync(join(here, 'out', 'napi-axes.png'), axes);
writeFileSync(join(here, 'out', 'napi-interleaved.png'), interleavedPng);
console.log(`webp ${webp.length}B, jpeg ${jpeg.length}B, transparent-jpeg rejected`);
console.log(`batch ${batch.length} views matches singular bytes`);
console.log(`${parityCases} singular/batch parity cases plus reordered/repeated batches passed`);
console.log('PASS → spike/out/napi.{png,webp,jpg} + napi-axes.png + napi-interleaved.png');
