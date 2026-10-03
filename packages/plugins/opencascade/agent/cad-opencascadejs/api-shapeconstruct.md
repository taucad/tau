# libcascade — ShapeConstruct

4 top-level symbols. Signatures are verbatim typescript.

ShapeConstruct: declare class ShapeConstruct

  // ShapeConstruct.constructor (constructor)
  constructor();

  // ShapeConstruct.ConvertCurveToBSpline (method)
  static ConvertCurveToBSpline(C3D: Geom_Curve, First: number, Last: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineCurve;
  static ConvertCurveToBSpline(C2D: Geom2d_Curve, First: number, Last: number, Tol2d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom2d_BSplineCurve;

  // ShapeConstruct.ConvertSurfaceToBSpline (method)
  static ConvertSurfaceToBSpline(surf: Geom_Surface, UF: number, UL: number, VF: number, VL: number, Tol3d: number, Continuity: GeomAbs_Shape, MaxSegments: number, MaxDegree: number): Geom_BSplineSurface;

  // ShapeConstruct.JoinPCurves (method)
  static JoinPCurves(theEdges: NCollection_HSequence_TopoDS_Shape, theFace: TopoDS_Face, theEdge: TopoDS_Edge): boolean;

  // ShapeConstruct.JoinCurves (method)
  static JoinCurves(c3d1: Geom_Curve, ac3d2: Geom_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1?: number, last1?: number, first2?: number, last2?: number, isRev1?: boolean, isRev2?: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c3dOut: Geom_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };
  static JoinCurves(c2d1: Geom2d_Curve, ac2d2: Geom2d_Curve, Orient1: TopAbs_Orientation, Orient2: TopAbs_Orientation, first1: number, last1: number, first2: number, last2: number, isRev1: boolean, isRev2: boolean, isError: boolean): { returnValue: boolean; first1: number; last1: number; first2: number; last2: number; c2dOut: Geom2d_Curve; isRev1: boolean; isRev2: boolean; [Symbol.dispose](): void };

  // ShapeConstruct.delete (method)
  delete(): void;

  // ShapeConstruct.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeConstruct_Curve: declare class ShapeConstruct_Curve

  // ShapeConstruct_Curve.constructor (constructor)
  constructor();

  // ShapeConstruct_Curve.AdjustCurve (method)
  AdjustCurve(C3D: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, take1?: boolean, take2?: boolean): boolean;

  // ShapeConstruct_Curve.AdjustCurveSegment (method)
  AdjustCurveSegment(C3D: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, U1: number, U2: number): boolean;

  // ShapeConstruct_Curve.AdjustCurve2d (method)
  AdjustCurve2d(C2D: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, take1?: boolean, take2?: boolean): boolean;

  // ShapeConstruct_Curve.ConvertToBSpline (method)
  ConvertToBSpline(C: Geom_Curve, first: number, last: number, prec: number): Geom_BSplineCurve;
  ConvertToBSpline(C: Geom2d_Curve, first: number, last: number, prec: number): Geom2d_BSplineCurve;

  // ShapeConstruct_Curve.FixKnots (method)
  static FixKnots(): { returnValue: boolean; knots: NCollection_HArray1_double; [Symbol.dispose](): void };
  static FixKnots(knots: NCollection_Array1_double): boolean;

  // ShapeConstruct_Curve.delete (method)
  delete(): void;

  // ShapeConstruct_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeConstruct_MakeTriangulation: declare class ShapeConstruct_MakeTriangulation extends BRepBuilderAPI_MakeShape

  // ShapeConstruct_MakeTriangulation.constructor (constructor)
  constructor(pnts: NCollection_Array1_gp_Pnt, prec?: number);
  constructor(wire: TopoDS_Wire, prec?: number);

  // ShapeConstruct_MakeTriangulation.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // ShapeConstruct_MakeTriangulation.IsDone (method)
  IsDone(): boolean;

  // ShapeConstruct_MakeTriangulation.delete (method)
  delete(): void;

  // ShapeConstruct_MakeTriangulation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeConstruct_ProjectCurveOnSurface: declare class ShapeConstruct_ProjectCurveOnSurface extends Standard_Transient

  // ShapeConstruct_ProjectCurveOnSurface.constructor (constructor)
  constructor();

  // ShapeConstruct_ProjectCurveOnSurface.Init (method)
  Init(theSurf: Geom_Surface, thePreci: number): void;
  Init(theSurf: ShapeAnalysis_Surface, thePreci: number): void;

  // ShapeConstruct_ProjectCurveOnSurface.SetSurface (method)
  SetSurface(theSurf: Geom_Surface): void;
  SetSurface(theSurf: ShapeAnalysis_Surface): void;

  // ShapeConstruct_ProjectCurveOnSurface.SetPrecision (method)
  SetPrecision(thePreci: number): void;

  // ShapeConstruct_ProjectCurveOnSurface.AdjustOverDegenMode (method)
  AdjustOverDegenMode(): number;

  // ShapeConstruct_ProjectCurveOnSurface.Status (method)
  Status(theStatus: ShapeExtend_Status): boolean;

  // ShapeConstruct_ProjectCurveOnSurface.Perform (method)
  Perform(theC3D: Geom_Curve, theFirst: number, theLast: number, theTolFirst: number, theTolLast: number): { returnValue: boolean; theC2D: Geom2d_Curve; [Symbol.dispose](): void };

  // ShapeConstruct_ProjectCurveOnSurface.get_type_name (method)
  static get_type_name(): string;

  // ShapeConstruct_ProjectCurveOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeConstruct_ProjectCurveOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeConstruct_ProjectCurveOnSurface.delete (method)
  delete(): void;

  // ShapeConstruct_ProjectCurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
