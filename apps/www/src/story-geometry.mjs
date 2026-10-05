/** @typedef {{offset: number, length: number}} BufferRange */
/** @typedef {{name: string, color: string, metalness: number, roughness: number, position: BufferRange, normal: BufferRange, index: BufferRange}} StoryMesh */
/** @typedef {{source: string, sha256: string, parts: number, teeth: {sun: number, planet: number, ring: number}, meshes: StoryMesh[]}} StoryManifest */

/**
 * @param value - Untrusted object.
 * @returns Whether object properties can be inspected safely.
 * @type {(value: unknown) => value is Record<string, unknown>}
 */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param value - Manifest buffer range.
 * @param byteLength - Actual decoded geometry bytes.
 * @returns Aligned bounded 32-bit element range.
 * @type {(value: unknown, byteLength: number) => BufferRange}
 */
const parseRange = (value, byteLength) => {
  if (
    !isRecord(value) ||
    typeof value['offset'] !== 'number' ||
    typeof value['length'] !== 'number' ||
    !Number.isSafeInteger(value['offset']) ||
    !Number.isSafeInteger(value['length']) ||
    value['offset'] < 0 ||
    value['offset'] % 4 !== 0 ||
    value['length'] <= 0 ||
    value['length'] % 3 !== 0 ||
    value['offset'] + value['length'] * 4 > byteLength
  ) {
    throw new Error('Invalid geometry buffer range');
  }
  return { offset: value['offset'], length: value['length'] };
};

/**
 * Validate the frozen source metadata before constructing GPU resources.
 * @internal
 * @param value - JSON response or local manifest.
 * @param byteLength - Actual decoded buffer length.
 * @returns Validated metadata for the 34-part assembly.
 * @type {(value: unknown, byteLength: number) => StoryManifest}
 */
export const parseStoryManifest = (value, byteLength) => {
  if (
    !isRecord(value) ||
    typeof value['source'] !== 'string' ||
    typeof value['sha256'] !== 'string' ||
    !/^[a-f\d]{64}$/u.test(value['sha256']) ||
    value['parts'] !== 34 ||
    !Array.isArray(value['meshes']) ||
    value['meshes'].length !== 34 ||
    !isRecord(value['teeth']) ||
    value['teeth']['sun'] !== 24 ||
    value['teeth']['planet'] !== 24 ||
    value['teeth']['ring'] !== 72 ||
    !Number.isSafeInteger(byteLength) ||
    byteLength <= 0
  ) {
    throw new Error('Unexpected assembly manifest');
  }
  /** @type {unknown[]} */
  const entries = value['meshes'];
  const names = new Set();
  const meshes = entries.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry['name'] !== 'string' ||
      entry['name'].length === 0 ||
      names.has(entry['name']) ||
      typeof entry['color'] !== 'string' ||
      !/^#[a-f\d]{6}$/iu.test(entry['color']) ||
      typeof entry['metalness'] !== 'number' ||
      !Number.isFinite(entry['metalness']) ||
      entry['metalness'] < 0 ||
      entry['metalness'] > 1 ||
      typeof entry['roughness'] !== 'number' ||
      !Number.isFinite(entry['roughness']) ||
      entry['roughness'] < 0 ||
      entry['roughness'] > 1
    ) {
      throw new Error('Invalid assembly part');
    }
    names.add(entry['name']);
    const position = parseRange(entry['position'], byteLength);
    const normal = parseRange(entry['normal'], byteLength);
    const index = parseRange(entry['index'], byteLength);
    if (normal.length !== position.length) {
      throw new Error('Geometry normals do not match positions');
    }
    return {
      name: entry['name'],
      color: entry['color'],
      metalness: entry['metalness'],
      roughness: entry['roughness'],
      position,
      normal,
      index,
    };
  });
  return {
    source: value['source'],
    sha256: value['sha256'],
    parts: value['parts'],
    teeth: { sun: value['teeth']['sun'], planet: value['teeth']['planet'], ring: value['teeth']['ring'] },
    meshes,
  };
};

/** @typedef {{source: string, sha256: string, from: {faceWidth: number}, to: {faceWidth: number}, axial: {from: number, to: number}, meshes: Array<{name: string, dz: {offset: number, length: number}}>}} VariantManifest */

/**
 * Validate the authored faceWidth variant against the base manifest it offsets.
 * @internal
 * @param value - JSON response or local manifest.
 * @param base - Validated base manifest.
 * @param byteLength - Decoded offset buffer length.
 * @returns One axial offset range per base vertex.
 * @type {(value: unknown, base: StoryManifest, byteLength: number) => VariantManifest}
 */
export const parseVariantManifest = (value, base, byteLength) => {
  if (
    !isRecord(value) ||
    value['sha256'] !== base.sha256 ||
    value['source'] !== base.source ||
    !isRecord(value['from']) ||
    !isRecord(value['to']) ||
    value['from']['faceWidth'] !== 14 ||
    value['to']['faceWidth'] !== 18 ||
    !isRecord(value['axial']) ||
    typeof value['axial']['from'] !== 'number' ||
    typeof value['axial']['to'] !== 'number' ||
    !Array.isArray(value['meshes']) ||
    value['meshes'].length !== base.meshes.length
  ) {
    throw new Error('Unexpected variant geometry manifest');
  }
  /** @type {unknown[]} */
  const entries = value['meshes'];
  const meshes = entries.map((entry, index) => {
    const part = base.meshes[index];
    if (!isRecord(entry) || !part || entry['name'] !== part.name || !isRecord(entry['dz'])) {
      throw new Error('Variant geometry part mismatch');
    }
    const { offset, length } = entry['dz'];
    if (
      typeof offset !== 'number' ||
      typeof length !== 'number' ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset % 4 !== 0 ||
      length * 3 !== part.position.length ||
      offset + length * 4 > byteLength
    ) {
      throw new Error('Invalid variant geometry range');
    }
    return { name: part.name, dz: { offset, length } };
  });
  return {
    source: base.source,
    sha256: base.sha256,
    from: { faceWidth: 14 },
    to: { faceWidth: 18 },
    axial: { from: value['axial']['from'], to: value['axial']['to'] },
    meshes,
  };
};
