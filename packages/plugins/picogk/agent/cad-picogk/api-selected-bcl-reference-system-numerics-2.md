# PicoGK — Selected BCL reference — System.Numerics (2)

1 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
public struct Vector2

  public float X

  public float Y

  public static Vector2 AllBitsSet { get; }

  public static Vector2 E { get; }

  public static Vector2 Epsilon { get; }

  public static Vector2 NaN { get; }

  public static Vector2 NegativeInfinity { get; }

  public static Vector2 NegativeZero { get; }

  public static Vector2 One { get; }

  public static Vector2 Pi { get; }

  public static Vector2 PositiveInfinity { get; }

  public static Vector2 Tau { get; }

  public static Vector2 UnitX { get; }

  public static Vector2 UnitY { get; }

  public static Vector2 Zero { get; }

  public float this[int index] { get; set; }

  public Vector2()
  public Vector2(float value)
  public Vector2(float x, float y)
  public Vector2(ReadOnlySpan<float> values)

  public static Vector2 operator +(Vector2 left, Vector2 right)

  public static Vector2 operator /(Vector2 left, Vector2 right)
  public static Vector2 operator /(Vector2 value1, float value2)

  public static bool operator ==(Vector2 left, Vector2 right)

  public static bool operator !=(Vector2 left, Vector2 right)

  public static Vector2 operator *(Vector2 left, Vector2 right)
  public static Vector2 operator *(Vector2 left, float right)
  public static Vector2 operator *(float left, Vector2 right)

  public static Vector2 operator -(Vector2 left, Vector2 right)

  public static Vector2 operator -(Vector2 value)

  public static Vector2 operator &(Vector2 left, Vector2 right)

  public static Vector2 operator |(Vector2 left, Vector2 right)

  public static Vector2 operator ^(Vector2 left, Vector2 right)

  public static Vector2 operator <<(Vector2 value, int shiftAmount)

  public static Vector2 operator ~(Vector2 value)

  public static Vector2 operator >>(Vector2 value, int shiftAmount)

  public static Vector2 operator +(Vector2 value)

  public static Vector2 operator >>>(Vector2 value, int shiftAmount)

  public static Vector2 Abs(Vector2 value)

  public static Vector2 Add(Vector2 left, Vector2 right)

  public static bool All(Vector2 vector, float value)

  public static bool AllWhereAllBitsSet(Vector2 vector)

  public static Vector2 AndNot(Vector2 left, Vector2 right)

  public static bool Any(Vector2 vector, float value)

  public static bool AnyWhereAllBitsSet(Vector2 vector)

  public static Vector2 BitwiseAnd(Vector2 left, Vector2 right)

  public static Vector2 BitwiseOr(Vector2 left, Vector2 right)

  public static Vector2 Clamp(Vector2 value1, Vector2 min, Vector2 max)

  public static Vector2 ClampNative(Vector2 value1, Vector2 min, Vector2 max)

  public static Vector2 ConditionalSelect(Vector2 condition, Vector2 left, Vector2 right)

  public static Vector2 CopySign(Vector2 value, Vector2 sign)

  public static Vector2 Cos(Vector2 vector)

  public static int Count(Vector2 vector, float value)

  public static int CountWhereAllBitsSet(Vector2 vector)

  public static Vector2 Create(float value)
  public static Vector2 Create(float x, float y)
  public static Vector2 Create(ReadOnlySpan<float> values)

  public static Vector2 CreateScalar(float x)

  public static Vector2 CreateScalarUnsafe(float x)

  public static float Cross(Vector2 value1, Vector2 value2)

  public static Vector2 DegreesToRadians(Vector2 degrees)

  public static float Distance(Vector2 value1, Vector2 value2)

  public static float DistanceSquared(Vector2 value1, Vector2 value2)

  public static Vector2 Divide(Vector2 left, Vector2 right)
  public static Vector2 Divide(Vector2 left, float divisor)

  public static float Dot(Vector2 value1, Vector2 value2)

  public static Vector2 Exp(Vector2 vector)

  public static Vector2 Equals(Vector2 left, Vector2 right)
  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Vector2 other)

  public static bool EqualsAll(Vector2 left, Vector2 right)

  public static bool EqualsAny(Vector2 left, Vector2 right)

  public static Vector2 FusedMultiplyAdd(Vector2 left, Vector2 right, Vector2 addend)

  public static Vector2 GreaterThan(Vector2 left, Vector2 right)

  public static bool GreaterThanAll(Vector2 left, Vector2 right)

  public static bool GreaterThanAny(Vector2 left, Vector2 right)

  public static Vector2 GreaterThanOrEqual(Vector2 left, Vector2 right)

  public static bool GreaterThanOrEqualAll(Vector2 left, Vector2 right)

  public static bool GreaterThanOrEqualAny(Vector2 left, Vector2 right)

  public static Vector2 Hypot(Vector2 x, Vector2 y)

  public static int IndexOf(Vector2 vector, float value)

  public static int IndexOfWhereAllBitsSet(Vector2 vector)

  public static Vector2 IsEvenInteger(Vector2 vector)

  public static Vector2 IsFinite(Vector2 vector)

  public static Vector2 IsInfinity(Vector2 vector)

  public static Vector2 IsInteger(Vector2 vector)

  public static Vector2 IsNaN(Vector2 vector)

  public static Vector2 IsNegative(Vector2 vector)

  public static Vector2 IsNegativeInfinity(Vector2 vector)

  public static Vector2 IsNormal(Vector2 vector)

  public static Vector2 IsOddInteger(Vector2 vector)

  public static Vector2 IsPositive(Vector2 vector)

  public static Vector2 IsPositiveInfinity(Vector2 vector)

  public static Vector2 IsSubnormal(Vector2 vector)

  public static Vector2 IsZero(Vector2 vector)

  public static int LastIndexOf(Vector2 vector, float value)

  public static int LastIndexOfWhereAllBitsSet(Vector2 vector)

  public static Vector2 Lerp(Vector2 value1, Vector2 value2, float amount)
  public static Vector2 Lerp(Vector2 value1, Vector2 value2, Vector2 amount)

  public static Vector2 LessThan(Vector2 left, Vector2 right)

  public static bool LessThanAll(Vector2 left, Vector2 right)

  public static bool LessThanAny(Vector2 left, Vector2 right)

  public static Vector2 LessThanOrEqual(Vector2 left, Vector2 right)

  public static bool LessThanOrEqualAll(Vector2 left, Vector2 right)

  public static bool LessThanOrEqualAny(Vector2 left, Vector2 right)

  public static Vector2 Load(float* source)

  public static Vector2 LoadAligned(float* source)

  public static Vector2 LoadAlignedNonTemporal(float* source)

  public static Vector2 LoadUnsafe(ref readonly float source)
  public static Vector2 LoadUnsafe(ref readonly float source, nuint elementOffset)

  public static Vector2 Log(Vector2 vector)

  public static Vector2 Log2(Vector2 vector)

  public static Vector2 Max(Vector2 value1, Vector2 value2)

  public static Vector2 MaxMagnitude(Vector2 value1, Vector2 value2)

  public static Vector2 MaxMagnitudeNumber(Vector2 value1, Vector2 value2)

  public static Vector2 MaxNative(Vector2 value1, Vector2 value2)

  public static Vector2 MaxNumber(Vector2 value1, Vector2 value2)

  public static Vector2 Min(Vector2 value1, Vector2 value2)

  public static Vector2 MinMagnitude(Vector2 value1, Vector2 value2)

  public static Vector2 MinMagnitudeNumber(Vector2 value1, Vector2 value2)

  public static Vector2 MinNative(Vector2 value1, Vector2 value2)

  public static Vector2 MinNumber(Vector2 value1, Vector2 value2)

  public static Vector2 Multiply(Vector2 left, Vector2 right)
  public static Vector2 Multiply(Vector2 left, float right)
  public static Vector2 Multiply(float left, Vector2 right)

  public static Vector2 MultiplyAddEstimate(Vector2 left, Vector2 right, Vector2 addend)

  public static Vector2 Negate(Vector2 value)

  public static bool None(Vector2 vector, float value)

  public static bool NoneWhereAllBitsSet(Vector2 vector)

  public static Vector2 Normalize(Vector2 value)

  public static Vector2 OnesComplement(Vector2 value)

  public static Vector2 RadiansToDegrees(Vector2 radians)

  public static Vector2 Reflect(Vector2 vector, Vector2 normal)

  public static Vector2 Round(Vector2 vector)
  public static Vector2 Round(Vector2 vector, MidpointRounding mode)

  public static Vector2 Shuffle(Vector2 vector, byte xIndex, byte yIndex)

  public static Vector2 Sin(Vector2 vector)

  public static (Vector2 Sin, Vector2 Cos) SinCos(Vector2 vector)

  public static Vector2 SquareRoot(Vector2 value)

  public static Vector2 Subtract(Vector2 left, Vector2 right)

  public static float Sum(Vector2 value)

  public static Vector2 Transform(Vector2 position, Matrix3x2 matrix)
  public static Vector2 Transform(Vector2 position, Matrix4x4 matrix)
  public static Vector2 Transform(Vector2 value, Quaternion rotation)

  public static Vector2 TransformNormal(Vector2 normal, Matrix3x2 matrix)
  public static Vector2 TransformNormal(Vector2 normal, Matrix4x4 matrix)

  public static Vector2 Truncate(Vector2 vector)

  public static Vector2 Xor(Vector2 left, Vector2 right)

  public readonly void CopyTo(float[] array)
  public readonly void CopyTo(float[] array, int index)
  public readonly void CopyTo(Span<float> destination)

  public readonly bool TryCopyTo(Span<float> destination)

  public override readonly int GetHashCode()

  public readonly float Length()

  public readonly float LengthSquared()

  public override readonly string ToString()
  public readonly string ToString(string? format)
  public readonly string ToString(string? format, IFormatProvider? formatProvider)
