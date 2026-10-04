# PicoGK — CAD authoring — PicoGK.Numerics

9 top-level symbols. Signatures are verbatim csharp.

// Category: CAD authoring
// Extensions that allow for fuzzy comparisons of types
// PicoGK.Numerics.ComparisonExtensions (class)
public static class ComparisonExtensions

  // Fuzzy comparison function to determine equality between two floats Can be used like this
  // PicoGK.Numerics.ComparisonExtensions.bAlmostEqual (method)
  public static bool bAlmostEqual(this float a, float b, float fAbsTol = Tolerances.fDef, float fRelTol = Tolerances.fDef)
  public static bool bAlmostEqual(this Vector3 a, Vector3 b, float fDistSquared = Tolerances.fDefSquared)
  public static bool bAlmostEqual(this Vector2 a, Vector2 b, float fDistSquared = Tolerances.fDefSquared)

  // PicoGK.Numerics.ComparisonExtensions.bAlmostLessOrEqual (method)
  public static bool bAlmostLessOrEqual(this float a, float b, float fTol = Tolerances.fDef)

  // PicoGK.Numerics.ComparisonExtensions.bAlmostMoreOrEqual (method)
  public static bool bAlmostMoreOrEqual(this float a, float b, float fTol = Tolerances.fDef)

  // Fuzzy test for zero
  // PicoGK.Numerics.ComparisonExtensions.bAlmostZero (method)
  public static bool bAlmostZero(this float f, float fZero = Tolerances.fZero)
  public static bool bAlmostZero(this Vector3 vec, float fZeroSquared = Tolerances.fZeroSquared)
  public static bool bAlmostZero(this Vector2 vec, float fZeroSquared = Tolerances.fZeroSquared)

// Category: CAD authoring
// A coordinate in a cylindrical coordinate system
// PicoGK.Numerics.Cylindrical (struct)
public struct Cylindrical

  // Distance from the cylinder's axis
  // PicoGK.Numerics.Cylindrical.R (field)
  public float R = 0;

  // Azimuth angle in the XY plane
  // PicoGK.Numerics.Cylindrical.Phi (field)
  public Rad Phi = Rad.Zero;

  // Position along the Z axis
  // PicoGK.Numerics.Cylindrical.Z (field)
  public float Z = 0;

  // Initialize a new cylindrical coordinate
  // PicoGK.Numerics.Cylindrical.Cylindrical (constructor)
  public Cylindrical(float fR, Rad rPhi, float fZ)
  public Cylindrical(Polar oPolar, float fZ)
  public Cylindrical(Vector3 vecCartesian)
  public Cylindrical(Spherical oSpherical)
  public Cylindrical()

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

// Category: CAD authoring
// PicoGK.Numerics.FloatExt (class)
public static class FloatExt

  // Checks whether the value is finite, i.e
  // PicoGK.Numerics.FloatExt.bIsFinite (method)
  public static bool bIsFinite(this float f)

// Category: CAD authoring
// PicoGK.Numerics.Overhang (struct)
public readonly struct Overhang : IComparable<Overhang>, IEquatable<Overhang>

  // No overhang (0%)
  // PicoGK.Numerics.Overhang.uNone (property)
  public static Overhang uNone { get; }

  // Maximum overhang (100%)
  // PicoGK.Numerics.Overhang.uFull (property)
  public static Overhang uFull { get; }

  // Normalized overhang severity from 0..1 - 0.0
  // PicoGK.Numerics.Overhang.fNormalized (property)
  public float fNormalized { get; }

  // Normalized overhang severity from 0..100% - 0
  // PicoGK.Numerics.Overhang.fPercent (property)
  public float fPercent { get; }

  // Overhang angle in radians - 0
  // PicoGK.Numerics.Overhang.fRad (property)
  public float fRad { get; }

  // Overhang angle in degrees - 0
  // PicoGK.Numerics.Overhang.fDeg (property)
  public float fDeg { get; }

  // Overhang angle in degrees, measured from the horizontal plane Used by some 3D printing manufacturers
  // PicoGK.Numerics.Overhang.fDegFromHorizontal (property)
  public float fDegFromHorizontal { get; }

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
  public static bool operator>(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_LessThanOrEqual (method)
  public static bool operator <=(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_GreaterThanOrEqual (method)
  public static bool operator >=(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_Equality (method)
  public static bool operator ==(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.op_Inequality (method)
  public static bool operator !=(Overhang left, Overhang right)

  // PicoGK.Numerics.Overhang.Overhang (constructor)
  public Overhang()

// Category: CAD authoring
// A polar coordinate
// PicoGK.Numerics.Polar (struct)
public struct Polar

  // Distance from the center of the coordinate system
  // PicoGK.Numerics.Polar.R (field)
  public float R = 0;

  // Azimuth angle in the XY plane
  // PicoGK.Numerics.Polar.Phi (field)
  public Rad Phi = Rad.Zero;

  // Initialize a new polar coordinate
  // PicoGK.Numerics.Polar.Polar (constructor)
  public Polar(float fR, Rad rPhi)
  public Polar(Vector2 vecCartesian)
  public Polar()

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

// Category: CAD authoring
// This type encapsulates an angle in Radians, with helper functions to convert from Degrees
// PicoGK.Numerics.Rad (struct)
public readonly struct Rad : IComparable<Rad>, IEquatable<Rad>

  // Defines 2*Pi, which is constantly being used in Rad angles
  // PicoGK.Numerics.Rad.TwoPi (constant)
  public const float TwoPi = float.Tau;

  // Zero degrees angles
  // PicoGK.Numerics.Rad.Zero (field)
  public static readonly Rad Zero = new(0f);

  // 360º angle
  // PicoGK.Numerics.Rad.Full (field)
  public static readonly Rad Full = new(TwoPi);

  // 180º angle
  // PicoGK.Numerics.Rad.Half (field)
  public static readonly Rad Half = new(TwoPi / 2f);

  // 90º angle
  // PicoGK.Numerics.Rad.Quarter (field)
  public static readonly Rad Quarter = new(TwoPi / 4f);

  // 0º angle
  // PicoGK.Numerics.Rad.Deg0 (field)
  public static readonly Rad Deg0 = Zero;

  // 360º angle
  // PicoGK.Numerics.Rad.Deg360 (field)
  public static readonly Rad Deg360 = Full;

  // 180º angle
  // PicoGK.Numerics.Rad.Deg180 (field)
  public static readonly Rad Deg180 = Half;

  // 90º angle
  // PicoGK.Numerics.Rad.Deg90 (field)
  public static readonly Rad Deg90 = Quarter;

  // 45º angle
  // PicoGK.Numerics.Rad.Deg45 (field)
  public static readonly Rad Deg45 = rFromDeg(45);

  // float value of the angle in radians
  // PicoGK.Numerics.Rad.fRad (property)
  public float fRad { get; }

  // angle in degrees
  // PicoGK.Numerics.Rad.fDeg (property)
  public float fDeg { get; }

  // Initialize a new Rad value from a float radians angle
  // PicoGK.Numerics.Rad.Rad (constructor)
  public Rad(float fRad)
  public Rad()

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
  public static implicit operator float (Rad r)

  // Explicit conversion from float to Rad value
  // PicoGK.Numerics.Rad.op_Explicit (method)
  public static explicit operator Rad(float fRad)

  // Test for fuzzy equality
  // PicoGK.Numerics.Rad.bAlmostEqual (method)
  public bool bAlmostEqual(Rad other, float fToleranceRad = Tolerances.fDef)

  // Tests for fuzzy equality of the normalized angle (0º == 360º == 720º)
  // PicoGK.Numerics.Rad.bAlmostEqualPeriodic (method)
  public bool bAlmostEqualPeriodic(Rad other, float fToleranceRad = Tolerances.fDef)

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
  public static bool operator>(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_LessThanOrEqual (method)
  public static bool operator <=(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_GreaterThanOrEqual (method)
  public static bool operator >=(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_Equality (method)
  public static bool operator ==(Rad left, Rad right)

  // PicoGK.Numerics.Rad.op_Inequality (method)
  public static bool operator !=(Rad left, Rad right)

// Category: CAD authoring
// PicoGK.Numerics.Spherical (struct)
public struct Spherical

  // Distance from the sphere center
  // PicoGK.Numerics.Spherical.R (field)
  public float R = 0;

  // Azimuth angle in the XY plane, measured from +X toward +Y
  // PicoGK.Numerics.Spherical.Phi (field)
  public Rad Phi = Rad.Zero;

  // Polar angle measured from +Z toward the XY plane and onward to -Z
  // PicoGK.Numerics.Spherical.Theta (field)
  public Rad Theta = Rad.Zero;

  // Initializes a new Spherical coordinate
  // PicoGK.Numerics.Spherical.Spherical (constructor)
  public Spherical(float fR, Rad rPhi, Rad rTheta)
  public Spherical(Vector3 vecCartesian)
  public Spherical(Cylindrical oCylindrical)
  public Spherical()

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

// Category: CAD authoring
// Default tolerances for comparisons
// PicoGK.Numerics.Tolerances (class)
public static class Tolerances

  // Default tolerance for fuzzy comparisons
  // PicoGK.Numerics.Tolerances.fDef (constant)
  public const float fDef = 1e-6f;

  // Default squared tolerance for fuzzy comparisons
  // PicoGK.Numerics.Tolerances.fDefSquared (constant)
  public const float fDefSquared = fDef * fDef;

  // Default number regarded as zero for fuzzy zero check Chosen to be relatively universal for float precision
  // PicoGK.Numerics.Tolerances.fZero (constant)
  public const float fZero = 1e-8f;

  // Default squared number regarded as zero for fuzzy zero check
  // PicoGK.Numerics.Tolerances.fZeroSquared (constant)
  public const float fZeroSquared = fZero * fZero;

// Category: CAD authoring
// Extensions to the Vector2 and Vector3 System.Numerics types
// PicoGK.Numerics.VectorExt (class)
public static class VectorExt

  // Returns the normalized version of this vector (length 1) Can be used like this vec = vec.vecNormalized()
  // Throws: System.ArgumentException: Thrown when the vector length is zero or almost zero.
  // PicoGK.Numerics.VectorExt.vecNormalized (method)
  public static Vector3 vecNormalized(this Vector3 vec)
  public static Vector2 vecNormalized(this Vector2 vec)

  // Returns the normalized version of this vector (length 1) Returns (0,0,0) if supplied vector length is 0
  // PicoGK.Numerics.VectorExt.vecSafeNormalized (method)
  public static Vector3 vecSafeNormalized(this Vector3 vec)
  public static Vector2 vecSafeNormalized(this Vector2 vec)

  // Converts a Vector3 into a Vector2 by stripping the Z coordinate Can be used like this Vector2 vec2 = vec3.vecStripZ()
  // PicoGK.Numerics.VectorExt.vecStripZ (method)
  public static Vector2 vecStripZ(this Vector3 vec)

  // Converts a Vector2 into a Vector3 by adding a Z coordinate (defaults to 0) Can be used like this
  // PicoGK.Numerics.VectorExt.vecAsVector3 (method)
  public static Vector3 vecAsVector3(this Vector2 vec, float fZ = 0.0f)

  // Helper function to convert a point to world coordinates using a supplied frame
  // PicoGK.Numerics.VectorExt.vecPtWorld (method)
  public static Vector3 vecPtWorld(this Vector3 vec, Frame3d frm)
  public static Vector3 vecPtWorld(this Vector2 vec, Frame3d frm)

  // Helper function to convert a direction to world coordinates using a supplied frame
  // PicoGK.Numerics.VectorExt.vecDirWorld (method)
  public static Vector3 vecDirWorld(this Vector3 vec, Frame3d frm)
  public static Vector3 vecDirWorld(this Vector2 vec, Frame3d frm)

  // Helper function to convert a point to local coordinates using a supplied frame
  // PicoGK.Numerics.VectorExt.vecPtLocal (method)
  public static Vector3 vecPtLocal(this Vector3 vec, Frame3d frm)

  // Helper function to convert a direction to local coordinates using a supplied frame
  // PicoGK.Numerics.VectorExt.vecDirLocal (method)
  public static Vector3 vecDirLocal(this Vector3 vec, Frame3d frm)

  // Returns a matrix-transformed version of the vector
  // PicoGK.Numerics.VectorExt.vecTransformed (method)
  public static Vector3 vecTransformed(this Vector3 vec, Matrix4x4 mat)

  // Returns a mirrored version of the vector
  // PicoGK.Numerics.VectorExt.vecMirrored (method)
  public static Vector3 vecMirrored(this Vector3 vecPt, Vector3 vecPlanePoint, Vector3 vecPlaneNormal)
  //   vecPt: The point to be mirrored (this)
  //   vecPlanePoint: A point through which the mirror plane passes
  //   vecPlaneNormal: The normal vector of the mirror plane, expected to be a unit vector

  // Checks whether all vector coordinate values are finite, i.e
  // PicoGK.Numerics.VectorExt.bIsFinite (method)
  public static bool bIsFinite(this Vector2 vec)
  public static bool bIsFinite(this Vector3 vec)
