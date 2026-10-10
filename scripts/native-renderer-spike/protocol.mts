import { createHash } from 'node:crypto';

export const limits = Object.freeze({ bytes: 64 * 1024 * 1024, assets: 128, control: 16384 });
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const safeUri = (uri) => typeof uri === 'string' && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(uri);
export const parseGlb = (bytes) => {
  if (
    bytes.length < 20 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw new Error('Invalid GLB header');
  const length = bytes.readUInt32LE(12);
  if (
    length > limits.control * 128 ||
    length % 4 ||
    20 + length > bytes.length ||
    bytes.readUInt32LE(16) !== 0x4e4f534a
  )
    throw new Error('Invalid GLB JSON');
  const doc = JSON.parse(bytes.subarray(20, 20 + length).toString());
  if (doc.asset?.version !== '2.0') throw new Error('Unsupported glTF version');
  return doc;
};

// Receives already-authorized bytes from RuntimeClient/publication owner. No filesystem authority.
export const admit = (geometry, resources = new Map()) => {
  if (geometry.format !== 'gltf') throw new Error('Native spike requires glTF');
  const bytes = Buffer.from(geometry.content);
  if (bytes.length > limits.bytes) throw new Error('Asset budget exceeded');
  const doc = parseGlb(bytes);
  const extensions = [...(doc.extensionsUsed ?? []), ...(doc.extensionsRequired ?? [])];
  if (
    extensions.some((name) => name !== 'KHR_materials_unlit') ||
    doc.textures?.length ||
    doc.skins?.length ||
    doc.animations?.length ||
    (doc.materials ?? []).some(
      (material) => !material.extensions?.KHR_materials_unlit || (material.alphaMode ?? 'OPAQUE') !== 'OPAQUE',
    )
  )
    throw new Error('Unsupported native profile; retain existing renderer');
  const entries = [...(doc.buffers ?? []), ...(doc.images ?? [])];
  const assets = new Map();
  const dependencies = Object.create(null);
  let total = bytes.length;
  for (const { uri } of entries) {
    if (uri === undefined) continue;
    // Deliberately deny data/remote/path URIs. Owner supplies a confined, explicit closure.
    if (!safeUri(uri) || !resources.has(uri)) throw new Error('Missing or forbidden dependency');
    const value = Buffer.from(resources.get(uri));
    const hash = digest(value);
    if (!assets.has(hash)) total += value.length;
    if (total > limits.bytes || assets.size >= limits.assets) throw new Error('Closure budget exceeded');
    assets.set(hash, value);
    dependencies[uri] = Object.freeze({ digest: hash, bytes: value.length });
  }
  const root = digest(bytes);
  assets.set(root, bytes);
  return { assets, root, dependencies: Object.freeze(dependencies), bytes: total };
};

export const validateView = (view) => {
  if (
    !view ||
    Object.keys(view).some((key) => !['angle', 'intensity'].includes(key)) ||
    !Number.isFinite(view.angle) ||
    !Number.isFinite(view.intensity) ||
    Math.abs(view.angle) > 10000 ||
    view.intensity < 0 ||
    view.intensity > 2
  )
    throw new Error('Invalid view');
  return { angle: view.angle, intensity: view.intensity };
};
export const manifest = (closure, revision, view) => ({
  version: 1,
  revision,
  profile: 'opaque-unlit-triangles-v1',
  asset: { digest: closure.root, bytes: closure.assets.get(closure.root).length, dependencies: closure.dependencies },
  view: validateView(view),
  camera: { target: [0, 0, 0], distance: 24, fov: 45, near: 0.1, far: 100 },
  viewport: { width: 640, height: 480, samples: 4 },
});
