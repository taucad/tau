# picovoxel — Constants

20 top-level symbols. Signatures are verbatim typescript.

// The three modulated demo shapes conformal arrays showcase (C# `ConformalShowcaseShapes`)
conformalShowcaseShapes: {
  /** Modulated box, length 100 (C# `oGetBox_01`). */
  readonly box01: () => BaseBox;
  /** Height-modulated lens (C# `oGetLens_01`). */
  readonly lens01: () => BaseLens;
  /** Radius- and phi-range-modulated pipe segment (C# `oGetSegment_01`). */
  readonly segment01: () => BasePipeSegment;
}

  // Modulated box, length 100 (C# `oGetBox_01`)
  readonly box01: () => BaseBox

  // Height-modulated lens (C# `oGetLens_01`)
  readonly lens01: () => BaseLens

  // Radius- and phi-range-modulated pipe segment (C# `oGetSegment_01`)
  readonly segment01: () => BasePipeSegment

// 2π (C# `Rad.TwoPi`)
TWO_PI: number

// `Cylindrical` factories and conversions
cylindrical: {
  /** Validated constructor (C# `Cylindrical(fR, rPhi, fZ)`). */
  readonly create: (r: number, phi: Rad, z: number) => Cylindrical;
  /** From a polar coordinate plus height (C# `Cylindrical(Polar, fZ)`). */
  readonly fromPolar: (p: Polar, z: number) => Cylindrical;
  /** From a cartesian point (C# `Cylindrical(Vector3)`). */
  readonly fromCartesian: (v: Vec3) => Cylindrical;
  /** From a spherical coordinate (C# `Cylindrical(Spherical)`). */
  readonly fromSpherical: (s: Spherical) => Cylindrical;
  /** To cartesian (C# `vecAsCartesian`). */
  readonly toCartesian: (c: Cylindrical) => Vec3;
  /** Lerp in cylindrical space; angular delta short-way-around (C# `oLerp`). */
  readonly lerp: (a: Cylindrical, b: Cylindrical, t: number) => Cylindrical;
}

  // Validated constructor (C# `Cylindrical(fR, rPhi, fZ)`)
  readonly create: (r: number, phi: Rad, z: number) => Cylindrical

  // From a polar coordinate plus height (C# `Cylindrical(Polar, fZ)`)
  readonly fromPolar: (p: Polar, z: number) => Cylindrical

  // From a cartesian point (C# `Cylindrical(Vector3)`)
  readonly fromCartesian: (v: Vec3) => Cylindrical

  // From a spherical coordinate (C# `Cylindrical(Spherical)`)
  readonly fromSpherical: (s: Spherical) => Cylindrical

  // To cartesian (C# `vecAsCartesian`)
  readonly toCartesian: (c: Cylindrical) => Vec3

  // Lerp in cylindrical space
  readonly lerp: (a: Cylindrical, b: Cylindrical, t: number) => Cylindrical

// `Frame` factories and operations (C# `Frame3d` surface
frame: {
  /** The world coordinate system (C# `frmWorld`). */
  readonly world: Frame;
  /** World-aligned axes at a position (C# `frmFromPos` / `Frame3d(vecPos)`). */
  readonly fromPos: (pos: Vec3) => Frame;
  /**
   * From approximate Z and X directions; enforces orthonormality and
   * right-handedness, Z winning (C# `frmFromZX`).
   */
  readonly fromZX: (pos: Vec3, approxZ: Vec3, approxX: Vec3) => Frame;
  /** From a row-vector rigid matrix — rows [X; Y; Z; origin] (C# `frmFromMatrix4x4`). */
  readonly fromMat4: (m: Mat4) => Frame;
  /** Local point (2D points lie in the frame's XY plane) → world (C# `vecPtToWorld`). */
  readonly ptToWorld: (f: Frame, local: Vec2 | Vec3) => Vec3;
  /** Local direction → world direction, safe-normalized (C# `vecDirToWorld`). */
  readonly dirToWorld: (f: Frame, localDir: Vec2 | Vec3) => Vec3;
  /** World point → local coordinates (C# `vecPtFromWorld`). */
  readonly ptFromWorld: (f: Frame, world: Vec3) => Vec3;
  /** World direction → local direction, safe-normalized (C# `vecDirFromWorld`). */
  readonly dirFromWorld: (f: Frame, worldDir: Vec3) => Vec3;
  /** Combined transform: `a` applied to `b` (C# `frmCompose` / `Frame3d * Frame3d`). */
  readonly compose: (a: Frame, b: Frame) => Frame;
  /**
   * The inverse transform — maps world to local (C# `frmInverse`), **fixed
   * here** (an upstream bug, fixed upstream in 0e6cf6b6):
   * C# copies `vecLz`/`vecLx` verbatim into the inverse, inverting the
   * translation but NOT the rotation, so `frmCompose(frmInverse())` is only
   * the identity for rotation-free frames. The inverse rotation is Rᵀ, whose
   * basis columns are the ROWS of R.
   */
  readonly inverse: (f: Frame) => Frame;
  /** Origin moved by a local-space distance (C# `frmMovedLocal`). */
  readonly movedLocal: (f: Frame, distance: Vec3) => Frame;
  /** Origin moved along local X (C# `frmMovedLocalX`). */
  readonly movedLocalX: (f: Frame, distance: number) => Frame;
  /** Origin moved along local Y (C# `frmMovedLocalY`). */
  readonly movedLocalY: (f: Frame, distance: number) => Frame;
  /** Origin moved along local Z (C# `frmMovedLocalZ`). */
  readonly movedLocalZ: (f: Frame, distance: number) => Frame;
  /** Origin moved by a world-space distance (C# `frmMovedWorld`). */
  readonly movedWorld: (f: Frame, distance: Vec3) => Frame;
  /** Origin moved along world X (C# `frmMovedWorldX`). */
  readonly movedWorldX: (f: Frame, distance: number) => Frame;
  /** Origin moved along world Y (C# `frmMovedWorldY`). */
  readonly movedWorldY: (f: Frame, distance: number) => Frame;
  /** Origin moved along world Z (C# `frmMovedWorldZ`). */
  readonly movedWorldZ: (f: Frame, distance: number) => Frame;
  /** Rotated about a world-space axis through the frame's origin (C# `frmRotatedWorld`). */
  readonly rotatedWorld: (f: Frame, axis: Vec3, angle: Rad) => Frame;
  /** Same orientation at a new origin (C# `frmRepositioned`). */
  readonly repositioned: (f: Frame, newPos: Vec3) => Frame;
  /**
   * As a row-vector rigid `Mat4` — basis in rows, translation in 12–14; the
   * layout `mesh.transform({ matrix })` consumes (C# `matAsMatrix4x4`).
   */
  readonly toMat4: (f: Frame) => Mat4;
  /** Scale-then-frame model matrix for drawing scaled geometry (C# `matComposeWithScale`). */
  readonly composeWithScale: (f: Frame, scale: Vec3) => Mat4;
  /** The transform as rotation quaternion + origin (C# `AsRigid`; out-params → returned object). */
  readonly asRigid: (f: Frame) => {
    rotation: Quat;
    origin: Vec3;
  };
  /**
   * Interpolate two frames: slerp the rotations (shortest arc), lerp the
   * positions; `t` clamped to 0..1 (C# `frmInterpolate`).
   */
  readonly interpolate: (a: Frame, b: Frame, t: number) => Frame;
  /** Exact component equality (C# `Equals`). */
  readonly equals: (a: Frame, b: Frame) => boolean;
}

  // The world coordinate system (C# `frmWorld`)
  readonly world: Frame

  // World-aligned axes at a position (C# `frmFromPos` / `Frame3d(vecPos)`)
  readonly fromPos: (pos: Vec3) => Frame

  // From approximate Z and X directions
  readonly fromZX: (pos: Vec3, approxZ: Vec3, approxX: Vec3) => Frame

  // From a row-vector rigid matrix — rows [X
  readonly fromMat4: (m: Mat4) => Frame

  // Local point (2D points lie in the frame's XY plane) → world (C# `vecPtToWorld`)
  readonly ptToWorld: (f: Frame, local: Vec2 | Vec3) => Vec3

  // Local direction → world direction, safe-normalized (C# `vecDirToWorld`)
  readonly dirToWorld: (f: Frame, localDir: Vec2 | Vec3) => Vec3

  // World point → local coordinates (C# `vecPtFromWorld`)
  readonly ptFromWorld: (f: Frame, world: Vec3) => Vec3

  // World direction → local direction, safe-normalized (C# `vecDirFromWorld`)
  readonly dirFromWorld: (f: Frame, worldDir: Vec3) => Vec3

  // Combined transform
  readonly compose: (a: Frame, b: Frame) => Frame

  // The inverse transform — maps world to local (C# `frmInverse`), **fixed here** (an upstream bug, fixed upstream in 0e6cf6b6)
  readonly inverse: (f: Frame) => Frame

  // Origin moved by a local-space distance (C# `frmMovedLocal`)
  readonly movedLocal: (f: Frame, distance: Vec3) => Frame

  // Origin moved along local X (C# `frmMovedLocalX`)
  readonly movedLocalX: (f: Frame, distance: number) => Frame

  // Origin moved along local Y (C# `frmMovedLocalY`)
  readonly movedLocalY: (f: Frame, distance: number) => Frame

  // Origin moved along local Z (C# `frmMovedLocalZ`)
  readonly movedLocalZ: (f: Frame, distance: number) => Frame

  // Origin moved by a world-space distance (C# `frmMovedWorld`)
  readonly movedWorld: (f: Frame, distance: Vec3) => Frame

  // Origin moved along world X (C# `frmMovedWorldX`)
  readonly movedWorldX: (f: Frame, distance: number) => Frame

  // Origin moved along world Y (C# `frmMovedWorldY`)
  readonly movedWorldY: (f: Frame, distance: number) => Frame

  // Origin moved along world Z (C# `frmMovedWorldZ`)
  readonly movedWorldZ: (f: Frame, distance: number) => Frame

  // Rotated about a world-space axis through the frame's origin (C# `frmRotatedWorld`)
  readonly rotatedWorld: (f: Frame, axis: Vec3, angle: Rad) => Frame

  // Same orientation at a new origin (C# `frmRepositioned`)
  readonly repositioned: (f: Frame, newPos: Vec3) => Frame

  // As a row-vector rigid `Mat4` — basis in rows, translation in 12–14
  readonly toMat4: (f: Frame) => Mat4

  // Scale-then-frame model matrix for drawing scaled geometry (C# `matComposeWithScale`)
  readonly composeWithScale: (f: Frame, scale: Vec3) => Mat4

  // The transform as rotation quaternion + origin (C# `AsRigid`
  readonly asRigid: (f: Frame) => {
      rotation: Quat;
      origin: Vec3;
    }

  // Interpolate two frames
  readonly interpolate: (a: Frame, b: Frame, t: number) => Frame

  // Exact component equality (C# `Equals`)
  readonly equals: (a: Frame, b: Frame) => boolean

// `Matrix4x4` operations
mat4: {
  /** The identity matrix (C# `Matrix4x4.Identity`). */
  readonly identity: Mat4;
  /** Scale matrix (C# `Matrix4x4.CreateScale`). */
  readonly createScale: (scale: Vec3) => Mat4;
  /**
   * Matrix product `a·b` (C# `Matrix4x4.operator *`). Row-vector convention:
   * `v·(a·b)` applies `a` first, then `b`.
   */
  readonly multiply: (a: Mat4, b: Mat4) => Mat4;
}

  // The identity matrix (C# `Matrix4x4.Identity`)
  readonly identity: Mat4

  // Scale matrix (C# `Matrix4x4.CreateScale`)
  readonly createScale: (scale: Vec3) => Mat4

  // Matrix product `a·b` (C# `Matrix4x4.operator *`)
  readonly multiply: (a: Mat4, b: Mat4) => Mat4

// `Overhang` factories and accessors
overhang: {
  /** No overhang — vertical, self-supporting (C# `uNone`). */
  readonly none: Overhang;
  /** Maximum overhang — horizontal (C# `uFull`). */
  readonly full: Overhang;
  /** From normalized severity 0..1 (C# `uFromNormalized`). */
  readonly fromNormalized: (f: number) => Overhang;
  /** From percent 0..100 (C# `uFromPercent`). */
  readonly fromPercent: (f: number) => Overhang;
  /** From radians 0..π/2 (C# `uFromRad`). */
  readonly fromRad: (f: number) => Overhang;
  /** From degrees 0..90 (C# `uFromDeg`). */
  readonly fromDeg: (f: number) => Overhang;
  /**
   * From degrees measured from the horizontal plane — some 3D-printing vendors'
   * convention; avoid unless exchanging data with one (C# `uFromDegFromHorizontal`).
   */
  readonly fromDegFromHorizontal: (f: number) => Overhang;
  /** Severity as percent 0..100 (C# `fPercent`). */
  readonly percent: (u: Overhang) => number;
  /** Overhang angle in radians 0..π/2 (C# `fRad`). */
  readonly rad: (u: Overhang) => Rad;
  /** Overhang angle in degrees 0..90 (C# `fDeg`). */
  readonly deg: (u: Overhang) => number;
  /** Degrees from horizontal — the inverted vendor convention (C# `fDegFromHorizontal`). */
  readonly degFromHorizontal: (u: Overhang) => number;
}

  // No overhang — vertical, self-supporting (C# `uNone`)
  readonly none: Overhang

  // Maximum overhang — horizontal (C# `uFull`)
  readonly full: Overhang

  // From normalized severity 0..1 (C# `uFromNormalized`)
  readonly fromNormalized: (f: number) => Overhang

  // From percent 0..100 (C# `uFromPercent`)
  readonly fromPercent: (f: number) => Overhang

  // From radians 0..π/2 (C# `uFromRad`)
  readonly fromRad: (f: number) => Overhang

  // From degrees 0..90 (C# `uFromDeg`)
  readonly fromDeg: (f: number) => Overhang

  // From degrees measured from the horizontal plane — some 3D-printing vendors' convention
  readonly fromDegFromHorizontal: (f: number) => Overhang

  // Severity as percent 0..100 (C# `fPercent`)
  readonly percent: (u: Overhang) => number

  // Overhang angle in radians 0..π/2 (C# `fRad`)
  readonly rad: (u: Overhang) => Rad

  // Overhang angle in degrees 0..90 (C# `fDeg`)
  readonly deg: (u: Overhang) => number

  // Degrees from horizontal — the inverted vendor convention (C# `fDegFromHorizontal`)
  readonly degFromHorizontal: (u: Overhang) => number

// `Polar` factories and conversions
polar: {
  /** Validated constructor (C# `Polar(fR, rPhi)`). */
  readonly create: (r: number, phi: Rad) => Polar;
  /** From a 2D cartesian point (C# `Polar(Vector2)`; azimuth undefined at the origin → zero). */
  readonly fromCartesian: (v: Vec2) => Polar;
  /** To 2D cartesian (C# `vecAsCartesian`). */
  readonly toCartesian: (p: Polar) => Vec2;
  /** Lerp in polar space; the angular delta takes the short way around (C# `oLerp`). */
  readonly lerp: (a: Polar, b: Polar, t: number) => Polar;
}

  // Validated constructor (C# `Polar(fR, rPhi)`)
  readonly create: (r: number, phi: Rad) => Polar

  // From a 2D cartesian point (C# `Polar(Vector2)`
  readonly fromCartesian: (v: Vec2) => Polar

  // To 2D cartesian (C# `vecAsCartesian`)
  readonly toCartesian: (p: Polar) => Vec2

  // Lerp in polar space
  readonly lerp: (a: Polar, b: Polar, t: number) => Polar

// `Quaternion` operations
quat: {
  /** The identity rotation (C# `Quaternion.Identity`). */
  readonly identity: Quat;
  /**
   * From a rotation axis and angle (C# `Quaternion.CreateFromAxisAngle`).
   * As in .NET, the axis is used as given — normalize it first if needed.
   */
  readonly fromAxisAngle: (axis: Vec3, angle: Rad) => Quat;
  /**
   * Extract the rotation from a rigid row-vector matrix
   * (C# `Quaternion.CreateFromRotationMatrix`, Shepperd's method — the same
   * four branches as the .NET reference source).
   */
  readonly fromMat4: (m: Mat4) => Quat;
  /** Dot product (C# `Quaternion.Dot`). */
  readonly dot: (a: Quat, b: Quat) => number;
  /** Component-wise negation — the same rotation, opposite hemisphere. */
  readonly neg: (q: Quat) => Quat;
  /**
   * Spherical linear interpolation (C# `Quaternion.Slerp`): shortest arc —
   * flips the second quaternion's hemisphere when the dot is negative, and
   * falls back to lerp when the quaternions are nearly parallel.
   */
  readonly slerp: (a: Quat, b: Quat, t: number) => Quat;
  /** Rotate a vector by the quaternion (C# `Vector3.Transform(v, q)`). */
  readonly transform: (v: Vec3, q: Quat) => Vec3;
}

  // The identity rotation (C# `Quaternion.Identity`)
  readonly identity: Quat

  // From a rotation axis and angle (C# `Quaternion.CreateFromAxisAngle`)
  readonly fromAxisAngle: (axis: Vec3, angle: Rad) => Quat

  // Extract the rotation from a rigid row-vector matrix (C# `Quaternion.CreateFromRotationMatrix`, Shepperd's method — the same four branches as the .NET reference source)
  readonly fromMat4: (m: Mat4) => Quat

  // Dot product (C# `Quaternion.Dot`)
  readonly dot: (a: Quat, b: Quat) => number

  // Component-wise negation — the same rotation, opposite hemisphere
  readonly neg: (q: Quat) => Quat

  // Spherical linear interpolation (C# `Quaternion.Slerp`)
  readonly slerp: (a: Quat, b: Quat, t: number) => Quat

  // Rotate a vector by the quaternion (C# `Vector3.Transform(v, q)`)
  readonly transform: (v: Vec3, q: Quat) => Vec3

// `Rad` factories, constants and helpers
rad: {
  /** 0º (C# `Rad.Zero` / `Rad.Deg0`). */
  readonly zero: Rad;
  /** 360º (C# `Rad.Full` / `Rad.Deg360`). */
  readonly full: Rad;
  /** 180º (C# `Rad.Half` / `Rad.Deg180`). */
  readonly half: Rad;
  /** 90º (C# `Rad.Quarter` / `Rad.Deg90`). */
  readonly quarter: Rad;
  /** 45º (C# `Rad.Deg45`). */
  readonly deg45: Rad;
  /** Brand a radians value (C# `rFromRad` / the explicit float→Rad cast). */
  readonly fromRad: (f: number) => Rad;
  /** From degrees (C# `rFromDeg`). */
  readonly fromDeg: (degrees: number) => Rad;
  /** From a normalized 0..1 value mapped to 0..360º, clamped (C# `rFromNormalized`). */
  readonly fromNormalized: (normalized: number) => Rad;
  /** The angle in degrees (C# `fDeg`). */
  readonly deg: (r: Rad) => number;
  /** Normalize to -π..+π (C# `rNormalizedSigned`; 0 for exact multiples of 2π). */
  readonly normalizedSigned: (r: Rad) => Rad;
  /** Normalize to [0, 2π) (C# `rNormalizedPositive`). */
  readonly normalizedPositive: (r: Rad) => Rad;
  /** Fuzzy equality (C# `bAlmostEqual`). */
  readonly almostEqual: (a: Rad, b: Rad, toleranceRad?: 0.000001) => boolean;
  /** Fuzzy equality of the normalized angle — 0º == 360º == 720º (C# `bAlmostEqualPeriodic`). */
  readonly almostEqualPeriodic: (a: Rad, b: Rad, toleranceRad?: 0.000001) => boolean;
  /** Quadrant-correct angle from +X (C# `rAtan2`). */
  readonly atan2: (y: number, x: number) => Rad;
  /** Arc tangent (C# `rAtan`). */
  readonly atan: (f: number) => Rad;
  /** Arc cosine (C# `rAcos`). */
  readonly acos: (f: number) => Rad;
  /** Arc cosine of the value clamped to [-1, 1] — for float-drifted geometry (C# `rAcosClamped`). */
  readonly acosClamped: (f: number) => Rad;
  /** Arc sine (C# `rAsin`). */
  readonly asin: (f: number) => Rad;
  /** Arc sine of the value clamped to [-1, 1] (C# `rAsinClamped`). */
  readonly asinClamped: (f: number) => Rad;
  readonly add: (a: Rad, b: Rad) => Rad;
  readonly sub: (a: Rad, b: Rad) => Rad;
  readonly scale: (r: Rad, f: number) => Rad;
  readonly div: (r: Rad, f: number) => Rad;
  /** Dimensionless ratio of two angles (C# `Rad / Rad`). */
  readonly ratio: (a: Rad, b: Rad) => number;
  readonly neg: (r: Rad) => Rad;
}

  // 0º (C# `Rad.Zero` / `Rad.Deg0`)
  readonly zero: Rad

  // 360º (C# `Rad.Full` / `Rad.Deg360`)
  readonly full: Rad

  // 180º (C# `Rad.Half` / `Rad.Deg180`)
  readonly half: Rad

  // 90º (C# `Rad.Quarter` / `Rad.Deg90`)
  readonly quarter: Rad

  // 45º (C# `Rad.Deg45`)
  readonly deg45: Rad

  // Brand a radians value (C# `rFromRad` / the explicit float→Rad cast)
  readonly fromRad: (f: number) => Rad

  // From degrees (C# `rFromDeg`)
  readonly fromDeg: (degrees: number) => Rad

  // From a normalized 0..1 value mapped to 0..360º, clamped (C# `rFromNormalized`)
  readonly fromNormalized: (normalized: number) => Rad

  // The angle in degrees (C# `fDeg`)
  readonly deg: (r: Rad) => number

  // Normalize to -π..+π (C# `rNormalizedSigned`
  readonly normalizedSigned: (r: Rad) => Rad

  // Normalize to [0, 2π) (C# `rNormalizedPositive`)
  readonly normalizedPositive: (r: Rad) => Rad

  // Fuzzy equality (C# `bAlmostEqual`)
  readonly almostEqual: (a: Rad, b: Rad, toleranceRad?: 0.000001) => boolean

  // Fuzzy equality of the normalized angle — 0º == 360º == 720º (C# `bAlmostEqualPeriodic`)
  readonly almostEqualPeriodic: (a: Rad, b: Rad, toleranceRad?: 0.000001) => boolean

  // Quadrant-correct angle from +X (C# `rAtan2`)
  readonly atan2: (y: number, x: number) => Rad

  // Arc tangent (C# `rAtan`)
  readonly atan: (f: number) => Rad

  // Arc cosine (C# `rAcos`)
  readonly acos: (f: number) => Rad

  // Arc cosine of the value clamped to [-1, 1] — for float-drifted geometry (C# `rAcosClamped`)
  readonly acosClamped: (f: number) => Rad

  // Arc sine (C# `rAsin`)
  readonly asin: (f: number) => Rad

  // Arc sine of the value clamped to [-1, 1] (C# `rAsinClamped`)
  readonly asinClamped: (f: number) => Rad

  readonly add: (a: Rad, b: Rad) => Rad

  readonly sub: (a: Rad, b: Rad) => Rad

  readonly scale: (r: Rad, f: number) => Rad

  readonly div: (r: Rad, f: number) => Rad

  // Dimensionless ratio of two angles (C# `Rad / Rad`)
  readonly ratio: (a: Rad, b: Rad) => number

  readonly neg: (r: Rad) => Rad

// Fuzzy scalar comparisons (C# `ComparisonExtensions` on `float`)
scalar: {
  /**
   * Fuzzy equality with both an absolute and a relative tolerance
   * (C# `float.bAlmostEqual`): equal when exactly equal, within `absTol`,
   * or within `relTol` of the larger magnitude.
   */
  readonly almostEqual: (a: number, b: number, absTol?: 0.000001, relTol?: 0.000001) => boolean;
  /** `a <= b + tol` (C# `bAlmostLessOrEqual`). */
  readonly almostLessOrEqual: (a: number, b: number, tol?: 0.000001) => boolean;
  /** `a >= b - tol` (C# `bAlmostMoreOrEqual`). */
  readonly almostMoreOrEqual: (a: number, b: number, tol?: 0.000001) => boolean;
  /** Fuzzy zero test (C# `bAlmostZero`). */
  readonly almostZero: (f: number, zero?: 1e-8) => boolean;
}

  // Fuzzy equality with both an absolute and a relative tolerance (C# `float.bAlmostEqual`)
  readonly almostEqual: (a: number, b: number, absTol?: 0.000001, relTol?: 0.000001) => boolean

  // `a <= b + tol` (C# `bAlmostLessOrEqual`)
  readonly almostLessOrEqual: (a: number, b: number, tol?: 0.000001) => boolean

  // `a >= b - tol` (C# `bAlmostMoreOrEqual`)
  readonly almostMoreOrEqual: (a: number, b: number, tol?: 0.000001) => boolean

  // Fuzzy zero test (C# `bAlmostZero`)
  readonly almostZero: (f: number, zero?: 1e-8) => boolean

// `Spherical` factories and conversions
spherical: {
  /** Validated constructor (C# `Spherical(fR, rPhi, rTheta)`; theta must lie in [0, π]). */
  readonly create: (r: number, phi: Rad, theta: Rad) => Spherical;
  /** From a cartesian point (C# `Spherical(Vector3)`; angles undefined at the origin → zeros). */
  readonly fromCartesian: (v: Vec3) => Spherical;
  /** From a cylindrical coordinate (C# `Spherical(Cylindrical)`). */
  readonly fromCylindrical: (c: Cylindrical) => Spherical;
  /** To cartesian (C# `vecAsCartesian`). */
  readonly toCartesian: (s: Spherical) => Vec3;
  /** Lerp in spherical space; azimuthal delta short-way-around (C# `oLerp`). */
  readonly lerp: (a: Spherical, b: Spherical, t: number) => Spherical;
}

  // Validated constructor (C# `Spherical(fR, rPhi, rTheta)`
  readonly create: (r: number, phi: Rad, theta: Rad) => Spherical

  // From a cartesian point (C# `Spherical(Vector3)`
  readonly fromCartesian: (v: Vec3) => Spherical

  // From a cylindrical coordinate (C# `Spherical(Cylindrical)`)
  readonly fromCylindrical: (c: Cylindrical) => Spherical

  // To cartesian (C# `vecAsCartesian`)
  readonly toCartesian: (s: Spherical) => Vec3

  // Lerp in spherical space
  readonly lerp: (a: Spherical, b: Spherical, t: number) => Spherical

// Default tolerances for fuzzy comparisons (C# `PicoGK.Numerics.Tolerances`)
tolerances: {
  /** Default tolerance for fuzzy comparisons (`Tolerances.fDef`). */
  readonly def: 0.000001;
  /** `Tolerances.fDefSquared` — for squared-distance comparisons. */
  readonly defSquared: number;
  /** Value regarded as zero in fuzzy zero checks (`Tolerances.fZero`). */
  readonly zero: 1e-8;
  /** `Tolerances.fZeroSquared` — squared variant. */
  readonly zeroSquared: number;
}

  // Default tolerance for fuzzy comparisons (`Tolerances.fDef`)
  readonly def: 0.000001

  // `Tolerances.fDefSquared` — for squared-distance comparisons
  readonly defSquared: number

  // Value regarded as zero in fuzzy zero checks (`Tolerances.fZero`)
  readonly zero: 1e-8

  // `Tolerances.fZeroSquared` — squared variant
  readonly zeroSquared: number

// `Vector2` operations
vec2: {
  readonly zero: Vec2;
  readonly add: (a: Vec2, b: Vec2) => Vec2;
  readonly sub: (a: Vec2, b: Vec2) => Vec2;
  readonly scale: (v: Vec2, f: number) => Vec2;
  readonly dot: (a: Vec2, b: Vec2) => number;
  readonly lengthSquared: (v: Vec2) => number;
  readonly length: (v: Vec2) => number;
  readonly distanceSquared: (a: Vec2, b: Vec2) => number;
  readonly lerp: (a: Vec2, b: Vec2, t: number) => Vec2;
  /** Unit-length copy; throws on (almost) zero-length input (C# `vecNormalized`). */
  readonly normalized: (v: Vec2) => Vec2;
  /** Unit-length copy, or (0,0) for (almost) zero-length input (C# `vecSafeNormalized`). */
  readonly safeNormalized: (v: Vec2) => Vec2;
  /** Lift to 3D by appending Z (C# `vecAsVector3`). */
  readonly asVec3: (v: Vec2, z?: number) => Vec3;
  /** Fuzzy equality by squared distance (C# `Vector2.bAlmostEqual`). */
  readonly almostEqual: (a: Vec2, b: Vec2, distSquared?: number) => boolean;
  /** Fuzzy zero-length test (C# `Vector2.bAlmostZero`). */
  readonly almostZero: (v: Vec2, zeroSquared?: number) => boolean;
  /** All components finite (C# `Vector2.bIsFinite`). */
  readonly isFinite: (v: Vec2) => boolean;
}

  readonly zero: Vec2

  readonly add: (a: Vec2, b: Vec2) => Vec2

  readonly sub: (a: Vec2, b: Vec2) => Vec2

  readonly scale: (v: Vec2, f: number) => Vec2

  readonly dot: (a: Vec2, b: Vec2) => number

  readonly lengthSquared: (v: Vec2) => number

  readonly length: (v: Vec2) => number

  readonly distanceSquared: (a: Vec2, b: Vec2) => number

  readonly lerp: (a: Vec2, b: Vec2, t: number) => Vec2

  // Unit-length copy
  readonly normalized: (v: Vec2) => Vec2

  // Unit-length copy, or (0,0) for (almost) zero-length input (C# `vecSafeNormalized`)
  readonly safeNormalized: (v: Vec2) => Vec2

  // Lift to 3D by appending Z (C# `vecAsVector3`)
  readonly asVec3: (v: Vec2, z?: number) => Vec3

  // Fuzzy equality by squared distance (C# `Vector2.bAlmostEqual`)
  readonly almostEqual: (a: Vec2, b: Vec2, distSquared?: number) => boolean

  // Fuzzy zero-length test (C# `Vector2.bAlmostZero`)
  readonly almostZero: (v: Vec2, zeroSquared?: number) => boolean

  // All components finite (C# `Vector2.bIsFinite`)
  readonly isFinite: (v: Vec2) => boolean

// `Vector3` operations
vec3: {
  readonly zero: Vec3;
  readonly unitX: Vec3;
  readonly unitY: Vec3;
  readonly unitZ: Vec3;
  readonly one: Vec3;
  readonly add: (a: Vec3, b: Vec3) => Vec3;
  readonly sub: (a: Vec3, b: Vec3) => Vec3;
  readonly neg: (v: Vec3) => Vec3;
  readonly scale: (v: Vec3, f: number) => Vec3;
  readonly dot: (a: Vec3, b: Vec3) => number;
  readonly cross: (a: Vec3, b: Vec3) => Vec3;
  readonly lengthSquared: (v: Vec3) => number;
  readonly length: (v: Vec3) => number;
  readonly distanceSquared: (a: Vec3, b: Vec3) => number;
  readonly distance: (a: Vec3, b: Vec3) => number;
  readonly lerp: (a: Vec3, b: Vec3, t: number) => Vec3;
  /** Unit-length copy; throws on (almost) zero-length input (C# `vecNormalized`). */
  readonly normalized: (v: Vec3) => Vec3;
  /** Unit-length copy, or (0,0,0) for (almost) zero-length input (C# `vecSafeNormalized`). */
  readonly safeNormalized: (v: Vec3) => Vec3;
  /** Drop Z (C# `vecStripZ`). */
  readonly stripZ: (v: Vec3) => Vec2;
  /**
   * Row-vector matrix transform — translation lives in elements 12–14, the same
   * System.Numerics convention `mesh.transform({ matrix })` uses
   * (C# `Vector3.Transform(v, m)` / `vecTransformed`).
   */
  readonly transformed: (v: Vec3, m: Mat4) => Vec3;
  /**
   * Mirror a point across the plane through `planePoint` with `planeNormal`
   * (C# `vecMirrored`; the normal is safe-normalized first).
   */
  readonly mirrored: (pt: Vec3, planePoint: Vec3, planeNormal: Vec3) => Vec3;
  /** Fuzzy equality by squared distance (C# `Vector3.bAlmostEqual`). */
  readonly almostEqual: (a: Vec3, b: Vec3, distSquared?: number) => boolean;
  /** Fuzzy zero-length test (C# `Vector3.bAlmostZero`). */
  readonly almostZero: (v: Vec3, zeroSquared?: number) => boolean;
  /** All components finite (C# `Vector3.bIsFinite`). */
  readonly isFinite: (v: Vec3) => boolean;
}

  readonly zero: Vec3

  readonly unitX: Vec3

  readonly unitY: Vec3

  readonly unitZ: Vec3

  readonly one: Vec3

  readonly add: (a: Vec3, b: Vec3) => Vec3

  readonly sub: (a: Vec3, b: Vec3) => Vec3

  readonly neg: (v: Vec3) => Vec3

  readonly scale: (v: Vec3, f: number) => Vec3

  readonly dot: (a: Vec3, b: Vec3) => number

  readonly cross: (a: Vec3, b: Vec3) => Vec3

  readonly lengthSquared: (v: Vec3) => number

  readonly length: (v: Vec3) => number

  readonly distanceSquared: (a: Vec3, b: Vec3) => number

  readonly distance: (a: Vec3, b: Vec3) => number

  readonly lerp: (a: Vec3, b: Vec3, t: number) => Vec3

  // Unit-length copy
  readonly normalized: (v: Vec3) => Vec3

  // Unit-length copy, or (0,0,0) for (almost) zero-length input (C# `vecSafeNormalized`)
  readonly safeNormalized: (v: Vec3) => Vec3

  // Drop Z (C# `vecStripZ`)
  readonly stripZ: (v: Vec3) => Vec2

  // Row-vector matrix transform — translation lives in elements 12–14, the same System.Numerics convention `mesh.transform({ matrix })` uses (C# `Vector3.Transform(v, m)` / `vecTransformed`)
  readonly transformed: (v: Vec3, m: Mat4) => Vec3

  // Mirror a point across the plane through `planePoint` with `planeNormal` (C# `vecMirrored`
  readonly mirrored: (pt: Vec3, planePoint: Vec3, planeNormal: Vec3) => Vec3

  // Fuzzy equality by squared distance (C# `Vector3.bAlmostEqual`)
  readonly almostEqual: (a: Vec3, b: Vec3, distSquared?: number) => boolean

  // Fuzzy zero-length test (C# `Vector3.bAlmostZero`)
  readonly almostZero: (v: Vec3, zeroSquared?: number) => boolean

  // All components finite (C# `Vector3.bIsFinite`)
  readonly isFinite: (v: Vec3) => boolean

// ShapeKernel `LocalFrame` construction helpers over the numerics `Frame`
localFrame: {
  /** World-aligned frame at the origin (C# `LocalFrame()`). */
  readonly identity: Frame;
  /** World-aligned axes at a position (C# `LocalFrame(vecPos)`). */
  readonly create: (pos: Vec3) => Frame;
  /** Same axes as the base frame at a new position (C# `LocalFrame(oBaseFrame, vecNewPos)`). */
  readonly at: (base: Frame, newPos: Vec3) => Frame;
  /**
   * Position + local Z; X is an arbitrary orthogonal direction to Z
   * (C# `LocalFrame(vecPos, vecLocalZ)`).
   */
  readonly createZ: (pos: Vec3, localZ: Vec3) => Frame;
  /**
   * Position + local Z + local X; Y completes the right-handed system
   * (C# `LocalFrame(vecPos, vecLocalZ, vecLocalX)`; X is NOT re-orthogonalized).
   */
  readonly createZX: (pos: Vec3, localZ: Vec3, localX: Vec3) => Frame;
  /** Translated frame, axes unchanged (C# `oTranslate` / `oGetTranslatedFrame`). */
  readonly translated: (f: Frame, delta: Vec3) => Frame;
  /** All axes rotated about an axis, position unchanged (C# `oRotate` / `oGetRotatedFrame`). */
  readonly rotated: (f: Frame, deltaPhi: number, axis: Vec3) => Frame;
  /** Selected axes negated, position unchanged (C# `oGetInvertFrame`; rotates rather than truly inverting). */
  readonly inverted: (f: Frame, mirrorZ: boolean, mirrorX: boolean) => Frame;
  /** Y completing Z and X right-handedly (C# `vecGetLocalY`; a plain cross, no normalization). */
  readonly localY: (localZ: Vec3, localX: Vec3) => Vec3;
}

  // World-aligned frame at the origin (C# `LocalFrame()`)
  readonly identity: Frame

  // World-aligned axes at a position (C# `LocalFrame(vecPos)`)
  readonly create: (pos: Vec3) => Frame

  // Same axes as the base frame at a new position (C# `LocalFrame(oBaseFrame, vecNewPos)`)
  readonly at: (base: Frame, newPos: Vec3) => Frame

  // Position + local Z
  readonly createZ: (pos: Vec3, localZ: Vec3) => Frame

  // Position + local Z + local X
  readonly createZX: (pos: Vec3, localZ: Vec3, localX: Vec3) => Frame

  // Translated frame, axes unchanged (C# `oTranslate` / `oGetTranslatedFrame`)
  readonly translated: (f: Frame, delta: Vec3) => Frame

  // All axes rotated about an axis, position unchanged (C# `oRotate` / `oGetRotatedFrame`)
  readonly rotated: (f: Frame, deltaPhi: number, axis: Vec3) => Frame

  // Selected axes negated, position unchanged (C# `oGetInvertFrame`
  readonly inverted: (f: Frame, mirrorZ: boolean, mirrorX: boolean) => Frame

  // Y completing Z and X right-handedly (C# `vecGetLocalY`
  readonly localY: (localZ: Vec3, localX: Vec3) => Vec3

// ShapeKernel `MeshUtility` (static class → const object
meshUtility: {
  /** Mesh from a regular point grid, quad by quad (C# `mshFromGrid`). */
  readonly meshFromGrid: (pk: Pico, grid: readonly (readonly Vec3[])[]) => Mesh;
  /** Mesh from one quad (C# `mshFromQuad`). */
  readonly meshFromQuad: (pk: Pico, pt1: Vec3, pt2: Vec3, pt3: Vec3, pt4: Vec3) => Mesh;
  /** New mesh with the transformation applied per vertex (C# `mshApplyTransformation`). */
  readonly applyTransformation: (pk: Pico, mesh: Mesh, trafo: VertexTransformation) => Mesh;
  /** Voxels → mesh → per-vertex transform → voxels (C# `voxApplyTransformation`). */
  readonly voxApplyTransformation: (pk: Pico, voxels: Voxels, trafo: VertexTransformation) => Voxels;
  /** Mesh re-expressed from the input frame onto the output frame (C# `mshTranslateMeshOntoFrame`). */
  readonly translateMeshOntoFrame: (pk: Pico, mesh: Mesh, inputFrame: Frame, outputFrame: Frame) => Mesh;
}

  // Mesh from a regular point grid, quad by quad (C# `mshFromGrid`)
  readonly meshFromGrid: (pk: Pico, grid: readonly (readonly Vec3[])[]) => Mesh

  // Mesh from one quad (C# `mshFromQuad`)
  readonly meshFromQuad: (pk: Pico, pt1: Vec3, pt2: Vec3, pt3: Vec3, pt4: Vec3) => Mesh

  // New mesh with the transformation applied per vertex (C# `mshApplyTransformation`)
  readonly applyTransformation: (pk: Pico, mesh: Mesh, trafo: VertexTransformation) => Mesh

  // Voxels → mesh → per-vertex transform → voxels (C# `voxApplyTransformation`)
  readonly voxApplyTransformation: (pk: Pico, voxels: Voxels, trafo: VertexTransformation) => Voxels

  // Mesh re-expressed from the input frame onto the output frame (C# `mshTranslateMeshOntoFrame`)
  readonly translateMeshOntoFrame: (pk: Pico, mesh: Mesh, inputFrame: Frame, outputFrame: Frame) => Mesh

// ShapeKernel `Sh` — the headless subset, session-first
sh: {
  /** Beams along a point list (C# `latFromLine`). */
  readonly latFromLine: (pk: Pico, points: readonly Vec3[], beam: number) => Lattice;
  /** Adds a point list to an existing lattice (C# `AddLine`). */
  readonly addLine: (lattice: Lattice, points: readonly Vec3[], beam: number) => void;
  /** Node-only lattice from a point cloud (C# `latFromPoints`). */
  readonly latFromPoints: (pk: Pico, points: readonly Vec3[], beam: number) => Lattice;
  /** Beams along multiple point lists (C# `latFromEdges`). */
  readonly latFromEdges: (pk: Pico, edges: readonly (readonly Vec3[])[], beam: number) => Lattice;
  /** Node-only lattice from one point (C# `latFromPoint`). */
  readonly latFromPoint: (pk: Pico, pt: Vec3, beam: number) => Lattice;
  /**
   * Lattice from a grid: rows then transposed columns. Ported VERBATIM
   * including the upstream quirk — each row REPLACES the lattice
   * (`oLattice = latFromLine(...)` in a loop), so only the LAST row survives
   * alongside the full column pass (C# `latFromGrid`).
   */
  readonly latFromGrid: (pk: Pico, grid: readonly (readonly Vec3[])[], beam: number) => Lattice;
  /** One beam, constant radius (C# `latFromBeam`). */
  readonly latFromBeam: (pk: Pico, pt1: Vec3, pt2: Vec3, beam: number, rounded: boolean) => Lattice;
  /** One beam, variable radius (C# `latFromBeam` overload). */
  readonly latFromTaperedBeam: (pk: Pico, pt1: Vec3, pt2: Vec3, beam1: number, beam2: number, rounded: boolean) => Lattice;
  /** Binary STL bytes of a mesh (C# `ExportMeshToSTLFile` — bytes, not paths). */
  readonly exportMeshToStl: (mesh: Mesh) => Uint8Array;
  /** Binary STL bytes of a voxel field via meshing (C# `ExportVoxelsToSTLFile`). */
  readonly exportVoxelsToStl: (voxels: Voxels) => Uint8Array;
  /** VDB bytes of a voxel field (C# `ExportVoxelsToVDBFile`). */
  readonly exportVoxelsToVdb: (pk: Pico, voxels: Voxels) => Uint8Array;
  /** CLI slice bytes of a voxel field (C# `ExportVoxelsToCLIFile`). */
  readonly exportVoxelsToCli: (voxels: Voxels) => Uint8Array;
}

  // Beams along a point list (C# `latFromLine`)
  readonly latFromLine: (pk: Pico, points: readonly Vec3[], beam: number) => Lattice

  // Adds a point list to an existing lattice (C# `AddLine`)
  readonly addLine: (lattice: Lattice, points: readonly Vec3[], beam: number) => void

  // Node-only lattice from a point cloud (C# `latFromPoints`)
  readonly latFromPoints: (pk: Pico, points: readonly Vec3[], beam: number) => Lattice

  // Beams along multiple point lists (C# `latFromEdges`)
  readonly latFromEdges: (pk: Pico, edges: readonly (readonly Vec3[])[], beam: number) => Lattice

  // Node-only lattice from one point (C# `latFromPoint`)
  readonly latFromPoint: (pk: Pico, pt: Vec3, beam: number) => Lattice

  // Lattice from a grid
  readonly latFromGrid: (pk: Pico, grid: readonly (readonly Vec3[])[], beam: number) => Lattice

  // One beam, constant radius (C# `latFromBeam`)
  readonly latFromBeam: (pk: Pico, pt1: Vec3, pt2: Vec3, beam: number, rounded: boolean) => Lattice

  // One beam, variable radius (C# `latFromBeam` overload)
  readonly latFromTaperedBeam: (pk: Pico, pt1: Vec3, pt2: Vec3, beam1: number, beam2: number, rounded: boolean) => Lattice

  // Binary STL bytes of a mesh (C# `ExportMeshToSTLFile` — bytes, not paths)
  readonly exportMeshToStl: (mesh: Mesh) => Uint8Array

  // Binary STL bytes of a voxel field via meshing (C# `ExportVoxelsToSTLFile`)
  readonly exportVoxelsToStl: (voxels: Voxels) => Uint8Array

  // VDB bytes of a voxel field (C# `ExportVoxelsToVDBFile`)
  readonly exportVoxelsToVdb: (pk: Pico, voxels: Voxels) => Uint8Array

  // CLI slice bytes of a voxel field (C# `ExportVoxelsToCLIFile`)
  readonly exportVoxelsToCli: (voxels: Voxels) => Uint8Array

// ShapeKernel `SplineOperations` (static class → const object)
splineOps: {
  /** Linearly interpolated points from start to end inclusive (C# `aGetLinearInterpolation`). */
  readonly linearInterpolation: (start: Vec3, end: Vec3, samples: number) => Vec3[];
  /** Each point snapped to the closest surface point of the target (C# `aGetSnappedSpline`). */
  readonly snappedSpline: (points: readonly Vec3[], target: Voxels) => Vec3[];
  /** Resample to a target count with constant spacing; endpoints preserved (C# count overload). */
  readonly reparametrizedByCount: (points: readonly Vec3[], targetSamples: number) => Vec3[];
  /** Resample to a target spacing (min 10 samples, C# spacing overload). */
  readonly reparametrizedBySpacing: (points: readonly Vec3[], targetSpacing: number) => Vec3[];
  /** Cumulative arc length at each index (C# `aGetLengthsAtIndices`). */
  readonly lengthsAtIndices: (points: readonly Vec3[]) => number[];
  /** Average spacing between consecutive points (C# `fGetAveragePointSpacing`). */
  readonly averagePointSpacing: (points: readonly Vec3[]) => number;
  /** Total arc length (C# `fGetTotalLength`). */
  readonly totalLength: (points: readonly Vec3[]) => number;
  /** Split at an index into two non-overlapping lists (C# `aSplitLists`). */
  readonly splitAt: (points: readonly Vec3[], firstIndexOfSecond: number) => [Vec3[], Vec3[]];
  /** Concatenate lists (C# `aCombineLists`). */
  readonly combine: (lists: readonly (readonly Vec3[])[]) => Vec3[];
  /** Every point rotated about the absolute Z axis (C# `aRotateListAroundZ`). */
  readonly rotatedAroundZ: (points: readonly Vec3[], angle: number) => Vec3[];
  /** Every point translated (C# `aTranslateList`). */
  readonly translated: (points: readonly Vec3[], shift: Vec3) => Vec3[];
  /** Every point scaled about the origin (C# `aScaleList`). */
  readonly scaled: (points: readonly Vec3[], factor: number) => Vec3[];
  /** NURBS smoothing via a degree-2 open BSpline (C# `aGetNURBSpline`). */
  readonly nurbsSpline: (controlPoints: readonly Vec3[], samples: number) => Vec3[];
  /** Linear oversampling with N samples per step (C# `aOverSampleList`). */
  readonly overSampled: (points: readonly Vec3[], samplesPerStep: number) => Vec3[];
  /** Every Nth point, end preserved (C# `aSubSampleList`). */
  readonly subSampled: (points: readonly Vec3[], sampleSize: number) => Vec3[];
  /** Every point moved onto a frame's coordinate system (C# `aTranslateListOntoFrame`). */
  readonly ontoFrame: (f: Frame, points: readonly Vec3[]) => Vec3[];
  /** Every point expressed relative to a frame (C# `aExpressListInFrame`). */
  readonly inFrame: (f: Frame, points: readonly Vec3[]) => Vec3[];
  /** Every point rotated about an arbitrary axis (C# `aRotateListAroundAxis`). */
  readonly rotatedAroundAxis: (points: readonly Vec3[], deltaPhi: number, axis: Vec3, axisOrigin?: Vec3) => Vec3[];
  /** Average of all positions (C# `vecGetAverage`). */
  readonly average: (points: readonly Vec3[]) => Vec3;
  /** The list point closest to `start` (C# `vecGetClosestPoint`). */
  readonly closestPoint: (points: readonly Vec3[], start: Vec3) => Vec3;
  /** Distance to the closest list point (C# `fGetDistanceToClosestPoint`). */
  readonly distanceToClosestPoint: (points: readonly Vec3[], start: Vec3) => number;
  /** Greedy clustering: keep points farther than the range from every kept point (C# `aGetClusteredPoints`). */
  readonly clusteredPoints: (points: readonly Vec3[], clusteringRange: number) => Vec3[];
}

  // Linearly interpolated points from start to end inclusive (C# `aGetLinearInterpolation`)
  readonly linearInterpolation: (start: Vec3, end: Vec3, samples: number) => Vec3[]

  // Each point snapped to the closest surface point of the target (C# `aGetSnappedSpline`)
  readonly snappedSpline: (points: readonly Vec3[], target: Voxels) => Vec3[]

  // Resample to a target count with constant spacing
  readonly reparametrizedByCount: (points: readonly Vec3[], targetSamples: number) => Vec3[]

  // Resample to a target spacing (min 10 samples, C# spacing overload)
  readonly reparametrizedBySpacing: (points: readonly Vec3[], targetSpacing: number) => Vec3[]

  // Cumulative arc length at each index (C# `aGetLengthsAtIndices`)
  readonly lengthsAtIndices: (points: readonly Vec3[]) => number[]

  // Average spacing between consecutive points (C# `fGetAveragePointSpacing`)
  readonly averagePointSpacing: (points: readonly Vec3[]) => number

  // Total arc length (C# `fGetTotalLength`)
  readonly totalLength: (points: readonly Vec3[]) => number

  // Split at an index into two non-overlapping lists (C# `aSplitLists`)
  readonly splitAt: (points: readonly Vec3[], firstIndexOfSecond: number) => [Vec3[], Vec3[]]

  // Concatenate lists (C# `aCombineLists`)
  readonly combine: (lists: readonly (readonly Vec3[])[]) => Vec3[]

  // Every point rotated about the absolute Z axis (C# `aRotateListAroundZ`)
  readonly rotatedAroundZ: (points: readonly Vec3[], angle: number) => Vec3[]

  // Every point translated (C# `aTranslateList`)
  readonly translated: (points: readonly Vec3[], shift: Vec3) => Vec3[]

  // Every point scaled about the origin (C# `aScaleList`)
  readonly scaled: (points: readonly Vec3[], factor: number) => Vec3[]

  // NURBS smoothing via a degree-2 open BSpline (C# `aGetNURBSpline`)
  readonly nurbsSpline: (controlPoints: readonly Vec3[], samples: number) => Vec3[]

  // Linear oversampling with N samples per step (C# `aOverSampleList`)
  readonly overSampled: (points: readonly Vec3[], samplesPerStep: number) => Vec3[]

  // Every Nth point, end preserved (C# `aSubSampleList`)
  readonly subSampled: (points: readonly Vec3[], sampleSize: number) => Vec3[]

  // Every point moved onto a frame's coordinate system (C# `aTranslateListOntoFrame`)
  readonly ontoFrame: (f: Frame, points: readonly Vec3[]) => Vec3[]

  // Every point expressed relative to a frame (C# `aExpressListInFrame`)
  readonly inFrame: (f: Frame, points: readonly Vec3[]) => Vec3[]

  // Every point rotated about an arbitrary axis (C# `aRotateListAroundAxis`)
  readonly rotatedAroundAxis: (points: readonly Vec3[], deltaPhi: number, axis: Vec3, axisOrigin?: Vec3) => Vec3[]

  // Average of all positions (C# `vecGetAverage`)
  readonly average: (points: readonly Vec3[]) => Vec3

  // The list point closest to `start` (C# `vecGetClosestPoint`)
  readonly closestPoint: (points: readonly Vec3[], start: Vec3) => Vec3

  // Distance to the closest list point (C# `fGetDistanceToClosestPoint`)
  readonly distanceToClosestPoint: (points: readonly Vec3[], start: Vec3) => number

  // Greedy clustering
  readonly clusteredPoints: (points: readonly Vec3[], clusteringRange: number) => Vec3[]

// ShapeKernel `Uf` (the "useful formulas" grab-bag)
uf: {
  /** BSpline-eased transition between two values at position s in 0..1 (C# `fTransFixed`). */
  readonly transFixed: (value1: number, value2: number, s: number) => number;
  /** Component-wise transFixed between two points (C# `vecTransFixed`). */
  readonly vecTransFixed: (pt1: Vec3, pt2: Vec3, s: number) => Vec3;
  /** tanh-smoothed transition between two values (C# `fTransSmooth`). */
  readonly transSmooth: (value1: number, value2: number, s: number, transitionS: number, smooth: number) => number;
  /** tanh-smoothed transition between two points (C# `vecTransSmooth`). */
  readonly vecTransSmooth: (pt1: Vec3, pt2: Vec3, s: number, transitionS: number, smooth: number) => Vec3;
  /** Box-Muller gaussian sample (C# `fGetRandomGaussian`). */
  readonly randomGaussian: (mean: number, stdDev: number, random?: RandomSource) => number;
  /** Uniform sample in [min, max) (C# `fGetRandomLinear`). */
  readonly randomLinear: (min: number, max: number, random?: RandomSource) => number;
  /** Fair coin (C# `bGetRandomBool`). */
  readonly randomBool: (random?: RandomSource) => boolean;
  /** Fibonacci-distributed points in a 2D disc (C# `aGetFibonacciCirlePoints`). */
  readonly fibonacciCirclePoints: (outerRadius: number, samples: number) => Vec3[];
  /** Fibonacci-distributed points on a 3D sphere surface (C# `aGetFibonacciSpherePoints`). */
  readonly fibonacciSpherePoints: (outerRadius: number, samples: number) => Vec3[];
  /** Superformula radius at a polar angle, reference radius 1 (C# `fGetSuperShapeRadius` custom form). */
  readonly superShapeRadius: (phi: number, m: number, n1: number, n2: number, n3: number) => number;
  /** Superformula radius from a preset (C# preset overload). */
  readonly superShapeRadiusPreset: (phi: number, preset: SuperShapePreset) => number;
  /** Regular-polygon radius at a polar angle, inscribed in the unit circle (C# `fGetPolygonRadius`). */
  readonly polygonRadius: (phi: number, m: number) => number;
  /** Regular-polygon radius from a preset (C# preset overload). */
  readonly polygonRadiusPreset: (phi: number, preset: PolygonPreset) => number;
}

  // BSpline-eased transition between two values at position s in 0..1 (C# `fTransFixed`)
  readonly transFixed: (value1: number, value2: number, s: number) => number

  // Component-wise transFixed between two points (C# `vecTransFixed`)
  readonly vecTransFixed: (pt1: Vec3, pt2: Vec3, s: number) => Vec3

  // tanh-smoothed transition between two values (C# `fTransSmooth`)
  readonly transSmooth: (value1: number, value2: number, s: number, transitionS: number, smooth: number) => number

  // tanh-smoothed transition between two points (C# `vecTransSmooth`)
  readonly vecTransSmooth: (pt1: Vec3, pt2: Vec3, s: number, transitionS: number, smooth: number) => Vec3

  // Box-Muller gaussian sample (C# `fGetRandomGaussian`)
  readonly randomGaussian: (mean: number, stdDev: number, random?: RandomSource) => number

  // Uniform sample in [min, max) (C# `fGetRandomLinear`)
  readonly randomLinear: (min: number, max: number, random?: RandomSource) => number

  // Fair coin (C# `bGetRandomBool`)
  readonly randomBool: (random?: RandomSource) => boolean

  // Fibonacci-distributed points in a 2D disc (C# `aGetFibonacciCirlePoints`)
  readonly fibonacciCirclePoints: (outerRadius: number, samples: number) => Vec3[]

  // Fibonacci-distributed points on a 3D sphere surface (C# `aGetFibonacciSpherePoints`)
  readonly fibonacciSpherePoints: (outerRadius: number, samples: number) => Vec3[]

  // Superformula radius at a polar angle, reference radius 1 (C# `fGetSuperShapeRadius` custom form)
  readonly superShapeRadius: (phi: number, m: number, n1: number, n2: number, n3: number) => number

  // Superformula radius from a preset (C# preset overload)
  readonly superShapeRadiusPreset: (phi: number, preset: SuperShapePreset) => number

  // Regular-polygon radius at a polar angle, inscribed in the unit circle (C# `fGetPolygonRadius`)
  readonly polygonRadius: (phi: number, m: number) => number

  // Regular-polygon radius from a preset (C# preset overload)
  readonly polygonRadiusPreset: (phi: number, preset: PolygonPreset) => number

// ShapeKernel `VecOperations` (Hungarian prefixes dropped)
vecOps: {
  /** Cartesian point from cylindrical coordinates (C# `vecGetCylPoint`). */
  readonly cylPoint: (radius: number, phi: number, z: number) => Vec3;
  /** Cartesian point from spherical coordinates, theta measured from the XY plane (C# `vecGetSphPoint`). */
  readonly sphPoint: (radius: number, phi: number, theta: number) => Vec3;
  /** Planar (XY) radius about the absolute Z axis (C# `fGetRadius` / the `R` extension). */
  readonly radius: (pt: Vec3) => number;
  /** Planar polar angle about the absolute Z axis, radians (C# `fGetPhi`). */
  readonly phi: (pt: Vec3) => number;
  /** Elevation angle from the XY plane, radians (C# `fGetTheta`). */
  readonly theta: (pt: Vec3) => number;
  /** Same phi and z, new radius (C# `vecSetRadius`). */
  readonly setRadius: (pt: Vec3, newRadius: number) => Vec3;
  /** Same radius and z, new phi (C# `vecSetPhi`). */
  readonly setPhi: (pt: Vec3, newPhi: number) => Vec3;
  /** Same radius and phi, new z (C# `vecSetZ`). */
  readonly setZ: (pt: Vec3, newZ: number) => Vec3;
  /** Radially shifted by deltaRadius (C# `vecUpdateRadius`). */
  readonly updateRadius: (pt: Vec3, deltaRadius: number) => Vec3;
  /** Turned about the absolute Z axis by deltaPhi (C# `vecUpdatePhi`). */
  readonly updatePhi: (pt: Vec3, deltaPhi: number) => Vec3;
  /** Vertically shifted by deltaZ (C# `vecUpdateZ`). */
  readonly updateZ: (pt: Vec3, deltaZ: number) => Vec3;
  /** Normalized planar radial direction from the Z axis to the point (C# `vecGetPlanarDir`). */
  readonly planarDir: (pt: Vec3) => Vec3;
  /** The vector or its negation, whichever aligns better with the target (C# `vecFlipForAlignment`). */
  readonly flipForAlignment: (dir: Vec3, targetDir: Vec3) => Vec3;
  /** True when the direction points the same way as the target (C# `bCheckAlignment`). */
  readonly checkAlignment: (dir: Vec3, targetDir: Vec3) => boolean;
  /** Rotate a point about the absolute Z axis through an optional origin (C# `vecRotateAroundZ`). */
  readonly rotateAroundZ: (pt: Vec3, deltaPhi: number, axisOrigin?: Vec3) => Vec3;
  /** An arbitrary direction orthogonal to the given one (C# `vecGetOrthogonalDir`). */
  readonly orthogonalDir: (dir: Vec3) => Vec3;
  /**
   * Minimum angle between two vectors, radians (C# `fGetAngleBetween`).
   * The C# NaN-repair branch is unreachable after the clamp and not reproduced.
   */
  readonly angleBetween: (a: Vec3, b: Vec3) => number;
  /** Minimum SIGNED angle between two vectors about a reference normal (C# `fGetSignedAngleBetween`). */
  readonly signedAngleBetween: (a: Vec3, b: Vec3, refNormal: Vec3) => number;
  /** Rotate a point about an arbitrary axis through an optional origin (C# `vecRotateAroundAxis`). */
  readonly rotateAroundAxis: (pt: Vec3, deltaPhi: number, axis: Vec3, axisOrigin?: Vec3) => Vec3;
  /** Radial direction from a frame's Z axis to the point, in world space (C# `vecGetDirectionToAxis`). */
  readonly directionToAxis: (frame: Frame, pt: Vec3) => Vec3;
  /** Radius from a frame's Z axis to the point (C# `fGetRadiusToAxis`). */
  readonly radiusToAxis: (frame: Frame, pt: Vec3) => number;
  /** Polar angle about a frame's Z axis to the point (C# `fGetPhiToAxis`). */
  readonly phiToAxis: (frame: Frame, pt: Vec3) => number;
  /** Cylindrically interpolated point between two points (C# `vecCylindricalInterpolation`). */
  readonly cylindricalInterpolation: (pt1: Vec3, pt2: Vec3, ratio: number, axisOrigin?: Vec3) => Vec3;
  /** Spherically interpolated point between two points (C# `vecSphericalInterpolation`). */
  readonly sphericalInterpolation: (pt1: Vec3, pt2: Vec3, ratio: number, axisOrigin?: Vec3) => Vec3;
}

  // Cartesian point from cylindrical coordinates (C# `vecGetCylPoint`)
  readonly cylPoint: (radius: number, phi: number, z: number) => Vec3

  // Cartesian point from spherical coordinates, theta measured from the XY plane (C# `vecGetSphPoint`)
  readonly sphPoint: (radius: number, phi: number, theta: number) => Vec3

  // Planar (XY) radius about the absolute Z axis (C# `fGetRadius` / the `R` extension)
  readonly radius: (pt: Vec3) => number

  // Planar polar angle about the absolute Z axis, radians (C# `fGetPhi`)
  readonly phi: (pt: Vec3) => number

  // Elevation angle from the XY plane, radians (C# `fGetTheta`)
  readonly theta: (pt: Vec3) => number

  // Same phi and z, new radius (C# `vecSetRadius`)
  readonly setRadius: (pt: Vec3, newRadius: number) => Vec3

  // Same radius and z, new phi (C# `vecSetPhi`)
  readonly setPhi: (pt: Vec3, newPhi: number) => Vec3

  // Same radius and phi, new z (C# `vecSetZ`)
  readonly setZ: (pt: Vec3, newZ: number) => Vec3

  // Radially shifted by deltaRadius (C# `vecUpdateRadius`)
  readonly updateRadius: (pt: Vec3, deltaRadius: number) => Vec3

  // Turned about the absolute Z axis by deltaPhi (C# `vecUpdatePhi`)
  readonly updatePhi: (pt: Vec3, deltaPhi: number) => Vec3

  // Vertically shifted by deltaZ (C# `vecUpdateZ`)
  readonly updateZ: (pt: Vec3, deltaZ: number) => Vec3

  // Normalized planar radial direction from the Z axis to the point (C# `vecGetPlanarDir`)
  readonly planarDir: (pt: Vec3) => Vec3

  // The vector or its negation, whichever aligns better with the target (C# `vecFlipForAlignment`)
  readonly flipForAlignment: (dir: Vec3, targetDir: Vec3) => Vec3

  // True when the direction points the same way as the target (C# `bCheckAlignment`)
  readonly checkAlignment: (dir: Vec3, targetDir: Vec3) => boolean

  // Rotate a point about the absolute Z axis through an optional origin (C# `vecRotateAroundZ`)
  readonly rotateAroundZ: (pt: Vec3, deltaPhi: number, axisOrigin?: Vec3) => Vec3

  // An arbitrary direction orthogonal to the given one (C# `vecGetOrthogonalDir`)
  readonly orthogonalDir: (dir: Vec3) => Vec3

  // Minimum angle between two vectors, radians (C# `fGetAngleBetween`)
  readonly angleBetween: (a: Vec3, b: Vec3) => number

  // Minimum SIGNED angle between two vectors about a reference normal (C# `fGetSignedAngleBetween`)
  readonly signedAngleBetween: (a: Vec3, b: Vec3, refNormal: Vec3) => number

  // Rotate a point about an arbitrary axis through an optional origin (C# `vecRotateAroundAxis`)
  readonly rotateAroundAxis: (pt: Vec3, deltaPhi: number, axis: Vec3, axisOrigin?: Vec3) => Vec3

  // Radial direction from a frame's Z axis to the point, in world space (C# `vecGetDirectionToAxis`)
  readonly directionToAxis: (frame: Frame, pt: Vec3) => Vec3

  // Radius from a frame's Z axis to the point (C# `fGetRadiusToAxis`)
  readonly radiusToAxis: (frame: Frame, pt: Vec3) => number

  // Polar angle about a frame's Z axis to the point (C# `fGetPhiToAxis`)
  readonly phiToAxis: (frame: Frame, pt: Vec3) => number

  // Cylindrically interpolated point between two points (C# `vecCylindricalInterpolation`)
  readonly cylindricalInterpolation: (pt1: Vec3, pt2: Vec3, ratio: number, axisOrigin?: Vec3) => Vec3

  // Spherically interpolated point between two points (C# `vecSphericalInterpolation`)
  readonly sphericalInterpolation: (pt1: Vec3, pt2: Vec3, ratio: number, axisOrigin?: Vec3) => Vec3
