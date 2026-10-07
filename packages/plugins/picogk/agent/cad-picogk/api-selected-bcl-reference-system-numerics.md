# PicoGK — Selected BCL reference — System.Numerics

4 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
// System.Numerics.Matrix3x2 (struct)
public struct Matrix3x2

  // System.Numerics.Matrix3x2.M11 (field)
  public float M11

  // System.Numerics.Matrix3x2.M12 (field)
  public float M12

  // System.Numerics.Matrix3x2.M21 (field)
  public float M21

  // System.Numerics.Matrix3x2.M22 (field)
  public float M22

  // System.Numerics.Matrix3x2.M31 (field)
  public float M31

  // System.Numerics.Matrix3x2.M32 (field)
  public float M32

  // System.Numerics.Matrix3x2.Identity (property)
  public static Matrix3x2 Identity { get; }

  // System.Numerics.Matrix3x2.IsIdentity (property)
  public readonly bool IsIdentity { get; }

  // System.Numerics.Matrix3x2.Translation (property)
  public Vector2 Translation { get; set; }

  // System.Numerics.Matrix3x2.X (property)
  public Vector2 X { get; set; }

  // System.Numerics.Matrix3x2.Y (property)
  public Vector2 Y { get; set; }

  // System.Numerics.Matrix3x2.Z (property)
  public Vector2 Z { get; set; }

  // System.Numerics.Matrix3x2.this[int row] (property)
  public Vector2 this[int row] { get; set; }

  // System.Numerics.Matrix3x2.this[int row, int column] (property)
  public float this[int row, int column] { get; set; }

  // System.Numerics.Matrix3x2.Matrix3x2 (constructor)
  public Matrix3x2()
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

// Category: Selected BCL reference
// System.Numerics.Matrix4x4 (struct)
public struct Matrix4x4

  // System.Numerics.Matrix4x4.M11 (field)
  public float M11

  // System.Numerics.Matrix4x4.M12 (field)
  public float M12

  // System.Numerics.Matrix4x4.M13 (field)
  public float M13

  // System.Numerics.Matrix4x4.M14 (field)
  public float M14

  // System.Numerics.Matrix4x4.M21 (field)
  public float M21

  // System.Numerics.Matrix4x4.M22 (field)
  public float M22

  // System.Numerics.Matrix4x4.M23 (field)
  public float M23

  // System.Numerics.Matrix4x4.M24 (field)
  public float M24

  // System.Numerics.Matrix4x4.M31 (field)
  public float M31

  // System.Numerics.Matrix4x4.M32 (field)
  public float M32

  // System.Numerics.Matrix4x4.M33 (field)
  public float M33

  // System.Numerics.Matrix4x4.M34 (field)
  public float M34

  // System.Numerics.Matrix4x4.M41 (field)
  public float M41

  // System.Numerics.Matrix4x4.M42 (field)
  public float M42

  // System.Numerics.Matrix4x4.M43 (field)
  public float M43

  // System.Numerics.Matrix4x4.M44 (field)
  public float M44

  // System.Numerics.Matrix4x4.Identity (property)
  public static Matrix4x4 Identity { get; }

  // System.Numerics.Matrix4x4.IsIdentity (property)
  public readonly bool IsIdentity { get; }

  // System.Numerics.Matrix4x4.Translation (property)
  public Vector3 Translation { get; set; }

  // System.Numerics.Matrix4x4.X (property)
  public Vector4 X { get; set; }

  // System.Numerics.Matrix4x4.Y (property)
  public Vector4 Y { get; set; }

  // System.Numerics.Matrix4x4.Z (property)
  public Vector4 Z { get; set; }

  // System.Numerics.Matrix4x4.W (property)
  public Vector4 W { get; set; }

  // System.Numerics.Matrix4x4.this[int row] (property)
  public Vector4 this[int row] { get; set; }

  // System.Numerics.Matrix4x4.this[int row, int column] (property)
  public float this[int row, int column] { get; set; }

  // System.Numerics.Matrix4x4.Matrix4x4 (constructor)
  public Matrix4x4()
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

// Category: Selected BCL reference
// System.Numerics.Plane (struct)
public struct Plane

  // System.Numerics.Plane.Normal (field)
  public Vector3 Normal

  // System.Numerics.Plane.D (field)
  public float D

  // System.Numerics.Plane.Plane (constructor)
  public Plane()
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

// Category: Selected BCL reference
// System.Numerics.Quaternion (struct)
public struct Quaternion

  // System.Numerics.Quaternion.X (field)
  public float X

  // System.Numerics.Quaternion.Y (field)
  public float Y

  // System.Numerics.Quaternion.Z (field)
  public float Z

  // System.Numerics.Quaternion.W (field)
  public float W

  // System.Numerics.Quaternion.Zero (property)
  public static Quaternion Zero { get; }

  // System.Numerics.Quaternion.Identity (property)
  public static Quaternion Identity { get; }

  // System.Numerics.Quaternion.this[int index] (property)
  public float this[int index] { get; set; }

  // System.Numerics.Quaternion.IsIdentity (property)
  public readonly bool IsIdentity { get; }

  // System.Numerics.Quaternion.Quaternion (constructor)
  public Quaternion()
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
