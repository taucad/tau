import { Cog, Zap, Cpu } from 'lucide-react';
import type { StandardSchemaV1 } from '#types/schema.types.js';

export type CodeError = {
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
};

export type Geometry2D = {
  type: '2d';
  color?: string;
  format: 'svg';
  paths: string[];
  viewbox: string;
  opacity?: number;
  strokeType?: string;
  name: string;
};

export type GeometryGltf = {
  type: 'gltf';
  gltfBlob: Blob;
};

export type Geometry = Geometry2D | GeometryGltf;

export const categories = {
  mechanical: { icon: Cog, color: 'text-blue' },
  electrical: { icon: Zap, color: 'text-yellow' },
  firmware: { icon: Cpu, color: 'text-purple' },
} as const;
export type Category = keyof typeof categories;

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
  /** Original parameter schema (if modern module) */
  schema?: StandardSchemaV1;
  /** Raw module exports for debugging */
  rawExports: CadModuleExports;
};
