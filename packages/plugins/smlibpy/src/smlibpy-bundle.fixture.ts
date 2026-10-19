// Test fixture: writes the mesh bundle the Python worker writes (`worker.py` `_Bundle`), so the TypeScript reader and
// the kernel are tested against the same layout without a Python process.

/** One shape as plain arrays, with the appearance keys the worker copies from its config. */
export type BundleShape = {
  readonly name?: string;
  readonly color?: string;
  readonly opacity?: number;
  readonly metalness?: number;
  readonly roughness?: number;
  readonly material?: Record<string, unknown>;
  readonly vertices: readonly number[];
  readonly normals: readonly number[];
  readonly triangles: readonly number[];
  readonly faceGroups: ReadonlyArray<{ start: number; count: number; faceId: number }>;
  readonly lines?: readonly number[];
  readonly edgeGroups?: ReadonlyArray<{ start: number; count: number; edgeId: number }>;
};

/** What a bundle carries beside its shapes. */
export type BundleExtras = {
  readonly images?: ReadonlyArray<{
    readonly mimeType: string;
    readonly name?: string;
    readonly data: Uint8Array<ArrayBuffer>;
  }>;
  readonly textures?: ReadonlyArray<Record<string, unknown>>;
  readonly samplers?: ReadonlyArray<Record<string, unknown>>;
  readonly mechanism?: unknown;
};

/**
 * Encode a mesh bundle: `TAUSMLB1`, the header length, the space-padded JSON header and the four-byte-aligned body.
 *
 * @param shapes - The shapes.
 * @param extras - Resources and the mechanism source.
 * @returns The bundle bytes.
 */
export const encodeMeshBundle = (
  shapes: readonly BundleShape[],
  extras: BundleExtras = {},
): Uint8Array<ArrayBuffer> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  const add = (bytes: Uint8Array<ArrayBuffer>): [number, number] => {
    const padding = (4 - (length % 4)) % 4;
    if (padding > 0) {
      chunks.push(new Uint8Array(padding));
      length += padding;
    }
    const offset = length;
    chunks.push(bytes);
    length += bytes.byteLength;
    return [offset, bytes.byteLength];
  };
  const floats = (values: readonly number[]) => add(new Uint8Array(Float32Array.from(values).buffer));
  const indices = (values: readonly number[]) => add(new Uint8Array(Uint32Array.from(values).buffer));
  const header = {
    shapes: shapes.map(({ vertices, normals, triangles, faceGroups, lines = [], edgeGroups = [], ...appearance }) => ({
      ...appearance,
      faces: { vertices: floats(vertices), normals: floats(normals), triangles: indices(triangles), faceGroups },
      edges: { lines: floats(lines), edgeGroups },
    })),
    ...(extras.images === undefined
      ? {}
      : { images: extras.images.map(({ data, ...image }) => ({ ...image, data: add(data) })) }),
    ...(extras.textures === undefined ? {} : { textures: extras.textures }),
    ...(extras.samplers === undefined ? {} : { samplers: extras.samplers }),
    ...(extras.mechanism === undefined ? {} : { mechanism: extras.mechanism }),
  };
  let json = JSON.stringify(header);
  json += ' '.repeat((4 - (new TextEncoder().encode(json).byteLength % 4)) % 4);
  const encoded = new TextEncoder().encode(json);
  const bytes = new Uint8Array(12 + encoded.byteLength + length);
  bytes.set(new TextEncoder().encode('TAUSMLB1'), 0);
  new DataView(bytes.buffer).setUint32(8, encoded.byteLength, true);
  bytes.set(encoded, 12);
  let offset = 12 + encoded.byteLength;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

/** A unit square in the XY plane: one face of two triangles, with its four boundary edges. */
export const squareShape: BundleShape = {
  vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  triangles: [0, 1, 2, 0, 2, 3],
  faceGroups: [{ start: 0, count: 6, faceId: 0 }],
  lines: [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  edgeGroups: [
    { start: 0, count: 6, edgeId: 0 },
    { start: 6, count: 6, edgeId: 1 },
    { start: 12, count: 6, edgeId: 2 },
    { start: 18, count: 6, edgeId: 3 },
  ],
};
