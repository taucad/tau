# libcascade — gp (4)

5 top-level symbols. Signatures are verbatim typescript.

// Describes a branch of a hyperbola in 3D space
gp_Hypr: declare class gp_Hypr

constructor

// Modifies this hyperbola, by redefining its local coordinate system so that
SetAxis(theA1: gp_Ax1): void;

// Modifies this hyperbola, by redefining its local coordinate system so that its origin becomes theP
SetLocation(theP: gp_Pnt): void;

// Modifies the major radius of this hyperbola
SetMajorRadius(theMajorRadius: number): void;

// Modifies the minor radius of this hyperbola
SetMinorRadius(theMinorRadius: number): void;

// Modifies this hyperbola, by redefining its local coordinate system so that it becomes A2
SetPosition(theA2: gp_Ax2): void;

// In the local coordinate system of the hyperbola the equation of the hyperbola is (X*X)/(A*A) - (Y*Y)/(B*B) = 1.0 and the equation of the first asymptote is Y = (B/A)\*X where A is the major radius and B is the minor radius
Asymptote1(): gp_Ax1;

// In the local coordinate system of the hyperbola the equation of the hyperbola is (X*X)/(A*A) - (Y*Y)/(B*B) = 1.0 and the equation of the first asymptote is Y = -(B/A)\*X
Asymptote2(): gp_Ax1;

// Returns the axis passing through the center, and normal to the plane of this hyperbola
Axis(): gp_Ax1;

// Computes the branch of hyperbola which is on the positive side of the "YAxis" of <me>
ConjugateBranch1(): gp_Hypr;

// Computes the branch of hyperbola which is on the negative side of the "YAxis" of <me>
ConjugateBranch2(): gp_Hypr;

// This directrix is the line normal to the XAxis of the hyperbola in the local plane (Z = 0) at a distance d = MajorRadius / e from the center of the hyperbola, where e is the eccentricity of the hyperbola
Directrix1(): gp_Ax1;

// This line is obtained by the symmetrical transformation of "Directrix1" with respect to the "YAxis" of the hyperbola
Directrix2(): gp_Ax1;

// Returns the eccentricity of the hyperbola (e > 1)
Eccentricity(): number;

// Computes the focal distance
Focal(): number;

// Returns the first focus of the hyperbola
Focus1(): gp_Pnt;

// Returns the second focus of the hyperbola
Focus2(): gp_Pnt;

// Returns the location point of the hyperbola
Location(): gp_Pnt;

// Returns the major radius of the hyperbola
MajorRadius(): number;

// Returns the minor radius of the hyperbola
MinorRadius(): number;

// Returns the branch of hyperbola obtained by doing the symmetrical transformation of <me> with respect to the "YAxis" of <me>
OtherBranch(): gp_Hypr;

// Returns p = (e _ e - 1) _ MajorRadius where e is the eccentricity of the hyperbola
Parameter(): number;

// Returns the coordinate system of the hyperbola
Position(): gp_Ax2;

// Computes an axis, whose
XAxis(): gp_Ax1;

// Computes an axis, whose
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

// Performs the symmetrical transformation of an hyperbola with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Hypr;
Mirrored(theA1: gp_Ax1): gp_Hypr;
Mirrored(theA2: gp_Ax2): gp_Hypr;
Mirrored(theP: gp_Pnt): gp_Hypr;
Mirrored(theA1: gp_Ax1): gp_Hypr;
Mirrored(theA2: gp_Ax2): gp_Hypr;
Mirrored(theP: gp_Pnt): gp_Hypr;
Mirrored(theA1: gp_Ax1): gp_Hypr;
Mirrored(theA2: gp_Ax2): gp_Hypr;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates an hyperbola
Rotated(theA1: gp_Ax1, theAng: number): gp_Hypr;

Scale(theP: gp_Pnt, theS: number): void;

// Scales an hyperbola
Scaled(theP: gp_Pnt, theS: number): gp_Hypr;

Transform(theT: gp_Trsf): void;

// Transforms an hyperbola with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Hypr;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates an hyperbola in the direction of the vector theV
Translated(theV: gp_Vec): gp_Hypr;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Hypr;
Translated(theV: gp_Vec): gp_Hypr;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Hypr;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a branch of a hyperbola in the plane (2D space)
gp_Hypr2d: declare class gp_Hypr2d

constructor

// Modifies this hyperbola, by redefining its local coordinate system so that its origin becomes theP
SetLocation(theP: gp_Pnt2d): void;

// Modifies the major or minor radius of this hyperbola
SetMajorRadius(theMajorRadius: number): void;

// Modifies the major or minor radius of this hyperbola
SetMinorRadius(theMinorRadius: number): void;

// Modifies this hyperbola, by redefining its local coordinate system so that it becomes theA
SetAxis(theA: gp_Ax22d): void;

// Changes the major axis of the hyperbola
SetXAxis(theA: gp_Ax2d): void;

// Changes the minor axis of the hyperbola.The minor axis is recomputed and the location of the hyperbola too
SetYAxis(theA: gp_Ax2d): void;

// In the local coordinate system of the hyperbola the equation of the hyperbola is (X*X)/(A*A) - (Y*Y)/(B*B) = 1.0 and the equation of the first asymptote is Y = (B/A)\*X where A is the major radius of the hyperbola and B the minor radius of the hyperbola
Asymptote1(): gp_Ax2d;

// In the local coordinate system of the hyperbola the equation of the hyperbola is (X*X)/(A*A) - (Y*Y)/(B*B) = 1.0 and the equation of the first asymptote is Y = -(B/A)\*X where A is the major radius of the hyperbola and B the minor radius of the hyperbola
Asymptote2(): gp_Ax2d;

// Computes the coefficients of the implicit equation of the hyperbola
Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

// Computes the branch of hyperbola which is on the positive side of the "YAxis" of <me>
ConjugateBranch1(): gp_Hypr2d;

// Computes the branch of hyperbola which is on the negative side of the "YAxis" of <me>
ConjugateBranch2(): gp_Hypr2d;

// Computes the directrix which is the line normal to the XAxis of the hyperbola in the local plane (Z = 0) at a distance d = MajorRadius / e from the center of the hyperbola, where e is the eccentricity of the hyperbola
Directrix1(): gp_Ax2d;

// This line is obtained by the symmetrical transformation of "Directrix1" with respect to the "YAxis" of the hyperbola
Directrix2(): gp_Ax2d;

// Returns the eccentricity of the hyperbola (e > 1)
Eccentricity(): number;

// Computes the focal distance
Focal(): number;

// Returns the first focus of the hyperbola
Focus1(): gp_Pnt2d;

// Returns the second focus of the hyperbola
Focus2(): gp_Pnt2d;

// Returns the location point of the hyperbola
Location(): gp_Pnt2d;

// Returns the major radius of the hyperbola (it is the radius corresponding to the "XAxis" of the hyperbola)
MajorRadius(): number;

// Returns the minor radius of the hyperbola (it is the radius corresponding to the "YAxis" of the hyperbola)
MinorRadius(): number;

// Returns the branch of hyperbola obtained by doing the symmetrical transformation of <me> with respect to the "YAxis" of <me>
OtherBranch(): gp_Hypr2d;

// Returns p = (e _ e - 1) _ MajorRadius where e is the eccentricity of the hyperbola
Parameter(): number;

// Returns the axisplacement of the hyperbola
Axis(): gp_Ax22d;

// Computes an axis whose
XAxis(): gp_Ax2d;

// Computes an axis whose
YAxis(): gp_Ax2d;

Reverse(): void;

// Reverses the orientation of the local coordinate system of this hyperbola (the "Y Axis" is reversed)
Reversed(): gp_Hypr2d;

// Returns true if the local coordinate system is direct and false in the other case
IsDirect(): boolean;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

// Performs the symmetrical transformation of an hyperbola with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt2d): gp_Hypr2d;
Mirrored(theA: gp_Ax2d): gp_Hypr2d;
Mirrored(theP: gp_Pnt2d): gp_Hypr2d;
Mirrored(theA: gp_Ax2d): gp_Hypr2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

// Rotates an hyperbola
Rotated(theP: gp_Pnt2d, theAng: number): gp_Hypr2d;

Scale(theP: gp_Pnt2d, theS: number): void;

// Scales an hyperbola
Scaled(theP: gp_Pnt2d, theS: number): gp_Hypr2d;

Transform(theT: gp_Trsf2d): void;

// Transforms an hyperbola with the transformation theT from class Trsf2d
Transformed(theT: gp_Trsf2d): gp_Hypr2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

// Translates an hyperbola in the direction of the vector theV
Translated(theV: gp_Vec2d): gp_Hypr2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Hypr2d;
Translated(theV: gp_Vec2d): gp_Hypr2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Hypr2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a line in 3D space
gp_Lin: declare class gp_Lin

constructor

Reverse(): void;

// Reverses the direction of the line
Reversed(): gp_Lin;

// Changes the direction of the line
SetDirection(theV: gp_Dir): void;

// Changes the location point (origin) of the line
SetLocation(theP: gp_Pnt): void;

// Complete redefinition of the line
SetPosition(theA1: gp_Ax1): void;

// Returns the direction of the line
Direction(): gp_Dir;

// Returns the location point (origin) of the line
Location(): gp_Pnt;

// Returns the axis placement one axis with the same location and direction as <me>
Position(): gp_Ax1;

// Computes the angle between two lines in radians
Angle(theOther: gp_Lin): number;

// Returns true if this line contains the point theP, that is, if the distance between point theP and this line is less than or equal to theLinearTolerance.
Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;

// Computes the distance between <me> and the point theP
Distance(theP: gp_Pnt): number;
Distance(theOther: gp_Lin): number;
Distance(theP: gp_Pnt): number;
Distance(theOther: gp_Lin): number;

// Computes the square distance between <me> and the point theP
SquareDistance(theP: gp_Pnt): number;
SquareDistance(theOther: gp_Lin): number;
SquareDistance(theP: gp_Pnt): number;
SquareDistance(theOther: gp_Lin): number;

// Computes the line normal to the direction of <me>, passing through the point theP
Normal(theP: gp_Pnt): gp_Lin;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of a line with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Lin;
Mirrored(theA1: gp_Ax1): gp_Lin;
Mirrored(theA2: gp_Ax2): gp_Lin;
Mirrored(theP: gp_Pnt): gp_Lin;
Mirrored(theA1: gp_Ax1): gp_Lin;
Mirrored(theA2: gp_Ax2): gp_Lin;
Mirrored(theP: gp_Pnt): gp_Lin;
Mirrored(theA1: gp_Ax1): gp_Lin;
Mirrored(theA2: gp_Ax2): gp_Lin;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a line
Rotated(theA1: gp_Ax1, theAng: number): gp_Lin;

Scale(theP: gp_Pnt, theS: number): void;

// Scales a line
Scaled(theP: gp_Pnt, theS: number): gp_Lin;

Transform(theT: gp_Trsf): void;

// Transforms a line with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Lin;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates a line in the direction of the vector theV
Translated(theV: gp_Vec): gp_Lin;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Lin;
Translated(theV: gp_Vec): gp_Lin;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Lin;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a line in 2D space
gp_Lin2d: declare class gp_Lin2d

constructor

Reverse(): void;

// Reverses the positioning axis of this line
Reversed(): gp_Lin2d;

// Changes the direction of the line
SetDirection(theV: gp_Dir2d): void;

// Changes the origin of the line
SetLocation(theP: gp_Pnt2d): void;

// Complete redefinition of the line
SetPosition(theA: gp_Ax2d): void;

// Returns the normalized coefficients of the line
Coefficients(theA?: number, theB?: number, theC?: number): { theA: number; theB: number; theC: number };

// Returns the direction of the line
Direction(): gp_Dir2d;

// Returns the location point (origin) of the line
Location(): gp_Pnt2d;

// Returns the axis placement one axis with the same location and direction as <me>
Position(): gp_Ax2d;

// Computes the angle between two lines in radians
Angle(theOther: gp_Lin2d): number;

// Returns true if this line contains the point theP, that is, if the distance between point theP and this line is less than or equal to theLinearTolerance
Contains(theP: gp_Pnt2d, theLinearTolerance: number): boolean;

// Computes the distance between <me> and the point <theP>
Distance(theP: gp_Pnt2d): number;
Distance(theOther: gp_Lin2d): number;
Distance(theP: gp_Pnt2d): number;
Distance(theOther: gp_Lin2d): number;

// Computes the square distance between <me> and the point <theP>
SquareDistance(theP: gp_Pnt2d): number;
SquareDistance(theOther: gp_Lin2d): number;
SquareDistance(theP: gp_Pnt2d): number;
SquareDistance(theOther: gp_Lin2d): number;

// Computes the line normal to the direction of <me>, passing through the point <theP>
Normal(theP: gp_Pnt2d): gp_Lin2d;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

// Performs the symmetrical transformation of a line with respect to the point <theP> which is the center of the symmetry
Mirrored(theP: gp_Pnt2d): gp_Lin2d;
Mirrored(theA: gp_Ax2d): gp_Lin2d;
Mirrored(theP: gp_Pnt2d): gp_Lin2d;
Mirrored(theA: gp_Ax2d): gp_Lin2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

// Rotates a line
Rotated(theP: gp_Pnt2d, theAng: number): gp_Lin2d;

Scale(theP: gp_Pnt2d, theS: number): void;

// Scales a line
Scaled(theP: gp_Pnt2d, theS: number): gp_Lin2d;

Transform(theT: gp_Trsf2d): void;

// Transforms a line with the transformation theT from class Trsf2d
Transformed(theT: gp_Trsf2d): gp_Lin2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

// Translates a line in the direction of the vector theV
Translated(theV: gp_Vec2d): gp_Lin2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Lin2d;
Translated(theV: gp_Vec2d): gp_Lin2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Lin2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a three column, three row matrix
gp_Mat: declare class gp_Mat

constructor

// Assigns the three coordinates of theValue to the column of index theCol of this matrix
SetCol(theCol: number, theValue: gp_XYZ): void;

// Assigns the number triples theCol1, theCol2, theCol3 to the three columns of this matrix
SetCols(theCol1: gp_XYZ, theCol2: gp_XYZ, theCol3: gp_XYZ): void;

// Modifies the matrix M so that applying it to any number triple (X, Y, Z) produces the same result as the cross product of theRef and the number triple (X, Y, Z)
SetCross(theRef: gp_XYZ): void;

// Modifies the main diagonal of the matrix
SetDiagonal(theX1: number, theX2: number, theX3: number): void;

// Modifies this matrix so that applying it to any number triple (X, Y, Z) produces the same result as the scalar product of theRef and the number triple (X, Y, Z)
SetDot(theRef: gp_XYZ): void;

// Modifies this matrix so that it represents the Identity matrix
SetIdentity(): void;

// Modifies this matrix so that it represents a rotation
SetRotation(theAxis: gp_XYZ, theAng: number): void;

// Assigns the three coordinates of Value to the row of index theRow of this matrix
SetRow(theRow: number, theValue: gp_XYZ): void;

// Assigns the number triples theRow1, theRow2, theRow3 to the three rows of this matrix
SetRows(theRow1: gp_XYZ, theRow2: gp_XYZ, theRow3: gp_XYZ): void;

// Modifies the matrix so that it represents a scaling transformation, where theS is the scale factor
SetScale(theS: number): void;

// Assigns <theValue> to the coefficient of row theRow, column theCol of this matrix
SetValue(theRow: number, theCol: number, theValue: number): void;

// Returns the column of theCol index
Column(theCol: number): gp_XYZ;

// Computes the determinant of the matrix
Determinant(): number;

// Returns the main diagonal of the matrix
Diagonal(): gp_XYZ;

// returns the row of theRow index
Row(theRow: number): gp_XYZ;

// Returns the coefficient of range (theRow, theCol) Raises OutOfRange if theRow < 1 or theRow > 3 or theCol < 1 or theCol > 3
Value(theRow: number, theCol: number): number;

// Returns the coefficient of range (theRow, theCol) Raises OutOfRange if theRow < 1 or theRow > 3 or theCol < 1 or theCol > 3
ChangeValue(theRow: number, theCol: number): number;

// The Gauss LU decomposition is used to invert the matrix (see Math package) so the matrix is considered as singular if the largest pivot found is lower or equal to Resolution from gp
IsSingular(): boolean;

Add(theOther: gp_Mat): void;

// Computes the sum of this matrix and the matrix theOther for each coefficient of the matrix
Added(theOther: gp_Mat): gp_Mat;

Divide(theScalar: number): void;

// Divides all the coefficients of the matrix by Scalar
Divided(theScalar: number): gp_Mat;

Invert(): void;

// Inverses the matrix and raises if the matrix is singular
Inverted(): gp_Mat;

// Computes the product of two matrices <me> \* <Other>
Multiplied(theOther: gp_Mat): gp_Mat;
Multiplied(theScalar: number): gp_Mat;
Multiplied(theOther: gp_Mat): gp_Mat;
Multiplied(theScalar: number): gp_Mat;

// Computes the product of two matrices <me> = <Other> \* <me>
Multiply(theOther: gp_Mat): void;
Multiply(theScalar: number): void;
Multiply(theOther: gp_Mat): void;
Multiply(theScalar: number): void;

PreMultiply(theOther: gp_Mat): void;

Power(N: number): void;

// Computes <me> = <me> _ <me> _ .......\* <me>, theN time
Powered(theN: number): gp_Mat;

Subtract(theOther: gp_Mat): void;

// cOmputes for each coefficient of the matrix
Subtracted(theOther: gp_Mat): gp_Mat;

Transpose(): void;

// Transposes the matrix
Transposed(): gp_Mat;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
