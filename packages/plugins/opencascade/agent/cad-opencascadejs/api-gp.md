# libcascade — gp

6 top-level symbols. Signatures are verbatim typescript.

// The geometric processor package, called gp, provides an implementation of entities used
gp: declare class gp

// Method of package gp
static Resolution(): number;

// Identifies a Cartesian point with coordinates X = Y = Z = 0.0.0
static Origin(): gp_Pnt;

// Returns a unit vector with the combination (1,0,0)
static DX(): gp_Dir;

// Returns a unit vector with the combination (0,1,0)
static DY(): gp_Dir;

// Returns a unit vector with the combination (0,0,1)
static DZ(): gp_Dir;

// Identifies an axis where its origin is Origin and its unit vector coordinates X = 1.0, Y = Z = 0.0
static OX(): gp_Ax1;

// Identifies an axis where its origin is Origin and its unit vector coordinates Y = 1.0, X = Z = 0.0
static OY(): gp_Ax1;

// Identifies an axis where its origin is Origin and its unit vector coordinates Z = 1.0, Y = X = 0.0
static OZ(): gp_Ax1;

// Identifies a coordinate system where its origin is Origin, and its "main Direction" and "X Direction" coordinates Z = 1.0, X = Y =0.0 and X direction coordinates X = 1.0, Y = Z = 0.0
static XOY(): gp_Ax2;

// Identifies a coordinate system where its origin is Origin, and its "main Direction" and "X Direction" coordinates Y = 1.0, X = Z =0.0 and X direction coordinates Z = 1.0, X = Y = 0.0
static ZOX(): gp_Ax2;

// Identifies a coordinate system where its origin is Origin, and its "main Direction" and "X Direction" coordinates X = 1.0, Z = Y =0.0 and X direction coordinates Y = 1.0, X = Z = 0.0 In 2D space
static YOZ(): gp_Ax2;

// Identifies a Cartesian point with coordinates X = Y = 0.0
static Origin2d(): gp_Pnt2d;

// Returns a unit vector with the combinations (1,0)
static DX2d(): gp_Dir2d;

// Returns a unit vector with the combinations (0,1)
static DY2d(): gp_Dir2d;

// Identifies an axis where its origin is Origin2d and its unit vector coordinates are
static OX2d(): gp_Ax2d;

// Identifies an axis where its origin is Origin2d and its unit vector coordinates are Y = 1.0, X = 0.0
static OY2d(): gp_Ax2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an axis in 3D space
gp_Ax1: declare class gp_Ax1

constructor

// Assigns V as the "Direction" of this axis
SetDirection(theV: gp_Dir): void;

// Assigns P as the origin of this axis
SetLocation(theP: gp_Pnt): void;

// Returns the direction of <me>
Direction(): gp_Dir;

// Returns the location point of <me>
Location(): gp_Pnt;

// Returns True if
IsCoaxial(Other: gp_Ax1, AngularTolerance: number, LinearTolerance: number): boolean;

// Returns True if the direction of this and another axis are normal to each other
IsNormal(theOther: gp_Ax1, theAngularTolerance: number): boolean;

// Returns True if the direction of this and another axis are parallel with opposite orientation
IsOpposite(theOther: gp_Ax1, theAngularTolerance: number): boolean;

// Returns True if the direction of this and another axis are parallel with same orientation or opposite orientation
IsParallel(theOther: gp_Ax1, theAngularTolerance: number): boolean;

// Computes the angular value, in radians, between this.Direction() and theOther.Direction()
Angle(theOther: gp_Ax1): number;

// Reverses the unit vector of this axis and assigns the result to this axis
Reverse(): void;

// Reverses the unit vector of this axis and creates a new one
Reversed(): gp_Ax1;

// Performs the symmetrical transformation of an axis placement with respect to the point P which is the center of the symmetry and assigns the result to this axis
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;

// Performs the symmetrical transformation of an axis placement with respect to the point P which is the center of the symmetry and creates a new axis
Mirrored(P: gp_Pnt): gp_Ax1;
Mirrored(A1: gp_Ax1): gp_Ax1;
Mirrored(A2: gp_Ax2): gp_Ax1;
Mirrored(P: gp_Pnt): gp_Ax1;
Mirrored(A1: gp_Ax1): gp_Ax1;
Mirrored(A2: gp_Ax2): gp_Ax1;
Mirrored(P: gp_Pnt): gp_Ax1;
Mirrored(A1: gp_Ax1): gp_Ax1;
Mirrored(A2: gp_Ax2): gp_Ax1;

// Rotates this axis at an angle theAngRad (in radians) about the axis theA1 and assigns the result to this axis
Rotate(theA1: gp_Ax1, theAngRad: number): void;

// Rotates this axis at an angle theAngRad (in radians) about the axis theA1 and creates a new one
Rotated(theA1: gp_Ax1, theAngRad: number): gp_Ax1;

// Applies a scaling transformation to this axis with
Scale(theP: gp_Pnt, theS: number): void;

// Applies a scaling transformation to this axis with
Scaled(theP: gp_Pnt, theS: number): gp_Ax1;

// Applies the transformation theT to this axis and assigns the result to this axis
Transform(theT: gp_Trsf): void;

// Applies the transformation theT to this axis and creates a new one
Transformed(theT: gp_Trsf): gp_Ax1;

// Translates this axis by the vector theV, and assigns the result to this axis
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates this axis by the vector theV, and creates a new one
Translated(theV: gp_Vec): gp_Ax1;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax1;
Translated(theV: gp_Vec): gp_Ax1;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax1;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a right-handed coordinate system in 3D space
gp_Ax2: declare class gp_Ax2

constructor

// Assigns the origin and "main Direction" of the axis A1 to this coordinate system, then recomputes its "X Direction" and "Y Direction"
SetAxis(A1: gp_Ax1): void;

// Changes the "main Direction" of this coordinate system, then recomputes its "X Direction" and "Y Direction"
SetDirection(V: gp_Dir): void;

// Changes the "Location" point (origin) of <me>
SetLocation(theP: gp_Pnt): void;

// Changes the "Xdirection" of <me>
SetXDirection(theVx: gp_Dir): void;

// Changes the "Ydirection" of <me>
SetYDirection(theVy: gp_Dir): void;

// Computes the angular value, in radians, between the main direction of <me> and the main direction of <theOther>
Angle(theOther: gp_Ax2): number;

// Returns the main axis of <me>
Axis(): gp_Ax1;

// Returns the main direction of <me>
Direction(): gp_Dir;

// Returns the "Location" point (origin) of <me>
Location(): gp_Pnt;

// Returns the "XDirection" of <me>
XDirection(): gp_Dir;

// Returns the "YDirection" of <me>
YDirection(): gp_Dir;

// Returns True if
IsCoplanar(Other: gp_Ax2, LinearTolerance: number, AngularTolerance: number): boolean;
IsCoplanar(A1: gp_Ax1, LinearTolerance: number, AngularTolerance: number): boolean;
IsCoplanar(Other: gp_Ax2, LinearTolerance: number, AngularTolerance: number): boolean;
IsCoplanar(A1: gp_Ax1, LinearTolerance: number, AngularTolerance: number): boolean;

// Performs a symmetrical transformation of this coordinate system with respect to
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;
Mirror(P: gp_Pnt): void;
Mirror(A1: gp_Ax1): void;
Mirror(A2: gp_Ax2): void;

// Performs a symmetrical transformation of this coordinate system with respect to
Mirrored(P: gp_Pnt): gp_Ax2;
Mirrored(A1: gp_Ax1): gp_Ax2;
Mirrored(A2: gp_Ax2): gp_Ax2;
Mirrored(P: gp_Pnt): gp_Ax2;
Mirrored(A1: gp_Ax1): gp_Ax2;
Mirrored(A2: gp_Ax2): gp_Ax2;
Mirrored(P: gp_Pnt): gp_Ax2;
Mirrored(A1: gp_Ax1): gp_Ax2;
Mirrored(A2: gp_Ax2): gp_Ax2;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates an axis placement
Rotated(theA1: gp_Ax1, theAng: number): gp_Ax2;

Scale(theP: gp_Pnt, theS: number): void;

// Applies a scaling transformation on the axis placement
Scaled(theP: gp_Pnt, theS: number): gp_Ax2;

Transform(theT: gp_Trsf): void;

// Transforms an axis placement with a Trsf
Transformed(theT: gp_Trsf): gp_Ax2;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates an axis plaxement in the direction of the vector <theV>
Translated(theV: gp_Vec): gp_Ax2;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax2;
Translated(theV: gp_Vec): gp_Ax2;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax2;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a coordinate system in a plane (2D space)
gp_Ax22d: declare class gp_Ax22d

constructor

// Assigns the origin and the two unit vectors of the coordinate system theA1 to this coordinate system
SetAxis(theA1: gp_Ax22d): void;

// Changes the XAxis and YAxis ("Location" point and "Direction") of <me>
SetXAxis(theA1: gp_Ax2d): void;

// Changes the XAxis and YAxis ("Location" point and "Direction") of <me>
SetYAxis(theA1: gp_Ax2d): void;

// Changes the "Location" point (origin) of <me>
SetLocation(theP: gp_Pnt2d): void;

// Assigns theVx to the "X Direction" of this coordinate system
SetXDirection(theVx: gp_Dir2d): void;

// Assigns theVy to the "Y Direction" of this coordinate system
SetYDirection(theVy: gp_Dir2d): void;

// Returns an axis, for which
XAxis(): gp_Ax2d;

// Returns an axis, for which
YAxis(): gp_Ax2d;

// Returns the "Location" point (origin) of <me>
Location(): gp_Pnt2d;

// Returns the "XDirection" of <me>
XDirection(): gp_Dir2d;

// Returns the "YDirection" of <me>
YDirection(): gp_Dir2d;

Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;
Mirror(theP: gp_Pnt2d): void;
Mirror(theA: gp_Ax2d): void;

// Performs the symmetrical transformation of an axis placement with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt2d): gp_Ax22d;
Mirrored(theA: gp_Ax2d): gp_Ax22d;
Mirrored(theP: gp_Pnt2d): gp_Ax22d;
Mirrored(theA: gp_Ax2d): gp_Ax22d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

// Rotates an axis placement
Rotated(theP: gp_Pnt2d, theAng: number): gp_Ax22d;

Scale(theP: gp_Pnt2d, theS: number): void;

// Applies a scaling transformation on the axis placement
Scaled(theP: gp_Pnt2d, theS: number): gp_Ax22d;

Transform(theT: gp_Trsf2d): void;

// Transforms an axis placement with a Trsf
Transformed(theT: gp_Trsf2d): gp_Ax22d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

// Translates an axis plaxement in the direction of the vector <theV>
Translated(theV: gp_Vec2d): gp_Ax22d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax22d;
Translated(theV: gp_Vec2d): gp_Ax22d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax22d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes an axis in the plane (2D space)
gp_Ax2d: declare class gp_Ax2d

constructor

// Changes the "Location" point (origin) of <me>
SetLocation(theP: gp_Pnt2d): void;

// Changes the direction of <me>
SetDirection(theV: gp_Dir2d): void;

// Returns the origin of <me>
Location(): gp_Pnt2d;

// Returns the direction of <me>
Direction(): gp_Dir2d;

// Returns True if
IsCoaxial(Other: gp_Ax2d, AngularTolerance: number, LinearTolerance: number): boolean;

// Returns true if this axis and the axis theOther are normal to each other
IsNormal(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

// Returns true if this axis and the axis theOther are parallel, and have opposite orientations
IsOpposite(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

// Returns true if this axis and the axis theOther are parallel, and have either the same or opposite orientations
IsParallel(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

// Computes the angle, in radians, between this axis and the axis theOther
Angle(theOther: gp_Ax2d): number;

// Reverses the direction of <me> and assigns the result to this axis
Reverse(): void;

// Computes a new axis placement with a direction opposite to the direction of <me>
Reversed(): gp_Ax2d;

Mirror(P: gp_Pnt2d): void;
Mirror(A: gp_Ax2d): void;
Mirror(P: gp_Pnt2d): void;
Mirror(A: gp_Ax2d): void;

// Performs the symmetrical transformation of an axis placement with respect to the point P which is the center of the symmetry
Mirrored(P: gp_Pnt2d): gp_Ax2d;
Mirrored(A: gp_Ax2d): gp_Ax2d;
Mirrored(P: gp_Pnt2d): gp_Ax2d;
Mirrored(A: gp_Ax2d): gp_Ax2d;

Rotate(theP: gp_Pnt2d, theAng: number): void;

// Rotates an axis placement
Rotated(theP: gp_Pnt2d, theAng: number): gp_Ax2d;

Scale(P: gp_Pnt2d, S: number): void;

// Applies a scaling transformation on the axis placement
Scaled(theP: gp_Pnt2d, theS: number): gp_Ax2d;

Transform(theT: gp_Trsf2d): void;

// Transforms an axis placement with a Trsf
Transformed(theT: gp_Trsf2d): gp_Ax2d;

Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
Translate(theV: gp_Vec2d): void;
Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

// Translates an axis placement in the direction of the vector theV
Translated(theV: gp_Vec2d): gp_Ax2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax2d;
Translated(theV: gp_Vec2d): gp_Ax2d;
Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a coordinate system in 3D space
gp_Ax3: declare class gp_Ax3

constructor

// Reverses the X direction of <me>
XReverse(): void;

// Reverses the Y direction of <me>
YReverse(): void;

// Reverses the Z direction of <me>
ZReverse(): void;

// Assigns the origin and "main Direction" of the axis theA1 to this coordinate system, then recomputes its "X Direction" and "Y Direction"
SetAxis(theA1: gp_Ax1): void;

// Changes the main direction of this coordinate system, then recomputes its "X Direction" and "Y Direction"
SetDirection(theV: gp_Dir): void;

// Changes the "Location" point (origin) of <me>
SetLocation(theP: gp_Pnt): void;

// Changes the "Xdirection" of <me>
SetXDirection(theVx: gp_Dir): void;

// Changes the "Ydirection" of <me>
SetYDirection(theVy: gp_Dir): void;

// Computes the angular value between the main direction of <me> and the main direction of <theOther>
Angle(theOther: gp_Ax3): number;

// Returns the main axis of <me>
Axis(): gp_Ax1;

// Computes a right-handed coordinate system with the same "X Direction" and "Y Direction" as those of this coordinate system, then recomputes the "main Direction"
Ax2(): gp_Ax2;

// Returns the main direction of <me>
Direction(): gp_Dir;

// Returns the "Location" point (origin) of <me>
Location(): gp_Pnt;

// Returns the "XDirection" of <me>
XDirection(): gp_Dir;

// Returns the "YDirection" of <me>
YDirection(): gp_Dir;

// Returns True if the coordinate system is right-handed
Direct(): boolean;

// Returns True if
IsCoplanar(theOther: gp_Ax3, theLinearTolerance: number, theAngularTolerance: number): boolean;
IsCoplanar(theA1: gp_Ax1, theLinearTolerance: number, theAngularTolerance: number): boolean;
IsCoplanar(theOther: gp_Ax3, theLinearTolerance: number, theAngularTolerance: number): boolean;
IsCoplanar(theA1: gp_Ax1, theLinearTolerance: number, theAngularTolerance: number): boolean;

Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;
Mirror(theP: gp_Pnt): void;
Mirror(theA1: gp_Ax1): void;
Mirror(theA2: gp_Ax2): void;

// Performs the symmetrical transformation of an axis placement with respect to the point theP which is the center of the symmetry
Mirrored(theP: gp_Pnt): gp_Ax3;
Mirrored(theA1: gp_Ax1): gp_Ax3;
Mirrored(theA2: gp_Ax2): gp_Ax3;
Mirrored(theP: gp_Pnt): gp_Ax3;
Mirrored(theA1: gp_Ax1): gp_Ax3;
Mirrored(theA2: gp_Ax2): gp_Ax3;
Mirrored(theP: gp_Pnt): gp_Ax3;
Mirrored(theA1: gp_Ax1): gp_Ax3;
Mirrored(theA2: gp_Ax2): gp_Ax3;

Rotate(theA1: gp_Ax1, theAng: number): void;

// Rotates an axis placement
Rotated(theA1: gp_Ax1, theAng: number): gp_Ax3;

Scale(theP: gp_Pnt, theS: number): void;

// Applies a scaling transformation on the axis placement
Scaled(theP: gp_Pnt, theS: number): gp_Ax3;

Transform(theT: gp_Trsf): void;

// Transforms an axis placement with a Trsf
Transformed(theT: gp_Trsf): gp_Ax3;

Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
Translate(theV: gp_Vec): void;
Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

// Translates an axis plaxement in the direction of the vector <theV>
Translated(theV: gp_Vec): gp_Ax3;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax3;
Translated(theV: gp_Vec): gp_Ax3;
Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax3;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
