# PicoGK — Selected BCL reference — System.Numerics (3)

1 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
// System.Numerics.Vector3 (struct)
public struct Vector3

  // System.Numerics.Vector3.X (field)
  public float X

  // System.Numerics.Vector3.Y (field)
  public float Y

  // System.Numerics.Vector3.Z (field)
  public float Z

  // System.Numerics.Vector3.AllBitsSet (property)
  public static Vector3 AllBitsSet { get; }

  // System.Numerics.Vector3.E (property)
  public static Vector3 E { get; }

  // System.Numerics.Vector3.Epsilon (property)
  public static Vector3 Epsilon { get; }

  // System.Numerics.Vector3.NaN (property)
  public static Vector3 NaN { get; }

  // System.Numerics.Vector3.NegativeInfinity (property)
  public static Vector3 NegativeInfinity { get; }

  // System.Numerics.Vector3.NegativeZero (property)
  public static Vector3 NegativeZero { get; }

  // System.Numerics.Vector3.One (property)
  public static Vector3 One { get; }

  // System.Numerics.Vector3.Pi (property)
  public static Vector3 Pi { get; }

  // System.Numerics.Vector3.PositiveInfinity (property)
  public static Vector3 PositiveInfinity { get; }

  // System.Numerics.Vector3.Tau (property)
  public static Vector3 Tau { get; }

  // System.Numerics.Vector3.UnitX (property)
  public static Vector3 UnitX { get; }

  // System.Numerics.Vector3.UnitY (property)
  public static Vector3 UnitY { get; }

  // System.Numerics.Vector3.UnitZ (property)
  public static Vector3 UnitZ { get; }

  // System.Numerics.Vector3.Zero (property)
  public static Vector3 Zero { get; }

  // System.Numerics.Vector3.this[int index] (property)
  public float this[int index] { get; set; }

  // System.Numerics.Vector3.Vector3 (constructor)
  public Vector3()
  public Vector3(float value)
  public Vector3(Vector2 value, float z)
  public Vector3(float x, float y, float z)
  public Vector3(ReadOnlySpan<float> values)

  // System.Numerics.Vector3.op_Addition (method)
  public static Vector3 operator +(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.op_Division (method)
  public static Vector3 operator /(Vector3 left, Vector3 right)
  public static Vector3 operator /(Vector3 value1, float value2)

  // System.Numerics.Vector3.op_Equality (method)
  public static bool operator ==(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.op_Inequality (method)
  public static bool operator !=(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.op_Multiply (method)
  public static Vector3 operator *(Vector3 left, Vector3 right)
  public static Vector3 operator *(Vector3 left, float right)
  public static Vector3 operator *(float left, Vector3 right)

  // System.Numerics.Vector3.op_Subtraction (method)
  public static Vector3 operator -(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.op_UnaryNegation (method)
  public static Vector3 operator -(Vector3 value)

  // System.Numerics.Vector3.op_BitwiseAnd (method)
  public static Vector3 operator &(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.op_BitwiseOr (method)
  public static Vector3 operator |(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.op_ExclusiveOr (method)
  public static Vector3 operator ^(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.op_LeftShift (method)
  public static Vector3 operator <<(Vector3 value, int shiftAmount)

  // System.Numerics.Vector3.op_OnesComplement (method)
  public static Vector3 operator ~(Vector3 value)

  // System.Numerics.Vector3.op_RightShift (method)
  public static Vector3 operator >>(Vector3 value, int shiftAmount)

  // System.Numerics.Vector3.op_UnaryPlus (method)
  public static Vector3 operator +(Vector3 value)

  // System.Numerics.Vector3.op_UnsignedRightShift (method)
  public static Vector3 operator >>>(Vector3 value, int shiftAmount)

  // System.Numerics.Vector3.Abs (method)
  public static Vector3 Abs(Vector3 value)

  // System.Numerics.Vector3.Add (method)
  public static Vector3 Add(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.All (method)
  public static bool All(Vector3 vector, float value)

  // System.Numerics.Vector3.AllWhereAllBitsSet (method)
  public static bool AllWhereAllBitsSet(Vector3 vector)

  // System.Numerics.Vector3.AndNot (method)
  public static Vector3 AndNot(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.Any (method)
  public static bool Any(Vector3 vector, float value)

  // System.Numerics.Vector3.AnyWhereAllBitsSet (method)
  public static bool AnyWhereAllBitsSet(Vector3 vector)

  // System.Numerics.Vector3.BitwiseAnd (method)
  public static Vector3 BitwiseAnd(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.BitwiseOr (method)
  public static Vector3 BitwiseOr(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.Clamp (method)
  public static Vector3 Clamp(Vector3 value1, Vector3 min, Vector3 max)

  // System.Numerics.Vector3.ClampNative (method)
  public static Vector3 ClampNative(Vector3 value1, Vector3 min, Vector3 max)

  // System.Numerics.Vector3.ConditionalSelect (method)
  public static Vector3 ConditionalSelect(Vector3 condition, Vector3 left, Vector3 right)

  // System.Numerics.Vector3.CopySign (method)
  public static Vector3 CopySign(Vector3 value, Vector3 sign)

  // System.Numerics.Vector3.Cos (method)
  public static Vector3 Cos(Vector3 vector)

  // System.Numerics.Vector3.Count (method)
  public static int Count(Vector3 vector, float value)

  // System.Numerics.Vector3.CountWhereAllBitsSet (method)
  public static int CountWhereAllBitsSet(Vector3 vector)

  // System.Numerics.Vector3.Create (method)
  public static Vector3 Create(float value)
  public static Vector3 Create(Vector2 vector, float z)
  public static Vector3 Create(float x, float y, float z)
  public static Vector3 Create(ReadOnlySpan<float> values)

  // System.Numerics.Vector3.CreateScalar (method)
  public static Vector3 CreateScalar(float x)

  // System.Numerics.Vector3.CreateScalarUnsafe (method)
  public static Vector3 CreateScalarUnsafe(float x)

  // System.Numerics.Vector3.Cross (method)
  public static Vector3 Cross(Vector3 vector1, Vector3 vector2)

  // System.Numerics.Vector3.DegreesToRadians (method)
  public static Vector3 DegreesToRadians(Vector3 degrees)

  // System.Numerics.Vector3.Distance (method)
  public static float Distance(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.DistanceSquared (method)
  public static float DistanceSquared(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.Divide (method)
  public static Vector3 Divide(Vector3 left, Vector3 right)
  public static Vector3 Divide(Vector3 left, float divisor)

  // System.Numerics.Vector3.Dot (method)
  public static float Dot(Vector3 vector1, Vector3 vector2)

  // System.Numerics.Vector3.Exp (method)
  public static Vector3 Exp(Vector3 vector)

  // System.Numerics.Vector3.Equals (method)
  public static Vector3 Equals(Vector3 left, Vector3 right)
  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Vector3 other)

  // System.Numerics.Vector3.EqualsAll (method)
  public static bool EqualsAll(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.EqualsAny (method)
  public static bool EqualsAny(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.FusedMultiplyAdd (method)
  public static Vector3 FusedMultiplyAdd(Vector3 left, Vector3 right, Vector3 addend)

  // System.Numerics.Vector3.GreaterThan (method)
  public static Vector3 GreaterThan(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.GreaterThanAll (method)
  public static bool GreaterThanAll(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.GreaterThanAny (method)
  public static bool GreaterThanAny(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.GreaterThanOrEqual (method)
  public static Vector3 GreaterThanOrEqual(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.GreaterThanOrEqualAll (method)
  public static bool GreaterThanOrEqualAll(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.GreaterThanOrEqualAny (method)
  public static bool GreaterThanOrEqualAny(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.Hypot (method)
  public static Vector3 Hypot(Vector3 x, Vector3 y)

  // System.Numerics.Vector3.IndexOf (method)
  public static int IndexOf(Vector3 vector, float value)

  // System.Numerics.Vector3.IndexOfWhereAllBitsSet (method)
  public static int IndexOfWhereAllBitsSet(Vector3 vector)

  // System.Numerics.Vector3.IsEvenInteger (method)
  public static Vector3 IsEvenInteger(Vector3 vector)

  // System.Numerics.Vector3.IsFinite (method)
  public static Vector3 IsFinite(Vector3 vector)

  // System.Numerics.Vector3.IsInfinity (method)
  public static Vector3 IsInfinity(Vector3 vector)

  // System.Numerics.Vector3.IsInteger (method)
  public static Vector3 IsInteger(Vector3 vector)

  // System.Numerics.Vector3.IsNaN (method)
  public static Vector3 IsNaN(Vector3 vector)

  // System.Numerics.Vector3.IsNegative (method)
  public static Vector3 IsNegative(Vector3 vector)

  // System.Numerics.Vector3.IsNegativeInfinity (method)
  public static Vector3 IsNegativeInfinity(Vector3 vector)

  // System.Numerics.Vector3.IsNormal (method)
  public static Vector3 IsNormal(Vector3 vector)

  // System.Numerics.Vector3.IsOddInteger (method)
  public static Vector3 IsOddInteger(Vector3 vector)

  // System.Numerics.Vector3.IsPositive (method)
  public static Vector3 IsPositive(Vector3 vector)

  // System.Numerics.Vector3.IsPositiveInfinity (method)
  public static Vector3 IsPositiveInfinity(Vector3 vector)

  // System.Numerics.Vector3.IsSubnormal (method)
  public static Vector3 IsSubnormal(Vector3 vector)

  // System.Numerics.Vector3.IsZero (method)
  public static Vector3 IsZero(Vector3 vector)

  // System.Numerics.Vector3.LastIndexOf (method)
  public static int LastIndexOf(Vector3 vector, float value)

  // System.Numerics.Vector3.LastIndexOfWhereAllBitsSet (method)
  public static int LastIndexOfWhereAllBitsSet(Vector3 vector)

  // System.Numerics.Vector3.Lerp (method)
  public static Vector3 Lerp(Vector3 value1, Vector3 value2, float amount)
  public static Vector3 Lerp(Vector3 value1, Vector3 value2, Vector3 amount)

  // System.Numerics.Vector3.LessThan (method)
  public static Vector3 LessThan(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.LessThanAll (method)
  public static bool LessThanAll(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.LessThanAny (method)
  public static bool LessThanAny(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.LessThanOrEqual (method)
  public static Vector3 LessThanOrEqual(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.LessThanOrEqualAll (method)
  public static bool LessThanOrEqualAll(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.LessThanOrEqualAny (method)
  public static bool LessThanOrEqualAny(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.Load (method)
  public static Vector3 Load(float* source)

  // System.Numerics.Vector3.LoadAligned (method)
  public static Vector3 LoadAligned(float* source)

  // System.Numerics.Vector3.LoadAlignedNonTemporal (method)
  public static Vector3 LoadAlignedNonTemporal(float* source)

  // System.Numerics.Vector3.LoadUnsafe (method)
  public static Vector3 LoadUnsafe(ref readonly float source)
  public static Vector3 LoadUnsafe(ref readonly float source, nuint elementOffset)

  // System.Numerics.Vector3.Log (method)
  public static Vector3 Log(Vector3 vector)

  // System.Numerics.Vector3.Log2 (method)
  public static Vector3 Log2(Vector3 vector)

  // System.Numerics.Vector3.Max (method)
  public static Vector3 Max(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.MaxMagnitude (method)
  public static Vector3 MaxMagnitude(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.MaxMagnitudeNumber (method)
  public static Vector3 MaxMagnitudeNumber(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.MaxNative (method)
  public static Vector3 MaxNative(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.MaxNumber (method)
  public static Vector3 MaxNumber(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.Min (method)
  public static Vector3 Min(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.MinMagnitude (method)
  public static Vector3 MinMagnitude(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.MinMagnitudeNumber (method)
  public static Vector3 MinMagnitudeNumber(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.MinNative (method)
  public static Vector3 MinNative(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.MinNumber (method)
  public static Vector3 MinNumber(Vector3 value1, Vector3 value2)

  // System.Numerics.Vector3.Multiply (method)
  public static Vector3 Multiply(Vector3 left, Vector3 right)
  public static Vector3 Multiply(Vector3 left, float right)
  public static Vector3 Multiply(float left, Vector3 right)

  // System.Numerics.Vector3.MultiplyAddEstimate (method)
  public static Vector3 MultiplyAddEstimate(Vector3 left, Vector3 right, Vector3 addend)

  // System.Numerics.Vector3.Negate (method)
  public static Vector3 Negate(Vector3 value)

  // System.Numerics.Vector3.None (method)
  public static bool None(Vector3 vector, float value)

  // System.Numerics.Vector3.NoneWhereAllBitsSet (method)
  public static bool NoneWhereAllBitsSet(Vector3 vector)

  // System.Numerics.Vector3.Normalize (method)
  public static Vector3 Normalize(Vector3 value)

  // System.Numerics.Vector3.OnesComplement (method)
  public static Vector3 OnesComplement(Vector3 value)

  // System.Numerics.Vector3.RadiansToDegrees (method)
  public static Vector3 RadiansToDegrees(Vector3 radians)

  // System.Numerics.Vector3.Reflect (method)
  public static Vector3 Reflect(Vector3 vector, Vector3 normal)

  // System.Numerics.Vector3.Round (method)
  public static Vector3 Round(Vector3 vector)
  public static Vector3 Round(Vector3 vector, MidpointRounding mode)

  // System.Numerics.Vector3.Shuffle (method)
  public static Vector3 Shuffle(Vector3 vector, byte xIndex, byte yIndex, byte zIndex)

  // System.Numerics.Vector3.Sin (method)
  public static Vector3 Sin(Vector3 vector)

  // System.Numerics.Vector3.SinCos (method)
  public static (Vector3 Sin, Vector3 Cos) SinCos(Vector3 vector)

  // System.Numerics.Vector3.SquareRoot (method)
  public static Vector3 SquareRoot(Vector3 value)

  // System.Numerics.Vector3.Subtract (method)
  public static Vector3 Subtract(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.Sum (method)
  public static float Sum(Vector3 value)

  // System.Numerics.Vector3.Transform (method)
  public static Vector3 Transform(Vector3 position, Matrix4x4 matrix)
  public static Vector3 Transform(Vector3 value, Quaternion rotation)

  // System.Numerics.Vector3.TransformNormal (method)
  public static Vector3 TransformNormal(Vector3 normal, Matrix4x4 matrix)

  // System.Numerics.Vector3.Truncate (method)
  public static Vector3 Truncate(Vector3 vector)

  // System.Numerics.Vector3.Xor (method)
  public static Vector3 Xor(Vector3 left, Vector3 right)

  // System.Numerics.Vector3.CopyTo (method)
  public readonly void CopyTo(float[] array)
  public readonly void CopyTo(float[] array, int index)
  public readonly void CopyTo(Span<float> destination)

  // System.Numerics.Vector3.TryCopyTo (method)
  public readonly bool TryCopyTo(Span<float> destination)

  // System.Numerics.Vector3.GetHashCode (method)
  public override readonly int GetHashCode()

  // System.Numerics.Vector3.Length (method)
  public readonly float Length()

  // System.Numerics.Vector3.LengthSquared (method)
  public readonly float LengthSquared()

  // System.Numerics.Vector3.ToString (method)
  public override readonly string ToString()
  public readonly string ToString(string? format)
  public readonly string ToString(string? format, IFormatProvider? formatProvider)
