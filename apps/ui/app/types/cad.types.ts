import { Cog, Zap, Cpu } from 'lucide-react';
import type { StandardSchemaV1 } from '~/types/schema.types.js';

export type CodeError = {
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
};

export type Shape2D = {
  type: '2d';
  color?: string;
  format: 'svg';
  paths: string[];
  viewbox: string;
  opacity?: number;
  strokeType?: string;
  error: boolean;
  name: string;
};

export type Shape3D = {
  type: '3d';
  faces: {
    triangles: number[];
    vertices: number[];
    normals: number[];
    faceGroups: Array<{
      start: number;
      count: number;
      faceId: number;
    }>;
  };
  edges: {
    lines: number[];
    edgeGroups: Array<{
      start: number;
      count: number;
      edgeId: number;
    }>;
  };
  color?: string;
  opacity?: number;
  error: boolean;
  name: string;
  highlight?: number[];
};

export type Shape = Shape2D | Shape3D;

export const cadKernelProviders = ['replicad', 'openscad', 'kicad', 'kcl', 'cpp'] as const;
export type CadKernelProvider = (typeof cadKernelProviders)[number];

export const modelProviders = ['sambanova', 'openai', 'anthropic', 'ollama'] as const;
export type ModelProvider = (typeof modelProviders)[number];

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
