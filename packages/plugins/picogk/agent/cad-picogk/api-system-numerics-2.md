# PicoGK — System.Numerics (2)

2 top-level symbols. Signatures are verbatim csharp.

Vector3

  X: float

  Y: float

  Z: float

  AllBitsSet: Vector3

  E: Vector3

  Epsilon: Vector3

  NaN: Vector3

  NegativeInfinity: Vector3

  NegativeZero: Vector3

  One: Vector3

  Pi: Vector3

  PositiveInfinity: Vector3

  Tau: Vector3

  UnitX: Vector3

  UnitY: Vector3

  UnitZ: Vector3

  Zero: Vector3

  this[]: float

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

Vector4

  X: float

  Y: float

  Z: float

  W: float

  AllBitsSet: Vector4

  E: Vector4

  Epsilon: Vector4

  NaN: Vector4

  NegativeInfinity: Vector4

  NegativeZero: Vector4

  One: Vector4

  Pi: Vector4

  PositiveInfinity: Vector4

  Tau: Vector4

  UnitX: Vector4

  UnitY: Vector4

  UnitZ: Vector4

  UnitW: Vector4

  Zero: Vector4

  this[]: float

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
