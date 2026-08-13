/**
 * Mesh-loading contract. The substrate declares the shapes; the registered
 * engine loads the bytes (split-doc D-S1).
 *
 * @module
 */

import { getRegisteredGeoSpecHostBinding, geoSpecEngineUnavailableDiagnostic } from '#engine/registry.js';
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
 * Load mesh evidence and return its geometry statistics.
 *
 * @param options - Mesh source, format, and unit handling.
 * @returns The subject with its statistics, or a structured failure.
 * @public
 */
export const analyzeMesh = async (options: LoadMeshOptions): Promise<AnalyzeMeshResult> => {
  const engine =
    getRegisteredGeoSpecHostBinding<(options: LoadMeshOptions) => Promise<AnalyzeMeshResult>>('analyzeMesh');
  return engine
    ? engine(options)
    : { success: false, diagnostics: [geoSpecEngineUnavailableDiagnostic('analyzeMesh')] };
};
