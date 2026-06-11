import { Accessor, Document } from '@gltf-transform/core';
import {
  createGeometryStatsFromRecord,
  getMeshAnalysisRecord,
  scaleMeshAnalysisRecord,
} from '#mesh/analysis-record.js';
import { analyzeGlb, analyzeGltfDocument } from '#mesh/analyze-glb.js';
import type {
  GeometryCapability,
  GeometryDiagnostic,
  GeometryProvenance,
  GeometryStats,
  GeometrySubject,
  GeoSpecUnit,
  MeshFileFormat,
} from '#mesh/types.js';

/**
 * In-memory triangle mesh source.
 *
 * @public
 */
export type MeshBufferSource = {
  format: 'mesh-buffer';
  positions: Float32Array<ArrayBuffer> | number[];
  indices?: Uint32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | number[];
  name?: string;
};

/**
 * Mesh source forms accepted by {@link loadMesh}.
 *
 * @public
 */
export type MeshSource = Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | File | URL | string | MeshBufferSource;

/**
 * Options for loading mesh evidence.
 *
 * @public
 */
export type LoadMeshOptions = {
  source: MeshSource;
  format?: MeshFileFormat;
  path?: string;
  name?: string;
  /**
   * Unit exposed by the returned GeoSpec subject. Direct GLB/glTF loading
   * defaults to raw glTF metres; in-memory mesh buffers default to millimetres.
   */
  unit?: GeoSpecUnit;
  /**
   * Coordinate unit of the supplied mesh data before normalization. Direct
   * GLB/glTF files default to their raw document units; runtime-backed
   * `loadModel` calls pass the unit honored by the selected export route.
   */
  sourceUnit?: GeoSpecUnit;
  parameters?: Record<string, unknown>;
};

/**
 * Successful mesh load result.
 *
 * @public
 */
export type LoadMeshSuccess = {
  success: true;
  subject: GeometrySubject;
};

/**
 * Failed mesh load result.
 *
 * @public
 */
export type LoadMeshFailure = {
  success: false;
  diagnostics: GeometryDiagnostic[];
};

/**
 * Result of loading mesh evidence into a GeoSpec geometry subject.
 *
 * @public
 */
export type LoadMeshResult = LoadMeshSuccess | LoadMeshFailure;

/**
 * Mesh analysis result.
 *
 * @public
 */
export type AnalyzeMeshResult =
  | { success: true; stats: GeometrySubject['mesh']['stats']; subject: GeometrySubject }
  | LoadMeshFailure;

const meshCapabilities: GeometryCapability[] = [
  { kind: 'mesh', feature: 'triangles' },
  { kind: 'mesh', feature: 'bounding-box' },
  { kind: 'mesh', feature: 'connected-components' },
  { kind: 'mesh', feature: 'watertightness' },
  { kind: 'mesh', feature: 'surface-area' },
  { kind: 'mesh', feature: 'volume' },
  { kind: 'mesh', feature: 'center-of-mass' },
  { kind: 'mesh', feature: 'distance' },
  { kind: 'mesh', feature: 'component-overlap' },
];

const asUint8Array = (source: Uint8Array<ArrayBuffer> | ArrayBuffer): Uint8Array<ArrayBuffer> => {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
};

const isBlobLike = (value: unknown): value is Blob =>
  typeof value === 'object' &&
  value !== null &&
  'arrayBuffer' in value &&
  typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function';

const isObjectLike = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && Boolean(value);

const isMeshBufferSource = (value: unknown): value is MeshBufferSource =>
  isObjectLike(value) && value['format'] === 'mesh-buffer';

const inferFormat = (options: LoadMeshOptions): MeshFileFormat | undefined => {
  if (options.format) {
    return options.format;
  }
  if (isMeshBufferSource(options.source)) {
    return 'mesh-buffer';
  }
  const candidate = options.path ?? options.name ?? (typeof options.source === 'string' ? options.source : undefined);
  if (candidate?.toLowerCase().endsWith('.glb')) {
    return 'glb';
  }
  if (candidate?.toLowerCase().endsWith('.gltf')) {
    return 'gltf';
  }
  if (candidate && /\.[a-z0-9]+$/iu.test(candidate)) {
    return undefined;
  }
  return 'glb';
};

const bytesToHex = (bytes: Uint8Array<ArrayBuffer>): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hashBytes = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
};

const readUrl = async (url: URL): Promise<Uint8Array<ArrayBuffer>> => {
  if (url.protocol === 'file:') {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([import('node:fs/promises'), import('node:url')]);
    return asUint8Array(new Uint8Array(await readFile(fileURLToPath(url))));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch mesh source: ${response.status} ${response.statusText}`);
  }
  return asUint8Array(await response.arrayBuffer());
};

const readPathOrUrl = async (source: string): Promise<Uint8Array<ArrayBuffer>> => {
  if (/^https?:\/\//u.test(source) || source.startsWith('file:')) {
    return readUrl(new URL(source));
  }
  const { readFile } = await import('node:fs/promises');
  return asUint8Array(new Uint8Array(await readFile(source)));
};

const readBytes = async (source: Exclude<MeshSource, MeshBufferSource>): Promise<Uint8Array<ArrayBuffer>> => {
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
    return asUint8Array(source);
  }
  if (source instanceof URL) {
    return readUrl(source);
  }
  if (typeof source === 'string') {
    return readPathOrUrl(source);
  }
  if (isBlobLike(source)) {
    return asUint8Array(await source.arrayBuffer());
  }
  throw new Error('Unsupported mesh source input.');
};

const createMeshBufferDocument = (source: MeshBufferSource): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positionArray =
    source.positions instanceof Float32Array ? source.positions : new Float32Array(source.positions);
  const primitive = document
    .createPrimitive()
    .setMode(4)
    .setAttribute(
      'POSITION',
      document.createAccessor().setType(Accessor.Type['VEC3']!).setBuffer(buffer).setArray(positionArray),
    );

  if (source.indices) {
    const indices =
      source.indices instanceof Uint16Array || source.indices instanceof Uint32Array
        ? source.indices
        : new Uint32Array(source.indices);
    primitive.setIndices(
      document.createAccessor().setType(Accessor.Type['SCALAR']!).setBuffer(buffer).setArray(indices),
    );
  }

  const mesh = document.createMesh(source.name).addPrimitive(primitive);
  document.createScene().addChild(document.createNode(source.name).setMesh(mesh));
  return document;
};

const unitToMeters = (unit: GeoSpecUnit): number | undefined => {
  switch (unit) {
    case 'mm': {
      return 0.001;
    }
    case 'cm': {
      return 0.01;
    }
    case 'm': {
      return 1;
    }
    case 'in': {
      return 0.0254;
    }
    case 'ft': {
      return 0.3048;
    }
    default: {
      return undefined;
    }
  }
};

const resolveCoordinateScale = (sourceUnit: GeoSpecUnit, targetUnit: GeoSpecUnit): number => {
  const sourceToMeters = unitToMeters(sourceUnit);
  const targetToMeters = unitToMeters(targetUnit);
  if (!sourceToMeters || !targetToMeters) {
    return 1;
  }
  return sourceToMeters / targetToMeters;
};

const normalizeStatsUnit = (options: {
  stats: GeometryStats;
  sourceUnit: GeoSpecUnit;
  targetUnit: GeoSpecUnit;
}): GeometryStats => {
  const factor = resolveCoordinateScale(options.sourceUnit, options.targetUnit);
  if (factor === 1) {
    return options.stats;
  }

  return createGeometryStatsFromRecord(scaleMeshAnalysisRecord(getMeshAnalysisRecord(options.stats), factor));
};

const buildSubject = (options: {
  stats: GeometrySubject['mesh']['stats'];
  format: MeshFileFormat;
  provenance: GeometryProvenance;
}): GeometrySubject => ({
  kind: 'geometry-subject',
  mesh: {
    format: options.format,
    stats: options.stats,
  },
  provenance: options.provenance,
  capabilities: meshCapabilities,
  diagnostics: [],
});

/**
 * Load mesh evidence from geometry bytes, files, browser blobs, URLs, or
 * in-memory triangle buffers.
 *
 * @param options - Mesh source and provenance metadata.
 * @returns A typed outcome containing a loaded geometry subject or diagnostics.
 * @public
 */
export async function loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult> {
  const format = inferFormat(options);
  const unit = options.unit ?? (format === 'glb' || format === 'gltf' ? 'm' : 'mm');
  const sourceUnit = options.sourceUnit ?? unit;
  const sourceLabel =
    options.path ?? options.name ?? (typeof options.source === 'string' ? options.source : 'this source path');

  try {
    if (!format) {
      return {
        success: false,
        diagnostics: [
          {
            code: 'UNSUPPORTED_MESH_FORMAT',
            severity: 'error',
            message: `GeoSpec could not infer a supported mesh format from ${sourceLabel}.`,
            suggestion:
              'Pass format: "glb" for GLB bytes, format: "mesh-buffer" for triangle buffers, or use loadModel({ format: "step" }) for STEP/BRep evidence.',
          },
        ],
      };
    }

    if (isMeshBufferSource(options.source)) {
      const document = createMeshBufferDocument(options.source);
      const stats = normalizeStatsUnit({
        stats: analyzeGltfDocument(document),
        sourceUnit,
        targetUnit: unit,
      });
      return {
        success: true,
        subject: buildSubject({
          stats,
          format: 'mesh-buffer',
          provenance: {
            source: {
              kind: 'mesh-buffer',
              format: 'mesh-buffer',
              name: options.name ?? options.source.name,
            },
            unit,
            loader: 'in-memory',
            parameters: options.parameters,
          },
        }),
      };
    }

    if (format !== 'glb') {
      return {
        success: false,
        diagnostics: [
          {
            code: 'UNSUPPORTED_MESH_FORMAT',
            severity: 'error',
            message: `GeoSpec P0 mesh loading supports GLB bytes and in-memory mesh buffers; received ${format}.`,
            suggestion: 'Export or provide the model as GLB for mesh assertions in this slice.',
          },
        ],
      };
    }

    const bytes = await readBytes(options.source);
    const stats = normalizeStatsUnit({
      stats: await analyzeGlb(bytes),
      sourceUnit,
      targetUnit: unit,
    });
    return {
      success: true,
      subject: buildSubject({
        stats,
        format,
        provenance: {
          source: {
            kind:
              typeof options.source === 'string'
                ? 'path'
                : options.source instanceof URL
                  ? 'url'
                  : isBlobLike(options.source)
                    ? 'blob'
                    : options.source instanceof ArrayBuffer
                      ? 'array-buffer'
                      : 'bytes',
            format,
            path: options.path ?? (typeof options.source === 'string' ? options.source : undefined),
            name:
              options.name ??
              (isBlobLike(options.source) && 'name' in options.source ? String(options.source.name) : undefined),
            byteLength: bytes.byteLength,
          },
          unit,
          loader: 'gltf-transform',
          contentHash: await hashBytes(bytes),
          parameters: options.parameters,
        },
      }),
    };
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'MESH_LOAD_FAILED',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          suggestion: 'Verify the mesh source exists and is valid GLB data.',
        },
      ],
    };
  }
}

/**
 * Analyze mesh input and return the loaded statistics directly.
 *
 * @param options - Mesh source and provenance metadata.
 * @returns A typed outcome containing mesh statistics.
 * @public
 */
export async function analyzeMesh(options: LoadMeshOptions): Promise<AnalyzeMeshResult> {
  const result = await loadMesh(options);
  if (!result.success) {
    return result;
  }
  return {
    success: true,
    stats: result.subject.mesh.stats,
    subject: result.subject,
  };
}
