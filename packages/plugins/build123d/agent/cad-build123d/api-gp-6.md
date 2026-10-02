# build123d — gp (6)

1 top-level symbols. Signatures are verbatim python.

// Category: gp
// Defines a non-persistent transformation in 3D space
gp_Trsf

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.gp.gp_Trsf) -> None

2. __init__(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf2d) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf2d) -> None

  // SetMirror(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetMirror(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt) -> None

Makes the transformation into a symmetrical transformation. theP is the center of the symmetry.

2. SetMirror(self: OCP.OCP.gp.gp_Trsf, theA1: OCP.OCP.gp.gp_Ax1) -> None

Makes the transformation into a symmetrical transformation. theA1 is the center of the axial symmetry.

3. SetMirror(self: OCP.OCP.gp.gp_Trsf, theA2: OCP.OCP.gp.gp_Ax2) -> None

Makes the transformation into a symmetrical transformation. theA2 is the center of the planar symmetry and defines the plane of symmetry by its origin, "X Direction" and "Y Direction".

4. SetMirror(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt) -> None

Makes the transformation into a symmetrical transformation. theP is the center of the symmetry.
  SetMirror(*args, **kwargs)
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theA1: OCP.OCP.gp.gp_Ax1) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theA2: OCP.OCP.gp.gp_Ax2) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetRotation(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetRotation(self: OCP.OCP.gp.gp_Trsf, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

Changes the transformation into a rotation. theA1 is the rotation axis and theAng is the angular value of the rotation in radians.

2. SetRotation(self: OCP.OCP.gp.gp_Trsf, theR: OCP.OCP.gp.gp_Quaternion) -> None

Changes the transformation into a rotation defined by quaternion. Note that rotation is performed around origin, i.e. no translation is involved.
  SetRotation(*args, **kwargs)
  SetRotation(self: OCP.OCP.gp.gp_Trsf, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  SetRotation(self: OCP.OCP.gp.gp_Trsf, theR: OCP.OCP.gp.gp_Quaternion) -> None

  // SetRotationPart(self
  // Remarks: Replaces the rotation part with specified quaternion.
  SetRotationPart(self: OCP.OCP.gp.gp_Trsf, theR: OCP.OCP.gp.gp_Quaternion) -> None

  // SetScale(self
  // Remarks: Changes the transformation into a scale. theP is the center of the scale and theS is the scaling value. Raises ConstructionError If <theS> is null.
  SetScale(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // SetDisplacement(self
  // Remarks: Modifies this transformation so that it transforms the coordinate system defined by theFromSystem1 into the one defined by theToSystem2. After this modification, this transformation transforms: - the origin of theFromSystem1 into the origin of theToSystem2, - the "X Direction" of theFromSystem1 into the "X Direction" of theToSystem2, - the "Y Direction" of theFromSystem1 into the "Y Direction" of theToSystem2, and - the "main Direction" of theFromSystem1 into the "main Direction" of theToSystem2. Warning When you know the coordinates of a point in one coordinate system and you want to express these coordinates in another one, do not use the transformation resulting from this function. Use the transformation that results from SetTransformation instead. SetDisplacement and SetTransformation create related transformations: the vectorial part of one is the inverse of the vectorial part of the other.
  SetDisplacement(self: OCP.OCP.gp.gp_Trsf, theFromSystem1: OCP.OCP.gp.gp_Ax3, theToSystem2: OCP.OCP.gp.gp_Ax3) -> None

  // SetTransformation(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetTransformation(self: OCP.OCP.gp.gp_Trsf, theFromSystem1: OCP.OCP.gp.gp_Ax3, theToSystem2: OCP.OCP.gp.gp_Ax3) -> None

Modifies this transformation so that it transforms the coordinates of any point, (x, y, z), relative to a source coordinate system into the coordinates (x', y', z') which are relative to a target coordinate system, but which represent the same point The transformation is from the coordinate system "theFromSystem1" to the coordinate system "theToSystem2". Example :

2. SetTransformation(self: OCP.OCP.gp.gp_Trsf, theToSystem: OCP.OCP.gp.gp_Ax3) -> None

Modifies this transformation so that it transforms the coordinates of any point, (x, y, z), relative to a source coordinate system into the coordinates (x', y', z') which are relative to a target coordinate system, but which represent the same point The transformation is from the default coordinate system to the local coordinate system defined with the Ax3 theToSystem. Use in the same way as the previous method. FromSystem1 is defaulted to the absolute coordinate system.

3. SetTransformation(self: OCP.OCP.gp.gp_Trsf, R: OCP.OCP.gp.gp_Quaternion, theT: OCP.OCP.gp.gp_Vec) -> None

Sets transformation by directly specified rotation and translation.
  SetTransformation(*args, **kwargs)
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, theFromSystem1: OCP.OCP.gp.gp_Ax3, theToSystem2: OCP.OCP.gp.gp_Ax3) -> None
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, theToSystem: OCP.OCP.gp.gp_Ax3) -> None
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, R: OCP.OCP.gp.gp_Quaternion, theT: OCP.OCP.gp.gp_Vec) -> None

  // SetTranslation(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetTranslation(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None

Changes the transformation into a translation. theV is the vector of the translation.

2. SetTranslation(self: OCP.OCP.gp.gp_Trsf, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

Makes the transformation into a translation where the translation vector is the vector (theP1, theP2) defined from point theP1 to point theP2.

3. SetTranslation(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None

Changes the transformation into a translation. theV is the vector of the translation.

4. SetTranslation(self: OCP.OCP.gp.gp_Trsf, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

Makes the transformation into a translation where the translation vector is the vector (theP1, theP2) defined from point theP1 to point theP2.
  SetTranslation(*args, **kwargs)
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // SetTranslationPart(self
  // Remarks: Replaces the translation vector with the vector theV.
  SetTranslationPart(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None

  // SetScaleFactor(self
  // Remarks: Modifies the scale factor. Raises ConstructionError If theS is null.
  SetScaleFactor(self: OCP.OCP.gp.gp_Trsf, theS: float) -> None

  // SetForm(self
  SetForm(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_TrsfForm) -> None

  // SetValues(self
  // Remarks: Sets the coefficients of the transformation. The transformation of the point x,y,z is the point x',y',z' with : The method Value(i,j) will return aij. Raises ConstructionError if the determinant of the aij is null. The matrix is orthogonalized before future using.
  SetValues(self: OCP.OCP.gp.gp_Trsf, a11: float, a12: float, a13: float, a14: float, a21: float, a22: float, a23: float, a24: float, a31: float, a32: float, a33: float, a34: float) -> None

  // IsNegative(self
  // Remarks: Returns true if the determinant of the vectorial part of this transformation is negative.
  IsNegative(self: OCP.OCP.gp.gp_Trsf) -> bool

  // Form(self
  // Remarks: Returns the nature of the transformation. It can be: an identity transformation, a rotation, a translation, a mirror transformation (relative to a point, an axis or a plane), a scaling transformation, or a compound transformation.
  Form(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_TrsfForm

  // ScaleFactor(self
  // Remarks: Returns the scale factor.
  ScaleFactor(self: OCP.OCP.gp.gp_Trsf) -> float

  // GetRotation(*args, **kwargs)
  // Remarks: Overloaded function.

1. GetRotation(self: OCP.OCP.gp.gp_Trsf, theAxis: OCP.OCP.gp.gp_XYZ, theAngle: float) -> bool

Returns the boolean True if there is non-zero rotation. In the presence of rotation, the output parameters store the axis and the angle of rotation. The method always returns positive value "theAngle", i.e., 0. < theAngle <= PI. Note that this rotation is defined only by the vectorial part of the transformation; generally you would need to check also the translational part to obtain the axis (gp_Ax1) of rotation.

2. GetRotation(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Quaternion

Returns quaternion representing rotational part of the transformation.
  GetRotation(*args, **kwargs)
  GetRotation(self: OCP.OCP.gp.gp_Trsf, theAxis: OCP.OCP.gp.gp_XYZ, theAngle: float) -> bool
  GetRotation(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Quaternion

  // VectorialPart(self
  // Remarks: Returns the vectorial part of the transformation. It is a 3*3 matrix which includes the scale factor.
  VectorialPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Mat

  // Value(*args, **kwargs)
  // Remarks: Overloaded function.

1. Value(self: OCP.OCP.gp.gp_Trsf, theRow: int, theCol: int) -> float

Returns the coefficients of the transformation's matrix. It is a 3 rows * 4 columns matrix. This coefficient includes the scale factor. Raises OutOfRanged if theRow < 1 or theRow > 3 or theCol < 1 or theCol > 4

2. Value(self: OCP.OCP.gp.gp_Trsf, theRow: int, theCol: int) -> float

Returns the coefficients of the transformation's matrix. It is a 3 rows * 4 columns matrix. This coefficient includes the scale factor. Raises OutOfRanged if theRow < 1 or theRow > 3 or theCol < 1 or theCol > 4
  Value(*args, **kwargs)
  Value(self: OCP.OCP.gp.gp_Trsf, theRow: int, theCol: int) -> float
  Value(self: OCP.OCP.gp.gp_Trsf, theRow: int, theCol: int) -> float

  // Invert(self
  Invert(self: OCP.OCP.gp.gp_Trsf) -> None

  // Inverted(self
  // Remarks: Computes the reverse transformation Raises an exception if the matrix of the transformation is not inversible, it means that the scale factor is lower or equal to Resolution from package gp. Computes the transformation composed with T and <me>. In a C++ implementation you can also write Tcomposed = <me> * T. Example :
  Inverted(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Trsf

  // Multiplied(self
  Multiplied(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Trsf

  // Multiply(self
  // Remarks: Computes the transformation composed with <me> and theT. <me> = <me> * theT
  Multiply(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // PreMultiply(self
  // Remarks: Computes the transformation composed with <me> and T. <me> = theT * <me>
  PreMultiply(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Power(self
  Power(self: OCP.OCP.gp.gp_Trsf, theN: int) -> None

  // Powered(self
  // Remarks: Computes the following composition of transformations <me> * <me> * .......* <me>, theN time. if theN = 0 <me> = Identity if theN < 0 <me> = <me>.Inverse() *...........* <me>.Inverse().
  Powered(self: OCP.OCP.gp.gp_Trsf, theN: int) -> OCP.OCP.gp.gp_Trsf

  // Transforms(*args, **kwargs)
  // Remarks: Overloaded function.

1. Transforms(self: OCP.OCP.gp.gp_Trsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None

Transformation of a triplet XYZ with a Trsf

2. Transforms(self: OCP.OCP.gp.gp_Trsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None

Transformation of a triplet XYZ with a Trsf

3. Transforms(self: OCP.OCP.gp.gp_Trsf) -> tuple[float, float, float]

4. Transforms(self: OCP.OCP.gp.gp_Trsf) -> tuple[float, float, float]
  Transforms(*args, **kwargs)
  Transforms(self: OCP.OCP.gp.gp_Trsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_Trsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_Trsf) -> tuple[float, float, float]
  Transforms(self: OCP.OCP.gp.gp_Trsf) -> tuple[float, float, float]

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.gp.gp_Trsf, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  InitFromJson(self: OCP.OCP.gp.gp_Trsf, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // TranslationPart(self
  // Remarks: Returns the translation part of the transformation's matrix
  TranslationPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_XYZ

  // HVectorialPart(self
  // Remarks: Computes the homogeneous vectorial part of the transformation. It is a 3*3 matrix which doesn't include the scale factor. In other words, the vectorial part of this transformation is equal to its homogeneous vectorial part, multiplied by the scale factor. The coefficients of this matrix must be multiplied by the scale factor to obtain the coefficients of the transformation.
  HVectorialPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Mat
