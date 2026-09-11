# libcascade — ShapeConstruct

4 top-level symbols. Signatures are verbatim typescript.

ShapeConstruct: declare class ShapeConstruct

constructor

static ConvertCurveToBSpline(C3D: Geom_Curve, First: number, Last: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineCurve;
static ConvertCurveToBSpline(C2D: Geom2d_Curve, First: number, Last: number, Tol2d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom2d_BSplineCurve;
static ConvertCurveToBSpline(C3D: Geom_Curve, First: number, Last: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineCurve;
static ConvertCurveToBSpline(C2D: Geom2d_Curve, First: number, Last: number, Tol2d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom2d_BSplineCurve;

static ConvertSurfaceToBSpline(surf: Geom_Surface, UF: number, UL: number, VF: number, VL: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineSurface;

static JoinPCurves(theEdges: NCollection_HSequence_TopoDS_Shape, theFace: TopoDS_Face, theEdge: TopoDS_Edge): boolean;

static JoinCurves(c3d1: Geom_Curve, ac3d2: Geom_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1?: number, last1?: number, first2?: number, last2?: number, isRev1?: boolean, isRev2?: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c3dOut: Geom_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };
static JoinCurves(c2d1: Geom2d_Curve, ac2d2: Geom2d_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1: number, last1: number, first2: number, last2: number, isRev1: boolean, isRev2: boolean, isError: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c2dOut: Geom2d_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };
static JoinCurves(c3d1: Geom_Curve, ac3d2: Geom_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1?: number, last1?: number, first2?: number, last2?: number, isRev1?: boolean, isRev2?: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c3dOut: Geom_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };
static JoinCurves(c2d1: Geom2d_Curve, ac2d2: Geom2d_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1: number, last1: number, first2: number, last2: number, isRev1: boolean, isRev2: boolean, isError: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c2dOut: Geom2d_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;

ShapeConstruct_Curve: declare class ShapeConstruct_Curve

constructor

AdjustCurve(C3D: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, take1?: boolean, take2?: boolean): boolean;

AdjustCurveSegment(C3D: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, U1: number, U2: number): boolean;

AdjustCurve2d(C2D: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, take1?: boolean, take2?: boolean): boolean;

ConvertToBSpline(C: Geom_Curve, first: number, last: number, prec: number): Geom_BSplineCurve;
ConvertToBSpline(C: Geom2d_Curve, first: number, last: number, prec: number): Geom2d_BSplineCurve;
ConvertToBSpline(C: Geom_Curve, first: number, last: number, prec: number): Geom_BSplineCurve;
ConvertToBSpline(C: Geom2d_Curve, first: number, last: number, prec: number): Geom2d_BSplineCurve;

static FixKnots(): { returnValue: boolean; knots: NCollection_HArray1_double; [Symbol.dispose](): void };
static FixKnots(knots: NCollection_Array1_double): boolean;
static FixKnots(): { returnValue: boolean; knots: NCollection_HArray1_double; [Symbol.dispose](): void };
static FixKnots(knots: NCollection_Array1_double): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeConstruct_MakeTriangulation: declare class ShapeConstruct_MakeTriangulation extends BRepBuilderAPI_MakeShape

constructor

Build(theRange?: Message_ProgressRange): void;

IsDone(): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeConstruct_ProjectCurveOnSurface: declare class ShapeConstruct_ProjectCurveOnSurface extends Standard_Transient

constructor

Init(theSurf: Geom_Surface, thePreci: number): void;
Init(theSurf: ShapeAnalysis_Surface, thePreci: number): void;
Init(theSurf: Geom_Surface, thePreci: number): void;
Init(theSurf: ShapeAnalysis_Surface, thePreci: number): void;

SetSurface(theSurf: Geom_Surface): void;
SetSurface(theSurf: ShapeAnalysis_Surface): void;
SetSurface(theSurf: Geom_Surface): void;
SetSurface(theSurf: ShapeAnalysis_Surface): void;

SetPrecision(thePreci: number): void;

AdjustOverDegenMode(): number;

Status(theStatus: ShapeExtend_Status): boolean;

Perform(theC3D: Geom_Curve, theFirst: number, theLast: number, theTolFirst: number, theTolLast: number): { returnValue: boolean; theC2D: Geom2d_Curve; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
