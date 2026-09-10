# libcascade — gp (6)

7 top-level symbols. Signatures are verbatim typescript.

// Defines a non-persistent 2D cartesian point
gp_Pnt2d: declare class gp_Pnt2d

constructor

// Assigns the value Xi to the coordinate that corresponds to theIndex
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXp: number, theYp: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXp: number, theYp: number): void;

// Assigns the given value to the X coordinate of this point
SetX(theX: number): void;

// Assigns the given value to the Y coordinate of this point
SetY(theY: number): void;

// Assigns the two coordinates of Coord to this point
SetXY(theCoord: gp_XY): void;

// Returns the coordinate of range theIndex
Coord(theIndex: number): number;
Coord(theXp?: number, theYp?: number): { theXp: number; theYp: number };
Coord(): gp_XY;
Coord(theIndex: number): number;
Coord(theXp?: number, theYp?: number): { theXp: number; theYp: number };
Coord(): gp_XY;
Coord(theIndex: number): number;
Coord(theXp?: number, theYp?: number): { theXp: number; theYp: number };
Coord(): gp_XY;

// For this point, returns its X coordinate
X(): number;

// For this point, returns its Y coordinate
Y(): number;

// For this point, returns its two coordinates as a number pair
XY(): gp_XY;

// Returns the coordinates of this point
ChangeCoord(): gp_XY;

// Comparison Returns True if the distance between the two points is lower or equal to theLinearTolerance
IsEqual(theOther: gp_Pnt2d, theLinearTolerance: number): boolean;

// Computes the distance between two points
Distance(theOther: gp_Pnt2d): number;

// Computes the square distance between two points
SquareDistance(theOther: gp_Pnt2d): number;

// Performs the symmetrical transformation of a point with respect to the point theP which is the center of the symmetry
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

// Performs the symmetrical transformation of a point with respect to an axis placement which is the axis
Mirrored(theP: gp_Pnt2d): gp_Pnt2d;
Mirrored(theA: gp_Ax2d): gp_Pnt2d;
Mirrored(theP: gp_Pnt2d): gp_Pnt2d;
Mirrored(theA: gp_Ax2d): gp_Pnt2d;

// Rotates a point
Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Pnt2d;

// Scales a point
Scale(theP: gp_Pnt2d, theS: number): void;

Scaled(theP: gp_Pnt2d, theS: number): gp_Pnt2d;

// Transforms a point with the transformation theT
Transform(theT: gp_Trsf2d): void;

Transformed(theT: gp_Trsf2d): gp_Pnt2d;

// Translates a point in the direction of the vector theV
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

Translated(theV: gp_Vec2d): gp_Pnt2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Pnt2d;
Translated(theV: gp_Vec2d): gp_Pnt2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Pnt2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Represents operation of rotation in 3d space as quaternion and implements operations with rotations basing on quaternion mathematics
gp_Quaternion: declare class gp_Quaternion

constructor

// Simple equal test without precision
IsEqual(theOther: gp_Quaternion): boolean;

// Sets quaternion to shortest-arc rotation producing vector theVecTo from vector theVecFrom
SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec): void;
SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec, theHelpCrossVec: gp_Vec): void;
SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec): void;
SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec, theHelpCrossVec: gp_Vec): void;

// Create a unit quaternion from Axis+Angle representation
SetVectorAndAngle(theAxis: gp_Vec, theAngle: number): void;

// Convert a quaternion to Axis+Angle representation, preserve the axis direction and angle from -PI to +PI
GetVectorAndAngle(theAxis: gp_Vec, theAngle?: number): { theAngle: number };
// theAxis: Mutated in place

// Create a unit quaternion by rotation matrix matrix must contain only rotation (not scale or shear)
SetMatrix(theMat: gp_Mat): void;

// Returns rotation operation as 3\*3 matrix
GetMatrix(): gp_Mat;

// Create a unit quaternion representing rotation defined by generalized Euler angles
SetEulerAngles(theOrder: gp_EulerSequence, theAlpha: number, theBeta: number, theGamma: number): void;

// Returns Euler angles describing current rotation
GetEulerAngles(theOrder: gp_EulerSequence, theAlpha?: number, theBeta?: number, theGamma?: number): { theAlpha: number; theBeta: number; theGamma: number };

Set(theX: number, theY: number, theZ: number, theW: number): void;
Set(theQuaternion: gp_Quaternion): void;
Set(theX: number, theY: number, theZ: number, theW: number): void;
Set(theQuaternion: gp_Quaternion): void;

X(): number;

Y(): number;

Z(): number;

W(): number;

// Make identity quaternion (zero-rotation)
SetIdent(): void;

// Reverse direction of rotation (conjugate quaternion)
Reverse(): void;

// Return rotation with reversed direction (conjugated quaternion)
Reversed(): gp_Quaternion;

// Inverts quaternion (both rotation direction and norm)
Invert(): void;

// Return inversed quaternion q^-1
Inverted(): gp_Quaternion;

// Returns square norm of quaternion
SquareNorm(): number;

// Returns norm of quaternion
Norm(): number;

// Scale all components by quaternion by theScale
Scale(theScale: number): void;

// Returns scaled quaternion
Scaled(theScale: number): gp_Quaternion;

// Stabilize quaternion length within 1 - 1/4
StabilizeLength(): void;

// Scale quaternion that its norm goes to 1
Normalize(): void;

// Returns quaternion scaled so that its norm goes to 1
Normalized(): gp_Quaternion;

// Returns quaternion with all components negated
Negated(): gp_Quaternion;

// Makes sum of quaternion components
Added(theOther: gp_Quaternion): gp_Quaternion;

// Makes difference of quaternion components
Subtracted(theOther: gp_Quaternion): gp_Quaternion;

// Multiply function - work the same as Matrices multiplying
Multiplied(theOther: gp_Quaternion): gp_Quaternion;

// Adds components of other quaternion
Add(theOther: gp_Quaternion): void;

// Subtracts components of other quaternion
Subtract(theOther: gp_Quaternion): void;

// Adds rotation by multiplication
Multiply(theOther: gp_Quaternion): void;
Multiply(theVec: gp_Vec): gp_Vec;
Multiply(theOther: gp_Quaternion): void;
Multiply(theVec: gp_Vec): gp_Vec;

// Computes inner product / scalar product / Dot
Dot(theOther: gp_Quaternion): number;

// Return rotation angle from -PI to PI
GetRotationAngle(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class perform linear interpolation (approximate rotation interpolation), result quaternion nonunit, its length lay between
gp_QuaternionNLerp: declare class gp_QuaternionNLerp

constructor

// Compute interpolated quaternion between two quaternions
static Interpolate(theQStart: gp_Quaternion, theQEnd: gp_Quaternion, theT: number): gp_Quaternion;
Interpolate(theT: number, theResultQ: gp_Quaternion): void;
// theT: normalized interpolation coefficient within 0..1 range, with 0 pointing to theStart and 1 to theEnd

// Initialize the tool with Start and End values
Init(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

// Initialize the tool with Start and End unit quaternions
InitFromUnit(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Perform Spherical Linear Interpolation of the quaternions, return unit length quaternion
gp_QuaternionSLerp: declare class gp_QuaternionSLerp

constructor

// Compute interpolated quaternion between two quaternions
static Interpolate(theQStart: gp_Quaternion, theQEnd: gp_Quaternion, theT: number): gp_Quaternion;
Interpolate(theT: number, theResultQ: gp_Quaternion): void;
// theT: normalized interpolation coefficient within 0..1 range, with 0 pointing to theStart and 1 to theEnd

// Initialize the tool with Start and End values
Init(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

// Initialize the tool with Start and End unit quaternions
InitFromUnit(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a sphere
gp_Sphere: declare class gp_Sphere

constructor

// Changes the center of the sphere
SetLocation(theLoc: gp_Pnt): void;

// Changes the local coordinate system of the sphere
SetPosition(theA3: gp_Ax3): void;

// Assigns theR the radius of the Sphere
SetRadius(theR: number): void;

// Computes the area of the sphere
Area(): number;

// Computes the coefficients of the implicit equation of the quadric in the absolute cartesian coordinates system
Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

// Reverses the U parametrization of the sphere reversing the YAxis
UReverse(): void;

// Reverses the V parametrization of the sphere reversing the ZAxis
VReverse(): void;

// Returns true if the local coordinate system of this sphere is right-handed
Direct(): boolean;

// -- Purpose
Location(): gp_Pnt;

// Returns the local coordinates system of the sphere
Position(): gp_Ax3;

// Returns the radius of the sphere
Radius(): number;

// Computes the volume of the sphere
Volume(): number;

// Returns the axis X of the sphere
XAxis(): gp_Ax1;

// Returns the axis Y of the sphere
YAxis(): gp_Ax1;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of a sphere with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Sphere;
Mirrored(theA1: gp_Ax1): gp_Sphere;
Mirrored(theA2: gp_Ax2): gp_Sphere;
Mirrored(theP: gp_Pnt): gp_Sphere;
Mirrored(theA1: gp_Ax1): gp_Sphere;
Mirrored(theA2: gp_Ax2): gp_Sphere;
Mirrored(theP: gp_Pnt): gp_Sphere;
Mirrored(theA1: gp_Ax1): gp_Sphere;
Mirrored(theA2: gp_Ax2): gp_Sphere;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a sphere
Rotated(theA1: gp_Ax1, theAng: number): gp_Sphere;

Scale(theP: gp_Pnt, theS: number): void;

// Scales a sphere
Scaled(theP: gp_Pnt, theS: number): gp_Sphere;

Transform(theT: gp_Trsf): void;

// Transforms a sphere with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Sphere;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates a sphere in the direction of the vector theV
Translated(theV: gp_Vec): gp_Sphere;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Sphere;
Translated(theV: gp_Vec): gp_Sphere;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Sphere;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a torus
gp_Torus: declare class gp_Torus

constructor

// Modifies this torus, by redefining its local coordinate system so that
SetAxis(theA1: gp_Ax1): void;

// Changes the location of the torus
SetLocation(theLoc: gp_Pnt): void;

// Assigns value to the major radius of this torus
SetMajorRadius(theMajorRadius: number): void;

// Assigns value to the minor radius of this torus
SetMinorRadius(theMinorRadius: number): void;

// Changes the local coordinate system of the surface
SetPosition(theA3: gp_Ax3): void;

// Computes the area of the torus
Area(): number;

// Reverses the U parametrization of the torus reversing the YAxis
UReverse(): void;

// Reverses the V parametrization of the torus reversing the ZAxis
VReverse(): void;

// returns true if the Ax3, the local coordinate system of this torus, is right handed
Direct(): boolean;

// returns the symmetry axis of the torus
Axis(): gp_Ax1;

// Computes the coefficients of the implicit equation of the surface in the absolute Cartesian coordinate system
Coefficients(theCoef: NCollection_Array1_double): void;
// theCoef: Mutated in place

// Returns the Torus's location
Location(): gp_Pnt;

// Returns the local coordinates system of the torus
Position(): gp_Ax3;

// returns the major radius of the torus
MajorRadius(): number;

// returns the minor radius of the torus
MinorRadius(): number;

// Computes the volume of the torus
Volume(): number;

// returns the axis X of the torus
XAxis(): gp_Ax1;

// returns the axis Y of the torus
YAxis(): gp_Ax1;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of a torus with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Torus;
Mirrored(theA1: gp_Ax1): gp_Torus;
Mirrored(theA2: gp_Ax2): gp_Torus;
Mirrored(theP: gp_Pnt): gp_Torus;
Mirrored(theA1: gp_Ax1): gp_Torus;
Mirrored(theA2: gp_Ax2): gp_Torus;
Mirrored(theP: gp_Pnt): gp_Torus;
Mirrored(theA1: gp_Ax1): gp_Torus;
Mirrored(theA2: gp_Ax2): gp_Torus;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a torus
Rotated(theA1: gp_Ax1, theAng: number): gp_Torus;

Scale(theP: gp_Pnt, theS: number): void;

// Scales a torus
Scaled(theP: gp_Pnt, theS: number): gp_Torus;

Transform(theT: gp_Trsf): void;

// Transforms a torus with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Torus;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates a torus in the direction of the vector theV
Translated(theV: gp_Vec): gp_Torus;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Torus;
Translated(theV: gp_Vec): gp_Torus;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Torus;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a non-persistent transformation in 3D space
gp_Trsf: declare class gp_Trsf

constructor

// Makes the transformation into a symmetrical transformation
SetMirror(theP: gp_Pnt): void;
SetMirror(theA1: gp_Ax1): void;
SetMirror(theA2: gp_Ax2): void;
SetMirror(theP: gp_Pnt): void;
SetMirror(theA1: gp_Ax1): void;
SetMirror(theA2: gp_Ax2): void;
SetMirror(theP: gp_Pnt): void;
SetMirror(theA1: gp_Ax1): void;
SetMirror(theA2: gp_Ax2): void;

// Changes the transformation into a rotation
SetRotation(theA1: gp_Ax1, theAng: number): void;
SetRotation(theR: gp_Quaternion): void;
SetRotation(theA1: gp_Ax1, theAng: number): void;
SetRotation(theR: gp_Quaternion): void;

// Replaces the rotation part with specified quaternion
SetRotationPart(theR: gp_Quaternion): void;

// Changes the transformation into a scale
SetScale(theP: gp_Pnt, theS: number): void;

// Modifies this transformation so that it transforms the coordinate system defined by theFromSystem1 into the one defined by theToSystem2
SetDisplacement(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;

// Modifies this transformation so that it transforms the coordinates of any point, (x, y, z), relative to a source coordinate system into the coordinates (x', y', z') which are relative to a target coordinate system, but which represent the same point The transformation is from the default coordinate system
SetTransformation(theToSystem: gp_Ax3): void;
SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
SetTransformation(R: gp_Quaternion, theT: gp_Vec): void;
SetTransformation(theToSystem: gp_Ax3): void;
SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
SetTransformation(R: gp_Quaternion, theT: gp_Vec): void;
SetTransformation(theToSystem: gp_Ax3): void;
SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
SetTransformation(R: gp_Quaternion, theT: gp_Vec): void;

// Changes the transformation into a translation
SetTranslation(theV: gp_Vec): void;
SetTranslation(theP1: gp_Pnt, theP2: gp_Pnt): void;
SetTranslation(theV: gp_Vec): void;
SetTranslation(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Replaces the translation vector with the vector theV
SetTranslationPart(theV: gp_Vec): void;

// Modifies the scale factor
SetScaleFactor(theS: number): void;

SetForm(theP: gp_TrsfForm): void;

// Sets the coefficients of the transformation
SetValues(a11: number, a12: number, a13: number, a14: number, a21: number, a22: number, a23: number, a24: number, a31: number, a32: number, a33: number, a34: number): void;

// Returns true if the determinant of the vectorial part of this transformation is negative
IsNegative(): boolean;

// Returns the nature of the transformation
Form(): gp_TrsfForm;

// Returns the scale factor
ScaleFactor(): number;

// Returns the translation part of the transformation's matrix
TranslationPart(): gp_XYZ;

// Returns the boolean True if there is non-zero rotation
GetRotation(theAxis: gp_XYZ, theAngle?: number): { returnValue: boolean; theAngle: number };
GetRotation(): gp_Quaternion;
GetRotation(theAxis: gp_XYZ, theAngle?: number): { returnValue: boolean; theAngle: number };
GetRotation(): gp_Quaternion;
// theAxis: Mutated in place

// Returns the vectorial part of the transformation
VectorialPart(): gp_Mat;

// Computes the homogeneous vectorial part of the transformation
HVectorialPart(): gp_Mat;

// Returns the coefficients of the transformation's matrix
Value(theRow: number, theCol: number): number;

Invert(): void;

// Computes the reverse transformation Raises an exception if the matrix of the transformation is not inversible, it means that the scale factor is lower or equal to Resolution from package gp
Inverted(): gp_Trsf;

Multiplied(theT: gp_Trsf): gp_Trsf;

// Computes the transformation composed with <me> and theT
Multiply(theT: gp_Trsf): void;

// Computes the transformation composed with <me> and T
PreMultiply(theT: gp_Trsf): void;

Power(theN: number): void;

// Computes the following composition of transformations <me> _ <me> _ .......\* <me>, theN time
Powered(theN: number): gp_Trsf;

// Transformation of a triplet XYZ with a Trsf
Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
Transforms(theCoord: gp_XYZ): void;
Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
Transforms(theCoord: gp_XYZ): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
