# PicoGK — PicoGK.Numerics

9 top-level symbols. Signatures are verbatim csharp.

// Extensions that allow for fuzzy comparisons of types
ComparisonExtensions

  // Fuzzy comparison function to determine equality between two floats Can be used like this
  public static bool bAlmostEqual(float a, float b, float fAbsTol = 1E-06, float fRelTol = 1E-06)
  public static bool bAlmostEqual(Vector3 a, Vector3 b, float fDistSquared = 1E-12)
  public static bool bAlmostEqual(Vector2 a, Vector2 b, float fDistSquared = 1E-12)

  public static bool bAlmostLessOrEqual(float a, float b, float fTol = 1E-06)

  public static bool bAlmostMoreOrEqual(float a, float b, float fTol = 1E-06)

  // Fuzzy test for zero
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
  public Cylindrical(float fR, Rad rPhi, float fZ)
  public Cylindrical(Polar oPolar, float fZ)
  public Cylindrical(Vector3 vecCartesian)
  public Cylindrical(Spherical oSpherical)

  // Convert a cylindrical coordinate into a cartesian coordinate
  public readonly Vector3 vecAsCartesian()

  // Linear interpolation between two Cylindrical coordinates (in Cylindrical coordinate space)
  public static Cylindrical oLerp(Cylindrical oA, Cylindrical oB, float fT)
  public readonly Cylindrical oLerp(Cylindrical oOther, float fT)

  // Convert the cylindrical coordinate to a string
  public override string ToString()

FloatExt

  // Checks whether the value is finite, i.e
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
  public static Overhang uFromNormalized(float f)

  // Create a new Overhang, based on percent value (0..100) - 0
  public static Overhang uFromPercent(float f)

  // Create a new Overhang, based on radians value (0..Pi/2) - 0
  public static Overhang uFromRad(float f)

  // Create a new Overhang, based on degrees value (0..90) - 0
  public static Overhang uFromDeg(float f)

  // Create a new Overhang from an angle in degrees, measured from horizontal plane
  public static Overhang uFromDegFromHorizontal(float f)

  // Allows you to write something like uOverhang.bExceeds(Overhang.uFromPercent(50)) You can also use comparison operators
  public bool bExceeds(Overhang threshold)

  public override string ToString()

  public int CompareTo(Overhang other)

  public bool Equals(Overhang other)
  public override bool Equals(object? obj)

  public override int GetHashCode()

  public static bool operator <(Overhang left, Overhang right)

  public static bool operator >(Overhang left, Overhang right)

  public static bool operator <=(Overhang left, Overhang right)

  public static bool operator >=(Overhang left, Overhang right)

  public static bool operator ==(Overhang left, Overhang right)

  public static bool operator !=(Overhang left, Overhang right)

// A polar coordinate
Polar

  // Distance from the center of the coordinate system
  R: float

  // Azimuth angle in the XY plane
  Phi: Rad

  // Initialize a new polar coordinate
  public Polar(float fR, Rad rPhi)
  public Polar(Vector2 vecCartesian)

  // Return the polar coordinate as a cartesian coordinate
  public readonly Vector2 vecAsCartesian()

  // Linear interpolation between two polar coordinates (in Polar coordinate space)
  public static Polar oLerp(Polar oA, Polar oB, float fT)
  public readonly Polar oLerp(Polar oOther, float fT)

  // Convert the polar coordinate to a string
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
  public Rad(float fRad)

  // Create new Rad value from a float radians angle
  public static Rad rFromRad(float fRad)

  // Create a new Rad value from a floating point angle in degrees
  public static Rad rFromDeg(float fDegrees)

  // Create a new Rad value from a normalized value 0..1, mapped to 0..360º
  public static Rad rFromNormalized(float fNormalized)

  // Return the angle normalized to the range -π .
  public Rad rNormalizedSigned()

  // Return the angle normalized to the range [0, 2π)
  public Rad rNormalizedPositive()

  // Implicit conversion from a Rad value into float for seamless passing in to functions that require floats float f=float.Cos(rAngle)
  public static implicit operator float(Rad r)

  // Explicit conversion from float to Rad value
  public static explicit operator Rad(float fRad)

  // Test for fuzzy equality
  public bool bAlmostEqual(Rad other, float fToleranceRad = 1E-06)

  // Tests for fuzzy equality of the normalized angle (0º == 360º == 720º)
  public bool bAlmostEqualPeriodic(Rad other, float fToleranceRad = 1E-06)

  // Checks whether the angle value is finite, i.e
  public bool bIsFinite()

  // Returns the sine of the angle
  public float fSin()

  // Returns the cosine of the angle
  public float fCos()

  // Returns the tangent of the angle
  public float fTan()

  // Computes the angle of the vector from the positive X axis, using the signs of X and Y to determine the correct quadrant
  public static Rad rAtan2(Vector2 vec)
  public static Rad rAtan2(float fY, float fX)

  // Computes the arc tangent of the value
  public static Rad rAtan(float f)

  // Returns the arc cosine of the value and returns the angle
  public static Rad rAcos(float fValue)

  // Returns the arc cosine of the value after clamping it to [-1, +1]
  public static Rad rAcosClamped(float fValue)

  // Returns the arc sine of the value and returns the angle
  public static Rad rAsin(float fValue)

  // Returns the arc cosine of the value after clamping it to [-1, +1]
  public static Rad rAsinClamped(float fValue)

  public static Rad operator +(Rad a, Rad b)

  public static Rad operator -(Rad a, Rad b)

  public static Rad operator *(Rad r, float fScale)
  public static Rad operator *(float fScale, Rad r)

  public static Rad operator /(Rad r, float fScale)
  public static float operator /(Rad a, Rad b)

  public static Rad operator +(Rad r)

  public static Rad operator -(Rad r)

  public override string ToString()

  public int CompareTo(Rad other)

  public bool Equals(Rad other)
  public override bool Equals(object? obj)

  public override int GetHashCode()

  public static bool operator <(Rad left, Rad right)

  public static bool operator >(Rad left, Rad right)

  public static bool operator <=(Rad left, Rad right)

  public static bool operator >=(Rad left, Rad right)

  public static bool operator ==(Rad left, Rad right)

  public static bool operator !=(Rad left, Rad right)

Spherical

  // Distance from the sphere center
  R: float

  // Azimuth angle in the XY plane, measured from +X toward +Y
  Phi: Rad

  // Polar angle measured from +Z toward the XY plane and onward to -Z
  Theta: Rad

  // Initializes a new Spherical coordinate
  public Spherical(float fR, Rad rPhi, Rad rTheta)
  public Spherical(Vector3 vecCartesian)
  public Spherical(Cylindrical oCylindrical)

  // Convert the spherical coordinate to a cartesian coordinate
  public readonly Vector3 vecAsCartesian()

  // Linear interpolation between two Spherical coordinates (in Spherical coordinate space)
  public static Spherical oLerp(Spherical oA, Spherical oB, float fT)
  public readonly Spherical oLerp(Spherical oOther, float fT)

  // Convert the spherical coordinate to a string
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
  public static Vector3 vecNormalized(Vector3 vec)
  public static Vector2 vecNormalized(Vector2 vec)

  // Returns the normalized version of this vector (length 1) Returns (0,0,0) if supplied vector length is 0
  public static Vector3 vecSafeNormalized(Vector3 vec)
  public static Vector2 vecSafeNormalized(Vector2 vec)

  // Converts a Vector3 into a Vector2 by stripping the Z coordinate Can be used like this Vector2 vec2 = vec3.vecStripZ()
  public static Vector2 vecStripZ(Vector3 vec)

  // Converts a Vector2 into a Vector3 by adding a Z coordinate (defaults to 0) Can be used like this
  public static Vector3 vecAsVector3(Vector2 vec, float fZ = 0)

  // Helper function to convert a point to world coordinates using a supplied frame
  public static Vector3 vecPtWorld(Vector3 vec, Frame3d frm)
  public static Vector3 vecPtWorld(Vector2 vec, Frame3d frm)

  // Helper function to convert a direction to world coordinates using a supplied frame
  public static Vector3 vecDirWorld(Vector3 vec, Frame3d frm)
  public static Vector3 vecDirWorld(Vector2 vec, Frame3d frm)

  // Helper function to convert a point to local coordinates using a supplied frame
  public static Vector3 vecPtLocal(Vector3 vec, Frame3d frm)

  // Helper function to convert a direction to local coordinates using a supplied frame
  public static Vector3 vecDirLocal(Vector3 vec, Frame3d frm)

  // Returns a matrix-transformed version of the vector
  public static Vector3 vecTransformed(Vector3 vec, Matrix4x4 mat)

  // Returns a mirrored version of the vector
  public static Vector3 vecMirrored(Vector3 vecPt, Vector3 vecPlanePoint, Vector3 vecPlaneNormal)
  //   vecPt: The point to be mirrored (this)
  //   vecPlanePoint: A point through which the mirror plane passes
  //   vecPlaneNormal: The normal vector of the mirror plane, expected to be a unit vector

  // Checks whether all vector coordinate values are finite, i.e
  public static bool bIsFinite(Vector2 vec)
  public static bool bIsFinite(Vector3 vec)
