/**
 * Mesh loading.
 *
 * Normalizes every accepted source form to bytes (or to an in-memory buffer),
 * parses it once into an analysis record, and publishes the subject the
 * substrate's matchers consume. Unit handling is explicit and one-way: the
 * source's coordinate unit and the subject's reported unit are separate inputs,
 * and the only transformation ever applied is that uniform scale.
 *
 * @module
 */

import { readFile } from 'node:fs/promises';
import { buildMeshAnalysisRecord, readGlbDocument, recordGeometryStats } from '#mesh/analysis-record.js';
import { buildSoupStats } from '#mesh/soup.js';
import { forensicSpan } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';
import type {
  GeometryCapability,
  GeometryDiagnostic,
  GeometrySource,
  GeometryStats,
  GeometrySubject,
  GeoSpecUnit,
  MeshFileFormat,
} from '#mesh/types.js';
import type { LoadMeshOptions as SubstrateLoadMeshOptions, MeshBufferSource } from 'geospec/mesh';

/** Re-published substrate contract: mesh load options. @public */
export type LoadMeshOptions = SubstrateLoadMeshOptions;
/** Engine-internal mesh load result. @public */
export type LoadMeshResult =
  | { success: true; subject: GeometrySubject }
  | { success: false; diagnostics: GeometryDiagnostic[] };
/** Engine-internal mesh analysis result. @public */
export type AnalyzeMeshResult =
  | { success: true; stats: GeometryStats; subject: GeometrySubject }
  | { success: false; diagnostics: GeometryDiagnostic[] };

/** Metres per supported unit; anything else scales 1:1. */
const metresPerUnit: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

/**
 * Uniform scale carrying coordinates from one unit to another.
 *
 * @param from - Source coordinate unit.
 * @param to - Reported subject unit.
 * @returns The multiplier; `1` when either unit is not a known length unit.
 * @public
 */
export const unitScale = (from: GeoSpecUnit, to: GeoSpecUnit): number => {
  const source = metresPerUnit[from];
  const target = metresPerUnit[to];
  return source === undefined || target === undefined ? 1 : source / target;
};

const meshCapabilities = (): GeometryCapability[] => [
  { kind: 'mesh', feature: 'triangles' },
  { kind: 'mesh', feature: 'bounding-box' },
  { kind: 'mesh', feature: 'connected-components' },
  { kind: 'mesh', feature: 'watertightness' },
  { kind: 'mesh', feature: 'surface-area' },
  { kind: 'mesh', feature: 'volume' },
  { kind: 'mesh', feature: 'center-of-mass' },
  // Retained evidence capability: contact/clearance/interference still use
  // distance internally even though OA1 removed the three public samplers.
  { kind: 'mesh', feature: 'distance' },
  { kind: 'mesh', feature: 'component-overlap' },
];

const isMeshBufferSource = (source: unknown): source is MeshBufferSource =>
  typeof source === 'object' && source !== null && Reflect.get(source, 'format') === 'mesh-buffer';

const formatFromPath = (path: string | undefined): MeshFileFormat | undefined => {
  if (path === undefined) {
    return undefined;
  }
  if (path.endsWith('.gltf')) {
    return 'gltf';
  }
  return path.endsWith('.glb') ? 'glb' : undefined;
};

type NormalizedSource = {
  kind: GeometrySource['kind'];
  bytes?: Uint8Array<ArrayBuffer>;
  buffer?: MeshBufferSource;
  path?: string;
  name?: string;
};

const normalizeSource = async (source: LoadMeshOptions['source']): Promise<NormalizedSource> => {
  if (isMeshBufferSource(source)) {
    return { kind: 'mesh-buffer', buffer: source, ...(source.name === undefined ? {} : { name: source.name }) };
  }
  if (source instanceof Uint8Array) {
    return { kind: 'bytes', bytes: source };
  }
  if (source instanceof ArrayBuffer) {
    return { kind: 'array-buffer', bytes: new Uint8Array(source) };
  }
  if (source instanceof URL) {
    const response = await fetch(source);
    return { kind: 'url', bytes: new Uint8Array(await response.arrayBuffer()), path: source.href };
  }
  if (typeof source === 'string') {
    const contents = await readFile(source);
    return { kind: 'path', bytes: new Uint8Array(contents.buffer as ArrayBuffer), path: source };
  }
  // Blob covers File, which carries a name.
  const { name } = source as File;
  return {
    kind: typeof name === 'string' ? 'file' : 'blob',
    bytes: new Uint8Array(await source.arrayBuffer()),
    ...(typeof name === 'string' ? { name } : {}),
  };
};

const bufferStats = (buffer: MeshBufferSource, scale: number): GeometryStats => {
  const { positions } = buffer;
  const indices = buffer.indices ?? Array.from({ length: positions.length / 3 }, (_unused, index) => index);
  const soup = new Float64Array(indices.length * 3);
  for (const [index, entry] of [...indices].entries()) {
    const vertex = Number(entry);
    soup[index * 3] = Number(positions[vertex * 3]) * scale;
    soup[index * 3 + 1] = Number(positions[vertex * 3 + 1]) * scale;
    soup[index * 3 + 2] = Number(positions[vertex * 3 + 2]) * scale;
  }
  return buildSoupStats(soup, Math.floor(indices.length / 3), `${buffer.name ?? 'mesh-buffer'}#0`);
};

/**
 * Load mesh evidence into a GeoSpec geometry subject.
 *
 * @param options - Mesh source, format, and unit handling.
 * @returns The loaded subject, or a structured failure.
 * @public
 */
/** Internal observed mesh load used by the configured model loader. @internal */
export const loadMeshObserved = async (options: LoadMeshOptions, forensic?: ForensicSink): Promise<LoadMeshResult> => {
  try {
    const normalized = await normalizeSource(options.source);
    const format: MeshFileFormat =
      options.format ??
      (normalized.buffer ? 'mesh-buffer' : (formatFromPath(options.path ?? normalized.path) ?? 'glb'));
    // Direct glTF is metres by convention; an in-memory buffer is authoring mm.
    const defaultUnit: GeoSpecUnit = format === 'mesh-buffer' ? 'mm' : 'm';
    const unit = options.unit ?? defaultUnit;
    const scale = unitScale(options.sourceUnit ?? defaultUnit, unit);

    // Tolerances are millimetres everywhere in the vocabulary; the record is in
    // whatever unit the subject reports, so the analyses need the conversion.
    const unitsPerMm = unitScale('mm', unit);
    let stats: GeometryStats;
    if (normalized.buffer) {
      stats = bufferStats(normalized.buffer, scale);
    } else {
      const document = await readGlbDocument(normalized.bytes!);
      stats = recordGeometryStats(
        forensicSpan('mesh.record', () => buildMeshAnalysisRecord(document, scale), forensic),
        unitsPerMm,
      );
    }

    const path = options.path ?? normalized.path;
    const name = options.name ?? normalized.name;
    const source: GeometrySource = {
      kind: normalized.kind,
      format,
      ...(path === undefined ? {} : { path }),
      ...(name === undefined ? {} : { name }),
      ...(normalized.bytes === undefined ? {} : { byteLength: normalized.bytes.byteLength }),
    };

    return {
      success: true,
      subject: {
        kind: 'geometry-subject',
        mesh: { format, stats },
        provenance: {
          source,
          unit,
          loader: normalized.buffer ? 'in-memory' : 'gltf-transform',
          ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
        },
        capabilities: meshCapabilities(),
        diagnostics: [],
      } satisfies GeometrySubject,
    };
  } catch (error) {
    const diagnostic: GeometryDiagnostic = {
      code: 'GEOSPEC_MESH_LOAD_FAILED',
      severity: 'error',
      message: `GeoSpec could not load mesh evidence: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: 'Check the source path, bytes and format; GeoSpec never guesses at unreadable geometry.',
    };
    return { success: false, diagnostics: [diagnostic] };
  }
};

/** Load mesh evidence without observation. */
export const loadMesh = async (options: LoadMeshOptions): Promise<LoadMeshResult> => loadMeshObserved(options);

/**
 * Load mesh evidence and return its geometry statistics.
 *
 * @param options - Mesh source, format, and unit handling.
 * @returns The subject with its statistics, or a structured failure.
 * @public
 */
export const analyzeMesh = async (options: LoadMeshOptions): Promise<AnalyzeMeshResult> => {
  const result = await loadMesh(options);
  return result.success ? { success: true, stats: result.subject.mesh.stats, subject: result.subject } : result;
};
