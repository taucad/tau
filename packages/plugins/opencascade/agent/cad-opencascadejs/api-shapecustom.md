# libcascade — ShapeCustom

12 top-level symbols. Signatures are verbatim typescript.

// This package is intended to convert geometrical objects and topological
ShapeCustom: declare class ShapeCustom

constructor

// Applies modifier to shape and checks sharing in the case assemblies
static ApplyModifier(S: TopoDS_Shape, M: BRepTools_Modification, context: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, MD: BRepTools_Modifier, theProgress: Message_ProgressRange, aReShape: ShapeBuild_ReShape): TopoDS_Shape;
// context: Mutated in place

// Returns a new shape without indirect surfaces
static DirectFaces(S: TopoDS_Shape): TopoDS_Shape;

// Returns a new shape which is scaled original
static ScaleShape(S: TopoDS_Shape, scale: number): TopoDS_Shape;

// Returns a new shape with all surfaces, curves and pcurves which type is BSpline/Bezier or based on them converted having Degree less than <MaxDegree> or number of spans less than <NbMaxSegment> in dependence on parameter priority <Degree>
static BSplineRestriction(S: TopoDS_Shape, Tol3d: number, Tol2d: number, MaxDegree: number, MaxNbSegment: number, Continuity3d: GeomAbs_Shape, Continuity2d: GeomAbs_Shape, Degree: boolean, Rational: boolean, aParameters: ShapeCustom_RestrictionParameters): TopoDS_Shape;

// Returns a new shape with all elementary periodic surfaces converted to {@link Geom_SurfaceOfRevolution `Geom_SurfaceOfRevolution`}
static ConvertToRevolution(S: TopoDS_Shape): TopoDS_Shape;

// Returns a new shape with all surfaces of revolution and linear extrusion convert to elementary periodic surfaces
static SweptToElementary(S: TopoDS_Shape): TopoDS_Shape;

// Returns a new shape with all surfaces of linear extrusion, revolution, offset, and planar surfaces converted according to flags to {@link Geom_BSplineSurface `Geom_BSplineSurface`} (with same parameterisation)
static ConvertToBSpline(S: TopoDS_Shape, extrMode: boolean, revolMode: boolean, offsetMode: boolean, planeMode?: boolean): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this tool intended for approximation surfaces, curves and pcurves with specified degree , max number of segments, tolerance 2d, tolerance 3d
ShapeCustom_BSplineRestriction: declare class ShapeCustom_BSplineRestriction extends ShapeCustom_Modification

constructor

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if curve from the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the surface has been modified
ConvertSurface(aSurface: Geom_Surface, UF: number, UL: number, VF: number, VL: number, IsOf: boolean): { returnValue: boolean; S: Geom_Surface; [Symbol.dispose](): void };

// Returns true if the curve has been modified
ConvertCurve(aCurve: Geom_Curve, IsConvert: boolean, First: number, Last: number, TolCur: number, IsOf: boolean): { returnValue: boolean; C: Geom_Curve; TolCur: number; [Symbol.dispose](): void };

// Returns true if the pcurve has been modified
ConvertCurve2d(aCurve: Geom2d_Curve, IsConvert: boolean, First: number, Last: number, TolCur: number, IsOf: boolean): { returnValue: boolean; C: Geom2d_Curve; TolCur: number; [Symbol.dispose](): void };

// Sets tolerance of approximation for curve3d and surface
SetTol3d(Tol3d: number): void;

// Sets tolerance of approximation for curve2d
SetTol2d(Tol2d: number): void;

// Returns (modifiable) the flag which defines whether the surface is approximated
ModifyApproxSurfaceFlag(): boolean;

// Returns (modifiable) the flag which defines whether the curve3d is approximated
ModifyApproxCurve3dFlag(): boolean;

// Returns (modifiable) the flag which defines whether the curve2d is approximated
ModifyApproxCurve2dFlag(): boolean;

// Sets continuity3d for approximation curve3d and surface
SetContinuity3d(Continuity3d: GeomAbs_Shape): void;

// Sets continuity3d for approximation curve2d
SetContinuity2d(Continuity2d: GeomAbs_Shape): void;

// Sets max degree for approximation
SetMaxDegree(MaxDegree: number): void;

// Sets max number of segments for approximation
SetMaxNbSegments(MaxNbSegments: number): void;

// Sets priority for approximation curves and surface
SetPriority(Degree: boolean): void;

// Sets flag for define if rational BSpline or Bezier is converted to polynomial
SetConvRational(Rational: boolean): void;

// Returns the container of modes which defines what geometry should be converted to BSplines
GetRestrictionParameters(): ShapeCustom_RestrictionParameters;

// Sets the container of modes which defines what geometry should be converted to BSplines
SetRestrictionParameters(aModes: ShapeCustom_RestrictionParameters): void;

// Returns error for approximation curve3d
Curve3dError(): number;

// Returns error for approximation curve2d
Curve2dError(): number;

// Returns error for approximation surface
SurfaceError(): number;

// Returns true if the vertex V has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the vertex V has a new parameter on the edge E
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

// Returns error for approximation surface, curve3d and curve2d
MaxErrors(aCurve3dErr?: number, aCurve2dErr?: number): { returnValue: number; aCurve3dErr: number; aCurve2dErr: number };

// Returns number for approximation surface, curve3d and curve2d
NbOfSpan(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// implement a modification for {@link BRepTools `BRepTools`} Modifier algorithm
ShapeCustom_ConvertToBSpline: declare class ShapeCustom_ConvertToBSpline extends ShapeCustom_Modification

constructor

// Sets mode for conversion of Surfaces of Linear extrusion
SetExtrusionMode(extrMode: boolean): void;

// Sets mode for conversion of Surfaces of Revolution
SetRevolutionMode(revolMode: boolean): void;

// Sets mode for conversion of Offset surfaces
SetOffsetMode(offsetMode: boolean): void;

// Sets mode for conversion of Plane surfaces
SetPlaneMode(planeMode: boolean): void;

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex <V> has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge <E> has a new curve on surface on the face <F>.In this case, `is the new geometric support of the edge, <L> the new location, <Tol> the new tolerance.`
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex <V> has a new parameter on the edge <E>
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// implements a modification for the {@link BRepTools `BRepTools`} Modifier algorithm
ShapeCustom_ConvertToRevolution: declare class ShapeCustom_ConvertToRevolution extends ShapeCustom_Modification

constructor

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex <V> has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge <E> has a new curve on surface on the face <F>.In this case, `is the new geometric support of the edge, <L> the new location, <Tol> the new tolerance.`
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex <V> has a new parameter on the edge <E>
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Converts BSpline curve to periodic
ShapeCustom_Curve: declare class ShapeCustom_Curve

constructor

Init(C: Geom_Curve): void;

// Tries to convert the Curve to the Periodic form Returns the resulting curve Works only if the Curve is BSpline and is closed with `Precision::Confusion()` Else, or in case of failure, returns a Null Handle
ConvertToPeriodic(substitute: boolean, preci?: number): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Converts curve2d to analytical form with given precision or simplify curve2d
ShapeCustom_Curve2d: declare class ShapeCustom_Curve2d

constructor

// Check if poleses is in the plane with given precision Returns false if no
static IsLinear(thePoles: NCollection_Array1_gp_Pnt2d, theTolerance: number, theDeviation?: number): { returnValue: boolean; theDeviation: number };

// Try to convert BSpline2d or Bezier2d to line 2d only if it is linear
static ConvertToLine2d(theCurve: Geom2d_Curve, theFirstIn: number, theLastIn: number, theTolerance: number, theNewFirst?: number, theNewLast?: number, theDeviation?: number): { returnValue: Geom2d_Line; theNewFirst: number; theNewLast: number; theDeviation: number; [Symbol.dispose](): void };

// Try to remove knots from bspline where local derivatives are the same
static SimplifyBSpline2d(theTolerance: number): { returnValue: boolean; theBSpline2d: Geom2d_BSplineCurve; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// implements a modification for the {@link BRepTools `BRepTools`} Modifier algorithm
ShapeCustom_DirectModification: declare class ShapeCustom_DirectModification extends ShapeCustom_Modification

constructor

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex <V> has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge <E> has a new curve on surface on the face <F>.In this case, `is the new geometric support of the edge, <L> the new location, <Tol> the new tolerance.`
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex <V> has a new parameter on the edge <E>
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A base class of Modification's from {@link ShapeCustom`ShapeCustom`}
ShapeCustom_Modification: declare class ShapeCustom_Modification extends BRepTools_Modification

// Sets message registrator
SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

// Returns message registrator
MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

// Sends a message to be attached to the shape
SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity?: Message_Gravity): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is axuluary tool which contains parameters for BSplineRestriction class
ShapeCustom_RestrictionParameters: declare class ShapeCustom_RestrictionParameters extends Standard_Transient

constructor

// Returns (modifiable) maximal degree of approximation
GMaxDegree(): number;

// Returns (modifiable) maximal number of spans of approximation
GMaxSeg(): number;

// Sets flag for define if Plane converted to BSpline surface
ConvertPlane(): boolean;

// Sets flag for define if Bezier surface converted to BSpline surface
ConvertBezierSurf(): boolean;

// Sets flag for define if surface of Revolution converted to BSpline surface
ConvertRevolutionSurf(): boolean;

// Sets flag for define if surface of LinearExtrusion converted to BSpline surface
ConvertExtrusionSurf(): boolean;

// Sets flag for define if Offset surface converted to BSpline surface
ConvertOffsetSurf(): boolean;

// Sets flag for define if cylindrical surface converted to BSpline surface
ConvertCylindricalSurf(): boolean;

// Sets flag for define if conical surface converted to BSpline surface
ConvertConicalSurf(): boolean;

// Sets flag for define if toroidal surface converted to BSpline surface
ConvertToroidalSurf(): boolean;

// Sets flag for define if spherical surface converted to BSpline surface
ConvertSphericalSurf(): boolean;

// Sets Segment mode for surface
SegmentSurfaceMode(): boolean;

// Sets flag for define if 3d curve converted to BSpline curve
ConvertCurve3d(): boolean;

// Sets flag for define if Offset curve3d converted to BSpline surface
ConvertOffsetCurv3d(): boolean;

// Returns (modifiable) flag for define if 2d curve converted to BSpline curve
ConvertCurve2d(): boolean;

// Returns (modifiable) flag for define if Offset curve2d converted to BSpline surface
ConvertOffsetCurv2d(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Converts a surface to the analytical form with given precision
ShapeCustom_Surface: declare class ShapeCustom_Surface

constructor

Init(S: Geom_Surface): void;

// Returns maximal deviation of converted surface from the original one computed by last call to ConvertToAnalytical
Gap(): number;

// Tries to convert the Surface to an Analytic form Returns the result Works only if the Surface is BSpline or Bezier
ConvertToAnalytical(tol: number, substitute: boolean): Geom_Surface;

// Tries to convert the Surface to the Periodic form Returns the resulting surface Works only if the Surface is BSpline and is closed with `Precision::Confusion()` Else, or in case of failure, returns a Null Handle
ConvertToPeriodic(substitute: boolean, preci?: number): Geom_Surface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// implements a modification for the {@link BRepTools `BRepTools`} Modifier algorithm
ShapeCustom_SweptToElementary: declare class ShapeCustom_SweptToElementary extends ShapeCustom_Modification

constructor

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex <V> has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge <E> has a new curve on surface on the face <F>.In this case, `is the new geometric support of the edge, <L> the new location, <Tol> the new tolerance.`
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex <V> has a new parameter on the edge <E>
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Complements {@link BRepTools_TrsfModification`BRepTools_TrsfModification`} to provide reversible scaling regarding tolerances
ShapeCustom_TrsfModification: declare class ShapeCustom_TrsfModification extends BRepTools_TrsfModification

constructor

// Calls inherited method
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Calls inherited method
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Calls inherited method
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Calls inherited method
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Calls inherited method
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
