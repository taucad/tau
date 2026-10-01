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

  // System.Numerics.Vector3.Vector3 (constructor)
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

  // System.Numerics.Vector4.Vector4 (constructor)
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
