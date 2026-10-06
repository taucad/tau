import type { Mechanism } from '@taucad/kinematics';
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

/** Requested native solid volume, or an explicit reason it could not be measured. @public */
export type TauCadPhysicalVolume =
  | Readonly<{
      state: 'measured';
      valueMm3: number;
      /** SHA-256 over provider/codec/unit and exact native shape bytes, never display GLB bytes. */
      geometryDigest: string;
      method: 'occt-solid-volume';
      validity: 'closed-solid';
    }>
  | Readonly<{
      state: 'derived';
      /** Source-native measurement, already including native shape transforms. */
      sourceValueMm3: number;
      /** Absolute determinant of added assembly occurrence and ancestor transforms only. */
      addedAbsDeterminant: number;
      valueMm3: number;
      /** Identity of the measured source-native geometry, not an assembly mesh digest. */
      geometryDigest: string;
      method: 'occurrence-determinant-v1';
      validity: 'placed-solid';
    }>
  | Readonly<{
      state: 'unavailable';
      reason: 'not-solid' | 'invalid-solid' | 'native-unavailable' | 'degenerate-placement' | 'nonfinite-placement';
    }>;

/** Authored material assignment. Density is never inferred from a display material name. @public */
export type TauCadPhysicalDensity = Readonly<{
  valueGPerCm3: number;
  provenance: 'authored-shape-config';
}>;

/** Optional physical evidence on the canonical component identity. @public */
export type TauCadPhysical = Readonly<{
  volume: TauCadPhysicalVolume;
  density?: TauCadPhysicalDensity;
}>;

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
  /**
   * Source surface-material factors, including descendant surfaces. Line and
   * point materials are excluded. Omitted factors use glTF defaults; 'unavailable'
   * denotes an invalid or unavailable explicit value. Explicit factors do not
   * establish whether the author or an exporter supplied the value.
   */
  materials?: Array<{
    /** Index in the source glTF materials array; omitted for the default material. */
    materialIndex?: number;
    /** Optional name on this exact source material, independent of other materials with the same name. */
    name?: string;
    /** Source glTF texture-info objects, whose indices address the source asset's textures array. */
    textures?: {
      baseColor?: JSONObject;
      metallicRoughness?: JSONObject;
      normal?: JSONObject;
      occlusion?: JSONObject;
      emissive?: JSONObject;
    };
    /** Source glTF material extension descriptors, keyed by extension name. */
    extensions?: JSONObject;
    /** Explicit base-color factor converted to CSS for display. The glTF default is white. */
    color?: string;
    /** Explicit metallic factor, in [0, 1]. The glTF default is 1. */
    metalness?: number | 'unavailable';
    /** Explicit roughness factor, in [0, 1]. The glTF default is 1. */
    roughness?: number | 'unavailable';
    /** Whether the source material uses KHR_materials_unlit. */
    isUnlit?: boolean;
  }>;
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
  /** Native physical record from the admitted source GLB. */
  physical?: TauCadPhysical;
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
  /** Admitted mechanism from the `TAU_cad_topology` payload, in glTF space with component ids as link members. */
  mechanism?: Mechanism;
};
