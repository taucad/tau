# PicoGK — Selected BCL reference — System.Numerics (4)

1 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
public struct Vector4

  public float X

  public float Y

  public float Z

  public float W

  public static Vector4 AllBitsSet { get; }

  public static Vector4 E { get; }

  public static Vector4 Epsilon { get; }

  public static Vector4 NaN { get; }

  public static Vector4 NegativeInfinity { get; }

  public static Vector4 NegativeZero { get; }

  public static Vector4 One { get; }

  public static Vector4 Pi { get; }

  public static Vector4 PositiveInfinity { get; }

  public static Vector4 Tau { get; }

  public static Vector4 UnitX { get; }

  public static Vector4 UnitY { get; }

  public static Vector4 UnitZ { get; }

  public static Vector4 UnitW { get; }

  public static Vector4 Zero { get; }

  public float this[int index] { get; set; }

  public Vector4()
  public Vector4(float value)
  public Vector4(Vector2 value, float z, float w)
  public Vector4(Vector3 value, float w)
  public Vector4(float x, float y, float z, float w)
  public Vector4(ReadOnlySpan<float> values)

  public static Vector4 operator +(Vector4 left, Vector4 right)

  public static Vector4 operator /(Vector4 left, Vector4 right)
  public static Vector4 operator /(Vector4 value1, float value2)

  public static bool operator ==(Vector4 left, Vector4 right)

  public static bool operator !=(Vector4 left, Vector4 right)

  public static Vector4 operator *(Vector4 left, Vector4 right)
  public static Vector4 operator *(Vector4 left, float right)
  public static Vector4 operator *(float left, Vector4 right)

  public static Vector4 operator -(Vector4 left, Vector4 right)

  public static Vector4 operator -(Vector4 value)

  public static Vector4 operator &(Vector4 left, Vector4 right)

  public static Vector4 operator |(Vector4 left, Vector4 right)

  public static Vector4 operator ^(Vector4 left, Vector4 right)

  public static Vector4 operator <<(Vector4 value, int shiftAmount)

  public static Vector4 operator ~(Vector4 value)

  public static Vector4 operator >>(Vector4 value, int shiftAmount)

  public static Vector4 operator +(Vector4 value)

  public static Vector4 operator >>>(Vector4 value, int shiftAmount)

  public static Vector4 Abs(Vector4 value)

  public static Vector4 Add(Vector4 left, Vector4 right)

  public static bool All(Vector4 vector, float value)

  public static bool AllWhereAllBitsSet(Vector4 vector)

  public static Vector4 AndNot(Vector4 left, Vector4 right)

  public static bool Any(Vector4 vector, float value)

  public static bool AnyWhereAllBitsSet(Vector4 vector)

  public static Vector4 BitwiseAnd(Vector4 left, Vector4 right)

  public static Vector4 BitwiseOr(Vector4 left, Vector4 right)

  public static Vector4 Clamp(Vector4 value1, Vector4 min, Vector4 max)

  public static Vector4 ClampNative(Vector4 value1, Vector4 min, Vector4 max)

  public static Vector4 ConditionalSelect(Vector4 condition, Vector4 left, Vector4 right)

  public static Vector4 CopySign(Vector4 value, Vector4 sign)

  public static Vector4 Cos(Vector4 vector)

  public static int Count(Vector4 vector, float value)

  public static int CountWhereAllBitsSet(Vector4 vector)

  public static Vector4 Create(float value)
  public static Vector4 Create(Vector2 vector, float z, float w)
  public static Vector4 Create(Vector3 vector, float w)
  public static Vector4 Create(float x, float y, float z, float w)
  public static Vector4 Create(ReadOnlySpan<float> values)

  public static Vector4 CreateScalar(float x)

  public static Vector4 CreateScalarUnsafe(float x)

  public static Vector4 Cross(Vector4 vector1, Vector4 vector2)

  public static Vector4 DegreesToRadians(Vector4 degrees)

  public static float Distance(Vector4 value1, Vector4 value2)

  public static float DistanceSquared(Vector4 value1, Vector4 value2)

  public static Vector4 Divide(Vector4 left, Vector4 right)
  public static Vector4 Divide(Vector4 left, float divisor)

  public static float Dot(Vector4 vector1, Vector4 vector2)

  public static Vector4 Exp(Vector4 vector)

  public static Vector4 Equals(Vector4 left, Vector4 right)
  public readonly bool Equals(Vector4 other)
  public override readonly bool Equals(object? obj)

  public static bool EqualsAll(Vector4 left, Vector4 right)

  public static bool EqualsAny(Vector4 left, Vector4 right)

  public static Vector4 FusedMultiplyAdd(Vector4 left, Vector4 right, Vector4 addend)

  public static Vector4 GreaterThan(Vector4 left, Vector4 right)

  public static bool GreaterThanAll(Vector4 left, Vector4 right)

  public static bool GreaterThanAny(Vector4 left, Vector4 right)

  public static Vector4 GreaterThanOrEqual(Vector4 left, Vector4 right)

  public static bool GreaterThanOrEqualAll(Vector4 left, Vector4 right)

  public static bool GreaterThanOrEqualAny(Vector4 left, Vector4 right)

  public static Vector4 Hypot(Vector4 x, Vector4 y)

  public static int IndexOf(Vector4 vector, float value)

  public static int IndexOfWhereAllBitsSet(Vector4 vector)

  public static Vector4 IsEvenInteger(Vector4 vector)

  public static Vector4 IsFinite(Vector4 vector)

  public static Vector4 IsInfinity(Vector4 vector)

  public static Vector4 IsInteger(Vector4 vector)

  public static Vector4 IsNaN(Vector4 vector)

  public static Vector4 IsNegative(Vector4 vector)

  public static Vector4 IsNegativeInfinity(Vector4 vector)

  public static Vector4 IsNormal(Vector4 vector)

  public static Vector4 IsOddInteger(Vector4 vector)

  public static Vector4 IsPositive(Vector4 vector)

  public static Vector4 IsPositiveInfinity(Vector4 vector)

  public static Vector4 IsSubnormal(Vector4 vector)

  public static Vector4 IsZero(Vector4 vector)

  public static int LastIndexOf(Vector4 vector, float value)

  public static int LastIndexOfWhereAllBitsSet(Vector4 vector)

  public static Vector4 Lerp(Vector4 value1, Vector4 value2, float amount)
  public static Vector4 Lerp(Vector4 value1, Vector4 value2, Vector4 amount)

  public static Vector4 LessThan(Vector4 left, Vector4 right)

  public static bool LessThanAll(Vector4 left, Vector4 right)

  public static bool LessThanAny(Vector4 left, Vector4 right)

  public static Vector4 LessThanOrEqual(Vector4 left, Vector4 right)

  public static bool LessThanOrEqualAll(Vector4 left, Vector4 right)

  public static bool LessThanOrEqualAny(Vector4 left, Vector4 right)

  public static Vector4 Load(float* source)

  public static Vector4 LoadAligned(float* source)

  public static Vector4 LoadAlignedNonTemporal(float* source)

  public static Vector4 LoadUnsafe(ref readonly float source)
  public static Vector4 LoadUnsafe(ref readonly float source, nuint elementOffset)

  public static Vector4 Log(Vector4 vector)

  public static Vector4 Log2(Vector4 vector)

  public static Vector4 Max(Vector4 value1, Vector4 value2)

  public static Vector4 MaxMagnitude(Vector4 value1, Vector4 value2)

  public static Vector4 MaxMagnitudeNumber(Vector4 value1, Vector4 value2)

  public static Vector4 MaxNative(Vector4 value1, Vector4 value2)

  public static Vector4 MaxNumber(Vector4 value1, Vector4 value2)

  public static Vector4 Min(Vector4 value1, Vector4 value2)

  public static Vector4 MinMagnitude(Vector4 value1, Vector4 value2)

  public static Vector4 MinMagnitudeNumber(Vector4 value1, Vector4 value2)

  public static Vector4 MinNative(Vector4 value1, Vector4 value2)

  public static Vector4 MinNumber(Vector4 value1, Vector4 value2)

  public static Vector4 Multiply(Vector4 left, Vector4 right)
  public static Vector4 Multiply(Vector4 left, float right)
  public static Vector4 Multiply(float left, Vector4 right)

  public static Vector4 MultiplyAddEstimate(Vector4 left, Vector4 right, Vector4 addend)

  public static Vector4 Negate(Vector4 value)

  public static bool None(Vector4 vector, float value)

  public static bool NoneWhereAllBitsSet(Vector4 vector)

  public static Vector4 Normalize(Vector4 vector)

  public static Vector4 OnesComplement(Vector4 value)

  public static Vector4 RadiansToDegrees(Vector4 radians)

  public static Vector4 Round(Vector4 vector)
  public static Vector4 Round(Vector4 vector, MidpointRounding mode)

  public static Vector4 Shuffle(Vector4 vector, byte xIndex, byte yIndex, byte zIndex, byte wIndex)

  public static Vector4 Sin(Vector4 vector)

  public static (Vector4 Sin, Vector4 Cos) SinCos(Vector4 vector)

  public static Vector4 SquareRoot(Vector4 value)

  public static Vector4 Subtract(Vector4 left, Vector4 right)

  public static float Sum(Vector4 value)

  public static Vector4 Transform(Vector2 position, Matrix4x4 matrix)
  public static Vector4 Transform(Vector2 value, Quaternion rotation)
  public static Vector4 Transform(Vector3 position, Matrix4x4 matrix)
  public static Vector4 Transform(Vector3 value, Quaternion rotation)
  public static Vector4 Transform(Vector4 vector, Matrix4x4 matrix)
  public static Vector4 Transform(Vector4 value, Quaternion rotation)

  public static Vector4 Truncate(Vector4 vector)

  public static Vector4 Xor(Vector4 left, Vector4 right)

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
