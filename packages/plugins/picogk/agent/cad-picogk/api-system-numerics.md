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

  // System.Numerics.Matrix3x2.Matrix3x2 (constructor)
  public Matrix3x2(float m11, float m12, float m21, float m22, float m31, float m32)

  // System.Numerics.Matrix3x2.op_Addition (method)
  public static Matrix3x2 operator +(Matrix3x2 value1, Matrix3x2 value2)

  // System.Numerics.Matrix3x2.op_Equality (method)
  public static bool operator ==(Matrix3x2 value1, Matrix3x2 value2)

  // System.Numerics.Matrix3x2.op_Inequality (method)
  public static bool operator !=(Matrix3x2 value1, Matrix3x2 value2)

  // System.Numerics.Matrix3x2.op_Multiply (method)
  public static Matrix3x2 operator *(Matrix3x2 value1, Matrix3x2 value2)
  public static Matrix3x2 operator *(Matrix3x2 value1, float value2)

  // System.Numerics.Matrix3x2.op_Subtraction (method)
  public static Matrix3x2 operator -(Matrix3x2 value1, Matrix3x2 value2)

  // System.Numerics.Matrix3x2.op_UnaryNegation (method)
  public static Matrix3x2 operator -(Matrix3x2 value)

  // System.Numerics.Matrix3x2.Add (method)
  public static Matrix3x2 Add(Matrix3x2 value1, Matrix3x2 value2)

  // System.Numerics.Matrix3x2.Create (method)
  public static Matrix3x2 Create(float value)
  public static Matrix3x2 Create(Vector2 value)
  public static Matrix3x2 Create(Vector2 x, Vector2 y, Vector2 z)
  public static Matrix3x2 Create(float m11, float m12, float m21, float m22, float m31, float m32)

  // System.Numerics.Matrix3x2.CreateRotation (method)
  public static Matrix3x2 CreateRotation(float radians)
  public static Matrix3x2 CreateRotation(float radians, Vector2 centerPoint)

  // System.Numerics.Matrix3x2.CreateScale (method)
  public static Matrix3x2 CreateScale(Vector2 scales)
  public static Matrix3x2 CreateScale(float xScale, float yScale)
  public static Matrix3x2 CreateScale(float xScale, float yScale, Vector2 centerPoint)
  public static Matrix3x2 CreateScale(Vector2 scales, Vector2 centerPoint)
  public static Matrix3x2 CreateScale(float scale)
  public static Matrix3x2 CreateScale(float scale, Vector2 centerPoint)

  // System.Numerics.Matrix3x2.CreateSkew (method)
  public static Matrix3x2 CreateSkew(float radiansX, float radiansY)
  public static Matrix3x2 CreateSkew(float radiansX, float radiansY, Vector2 centerPoint)

  // System.Numerics.Matrix3x2.CreateTranslation (method)
  public static Matrix3x2 CreateTranslation(Vector2 position)
  public static Matrix3x2 CreateTranslation(float xPosition, float yPosition)

  // System.Numerics.Matrix3x2.Invert (method)
  public static bool Invert(Matrix3x2 matrix, out Matrix3x2 result)

  // System.Numerics.Matrix3x2.Lerp (method)
  public static Matrix3x2 Lerp(Matrix3x2 matrix1, Matrix3x2 matrix2, float amount)

  // System.Numerics.Matrix3x2.Multiply (method)
  public static Matrix3x2 Multiply(Matrix3x2 value1, Matrix3x2 value2)
  public static Matrix3x2 Multiply(Matrix3x2 value1, float value2)

  // System.Numerics.Matrix3x2.Negate (method)
  public static Matrix3x2 Negate(Matrix3x2 value)

  // System.Numerics.Matrix3x2.Subtract (method)
  public static Matrix3x2 Subtract(Matrix3x2 value1, Matrix3x2 value2)

  // System.Numerics.Matrix3x2.Equals (method)
  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Matrix3x2 other)

  // System.Numerics.Matrix3x2.GetDeterminant (method)
  public readonly float GetDeterminant()

  // System.Numerics.Matrix3x2.GetElement (method)
  public readonly float GetElement(int row, int column)

  // System.Numerics.Matrix3x2.GetRow (method)
  public readonly Vector2 GetRow(int index)

  // System.Numerics.Matrix3x2.GetHashCode (method)
  public override readonly int GetHashCode()

  // System.Numerics.Matrix3x2.ToString (method)
  public override readonly string ToString()

  // System.Numerics.Matrix3x2.WithElement (method)
  public readonly Matrix3x2 WithElement(int row, int column, float value)

  // System.Numerics.Matrix3x2.WithRow (method)
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

  // System.Numerics.Matrix4x4.Matrix4x4 (constructor)
  public Matrix4x4(float m11, float m12, float m13, float m14, float m21, float m22, float m23, float m24, float m31, float m32, float m33, float m34, float m41, float m42, float m43, float m44)
  public Matrix4x4(Matrix3x2 value)

  // System.Numerics.Matrix4x4.op_Addition (method)
  public static Matrix4x4 operator +(Matrix4x4 value1, Matrix4x4 value2)

  // System.Numerics.Matrix4x4.op_Equality (method)
  public static bool operator ==(Matrix4x4 value1, Matrix4x4 value2)

  // System.Numerics.Matrix4x4.op_Inequality (method)
  public static bool operator !=(Matrix4x4 value1, Matrix4x4 value2)

  // System.Numerics.Matrix4x4.op_Multiply (method)
  public static Matrix4x4 operator *(Matrix4x4 value1, Matrix4x4 value2)
  public static Matrix4x4 operator *(Matrix4x4 value1, float value2)

  // System.Numerics.Matrix4x4.op_Subtraction (method)
  public static Matrix4x4 operator -(Matrix4x4 value1, Matrix4x4 value2)

  // System.Numerics.Matrix4x4.op_UnaryNegation (method)
  public static Matrix4x4 operator -(Matrix4x4 value)

  // System.Numerics.Matrix4x4.Add (method)
  public static Matrix4x4 Add(Matrix4x4 value1, Matrix4x4 value2)

  // System.Numerics.Matrix4x4.Create (method)
  public static Matrix4x4 Create(float value)
  public static Matrix4x4 Create(Matrix3x2 value)
  public static Matrix4x4 Create(Vector4 value)
  public static Matrix4x4 Create(Vector4 x, Vector4 y, Vector4 z, Vector4 w)
  public static Matrix4x4 Create(float m11, float m12, float m13, float m14, float m21, float m22, float m23, float m24, float m31, float m32, float m33, float m34, float m41, float m42, float m43, float m44)

  // System.Numerics.Matrix4x4.CreateBillboard (method)
  public static Matrix4x4 CreateBillboard(Vector3 objectPosition, Vector3 cameraPosition, Vector3 cameraUpVector, Vector3 cameraForwardVector)

  // System.Numerics.Matrix4x4.CreateBillboardLeftHanded (method)
  public static Matrix4x4 CreateBillboardLeftHanded(Vector3 objectPosition, Vector3 cameraPosition, Vector3 cameraUpVector, Vector3 cameraForwardVector)

  // System.Numerics.Matrix4x4.CreateConstrainedBillboard (method)
  public static Matrix4x4 CreateConstrainedBillboard(Vector3 objectPosition, Vector3 cameraPosition, Vector3 rotateAxis, Vector3 cameraForwardVector, Vector3 objectForwardVector)

  // System.Numerics.Matrix4x4.CreateConstrainedBillboardLeftHanded (method)
  public static Matrix4x4 CreateConstrainedBillboardLeftHanded(Vector3 objectPosition, Vector3 cameraPosition, Vector3 rotateAxis, Vector3 cameraForwardVector, Vector3 objectForwardVector)

  // System.Numerics.Matrix4x4.CreateFromAxisAngle (method)
  public static Matrix4x4 CreateFromAxisAngle(Vector3 axis, float angle)

  // System.Numerics.Matrix4x4.CreateFromQuaternion (method)
  public static Matrix4x4 CreateFromQuaternion(Quaternion quaternion)

  // System.Numerics.Matrix4x4.CreateFromYawPitchRoll (method)
  public static Matrix4x4 CreateFromYawPitchRoll(float yaw, float pitch, float roll)

  // System.Numerics.Matrix4x4.CreateLookAt (method)
  public static Matrix4x4 CreateLookAt(Vector3 cameraPosition, Vector3 cameraTarget, Vector3 cameraUpVector)

  // System.Numerics.Matrix4x4.CreateLookAtLeftHanded (method)
  public static Matrix4x4 CreateLookAtLeftHanded(Vector3 cameraPosition, Vector3 cameraTarget, Vector3 cameraUpVector)

  // System.Numerics.Matrix4x4.CreateLookTo (method)
  public static Matrix4x4 CreateLookTo(Vector3 cameraPosition, Vector3 cameraDirection, Vector3 cameraUpVector)

  // System.Numerics.Matrix4x4.CreateLookToLeftHanded (method)
  public static Matrix4x4 CreateLookToLeftHanded(Vector3 cameraPosition, Vector3 cameraDirection, Vector3 cameraUpVector)

  // System.Numerics.Matrix4x4.CreateOrthographic (method)
  public static Matrix4x4 CreateOrthographic(float width, float height, float zNearPlane, float zFarPlane)

  // System.Numerics.Matrix4x4.CreateOrthographicLeftHanded (method)
  public static Matrix4x4 CreateOrthographicLeftHanded(float width, float height, float zNearPlane, float zFarPlane)

  // System.Numerics.Matrix4x4.CreateOrthographicOffCenter (method)
  public static Matrix4x4 CreateOrthographicOffCenter(float left, float right, float bottom, float top, float zNearPlane, float zFarPlane)

  // System.Numerics.Matrix4x4.CreateOrthographicOffCenterLeftHanded (method)
  public static Matrix4x4 CreateOrthographicOffCenterLeftHanded(float left, float right, float bottom, float top, float zNearPlane, float zFarPlane)

  // System.Numerics.Matrix4x4.CreatePerspective (method)
  public static Matrix4x4 CreatePerspective(float width, float height, float nearPlaneDistance, float farPlaneDistance)

  // System.Numerics.Matrix4x4.CreatePerspectiveLeftHanded (method)
  public static Matrix4x4 CreatePerspectiveLeftHanded(float width, float height, float nearPlaneDistance, float farPlaneDistance)

  // System.Numerics.Matrix4x4.CreatePerspectiveFieldOfView (method)
  public static Matrix4x4 CreatePerspectiveFieldOfView(float fieldOfView, float aspectRatio, float nearPlaneDistance, float farPlaneDistance)

  // System.Numerics.Matrix4x4.CreatePerspectiveFieldOfViewLeftHanded (method)
  public static Matrix4x4 CreatePerspectiveFieldOfViewLeftHanded(float fieldOfView, float aspectRatio, float nearPlaneDistance, float farPlaneDistance)

  // System.Numerics.Matrix4x4.CreatePerspectiveOffCenter (method)
  public static Matrix4x4 CreatePerspectiveOffCenter(float left, float right, float bottom, float top, float nearPlaneDistance, float farPlaneDistance)

  // System.Numerics.Matrix4x4.CreatePerspectiveOffCenterLeftHanded (method)
  public static Matrix4x4 CreatePerspectiveOffCenterLeftHanded(float left, float right, float bottom, float top, float nearPlaneDistance, float farPlaneDistance)

  // System.Numerics.Matrix4x4.CreateReflection (method)
  public static Matrix4x4 CreateReflection(Plane value)

  // System.Numerics.Matrix4x4.CreateRotationX (method)
  public static Matrix4x4 CreateRotationX(float radians)
  public static Matrix4x4 CreateRotationX(float radians, Vector3 centerPoint)

  // System.Numerics.Matrix4x4.CreateRotationY (method)
  public static Matrix4x4 CreateRotationY(float radians)
  public static Matrix4x4 CreateRotationY(float radians, Vector3 centerPoint)

  // System.Numerics.Matrix4x4.CreateRotationZ (method)
  public static Matrix4x4 CreateRotationZ(float radians)
  public static Matrix4x4 CreateRotationZ(float radians, Vector3 centerPoint)

  // System.Numerics.Matrix4x4.CreateScale (method)
  public static Matrix4x4 CreateScale(float xScale, float yScale, float zScale)
  public static Matrix4x4 CreateScale(float xScale, float yScale, float zScale, Vector3 centerPoint)
  public static Matrix4x4 CreateScale(Vector3 scales)
  public static Matrix4x4 CreateScale(Vector3 scales, Vector3 centerPoint)
  public static Matrix4x4 CreateScale(float scale)
  public static Matrix4x4 CreateScale(float scale, Vector3 centerPoint)

  // System.Numerics.Matrix4x4.CreateShadow (method)
  public static Matrix4x4 CreateShadow(Vector3 lightDirection, Plane plane)

  // System.Numerics.Matrix4x4.CreateTranslation (method)
  public static Matrix4x4 CreateTranslation(Vector3 position)
  public static Matrix4x4 CreateTranslation(float xPosition, float yPosition, float zPosition)

  // System.Numerics.Matrix4x4.CreateViewport (method)
  public static Matrix4x4 CreateViewport(float x, float y, float width, float height, float minDepth, float maxDepth)

  // System.Numerics.Matrix4x4.CreateViewportLeftHanded (method)
  public static Matrix4x4 CreateViewportLeftHanded(float x, float y, float width, float height, float minDepth, float maxDepth)

  // System.Numerics.Matrix4x4.CreateWorld (method)
  public static Matrix4x4 CreateWorld(Vector3 position, Vector3 forward, Vector3 up)

  // System.Numerics.Matrix4x4.Decompose (method)
  public static bool Decompose(Matrix4x4 matrix, out Vector3 scale, out Quaternion rotation, out Vector3 translation)

  // System.Numerics.Matrix4x4.Invert (method)
  public static bool Invert(Matrix4x4 matrix, out Matrix4x4 result)

  // System.Numerics.Matrix4x4.Lerp (method)
  public static Matrix4x4 Lerp(Matrix4x4 matrix1, Matrix4x4 matrix2, float amount)

  // System.Numerics.Matrix4x4.Multiply (method)
  public static Matrix4x4 Multiply(Matrix4x4 value1, Matrix4x4 value2)
  public static Matrix4x4 Multiply(Matrix4x4 value1, float value2)

  // System.Numerics.Matrix4x4.Negate (method)
  public static Matrix4x4 Negate(Matrix4x4 value)

  // System.Numerics.Matrix4x4.Subtract (method)
  public static Matrix4x4 Subtract(Matrix4x4 value1, Matrix4x4 value2)

  // System.Numerics.Matrix4x4.Transform (method)
  public static Matrix4x4 Transform(Matrix4x4 value, Quaternion rotation)

  // System.Numerics.Matrix4x4.Transpose (method)
  public static Matrix4x4 Transpose(Matrix4x4 matrix)

  // System.Numerics.Matrix4x4.Equals (method)
  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Matrix4x4 other)

  // System.Numerics.Matrix4x4.GetDeterminant (method)
  public readonly float GetDeterminant()

  // System.Numerics.Matrix4x4.GetElement (method)
  public readonly float GetElement(int row, int column)

  // System.Numerics.Matrix4x4.GetRow (method)
  public readonly Vector4 GetRow(int index)

  // System.Numerics.Matrix4x4.GetHashCode (method)
  public override readonly int GetHashCode()

  // System.Numerics.Matrix4x4.ToString (method)
  public override readonly string ToString()

  // System.Numerics.Matrix4x4.WithElement (method)
  public readonly Matrix4x4 WithElement(int row, int column, float value)

  // System.Numerics.Matrix4x4.WithRow (method)
  public readonly Matrix4x4 WithRow(int index, Vector4 value)

Plane

  Normal: Vector3

  D: float

  // System.Numerics.Plane.Plane (constructor)
  public Plane(float x, float y, float z, float d)
  public Plane(Vector3 normal, float d)
  public Plane(Vector4 value)

  // System.Numerics.Plane.Create (method)
  public static Plane Create(Vector4 value)
  public static Plane Create(Vector3 normal, float d)
  public static Plane Create(float x, float y, float z, float d)

  // System.Numerics.Plane.CreateFromVertices (method)
  public static Plane CreateFromVertices(Vector3 point1, Vector3 point2, Vector3 point3)

  // System.Numerics.Plane.Dot (method)
  public static float Dot(Plane plane, Vector4 value)

  // System.Numerics.Plane.DotCoordinate (method)
  public static float DotCoordinate(Plane plane, Vector3 value)

  // System.Numerics.Plane.DotNormal (method)
  public static float DotNormal(Plane plane, Vector3 value)

  // System.Numerics.Plane.Normalize (method)
  public static Plane Normalize(Plane value)

  // System.Numerics.Plane.Transform (method)
  public static Plane Transform(Plane plane, Matrix4x4 matrix)
  public static Plane Transform(Plane plane, Quaternion rotation)

  // System.Numerics.Plane.op_Equality (method)
  public static bool operator ==(Plane value1, Plane value2)

  // System.Numerics.Plane.op_Inequality (method)
  public static bool operator !=(Plane value1, Plane value2)

  // System.Numerics.Plane.Equals (method)
  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Plane other)

  // System.Numerics.Plane.GetHashCode (method)
  public override readonly int GetHashCode()

  // System.Numerics.Plane.ToString (method)
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

  // System.Numerics.Quaternion.Quaternion (constructor)
  public Quaternion(float x, float y, float z, float w)
  public Quaternion(Vector3 vectorPart, float scalarPart)

  // System.Numerics.Quaternion.op_Addition (method)
  public static Quaternion operator +(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.op_Division (method)
  public static Quaternion operator /(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.op_Equality (method)
  public static bool operator ==(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.op_Inequality (method)
  public static bool operator !=(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.op_Multiply (method)
  public static Quaternion operator *(Quaternion value1, Quaternion value2)
  public static Quaternion operator *(Quaternion value1, float value2)

  // System.Numerics.Quaternion.op_Subtraction (method)
  public static Quaternion operator -(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.op_UnaryNegation (method)
  public static Quaternion operator -(Quaternion value)

  // System.Numerics.Quaternion.Add (method)
  public static Quaternion Add(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.Concatenate (method)
  public static Quaternion Concatenate(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.Conjugate (method)
  public static Quaternion Conjugate(Quaternion value)

  // System.Numerics.Quaternion.Create (method)
  public static Quaternion Create(float x, float y, float z, float w)
  public static Quaternion Create(Vector3 vectorPart, float scalarPart)

  // System.Numerics.Quaternion.CreateFromAxisAngle (method)
  public static Quaternion CreateFromAxisAngle(Vector3 axis, float angle)

  // System.Numerics.Quaternion.CreateFromRotationMatrix (method)
  public static Quaternion CreateFromRotationMatrix(Matrix4x4 matrix)

  // System.Numerics.Quaternion.CreateFromYawPitchRoll (method)
  public static Quaternion CreateFromYawPitchRoll(float yaw, float pitch, float roll)

  // System.Numerics.Quaternion.Divide (method)
  public static Quaternion Divide(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.Dot (method)
  public static float Dot(Quaternion quaternion1, Quaternion quaternion2)

  // System.Numerics.Quaternion.Inverse (method)
  public static Quaternion Inverse(Quaternion value)

  // System.Numerics.Quaternion.Lerp (method)
  public static Quaternion Lerp(Quaternion quaternion1, Quaternion quaternion2, float amount)

  // System.Numerics.Quaternion.Multiply (method)
  public static Quaternion Multiply(Quaternion value1, Quaternion value2)
  public static Quaternion Multiply(Quaternion value1, float value2)

  // System.Numerics.Quaternion.Negate (method)
  public static Quaternion Negate(Quaternion value)

  // System.Numerics.Quaternion.Normalize (method)
  public static Quaternion Normalize(Quaternion value)

  // System.Numerics.Quaternion.Slerp (method)
  public static Quaternion Slerp(Quaternion quaternion1, Quaternion quaternion2, float amount)

  // System.Numerics.Quaternion.Subtract (method)
  public static Quaternion Subtract(Quaternion value1, Quaternion value2)

  // System.Numerics.Quaternion.Equals (method)
  public override readonly bool Equals(object? obj)
  public readonly bool Equals(Quaternion other)

  // System.Numerics.Quaternion.GetHashCode (method)
  public override readonly int GetHashCode()

  // System.Numerics.Quaternion.Length (method)
  public readonly float Length()

  // System.Numerics.Quaternion.LengthSquared (method)
  public readonly float LengthSquared()

  // System.Numerics.Quaternion.ToString (method)
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

  // System.Numerics.Vector2.Vector2 (constructor)
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
