import type { Mechanism } from '@taucad/kinematics';
import type { JSONObject } from '@taucad/runtime/types';

/** A range in one glTF primitive's index accessor. @public */
export type TauCadTopologyFaceGroup = { readonly start: number; readonly count: number; readonly faceId: number };
/** A range in one glTF line primitive's index accessor. @public */
export type TauCadTopologyEdgeGroup = { readonly start: number; readonly count: number; readonly edgeId: number };

/** One glTF primitive referenced by a topology component. @public */
export type TauCadTopologyPrimitiveRef = {
  readonly nodeIndex: number;
  readonly meshIndex: number;
  readonly primitiveIndex: number;
};

/** Export capability advertised by a topology component. @public */
export type TauCadTopologyExport = {
  readonly fidelity: 'mesh' | 'brep';
  readonly formats: string[];
  readonly available: boolean;
  readonly reason?: string;
};

/** A semantic CAD component mapped onto glTF primitives. @public */
export type TauCadTopologyComponent = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly selector: string;
  /** Authored sRGB RGBA display color. */
  readonly color?: [number, number, number, number];
  readonly nodeIndex?: number;
  readonly meshIndex?: number;
  readonly parentId?: string;
  readonly childIds?: string[];
  readonly primitiveIndices?: number[];
  readonly primitiveRefs?: TauCadTopologyPrimitiveRef[];
  readonly faceGroups?: TauCadTopologyFaceGroup[];
  readonly edgeGroups?: TauCadTopologyEdgeGroup[];
  readonly sourceRefs?: JSONObject;
  readonly capabilities?: {
    readonly hasPreciseTopology?: boolean;
    readonly exports?: TauCadTopologyExport[];
  };
};

/** Version 1 payload stored by the `TAU_cad_topology` glTF extension. @public */
export type TauCadTopologyPayload = {
  readonly schemaVersion: 1;
  readonly components: TauCadTopologyComponent[];
  /**
   * The model's mechanism in this glTF's vertex space: lengths in the vertices' unit, origins and
   * axes in the vertices' frame, link components as `components[].id` values.
   */
  readonly mechanism?: Mechanism;
};
