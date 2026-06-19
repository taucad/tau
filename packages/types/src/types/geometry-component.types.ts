import type { ExportFidelity } from '#types/cad.types.js';
import type { JSONObject } from '#types/json-value.types.js';

/**
 * Logical kind for a component exposed by a geometry manifest.
 * @public
 */
export type GeometryComponentKind =
  | 'model'
  | 'assembly'
  | 'part'
  | 'body'
  | 'face'
  | 'edge'
  | 'vertex'
  | 'mesh'
  | 'line'
  | 'material'
  | 'unknown';

/**
 * Axis-aligned bounds for a geometry component.
 * @public
 */
export type GeometryComponentBounds = {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  radius: number;
};

/**
 * Visual appearance metadata extracted from component materials.
 * @public
 */
export type GeometryComponentAppearance = {
  /**
   * CSS color for the component's primary material, converted for UI display.
   */
  color?: string;
  /**
   * CSS colors for all material swatches represented by the component.
   */
  colors?: string[];
  /**
   * Source material names when present in the geometry payload.
   */
  materialNames?: string[];
};

/**
 * Stable reference to one glTF mesh primitive owned by a component.
 *
 * @public
 */
export type GeometryComponentPrimitiveRef = {
  nodeIndex: number;
  meshIndex: number;
  primitiveIndex: number;
};

/**
 * Export support advertised for a geometry component.
 * @public
 */
export type GeometryComponentExportCapability = {
  fidelity: ExportFidelity;
  formats: string[];
  available: boolean;
  reason?: string;
};

/**
 * Interactive and export capabilities available for a geometry component.
 * @public
 */
export type GeometryComponentCapabilities = {
  canHide: boolean;
  canIsolate: boolean;
  canFocus: boolean;
  canAdjustOpacity: boolean;
  hasDrawings: boolean;
  hasPreciseTopology: boolean;
  exports: GeometryComponentExportCapability[];
};

/**
 * Stable structured reference for a CAD component rendered in a viewer.
 * @public
 */
export type GeometryComponentReference = {
  scheme: 'tau-cad';
  filePath: string;
  /**
   * Canonical component identity. This is the same value as
   * {@link GeometryComponentNode.id} and any Tau topology `components[].id`
   * metadata for the referenced component.
   */
  componentId: string;
  selector: string;
  geometryHash?: string;
  label: string;
  kind: GeometryComponentKind;
};

/**
 * Node in the component tree extracted from a rendered geometry payload.
 * @public
 */
export type GeometryComponentNode = {
  /**
   * Canonical component identity for viewer interaction, chat references,
   * exports, screenshots, and persisted component display state.
   *
   * This is intentionally the only public component id. Do not add parallel
   * durable-id aliases for the same concern.
   */
  id: string;
  name: string;
  kind: GeometryComponentKind;
  selector: string;
  parentId?: string;
  childIds: string[];
  depth: number;
  path: string[];
  meshNodeIndices: number[];
  primitiveIndices: number[];
  primitiveRefs?: GeometryComponentPrimitiveRef[];
  materialIndices: number[];
  appearance?: GeometryComponentAppearance;
  bounds?: GeometryComponentBounds;
  capabilities: GeometryComponentCapabilities;
  reference?: GeometryComponentReference;
  extras?: JSONObject;
};

/**
 * Component manifest shared by viewers, explorers, chat chips, and screenshots.
 * @public
 */
export type GeometryComponentManifest = {
  schemaVersion: 1;
  sourceFile?: string;
  geometryHash?: string;
  rootId: string;
  nodeOrder: string[];
  nodesById: Record<string, GeometryComponentNode>;
  capabilities: GeometryComponentCapabilities;
  extensionUsed?: string;
};
