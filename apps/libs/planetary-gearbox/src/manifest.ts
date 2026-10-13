/**
 * A 32-bit element range in a decoded geometry buffer.
 * @public
 */
export type BufferRange = { readonly offset: number; readonly length: number };

/**
 * One authored part of the frozen tessellation.
 * @public
 */
export type AssemblyMesh = {
  readonly name: string;
  readonly color: string;
  readonly metalness: number;
  readonly roughness: number;
  readonly position: BufferRange;
  readonly normal: BufferRange;
  readonly index: BufferRange;
};

/**
 * Validated metadata of the 34-part assembly.
 * @public
 */
export type AssemblyManifest = {
  readonly source: string;
  readonly sha256: string;
  readonly parts: number;
  readonly teeth: { readonly sun: number; readonly planet: number; readonly ring: number };
  readonly meshes: readonly AssemblyMesh[];
};

/**
 * Validated `faceWidth` 14 → 18 variant: one axial offset per base vertex.
 * @public
 */
export type VariantManifest = {
  readonly source: string;
  readonly sha256: string;
  readonly from: { readonly faceWidth: 14 };
  readonly to: { readonly faceWidth: 18 };
  readonly axial: { readonly from: number; readonly to: number };
  readonly meshes: ReadonlyArray<{ readonly name: string; readonly dz: BufferRange }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSafeOffset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value % 4 === 0;

const isUnitInterval = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const parseRange = (value: unknown, byteLength: number): BufferRange => {
  if (
    !isRecord(value) ||
    !isSafeOffset(value['offset']) ||
    typeof value['length'] !== 'number' ||
    !Number.isSafeInteger(value['length']) ||
    value['length'] <= 0 ||
    value['length'] % 3 !== 0 ||
    value['offset'] + value['length'] * 4 > byteLength
  ) {
    throw new Error('Invalid geometry buffer range');
  }
  return { offset: value['offset'], length: value['length'] };
};

/**
 * Validate the frozen tessellation metadata before allocating typed arrays or GPU resources.
 * @param value - JSON response or local manifest.
 * @param byteLength - Actual decoded geometry buffer length.
 * @returns The validated 34-part manifest.
 * @throws Error when the manifest is not the authored assembly or a range is out of bounds.
 * @public
 */
export const parseAssemblyManifest = (value: unknown, byteLength: number): AssemblyManifest => {
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
  const names = new Set<string>();
  const meshes = (value['meshes'] as unknown[]).map((entry): AssemblyMesh => {
    if (
      !isRecord(entry) ||
      typeof entry['name'] !== 'string' ||
      entry['name'].length === 0 ||
      names.has(entry['name']) ||
      typeof entry['color'] !== 'string' ||
      !/^#[a-f\d]{6}$/iu.test(entry['color']) ||
      !isUnitInterval(entry['metalness']) ||
      !isUnitInterval(entry['roughness'])
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
    parts: 34,
    teeth: { sun: 24, planet: 24, ring: 72 },
    meshes,
  };
};

/**
 * Validate the authored `faceWidth` variant against the base manifest it offsets.
 * @param value - JSON response or local manifest.
 * @param base - Validated base manifest.
 * @param byteLength - Decoded offset buffer length.
 * @returns One axial offset range per base vertex.
 * @throws Error when the variant belongs to another model or a range is out of bounds.
 * @public
 */
export const parseVariantManifest = (value: unknown, base: AssemblyManifest, byteLength: number): VariantManifest => {
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
  const meshes = (value['meshes'] as unknown[]).map((entry, index) => {
    const part = base.meshes[index];
    if (!isRecord(entry) || !part || entry['name'] !== part.name || !isRecord(entry['dz'])) {
      throw new Error('Variant geometry part mismatch');
    }
    const { offset, length } = entry['dz'];
    if (
      !isSafeOffset(offset) ||
      typeof length !== 'number' ||
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
