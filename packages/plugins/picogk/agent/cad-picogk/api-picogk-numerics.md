# PicoGK — PicoGK.Numerics

9 top-level symbols. Signatures are verbatim csharp.

// Extensions that allow for fuzzy comparisons of types
ComparisonExtensions

  // Fuzzy comparison function to determine equality between two floats Can be used like this
  // PicoGK.Numerics.ComparisonExtensions.bAlmostEqual (method)
  public static bool bAlmostEqual(float a, float b, float fAbsTol = 1E-06, float fRelTol = 1E-06)
  public static bool bAlmostEqual(Vector3 a, Vector3 b, float fDistSquared = 1E-12)
  public static bool bAlmostEqual(Vector2 a, Vector2 b, float fDistSquared = 1E-12)

  // PicoGK.Numerics.ComparisonExtensions.bAlmostLessOrEqual (method)
  public static bool bAlmostLessOrEqual(float a, float b, float fTol = 1E-06)

  // PicoGK.Numerics.ComparisonExtensions.bAlmostMoreOrEqual (method)
  public static bool bAlmostMoreOrEqual(float a, float b, float fTol = 1E-06)

  // Fuzzy test for zero
  // PicoGK.Numerics.ComparisonExtensions.bAlmostZero (method)
  public static bool bAlmostZero(float f, float fZero = 1E-08)
  public static bool bAlmostZero(Vector3 vec, float fZeroSquared = 1E-16)
  public static bool bAlmostZero(Vector2 vec, float fZeroSquared = 1E-16)

// A coordinate in a cylindrical coordinate system
Cylindrical

  // Distance from the cylinder's axis
  R: float

  // Azimuth angle in the XY plane
  Phi: Rad

  // Position along the Z axis
  Z: float

  // Initialize a new cylindrical coordinate
  // PicoGK.Numerics.Cylindrical.Cylindrical (constructor)
  public Cylindrical(float fR, Rad rPhi, float fZ)
  public Cylindrical(Polar oPolar, float fZ)
  public Cylindrical(Vector3 vecCartesian)
  public Cylindrical(Spherical oSpherical)

  // Convert a cylindrical coordinate into a cartesian coordinate
  // PicoGK.Numerics.Cylindrical.vecAsCartesian (method)
  public readonly Vector3 vecAsCartesian()

  // Linear interpolation between two Cylindrical coordinates (in Cylindrical coordinate space)
  // PicoGK.Numerics.Cylindrical.oLerp (method)
  public static Cylindrical oLerp(Cylindrical oA, Cylindrical oB, float fT)
  public readonly Cylindrical oLerp(Cylindrical oOther, float fT)

  // Convert the cylindrical coordinate to a string
  // PicoGK.Numerics.Cylindrical.ToString (method)
  public override string ToString()

FloatExt

  // Checks whether the value is finite, i.e
  // PicoGK.Numerics.FloatExt.bIsFinite (method)
  public static bool bIsFinite(float f)

Overhang

  // No overhang (0%)
  uNone: Overhang

  // Maximum overhang (100%)
  uFull: Overhang

  // Normalized overhang severity from 0..1 - 0.0
  fNormalized: float

  // Normalized overhang severity from 0..100% - 0
  fPercent: float

  // Overhang angle in radians - 0
  fRad: float

  // Overhang angle in degrees - 0
  fDeg: float

  // Overhang angle in degrees, measured from the horizontal plane Used by some 3D printing manufacturers
  fDegFromHorizontal: float

  // Create a new Overhang, using normalized overhang severity from 0..1 - 0.0
  // PicoGK.Numerics.Overhang.uFromNormalized (method)
  public static Overhang uFromNormalized(float f)

  // Create a new Overhang, based on percent value (0..100) - 0
  // PicoGK.Numerics.Overhang.uFromPercent (method)
  public static Overhang uFromPercent(float f)

  // Create a new Overhang, based on radians value (0..Pi/2) - 0
  // PicoGK.Numerics.Overhang.uFromRad (method)
  public static Overhang uFromRad(float f)

  // Create a new Overhang, based on degrees value (0..90) - 0
  // PicoGK.Numerics.Overhang.uFromDeg (method)
  public static Overhang uFromDeg(float f)

  // Create a new Overhang from an angle in degrees, measured from horizontal plane
  // PicoGK.Numerics.Overhang.uFromDegFromHorizontal (method)
  public static Overhang uFromDegFromHorizontal(float f)

  // Allows you to write something like uOverhang.bExceeds(Overhang.uFromPercent(50)) You can also use comparison operators
  // PicoGK.Numerics.Overhang.bExceeds (method)
  public bool bExceeds(Overhang threshold)

  // PicoGK.Numerics.Overhang.ToString (method)
  public override string ToString()

  // PicoGK.Numerics.Overhang.CompareTo (method)
  public int CompareTo(Overhang other)

  // PicoGK.Numerics.Overhang.Equals (method)
  public bool Equals(Overhang other)
  public override bool Equals(object? obj)

  // PicoGK.Numerics.Overhang.GetHashCode (method)
  public override int GetHashCode()

  // PicoGK.Numerics.Overhang.op_LessThan (method)
  public static bool operator <(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_GreaterThan (method)
  public static bool operator >(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_LessThanOrEqual (method)
  public static bool operator <=(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_GreaterThanOrEqual (method)
  public static bool operator >=(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_Equality (method)
  public static bool operator ==(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_Inequality (method)
  public static bool operator !=(Overhang left, Overhang right)

// A polar coordinate
Polar

  // Distance from the center of the coordinate system
  R: float

  // Azimuth angle in the XY plane
  Phi: Rad

  // Initialize a new polar coordinate
  // PicoGK.Numerics.Polar.Polar (constructor)
  public Polar(float fR, Rad rPhi)
  public Polar(Vector2 vecCartesian)

  // Return the polar coordinate as a cartesian coordinate
  // PicoGK.Numerics.Polar.vecAsCartesian (method)
  public readonly Vector2 vecAsCartesian()

  // Linear interpolation between two polar coordinates (in Polar coordinate space)
  // PicoGK.Numerics.Polar.oLerp (method)
  public static Polar oLerp(Polar oA, Polar oB, float fT)
  public readonly Polar oLerp(Polar oOther, float fT)

  // Convert the polar coordinate to a string
  // PicoGK.Numerics.Polar.ToString (method)
  public override string ToString()

// This type encapsulates an angle in Radians, with helper functions to convert from Degrees
Rad

  // Defines 2*Pi, which is constantly being used in Rad angles
  TwoPi: float

  // Zero degrees angles
  Zero: Rad

  // 360º angle
  Full: Rad

  // 180º angle
  Half: Rad

  // 90º angle
  Quarter: Rad

  // 0º angle
  Deg0: Rad

  // 360º angle
  Deg360: Rad

  // 180º angle
  Deg180: Rad

  // 90º angle
  Deg90: Rad

  // 45º angle
  Deg45: Rad

  // float value of the angle in radians
  fRad: float

  // angle in degrees
  fDeg: float

  // Initialize a new Rad value from a float radians angle
  // PicoGK.Numerics.Rad.Rad (constructor)
  public Rad(float fRad)

  // Create new Rad value from a float radians angle
  // PicoGK.Numerics.Rad.rFromRad (method)
  public static Rad rFromRad(float fRad)

  // Create a new Rad value from a floating point angle in degrees
  // PicoGK.Numerics.Rad.rFromDeg (method)
  public static Rad rFromDeg(float fDegrees)

  // Create a new Rad value from a normalized value 0..1, mapped to 0..360º
  // PicoGK.Numerics.Rad.rFromNormalized (method)
  public static Rad rFromNormalized(float fNormalized)

  // Return the angle normalized to the range -π .
  // PicoGK.Numerics.Rad.rNormalizedSigned (method)
  public Rad rNormalizedSigned()

  // Return the angle normalized to the range [0, 2π)
  // PicoGK.Numerics.Rad.rNormalizedPositive (method)
  public Rad rNormalizedPositive()

  // Implicit conversion from a Rad value into float for seamless passing in to functions that require floats float f=float.Cos(rAngle)
  // PicoGK.Numerics.Rad.op_Implicit (method)
  public static implicit operator float(Rad r)

  // Explicit conversion from float to Rad value
  // PicoGK.Numerics.Rad.op_Explicit (method)
  public static explicit operator Rad(float fRad)

  // Test for fuzzy equality
  // PicoGK.Numerics.Rad.bAlmostEqual (method)
  public bool bAlmostEqual(Rad other, float fToleranceRad = 1E-06)

  // Tests for fuzzy equality of the normalized angle (0º == 360º == 720º)
  // PicoGK.Numerics.Rad.bAlmostEqualPeriodic (method)
  public bool bAlmostEqualPeriodic(Rad other, float fToleranceRad = 1E-06)

  // Checks whether the angle value is finite, i.e
  // PicoGK.Numerics.Rad.bIsFinite (method)
  public bool bIsFinite()

  // Returns the sine of the angle
  // PicoGK.Numerics.Rad.fSin (method)
  public float fSin()

  // Returns the cosine of the angle
  // PicoGK.Numerics.Rad.fCos (method)
  public float fCos()

  // Returns the tangent of the angle
  // PicoGK.Numerics.Rad.fTan (method)
  public float fTan()

  // Computes the angle of the vector from the positive X axis, using the signs of X and Y to determine the correct quadrant
  // PicoGK.Numerics.Rad.rAtan2 (method)
  public static Rad rAtan2(Vector2 vec)
  public static Rad rAtan2(float fY, float fX)

  // Computes the arc tangent of the value
  // PicoGK.Numerics.Rad.rAtan (method)
  public static Rad rAtan(float f)

  // Returns the arc cosine of the value and returns the angle
  // PicoGK.Numerics.Rad.rAcos (method)
  public static Rad rAcos(float fValue)

  // Returns the arc cosine of the value after clamping it to [-1, +1]
  // PicoGK.Numerics.Rad.rAcosClamped (method)
  public static Rad rAcosClamped(float fValue)

  // Returns the arc sine of the value and returns the angle
  // PicoGK.Numerics.Rad.rAsin (method)
  public static Rad rAsin(float fValue)

  // Returns the arc cosine of the value after clamping it to [-1, +1]
  // PicoGK.Numerics.Rad.rAsinClamped (method)
  public static Rad rAsinClamped(float fValue)

  // PicoGK.Numerics.Rad.op_Addition (method)
  public static Rad operator +(Rad a, Rad b)

  // PicoGK.Numerics.Rad.op_Subtraction (method)
  public static Rad operator -(Rad a, Rad b)

  // PicoGK.Numerics.Rad.op_Multiply (method)
  public static Rad operator *(Rad r, float fScale)
  public static Rad operator *(float fScale, Rad r)

  // PicoGK.Numerics.Rad.op_Division (method)
  public static Rad operator /(Rad r, float fScale)
  public static float operator /(Rad a, Rad b)

  // PicoGK.Numerics.Rad.op_UnaryPlus (method)
  public static Rad operator +(Rad r)

  // PicoGK.Numerics.Rad.op_UnaryNegation (method)
  public static Rad operator -(Rad r)

  // PicoGK.Numerics.Rad.ToString (method)
  public override string ToString()

  // PicoGK.Numerics.Rad.CompareTo (method)
  public int CompareTo(Rad other)

  // PicoGK.Numerics.Rad.Equals (method)
  public bool Equals(Rad other)
  public override bool Equals(object? obj)

  // PicoGK.Numerics.Rad.GetHashCode (method)
  public override int GetHashCode()

  // PicoGK.Numerics.Rad.op_LessThan (method)
  public static bool operator <(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_GreaterThan (method)
  public static bool operator >(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_LessThanOrEqual (method)
  public static bool operator <=(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_GreaterThanOrEqual (method)
  public static bool operator >=(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_Equality (method)
  public static bool operator ==(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_Inequality (method)
  public static bool operator !=(Rad left, Rad right)

Spherical

  // Distance from the sphere center
  R: float

  // Azimuth angle in the XY plane, measured from +X toward +Y
  Phi: Rad

  // Polar angle measured from +Z toward the XY plane and onward to -Z
  Theta: Rad

  // Initializes a new Spherical coordinate
  // PicoGK.Numerics.Spherical.Spherical (constructor)
  public Spherical(float fR, Rad rPhi, Rad rTheta)
  public Spherical(Vector3 vecCartesian)
  public Spherical(Cylindrical oCylindrical)

  // Convert the spherical coordinate to a cartesian coordinate
  // PicoGK.Numerics.Spherical.vecAsCartesian (method)
  public readonly Vector3 vecAsCartesian()

  // Linear interpolation between two Spherical coordinates (in Spherical coordinate space)
  // PicoGK.Numerics.Spherical.oLerp (method)
  public static Spherical oLerp(Spherical oA, Spherical oB, float fT)
  public readonly Spherical oLerp(Spherical oOther, float fT)

  // Convert the spherical coordinate to a string
  // PicoGK.Numerics.Spherical.ToString (method)
  public override string ToString()

// Default tolerances for comparisons
Tolerances

  // Default tolerance for fuzzy comparisons
  fDef: float

  // Default squared tolerance for fuzzy comparisons
  fDefSquared: float

  // Default number regarded as zero for fuzzy zero check Chosen to be relatively universal for float precision
  fZero: float

  // Default squared number regarded as zero for fuzzy zero check
  fZeroSquared: float

// Extensions to the Vector2 and Vector3 System.Numerics types
VectorExt

  // Returns the normalized version of this vector (length 1) Can be used like this vec = vec.vecNormalized()
  // PicoGK.Numerics.VectorExt.vecNormalized (method)
  public static Vector3 vecNormalized(Vector3 vec)
  public static Vector2 vecNormalized(Vector2 vec)

  // Returns the normalized version of this vector (length 1) Returns (0,0,0) if supplied vector length is 0
  // PicoGK.Numerics.VectorExt.vecSafeNormalized (method)
  public static Vector3 vecSafeNormalized(Vector3 vec)
  public static Vector2 vecSafeNormalized(Vector2 vec)

  // Converts a Vector3 into a Vector2 by stripping the Z coordinate Can be used like this Vector2 vec2 = vec3.vecStripZ()
  // PicoGK.Numerics.VectorExt.vecStripZ (method)
  public static Vector2 vecStripZ(Vector3 vec)

  // Converts a Vector2 into a Vector3 by adding a Z coordinate (defaults to 0) Can be used like this
  // PicoGK.Numerics.VectorExt.vecAsVector3 (method)
  public static Vector3 vecAsVector3(Vector2 vec, float fZ = 0)

  // Helper function to convert a point to world coordinates using a supplied frame
  // PicoGK.Numerics.VectorExt.vecPtWorld (method)
  public static Vector3 vecPtWorld(Vector3 vec, Frame3d frm)
  public static Vector3 vecPtWorld(Vector2 vec, Frame3d frm)

  // Helper function to convert a direction to world coordinates using a supplied frame
  // PicoGK.Numerics.VectorExt.vecDirWorld (method)
  public static Vector3 vecDirWorld(Vector3 vec, Frame3d frm)
  public static Vector3 vecDirWorld(Vector2 vec, Frame3d frm)

  // Helper function to convert a point to local coordinates using a supplied frame
  // PicoGK.Numerics.VectorExt.vecPtLocal (method)
  public static Vector3 vecPtLocal(Vector3 vec, Frame3d frm)

  // Helper function to convert a direction to local coordinates using a supplied frame
  // PicoGK.Numerics.VectorExt.vecDirLocal (method)
  public static Vector3 vecDirLocal(Vector3 vec, Frame3d frm)

  // Returns a matrix-transformed version of the vector
  // PicoGK.Numerics.VectorExt.vecTransformed (method)
  public static Vector3 vecTransformed(Vector3 vec, Matrix4x4 mat)

  // Returns a mirrored version of the vector
  // PicoGK.Numerics.VectorExt.vecMirrored (method)
  public static Vector3 vecMirrored(Vector3 vecPt, Vector3 vecPlanePoint, Vector3 vecPlaneNormal)
  //   vecPt: The point to be mirrored (this)
  //   vecPlanePoint: A point through which the mirror plane passes
  //   vecPlaneNormal: The normal vector of the mirror plane, expected to be a unit vector

  // Checks whether all vector coordinate values are finite, i.e
  // PicoGK.Numerics.VectorExt.bIsFinite (method)
  public static bool bIsFinite(Vector2 vec)
  public static bool bIsFinite(Vector3 vec)
