# PicoGK — Selected BCL reference — System.Numerics (3)

1 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
public struct Vector3

  public float X

  public float Y

  public float Z

  public static Vector3 AllBitsSet { get; }

  public static Vector3 E { get; }

  public static Vector3 Epsilon { get; }

  public static Vector3 NaN { get; }

  public static Vector3 NegativeInfinity { get; }

  public static Vector3 NegativeZero { get; }

  public static Vector3 One { get; }

  public static Vector3 Pi { get; }

  public static Vector3 PositiveInfinity { get; }

  public static Vector3 Tau { get; }

  public static Vector3 UnitX { get; }

  public static Vector3 UnitY { get; }

  public static Vector3 UnitZ { get; }

  public static Vector3 Zero { get; }

  public float this[int index] { get; set; }

  public Vector3()
  public Vector3(float value)
  public Vector3(Vector2 value, float z)
  public Vector3(float x, float y, float z)
  public Vector3(ReadOnlySpan<float> values)

  public static Vector3 operator +(Vector3 left, Vector3 right)

  public static Vector3 operator /(Vector3 left, Vector3 right)
  public static Vector3 operator /(Vector3 value1, float value2)

  public static bool operator ==(Vector3 left, Vector3 right)

  public static bool operator !=(Vector3 left, Vector3 right)

  public static Vector3 operator *(Vector3 left, Vector3 right)
  public static Vector3 operator *(Vector3 left, float right)
  public static Vector3 operator *(float left, Vector3 right)

  public static Vector3 operator -(Vector3 left, Vector3 right)

  public static Vector3 operator -(Vector3 value)

  public static Vector3 operator &(Vector3 left, Vector3 right)

  public static Vector3 operator |(Vector3 left, Vector3 right)

  public static Vector3 operator ^(Vector3 left, Vector3 right)

  public static Vector3 operator <<(Vector3 value, int shiftAmount)

  public static Vector3 operator ~(Vector3 value)

  public static Vector3 operator >>(Vector3 value, int shiftAmount)

  public static Vector3 operator +(Vector3 value)

  public static Vector3 operator >>>(Vector3 value, int shiftAmount)

  public static Vector3 Abs(Vector3 value)

  public static Vector3 Add(Vector3 left, Vector3 right)

  public static bool All(Vector3 vector, float value)

  public static bool AllWhereAllBitsSet(Vector3 vector)

  public static Vector3 AndNot(Vector3 left, Vector3 right)

  public static bool Any(Vector3 vector, float value)

  public static bool AnyWhereAllBitsSet(Vector3 vector)

  public static Vector3 BitwiseAnd(Vector3 left, Vector3 right)

  public static Vector3 BitwiseOr(Vector3 left, Vector3 right)

  public static Vector3 Clamp(Vector3 value1, Vector3 min, Vector3 max)

  public static Vector3 ClampNative(Vector3 value1, Vector3 min, Vector3 max)

  public static Vector3 ConditionalSelect(Vector3 condition, Vector3 left, Vector3 right)

  public static Vector3 CopySign(Vector3 value, Vector3 sign)

  public static Vector3 Cos(Vector3 vector)

  public static int Count(Vector3 vector, float value)

  public static int CountWhereAllBitsSet(Vector3 vector)

  public static Vector3 Create(float value)
  public static Vector3 Create(Vector2 vector, float z)
  public static Vector3 Create(float x, float y, float z)
  public static Vector3 Create(ReadOnlySpan<float> values)

  public static Vector3 CreateScalar(float x)

  public static Vector3 CreateScalarUnsafe(float x)

  public static Vector3 Cross(Vector3 vector1, Vector3 vector2)

  public static Vector3 DegreesToRadians(Vector3 degrees)

  public static float Distance(Vector3 value1, Vector3 value2)

  public static float DistanceSquared(Vector3 value1, Vector3 value2)

  public static Vector3 Divide(Vector3 left, Vector3 right)
  public static Vector3 Divide(Vector3 left, float divisor)

  public static float Dot(Vector3 vector1, Vector3 vector2)

  public static Vector3 Exp(Vector3 vector)

  public static Vector3 Equals(Vector3 left, Vector3 right)
  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Vector3 other)

  public static bool EqualsAll(Vector3 left, Vector3 right)

  public static bool EqualsAny(Vector3 left, Vector3 right)

  public static Vector3 FusedMultiplyAdd(Vector3 left, Vector3 right, Vector3 addend)

  public static Vector3 GreaterThan(Vector3 left, Vector3 right)

  public static bool GreaterThanAll(Vector3 left, Vector3 right)

  public static bool GreaterThanAny(Vector3 left, Vector3 right)

  public static Vector3 GreaterThanOrEqual(Vector3 left, Vector3 right)

  public static bool GreaterThanOrEqualAll(Vector3 left, Vector3 right)

  public static bool GreaterThanOrEqualAny(Vector3 left, Vector3 right)

  public static Vector3 Hypot(Vector3 x, Vector3 y)

  public static int IndexOf(Vector3 vector, float value)

  public static int IndexOfWhereAllBitsSet(Vector3 vector)

  public static Vector3 IsEvenInteger(Vector3 vector)

  public static Vector3 IsFinite(Vector3 vector)

  public static Vector3 IsInfinity(Vector3 vector)

  public static Vector3 IsInteger(Vector3 vector)

  public static Vector3 IsNaN(Vector3 vector)

  public static Vector3 IsNegative(Vector3 vector)

  public static Vector3 IsNegativeInfinity(Vector3 vector)

  public static Vector3 IsNormal(Vector3 vector)

  public static Vector3 IsOddInteger(Vector3 vector)

  public static Vector3 IsPositive(Vector3 vector)

  public static Vector3 IsPositiveInfinity(Vector3 vector)

  public static Vector3 IsSubnormal(Vector3 vector)

  public static Vector3 IsZero(Vector3 vector)

  public static int LastIndexOf(Vector3 vector, float value)

  public static int LastIndexOfWhereAllBitsSet(Vector3 vector)

  public static Vector3 Lerp(Vector3 value1, Vector3 value2, float amount)
  public static Vector3 Lerp(Vector3 value1, Vector3 value2, Vector3 amount)

  public static Vector3 LessThan(Vector3 left, Vector3 right)

  public static bool LessThanAll(Vector3 left, Vector3 right)

  public static bool LessThanAny(Vector3 left, Vector3 right)

  public static Vector3 LessThanOrEqual(Vector3 left, Vector3 right)

  public static bool LessThanOrEqualAll(Vector3 left, Vector3 right)

  public static bool LessThanOrEqualAny(Vector3 left, Vector3 right)

  public static Vector3 Load(float* source)

  public static Vector3 LoadAligned(float* source)

  public static Vector3 LoadAlignedNonTemporal(float* source)

  public static Vector3 LoadUnsafe(ref readonly float source)
  public static Vector3 LoadUnsafe(ref readonly float source, nuint elementOffset)

  public static Vector3 Log(Vector3 vector)

  public static Vector3 Log2(Vector3 vector)

  public static Vector3 Max(Vector3 value1, Vector3 value2)

  public static Vector3 MaxMagnitude(Vector3 value1, Vector3 value2)

  public static Vector3 MaxMagnitudeNumber(Vector3 value1, Vector3 value2)

  public static Vector3 MaxNative(Vector3 value1, Vector3 value2)

  public static Vector3 MaxNumber(Vector3 value1, Vector3 value2)

  public static Vector3 Min(Vector3 value1, Vector3 value2)

  public static Vector3 MinMagnitude(Vector3 value1, Vector3 value2)

  public static Vector3 MinMagnitudeNumber(Vector3 value1, Vector3 value2)

  public static Vector3 MinNative(Vector3 value1, Vector3 value2)

  public static Vector3 MinNumber(Vector3 value1, Vector3 value2)

  public static Vector3 Multiply(Vector3 left, Vector3 right)
  public static Vector3 Multiply(Vector3 left, float right)
  public static Vector3 Multiply(float left, Vector3 right)

  public static Vector3 MultiplyAddEstimate(Vector3 left, Vector3 right, Vector3 addend)

  public static Vector3 Negate(Vector3 value)

  public static bool None(Vector3 vector, float value)

  public static bool NoneWhereAllBitsSet(Vector3 vector)

  public static Vector3 Normalize(Vector3 value)

  public static Vector3 OnesComplement(Vector3 value)

  public static Vector3 RadiansToDegrees(Vector3 radians)

  public static Vector3 Reflect(Vector3 vector, Vector3 normal)

  public static Vector3 Round(Vector3 vector)
  public static Vector3 Round(Vector3 vector, MidpointRounding mode)

  public static Vector3 Shuffle(Vector3 vector, byte xIndex, byte yIndex, byte zIndex)

  public static Vector3 Sin(Vector3 vector)

  public static (Vector3 Sin, Vector3 Cos) SinCos(Vector3 vector)

  public static Vector3 SquareRoot(Vector3 value)

  public static Vector3 Subtract(Vector3 left, Vector3 right)

  public static float Sum(Vector3 value)

  public static Vector3 Transform(Vector3 position, Matrix4x4 matrix)
  public static Vector3 Transform(Vector3 value, Quaternion rotation)

  public static Vector3 TransformNormal(Vector3 normal, Matrix4x4 matrix)

  public static Vector3 Truncate(Vector3 vector)

  public static Vector3 Xor(Vector3 left, Vector3 right)

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
