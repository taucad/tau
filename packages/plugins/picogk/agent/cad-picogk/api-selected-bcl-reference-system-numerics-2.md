# PicoGK — Selected BCL reference — System.Numerics (2)

1 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
// System.Numerics.Vector2 (struct)
public struct Vector2

  // System.Numerics.Vector2.X (field)
  public float X

  // System.Numerics.Vector2.Y (field)
  public float Y

  // System.Numerics.Vector2.AllBitsSet (property)
  public static Vector2 AllBitsSet { get; }

  // System.Numerics.Vector2.E (property)
  public static Vector2 E { get; }

  // System.Numerics.Vector2.Epsilon (property)
  public static Vector2 Epsilon { get; }

  // System.Numerics.Vector2.NaN (property)
  public static Vector2 NaN { get; }

  // System.Numerics.Vector2.NegativeInfinity (property)
  public static Vector2 NegativeInfinity { get; }

  // System.Numerics.Vector2.NegativeZero (property)
  public static Vector2 NegativeZero { get; }

  // System.Numerics.Vector2.One (property)
  public static Vector2 One { get; }

  // System.Numerics.Vector2.Pi (property)
  public static Vector2 Pi { get; }

  // System.Numerics.Vector2.PositiveInfinity (property)
  public static Vector2 PositiveInfinity { get; }

  // System.Numerics.Vector2.Tau (property)
  public static Vector2 Tau { get; }

  // System.Numerics.Vector2.UnitX (property)
  public static Vector2 UnitX { get; }

  // System.Numerics.Vector2.UnitY (property)
  public static Vector2 UnitY { get; }

  // System.Numerics.Vector2.Zero (property)
  public static Vector2 Zero { get; }

  // System.Numerics.Vector2.this[int index] (property)
  public float this[int index] { get; set; }

  // System.Numerics.Vector2.Vector2 (constructor)
  public Vector2()
  public Vector2(float value)
  public Vector2(float x, float y)
  public Vector2(ReadOnlySpan<float> values)

  // System.Numerics.Vector2.op_Addition (method)
  public static Vector2 operator +(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.op_Division (method)
  public static Vector2 operator /(Vector2 left, Vector2 right)
  public static Vector2 operator /(Vector2 value1, float value2)

  // System.Numerics.Vector2.op_Equality (method)
  public static bool operator ==(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.op_Inequality (method)
  public static bool operator !=(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.op_Multiply (method)
  public static Vector2 operator *(Vector2 left, Vector2 right)
  public static Vector2 operator *(Vector2 left, float right)
  public static Vector2 operator *(float left, Vector2 right)

  // System.Numerics.Vector2.op_Subtraction (method)
  public static Vector2 operator -(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.op_UnaryNegation (method)
  public static Vector2 operator -(Vector2 value)

  // System.Numerics.Vector2.op_BitwiseAnd (method)
  public static Vector2 operator &(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.op_BitwiseOr (method)
  public static Vector2 operator |(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.op_ExclusiveOr (method)
  public static Vector2 operator ^(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.op_LeftShift (method)
  public static Vector2 operator <<(Vector2 value, int shiftAmount)

  // System.Numerics.Vector2.op_OnesComplement (method)
  public static Vector2 operator ~(Vector2 value)

  // System.Numerics.Vector2.op_RightShift (method)
  public static Vector2 operator >>(Vector2 value, int shiftAmount)

  // System.Numerics.Vector2.op_UnaryPlus (method)
  public static Vector2 operator +(Vector2 value)

  // System.Numerics.Vector2.op_UnsignedRightShift (method)
  public static Vector2 operator >>>(Vector2 value, int shiftAmount)

  // System.Numerics.Vector2.Abs (method)
  public static Vector2 Abs(Vector2 value)

  // System.Numerics.Vector2.Add (method)
  public static Vector2 Add(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.All (method)
  public static bool All(Vector2 vector, float value)

  // System.Numerics.Vector2.AllWhereAllBitsSet (method)
  public static bool AllWhereAllBitsSet(Vector2 vector)

  // System.Numerics.Vector2.AndNot (method)
  public static Vector2 AndNot(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.Any (method)
  public static bool Any(Vector2 vector, float value)

  // System.Numerics.Vector2.AnyWhereAllBitsSet (method)
  public static bool AnyWhereAllBitsSet(Vector2 vector)

  // System.Numerics.Vector2.BitwiseAnd (method)
  public static Vector2 BitwiseAnd(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.BitwiseOr (method)
  public static Vector2 BitwiseOr(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.Clamp (method)
  public static Vector2 Clamp(Vector2 value1, Vector2 min, Vector2 max)

  // System.Numerics.Vector2.ClampNative (method)
  public static Vector2 ClampNative(Vector2 value1, Vector2 min, Vector2 max)

  // System.Numerics.Vector2.ConditionalSelect (method)
  public static Vector2 ConditionalSelect(Vector2 condition, Vector2 left, Vector2 right)

  // System.Numerics.Vector2.CopySign (method)
  public static Vector2 CopySign(Vector2 value, Vector2 sign)

  // System.Numerics.Vector2.Cos (method)
  public static Vector2 Cos(Vector2 vector)

  // System.Numerics.Vector2.Count (method)
  public static int Count(Vector2 vector, float value)

  // System.Numerics.Vector2.CountWhereAllBitsSet (method)
  public static int CountWhereAllBitsSet(Vector2 vector)

  // System.Numerics.Vector2.Create (method)
  public static Vector2 Create(float value)
  public static Vector2 Create(float x, float y)
  public static Vector2 Create(ReadOnlySpan<float> values)

  // System.Numerics.Vector2.CreateScalar (method)
  public static Vector2 CreateScalar(float x)

  // System.Numerics.Vector2.CreateScalarUnsafe (method)
  public static Vector2 CreateScalarUnsafe(float x)

  // System.Numerics.Vector2.Cross (method)
  public static float Cross(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.DegreesToRadians (method)
  public static Vector2 DegreesToRadians(Vector2 degrees)

  // System.Numerics.Vector2.Distance (method)
  public static float Distance(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.DistanceSquared (method)
  public static float DistanceSquared(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.Divide (method)
  public static Vector2 Divide(Vector2 left, Vector2 right)
  public static Vector2 Divide(Vector2 left, float divisor)

  // System.Numerics.Vector2.Dot (method)
  public static float Dot(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.Exp (method)
  public static Vector2 Exp(Vector2 vector)

  // System.Numerics.Vector2.Equals (method)
  public static Vector2 Equals(Vector2 left, Vector2 right)
  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Vector2 other)

  // System.Numerics.Vector2.EqualsAll (method)
  public static bool EqualsAll(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.EqualsAny (method)
  public static bool EqualsAny(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.FusedMultiplyAdd (method)
  public static Vector2 FusedMultiplyAdd(Vector2 left, Vector2 right, Vector2 addend)

  // System.Numerics.Vector2.GreaterThan (method)
  public static Vector2 GreaterThan(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.GreaterThanAll (method)
  public static bool GreaterThanAll(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.GreaterThanAny (method)
  public static bool GreaterThanAny(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.GreaterThanOrEqual (method)
  public static Vector2 GreaterThanOrEqual(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.GreaterThanOrEqualAll (method)
  public static bool GreaterThanOrEqualAll(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.GreaterThanOrEqualAny (method)
  public static bool GreaterThanOrEqualAny(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.Hypot (method)
  public static Vector2 Hypot(Vector2 x, Vector2 y)

  // System.Numerics.Vector2.IndexOf (method)
  public static int IndexOf(Vector2 vector, float value)

  // System.Numerics.Vector2.IndexOfWhereAllBitsSet (method)
  public static int IndexOfWhereAllBitsSet(Vector2 vector)

  // System.Numerics.Vector2.IsEvenInteger (method)
  public static Vector2 IsEvenInteger(Vector2 vector)

  // System.Numerics.Vector2.IsFinite (method)
  public static Vector2 IsFinite(Vector2 vector)

  // System.Numerics.Vector2.IsInfinity (method)
  public static Vector2 IsInfinity(Vector2 vector)

  // System.Numerics.Vector2.IsInteger (method)
  public static Vector2 IsInteger(Vector2 vector)

  // System.Numerics.Vector2.IsNaN (method)
  public static Vector2 IsNaN(Vector2 vector)

  // System.Numerics.Vector2.IsNegative (method)
  public static Vector2 IsNegative(Vector2 vector)

  // System.Numerics.Vector2.IsNegativeInfinity (method)
  public static Vector2 IsNegativeInfinity(Vector2 vector)

  // System.Numerics.Vector2.IsNormal (method)
  public static Vector2 IsNormal(Vector2 vector)

  // System.Numerics.Vector2.IsOddInteger (method)
  public static Vector2 IsOddInteger(Vector2 vector)

  // System.Numerics.Vector2.IsPositive (method)
  public static Vector2 IsPositive(Vector2 vector)

  // System.Numerics.Vector2.IsPositiveInfinity (method)
  public static Vector2 IsPositiveInfinity(Vector2 vector)

  // System.Numerics.Vector2.IsSubnormal (method)
  public static Vector2 IsSubnormal(Vector2 vector)

  // System.Numerics.Vector2.IsZero (method)
  public static Vector2 IsZero(Vector2 vector)

  // System.Numerics.Vector2.LastIndexOf (method)
  public static int LastIndexOf(Vector2 vector, float value)

  // System.Numerics.Vector2.LastIndexOfWhereAllBitsSet (method)
  public static int LastIndexOfWhereAllBitsSet(Vector2 vector)

  // System.Numerics.Vector2.Lerp (method)
  public static Vector2 Lerp(Vector2 value1, Vector2 value2, float amount)
  public static Vector2 Lerp(Vector2 value1, Vector2 value2, Vector2 amount)

  // System.Numerics.Vector2.LessThan (method)
  public static Vector2 LessThan(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.LessThanAll (method)
  public static bool LessThanAll(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.LessThanAny (method)
  public static bool LessThanAny(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.LessThanOrEqual (method)
  public static Vector2 LessThanOrEqual(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.LessThanOrEqualAll (method)
  public static bool LessThanOrEqualAll(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.LessThanOrEqualAny (method)
  public static bool LessThanOrEqualAny(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.Load (method)
  public static Vector2 Load(float* source)

  // System.Numerics.Vector2.LoadAligned (method)
  public static Vector2 LoadAligned(float* source)

  // System.Numerics.Vector2.LoadAlignedNonTemporal (method)
  public static Vector2 LoadAlignedNonTemporal(float* source)

  // System.Numerics.Vector2.LoadUnsafe (method)
  public static Vector2 LoadUnsafe(ref readonly float source)
  public static Vector2 LoadUnsafe(ref readonly float source, nuint elementOffset)

  // System.Numerics.Vector2.Log (method)
  public static Vector2 Log(Vector2 vector)

  // System.Numerics.Vector2.Log2 (method)
  public static Vector2 Log2(Vector2 vector)

  // System.Numerics.Vector2.Max (method)
  public static Vector2 Max(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.MaxMagnitude (method)
  public static Vector2 MaxMagnitude(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.MaxMagnitudeNumber (method)
  public static Vector2 MaxMagnitudeNumber(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.MaxNative (method)
  public static Vector2 MaxNative(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.MaxNumber (method)
  public static Vector2 MaxNumber(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.Min (method)
  public static Vector2 Min(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.MinMagnitude (method)
  public static Vector2 MinMagnitude(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.MinMagnitudeNumber (method)
  public static Vector2 MinMagnitudeNumber(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.MinNative (method)
  public static Vector2 MinNative(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.MinNumber (method)
  public static Vector2 MinNumber(Vector2 value1, Vector2 value2)

  // System.Numerics.Vector2.Multiply (method)
  public static Vector2 Multiply(Vector2 left, Vector2 right)
  public static Vector2 Multiply(Vector2 left, float right)
  public static Vector2 Multiply(float left, Vector2 right)

  // System.Numerics.Vector2.MultiplyAddEstimate (method)
  public static Vector2 MultiplyAddEstimate(Vector2 left, Vector2 right, Vector2 addend)

  // System.Numerics.Vector2.Negate (method)
  public static Vector2 Negate(Vector2 value)

  // System.Numerics.Vector2.None (method)
  public static bool None(Vector2 vector, float value)

  // System.Numerics.Vector2.NoneWhereAllBitsSet (method)
  public static bool NoneWhereAllBitsSet(Vector2 vector)

  // System.Numerics.Vector2.Normalize (method)
  public static Vector2 Normalize(Vector2 value)

  // System.Numerics.Vector2.OnesComplement (method)
  public static Vector2 OnesComplement(Vector2 value)

  // System.Numerics.Vector2.RadiansToDegrees (method)
  public static Vector2 RadiansToDegrees(Vector2 radians)

  // System.Numerics.Vector2.Reflect (method)
  public static Vector2 Reflect(Vector2 vector, Vector2 normal)

  // System.Numerics.Vector2.Round (method)
  public static Vector2 Round(Vector2 vector)
  public static Vector2 Round(Vector2 vector, MidpointRounding mode)

  // System.Numerics.Vector2.Shuffle (method)
  public static Vector2 Shuffle(Vector2 vector, byte xIndex, byte yIndex)

  // System.Numerics.Vector2.Sin (method)
  public static Vector2 Sin(Vector2 vector)

  // System.Numerics.Vector2.SinCos (method)
  public static (Vector2 Sin, Vector2 Cos) SinCos(Vector2 vector)

  // System.Numerics.Vector2.SquareRoot (method)
  public static Vector2 SquareRoot(Vector2 value)

  // System.Numerics.Vector2.Subtract (method)
  public static Vector2 Subtract(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.Sum (method)
  public static float Sum(Vector2 value)

  // System.Numerics.Vector2.Transform (method)
  public static Vector2 Transform(Vector2 position, Matrix3x2 matrix)
  public static Vector2 Transform(Vector2 position, Matrix4x4 matrix)
  public static Vector2 Transform(Vector2 value, Quaternion rotation)

  // System.Numerics.Vector2.TransformNormal (method)
  public static Vector2 TransformNormal(Vector2 normal, Matrix3x2 matrix)
  public static Vector2 TransformNormal(Vector2 normal, Matrix4x4 matrix)

  // System.Numerics.Vector2.Truncate (method)
  public static Vector2 Truncate(Vector2 vector)

  // System.Numerics.Vector2.Xor (method)
  public static Vector2 Xor(Vector2 left, Vector2 right)

  // System.Numerics.Vector2.CopyTo (method)
  public readonly void CopyTo(float[] array)
  public readonly void CopyTo(float[] array, int index)
  public readonly void CopyTo(Span<float> destination)

  // System.Numerics.Vector2.TryCopyTo (method)
  public readonly bool TryCopyTo(Span<float> destination)

  // System.Numerics.Vector2.GetHashCode (method)
  public override readonly int GetHashCode()

  // System.Numerics.Vector2.Length (method)
  public readonly float Length()

  // System.Numerics.Vector2.LengthSquared (method)
  public readonly float LengthSquared()

  // System.Numerics.Vector2.ToString (method)
  public override readonly string ToString()
  public readonly string ToString(string? format)
  public readonly string ToString(string? format, IFormatProvider? formatProvider)
