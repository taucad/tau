import type { LengthSymbol } from '@taucad/units';
import type { StandardSchemaV1 } from '#types/schema.types.js';
import type { engineeringDisciplines } from '#constants/cad.constants.js';

export type CodeError = {
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
};

export type GeometrySvg = {
  color?: string;
  format: 'svg';
  paths: string[];
  viewbox: string;
  opacity?: number;
  strokeType?: string;
  name: string;
};

export type GeometryGltf = {
  format: 'gltf';
  content: Uint8Array;
};

export type Geometry = GeometrySvg | GeometryGltf;

export type EngineeringDiscipline = keyof typeof engineeringDisciplines;

/**
 * The main function signature that CAD modules must implement
 */
export type CadMainFunctionLegacy = (
  replicad: unknown,
  parameters: Record<string, unknown>,
) => Array<{ shape: unknown; color?: string }> | { shape: unknown; color?: string };

/**
 * The main function signature that CAD modules must implement
 */
export type CadMainFunction = (
  parameters: Record<string, unknown>,
) => Array<{ shape: unknown; color?: string }> | { shape: unknown; color?: string };

export type CadUnits = {
  length: LengthSymbol;
};

export type CadConfig = {
  units: CadUnits;
};

/**
 * Modern CAD module exports with schema-based parameters
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
