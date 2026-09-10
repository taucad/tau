# libcascade — gp (7)

4 top-level symbols. Signatures are verbatim typescript.

// Defines a non-persistent transformation in 2D space
gp_Trsf2d: declare class gp_Trsf2d

constructor

// Changes the transformation into a symmetrical transformation
SetMirror(theP: gp_Pnt2d): void;
SetMirror(theA: gp_Ax2d): void;
SetMirror(theP: gp_Pnt2d): void;
SetMirror(theA: gp_Ax2d): void;

// Changes the transformation into a rotation
SetRotation(theP: gp_Pnt2d, theAng: number): void;

// Changes the transformation into a scale
SetScale(theP: gp_Pnt2d, theS: number): void;

// Changes a transformation allowing passage from the coordinate system "theFromSystem1" to the coordinate system "theToSystem2"
SetTransformation(theFromSystem1: gp_Ax2d, theToSystem2: gp_Ax2d): void;
SetTransformation(theToSystem: gp_Ax2d): void;
SetTransformation(theFromSystem1: gp_Ax2d, theToSystem2: gp_Ax2d): void;
SetTransformation(theToSystem: gp_Ax2d): void;

// Changes the transformation into a translation
SetTranslation(theV: gp_Vec2d): void;
SetTranslation(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
SetTranslation(theV: gp_Vec2d): void;
SetTranslation(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

// Replaces the translation vector with theV
SetTranslationPart(theV: gp_Vec2d): void;

// Modifies the scale factor
SetScaleFactor(theS: number): void;

// Returns true if the determinant of the vectorial part of this transformation is negative.
IsNegative(): boolean;

// Returns the nature of the transformation
Form(): gp_TrsfForm;

// Returns the scale factor
ScaleFactor(): number;

// Returns the translation part of the transformation's matrix
TranslationPart(): gp_XY;

// Returns the vectorial part of the transformation
VectorialPart(): gp_Mat2d;

// Returns the homogeneous vectorial part of the transformation
HVectorialPart(): gp_Mat2d;

// Returns the angle corresponding to the rotational component of the transformation matrix (operation opposite to `SetRotation()`)
RotationPart(): number;

// Returns the coefficients of the transformation's matrix
Value(theRow: number, theCol: number): number;

Invert(): void;

// Computes the reverse transformation
Inverted(): gp_Trsf2d;

Multiplied(theT: gp_Trsf2d): gp_Trsf2d;

// Computes the transformation composed from <me> and theT
Multiply(theT: gp_Trsf2d): void;

// Computes the transformation composed from <me> and theT
PreMultiply(theT: gp_Trsf2d): void;

Power(theN: number): void;

// Computes the following composition of transformations <me> _ <me> _ .......\* <me>, theN time
Powered(theN: number): gp_Trsf2d;

// Transforms a doublet XY with a Trsf2d
Transforms(theX?: number, theY?: number): { theX: number; theY: number };
Transforms(theCoord: gp_XY): void;
Transforms(theX?: number, theY?: number): { theX: number; theY: number };
Transforms(theCoord: gp_XY): void;

// Sets the coefficients of the transformation
SetValues(a11: number, a12: number, a13: number, a21: number, a22: number, a23: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Identifies the type of a geometric transformation
gp_TrsfForm: typeof gp_TrsfForm[keyof typeof gp_TrsfForm]

// Defines a non-persistent vector in 3D space
gp_Vec: declare class gp_Vec

constructor

// Changes the coordinate of range theIndex theIndex = 1 => X is modified theIndex = 2 => Y is modified theIndex = 3 => Z is modified Raised if theIndex != {1, 2, 3}
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number, theZv: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number, theZv: number): void;

// Assigns the given value to the X coordinate of this vector
SetX(theX: number): void;

// Assigns the given value to the X coordinate of this vector
SetY(theY: number): void;

// Assigns the given value to the X coordinate of this vector
SetZ(theZ: number): void;

// Assigns the three coordinates of theCoord to this vector
SetXYZ(theCoord: gp_XYZ): void;

// Returns the coordinate of range theIndex
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number, theZv?: number): { theXv: number; theYv: number; theZv: number };
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number, theZv?: number): { theXv: number; theYv: number; theZv: number };

// For this vector, returns its X coordinate
X(): number;

// For this vector, returns its Y coordinate
Y(): number;

// For this vector, returns its Z coordinate
Z(): number;

// For this vector, returns
XYZ(): gp_XYZ;

// Returns True if the two vectors have the same magnitude value and the same direction
IsEqual(theOther: gp_Vec, theLinearTolerance: number, theAngularTolerance: number): boolean;

// Returns True if abs(<me>.Angle(theOther) - PI/2.) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.`Magnitude()` <= Resolution or theOther.Magnitude() <= Resolution from gp
IsNormal(theOther: gp_Vec, theAngularTolerance: number): boolean;

// Returns True if PI - <me>.Angle(theOther) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.`Magnitude()` <= Resolution or Other.Magnitude() <= Resolution from gp
IsOpposite(theOther: gp_Vec, theAngularTolerance: number): boolean;

// Returns True if Angle(<me>, theOther) <= theAngularTolerance or PI - Angle(<me>, theOther) <= theAngularTolerance This definition means that two parallel vectors cannot define a plane but two vectors with opposite directions are considered as parallel
IsParallel(theOther: gp_Vec, theAngularTolerance: number): boolean;

// Computes the angular value between <me> and <theOther> Returns the angle value between 0 and PI in radian
Angle(theOther: gp_Vec): number;

// Computes the angle, in radians, between this vector and vector theOther
AngleWithRef(theOther: gp_Vec, theVRef: gp_Vec): number;

// Computes the magnitude of this vector
Magnitude(): number;

// Computes the square magnitude of this vector
SquareMagnitude(): number;

// Adds two vectors
Add(theOther: gp_Vec): void;

// Adds two vectors
Added(theOther: gp_Vec): gp_Vec;

// Subtracts two vectors
Subtract(theRight: gp_Vec): void;

// Subtracts two vectors
Subtracted(theRight: gp_Vec): gp_Vec;

// Multiplies a vector by a scalar
Multiply(theScalar: number): void;

// Multiplies a vector by a scalar
Multiplied(theScalar: number): gp_Vec;

// Divides a vector by a scalar
Divide(theScalar: number): void;

// Divides a vector by a scalar
Divided(theScalar: number): gp_Vec;

// computes the cross product between two vectors
Cross(theRight: gp_Vec): void;

// computes the cross product between two vectors
Crossed(theRight: gp_Vec): gp_Vec;

// Computes the magnitude of the cross product between <me> and theRight
CrossMagnitude(theRight: gp_Vec): number;

// Computes the square magnitude of the cross product between <me> and theRight
CrossSquareMagnitude(theRight: gp_Vec): number;

// Computes the triple vector product
CrossCross(theV1: gp_Vec, theV2: gp_Vec): void;

// Computes the triple vector product
CrossCrossed(theV1: gp_Vec, theV2: gp_Vec): gp_Vec;

// computes the scalar product
Dot(theOther: gp_Vec): number;

// Computes the triple scalar product <me> \* (theV1 ^ theV2)
DotCross(theV1: gp_Vec, theV2: gp_Vec): number;

// normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from gp
Normalize(): void;

// normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from gp
Normalized(): gp_Vec;

// Reverses the direction of a vector
Reverse(): void;

// Reverses the direction of a vector
Reversed(): gp_Vec;

// <me> is set to the following linear form
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;

Mirror(theV: gp_Vec): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theV: gp_Vec): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theV: gp_Vec): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of a vector with respect to the vector theV which is the center of the symmetry
Mirrored(theV: gp_Vec): gp_Vec;
Mirrored(theA1: gp_Ax1): gp_Vec;
Mirrored(theA2: gp_Ax2): gp_Vec;
Mirrored(theV: gp_Vec): gp_Vec;
Mirrored(theA1: gp_Ax1): gp_Vec;
Mirrored(theA2: gp_Ax2): gp_Vec;
Mirrored(theV: gp_Vec): gp_Vec;
Mirrored(theA1: gp_Ax1): gp_Vec;
Mirrored(theA2: gp_Ax2): gp_Vec;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a vector
Rotated(theA1: gp_Ax1, theAng: number): gp_Vec;

Scale(theS: number): void;

// Scales a vector
Scaled(theS: number): gp_Vec;

// Transforms a vector with the transformation theT
Transform(theT: gp_Trsf): void;

// Transforms a vector with the transformation theT
Transformed(theT: gp_Trsf): gp_Vec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a non-persistent vector in 2D space
gp_Vec2d: declare class gp_Vec2d

constructor

// Changes the coordinate of range theIndex theIndex = 1 => X is modified theIndex = 2 => Y is modified Raises OutOfRange if theIndex != {1, 2}
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number): void;

// Assigns the given value to the X coordinate of this vector
SetX(theX: number): void;

// Assigns the given value to the Y coordinate of this vector
SetY(theY: number): void;

// Assigns the two coordinates of theCoord to this vector
SetXY(theCoord: gp_XY): void;

// Returns the coordinate of range theIndex
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number): { theXv: number; theYv: number };
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number): { theXv: number; theYv: number };

// For this vector, returns its X coordinate
X(): number;

// For this vector, returns its Y coordinate
Y(): number;

// For this vector, returns its two coordinates as a number pair
XY(): gp_XY;

// Returns True if the two vectors have the same magnitude value and the same direction
IsEqual(theOther: gp_Vec2d, theLinearTolerance: number, theAngularTolerance: number): boolean;

// Returns True if abs(std::abs(<me>.Angle(theOther)) - PI/2.) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.`Magnitude()` <= Resolution or theOther.Magnitude() <= Resolution from gp
IsNormal(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

// Returns True if PI - std::abs(<me>.Angle(theOther)) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.`Magnitude()` <= Resolution or theOther.Magnitude() <= Resolution from gp
IsOpposite(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

// Returns true if std::abs(Angle(<me>, theOther)) <= theAngularTolerance or PI - std::abs(Angle(<me>, theOther)) <= theAngularTolerance Two vectors with opposite directions are considered as parallel
IsParallel(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

// Computes the angular value between <me> and <theOther> returns the angle value between -PI and PI in radian
Angle(theOther: gp_Vec2d): number;

// Computes the magnitude of this vector
Magnitude(): number;

// Computes the square magnitude of this vector
SquareMagnitude(): number;

Add(theOther: gp_Vec2d): void;

// Adds two vectors
Added(theOther: gp_Vec2d): gp_Vec2d;

// Computes the crossing product between two vectors
Crossed(theRight: gp_Vec2d): number;

// Computes the magnitude of the cross product between <me> and theRight
CrossMagnitude(theRight: gp_Vec2d): number;

// Computes the square magnitude of the cross product between <me> and theRight
CrossSquareMagnitude(theRight: gp_Vec2d): number;

Divide(theScalar: number): void;

// divides a vector by a scalar
Divided(theScalar: number): gp_Vec2d;

// Computes the scalar product
Dot(theOther: gp_Vec2d): number;

GetNormal(): gp_Vec2d;

Multiply(theScalar: number): void;

// Normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from package gp
Multiplied(theScalar: number): gp_Vec2d;

Normalize(): void;

// Normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from package gp
Normalized(): gp_Vec2d;

Reverse(): void;

// Reverses the direction of a vector
Reversed(): gp_Vec2d;

// Subtracts two vectors
Subtract(theRight: gp_Vec2d): void;

// Subtracts two vectors
Subtracted(theRight: gp_Vec2d): gp_Vec2d;

// <me> is set to the following linear form
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;

// Performs the symmetrical transformation of a vector with respect to the vector theV which is the center of the symmetry
Mirror(theV: gp_Vec2d): void;
Mirror(theA1: gp_Ax2d): void;
Mirror(theV: gp_Vec2d): void;
Mirror(theA1: gp_Ax2d): void;

// Performs the symmetrical transformation of a vector with respect to the vector theV which is the center of the symmetry
Mirrored(theV: gp_Vec2d): gp_Vec2d;
Mirrored(theA1: gp_Ax2d): gp_Vec2d;
Mirrored(theV: gp_Vec2d): gp_Vec2d;
Mirrored(theA1: gp_Ax2d): gp_Vec2d;

Rotate(theAng: number): void;

// Rotates a vector
Rotated(theAng: number): gp_Vec2d;

Scale(theS: number): void;

// Scales a vector
Scaled(theS: number): gp_Vec2d;

Transform(theT: gp_Trsf2d): void;

// Transforms a vector with a Trsf from gp
Transformed(theT: gp_Trsf2d): gp_Vec2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
