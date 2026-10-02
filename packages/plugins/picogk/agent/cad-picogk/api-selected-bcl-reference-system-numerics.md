# PicoGK — Selected BCL reference — System.Numerics

4 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
public struct Matrix3x2

  public float M11

  public float M12

  public float M21

  public float M22

  public float M31

  public float M32

  public static Matrix3x2 Identity { get; }

  public readonly bool IsIdentity { get; }

  public Vector2 Translation { get; set; }

  public Vector2 X { get; set; }

  public Vector2 Y { get; set; }

  public Vector2 Z { get; set; }

  public Vector2 this[int row] { get; set; }

  public float this[int row, int column] { get; set; }

  public Matrix3x2()
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

// Category: Selected BCL reference
public struct Matrix4x4

  public float M11

  public float M12

  public float M13

  public float M14

  public float M21

  public float M22

  public float M23

  public float M24

  public float M31

  public float M32

  public float M33

  public float M34

  public float M41

  public float M42

  public float M43

  public float M44

  public static Matrix4x4 Identity { get; }

  public readonly bool IsIdentity { get; }

  public Vector3 Translation { get; set; }

  public Vector4 X { get; set; }

  public Vector4 Y { get; set; }

  public Vector4 Z { get; set; }

  public Vector4 W { get; set; }

  public Vector4 this[int row] { get; set; }

  public float this[int row, int column] { get; set; }

  public Matrix4x4()
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

// Category: Selected BCL reference
public struct Plane

  public Vector3 Normal

  public float D

  public Plane()
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

// Category: Selected BCL reference
public struct Quaternion

  public float X

  public float Y

  public float Z

  public float W

  public static Quaternion Zero { get; }

  public static Quaternion Identity { get; }

  public float this[int index] { get; set; }

  public readonly bool IsIdentity { get; }

  public Quaternion()
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
