# libcascade — gp (2)

6 top-level symbols. Signatures are verbatim typescript.

// Describes a circle in 3D space
gp_Circ: declare class gp_Circ

constructor

// Changes the main axis of the circle
SetAxis(theA1: gp_Ax1): void;

// Changes the "Location" point (center) of the circle
SetLocation(theP: gp_Pnt): void;

// Changes the position of the circle
SetPosition(theA2: gp_Ax2): void;

// Modifies the radius of this circle
SetRadius(theRadius: number): void;

// Computes the area of the circle
Area(): number;

// Returns the main axis of the circle
Axis(): gp_Ax1;

// Computes the circumference of the circle
Length(): number;

// Returns the center of the circle
Location(): gp_Pnt;

// Returns the position of the circle
Position(): gp_Ax2;

// Returns the radius of this circle
Radius(): number;

// Returns the "XAxis" of the circle
XAxis(): gp_Ax1;

// Returns the "YAxis" of the circle
YAxis(): gp_Ax1;

// Computes the minimum of distance between the point theP and any point on the circumference of the circle
Distance(theP: gp_Pnt): number;

// Computes the square distance between <me> and the point theP
SquareDistance(theP: gp_Pnt): number;

// Returns True if the point theP is on the circumference
Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of a circle with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Circ;
Mirrored(theA1: gp_Ax1): gp_Circ;
Mirrored(theA2: gp_Ax2): gp_Circ;
Mirrored(theP: gp_Pnt): gp_Circ;
Mirrored(theA1: gp_Ax1): gp_Circ;
Mirrored(theA2: gp_Ax2): gp_Circ;
Mirrored(theP: gp_Pnt): gp_Circ;
Mirrored(theA1: gp_Ax1): gp_Circ;
Mirrored(theA2: gp_Ax2): gp_Circ;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a circle
Rotated(theA1: gp_Ax1, theAng: number): gp_Circ;

Scale(theP: gp_Pnt, theS: number): void;

// Scales a circle
Scaled(theP: gp_Pnt, theS: number): gp_Circ;

Transform(theT: gp_Trsf): void;

// Transforms a circle with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Circ;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates a circle in the direction of the vector theV
Translated(theV: gp_Vec): gp_Circ;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Circ;
Translated(theV: gp_Vec): gp_Circ;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Circ;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a circle in the plane (2D space)
gp_Circ2d: declare class gp_Circ2d

constructor

// Changes the location point (center) of the circle
SetLocation(theP: gp_Pnt2d): void;

// Changes the X axis of the circle
SetXAxis(theA: gp_Ax2d): void;

// Changes the X axis of the circle
SetAxis(theA: gp_Ax22d): void;

// Changes the Y axis of the circle
SetYAxis(theA: gp_Ax2d): void;

// Modifies the radius of this circle
SetRadius(theRadius: number): void;

// Computes the area of the circle
Area(): number;

// Returns the normalized coefficients from the implicit equation of the circle
Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

// Does <me> contain theP ? Returns True if the distance between theP and any point on the circumference of the circle is lower of equal to <theLinearTolerance>
Contains(theP: gp_Pnt2d, theLinearTolerance: number): boolean;

// Computes the minimum of distance between the point theP and any point on the circumference of the circle
Distance(theP: gp_Pnt2d): number;

// Computes the square distance between <me> and the point theP
SquareDistance(theP: gp_Pnt2d): number;

// computes the circumference of the circle
Length(): number;

// Returns the location point (center) of the circle
Location(): gp_Pnt2d;

// Returns the radius value of the circle
Radius(): number;

// returns the position of the circle
Axis(): gp_Ax22d;

// returns the position of the circle
Position(): gp_Ax22d;

// returns the X axis of the circle
XAxis(): gp_Ax2d;

// Returns the Y axis of the circle
YAxis(): gp_Ax2d;

// Reverses the orientation of the local coordinate system of this circle (the "Y Direction" is reversed) and therefore changes the implicit orientation of this circle
Reverse(): void;

// Reverses the orientation of the local coordinate system of this circle (the "Y Direction" is reversed) and therefore changes the implicit orientation of this circle
Reversed(): gp_Circ2d;

// Returns true if the local coordinate system is direct and false in the other case
IsDirect(): boolean;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

// Performs the symmetrical transformation of a circle with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt2d): gp_Circ2d;
Mirrored(theA: gp_Ax2d): gp_Circ2d;
Mirrored(theP: gp_Pnt2d): gp_Circ2d;
Mirrored(theA: gp_Ax2d): gp_Circ2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

// Rotates a circle
Rotated(theP: gp_Pnt2d, theAng: number): gp_Circ2d;

Scale(theP: gp_Pnt2d, theS: number): void;

// Scales a circle
Scaled(theP: gp_Pnt2d, theS: number): gp_Circ2d;

Transform(theT: gp_Trsf2d): void;

// Transforms a circle with the transformation theT from class Trsf2d
Transformed(theT: gp_Trsf2d): gp_Circ2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

// Translates a circle in the direction of the vector theV
Translated(theV: gp_Vec2d): gp_Circ2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Circ2d;
Translated(theV: gp_Vec2d): gp_Circ2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Circ2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an infinite conical surface
gp_Cone: declare class gp_Cone

constructor

// Changes the symmetry axis of the cone
SetAxis(theA1: gp_Ax1): void;

// Changes the location of the cone
SetLocation(theLoc: gp_Pnt): void;

// Changes the local coordinate system of the cone
SetPosition(theA3: gp_Ax3): void;

// Changes the radius of the cone in the reference plane of the cone
SetRadius(theR: number): void;

// Changes the semi-angle of the cone
SetSemiAngle(theAng: number): void;

// Computes the cone's top
Apex(): gp_Pnt;

// Reverses the U parametrization of the cone reversing the YAxis
UReverse(): void;

// Reverses the V parametrization of the cone reversing the ZAxis
VReverse(): void;

// Returns true if the local coordinate system of this cone is right-handed
Direct(): boolean;

// returns the symmetry axis of the cone
Axis(): gp_Ax1;

// Computes the coefficients of the implicit equation of the quadric in the absolute cartesian coordinates system
Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

// returns the "Location" point of the cone
Location(): gp_Pnt;

// Returns the local coordinates system of the cone
Position(): gp_Ax3;

// Returns the radius of the cone in the reference plane
RefRadius(): number;

// Returns the half-angle at the apex of this cone
SemiAngle(): number;

// Returns the XAxis of the reference plane
XAxis(): gp_Ax1;

// Returns the YAxis of the reference plane
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

// Performs the symmetrical transformation of a cone with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Cone;
Mirrored(theA1: gp_Ax1): gp_Cone;
Mirrored(theA2: gp_Ax2): gp_Cone;
Mirrored(theP: gp_Pnt): gp_Cone;
Mirrored(theA1: gp_Ax1): gp_Cone;
Mirrored(theA2: gp_Ax2): gp_Cone;
Mirrored(theP: gp_Pnt): gp_Cone;
Mirrored(theA1: gp_Ax1): gp_Cone;
Mirrored(theA2: gp_Ax2): gp_Cone;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a cone
Rotated(theA1: gp_Ax1, theAng: number): gp_Cone;

Scale(theP: gp_Pnt, theS: number): void;

// Scales a cone
Scaled(theP: gp_Pnt, theS: number): gp_Cone;

Transform(theT: gp_Trsf): void;

// Transforms a cone with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Cone;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates a cone in the direction of the vector theV
Translated(theV: gp_Vec): gp_Cone;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cone;
Translated(theV: gp_Vec): gp_Cone;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cone;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an infinite cylindrical surface
gp_Cylinder: declare class gp_Cylinder

constructor

// Changes the symmetry axis of the cylinder
SetAxis(theA1: gp_Ax1): void;

// Changes the location of the surface
SetLocation(theLoc: gp_Pnt): void;

// Change the local coordinate system of the surface
SetPosition(theA3: gp_Ax3): void;

// Modifies the radius of this cylinder
SetRadius(theR: number): void;

// Reverses the U parametrization of the cylinder reversing the YAxis
UReverse(): void;

// Reverses the V parametrization of the plane reversing the Axis
VReverse(): void;

// Returns true if the local coordinate system of this cylinder is right-handed
Direct(): boolean;

// Returns the symmetry axis of the cylinder
Axis(): gp_Ax1;

// Computes the coefficients of the implicit equation of the quadric in the absolute cartesian coordinate system
Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

// Returns the "Location" point of the cylinder
Location(): gp_Pnt;

// Returns the local coordinate system of the cylinder
Position(): gp_Ax3;

// Returns the radius of the cylinder
Radius(): number;

// Returns the axis X of the cylinder
XAxis(): gp_Ax1;

// Returns the axis Y of the cylinder
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

// Performs the symmetrical transformation of a cylinder with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Cylinder;
Mirrored(theA1: gp_Ax1): gp_Cylinder;
Mirrored(theA2: gp_Ax2): gp_Cylinder;
Mirrored(theP: gp_Pnt): gp_Cylinder;
Mirrored(theA1: gp_Ax1): gp_Cylinder;
Mirrored(theA2: gp_Ax2): gp_Cylinder;
Mirrored(theP: gp_Pnt): gp_Cylinder;
Mirrored(theA1: gp_Ax1): gp_Cylinder;
Mirrored(theA2: gp_Ax2): gp_Cylinder;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a cylinder
Rotated(theA1: gp_Ax1, theAng: number): gp_Cylinder;

Scale(theP: gp_Pnt, theS: number): void;

// Scales a cylinder
Scaled(theP: gp_Pnt, theS: number): gp_Cylinder;

Transform(theT: gp_Trsf): void;

// Transforms a cylinder with the transformation theT from class Trsf
Transformed(theT: gp_Trsf): gp_Cylinder;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates a cylinder in the direction of the vector theV
Translated(theV: gp_Vec): gp_Cylinder;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cylinder;
Translated(theV: gp_Vec): gp_Cylinder;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cylinder;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a unit vector in 3D space
gp_Dir: declare class gp_Dir

constructor

// For this unit vector, assigns the value Xi to
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number, theZv: number): void;
SetCoord(theIndex: number, theXi: number): void;
SetCoord(theXv: number, theYv: number, theZv: number): void;

// Assigns the given value to the X coordinate of this unit vector
SetX(theX: number): void;

// Assigns the given value to the Y coordinate of this unit vector
SetY(theY: number): void;

// Assigns the given value to the Z coordinate of this unit vector
SetZ(theZ: number): void;

// Assigns the three coordinates of theCoord to this unit vector
SetXYZ(theCoord: gp_XYZ): void;

// Returns the coordinate of range theIndex
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number, theZv?: number): { theXv: number; theYv: number; theZv: number };
Coord(theIndex: number): number;
Coord(theXv?: number, theYv?: number, theZv?: number): { theXv: number; theYv: number; theZv: number };

// Returns the X coordinate for a unit vector
X(): number;

// Returns the Y coordinate for a unit vector
Y(): number;

// Returns the Z coordinate for a unit vector
Z(): number;

// for this unit vector, returns its three coordinates as a number triple
XYZ(): gp_XYZ;

// Returns True if the angle between the two directions is lower or equal to theAngularTolerance
IsEqual(theOther: gp_Dir, theAngularTolerance: number): boolean;

// Returns True if the angle between this unit vector and the unit vector theOther is equal to Pi/2 (normal)
IsNormal(theOther: gp_Dir, theAngularTolerance: number): boolean;

// Returns True if the angle between this unit vector and the unit vector theOther is equal to Pi (opposite)
IsOpposite(theOther: gp_Dir, theAngularTolerance: number): boolean;

// Returns true if the angle between this unit vector and the unit vector theOther is equal to 0 or to Pi
IsParallel(theOther: gp_Dir, theAngularTolerance: number): boolean;

// Computes the angular value in radians between <me> and <theOther>
Angle(theOther: gp_Dir): number;

// Computes the angular value between <me> and <theOther>
AngleWithRef(theOther: gp_Dir, theVRef: gp_Dir): number;

// Computes the cross product between two directions Raises the exception ConstructionError if the two directions are parallel because the computed vector cannot be normalized to create a direction
Cross(theRight: gp_Dir): void;

// Computes the triple vector product
Crossed(theRight: gp_Dir): gp_Dir;

CrossCross(theV1: gp_Dir, theV2: gp_Dir): void;

// Computes the double vector product this ^ (theV1 ^ theV2)
CrossCrossed(theV1: gp_Dir, theV2: gp_Dir): gp_Dir;

// Computes the scalar product
Dot(theOther: gp_Dir): number;

// Computes the triple scalar product <me> \* (theV1 ^ theV2)
DotCross(theV1: gp_Dir, theV2: gp_Dir): number;

Reverse(): void;

// Reverses the orientation of a direction geometric transformations Performs the symmetrical transformation of a direction with respect to the direction V which is the center of the symmetry
Reversed(): gp_Dir;

Mirror(theV: gp_Dir): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theV: gp_Dir): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theV: gp_Dir): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of a direction with respect to the direction theV which is the center of the symmetry
Mirrored(theV: gp_Dir): gp_Dir;
Mirrored(theA1: gp_Ax1): gp_Dir;
Mirrored(theA2: gp_Ax2): gp_Dir;
Mirrored(theV: gp_Dir): gp_Dir;
Mirrored(theA1: gp_Ax1): gp_Dir;
Mirrored(theA2: gp_Ax2): gp_Dir;
Mirrored(theV: gp_Dir): gp_Dir;
Mirrored(theA1: gp_Ax1): gp_Dir;
Mirrored(theA2: gp_Ax2): gp_Dir;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates a direction
Rotated(theA1: gp_Ax1, theAng: number): gp_Dir;

Transform(theT: gp_Trsf): void;

// Transforms a direction with a "Trsf" from gp
Transformed(theT: gp_Trsf): gp_Dir;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link Standard `Standard`} directions in 3D space for optimized constexpr construction
gp_Dir_D: typeof gp_Dir_D[keyof typeof gp_Dir_D]
