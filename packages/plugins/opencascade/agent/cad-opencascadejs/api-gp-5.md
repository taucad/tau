# libcascade — gp (5)

5 top-level symbols. Signatures are verbatim typescript.

// Describes a two column, two row matrix
gp_Mat2d: declare class gp_Mat2d

constructor

// Assigns the two coordinates of theValue to the column of range theCol of this matrix Raises OutOfRange if theCol < 1 or theCol > 2
SetCol(theCol: number, theValue: gp_XY): void;

// Assigns the number pairs theCol1, theCol2 to the two columns of this matrix
SetCols(theCol1: gp_XY, theCol2: gp_XY): void;

// Modifies the main diagonal of the matrix
SetDiagonal(theX1: number, theX2: number): void;

// Modifies this matrix, so that it represents the Identity matrix
SetIdentity(): void;

// Modifies this matrix, so that it represents a rotation
SetRotation(theAng: number): void;

// Assigns the two coordinates of theValue to the row of index theRow of this matrix
SetRow(theRow: number, theValue: gp_XY): void;

// Assigns the number pairs theRow1, theRow2 to the two rows of this matrix
SetRows(theRow1: gp_XY, theRow2: gp_XY): void;

// Modifies the matrix such that it represents a scaling transformation, where theS is the scale factor
SetScale(theS: number): void;

// Assigns <theValue> to the coefficient of row theRow, column theCol of this matrix
SetValue(theRow: number, theCol: number, theValue: number): void;

// Returns the column of theCol index
Column(theCol: number): gp_XY;

// Computes the determinant of the matrix
Determinant(): number;

// Returns the main diagonal of the matrix
Diagonal(): gp_XY;

// Returns the row of index theRow
Row(theRow: number): gp_XY;

// Returns the coefficient of range (ttheheRow, theCol) Raises OutOfRange if theRow < 1 or theRow > 2 or theCol < 1 or theCol > 2
Value(theRow: number, theCol: number): number;

// Returns the coefficient of range (theRow, theCol) Raises OutOfRange if theRow < 1 or theRow > 2 or theCol < 1 or theCol > 2
ChangeValue(theRow: number, theCol: number): number;

// Returns true if this matrix is singular (and therefore, cannot be inverted)
IsSingular(): boolean;

Add(Other: gp_Mat2d): void;

// Computes the sum of this matrix and the matrix theOther.for each coefficient of the matrix
Added(theOther: gp_Mat2d): gp_Mat2d;

Divide(theScalar: number): void;

// Divides all the coefficients of the matrix by a scalar
Divided(theScalar: number): gp_Mat2d;

Invert(): void;

// Inverses the matrix and raises exception if the matrix is singular
Inverted(): gp_Mat2d;

Multiplied(theOther: gp_Mat2d): gp_Mat2d;
Multiplied(theScalar: number): gp_Mat2d;
Multiplied(theOther: gp_Mat2d): gp_Mat2d;
Multiplied(theScalar: number): gp_Mat2d;

// Computes the product of two matrices <me> \* <theOther> Multiplies all the coefficients of the matrix by a scalar
Multiply(theOther: gp_Mat2d): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_Mat2d): void;
Multiply(theScalar: number): void;

// Modifies this matrix by premultiplying it by the matrix Other <me> = theOther \* <me>
PreMultiply(theOther: gp_Mat2d): void;

Power(theN: number): void;

// computes <me> = <me> _ <me> _ .......\* <me>, theN time
Powered(theN: number): gp_Mat2d;

Subtract(theOther: gp_Mat2d): void;

// Computes for each coefficient of the matrix
Subtracted(theOther: gp_Mat2d): gp_Mat2d;

Transpose(): void;

// Transposes the matrix
Transposed(): gp_Mat2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a parabola in 3D space
gp_Parab: declare class gp_Parab

constructor

// Modifies this parabola by redefining its local coordinate system so that
SetAxis(theA1: gp_Ax1): void;

// Changes the focal distance of the parabola
SetFocal(theFocal: number): void;

// Changes the location of the parabola
SetLocation(theP: gp_Pnt): void;

// Changes the local coordinate system of the parabola
SetPosition(theA2: gp_Ax2): void;

// Returns the main axis of the parabola
Axis(): gp_Ax1;

// Computes the directrix of this parabola
Directrix(): gp_Ax1;

// Returns the distance between the vertex and the focus of the parabola
Focal(): number;

// - Computes the focus of the parabola
Focus(): gp_Pnt;

// Returns the vertex of the parabola
Location(): gp_Pnt;

// Computes the parameter of the parabola
Parameter(): number;

// Returns the local coordinate system of the parabola
Position(): gp_Ax2;

// Returns the symmetry axis of the parabola
XAxis(): gp_Ax1;

// It is an axis parallel to the directrix of the parabola
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

// Performs the symmetrical transformation of a parabola with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Parab;
Mirrored(theA1: gp_Ax1): gp_Parab;
Mirrored(theA2: gp_Ax2): gp_Parab;
Mirrored(theP: gp_Pnt): gp_Parab;
Mirrored(theA1: gp_Ax1): gp_Parab;
Mirrored(theA2: gp_Ax2): gp_Parab;
Mirrored(theP: gp_Pnt): gp_Parab;
Mirrored(theA1: gp_Ax1): gp_Parab;
Mirrored(theA2: gp_Ax2): gp_Parab;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a parabola
Rotated(theA1: gp_Ax1, theAng: number): gp_Parab;

Scale(theP: gp_Pnt, theS: number): void;

// Scales a parabola
Scaled(theP: gp_Pnt, theS: number): gp_Parab;

Transform(theT: gp_Trsf): void;

// Transforms a parabola with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Parab;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates a parabola in the direction of the vector theV
Translated(theV: gp_Vec): gp_Parab;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Parab;
Translated(theV: gp_Vec): gp_Parab;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Parab;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a parabola in the plane (2D space)
gp_Parab2d: declare class gp_Parab2d

constructor

// Changes the focal distance of the parabola Warnings
SetFocal(theFocal: number): void;

// Changes the "Location" point of the parabola
SetLocation(theP: gp_Pnt2d): void;

// Modifies this parabola, by redefining its local coordinate system so that its origin and "X Direction" become those of the axis MA
SetMirrorAxis(theA: gp_Ax2d): void;

// Changes the local coordinate system of the parabola
SetAxis(theA: gp_Ax22d): void;

// Computes the coefficients of the implicit equation of the parabola (in WCS - World Coordinate System)
Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

// Computes the directrix of the parabola
Directrix(): gp_Ax2d;

// Returns the distance between the vertex and the focus of the parabola
Focal(): number;

// Returns the focus of the parabola
Focus(): gp_Pnt2d;

// Returns the vertex of the parabola
Location(): gp_Pnt2d;

// Returns the symmetry axis of the parabola
MirrorAxis(): gp_Ax2d;

// Returns the local coordinate system of the parabola
Axis(): gp_Ax22d;

// Returns the distance between the focus and the directrix of the parabola
Parameter(): number;

Reverse(): void;

// Reverses the orientation of the local coordinate system of this parabola (the "Y Direction" is reversed)
Reversed(): gp_Parab2d;

// Returns true if the local coordinate system is direct and false in the other case
IsDirect(): boolean;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

// Performs the symmetrical transformation of a parabola with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt2d): gp_Parab2d;
Mirrored(theA: gp_Ax2d): gp_Parab2d;
Mirrored(theP: gp_Pnt2d): gp_Parab2d;
Mirrored(theA: gp_Ax2d): gp_Parab2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

// Rotates a parabola
Rotated(theP: gp_Pnt2d, theAng: number): gp_Parab2d;

Scale(theP: gp_Pnt2d, theS: number): void;

// Scales a parabola
Scaled(theP: gp_Pnt2d, theS: number): gp_Parab2d;

Transform(theT: gp_Trsf2d): void;

// Transforms an parabola with the transformation theT from class Trsf2d
Transformed(theT: gp_Trsf2d): gp_Parab2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

// Translates a parabola in the direction of the vectorthe theV
Translated(theV: gp_Vec2d): gp_Parab2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Parab2d;
Translated(theV: gp_Vec2d): gp_Parab2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Parab2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a plane
gp_Pln: declare class gp_Pln

constructor

// Returns the coefficients of the plane's cartesian equation
Coefficients(theA?: number, theB?: number, theC?: number, theD?: number): { theA: number; theB: number; theC: number; theD: number };

// Modifies this plane, by redefining its local coordinate system so that
SetAxis(theA1: gp_Ax1): void;

// Changes the origin of the plane
SetLocation(theLoc: gp_Pnt): void;

// Changes the local coordinate system of the plane
SetPosition(theA3: gp_Ax3): void;

// Reverses the U parametrization of the plane reversing the XAxis
UReverse(): void;

// Reverses the V parametrization of the plane reversing the YAxis
VReverse(): void;

// Returns true if the Ax3 is right handed
Direct(): boolean;

// Returns the plane's normal Axis
Axis(): gp_Ax1;

// Returns the plane's location (origin)
Location(): gp_Pnt;

// Returns the local coordinate system of the plane
Position(): gp_Ax3;

// Computes the distance between <me> and the point <theP>
Distance(theP: gp_Pnt): number;
Distance(theL: gp_Lin): number;
Distance(theOther: gp_Pln): number;
Distance(theP: gp_Pnt): number;
Distance(theL: gp_Lin): number;
Distance(theOther: gp_Pln): number;
Distance(theP: gp_Pnt): number;
Distance(theL: gp_Lin): number;
Distance(theOther: gp_Pln): number;

// Computes the signed distance between <me> and the point <theP>
SignedDistance(theP: gp_Pnt): number;
SignedDistance(theL: gp_Lin): number;
SignedDistance(theOther: gp_Pln): number;
SignedDistance(theP: gp_Pnt): number;
SignedDistance(theL: gp_Lin): number;
SignedDistance(theOther: gp_Pln): number;
SignedDistance(theP: gp_Pnt): number;
SignedDistance(theL: gp_Lin): number;
SignedDistance(theOther: gp_Pln): number;

// Computes the square distance between <me> and the point <theP>
SquareDistance(theP: gp_Pnt): number;
SquareDistance(theL: gp_Lin): number;
SquareDistance(theOther: gp_Pln): number;
SquareDistance(theP: gp_Pnt): number;
SquareDistance(theL: gp_Lin): number;
SquareDistance(theOther: gp_Pln): number;
SquareDistance(theP: gp_Pnt): number;
SquareDistance(theL: gp_Lin): number;
SquareDistance(theOther: gp_Pln): number;

// Returns the X axis of the plane
XAxis(): gp_Ax1;

// Returns the Y axis of the plane
YAxis(): gp_Ax1;

// Returns true if this plane contains the point theP
Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;
Contains(theL: gp_Lin, theLinearTolerance: number, theAngularTolerance: number): boolean;
Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;
Contains(theL: gp_Lin, theLinearTolerance: number, theAngularTolerance: number): boolean;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of a plane with respect to the point <theP> which is the center of the symmetry Warnings
Mirrored(theP: gp_Pnt): gp_Pln;
Mirrored(theA1: gp_Ax1): gp_Pln;
Mirrored(theA2: gp_Ax2): gp_Pln;
Mirrored(theP: gp_Pnt): gp_Pln;
Mirrored(theA1: gp_Ax1): gp_Pln;
Mirrored(theA2: gp_Ax2): gp_Pln;
Mirrored(theP: gp_Pnt): gp_Pln;
Mirrored(theA1: gp_Ax1): gp_Pln;
Mirrored(theA2: gp_Ax2): gp_Pln;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a plane
Rotated(theA1: gp_Ax1, theAng: number): gp_Pln;

Scale(theP: gp_Pnt, theS: number): void;

// Scales a plane
Scaled(theP: gp_Pnt, theS: number): gp_Pln;

Transform(theT: gp_Trsf): void;

// Transforms a plane with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Pln;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates a plane in the direction of the vector theV
Translated(theV: gp_Vec): gp_Pln;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pln;
Translated(theV: gp_Vec): gp_Pln;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pln;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a 3D cartesian point
gp_Pnt: declare class gp_Pnt

constructor

// Changes the coordinate of range theIndex
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXp: number, theYp: number, theZp: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXp: number, theYp: number, theZp: number): void;

// Assigns the given value to the X coordinate of this point
SetX(theX: number): void;

// Assigns the given value to the Y coordinate of this point
SetY(theY: number): void;

// Assigns the given value to the Z coordinate of this point
SetZ(theZ: number): void;

// Assigns the three coordinates of theCoord to this point
SetXYZ(theCoord: gp_XYZ): void;

// Returns the coordinate of corresponding to the value of theIndex
Coord(theIndex: number): number;
Coord(theXp?: number, theYp?: number, theZp?: number): { theXp: number; theYp: number; theZp: number };
Coord(): gp_XYZ;
Coord(theIndex: number): number;
Coord(theXp?: number, theYp?: number, theZp?: number): { theXp: number; theYp: number; theZp: number };
Coord(): gp_XYZ;
Coord(theIndex: number): number;
Coord(theXp?: number, theYp?: number, theZp?: number): { theXp: number; theYp: number; theZp: number };
Coord(): gp_XYZ;

// For this point, returns its X coordinate
X(): number;

// For this point, returns its Y coordinate
Y(): number;

// For this point, returns its Z coordinate
Z(): number;

// For this point, returns its three coordinates as a XYZ object
XYZ(): gp_XYZ;

// Returns the coordinates of this point
ChangeCoord(): gp_XYZ;

// Assigns the result of the following expression to this point (theAlpha*this + theBeta*theP) / (theAlpha + theBeta)
BaryCenter(theAlpha: number, theP: gp_Pnt, theBeta: number): void;

// Comparison Returns True if the distance between the two points is lower or equal to theLinearTolerance
IsEqual(theOther: gp_Pnt, theLinearTolerance: number): boolean;

// Computes the distance between two points
Distance(theOther: gp_Pnt): number;

// Computes the square distance between two points
SquareDistance(theOther: gp_Pnt): number;

// Performs the symmetrical transformation of a point with respect to the point theP which is the center of the symmetry
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of a point with respect to an axis placement which is the axis of the symmetry
Mirrored(theP: gp_Pnt): gp_Pnt;
Mirrored(theA1: gp_Ax1): gp_Pnt;
Mirrored(theA2: gp_Ax2): gp_Pnt;
Mirrored(theP: gp_Pnt): gp_Pnt;
Mirrored(theA1: gp_Ax1): gp_Pnt;
Mirrored(theA2: gp_Ax2): gp_Pnt;
Mirrored(theP: gp_Pnt): gp_Pnt;
Mirrored(theA1: gp_Ax1): gp_Pnt;
Mirrored(theA2: gp_Ax2): gp_Pnt;

Rotate(theA1: gp_Ax1, theAng: number): void;

Rotated(theA1: gp_Ax1, theAng: number): gp_Pnt;

// Scales a point
Scale(theP: gp_Pnt, theS: number): void;

Scaled(theP: gp_Pnt, theS: number): gp_Pnt;

// Transforms a point with the transformation T
Transform(theT: gp_Trsf): void;

Transformed(theT: gp_Trsf): gp_Pnt;

// Translates a point in the direction of the vector theV
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

Translated(theV: gp_Vec): gp_Pnt;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pnt;
Translated(theV: gp_Vec): gp_Pnt;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
