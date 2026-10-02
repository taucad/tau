# PicoGK — Selected BCL reference — System.Numerics (4)

1 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
// System.Numerics.Vector4 (struct)
public struct Vector4

  // System.Numerics.Vector4.X (field)
  public float X

  // System.Numerics.Vector4.Y (field)
  public float Y

  // System.Numerics.Vector4.Z (field)
  public float Z

  // System.Numerics.Vector4.W (field)
  public float W

  // System.Numerics.Vector4.AllBitsSet (property)
  public static Vector4 AllBitsSet { get; }

  // System.Numerics.Vector4.E (property)
  public static Vector4 E { get; }

  // System.Numerics.Vector4.Epsilon (property)
  public static Vector4 Epsilon { get; }

  // System.Numerics.Vector4.NaN (property)
  public static Vector4 NaN { get; }

  // System.Numerics.Vector4.NegativeInfinity (property)
  public static Vector4 NegativeInfinity { get; }

  // System.Numerics.Vector4.NegativeZero (property)
  public static Vector4 NegativeZero { get; }

  // System.Numerics.Vector4.One (property)
  public static Vector4 One { get; }

  // System.Numerics.Vector4.Pi (property)
  public static Vector4 Pi { get; }

  // System.Numerics.Vector4.PositiveInfinity (property)
  public static Vector4 PositiveInfinity { get; }

  // System.Numerics.Vector4.Tau (property)
  public static Vector4 Tau { get; }

  // System.Numerics.Vector4.UnitX (property)
  public static Vector4 UnitX { get; }

  // System.Numerics.Vector4.UnitY (property)
  public static Vector4 UnitY { get; }

  // System.Numerics.Vector4.UnitZ (property)
  public static Vector4 UnitZ { get; }

  // System.Numerics.Vector4.UnitW (property)
  public static Vector4 UnitW { get; }

  // System.Numerics.Vector4.Zero (property)
  public static Vector4 Zero { get; }

  // System.Numerics.Vector4.this[int index] (property)
  public float this[int index] { get; set; }

  // System.Numerics.Vector4.Vector4 (constructor)
  public Vector4()
  public Vector4(float value)
  public Vector4(Vector2 value, float z, float w)
  public Vector4(Vector3 value, float w)
  public Vector4(float x, float y, float z, float w)
  public Vector4(ReadOnlySpan<float> values)

  // System.Numerics.Vector4.op_Addition (method)
  public static Vector4 operator +(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.op_Division (method)
  public static Vector4 operator /(Vector4 left, Vector4 right)
  public static Vector4 operator /(Vector4 value1, float value2)

  // System.Numerics.Vector4.op_Equality (method)
  public static bool operator ==(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.op_Inequality (method)
  public static bool operator !=(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.op_Multiply (method)
  public static Vector4 operator *(Vector4 left, Vector4 right)
  public static Vector4 operator *(Vector4 left, float right)
  public static Vector4 operator *(float left, Vector4 right)

  // System.Numerics.Vector4.op_Subtraction (method)
  public static Vector4 operator -(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.op_UnaryNegation (method)
  public static Vector4 operator -(Vector4 value)

  // System.Numerics.Vector4.op_BitwiseAnd (method)
  public static Vector4 operator &(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.op_BitwiseOr (method)
  public static Vector4 operator |(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.op_ExclusiveOr (method)
  public static Vector4 operator ^(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.op_LeftShift (method)
  public static Vector4 operator <<(Vector4 value, int shiftAmount)

  // System.Numerics.Vector4.op_OnesComplement (method)
  public static Vector4 operator ~(Vector4 value)

  // System.Numerics.Vector4.op_RightShift (method)
  public static Vector4 operator >>(Vector4 value, int shiftAmount)

  // System.Numerics.Vector4.op_UnaryPlus (method)
  public static Vector4 operator +(Vector4 value)

  // System.Numerics.Vector4.op_UnsignedRightShift (method)
  public static Vector4 operator >>>(Vector4 value, int shiftAmount)

  // System.Numerics.Vector4.Abs (method)
  public static Vector4 Abs(Vector4 value)

  // System.Numerics.Vector4.Add (method)
  public static Vector4 Add(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.All (method)
  public static bool All(Vector4 vector, float value)

  // System.Numerics.Vector4.AllWhereAllBitsSet (method)
  public static bool AllWhereAllBitsSet(Vector4 vector)

  // System.Numerics.Vector4.AndNot (method)
  public static Vector4 AndNot(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.Any (method)
  public static bool Any(Vector4 vector, float value)

  // System.Numerics.Vector4.AnyWhereAllBitsSet (method)
  public static bool AnyWhereAllBitsSet(Vector4 vector)

  // System.Numerics.Vector4.BitwiseAnd (method)
  public static Vector4 BitwiseAnd(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.BitwiseOr (method)
  public static Vector4 BitwiseOr(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.Clamp (method)
  public static Vector4 Clamp(Vector4 value1, Vector4 min, Vector4 max)

  // System.Numerics.Vector4.ClampNative (method)
  public static Vector4 ClampNative(Vector4 value1, Vector4 min, Vector4 max)

  // System.Numerics.Vector4.ConditionalSelect (method)
  public static Vector4 ConditionalSelect(Vector4 condition, Vector4 left, Vector4 right)

  // System.Numerics.Vector4.CopySign (method)
  public static Vector4 CopySign(Vector4 value, Vector4 sign)

  // System.Numerics.Vector4.Cos (method)
  public static Vector4 Cos(Vector4 vector)

  // System.Numerics.Vector4.Count (method)
  public static int Count(Vector4 vector, float value)

  // System.Numerics.Vector4.CountWhereAllBitsSet (method)
  public static int CountWhereAllBitsSet(Vector4 vector)

  // System.Numerics.Vector4.Create (method)
  public static Vector4 Create(float value)
  public static Vector4 Create(Vector2 vector, float z, float w)
  public static Vector4 Create(Vector3 vector, float w)
  public static Vector4 Create(float x, float y, float z, float w)
  public static Vector4 Create(ReadOnlySpan<float> values)

  // System.Numerics.Vector4.CreateScalar (method)
  public static Vector4 CreateScalar(float x)

  // System.Numerics.Vector4.CreateScalarUnsafe (method)
  public static Vector4 CreateScalarUnsafe(float x)

  // System.Numerics.Vector4.Cross (method)
  public static Vector4 Cross(Vector4 vector1, Vector4 vector2)

  // System.Numerics.Vector4.DegreesToRadians (method)
  public static Vector4 DegreesToRadians(Vector4 degrees)

  // System.Numerics.Vector4.Distance (method)
  public static float Distance(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.DistanceSquared (method)
  public static float DistanceSquared(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.Divide (method)
  public static Vector4 Divide(Vector4 left, Vector4 right)
  public static Vector4 Divide(Vector4 left, float divisor)

  // System.Numerics.Vector4.Dot (method)
  public static float Dot(Vector4 vector1, Vector4 vector2)

  // System.Numerics.Vector4.Exp (method)
  public static Vector4 Exp(Vector4 vector)

  // System.Numerics.Vector4.Equals (method)
  public static Vector4 Equals(Vector4 left, Vector4 right)
  public readonly bool Equals(Vector4 other)
  public override readonly bool Equals(object? obj)

  // System.Numerics.Vector4.EqualsAll (method)
  public static bool EqualsAll(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.EqualsAny (method)
  public static bool EqualsAny(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.FusedMultiplyAdd (method)
  public static Vector4 FusedMultiplyAdd(Vector4 left, Vector4 right, Vector4 addend)

  // System.Numerics.Vector4.GreaterThan (method)
  public static Vector4 GreaterThan(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.GreaterThanAll (method)
  public static bool GreaterThanAll(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.GreaterThanAny (method)
  public static bool GreaterThanAny(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.GreaterThanOrEqual (method)
  public static Vector4 GreaterThanOrEqual(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.GreaterThanOrEqualAll (method)
  public static bool GreaterThanOrEqualAll(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.GreaterThanOrEqualAny (method)
  public static bool GreaterThanOrEqualAny(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.Hypot (method)
  public static Vector4 Hypot(Vector4 x, Vector4 y)

  // System.Numerics.Vector4.IndexOf (method)
  public static int IndexOf(Vector4 vector, float value)

  // System.Numerics.Vector4.IndexOfWhereAllBitsSet (method)
  public static int IndexOfWhereAllBitsSet(Vector4 vector)

  // System.Numerics.Vector4.IsEvenInteger (method)
  public static Vector4 IsEvenInteger(Vector4 vector)

  // System.Numerics.Vector4.IsFinite (method)
  public static Vector4 IsFinite(Vector4 vector)

  // System.Numerics.Vector4.IsInfinity (method)
  public static Vector4 IsInfinity(Vector4 vector)

  // System.Numerics.Vector4.IsInteger (method)
  public static Vector4 IsInteger(Vector4 vector)

  // System.Numerics.Vector4.IsNaN (method)
  public static Vector4 IsNaN(Vector4 vector)

  // System.Numerics.Vector4.IsNegative (method)
  public static Vector4 IsNegative(Vector4 vector)

  // System.Numerics.Vector4.IsNegativeInfinity (method)
  public static Vector4 IsNegativeInfinity(Vector4 vector)

  // System.Numerics.Vector4.IsNormal (method)
  public static Vector4 IsNormal(Vector4 vector)

  // System.Numerics.Vector4.IsOddInteger (method)
  public static Vector4 IsOddInteger(Vector4 vector)

  // System.Numerics.Vector4.IsPositive (method)
  public static Vector4 IsPositive(Vector4 vector)

  // System.Numerics.Vector4.IsPositiveInfinity (method)
  public static Vector4 IsPositiveInfinity(Vector4 vector)

  // System.Numerics.Vector4.IsSubnormal (method)
  public static Vector4 IsSubnormal(Vector4 vector)

  // System.Numerics.Vector4.IsZero (method)
  public static Vector4 IsZero(Vector4 vector)

  // System.Numerics.Vector4.LastIndexOf (method)
  public static int LastIndexOf(Vector4 vector, float value)

  // System.Numerics.Vector4.LastIndexOfWhereAllBitsSet (method)
  public static int LastIndexOfWhereAllBitsSet(Vector4 vector)

  // System.Numerics.Vector4.Lerp (method)
  public static Vector4 Lerp(Vector4 value1, Vector4 value2, float amount)
  public static Vector4 Lerp(Vector4 value1, Vector4 value2, Vector4 amount)

  // System.Numerics.Vector4.LessThan (method)
  public static Vector4 LessThan(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.LessThanAll (method)
  public static bool LessThanAll(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.LessThanAny (method)
  public static bool LessThanAny(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.LessThanOrEqual (method)
  public static Vector4 LessThanOrEqual(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.LessThanOrEqualAll (method)
  public static bool LessThanOrEqualAll(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.LessThanOrEqualAny (method)
  public static bool LessThanOrEqualAny(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.Load (method)
  public static Vector4 Load(float* source)

  // System.Numerics.Vector4.LoadAligned (method)
  public static Vector4 LoadAligned(float* source)

  // System.Numerics.Vector4.LoadAlignedNonTemporal (method)
  public static Vector4 LoadAlignedNonTemporal(float* source)

  // System.Numerics.Vector4.LoadUnsafe (method)
  public static Vector4 LoadUnsafe(ref readonly float source)
  public static Vector4 LoadUnsafe(ref readonly float source, nuint elementOffset)

  // System.Numerics.Vector4.Log (method)
  public static Vector4 Log(Vector4 vector)

  // System.Numerics.Vector4.Log2 (method)
  public static Vector4 Log2(Vector4 vector)

  // System.Numerics.Vector4.Max (method)
  public static Vector4 Max(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.MaxMagnitude (method)
  public static Vector4 MaxMagnitude(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.MaxMagnitudeNumber (method)
  public static Vector4 MaxMagnitudeNumber(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.MaxNative (method)
  public static Vector4 MaxNative(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.MaxNumber (method)
  public static Vector4 MaxNumber(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.Min (method)
  public static Vector4 Min(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.MinMagnitude (method)
  public static Vector4 MinMagnitude(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.MinMagnitudeNumber (method)
  public static Vector4 MinMagnitudeNumber(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.MinNative (method)
  public static Vector4 MinNative(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.MinNumber (method)
  public static Vector4 MinNumber(Vector4 value1, Vector4 value2)

  // System.Numerics.Vector4.Multiply (method)
  public static Vector4 Multiply(Vector4 left, Vector4 right)
  public static Vector4 Multiply(Vector4 left, float right)
  public static Vector4 Multiply(float left, Vector4 right)

  // System.Numerics.Vector4.MultiplyAddEstimate (method)
  public static Vector4 MultiplyAddEstimate(Vector4 left, Vector4 right, Vector4 addend)

  // System.Numerics.Vector4.Negate (method)
  public static Vector4 Negate(Vector4 value)

  // System.Numerics.Vector4.None (method)
  public static bool None(Vector4 vector, float value)

  // System.Numerics.Vector4.NoneWhereAllBitsSet (method)
  public static bool NoneWhereAllBitsSet(Vector4 vector)

  // System.Numerics.Vector4.Normalize (method)
  public static Vector4 Normalize(Vector4 vector)

  // System.Numerics.Vector4.OnesComplement (method)
  public static Vector4 OnesComplement(Vector4 value)

  // System.Numerics.Vector4.RadiansToDegrees (method)
  public static Vector4 RadiansToDegrees(Vector4 radians)

  // System.Numerics.Vector4.Round (method)
  public static Vector4 Round(Vector4 vector)
  public static Vector4 Round(Vector4 vector, MidpointRounding mode)

  // System.Numerics.Vector4.Shuffle (method)
  public static Vector4 Shuffle(Vector4 vector, byte xIndex, byte yIndex, byte zIndex, byte wIndex)

  // System.Numerics.Vector4.Sin (method)
  public static Vector4 Sin(Vector4 vector)

  // System.Numerics.Vector4.SinCos (method)
  public static (Vector4 Sin, Vector4 Cos) SinCos(Vector4 vector)

  // System.Numerics.Vector4.SquareRoot (method)
  public static Vector4 SquareRoot(Vector4 value)

  // System.Numerics.Vector4.Subtract (method)
  public static Vector4 Subtract(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.Sum (method)
  public static float Sum(Vector4 value)

  // System.Numerics.Vector4.Transform (method)
  public static Vector4 Transform(Vector2 position, Matrix4x4 matrix)
  public static Vector4 Transform(Vector2 value, Quaternion rotation)
  public static Vector4 Transform(Vector3 position, Matrix4x4 matrix)
  public static Vector4 Transform(Vector3 value, Quaternion rotation)
  public static Vector4 Transform(Vector4 vector, Matrix4x4 matrix)
  public static Vector4 Transform(Vector4 value, Quaternion rotation)

  // System.Numerics.Vector4.Truncate (method)
  public static Vector4 Truncate(Vector4 vector)

  // System.Numerics.Vector4.Xor (method)
  public static Vector4 Xor(Vector4 left, Vector4 right)

  // System.Numerics.Vector4.CopyTo (method)
  public readonly void CopyTo(float[] array)
  public readonly void CopyTo(float[] array, int index)
  public readonly void CopyTo(Span<float> destination)

  // System.Numerics.Vector4.TryCopyTo (method)
  public readonly bool TryCopyTo(Span<float> destination)

  // System.Numerics.Vector4.GetHashCode (method)
  public override readonly int GetHashCode()

  // System.Numerics.Vector4.Length (method)
  public readonly float Length()

  // System.Numerics.Vector4.LengthSquared (method)
  public readonly float LengthSquared()

  // System.Numerics.Vector4.ToString (method)
  public override readonly string ToString()
  public readonly string ToString(string? format)
  public readonly string ToString(string? format, IFormatProvider? formatProvider)
