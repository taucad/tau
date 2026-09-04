/**
 * Mesh-loading contract. The substrate declares the shapes; the registered
 * engine loads the bytes (split-doc D-S1).
 *
 * @module
 */

import {
  describeGeoSpecEngine,
  getRegisteredGeoSpecHostBinding,
  geoSpecEngineUnavailableDiagnostic,
} from '#engine/registry.js';
import {
  geoSpecClaimDiagnostics,
  geoSpecProtocolViolation,
  geoSpecSubjectId,
  submitGeoSpecClaim,
} from '#engine/client.js';
import { parseMeshAnalysisResult } from '#mesh/analysis-result.js';
import type { GeoSpecUnit } from '#geometry-unit.js';
import type { GeometryDiagnostic, GeometryStats, GeometrySubject, MeshFileFormat } from '#mesh/types.js';

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
export type AnalyzeMeshResult = { success: true; stats: GeometryStats; subject: GeometrySubject } | LoadMeshFailure;

/** Analyze source bytes or an already retained subject, never both. @public */
export type AnalyzeMeshOptions =
  | (LoadMeshOptions & { subject?: never })
  | ({ subject: GeometrySubject } & { [Key in keyof LoadMeshOptions]?: never });

/**
 * Load mesh evidence into a GeoSpec geometry subject.
 *
 * @param options - Mesh source, format, and unit handling.
 * @returns The loaded subject, or a structured failure.
 * @public
 */
export const loadMesh = async (options: LoadMeshOptions): Promise<LoadMeshResult> => {
  const engine = getRegisteredGeoSpecHostBinding<(options: LoadMeshOptions) => Promise<LoadMeshResult>>('loadMesh');
  return engine ? engine(options) : { success: false, diagnostics: [geoSpecEngineUnavailableDiagnostic('loadMesh')] };
};

/**
 * Return a detached full-statistics snapshot. Source input loads once; subject
 * input reuses retained evidence in its original unit/frame without reloading.
 * Repeated calls reuse engine analysis but return independently mutable data.
 * A subject must still be retained by the active engine; returned snapshots
 * remain readable after release. Ordinary subject summaries stay counts-only.
 *
 * @param options - Mesh source, format, and unit handling.
 * @returns The subject with its statistics, or a structured failure.
 * @public
 */
export const analyzeMesh = async (options: AnalyzeMeshOptions): Promise<AnalyzeMeshResult> => {
  try {
    const input: unknown = options;
    if (typeof input !== 'object' || input === null || 'subject' in input === 'source' in input) {
      throw new TypeError('analyzeMesh requires exactly one of source or subject.');
    }
    if (!('subject' in options)) {
      const engine =
        getRegisteredGeoSpecHostBinding<(options: LoadMeshOptions) => Promise<AnalyzeMeshResult>>('analyzeMesh');
      return engine
        ? parseMeshAnalysisResult(await engine(options))
        : { success: false, diagnostics: [geoSpecEngineUnavailableDiagnostic('analyzeMesh')] };
    }
    if (Object.keys(options).some((key) => key !== 'subject')) {
      throw new TypeError(
        'Retained-subject analysis does not accept source, format, path, name, unit, sourceUnit, or parameters.',
      );
    }
    const descriptor = describeGeoSpecEngine();
    if (!descriptor) {
      return { success: false, diagnostics: [geoSpecEngineUnavailableDiagnostic('analyzeMesh')] };
    }
    if (!descriptor.capabilities.includes('analyzeMesh')) {
      throw new TypeError('The registered engine does not advertise analyzeMesh.');
    }
    const result = await submitGeoSpecClaim({
      capability: 'analyzeMesh',
      subjectIds: [geoSpecSubjectId(options.subject)],
    });
    if (!result) {
      throw new TypeError('The engine returned no mesh analysis result.');
    }
    const diagnostics = geoSpecClaimDiagnostics(result);
    if (result.status !== 'passed') {
      return parseMeshAnalysisResult({
        success: false,
        diagnostics:
          diagnostics.length > 0
            ? diagnostics
            : [geoSpecProtocolViolation('Mesh analysis failed without diagnostics.')],
      });
    }
    if (diagnostics.length > 0) {
      throw new TypeError('The engine returned a passed mesh analysis with failure diagnostics.');
    }
    const { evidence } = result;
    const parsed = parseMeshAnalysisResult(evidence);
    if (!parsed.success || parsed.subject.subjectId !== options.subject?.subjectId) {
      throw new TypeError('The engine returned invalid mesh statistics or subject identity.');
    }
    return parsed;
  } catch (error) {
    return {
      success: false,
      diagnostics: [geoSpecProtocolViolation(error instanceof Error ? error.message : String(error))],
    };
  }
};
