# PicoGK — System.Numerics

5 top-level symbols. Signatures are verbatim csharp.

Matrix3x2

  M11: float

  M12: float

  M21: float

  M22: float

  M31: float

  M32: float

  Identity: Matrix3x2

  IsIdentity: bool

  Translation: Vector2

  X: Vector2

  Y: Vector2

  Z: Vector2

  this[]: Vector2

  this[]: float

  public Matrix3x2(float m11, float m12, float m21, float m22, float m31, float m32)

  public static Matrix3x2 operator +(Matrix3x2 value1, Matrix3x2 value2)

  public static bool operator ==(Matrix3x2 value1, Matrix3x2 value2)

  public static bool operator !=(Matrix3x2 value1, Matrix3x2 value2)

  public static Matrix3x2 operator *(Matrix3x2 value1, Matrix3x2 value2)
  public static Matrix3x2 operator *(Matrix3x2 value1, float value2)

  public static Matrix3x2 operator -(Matrix3x2 value1, Matrix3x2 value2)

  public static Matrix3x2 operator -(Matrix3x2 value)

  public static Matrix3x2 Add(Matrix3x2 value1, Matrix3x2 value2)

  public static Matrix3x2 Create(float value)
  public static Matrix3x2 Create(Vector2 value)
  public static Matrix3x2 Create(Vector2 x, Vector2 y, Vector2 z)
  public static Matrix3x2 Create(float m11, float m12, float m21, float m22, float m31, float m32)

  public static Matrix3x2 CreateRotation(float radians)
  public static Matrix3x2 CreateRotation(float radians, Vector2 centerPoint)

  public static Matrix3x2 CreateScale(Vector2 scales)
  public static Matrix3x2 CreateScale(float xScale, float yScale)
  public static Matrix3x2 CreateScale(float xScale, float yScale, Vector2 centerPoint)
  public static Matrix3x2 CreateScale(Vector2 scales, Vector2 centerPoint)
  public static Matrix3x2 CreateScale(float scale)
  public static Matrix3x2 CreateScale(float scale, Vector2 centerPoint)

  public static Matrix3x2 CreateSkew(float radiansX, float radiansY)
  public static Matrix3x2 CreateSkew(float radiansX, float radiansY, Vector2 centerPoint)

  public static Matrix3x2 CreateTranslation(Vector2 position)
  public static Matrix3x2 CreateTranslation(float xPosition, float yPosition)

  public static bool Invert(Matrix3x2 matrix, out Matrix3x2 result)

  public static Matrix3x2 Lerp(Matrix3x2 matrix1, Matrix3x2 matrix2, float amount)

  public static Matrix3x2 Multiply(Matrix3x2 value1, Matrix3x2 value2)
  public static Matrix3x2 Multiply(Matrix3x2 value1, float value2)

  public static Matrix3x2 Negate(Matrix3x2 value)

  public static Matrix3x2 Subtract(Matrix3x2 value1, Matrix3x2 value2)

  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Matrix3x2 other)

  public readonly float GetDeterminant()

  public readonly float GetElement(int row, int column)

  public readonly Vector2 GetRow(int index)

  public override readonly int GetHashCode()

  public override readonly string ToString()

  public readonly Matrix3x2 WithElement(int row, int column, float value)

  public readonly Matrix3x2 WithRow(int index, Vector2 value)

Matrix4x4

  M11: float

  M12: float

  M13: float

  M14: float

  M21: float

  M22: float

  M23: float

  M24: float

  M31: float

  M32: float

  M33: float

  M34: float

  M41: float

  M42: float

  M43: float

  M44: float

  Identity: Matrix4x4

  IsIdentity: bool

  Translation: Vector3

  X: Vector4

  Y: Vector4

  Z: Vector4

  W: Vector4

  this[]: Vector4

  this[]: float

  public Matrix4x4(float m11, float m12, float m13, float m14, float m21, float m22, float m23, float m24, float m31, float m32, float m33, float m34, float m41, float m42, float m43, float m44)
  public Matrix4x4(Matrix3x2 value)

  public static Matrix4x4 operator +(Matrix4x4 value1, Matrix4x4 value2)

  public static bool operator ==(Matrix4x4 value1, Matrix4x4 value2)

  public static bool operator !=(Matrix4x4 value1, Matrix4x4 value2)

  public static Matrix4x4 operator *(Matrix4x4 value1, Matrix4x4 value2)
  public static Matrix4x4 operator *(Matrix4x4 value1, float value2)

  public static Matrix4x4 operator -(Matrix4x4 value1, Matrix4x4 value2)

  public static Matrix4x4 operator -(Matrix4x4 value)

  public static Matrix4x4 Add(Matrix4x4 value1, Matrix4x4 value2)

  public static Matrix4x4 Create(float value)
  public static Matrix4x4 Create(Matrix3x2 value)
  public static Matrix4x4 Create(Vector4 value)
  public static Matrix4x4 Create(Vector4 x, Vector4 y, Vector4 z, Vector4 w)
  public static Matrix4x4 Create(float m11, float m12, float m13, float m14, float m21, float m22, float m23, float m24, float m31, float m32, float m33, float m34, float m41, float m42, float m43, float m44)

  public static Matrix4x4 CreateBillboard(Vector3 objectPosition, Vector3 cameraPosition, Vector3 cameraUpVector, Vector3 cameraForwardVector)

  public static Matrix4x4 CreateBillboardLeftHanded(Vector3 objectPosition, Vector3 cameraPosition, Vector3 cameraUpVector, Vector3 cameraForwardVector)

  public static Matrix4x4 CreateConstrainedBillboard(Vector3 objectPosition, Vector3 cameraPosition, Vector3 rotateAxis, Vector3 cameraForwardVector, Vector3 objectForwardVector)

  public static Matrix4x4 CreateConstrainedBillboardLeftHanded(Vector3 objectPosition, Vector3 cameraPosition, Vector3 rotateAxis, Vector3 cameraForwardVector, Vector3 objectForwardVector)

  public static Matrix4x4 CreateFromAxisAngle(Vector3 axis, float angle)

  public static Matrix4x4 CreateFromQuaternion(Quaternion quaternion)

  public static Matrix4x4 CreateFromYawPitchRoll(float yaw, float pitch, float roll)

  public static Matrix4x4 CreateLookAt(Vector3 cameraPosition, Vector3 cameraTarget, Vector3 cameraUpVector)

  public static Matrix4x4 CreateLookAtLeftHanded(Vector3 cameraPosition, Vector3 cameraTarget, Vector3 cameraUpVector)

  public static Matrix4x4 CreateLookTo(Vector3 cameraPosition, Vector3 cameraDirection, Vector3 cameraUpVector)

  public static Matrix4x4 CreateLookToLeftHanded(Vector3 cameraPosition, Vector3 cameraDirection, Vector3 cameraUpVector)

  public static Matrix4x4 CreateOrthographic(float width, float height, float zNearPlane, float zFarPlane)

  public static Matrix4x4 CreateOrthographicLeftHanded(float width, float height, float zNearPlane, float zFarPlane)

  public static Matrix4x4 CreateOrthographicOffCenter(float left, float right, float bottom, float top, float zNearPlane, float zFarPlane)

  public static Matrix4x4 CreateOrthographicOffCenterLeftHanded(float left, float right, float bottom, float top, float zNearPlane, float zFarPlane)

  public static Matrix4x4 CreatePerspective(float width, float height, float nearPlaneDistance, float farPlaneDistance)

  public static Matrix4x4 CreatePerspectiveLeftHanded(float width, float height, float nearPlaneDistance, float farPlaneDistance)

  public static Matrix4x4 CreatePerspectiveFieldOfView(float fieldOfView, float aspectRatio, float nearPlaneDistance, float farPlaneDistance)

  public static Matrix4x4 CreatePerspectiveFieldOfViewLeftHanded(float fieldOfView, float aspectRatio, float nearPlaneDistance, float farPlaneDistance)

  public static Matrix4x4 CreatePerspectiveOffCenter(float left, float right, float bottom, float top, float nearPlaneDistance, float farPlaneDistance)

  public static Matrix4x4 CreatePerspectiveOffCenterLeftHanded(float left, float right, float bottom, float top, float nearPlaneDistance, float farPlaneDistance)

  public static Matrix4x4 CreateReflection(Plane value)

  public static Matrix4x4 CreateRotationX(float radians)
  public static Matrix4x4 CreateRotationX(float radians, Vector3 centerPoint)

  public static Matrix4x4 CreateRotationY(float radians)
  public static Matrix4x4 CreateRotationY(float radians, Vector3 centerPoint)

  public static Matrix4x4 CreateRotationZ(float radians)
  public static Matrix4x4 CreateRotationZ(float radians, Vector3 centerPoint)

  public static Matrix4x4 CreateScale(float xScale, float yScale, float zScale)
  public static Matrix4x4 CreateScale(float xScale, float yScale, float zScale, Vector3 centerPoint)
  public static Matrix4x4 CreateScale(Vector3 scales)
  public static Matrix4x4 CreateScale(Vector3 scales, Vector3 centerPoint)
  public static Matrix4x4 CreateScale(float scale)
  public static Matrix4x4 CreateScale(float scale, Vector3 centerPoint)

  public static Matrix4x4 CreateShadow(Vector3 lightDirection, Plane plane)

  public static Matrix4x4 CreateTranslation(Vector3 position)
  public static Matrix4x4 CreateTranslation(float xPosition, float yPosition, float zPosition)

  public static Matrix4x4 CreateViewport(float x, float y, float width, float height, float minDepth, float maxDepth)

  public static Matrix4x4 CreateViewportLeftHanded(float x, float y, float width, float height, float minDepth, float maxDepth)

  public static Matrix4x4 CreateWorld(Vector3 position, Vector3 forward, Vector3 up)

  public static bool Decompose(Matrix4x4 matrix, out Vector3 scale, out Quaternion rotation, out Vector3 translation)

  public static bool Invert(Matrix4x4 matrix, out Matrix4x4 result)

  public static Matrix4x4 Lerp(Matrix4x4 matrix1, Matrix4x4 matrix2, float amount)

  public static Matrix4x4 Multiply(Matrix4x4 value1, Matrix4x4 value2)
  public static Matrix4x4 Multiply(Matrix4x4 value1, float value2)

  public static Matrix4x4 Negate(Matrix4x4 value)

  public static Matrix4x4 Subtract(Matrix4x4 value1, Matrix4x4 value2)

  public static Matrix4x4 Transform(Matrix4x4 value, Quaternion rotation)

  public static Matrix4x4 Transpose(Matrix4x4 matrix)

  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Matrix4x4 other)

  public readonly float GetDeterminant()

  public readonly float GetElement(int row, int column)

  public readonly Vector4 GetRow(int index)

  public override readonly int GetHashCode()

  public override readonly string ToString()

  public readonly Matrix4x4 WithElement(int row, int column, float value)

  public readonly Matrix4x4 WithRow(int index, Vector4 value)

Plane

  Normal: Vector3

  D: float

  public Plane(float x, float y, float z, float d)
  public Plane(Vector3 normal, float d)
  public Plane(Vector4 value)

  public static Plane Create(Vector4 value)
  public static Plane Create(Vector3 normal, float d)
  public static Plane Create(float x, float y, float z, float d)

  public static Plane CreateFromVertices(Vector3 point1, Vector3 point2, Vector3 point3)

  public static float Dot(Plane plane, Vector4 value)

  public static float DotCoordinate(Plane plane, Vector3 value)

  public static float DotNormal(Plane plane, Vector3 value)

  public static Plane Normalize(Plane value)

  public static Plane Transform(Plane plane, Matrix4x4 matrix)
  public static Plane Transform(Plane plane, Quaternion rotation)

  public static bool operator ==(Plane value1, Plane value2)

  public static bool operator !=(Plane value1, Plane value2)

  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Plane other)

  public override readonly int GetHashCode()

  public override readonly string ToString()

Quaternion

  X: float

  Y: float

  Z: float

  W: float

  Zero: Quaternion

  Identity: Quaternion

  this[]: float

  IsIdentity: bool

  public Quaternion(float x, float y, float z, float w)
  public Quaternion(Vector3 vectorPart, float scalarPart)

  public static Quaternion operator +(Quaternion value1, Quaternion value2)

  public static Quaternion operator /(Quaternion value1, Quaternion value2)

  public static bool operator ==(Quaternion value1, Quaternion value2)

  public static bool operator !=(Quaternion value1, Quaternion value2)

  public static Quaternion operator *(Quaternion value1, Quaternion value2)
  public static Quaternion operator *(Quaternion value1, float value2)

  public static Quaternion operator -(Quaternion value1, Quaternion value2)

  public static Quaternion operator -(Quaternion value)

  public static Quaternion Add(Quaternion value1, Quaternion value2)

  public static Quaternion Concatenate(Quaternion value1, Quaternion value2)

  public static Quaternion Conjugate(Quaternion value)

  public static Quaternion Create(float x, float y, float z, float w)
  public static Quaternion Create(Vector3 vectorPart, float scalarPart)

  public static Quaternion CreateFromAxisAngle(Vector3 axis, float angle)

  public static Quaternion CreateFromRotationMatrix(Matrix4x4 matrix)

  public static Quaternion CreateFromYawPitchRoll(float yaw, float pitch, float roll)

  public static Quaternion Divide(Quaternion value1, Quaternion value2)

  public static float Dot(Quaternion quaternion1, Quaternion quaternion2)

  public static Quaternion Inverse(Quaternion value)

  public static Quaternion Lerp(Quaternion quaternion1, Quaternion quaternion2, float amount)

  public static Quaternion Multiply(Quaternion value1, Quaternion value2)
  public static Quaternion Multiply(Quaternion value1, float value2)

  public static Quaternion Negate(Quaternion value)

  public static Quaternion Normalize(Quaternion value)

  public static Quaternion Slerp(Quaternion quaternion1, Quaternion quaternion2, float amount)

  public static Quaternion Subtract(Quaternion value1, Quaternion value2)

  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Quaternion other)

  public override readonly int GetHashCode()

  public readonly float Length()

  public readonly float LengthSquared()

  public override readonly string ToString()

Vector2

  X: float

  Y: float

  AllBitsSet: Vector2

  E: Vector2

  Epsilon: Vector2

  NaN: Vector2

  NegativeInfinity: Vector2

  NegativeZero: Vector2

  One: Vector2

  Pi: Vector2

  PositiveInfinity: Vector2

  Tau: Vector2

  UnitX: Vector2

  UnitY: Vector2

  Zero: Vector2

  this[]: float

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
