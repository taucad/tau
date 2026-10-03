# libcascade — ShapeCustom

12 top-level symbols. Signatures are verbatim typescript.

ShapeCustom: declare class ShapeCustom

  // ShapeCustom.constructor (constructor)
  constructor();

  // ShapeCustom.ApplyModifier (method)
  static ApplyModifier(S: TopoDS_Shape, M: BRepTools_Modification, context: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, MD: BRepTools_Modifier, theProgress: Message_ProgressRange, aReShape: ShapeBuild_ReShape): TopoDS_Shape;

  // ShapeCustom.DirectFaces (method)
  static DirectFaces(S: TopoDS_Shape): TopoDS_Shape;

  // ShapeCustom.ScaleShape (method)
  static ScaleShape(S: TopoDS_Shape, scale: number): TopoDS_Shape;

  // ShapeCustom.BSplineRestriction (method)
  static BSplineRestriction(S: TopoDS_Shape, Tol3d: number, Tol2d: number, MaxDegree: number, MaxNbSegment: number, Continuity3d: GeomAbs_Shape, Continuity2d: GeomAbs_Shape, Degree: boolean, Rational: boolean, aParameters: ShapeCustom_RestrictionParameters): TopoDS_Shape;

  // ShapeCustom.ConvertToRevolution (method)
  static ConvertToRevolution(S: TopoDS_Shape): TopoDS_Shape;

  // ShapeCustom.SweptToElementary (method)
  static SweptToElementary(S: TopoDS_Shape): TopoDS_Shape;

  // ShapeCustom.ConvertToBSpline (method)
  static ConvertToBSpline(S: TopoDS_Shape, extrMode: boolean, revolMode: boolean, offsetMode: boolean, planeMode?: boolean): TopoDS_Shape;

  // ShapeCustom.delete (method)
  delete(): void;

  // ShapeCustom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_BSplineRestriction: declare class ShapeCustom_BSplineRestriction extends ShapeCustom_Modification

  // ShapeCustom_BSplineRestriction.constructor (constructor)
  constructor();
  constructor(anApproxSurfaceFlag: boolean, anApproxCurve3dFlag: boolean, anApproxCurve2dFlag: boolean, aTol3d: number, aTol2d: number, aContinuity3d: GeomAbs_Shape, aContinuity2d: GeomAbs_Shape, aMaxDegree: number, aNbMaxSeg: number, Degree: boolean, Rational: boolean);
  constructor(anApproxSurfaceFlag: boolean, anApproxCurve3dFlag: boolean, anApproxCurve2dFlag: boolean, aTol3d: number, aTol2d: number, aContinuity3d: GeomAbs_Shape, aContinuity2d: GeomAbs_Shape, aMaxDegree: number, aNbMaxSeg: number, Degree: boolean, Rational: boolean, aModes: ShapeCustom_RestrictionParameters);

  // ShapeCustom_BSplineRestriction.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // ShapeCustom_BSplineRestriction.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_BSplineRestriction.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_BSplineRestriction.ConvertSurface (method)
  ConvertSurface(aSurface: Geom_Surface, UF: number, UL: number, VF: number, VL: number, IsOf: boolean): { returnValue: boolean; S: Geom_Surface; [Symbol.dispose](): void };

  // ShapeCustom_BSplineRestriction.ConvertCurve (method)
  ConvertCurve(aCurve: Geom_Curve, IsConvert: boolean, First: number, Last: number, TolCur: number, IsOf: boolean): { returnValue: boolean; C: Geom_Curve; TolCur: number; [Symbol.dispose](): void };

  // ShapeCustom_BSplineRestriction.ConvertCurve2d (method)
  ConvertCurve2d(aCurve: Geom2d_Curve, IsConvert: boolean, First: number, Last: number, TolCur: number, IsOf: boolean): { returnValue: boolean; C: Geom2d_Curve; TolCur: number; [Symbol.dispose](): void };

  // ShapeCustom_BSplineRestriction.SetTol3d (method)
  SetTol3d(Tol3d: number): void;

  // ShapeCustom_BSplineRestriction.SetTol2d (method)
  SetTol2d(Tol2d: number): void;

  // ShapeCustom_BSplineRestriction.ModifyApproxSurfaceFlag (method)
  ModifyApproxSurfaceFlag(): boolean;

  // ShapeCustom_BSplineRestriction.ModifyApproxCurve3dFlag (method)
  ModifyApproxCurve3dFlag(): boolean;

  // ShapeCustom_BSplineRestriction.ModifyApproxCurve2dFlag (method)
  ModifyApproxCurve2dFlag(): boolean;

  // ShapeCustom_BSplineRestriction.SetContinuity3d (method)
  SetContinuity3d(Continuity3d: GeomAbs_Shape): void;

  // ShapeCustom_BSplineRestriction.SetContinuity2d (method)
  SetContinuity2d(Continuity2d: GeomAbs_Shape): void;

  // ShapeCustom_BSplineRestriction.SetMaxDegree (method)
  SetMaxDegree(MaxDegree: number): void;

  // ShapeCustom_BSplineRestriction.SetMaxNbSegments (method)
  SetMaxNbSegments(MaxNbSegments: number): void;

  // ShapeCustom_BSplineRestriction.SetPriority (method)
  SetPriority(Degree: boolean): void;

  // ShapeCustom_BSplineRestriction.SetConvRational (method)
  SetConvRational(Rational: boolean): void;

  // ShapeCustom_BSplineRestriction.GetRestrictionParameters (method)
  GetRestrictionParameters(): ShapeCustom_RestrictionParameters;

  // ShapeCustom_BSplineRestriction.SetRestrictionParameters (method)
  SetRestrictionParameters(aModes: ShapeCustom_RestrictionParameters): void;

  // ShapeCustom_BSplineRestriction.Curve3dError (method)
  Curve3dError(): number;

  // ShapeCustom_BSplineRestriction.Curve2dError (method)
  Curve2dError(): number;

  // ShapeCustom_BSplineRestriction.SurfaceError (method)
  SurfaceError(): number;

  // ShapeCustom_BSplineRestriction.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // ShapeCustom_BSplineRestriction.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // ShapeCustom_BSplineRestriction.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // ShapeCustom_BSplineRestriction.MaxErrors (method)
  MaxErrors(aCurve3dErr?: number, aCurve2dErr?: number): { returnValue: number; aCurve3dErr: number; aCurve2dErr: number };

  // ShapeCustom_BSplineRestriction.NbOfSpan (method)
  NbOfSpan(): number;

  // ShapeCustom_BSplineRestriction.get_type_name (method)
  static get_type_name(): string;

  // ShapeCustom_BSplineRestriction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeCustom_BSplineRestriction.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeCustom_BSplineRestriction.delete (method)
  delete(): void;

  // ShapeCustom_BSplineRestriction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_ConvertToBSpline: declare class ShapeCustom_ConvertToBSpline extends ShapeCustom_Modification

  // ShapeCustom_ConvertToBSpline.constructor (constructor)
  constructor();

  // ShapeCustom_ConvertToBSpline.SetExtrusionMode (method)
  SetExtrusionMode(extrMode: boolean): void;

  // ShapeCustom_ConvertToBSpline.SetRevolutionMode (method)
  SetRevolutionMode(revolMode: boolean): void;

  // ShapeCustom_ConvertToBSpline.SetOffsetMode (method)
  SetOffsetMode(offsetMode: boolean): void;

  // ShapeCustom_ConvertToBSpline.SetPlaneMode (method)
  SetPlaneMode(planeMode: boolean): void;

  // ShapeCustom_ConvertToBSpline.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // ShapeCustom_ConvertToBSpline.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_ConvertToBSpline.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // ShapeCustom_ConvertToBSpline.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_ConvertToBSpline.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // ShapeCustom_ConvertToBSpline.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // ShapeCustom_ConvertToBSpline.get_type_name (method)
  static get_type_name(): string;

  // ShapeCustom_ConvertToBSpline.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeCustom_ConvertToBSpline.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeCustom_ConvertToBSpline.delete (method)
  delete(): void;

  // ShapeCustom_ConvertToBSpline.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_ConvertToRevolution: declare class ShapeCustom_ConvertToRevolution extends ShapeCustom_Modification

  // ShapeCustom_ConvertToRevolution.constructor (constructor)
  constructor();

  // ShapeCustom_ConvertToRevolution.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // ShapeCustom_ConvertToRevolution.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_ConvertToRevolution.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // ShapeCustom_ConvertToRevolution.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_ConvertToRevolution.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // ShapeCustom_ConvertToRevolution.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // ShapeCustom_ConvertToRevolution.get_type_name (method)
  static get_type_name(): string;

  // ShapeCustom_ConvertToRevolution.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeCustom_ConvertToRevolution.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeCustom_ConvertToRevolution.delete (method)
  delete(): void;

  // ShapeCustom_ConvertToRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_Curve: declare class ShapeCustom_Curve

  // ShapeCustom_Curve.constructor (constructor)
  constructor();
  constructor(C: Geom_Curve);

  // ShapeCustom_Curve.Init (method)
  Init(C: Geom_Curve): void;

  // ShapeCustom_Curve.ConvertToPeriodic (method)
  ConvertToPeriodic(substitute: boolean, preci?: number): Geom_Curve;

  // ShapeCustom_Curve.delete (method)
  delete(): void;

  // ShapeCustom_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_Curve2d: declare class ShapeCustom_Curve2d

  // ShapeCustom_Curve2d.constructor (constructor)
  constructor();

  // ShapeCustom_Curve2d.IsLinear (method)
  static IsLinear(thePoles: NCollection_Array1_gp_Pnt2d, theTolerance: number, theDeviation?: number): { returnValue: boolean; theDeviation: number };

  // ShapeCustom_Curve2d.ConvertToLine2d (method)
  static ConvertToLine2d(theCurve: Geom2d_Curve, theFirstIn: number, theLastIn: number, theTolerance: number, theNewFirst?: number, theNewLast?: number, theDeviation?: number): { returnValue: Geom2d_Line; theNewFirst: number; theNewLast: number; theDeviation: number; [Symbol.dispose](): void };

  // ShapeCustom_Curve2d.SimplifyBSpline2d (method)
  static SimplifyBSpline2d(theTolerance: number): { returnValue: boolean; theBSpline2d: Geom2d_BSplineCurve; [Symbol.dispose](): void };

  // ShapeCustom_Curve2d.delete (method)
  delete(): void;

  // ShapeCustom_Curve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_DirectModification: declare class ShapeCustom_DirectModification extends ShapeCustom_Modification

  // ShapeCustom_DirectModification.constructor (constructor)
  constructor();

  // ShapeCustom_DirectModification.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // ShapeCustom_DirectModification.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_DirectModification.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // ShapeCustom_DirectModification.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_DirectModification.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // ShapeCustom_DirectModification.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // ShapeCustom_DirectModification.get_type_name (method)
  static get_type_name(): string;

  // ShapeCustom_DirectModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeCustom_DirectModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeCustom_DirectModification.delete (method)
  delete(): void;

  // ShapeCustom_DirectModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_Modification: declare class ShapeCustom_Modification extends BRepTools_Modification

  // ShapeCustom_Modification.SetMsgRegistrator (method)
  SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

  // ShapeCustom_Modification.MsgRegistrator (method)
  MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

  // ShapeCustom_Modification.SendMsg (method)
  SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity?: Message_Gravity): void;

  // ShapeCustom_Modification.get_type_name (method)
  static get_type_name(): string;

  // ShapeCustom_Modification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeCustom_Modification.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeCustom_Modification.delete (method)
  delete(): void;

  // ShapeCustom_Modification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_RestrictionParameters: declare class ShapeCustom_RestrictionParameters extends Standard_Transient

  // ShapeCustom_RestrictionParameters.constructor (constructor)
  constructor();

  // ShapeCustom_RestrictionParameters.GMaxDegree (method)
  GMaxDegree(): number;

  // ShapeCustom_RestrictionParameters.GMaxSeg (method)
  GMaxSeg(): number;

  // ShapeCustom_RestrictionParameters.ConvertPlane (method)
  ConvertPlane(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertBezierSurf (method)
  ConvertBezierSurf(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertRevolutionSurf (method)
  ConvertRevolutionSurf(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertExtrusionSurf (method)
  ConvertExtrusionSurf(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertOffsetSurf (method)
  ConvertOffsetSurf(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertCylindricalSurf (method)
  ConvertCylindricalSurf(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertConicalSurf (method)
  ConvertConicalSurf(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertToroidalSurf (method)
  ConvertToroidalSurf(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertSphericalSurf (method)
  ConvertSphericalSurf(): boolean;

  // ShapeCustom_RestrictionParameters.SegmentSurfaceMode (method)
  SegmentSurfaceMode(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertCurve3d (method)
  ConvertCurve3d(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertOffsetCurv3d (method)
  ConvertOffsetCurv3d(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertCurve2d (method)
  ConvertCurve2d(): boolean;

  // ShapeCustom_RestrictionParameters.ConvertOffsetCurv2d (method)
  ConvertOffsetCurv2d(): boolean;

  // ShapeCustom_RestrictionParameters.get_type_name (method)
  static get_type_name(): string;

  // ShapeCustom_RestrictionParameters.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeCustom_RestrictionParameters.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeCustom_RestrictionParameters.delete (method)
  delete(): void;

  // ShapeCustom_RestrictionParameters.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_Surface: declare class ShapeCustom_Surface

  // ShapeCustom_Surface.constructor (constructor)
  constructor();
  constructor(S: Geom_Surface);

  // ShapeCustom_Surface.Init (method)
  Init(S: Geom_Surface): void;

  // ShapeCustom_Surface.Gap (method)
  Gap(): number;

  // ShapeCustom_Surface.ConvertToAnalytical (method)
  ConvertToAnalytical(tol: number, substitute: boolean): Geom_Surface;

  // ShapeCustom_Surface.ConvertToPeriodic (method)
  ConvertToPeriodic(substitute: boolean, preci?: number): Geom_Surface;

  // ShapeCustom_Surface.delete (method)
  delete(): void;

  // ShapeCustom_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_SweptToElementary: declare class ShapeCustom_SweptToElementary extends ShapeCustom_Modification

  // ShapeCustom_SweptToElementary.constructor (constructor)
  constructor();

  // ShapeCustom_SweptToElementary.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // ShapeCustom_SweptToElementary.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_SweptToElementary.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // ShapeCustom_SweptToElementary.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_SweptToElementary.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // ShapeCustom_SweptToElementary.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // ShapeCustom_SweptToElementary.get_type_name (method)
  static get_type_name(): string;

  // ShapeCustom_SweptToElementary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeCustom_SweptToElementary.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeCustom_SweptToElementary.delete (method)
  delete(): void;

  // ShapeCustom_SweptToElementary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeCustom_TrsfModification: declare class ShapeCustom_TrsfModification extends BRepTools_TrsfModification

  // ShapeCustom_TrsfModification.constructor (constructor)
  constructor(T: gp_Trsf);

  // ShapeCustom_TrsfModification.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // ShapeCustom_TrsfModification.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_TrsfModification.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // ShapeCustom_TrsfModification.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // ShapeCustom_TrsfModification.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // ShapeCustom_TrsfModification.get_type_name (method)
  static get_type_name(): string;

  // ShapeCustom_TrsfModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeCustom_TrsfModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeCustom_TrsfModification.delete (method)
  delete(): void;

  // ShapeCustom_TrsfModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
