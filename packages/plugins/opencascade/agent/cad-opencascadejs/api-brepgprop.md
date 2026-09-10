# libcascade — BRepGProp

9 top-level symbols. Signatures are verbatim typescript.

// Provides global functions to compute a shape's global properties for lines, surfaces or volumes, and bring them together with the global properties already computed for a geometric system
BRepGProp: declare class BRepGProp

constructor

// Computes the linear global properties of the shape S, i.e
static LinearProperties(S: TopoDS_Shape, LProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;
// LProps: Mutated in place

// Computes the surface global properties of the shape S, i.e
static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;
static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, Eps: number, SkipShared: boolean): number;
static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;
static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, Eps: number, SkipShared: boolean): number;
// SProps: Mutated in place

// Computes the global volume properties of the solid S, and brings them together with the global properties still retained by the framework VProps
static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, OnlyClosed: boolean, SkipShared: boolean, UseTriangulation: boolean): void;
static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, SkipShared: boolean): number;
static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, OnlyClosed: boolean, SkipShared: boolean, UseTriangulation: boolean): void;
static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, SkipShared: boolean): number;
// VProps: Mutated in place

// Updates <VProps> with the shape , that contains its principal properties
static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;
static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, thePln: gp_Pln, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;
static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;
static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, thePln: gp_Pln, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;
// VProps: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the global properties of bounded curves in 3D space
BRepGProp_Cinert: declare class BRepGProp_Cinert extends GProp_GProps

constructor

SetLocation(CLocation: gp_Pnt): void;

Perform(C: BRepAdaptor_Curve): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Arc iterator
BRepGProp_Domain: declare class BRepGProp_Domain

constructor

// Initializes the domain with the face
Init(F: TopoDS_Face): void;
Init(): void;
Init(F: TopoDS_Face): void;
Init(): void;

// Returns True if there is another arc of curve in the list
More(): boolean;

// Returns the current edge
Value(): TopoDS_Edge;

// Sets the index of the arc iterator to the next arc of curve
Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides the required methods to instantiate CGProps from {@link GProp `GProp`} with a Curve from BRepAdaptor
BRepGProp_EdgeTool: declare class BRepGProp_EdgeTool

constructor

// Returns the parametric value of the start point of the curve
static FirstParameter(C: BRepAdaptor_Curve): number;

// Returns the parametric value of the end point of the curve
static LastParameter(C: BRepAdaptor_Curve): number;

// Returns the number of Gauss points required to do the integration with a good accuracy using the Gauss method
static IntegrationOrder(C: BRepAdaptor_Curve): number;

// Returns the point of parameter U on the loaded curve
static Value(C: BRepAdaptor_Curve, U: number): gp_Pnt;

// Returns the point of parameter U and the first derivative at this point
static D1(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place

// Returns the number of intervals for continuity
static NbIntervals(C: BRepAdaptor_Curve, S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
static Intervals(C: BRepAdaptor_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGProp_Face: declare class BRepGProp_Face

constructor

// Loading the boundary arc
Load(F: TopoDS_Face): void;
Load(E: TopoDS_Edge): boolean;
Load(IsFirstParam: boolean, theIsoType: GeomAbs_IsoType): void;
Load(F: TopoDS_Face): void;
Load(E: TopoDS_Edge): boolean;
Load(IsFirstParam: boolean, theIsoType: GeomAbs_IsoType): void;
Load(F: TopoDS_Face): void;
Load(E: TopoDS_Edge): boolean;
Load(IsFirstParam: boolean, theIsoType: GeomAbs_IsoType): void;

VIntegrationOrder(): number;

// Returns true if the face is not trimmed
NaturalRestriction(): boolean;

// Returns the `TopoDS` face
GetFace(): TopoDS_Face;

// Returns the value of the boundary curve of the face
Value2d(U: number): gp_Pnt2d;

SIntOrder(Eps: number): number;

SVIntSubs(): number;

SUIntSubs(): number;

UKnots(Knots: NCollection_Array1_double): void;

VKnots(Knots: NCollection_Array1_double): void;

LIntOrder(Eps: number): number;

LIntSubs(): number;

LKnots(Knots: NCollection_Array1_double): void;

// Returns the number of points required to do the integration in the U parametric direction with a good accuracy
UIntegrationOrder(): number;

// Returns the parametric bounds of the Face
Bounds(U1?: number, U2?: number, V1?: number, V2?: number): { U1: number; U2: number; V1: number; V2: number };

// Computes the point of parameter U, V on the Face and the normal to the face at this point
Normal(U: number, V: number, P: gp_Pnt, VNor: gp_Vec): void;
// P: Mutated in place
// VNor: Mutated in place

// Returns the parametric value of the start point of the current arc of curve
FirstParameter(): number;

// Returns the parametric value of the end point of the current arc of curve
LastParameter(): number;

// Returns the number of points required to do the integration along the parameter of curve
IntegrationOrder(): number;

// Returns the point of parameter U and the first derivative at this point of a boundary curve
D12d(U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place

// Returns an array of U knots of the face
GetUKnots(theUMin: number, theUMax: number): NCollection_HArray1_double;
// theUMin: lower U bound
// theUMax: upper U bound

// Returns an array of combination of T knots of the arc and V knots of the face
GetTKnots(theTMin: number, theTMax: number): NCollection_HArray1_double;
// theTMin: lower T bound
// theTMax: upper T bound

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the global properties of of polylines represented by set of points
BRepGProp_MeshCinert: declare class BRepGProp_MeshCinert extends GProp_GProps

constructor

SetLocation(CLocation: gp_Pnt): void;

// Computes the global properties of of polylines represented by set of points
Perform(theNodes: NCollection_Array1_gp_Pnt): void;

// Prepares set of 3d points on base of any available edge polygons
static PreparePolygon(theE: TopoDS_Edge): NCollection_HArray1_gp_Pnt;
// theE: the edge to extract polygon from

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the global properties of a face in 3D space
BRepGProp_Sinert: declare class BRepGProp_Sinert extends GProp_GProps

constructor

SetLocation(SLocation: gp_Pnt): void;

Perform(S: BRepGProp_Face): void;
Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
Perform(S: BRepGProp_Face, Eps: number): number;
Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;
Perform(S: BRepGProp_Face): void;
Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
Perform(S: BRepGProp_Face, Eps: number): number;
Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;
Perform(S: BRepGProp_Face): void;
Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
Perform(S: BRepGProp_Face, Eps: number): number;
Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;
Perform(S: BRepGProp_Face): void;
Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
Perform(S: BRepGProp_Face, Eps: number): number;
Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;

// If previously used method contained Eps parameter get actual relative error of the computation, else return 1.0
GetEpsilon(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class represents the integrand function for the outer integral computation
BRepGProp_TFunction: declare class BRepGProp_TFunction extends math_Function

constructor

Init(): void;

// Setting the expected number of Kronrod points for the outer integral computation
SetNbKronrodPoints(theNbPoints: number): void;

// Setting the type of the value to be returned
SetValueType(aType: GProp_ValueType): void;

// Setting the tolerance for inner integration
SetTolerance(aTol: number): void;

// Returns the relative reached error of all values computation since the last call of GetStateNumber method
ErrorReached(): number;

// Returns the absolut reached error of all values computation since the last call of GetStateNumber method
AbsolutError(): number;

// Returns a value of the function
Value(X: number, F: number): { returnValue: boolean; F: number };

// Redefined method
GetStateNumber(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class represents the integrand function for computation of an inner integral
BRepGProp_UFunction: declare class BRepGProp_UFunction extends math_Function

constructor

// Setting the type of the value to be returned
SetValueType(theType: GProp_ValueType): void;

// Setting the V parameter that is constant during the integral computation
SetVParam(theVParam: number): void;

// Returns a value of the function
Value(X: number, F: number): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
