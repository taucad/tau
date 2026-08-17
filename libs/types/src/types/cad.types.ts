import type { LengthSymbol } from '@taucad/units';
import type { StandardSchemaV1 } from '#types/schema.types.js';
import type { engineeringDisciplines } from '#constants/cad.constants.js';

/** @public */
export type CodeIssue = {
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
};

/**
 * SVG geometry type.
 *
 * This is a standard SVG document, not a Tau-specific path schema.
 *
 * @see https://www.w3.org/TR/SVG11/
 *
 * @public
 */
export type GeometrySvg = {
  format: 'svg';
  content: string;
  name?: string;
};

/**
 * GLTF geometry type.
 *
 * This is a type that is used to represent a GLTF geometry.
 * It is used to represent a 3D geometry, which is a collection of meshes.
 *
 * @see https://www.khronos.org/gltf/
 *
 * @public
 */
export type GeometryGltf = {
  format: 'gltf';
  content: Uint8Array<ArrayBuffer>;
};

/**
 * NOT IMPLEMENTED.
 *
 * A placeholder for a video stream geometry from a remote server
 * for server-rendered 3D geometries.
 *
 * @public
 */
export type GeometryWebRtc = {
  format: 'webrtc';
  stream: ReadableStream | EventTarget;
};

/**
 * The type of geometry that is returned by the runtime worker.
 *
 * One of:
 * - `GeometrySvg`
 * - `GeometryGltf`
 * - `GeometryWebRtc`
 *
 * @public
 */
export type GeometryResponse = GeometrySvg | GeometryGltf | GeometryWebRtc;

/**
 * Geometry with unique hash identifier.
 * The hash is computed from all dependencies, including:
 * - File content hashes
 * - Middleware signatures
 * - Framework version
 * - Kernel options
 * - Parameters
 * - Bundled assets
 *
 * @public
 */
export type Geometry = GeometryResponse & {
  /** Unique hash identifier for this geometry (based on dependencies) */
  hash: string;
};

/** @public */
export type EngineeringDiscipline = keyof typeof engineeringDisciplines;

/**
 * The main function signature that CAD modules must implement
 *
 * @public
 */
export type CadMainFunctionLegacy = (
  replicad: unknown,
  parameters: Record<string, unknown>,
) => Array<{ shape: unknown; color?: string }> | { shape: unknown; color?: string };

/**
 * The main function signature that CAD modules must implement
 *
 * @public
 */
export type CadMainFunction = (
  parameters: Record<string, unknown>,
) => Array<{ shape: unknown; color?: string }> | { shape: unknown; color?: string };

/** @public */
export type CadUnits = {
  length: LengthSymbol;
};

/** @public */
export type CadConfig = {
  units: CadUnits;
};

/**
 * Modern CAD module exports with schema-based parameters
 *
 * @public
 */
export type CadModuleExports = {
  /** Zod/Standard-Schema compatible parameter schema */
  schema: StandardSchemaV1;
  /** Optional legacy default parameters (for migration) */
  defaultParams?: Record<string, unknown>;
  /** Optional default name */
  defaultName?: string;
  /** Config for the module */
  config?: CadConfig;
  /** Main function */
  main?: CadMainFunctionLegacy;
  /** Default export function */
  default?: CadMainFunction;
};

/**
 * Parsed and validated CAD module information
 *
 * @public
 */
export type ParsedCadModule = {
  /** Module type detected */
  type: 'modern' | 'legacy';
  /** Default parameters (derived from schema or defaultParams) */
  defaultParameters: Record<string, unknown>;
  /** JSON Schema representation (if available) */
  jsonSchema?: unknown;
  /** Default name for the model */
  defaultName?: string;
  /** Main execution function */
  mainFunction: CadMainFunction;
  /** Config for the model */
  config?: CadConfig;
  /** Original parameter schema (if modern module) */
  schema?: StandardSchemaV1;
  /** Raw module exports for debugging */
  rawExports: CadModuleExports;
};

/**
 * Export fidelity level: boundary representation (`brep`) preserves exact
 * topology and surfaces, whereas `mesh` is a tessellated approximation.
 *
 * @public
 */
export type ExportFidelity = 'brep' | 'mesh';
