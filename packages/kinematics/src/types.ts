import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';

/**
 * Units for every number in a {@link Mechanism}: lengths (joint origins, prismatic
 * distances, screw leads) and angles (limits, coordinates, keyframes).
 *
 * @public
 */
export type MechanismUnits = Readonly<{ length: 'm' | 'mm'; angle: 'rad' | 'deg' }>;

/**
 * A rigid body of a resolved {@link Mechanism}: the canonical ids of the components that always
 * move together. Authored source names shapes instead; see {@link LinkSource}.
 *
 * @public
 */
export type Link = Readonly<{ components: readonly string[] }>;

/**
 * A rigid body as authored: the names of the returned shapes that always move together.
 * {@link resolveMechanismComponents} turns it into a {@link Link}.
 *
 * @public
 */
export type LinkSource = Readonly<{ shapes: readonly string[] }>;

/**
 * Inclusive travel bounds for one degree of freedom, in mechanism units. Limits are deltas from
 * the as-built pose and must contain the degree of freedom's value there (0 for a driver).
 *
 * @public
 */
export type JointLimits = Readonly<{ lower: number; upper: number }>;

/**
 * The part of every joint that connects two links: the joint origin is a point in the
 * as-built model frame, where every link sits at its reference (identity) pose.
 *
 * @public
 */
export type JointConnection = Readonly<{ parent: string; child: string; origin: SpatialVector }>;

/** Zero degrees of freedom; the child is welded to the parent. @public */
export type FixedJoint = JointConnection & Readonly<{ type: 'fixed' }>;

/** One rotation about `axis` through `origin`. Degree of freedom `<jointId>` is an angle. @public */
export type RevoluteJoint = JointConnection & Readonly<{ type: 'revolute'; axis: SpatialVector; limits?: JointLimits }>;

/** One translation along `axis`. Degree of freedom `<jointId>` is a distance. @public */
export type PrismaticJoint = JointConnection &
  Readonly<{ type: 'prismatic'; axis: SpatialVector; limits?: JointLimits }>;

/**
 * Independent rotation about and translation along one axis.
 * Degrees of freedom `<jointId>/angle` and `<jointId>/distance`.
 *
 * @public
 */
export type CylindricalJoint = JointConnection &
  Readonly<{
    type: 'cylindrical';
    axis: SpatialVector;
    limits?: Readonly<{ angle?: JointLimits; distance?: JointLimits }>;
  }>;

/**
 * Coupled rotation and translation: one turn advances the child by `lead` along `axis`
 * (positive along the axis for a right-hand thread and positive angle).
 * Degree of freedom `<jointId>` is an angle.
 *
 * @public
 */
export type ScrewJoint = JointConnection &
  Readonly<{ type: 'screw'; axis: SpatialVector; lead: number; handedness: 'right' | 'left'; limits?: JointLimits }>;

/**
 * Three rotational degrees of freedom about `origin`, exposed as a rotation vector with
 * components `<jointId>/x`, `<jointId>/y` and `<jointId>/z` in the as-built frame.
 * `limits` bounds each component symmetrically: `lower` must equal `-upper`, such as
 * `{ lower: -30, upper: 30 }`.
 *
 * @public
 */
export type SphericalJoint = JointConnection & Readonly<{ type: 'spherical'; limits?: JointLimits }>;

/**
 * Two in-plane translations and one rotation about the plane normal.
 * `xAxis` lies in the plane and defines `<jointId>/x`; `<jointId>/y` is `normal × xAxis`;
 * `<jointId>/angle` rotates about `normal`.
 *
 * @public
 */
export type PlanarJoint = JointConnection &
  Readonly<{
    type: 'planar';
    normal: SpatialVector;
    xAxis: SpatialVector;
    limits?: Readonly<{ x?: JointLimits; y?: JointLimits; angle?: JointLimits }>;
  }>;

/** Every supported joint. Unsupported types are rejected at admission, never ignored. @public */
export type Joint =
  | FixedJoint
  | RevoluteJoint
  | PrismaticJoint
  | CylindricalJoint
  | ScrewJoint
  | SphericalJoint
  | PlanarJoint;

/** Discriminant of {@link Joint}. @public */
export type JointType = Joint['type'];

/**
 * A linear relation between two degrees of freedom: `follower = ratio × driver + offset`.
 * Covers gear meshes, worm drives, mimic joints and rack-and-pinion pairs.
 *
 * @public
 */
export type LinearCoupling = Readonly<{ driver: string; follower: string; ratio: number; offset?: number }>;

/**
 * One period of a follower's value as a function of its driver, sampled at `n` evenly spaced
 * driver values `0, driverPeriod / n, …, (n − 1) × driverPeriod / n` and repeated every `driverPeriod`.
 *
 * @public
 */
export type CouplingCurve = Readonly<{
  /** Driver travel of one period, in the driver's mechanism units; positive. */
  driverPeriod: number;
  /** Follower values in the follower's mechanism units, at least two; linearly interpolated and wrapped. */
  values: readonly number[];
}>;

/**
 * A periodic non-linear relation `follower = curve(driver)`: slider-cranks, connecting-rod swing,
 * cam lift and other loops a tree of joints cannot close. The value at driver 0 is `values[0]`.
 *
 * @public
 */
export type CurveCoupling = Readonly<{ driver: string; follower: string; curve: CouplingCurve }>;

/**
 * A relation that makes `follower` take its value from `driver`. The coupling graph must be
 * acyclic and a follower cannot be driven directly.
 *
 * @public
 */
export type Coupling = LinearCoupling | CurveCoupling;

/** Driver coordinates at one instant of an animation. @public */
export type Keyframe = Readonly<{
  /** Offset of this keyframe from the start of the animation. Seconds. */
  time: number;
  coordinates: Readonly<Record<string, number>>;
}>;

/**
 * An authored motion clip: driver coordinates interpolated linearly between keyframes.
 * Values hold outside the keyframe range.
 *
 * @public
 */
export type Animation = Readonly<{
  id: string;
  name?: string;
  /** Length of one play of the clip, after which `loop` applies. Seconds. */
  duration: number;
  loop?: 'none' | 'repeat' | 'pingPong';
  keyframes: readonly Keyframe[];
}>;

/**
 * A serializable, kernel-neutral mechanism whose links carry canonical component ids, as
 * carried on the wire inside the `TAU_cad_topology` payload. It is JSON-equivalent: no
 * callbacks, no renderer or solver handles. Joints form a tree rooted at `root`; each link
 * other than the root is the child of exactly one joint.
 *
 * @public
 */
export type Mechanism = Readonly<{
  schemaVersion: 1;
  units: MechanismUnits;
  root: string;
  links: Readonly<Record<string, Link>>;
  joints: Readonly<Record<string, Joint>>;
  couplings?: readonly Coupling[];
  animations?: readonly Animation[];
}>;

/**
 * A mechanism as authored next to a model: identical to {@link Mechanism} except that links
 * name the model's returned shapes. Check it with `satisfies MechanismSource`.
 *
 * @public
 */
export type MechanismSource = Readonly<Omit<Mechanism, 'links'> & { links: Readonly<Record<string, LinkSource>> }>;

/** The current mechanism schema version. @public */
export const mechanismSchemaVersion = 1;

/**
 * One controllable or derived scalar of a mechanism, in mechanism units.
 *
 * @public
 */
export type DegreeOfFreedom = Readonly<{
  id: string;
  jointId: string;
  kind: 'angle' | 'distance';
  role: 'driver' | 'follower';
  limits: JointLimits | undefined;
  coupling: Coupling | undefined;
}>;

/** Stable diagnostic codes; each names a concrete recovery. @public */
export type IssueCode =
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_SCHEMA'
  | 'DUPLICATE_ID'
  | 'DUPLICATE_COMPONENT'
  | 'UNKNOWN_LINK'
  | 'UNKNOWN_COMPONENT'
  | 'UNKNOWN_DEGREE_OF_FREEDOM'
  | 'UNSUPPORTED_JOINT'
  | 'INVALID_AXIS'
  | 'INVALID_ORIGIN'
  | 'INVALID_LEAD'
  | 'INVALID_LIMITS'
  | 'INVALID_VALUE'
  | 'INVALID_UNIT'
  | 'INVALID_ANIMATION'
  | 'INVALID_TRANSFORM'
  | 'CYCLIC_GRAPH'
  | 'DISCONNECTED_LINK'
  | 'CYCLIC_COUPLING'
  | 'DRIVEN_FOLLOWER';

/** A diagnostic with a JSON-pointer-style `path` into the offending input. @public */
export type Issue = Readonly<{ code: IssueCode; path: string; message: string; recovery: string }>;

/** Outcome of admitting unknown input as a {@link Mechanism}. @public */
export type AdmitMechanismOutcome =
  | Readonly<{ status: 'admitted'; mechanism: Mechanism }>
  | Readonly<{ status: 'invalid'; issues: readonly Issue[] }>;

/**
 * Rigid world delta per link relative to the as-built reference, as a column-major 4×4
 * matrix with translations in mechanism length units, plus every degree of freedom's
 * resolved value (drivers clamped to limits, followers derived from couplings).
 *
 * @public
 */
export type Pose = Readonly<{
  linkTransforms: Readonly<Record<string, SpatialMatrix>>;
  coordinates: Readonly<Record<string, number>>;
}>;

/** Input of {@link evaluatePose}: sparse driver coordinates; omitted drivers are zero. @public */
export type EvaluatePoseInput = Readonly<{
  mechanism: Mechanism;
  coordinates: Readonly<Record<string, number>>;
}>;

/**
 * `atLimit` lists degrees of freedom whose requested value was clamped (drivers) or whose
 * derived value lies outside its limits (followers).
 *
 * @public
 */
export type PoseOutcome =
  | Readonly<{ status: 'posed'; pose: Pose; atLimit: readonly string[] }>
  | Readonly<{ status: 'invalid'; issues: readonly Issue[] }>;

/**
 * A target for {@link solvePose}. Points are in the as-built model frame; `localPoint` is a
 * point rigidly attached to `link` at the reference pose and `target` is where it should be.
 *
 * @public
 */
export type PoseGoal = Readonly<{ type: 'point'; link: string; localPoint: SpatialVector; target: SpatialVector }>;

/** Input of {@link solvePose}. @public */
export type SolvePoseInput = Readonly<{
  mechanism: Mechanism;
  seed: Readonly<Record<string, number>>;
  goals: readonly PoseGoal[];
  /** Distance from every goal's target at which the goals count as met. Mechanism length units. Defaults to 1e-6. */
  tolerance?: number;
}>;

/**
 * A `blocked` outcome still carries the best limit-satisfying pose found, so a drag can
 * follow the goal as far as the mechanism can reach; `reason` explains why it stopped.
 * `residual` is the largest distance from a goal's target, in mechanism length units.
 *
 * @public
 */
export type SolvePoseOutcome =
  | Readonly<{ status: 'solved'; pose: Pose; iterations: number; residual: number }>
  | Readonly<{
      status: 'blocked';
      reason: 'limit' | 'unreachable' | 'singular' | 'budget';
      pose: Pose;
      iterations: number;
      residual: number;
    }>
  | Readonly<{ status: 'invalid'; issues: readonly Issue[] }>;

/** Input of {@link sampleAnimation}. @public */
export type SampleAnimationInput = Readonly<{
  /** An animation of an admitted mechanism. */
  animation: Animation;
  /** Playback instant, measured from the start of the clip before `loop` applies. Seconds. */
  time: number;
}>;

/** Input of {@link findLinkByComponent}. @public */
export type FindLinkByComponentInput = Readonly<{ mechanism: Mechanism; componentId: string }>;

/**
 * Input of {@link resolveMechanismComponents}: an authored {@link MechanismSource} and the
 * canonical component id of each returned shape name.
 *
 * @public
 */
export type ResolveMechanismComponentsInput = Readonly<{
  /** Authored mechanism; unknown because it comes from user code and is validated here. */
  source: unknown;
  /** Canonical component id keyed by shape name. A name without an entry is `UNKNOWN_COMPONENT`. */
  componentIds: Readonly<Record<string, string>>;
}>;

/** Outcome of {@link resolveMechanismComponents}. @public */
export type ResolveMechanismComponentsOutcome =
  | Readonly<{ status: 'resolved'; mechanism: Mechanism }>
  | Readonly<{ status: 'invalid'; issues: readonly Issue[] }>;

/**
 * Input of {@link transformMechanism}: re-express origins, axes, distances and leads in a
 * new frame and length unit. `matrix` is a column-major rigid transform (a rotation without
 * mirror, plus a translation) applied to the as-built frame after the unit conversion.
 *
 * @public
 */
export type TransformMechanismInput = Readonly<{
  mechanism: Mechanism;
  units: MechanismUnits;
  matrix?: SpatialMatrix;
}>;

/** Outcome of {@link transformMechanism}. @public */
export type TransformMechanismOutcome =
  | Readonly<{ status: 'transformed'; mechanism: Mechanism }>
  | Readonly<{ status: 'invalid'; issues: readonly Issue[] }>;
