# libcascade — ShapeConstruct

4 top-level symbols. Signatures are verbatim typescript.

// This package provides new algorithms for constructing new geometrical objects and topological shapes
ShapeConstruct: declare class ShapeConstruct

constructor

// Tool for wire triangulation
static ConvertCurveToBSpline(C3D: Geom_Curve, First: number, Last: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineCurve;
static ConvertCurveToBSpline(C2D: Geom2d_Curve, First: number, Last: number, Tol2d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom2d_BSplineCurve;
static ConvertCurveToBSpline(C3D: Geom_Curve, First: number, Last: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineCurve;
static ConvertCurveToBSpline(C2D: Geom2d_Curve, First: number, Last: number, Tol2d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom2d_BSplineCurve;

static ConvertSurfaceToBSpline(surf: Geom_Surface, UF: number, UL: number, VF: number, VL: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineSurface;

// join pcurves of the <theEdge> on the <theFace> try to use pcurves from originas edges <theEdges> Returns false if cannot join pcurves
static JoinPCurves(theEdges: NCollection_HSequence_TopoDS_Shape, theFace: TopoDS_Face, theEdge: TopoDS_Edge): boolean;
// theEdge: Mutated in place

// Method for joininig curves 3D
static JoinCurves(c3d1: Geom_Curve, ac3d2: Geom_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1?: number, last1?: number, first2?: number, last2?: number, isRev1?: boolean, isRev2?: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c3dOut: Geom_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };
static JoinCurves(c2d1: Geom2d_Curve, ac2d2: Geom2d_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1: number, last1: number, first2: number, last2: number, isRev1: boolean, isRev2: boolean, isError: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c2dOut: Geom2d_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };
static JoinCurves(c3d1: Geom_Curve, ac3d2: Geom_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1?: number, last1?: number, first2?: number, last2?: number, isRev1?: boolean, isRev2?: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c3dOut: Geom_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };
static JoinCurves(c2d1: Geom2d_Curve, ac2d2: Geom2d_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1: number, last1: number, first2: number, last2: number, isRev1: boolean, isRev2: boolean, isError: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c2dOut: Geom2d_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Adjusts curve to have start and end points at the given points (currently works on lines and B-Splines only)
ShapeConstruct_Curve: declare class ShapeConstruct_Curve

constructor

// Modifies a curve in order to make its bounds confused with given points
AdjustCurve(C3D: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, take1?: boolean, take2?: boolean): boolean;

// Modifies a curve in order to make its bounds confused with given points
AdjustCurveSegment(C3D: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, U1: number, U2: number): boolean;

// Modifies a curve in order to make its bounds confused with given points
AdjustCurve2d(C2D: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, take1?: boolean, take2?: boolean): boolean;

// Converts a curve of any type (only part from first to last) to bspline
ConvertToBSpline(C: Geom_Curve, first: number, last: number, prec: number): Geom_BSplineCurve;
ConvertToBSpline(C: Geom2d_Curve, first: number, last: number, prec: number): Geom2d_BSplineCurve;
ConvertToBSpline(C: Geom_Curve, first: number, last: number, prec: number): Geom_BSplineCurve;
ConvertToBSpline(C: Geom2d_Curve, first: number, last: number, prec: number): Geom2d_BSplineCurve;

static FixKnots(): { returnValue: boolean; knots: NCollection_HArray1_double; [Symbol.dispose](): void };
static FixKnots(knots: NCollection_Array1_double): boolean;
static FixKnots(): { returnValue: boolean; knots: NCollection_HArray1_double; [Symbol.dispose](): void };
static FixKnots(knots: NCollection_Array1_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeConstruct_MakeTriangulation: declare class ShapeConstruct_MakeTriangulation extends BRepBuilderAPI_MakeShape

constructor

// This is called by `Shape()`
Build(theRange?: Message_ProgressRange): void;

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This tool provides a method for computing pcurve by projecting 3d curve onto a surface
ShapeConstruct_ProjectCurveOnSurface: declare class ShapeConstruct_ProjectCurveOnSurface extends Standard_Transient

constructor

// Initializes the object with all necessary parameters, i.e
Init(theSurf: Geom_Surface, thePreci: number): void;
Init(theSurf: ShapeAnalysis_Surface, thePreci: number): void;
Init(theSurf: Geom_Surface, thePreci: number): void;
Init(theSurf: ShapeAnalysis_Surface, thePreci: number): void;
// theSurf: the surface to project on
// thePreci: the precision for projection

// Loads a surface (in the form of {@link Geom_Surface`Geom_Surface`}) to project on
SetSurface(theSurf: Geom_Surface): void;
SetSurface(theSurf: ShapeAnalysis_Surface): void;
SetSurface(theSurf: Geom_Surface): void;
SetSurface(theSurf: ShapeAnalysis_Surface): void;
// theSurf: the surface to project on

// Sets value for current precision
SetPrecision(thePreci: number): void;
// thePreci: the precision value

// Returns (modifiable) the flag specifying to which side of parametrical space adjust part of pcurve which lies on seam
AdjustOverDegenMode(): number;

// Returns the status of last Perform
Status(theStatus: ShapeExtend_Status): boolean;
// theStatus: the status to query

// Computes the projection of 3d curve onto a surface using the specialized algorithm
Perform(theC3D: Geom_Curve, theFirst: number, theLast: number, theTolFirst: number, theTolLast: number): { returnValue: boolean; theC2D: Geom2d_Curve; [Symbol.dispose](): void };
// theC3D: the 3D curve to project
// theFirst: the first parameter of the curve
// theLast: the last parameter of the curve
// theTolFirst: the tolerance at the first point (default
// theTolLast: the tolerance at the last point (default

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
