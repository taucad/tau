# libcascade — IGESGeom

14 top-level symbols. Signatures are verbatim typescript.

// This package consists of B-Rep and CSG Solid entities
IGESGeom: declare class IGESGeom

constructor

// Prepares dynamic data (Protocol, Modules) for this package
static Init(): void;

// Returns the Protocol for this Package
static Protocol(): IGESGeom_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESBSplineCurve, Type <126> Form <0-5> in package {@link IGESGeom`IGESGeom`} A parametric equation obtained by dividing two summations involving weights (which are real numbers), the control points, and B-Spline basis functions
IGESGeom_BSplineCurve: declare class IGESGeom_BSplineCurve extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class BSplineCurve
Init(anIndex: number, aDegree: number, aPlanar: boolean, aClosed: boolean, aPolynom: boolean, aPeriodic: boolean, allKnots: NCollection_HArray1_double, allWeights: NCollection_HArray1_double, allPoles: NCollection_HArray1_gp_XYZ, aUmin: number, aUmax: number, aNorm: gp_XYZ): void;

// Changes FormNumber (indicates the Shape of the Curve) Error if not in range [0-5]
SetFormNumber(form: number): void;

// returns the upper index of the sum (see Knots,Poles)
UpperIndex(): number;

// returns the degree of basis functions
Degree(): number;

// returns True if the curve is Planar, False if non-planar
IsPlanar(): boolean;

// returns True if the curve is closed, False if open
IsClosed(): boolean;

// returns True if the curve is polynomial, False if rational <flag> False (D)
IsPolynomial(flag?: boolean): boolean;

// returns True if the curve is periodic, False otherwise
IsPeriodic(): boolean;

// returns the number of knots (i.e
NbKnots(): number;

// returns the knot referred to by anIndex, inside the range [-Degree,UpperIndex+1] raises exception if anIndex < -`Degree()` or anIndex > (`NbKnots()` - `Degree()`) Note
Knot(anIndex: number): number;

// returns number of poles (i.e
NbPoles(): number;

// returns the weight referred to by anIndex, in [0,UpperIndex] raises exception if anIndex < 0 or anIndex > `UpperIndex()`
Weight(anIndex: number): number;

// returns the pole referred to by anIndex, in [0,UpperIndex] raises exception if anIndex < 0 or anIndex > `UpperIndex()`
Pole(anIndex: number): gp_Pnt;

// returns the anIndex'th pole after applying Transf
TransformedPole(anIndex: number): gp_Pnt;

// returns starting parameter value
UMin(): number;

// returns ending parameter value
UMax(): number;

// if the curve is nonplanar then (0, 0, 0) is returned
Normal(): gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESBSplineSurface, Type <128> Form <0-9> in package {@link IGESGeom`IGESGeom`} A parametric equation obtained by dividing two summations involving weights (which are real numbers), the control points, and B-Spline basis functions
IGESGeom_BSplineSurface: declare class IGESGeom_BSplineSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class BSplineSurface
Init(anIndexU: number, anIndexV: number, aDegU: number, aDegV: number, aCloseU: boolean, aCloseV: boolean, aPolynom: boolean, aPeriodU: boolean, aPeriodV: boolean, allKnotsU: NCollection_HArray1_double, allKnotsV: NCollection_HArray1_double, allWeights: NCollection_HArray2_double, allPoles: NCollection_HArray2_gp_XYZ, aUmin: number, aUmax: number, aVmin: number, aVmax: number): void;

// Changes FormNumber (indicates the Shape of the Surface) Error if not in range [0-9]
SetFormNumber(form: number): void;

// returns the upper index of the first sum (U)
UpperIndexU(): number;

// returns the upper index of the second sum (V)
UpperIndexV(): number;

// returns degree of first set of basis functions
DegreeU(): number;

// returns degree of second set of basis functions
DegreeV(): number;

// True if closed in U direction else False
IsClosedU(): boolean;

// True if closed in V direction else False
IsClosedV(): boolean;

// True if polynomial, False if rational <flag> False (D)
IsPolynomial(flag?: boolean): boolean;

// True if periodic in U direction else False
IsPeriodicU(): boolean;

// True if periodic in V direction else False
IsPeriodicV(): boolean;

// returns number of knots in U direction KnotsU are numbered from -DegreeU
NbKnotsU(): number;

// returns number of knots in V direction KnotsV are numbered from -DegreeV
NbKnotsV(): number;

// returns the value of knot referred to by anIndex in U direction raises exception if anIndex < -`DegreeU()` or anIndex > (`NbKnotsU()` - `DegreeU()`)
KnotU(anIndex: number): number;

// returns the value of knot referred to by anIndex in V direction raises exception if anIndex < -`DegreeV()` or anIndex > (`NbKnotsV()` - `DegreeV()`)
KnotV(anIndex: number): number;

// returns number of poles in U direction
NbPolesU(): number;

// returns number of poles in V direction
NbPolesV(): number;

// returns the weight referred to by anIndex1, anIndex2 raises exception if anIndex1 <= 0 or anIndex1 > `NbPolesU()` or if anIndex2 <= 0 or anIndex2 > `NbPolesV()`
Weight(anIndex1: number, anIndex2: number): number;

// returns the control point referenced by anIndex1, anIndex2 raises exception if anIndex1 <= 0 or anIndex1 > `NbPolesU()` or if anIndex2 <= 0 or anIndex2 > `NbPolesV()`
Pole(anIndex1: number, anIndex2: number): gp_Pnt;

// returns the control point referenced by anIndex1, anIndex2 after applying the Transf.Matrix raises exception if anIndex1 <= 0 or anIndex1 > `NbPolesU()` or if anIndex2 <= 0 or anIndex2 > `NbPolesV()`
TransformedPole(anIndex1: number, anIndex2: number): gp_Pnt;

// returns starting value in the U direction
UMin(): number;

// returns ending value in the U direction
UMax(): number;

// returns starting value in the V direction
VMin(): number;

// returns ending value in the V direction
VMax(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESBoundary, Type <141> Form <0> in package {@link IGESGeom`IGESGeom`} A boundary entity identifies a surface boundary consisting of a set of curves lying on the surface
IGESGeom_Boundary: declare class IGESGeom_Boundary extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Boundary
Init(aType: number, aPreference: number, aSurface: IGESData_IGESEntity, allModelCurves: NCollection_HArray1_handle_IGESData_IGESEntity, allSenses: NCollection_HArray1_int, allParameterCurves: IGESBasic_HArray1OfHArray1OfIGESEntity): void;

// returns type of bounded surface representation 0 = Boundary entities may only reference model space trimming curves
BoundaryType(): number;

// returns preferred representation of trimming curves 0 = Unspecified 1 = Model space 2 = Parameter space 3 = Representations are of equal preference
PreferenceType(): number;

// returns the surface to be bounded
Surface(): IGESData_IGESEntity;

// returns the number of model space curves
NbModelSpaceCurves(): number;

// returns Model Space Curve raises exception if Index <= 0 or Index > `NbModelSpaceCurves()`
ModelSpaceCurve(Index: number): IGESData_IGESEntity;

// returns the sense of a particular model space curve 1 = model curve direction does not need reversal 2 = model curve direction needs to be reversed raises exception if Index <= 0 or Index > `NbModelSpaceCurves()`
Sense(Index: number): number;

// returns the number of parameter curves associated with one model space curve referred to by Index raises exception if Index <= 0 or Index > `NbModelSpaceCurves()`
NbParameterCurves(Index: number): number;

// returns an array of parameter space curves associated with a model space curve referred to by the Index raises exception if Index <= 0 or Index > `NbModelSpaceCurves()`
ParameterCurves(Index: number): NCollection_HArray1_handle_IGESData_IGESEntity;

// returns an individual parameter curve raises exception if Index or Num is out of range
ParameterCurve(Index: number, Num: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines BoundedSurface, Type <143> Form <0> in package {@link IGESGeom`IGESGeom`} A bounded surface is used to communicate trimmed surfaces
IGESGeom_BoundedSurface: declare class IGESGeom_BoundedSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class BoundedSurface
Init(aType: number, aSurface: IGESData_IGESEntity, allBounds: NCollection_HArray1_handle_IGESGeom_Boundary): void;

// returns the type of Bounded surface representation 0 = The boundary entities may only reference model space curves 1 = The boundary entities may reference both model space curves and associated parameter space curve representations
RepresentationType(): number;

// returns the bounded surface
Surface(): IGESData_IGESEntity;

// returns the number of boundaries
NbBoundaries(): number;

// returns boundary entity raises exception if Index <= 0 or Index > `NbBoundaries()`
Boundary(Index: number): IGESGeom_Boundary;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESCircularArc, Type <100> Form <0> in package {@link IGESGeom`IGESGeom`} A circular arc is a connected portion of a parent circle which consists of more than one point
IGESGeom_CircularArc: declare class IGESGeom_CircularArc extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class CircularArc
Init(aZT: number, aCenter: gp_XY, aStart: gp_XY, anEnd: gp_XY): void;

// returns the center of the circle of which arc forms a part
Center(): gp_Pnt2d;

// returns the center of the circle of which arc forms a part after applying Transf
TransformedCenter(): gp_Pnt;

// returns the start point of the arc
StartPoint(): gp_Pnt2d;

// returns the start point of the arc after applying Transf
TransformedStartPoint(): gp_Pnt;

// returns the parallel displacement of the plane containing the arc from the XT, YT plane
ZPlane(): number;

// returns the end point of the arc
EndPoint(): gp_Pnt2d;

// returns the end point of the arc after applying Transf
TransformedEndPoint(): gp_Pnt;

// returns the radius of the circle of which arc forms a part
Radius(): number;

// returns the angle subtended by the arc at the center in radians
Angle(): number;

// Z-Axis of circle (i.e
Axis(): gp_Dir;

// Z-Axis after applying Trans
TransformedAxis(): gp_Dir;

// True if StartPoint = EndPoint
IsClosed(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESCompositeCurve, Type <102> Form <0> in package {@link IGESGeom`IGESGeom`} A composite curve is defined as an ordered list of entities consisting of a point, connect point and parametrised curve entities (excluding the CompositeCurve entity)
IGESGeom_CompositeCurve: declare class IGESGeom_CompositeCurve extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class CompositeCurve
Init(allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns the number of curves contained in the CompositeCurve
NbCurves(): number;

// returns Component of the CompositeCurve (a curve or a point) raises exception if Index <= 0 or Index > `NbCurves()`
Curve(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESConicArc, Type <104> Form <0-3> in package {@link IGESGeom`IGESGeom`} A conic arc is a bounded connected portion of a parent conic curve which consists of more than one point
IGESGeom_ConicArc: declare class IGESGeom_ConicArc extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ConicalArc
Init(A: number, B: number, C: number, D: number, E: number, F: number, ZT: number, aStart: gp_XY, anEnd: gp_XY): void;

// sets the Form Number equal to ComputedFormNumber, returns True if changed
OwnCorrect(): boolean;

// Computes the Form Number according to the equation 1 for Ellipse, 2 for Hyperbola, 3 for Parabola
ComputedFormNumber(): number;

Equation(A?: number, B?: number, C?: number, D?: number, E?: number, F?: number): { A: number; B: number; C: number; D: number; E: number; F: number };

// returns the Z displacement of the arc from XT, YT plane
ZPlane(): number;

// returns the starting point of the arc
StartPoint(): gp_Pnt2d;

// returns the starting point of the arc after applying Transf
TransformedStartPoint(): gp_Pnt;

// returns the end point of the arc
EndPoint(): gp_Pnt2d;

// returns the end point of the arc after applying Transf
TransformedEndPoint(): gp_Pnt;

// returns True if parent conic curve is an ellipse
IsFromEllipse(): boolean;

// returns True if parent conic curve is a parabola
IsFromParabola(): boolean;

// returns True if parent conic curve is a hyperbola
IsFromHyperbola(): boolean;

// returns True if StartPoint = EndPoint
IsClosed(): boolean;

// Z-Axis of conic (i.e
Axis(): gp_Dir;

// Z-Axis after applying Trans
TransformedAxis(): gp_Dir;

// Returns a Definition computed from equation, easier to use
Definition(Center: gp_Pnt, MainAxis: gp_Dir, rmin?: number, rmax?: number): { rmin: number; rmax: number };
// Center: Mutated in place
// MainAxis: Mutated in place

// Same as Definition, but the Location is applied on the Center and the MainAxis
TransformedDefinition(Center: gp_Pnt, MainAxis: gp_Dir, rmin?: number, rmax?: number): { rmin: number; rmax: number };
// Center: Mutated in place
// MainAxis: Mutated in place

// Computes and returns the coordinates of the definition of a comic from its equation
ComputedDefinition(Xcen?: number, Ycen?: number, Xax?: number, Yax?: number, Rmin?: number, Rmax?: number): { Xcen: number; Ycen: number; Xax: number; Yax: number; Rmin: number; Rmax: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESCopiousData, Type <106> Form <1-3,11-13,63> in package {@link IGESGeom`IGESGeom`} This entity stores data points in the form of pairs, triples, or sextuples
IGESGeom_CopiousData: declare class IGESGeom_CopiousData extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class CopiousData
Init(aDataType: number, aZPlane: number, allData: NCollection_HArray1_double): void;

// Sets Copious Data to be a Polyline if <mode> is True (Form = 11-12-13) or a Set of Points else (Form 1-2-3)
SetPolyline(mode: boolean): void;

// Sets Copious Data to be a Closed Path 2D (Form 63) Warning
SetClosedPath2D(): void;

// Returns True if <me> is a Set of Points (Form 1-2-3)
IsPointSet(): boolean;

// Returns True if <me> is a Polyline (Form 11-12-13)
IsPolyline(): boolean;

// Returns True if <me> is a Closed Path 2D (Form 63)
IsClosedPath2D(): boolean;

// returns data type 1 = XY ( with common Z given by plane) 2 = XYZ ( point) 3 = XYZ + Vec(XYZ) (point + normal vector)
DataType(): number;

// returns the number of tuples
NbPoints(): number;

// Returns an individual Data, given the N0 of the Point and the B0 of the Coordinate (according DataType)
Data(NumPoint: number, NumData: number): number;

// If datatype = 1, then returns common z value for all data else returns 0
ZPlane(): number;

// returns the coordinates of the point specified by the anIndex raises exception if anIndex <= 0 or anIndex > `NbPoints()`
Point(anIndex: number): gp_Pnt;

// returns the coordinates of the point specified by the anIndex after applying Transf
TransformedPoint(anIndex: number): gp_Pnt;

// returns i, j, k values if 3-tuple else returns (0, 0, 0) raises exception if anIndex <= 0 or anIndex > `NbPoints()`
Vector(anIndex: number): gp_Vec;

// returns transformed vector if 3-tuple else returns (0, 0, 0) raises exception if anIndex <= 0 or anIndex > `NbPoints()`
TransformedVector(anIndex: number): gp_Vec;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESCurveOnSurface, Type <142> Form <0> in package {@link IGESGeom`IGESGeom`} A curve on a parametric surface entity associates a given curve with a surface and identifies the curve as lying on the surface
IGESGeom_CurveOnSurface: declare class IGESGeom_CurveOnSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class CurveOnSurface
Init(aMode: number, aSurface: IGESData_IGESEntity, aCurveUV: IGESData_IGESEntity, aCurve3D: IGESData_IGESEntity, aPreference: number): void;

// returns the mode in which the curve is created on the surface 0 = Unspecified 1 = Projection of a given curve on the surface 2 = Intersection of two surfaces 3 = Isoparametric curve, i.e:- either a `u` parametric or a `v` parametric curve
CreationMode(): number;

// returns the surface on which the curve lies
Surface(): IGESData_IGESEntity;

// returns curve S
CurveUV(): IGESData_IGESEntity;

// returns curve C
Curve3D(): IGESData_IGESEntity;

// returns preference mode 0 = Unspecified 1 = S o B is preferred 2 = C is preferred 3 = C and S o B are equally preferred
PreferenceMode(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESDirection, Type <123> Form <0> in package {@link IGESGeom`IGESGeom`} A direction entity is a non-zero vector in Euclidean 3-space that is defined by its three components (direction ratios) with respect to the coordinate axes
IGESGeom_Direction: declare class IGESGeom_Direction extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Direction
Init(aDirection: gp_XYZ): void;

Value(): gp_Vec;

// returns the Direction value after applying Transformation matrix
TransformedValue(): gp_Vec;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESFlash, Type <125> Form <0 - 4> in package {@link IGESGeom`IGESGeom`} A flash entity is a point in the ZT=0 plane that locates a particular closed area
IGESGeom_Flash: declare class IGESGeom_Flash extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Flash
Init(aPoint: gp_XY, aDim: number, anotherDim: number, aRotation: number, aReference: IGESData_IGESEntity): void;

// Changes FormNumber (indicates the Nature of the Flash
SetFormNumber(form: number): void;

// returns the referenced point, Z = 0 always
ReferencePoint(): gp_Pnt2d;

// returns the referenced point after applying Transf
TransformedReferencePoint(): gp_Pnt;

// returns first flash sizing parameter
Dimension1(): number;

// returns second flash sizing parameter
Dimension2(): number;

// returns the angle in radians of the rotation of flash about the reference point
Rotation(): number;

// returns the referenced entity or Null handle
ReferenceEntity(): IGESData_IGESEntity;

// returns True if referenced entity is present
HasReferenceEntity(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services for {@link IGESGeom`IGESGeom`} (specific part) This Services comprise
IGESGeom_GeneralModule: declare class IGESGeom_GeneralModule extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Returns a category number which characterizes an entity Shape for all, but Drawing for
CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESLine, Type <110> Form <0> in package {@link IGESGeom`IGESGeom`} A line is a bounded, connected portion of a parent straight line which consists of more than one point
IGESGeom_Line: declare class IGESGeom_Line extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Line
Init(aStart: gp_XYZ, anEnd: gp_XYZ): void;

// Returns the Infinite status i.e
Infinite(): number;

// Sets the Infinite status Does nothing if <status> is not 0 1 or 2
SetInfinite(status: number): void;

// returns the start point of the line
StartPoint(): gp_Pnt;

// returns the start point of the line after applying Transf
TransformedStartPoint(): gp_Pnt;

// returns the end point of the line
EndPoint(): gp_Pnt;

// returns the end point of the line after applying Transf
TransformedEndPoint(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
