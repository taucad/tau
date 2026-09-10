# libcascade — GProp

11 top-level symbols. Signatures are verbatim typescript.

// This package defines algorithms to compute the global properties of a set of points, a curve, a surface, a solid (non infinite region of space delimited with geometric entities), a compound geometric system (heterogeneous composition of the previous entities)
GProp: declare class GProp

constructor

// methods of package Computes the matrix Operator, referred to as the "Huyghens Operator" of a geometric system at the point Q of the space, using the following data
static HOperator(G: gp_Pnt, Q: gp_Pnt, Mass: number, Operator: gp_Mat): void;
// Operator: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the global properties of bounded curves in 3D space
GProp_CelGProps: declare class GProp_CelGProps extends GProp_GProps

constructor

SetLocation(CLocation: gp_Pnt): void;

Perform(C: gp_Circ, U1: number, U2: number): void;
Perform(C: gp_Lin, U1: number, U2: number): void;
Perform(C: gp_Circ, U1: number, U2: number): void;
Perform(C: gp_Lin, U1: number, U2: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements a general mechanism to compute the global properties of a "compound geometric system" in 3D space by composition of the global properties of elementary geometric entities such as a curve, surface, solid, or set of points
GProp_GProps: declare class GProp_GProps

constructor

// Either
Add(Item: GProp_GProps, Density?: number): void;
// Item: framework holding the global properties of the component to compose
// Density: density of the component (default 1.0)

// Returns the mass of the current system
Mass(): number;

// Returns the centre of mass of the current system
CentreOfMass(): gp_Pnt;

// Returns the matrix of inertia
MatrixOfInertia(): gp_Mat;

// Returns the static moments of inertia of the current system - i.e
StaticMoments(Ix?: number, Iy?: number, Iz?: number): { Ix: number; Iy: number; Iz: number };
// Ix: static moment of inertia about X
// Iy: static moment of inertia about Y
// Iz: static moment of inertia about Z

// Computes the moment of inertia of the system about the axis A
MomentOfInertia(A: gp_Ax1): number;
// A: axis about which the moment of inertia is computed

// Computes the principal properties of inertia of the current system
PrincipalProperties(): GProp_PrincipalProps;

// Returns the radius of gyration of the current system about the axis A
RadiusOfGyration(A: gp_Ax1): number;
// A: axis about which the radius of gyration is computed

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Analyzes a collection of 3D points to decide whether they are coincident, collinear, coplanar, or span 3D space, within a given tolerance
GProp_PEquation: declare class GProp_PEquation

constructor

// Returns the type of the fitted entity
GetType(): GProp_PEquation_Type;

// Returns true if points are coplanar within tolerance
IsPlanar(): boolean;

// Returns true if points are collinear within tolerance
IsLinear(): boolean;

// Returns true if points are coincident within tolerance
IsPoint(): boolean;

// Returns true if points span 3D space
IsSpace(): boolean;

// Returns the mean plane
Plane(): gp_Pln;

// Returns the mean line
Line(): gp_Lin;

// Returns the mean point
Point(): gp_Pnt;

// Returns a bounding box aligned with the principal axes
Box(theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;
// theP: corner of the box (minimum projection on principal axes) Mutated in place
// theV1: first box edge vector (along first principal axis) Mutated in place
// theV2: second box edge vector (along second principal axis) Mutated in place
// theV3: third box edge vector (along third principal axis) Mutated in place

// Returns the centre of mass of the cloud (always valid after construction)
Barycentre(): gp_Pnt;

// Returns the unit principal axis at `theIndex` (1, 2 or 3), ordered by eigenvalue
PrincipalAxis(theIndex: number): gp_Vec;

// Returns the extent (max - min projection) along principal axis `theIndex` (1, 2 or 3)
Extent(theIndex: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Type of geometric entity that best fits the cloud
GProp_PEquation_Type: typeof GProp_PEquation_Type[keyof typeof GProp_PEquation_Type]

// Computes global properties (mass, barycentre, inertia matrix) of a weighted set of 3D points
GProp_PGProps: declare class GProp_PGProps extends GProp_GProps

constructor

// Adds a point with unit mass
AddPoint(thePnt: gp_Pnt): void;
AddPoint(thePnt: gp_Pnt, theDensity: number): void;
AddPoint(thePnt: gp_Pnt): void;
AddPoint(thePnt: gp_Pnt, theDensity: number): void;

// Computes the barycentre of a set of points (unit mass)
static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };
static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };
static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };
static Barycentre(thePnts: NCollection_Array1_gp_Pnt): gp_Pnt;
static Barycentre(thePnts: NCollection_Array2_gp_Pnt): gp_Pnt;
static Barycentre(thePnts: NCollection_Array1_gp_Pnt, theDensity: NCollection_Array1_double, theMass: number, theG: gp_Pnt): { theMass: number };
static Barycentre(thePnts: NCollection_Array2_gp_Pnt, theDensity: NCollection_Array2_double, theMass: number, theG: gp_Pnt): { theMass: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A framework to present the principal properties of inertia of a system of which global properties are computed by a {@link GProp_GProps`GProp_GProps`} object
GProp_PrincipalProps: declare class GProp_PrincipalProps

constructor

// returns true if the geometric system has an axis of symmetry
HasSymmetryAxis(): boolean;
HasSymmetryAxis(aTol: number): boolean;
HasSymmetryAxis(): boolean;
HasSymmetryAxis(aTol: number): boolean;

// returns true if the geometric system has a point of symmetry
HasSymmetryPoint(): boolean;
HasSymmetryPoint(aTol: number): boolean;
HasSymmetryPoint(): boolean;
HasSymmetryPoint(aTol: number): boolean;

// Ixx, Iyy and Izz return the principal moments of inertia in the current system
Moments(Ixx?: number, Iyy?: number, Izz?: number): { Ixx: number; Iyy: number; Izz: number };

// returns the first axis of inertia
FirstAxisOfInertia(): gp_Vec;

// returns the second axis of inertia
SecondAxisOfInertia(): gp_Vec;

// returns the third axis of inertia
ThirdAxisOfInertia(): gp_Vec;

// Returns the principal radii of gyration Rxx, Ryy and Rzz are the radii of gyration of the current system about its three principal axes of inertia
RadiusOfGyration(Rxx?: number, Ryy?: number, Rzz?: number): { Rxx: number; Ryy: number; Rzz: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the global properties of a bounded elementary surface in 3D (surfaces from the gp package
GProp_SelGProps: declare class GProp_SelGProps extends GProp_GProps

constructor

SetLocation(SLocation: gp_Pnt): void;

Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GProp_UndefinedAxis: declare class GProp_UndefinedAxis extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Algorithms
GProp_ValueType: typeof GProp_ValueType[keyof typeof GProp_ValueType]

// Computes the global properties and the volume of a geometric solid (3D closed region of space)
GProp_VelGProps: declare class GProp_VelGProps extends GProp_GProps

constructor

SetLocation(VLocation: gp_Pnt): void;

Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Cylinder, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Cone, Alpha1: number, Alpha2: number, Z1: number, Z2: number): void;
Perform(S: gp_Sphere, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;
Perform(S: gp_Torus, Teta1: number, Teta2: number, Alpha1: number, Alpha2: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
