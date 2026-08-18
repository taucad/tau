/**
 * Shared API extraction types.
 *
 * These types define a consistent JSON output schema used by all
 * API extractors (replicad, jscad, kcl) to ensure uniform structure.
 */

// =============================================================================
// Entry Types
// =============================================================================

/**
 * The kind of API entry.
 */
export type ApiEntryKind = 'function' | 'class' | 'type' | 'interface' | 'constant' | 'enum' | 'module';

/**
 * A parameter or argument for a function entry.
 */
export type ApiParameter = {
  /** Parameter name */
  name: string;
  /** Type annotation */
  type: string;
  /** Whether the parameter is optional */
  optional: boolean;
  /** Human-readable description (if available) */
  description?: string;
};

/**
 * A single API entry (function, class, type, etc.).
 */
export type ApiEntry = {
  /** Export name */
  name: string;
  /** Declaration kind */
  kind: ApiEntryKind;
  /** Module or namespace path (e.g. "primitives", "std") */
  module?: string;
  /** Human-readable category (e.g. "Drawing & Sketching", "functions") */
  category?: string;
  /** Full type signature or declaration text */
  signature: string;
  /** Short summary / excerpt */
  description?: string;
  /** Function parameters (functions only) */
  parameters?: ApiParameter[];
  /** Return type annotation (functions only) */
  returnType?: string;
};

// =============================================================================
// Top-Level Data
// =============================================================================

/**
 * Extraction metadata.
 */
export type ApiDataMetadata = {
  /** ISO date string of when the extraction ran */
  extractionDate: string;
  /** Human-readable source description (e.g. "TypeScript Compiler API", "KCL v0.2.111") */
  source: string;
  /** Total number of entries */
  totalEntries: number;
  /** Count of entries by kind */
  breakdown: Record<string, number>;
};

/**
 * Complete API extraction result.
 *
 * Every extractor (replicad, jscad, kcl) outputs this shape.
 */
export type ApiData = {
  metadata: ApiDataMetadata;
  entries: ApiEntry[];
};
