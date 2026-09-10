# libcascade — gp (3)

7 top-level symbols. Signatures are verbatim typescript.

// Describes a unit vector in the plane (2D space)
gp_Dir2d: declare class gp_Dir2d

constructor

// For this unit vector, assigns
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number): void;

// Assigns the given value to the X coordinate of this unit vector, and then normalizes it
SetX(theX: number): void;

// Assigns the given value to the Y coordinate of this unit vector, and then normalizes it
SetY(theY: number): void;

// Assigns
SetXY(theCoord: gp_XY): void;

// For this unit vector returns the coordinate of range theIndex
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number): { theXv: number; theYv: number };
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number): { theXv: number; theYv: number };

// For this unit vector, returns its X coordinate
X(): number;

// For this unit vector, returns its Y coordinate
Y(): number;

// For this unit vector, returns its two coordinates as a number pair
XY(): gp_XY;

// Returns True if the two vectors have the same direction i.e
IsEqual(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

// Returns True if the angle between this unit vector and the unit vector theOther is equal to Pi/2 or -Pi/2 (normal) i.e
IsNormal(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

// Returns True if the angle between this unit vector and the unit vector theOther is equal to Pi or -Pi (opposite)
IsOpposite(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

// Returns True if the angle between this unit vector and unit vector theOther is equal to 0, Pi or -Pi
IsParallel(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

// Computes the angular value in radians between <me> and <theOther>
Angle(theOther: gp_Dir2d): number;

// Computes the cross product between two directions
Crossed(theRight: gp_Dir2d): number;

// Computes the scalar product
Dot(theOther: gp_Dir2d): number;

Reverse(): void;

// Reverses the orientation of a direction
Reversed(): gp_Dir2d;

Mirror(theV: gp_Dir2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theV: gp_Dir2d): void;
Mirror(theA: gp_Ax2d): void;

// Performs the symmetrical transformation of a direction with respect to the direction theV which is the center of the symmetry
Mirrored(theV: gp_Dir2d): gp_Dir2d;
Mirrored(theA: gp_Ax2d): gp_Dir2d;
Mirrored(theV: gp_Dir2d): gp_Dir2d;
Mirrored(theA: gp_Ax2d): gp_Dir2d;

Rotate(Ang: number): void;

// Rotates a direction
Rotated(theAng: number): gp_Dir2d;

Transform(theT: gp_Trsf2d): void;

// Transforms a direction with the "Trsf" theT
Transformed(theT: gp_Trsf2d): gp_Dir2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link Standard `Standard`} directions in 2D space for optimized constexpr construction
gp_Dir2d_D: typeof gp_Dir2d_D[keyof typeof gp_Dir2d_D]

// Describes an ellipse in 3D space
gp_Elips: declare class gp_Elips

constructor

// Changes the axis normal to the plane of the ellipse
SetAxis(theA1: gp_Ax1): void;

// Modifies this ellipse, by redefining its local coordinate so that its origin becomes theP
SetLocation(theP: gp_Pnt): void;

// The major radius of the ellipse is on the "XAxis" (major axis) of the ellipse
SetMajorRadius(theMajorRadius: number): void;

// The minor radius of the ellipse is on the "YAxis" (minor axis) of the ellipse
SetMinorRadius(theMinorRadius: number): void;

// Modifies this ellipse, by redefining its local coordinate so that it becomes theA2
SetPosition(theA2: gp_Ax2): void;

// Computes the area of the Ellipse
Area(): number;

// Computes the axis normal to the plane of the ellipse
Axis(): gp_Ax1;

// Computes the first or second directrix of this ellipse
Directrix1(): gp_Ax1;

// This line is obtained by the symmetrical transformation of "Directrix1" with respect to the "YAxis" of the ellipse
Directrix2(): gp_Ax1;

// Returns the eccentricity of the ellipse between 0.0 and 1.0 If f is the distance between the center of the ellipse and the Focus1 then the eccentricity e = f / MajorRadius
Eccentricity(): number;

// Computes the focal distance
Focal(): number;

// Returns the first focus of the ellipse
Focus1(): gp_Pnt;

// Returns the second focus of the ellipse
Focus2(): gp_Pnt;

// Returns the center of the ellipse
Location(): gp_Pnt;

// Returns the major radius of the ellipse
MajorRadius(): number;

// Returns the minor radius of the ellipse
MinorRadius(): number;

// Returns p = (1 - e _ e) _ MajorRadius where e is the eccentricity of the ellipse
Parameter(): number;

// Returns the coordinate system of the ellipse
Position(): gp_Ax2;

// Returns the "XAxis" of the ellipse whose origin is the center of this ellipse
XAxis(): gp_Ax1;

// Returns the "YAxis" of the ellipse whose unit vector is the "X Direction" or the "Y Direction" of the local coordinate system of this ellipse
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

// Performs the symmetrical transformation of an ellipse with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Elips;
Mirrored(theA1: gp_Ax1): gp_Elips;
Mirrored(theA2: gp_Ax2): gp_Elips;
Mirrored(theP: gp_Pnt): gp_Elips;
Mirrored(theA1: gp_Ax1): gp_Elips;
Mirrored(theA2: gp_Ax2): gp_Elips;
Mirrored(theP: gp_Pnt): gp_Elips;
Mirrored(theA1: gp_Ax1): gp_Elips;
Mirrored(theA2: gp_Ax2): gp_Elips;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates an ellipse
Rotated(theA1: gp_Ax1, theAng: number): gp_Elips;

Scale(theP: gp_Pnt, theS: number): void;

// Scales an ellipse
Scaled(theP: gp_Pnt, theS: number): gp_Elips;

Transform(theT: gp_Trsf): void;

// Transforms an ellipse with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Elips;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates an ellipse in the direction of the vector theV
Translated(theV: gp_Vec): gp_Elips;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Elips;
Translated(theV: gp_Vec): gp_Elips;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Elips;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an ellipse in the plane (2D space)
gp_Elips2d: declare class gp_Elips2d

constructor

// Modifies this ellipse, by redefining its local coordinate system so that
SetLocation(theP: gp_Pnt2d): void;

// Changes the value of the major radius
SetMajorRadius(theMajorRadius: number): void;

// Changes the value of the minor radius
SetMinorRadius(theMinorRadius: number): void;

// Modifies this ellipse, by redefining its local coordinate system so that it becomes theA
SetAxis(theA: gp_Ax22d): void;

// Modifies this ellipse, by redefining its local coordinate system so that its origin and its "X Direction" become those of the axis theA
SetXAxis(theA: gp_Ax2d): void;

// Modifies this ellipse, by redefining its local coordinate system so that its origin and its "Y Direction" become those of the axis theA
SetYAxis(theA: gp_Ax2d): void;

// Computes the area of the ellipse
Area(): number;

// Returns the coefficients of the implicit equation of the ellipse
Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

// This directrix is the line normal to the XAxis of the ellipse in the local plane (Z = 0) at a distance d = MajorRadius / e from the center of the ellipse, where e is the eccentricity of the ellipse
Directrix1(): gp_Ax2d;

// This line is obtained by the symmetrical transformation of "Directrix1" with respect to the minor axis of the ellipse
Directrix2(): gp_Ax2d;

// Returns the eccentricity of the ellipse between 0.0 and 1.0 If f is the distance between the center of the ellipse and the Focus1 then the eccentricity e = f / MajorRadius
Eccentricity(): number;

// Returns the distance between the center of the ellipse and focus1 or focus2
Focal(): number;

// Returns the first focus of the ellipse
Focus1(): gp_Pnt2d;

// Returns the second focus of the ellipse
Focus2(): gp_Pnt2d;

// Returns the center of the ellipse
Location(): gp_Pnt2d;

// Returns the major radius of the Ellipse
MajorRadius(): number;

// Returns the minor radius of the Ellipse
MinorRadius(): number;

// Returns p = (1 - e _ e) _ MajorRadius where e is the eccentricity of the ellipse
Parameter(): number;

// Returns the major axis of the ellipse
Axis(): gp_Ax22d;

// Returns the major axis of the ellipse
XAxis(): gp_Ax2d;

// Returns the minor axis of the ellipse
YAxis(): gp_Ax2d;

Reverse(): void;

Reversed(): gp_Elips2d;

// Returns true if the local coordinate system is direct and false in the other case
IsDirect(): boolean;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

// Performs the symmetrical transformation of a ellipse with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt2d): gp_Elips2d;
Mirrored(theA: gp_Ax2d): gp_Elips2d;
Mirrored(theP: gp_Pnt2d): gp_Elips2d;
Mirrored(theA: gp_Ax2d): gp_Elips2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

Rotated(theP: gp_Pnt2d, theAng: number): gp_Elips2d;

Scale(theP: gp_Pnt2d, theS: number): void;

// Scales a ellipse
Scaled(theP: gp_Pnt2d, theS: number): gp_Elips2d;

Transform(theT: gp_Trsf2d): void;

// Transforms an ellipse with the transformation theT from class Trsf2d
Transformed(theT: gp_Trsf2d): gp_Elips2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

// Translates a ellipse in the direction of the vector theV
Translated(theV: gp_Vec2d): gp_Elips2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Elips2d;
Translated(theV: gp_Vec2d): gp_Elips2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Elips2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumerates all 24 possible variants of generalized Euler angles, defining general 3d rotation by three rotations around main axes of coordinate system, in different possible orders
gp_EulerSequence: typeof gp_EulerSequence[keyof typeof gp_EulerSequence]

// Defines a non-persistent transformation in 3D space
gp_GTrsf: declare class gp_GTrsf

constructor

// Changes this transformation into an affinity of ratio theRatio with respect to the axis theA1
SetAffinity(theA1: gp_Ax1, theRatio: number): void;
SetAffinity(theA2: gp_Ax2, theRatio: number): void;
SetAffinity(theA1: gp_Ax1, theRatio: number): void;
SetAffinity(theA2: gp_Ax2, theRatio: number): void;

// Replaces the coefficient (theRow, theCol) of the matrix representing this transformation by theValue
SetValue(theRow: number, theCol: number, theValue: number): void;

// Replaces the vectorial part of this transformation by theMatrix
SetVectorialPart(theMatrix: gp_Mat): void;

// Replaces the translation part of this transformation by the coordinates of the number triple theCoord
SetTranslationPart(theCoord: gp_XYZ): void;

// Assigns the vectorial and translation parts of theT to this transformation
SetTrsf(theT: gp_Trsf): void;

// Returns true if the determinant of the vectorial part of this transformation is negative
IsNegative(): boolean;

// Returns true if this transformation is singular (and therefore, cannot be inverted)
IsSingular(): boolean;

// Returns the nature of the transformation
Form(): gp_TrsfForm;

// verify and set the shape of the GTrsf Other or CompoundTrsf Ex
SetForm(): void;

// Returns the translation part of the GTrsf
TranslationPart(): gp_XYZ;

// Computes the vectorial part of the GTrsf
VectorialPart(): gp_Mat;

// Returns the coefficients of the global matrix of transformation
Value(theRow: number, theCol: number): number;

Invert(): void;

// Computes the reverse transformation
Inverted(): gp_GTrsf;

// Computes the transformation composed from theT and <me>
Multiplied(theT: gp_GTrsf): gp_GTrsf;

// Computes the transformation composed with <me> and theT
Multiply(theT: gp_GTrsf): void;

// Computes the product of the transformation theT and this transformation and assigns the result to this transformation
PreMultiply(theT: gp_GTrsf): void;

Power(theN: number): void;

// Computes
Powered(theN: number): gp_GTrsf;

// Transforms a triplet XYZ with a GTrsf
Transforms(theCoord: gp_XYZ): void;
Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
Transforms(theCoord: gp_XYZ): void;
Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

Trsf(): gp_Trsf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a non persistent transformation in 2D space
gp_GTrsf2d: declare class gp_GTrsf2d

constructor

// Changes this transformation into an affinity of ratio theRatio with respect to the axis theA
SetAffinity(theA: gp_Ax2d, theRatio: number): void;

// Replaces the coefficient (theRow, theCol) of the matrix representing this transformation by theValue, Raises OutOfRange if theRow < 1 or theRow > 2 or theCol < 1 or theCol > 3
SetValue(theRow: number, theCol: number, theValue: number): void;

// Replaces the translation part of this transformation by the coordinates of the number pair theCoord
SetTranslationPart(theCoord: gp_XY): void;

// Assigns the vectorial and translation parts of theT to this transformation
SetTrsf2d(theT: gp_Trsf2d): void;

// Replaces the vectorial part of this transformation by theMatrix
SetVectorialPart(theMatrix: gp_Mat2d): void;

// Returns true if the determinant of the vectorial part of this transformation is negative
IsNegative(): boolean;

// Returns true if this transformation is singular (and therefore, cannot be inverted)
IsSingular(): boolean;

// Returns the nature of the transformation
Form(): gp_TrsfForm;

// Returns the translation part of the GTrsf2d
TranslationPart(): gp_XY;

// Computes the vectorial part of the GTrsf2d
VectorialPart(): gp_Mat2d;

// Returns the coefficients of the global matrix of transformation
Value(theRow: number, theCol: number): number;

Invert(): void;

// Computes the reverse transformation
Inverted(): gp_GTrsf2d;

// Computes the transformation composed with theT and <me>
Multiplied(theT: gp_GTrsf2d): gp_GTrsf2d;

Multiply(theT: gp_GTrsf2d): void;

// Computes the product of the transformation theT and this transformation, and assigns the result to this transformation
PreMultiply(theT: gp_GTrsf2d): void;

Power(theN: number): void;

// Computes the following composition of transformations <me> _ <me> _ .......\* <me>, theN time
Powered(theN: number): gp_GTrsf2d;

// Applies this transformation to the coordinates
Transforms(theCoord: gp_XY): void;
Transforms(theX?: number, theY?: number): { theX: number; theY: number };
Transforms(theCoord: gp_XY): void;
Transforms(theX?: number, theY?: number): { theX: number; theY: number };

Transformed(theCoord: gp_XY): gp_XY;

// Converts this transformation into a {@link gp_Trsf2d`gp_Trsf2d`} transformation
Trsf2d(): gp_Trsf2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
