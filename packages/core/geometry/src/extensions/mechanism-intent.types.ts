import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';
import type { JointLimits, MechanismUnits, Coupling, Animation } from '@taucad/kinematics';

/** A reusable, component-local attachment interface, connected or unconnected. @public */
export type JointInterface = Readonly<{
  kind: 'fixed' | 'revolute' | 'prismatic' | 'cylindrical' | 'spherical';
  /** Proper rigid frame relative to the component placement, in payload units and axes. */
  frame: SpatialMatrix;
  /** Spherical ranges bound the final composed intrinsic XYZ orientation. */
  chart?: 'intrinsic-xyz';
  /** Native zero-angle reference frame, when the author supplied one. */
  referenceFrame?: SpatialMatrix;
  angleReference?: SpatialVector;
  ranges?: Readonly<Record<string, JointLimits>>;
}>;

/** One endpoint of an assembly-owned physical connection. @public */
export type JointEndpoint = Readonly<{ componentId: string; interfaceId: string }>;

/** Physical connection intent, retained even when outside the playback solver profile. @public */
export type MechanismConnection = Readonly<{
  id: string;
  parent: JointEndpoint;
  child: JointEndpoint;
  referenceCoordinates?: Readonly<Record<string, number>>;
  coordinateChart?: 'axis' | 'intrinsic-xyz';
  /** Maps physical coordinates to compiled playback DOFs, whose values are deltas from reference. */
  playbackCoordinates?: Readonly<Record<string, string>>;
}>;

/** Kernel-neutral physical intent; the sibling mechanism is its compiled tree playback profile. @public */
export type MechanismIntent = Readonly<{
  schemaVersion: 1;
  units: MechanismUnits;
  ground?: string;
  connections: readonly MechanismConnection[];
  couplings?: readonly Coupling[];
  animations?: readonly Animation[];
}>;

/** Explicit inability to lower otherwise retained mechanical intent. @public */
export type MechanismDiagnostic = Readonly<{
  code: 'UNSUPPORTED_MECHANISM';
  path: string;
  message: string;
  recovery: string;
}>;
