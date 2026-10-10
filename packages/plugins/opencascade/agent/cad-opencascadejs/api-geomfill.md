# libcascade — GeomFill

21 top-level symbols. Signatures are verbatim typescript.

GeomFill: declare class GeomFill

  // GeomFill.constructor (constructor)
  constructor();

  // GeomFill.Surface (method)
  static Surface(Curve1: Geom_Curve, Curve2: Geom_Curve): Geom_Surface;

  // GeomFill.GetCircle (method)
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, nplan: gp_Vec, pt1: gp_Pnt, pt2: gp_Pnt, Rayon: number, Center: gp_Pnt, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): void;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Rayon: number, DRayon: number, Center: gp_Pnt, DCenter: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, d2n1w: gp_Vec, d2n2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, d2nplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Dtang1: gp_Vec, Dtang2: gp_Vec, Rayon: number, DRayon: number, D2Rayon: number, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // GeomFill.Knots (method)
  static Knots(TypeConv: Convert_ParameterisationType, TKnots: NCollection_Array1_double): void;

  // GeomFill.Mults (method)
  static Mults(TypeConv: Convert_ParameterisationType, TMults: NCollection_Array1_int): void;

  // GeomFill.GetMinimalWeights (method)
  static GetMinimalWeights(TConv: Convert_ParameterisationType, AngleMin: number, AngleMax: number, Weigths: NCollection_Array1_double): void;

  // GeomFill.GetTolerance (method)
  static GetTolerance(TConv: Convert_ParameterisationType, AngleMin: number, Radius: number, AngularTol: number, SpatialTol: number): number;

  // GeomFill.delete (method)
  delete(): void;

  // GeomFill.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_AppSurf: declare class GeomFill_AppSurf extends AppBlend_Approx

  // GeomFill_AppSurf.constructor (constructor)
  constructor();
  constructor(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean);

  // GeomFill_AppSurf.Init (method)
  Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

  // GeomFill_AppSurf.SetParType (method)
  SetParType(ParType: Approx_ParametrizationType): void;

  // GeomFill_AppSurf.SetContinuity (method)
  SetContinuity(C: GeomAbs_Shape): void;

  // GeomFill_AppSurf.SetCriteriumWeight (method)
  SetCriteriumWeight(W1: number, W2: number, W3: number): void;

  // GeomFill_AppSurf.ParType (method)
  ParType(): Approx_ParametrizationType;

  // GeomFill_AppSurf.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomFill_AppSurf.CriteriumWeight (method)
  CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

  // GeomFill_AppSurf.Perform (method)
  Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, SpApprox: boolean): void;
  Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, NbMaxP: number): void;

  // GeomFill_AppSurf.PerformSmoothing (method)
  PerformSmoothing(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator): void;

  // GeomFill_AppSurf.IsDone (method)
  IsDone(): boolean;

  // GeomFill_AppSurf.SurfShape (method)
  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  // GeomFill_AppSurf.Surface (method)
  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  // GeomFill_AppSurf.UDegree (method)
  UDegree(): number;

  // GeomFill_AppSurf.VDegree (method)
  VDegree(): number;

  // GeomFill_AppSurf.SurfPoles (method)
  SurfPoles(): NCollection_Array2_gp_Pnt;

  // GeomFill_AppSurf.SurfWeights (method)
  SurfWeights(): NCollection_Array2_double;

  // GeomFill_AppSurf.SurfUKnots (method)
  SurfUKnots(): NCollection_Array1_double;

  // GeomFill_AppSurf.SurfVKnots (method)
  SurfVKnots(): NCollection_Array1_double;

  // GeomFill_AppSurf.SurfUMults (method)
  SurfUMults(): NCollection_Array1_int;

  // GeomFill_AppSurf.SurfVMults (method)
  SurfVMults(): NCollection_Array1_int;

  // GeomFill_AppSurf.NbCurves2d (method)
  NbCurves2d(): number;

  // GeomFill_AppSurf.Curves2dShape (method)
  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  // GeomFill_AppSurf.Curve2d (method)
  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  // GeomFill_AppSurf.Curves2dDegree (method)
  Curves2dDegree(): number;

  // GeomFill_AppSurf.Curve2dPoles (method)
  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  // GeomFill_AppSurf.Curves2dKnots (method)
  Curves2dKnots(): NCollection_Array1_double;

  // GeomFill_AppSurf.Curves2dMults (method)
  Curves2dMults(): NCollection_Array1_int;

  // GeomFill_AppSurf.TolReached (method)
  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  // GeomFill_AppSurf.TolCurveOnSurf (method)
  TolCurveOnSurf(Index: number): number;

  // GeomFill_AppSurf.delete (method)
  delete(): void;

  // GeomFill_AppSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_AppSweep: declare class GeomFill_AppSweep extends AppBlend_Approx

  // GeomFill_AppSweep.constructor (constructor)
  constructor();
  constructor(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean);

  // GeomFill_AppSweep.Init (method)
  Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

  // GeomFill_AppSweep.SetParType (method)
  SetParType(ParType: Approx_ParametrizationType): void;

  // GeomFill_AppSweep.SetContinuity (method)
  SetContinuity(C: GeomAbs_Shape): void;

  // GeomFill_AppSweep.SetCriteriumWeight (method)
  SetCriteriumWeight(W1: number, W2: number, W3: number): void;

  // GeomFill_AppSweep.ParType (method)
  ParType(): Approx_ParametrizationType;

  // GeomFill_AppSweep.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomFill_AppSweep.CriteriumWeight (method)
  CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

  // GeomFill_AppSweep.IsDone (method)
  IsDone(): boolean;

  // GeomFill_AppSweep.SurfShape (method)
  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  // GeomFill_AppSweep.Surface (method)
  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  // GeomFill_AppSweep.UDegree (method)
  UDegree(): number;

  // GeomFill_AppSweep.VDegree (method)
  VDegree(): number;

  // GeomFill_AppSweep.SurfPoles (method)
  SurfPoles(): NCollection_Array2_gp_Pnt;

  // GeomFill_AppSweep.SurfWeights (method)
  SurfWeights(): NCollection_Array2_double;

  // GeomFill_AppSweep.SurfUKnots (method)
  SurfUKnots(): NCollection_Array1_double;

  // GeomFill_AppSweep.SurfVKnots (method)
  SurfVKnots(): NCollection_Array1_double;

  // GeomFill_AppSweep.SurfUMults (method)
  SurfUMults(): NCollection_Array1_int;

  // GeomFill_AppSweep.SurfVMults (method)
  SurfVMults(): NCollection_Array1_int;

  // GeomFill_AppSweep.NbCurves2d (method)
  NbCurves2d(): number;

  // GeomFill_AppSweep.Curves2dShape (method)
  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  // GeomFill_AppSweep.Curve2d (method)
  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  // GeomFill_AppSweep.Curves2dDegree (method)
  Curves2dDegree(): number;

  // GeomFill_AppSweep.Curve2dPoles (method)
  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  // GeomFill_AppSweep.Curves2dKnots (method)
  Curves2dKnots(): NCollection_Array1_double;

  // GeomFill_AppSweep.Curves2dMults (method)
  Curves2dMults(): NCollection_Array1_int;

  // GeomFill_AppSweep.TolReached (method)
  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  // GeomFill_AppSweep.TolCurveOnSurf (method)
  TolCurveOnSurf(Index: number): number;

  // GeomFill_AppSweep.delete (method)
  delete(): void;

  // GeomFill_AppSweep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_ApproxStyle: typeof GeomFill_ApproxStyle[keyof typeof GeomFill_ApproxStyle]

  readonly GeomFill_Section: 'GeomFill_Section'

  readonly GeomFill_Location: 'GeomFill_Location'

GeomFill_BSplineCurves: declare class GeomFill_BSplineCurves

  // GeomFill_BSplineCurves.constructor (constructor)
  constructor();
  constructor(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, Type: GeomFill_FillingStyle);
  constructor(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, Type: GeomFill_FillingStyle);
  constructor(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, C4: Geom_BSplineCurve, Type: GeomFill_FillingStyle);

  // GeomFill_BSplineCurves.Init (method)
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, C4: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;

  // GeomFill_BSplineCurves.Surface (method)
  Surface(): Geom_BSplineSurface;

  // GeomFill_BSplineCurves.delete (method)
  delete(): void;

  // GeomFill_BSplineCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_BezierCurves: declare class GeomFill_BezierCurves

  // GeomFill_BezierCurves.constructor (constructor)
  constructor();
  constructor(C1: Geom_BezierCurve, C2: Geom_BezierCurve, Type: GeomFill_FillingStyle);
  constructor(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, Type: GeomFill_FillingStyle);
  constructor(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, C4: Geom_BezierCurve, Type: GeomFill_FillingStyle);

  // GeomFill_BezierCurves.Init (method)
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, C4: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;

  // GeomFill_BezierCurves.Surface (method)
  Surface(): Geom_BezierSurface;

  // GeomFill_BezierCurves.delete (method)
  delete(): void;

  // GeomFill_BezierCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_BoundWithSurf: declare class GeomFill_BoundWithSurf extends GeomFill_Boundary

  // GeomFill_BoundWithSurf.constructor (constructor)
  constructor(CurveOnSurf: Adaptor3d_CurveOnSurface, Tol3d: number, Tolang: number);

  // GeomFill_BoundWithSurf.Value (method)
  Value(U: number): gp_Pnt;

  // GeomFill_BoundWithSurf.D1 (method)
  D1(U: number, P: gp_Pnt, V: gp_Vec): void;

  // GeomFill_BoundWithSurf.HasNormals (method)
  HasNormals(): boolean;

  // GeomFill_BoundWithSurf.Norm (method)
  Norm(U: number): gp_Vec;

  // GeomFill_BoundWithSurf.D1Norm (method)
  D1Norm(U: number, N: gp_Vec, DN: gp_Vec): void;

  // GeomFill_BoundWithSurf.Reparametrize (method)
  Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

  // GeomFill_BoundWithSurf.Bounds (method)
  Bounds(First: number, Last: number): { First: number; Last: number };

  // GeomFill_BoundWithSurf.IsDegenerated (method)
  IsDegenerated(): boolean;

  // GeomFill_BoundWithSurf.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_BoundWithSurf.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_BoundWithSurf.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_BoundWithSurf.delete (method)
  delete(): void;

  // GeomFill_BoundWithSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Boundary: declare class GeomFill_Boundary extends Standard_Transient

  // GeomFill_Boundary.Value (method)
  Value(U: number): gp_Pnt;

  // GeomFill_Boundary.D1 (method)
  D1(U: number, P: gp_Pnt, V: gp_Vec): void;

  // GeomFill_Boundary.HasNormals (method)
  HasNormals(): boolean;

  // GeomFill_Boundary.Norm (method)
  Norm(U: number): gp_Vec;

  // GeomFill_Boundary.D1Norm (method)
  D1Norm(U: number, N: gp_Vec, DN: gp_Vec): void;

  // GeomFill_Boundary.Reparametrize (method)
  Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

  // GeomFill_Boundary.Points (method)
  Points(PFirst: gp_Pnt, PLast: gp_Pnt): void;

  // GeomFill_Boundary.Bounds (method)
  Bounds(First: number, Last: number): { First: number; Last: number };

  // GeomFill_Boundary.IsDegenerated (method)
  IsDegenerated(): boolean;

  // GeomFill_Boundary.Tol3d (method)
  Tol3d(): number;
  Tol3d(Tol: number): void;

  // GeomFill_Boundary.Tolang (method)
  Tolang(): number;
  Tolang(Tol: number): void;

  // GeomFill_Boundary.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_Boundary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_Boundary.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_Boundary.delete (method)
  delete(): void;

  // GeomFill_Boundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_CircularBlendFunc: declare class GeomFill_CircularBlendFunc extends Approx_SweepFunction

  // GeomFill_CircularBlendFunc.constructor (constructor)
  constructor(Path: Adaptor3d_Curve, Curve1: Adaptor3d_Curve, Curve2: Adaptor3d_Curve, Radius: number, Polynomial?: boolean);

  // GeomFill_CircularBlendFunc.D0 (method)
  D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;

  // GeomFill_CircularBlendFunc.D1 (method)
  D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  // GeomFill_CircularBlendFunc.D2 (method)
  D2(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // GeomFill_CircularBlendFunc.Nb2dCurves (method)
  Nb2dCurves(): number;

  // GeomFill_CircularBlendFunc.SectionShape (method)
  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  // GeomFill_CircularBlendFunc.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // GeomFill_CircularBlendFunc.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // GeomFill_CircularBlendFunc.IsRational (method)
  IsRational(): boolean;

  // GeomFill_CircularBlendFunc.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_CircularBlendFunc.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_CircularBlendFunc.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_CircularBlendFunc.GetTolerance (method)
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  // GeomFill_CircularBlendFunc.SetTolerance (method)
  SetTolerance(Tol3d: number, Tol2d: number): void;

  // GeomFill_CircularBlendFunc.BarycentreOfSurf (method)
  BarycentreOfSurf(): gp_Pnt;

  // GeomFill_CircularBlendFunc.MaximalSection (method)
  MaximalSection(): number;

  // GeomFill_CircularBlendFunc.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // GeomFill_CircularBlendFunc.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_CircularBlendFunc.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_CircularBlendFunc.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_CircularBlendFunc.delete (method)
  delete(): void;

  // GeomFill_CircularBlendFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_ConstantBiNormal: declare class GeomFill_ConstantBiNormal extends GeomFill_TrihedronLaw

  // GeomFill_ConstantBiNormal.constructor (constructor)
  constructor(BiNormal: gp_Dir);

  // GeomFill_ConstantBiNormal.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_ConstantBiNormal.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_ConstantBiNormal.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_ConstantBiNormal.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_ConstantBiNormal.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_ConstantBiNormal.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_ConstantBiNormal.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_ConstantBiNormal.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_ConstantBiNormal.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_ConstantBiNormal.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_ConstantBiNormal.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_ConstantBiNormal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_ConstantBiNormal.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_ConstantBiNormal.delete (method)
  delete(): void;

  // GeomFill_ConstantBiNormal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_ConstrainedFilling: declare class GeomFill_ConstrainedFilling

  // GeomFill_ConstrainedFilling.constructor (constructor)
  constructor(MaxDeg: number, MaxSeg: number);

  // GeomFill_ConstrainedFilling.Init (method)
  Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, NoCheck: boolean): void;
  Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, B4: GeomFill_Boundary, NoCheck: boolean): void;

  // GeomFill_ConstrainedFilling.SetDomain (method)
  SetDomain(l: number, B: GeomFill_BoundWithSurf): void;

  // GeomFill_ConstrainedFilling.ReBuild (method)
  ReBuild(): void;

  // GeomFill_ConstrainedFilling.Boundary (method)
  Boundary(I: number): GeomFill_Boundary;

  // GeomFill_ConstrainedFilling.Surface (method)
  Surface(): Geom_BSplineSurface;

  // GeomFill_ConstrainedFilling.Eval (method)
  Eval(W: number, Ord: number, Result?: number): { returnValue: number; Result: number };

  // GeomFill_ConstrainedFilling.CheckCoonsAlgPatch (method)
  CheckCoonsAlgPatch(I: number): void;

  // GeomFill_ConstrainedFilling.CheckTgteField (method)
  CheckTgteField(I: number): void;

  // GeomFill_ConstrainedFilling.CheckApprox (method)
  CheckApprox(I: number): void;

  // GeomFill_ConstrainedFilling.CheckResult (method)
  CheckResult(I: number): void;

  // GeomFill_ConstrainedFilling.delete (method)
  delete(): void;

  // GeomFill_ConstrainedFilling.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Coons: declare class GeomFill_Coons extends GeomFill_Filling

  // GeomFill_Coons.constructor (constructor)
  constructor();
  constructor(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt);
  constructor(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double);

  // GeomFill_Coons.Init (method)
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;

  // GeomFill_Coons.delete (method)
  delete(): void;

  // GeomFill_Coons.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_CoonsAlgPatch: declare class GeomFill_CoonsAlgPatch extends Standard_Transient

  // GeomFill_CoonsAlgPatch.constructor (constructor)
  constructor(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, B4: GeomFill_Boundary);

  // GeomFill_CoonsAlgPatch.Func (method)
  Func(): { f1: Law_Function; f2: Law_Function; [Symbol.dispose](): void };
  Func(I: number): Law_Function;

  // GeomFill_CoonsAlgPatch.SetFunc (method)
  SetFunc(f1: Law_Function, f2: Law_Function): void;

  // GeomFill_CoonsAlgPatch.Value (method)
  Value(U: number, V: number): gp_Pnt;

  // GeomFill_CoonsAlgPatch.D1U (method)
  D1U(U: number, V: number): gp_Vec;

  // GeomFill_CoonsAlgPatch.D1V (method)
  D1V(U: number, V: number): gp_Vec;

  // GeomFill_CoonsAlgPatch.DUV (method)
  DUV(U: number, V: number): gp_Vec;

  // GeomFill_CoonsAlgPatch.Corner (method)
  Corner(I: number): gp_Pnt;

  // GeomFill_CoonsAlgPatch.Bound (method)
  Bound(I: number): GeomFill_Boundary;

  // GeomFill_CoonsAlgPatch.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_CoonsAlgPatch.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_CoonsAlgPatch.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_CoonsAlgPatch.delete (method)
  delete(): void;

  // GeomFill_CoonsAlgPatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_CornerState: declare class GeomFill_CornerState

  // GeomFill_CornerState.constructor (constructor)
  constructor();

  // GeomFill_CornerState.Gap (method)
  Gap(): number;
  Gap(G: number): void;

  // GeomFill_CornerState.TgtAng (method)
  TgtAng(): number;
  TgtAng(Ang: number): void;

  // GeomFill_CornerState.HasConstraint (method)
  HasConstraint(): boolean;

  // GeomFill_CornerState.Constraint (method)
  Constraint(): void;

  // GeomFill_CornerState.NorAng (method)
  NorAng(): number;
  NorAng(Ang: number): void;

  // GeomFill_CornerState.IsToKill (method)
  IsToKill(Scal?: number): { returnValue: boolean; Scal: number };

  // GeomFill_CornerState.DoKill (method)
  DoKill(Scal: number): void;

  // GeomFill_CornerState.delete (method)
  delete(): void;

  // GeomFill_CornerState.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_CorrectedFrenet: declare class GeomFill_CorrectedFrenet extends GeomFill_TrihedronLaw

  // GeomFill_CorrectedFrenet.constructor (constructor)
  constructor();
  constructor(ForEvaluation: boolean);

  // GeomFill_CorrectedFrenet.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_CorrectedFrenet.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_CorrectedFrenet.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_CorrectedFrenet.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_CorrectedFrenet.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_CorrectedFrenet.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_CorrectedFrenet.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_CorrectedFrenet.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_CorrectedFrenet.EvaluateBestMode (method)
  EvaluateBestMode(): GeomFill_Trihedron;

  // GeomFill_CorrectedFrenet.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_CorrectedFrenet.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_CorrectedFrenet.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_CorrectedFrenet.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_CorrectedFrenet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_CorrectedFrenet.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_CorrectedFrenet.delete (method)
  delete(): void;

  // GeomFill_CorrectedFrenet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_CurveAndTrihedron: declare class GeomFill_CurveAndTrihedron extends GeomFill_LocationLaw

  // GeomFill_CurveAndTrihedron.constructor (constructor)
  constructor(Trihedron: GeomFill_TrihedronLaw);

  // GeomFill_CurveAndTrihedron.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_CurveAndTrihedron.GetCurve (method)
  GetCurve(): Adaptor3d_Curve;

  // GeomFill_CurveAndTrihedron.SetTrsf (method)
  SetTrsf(Transfo: gp_Mat): void;

  // GeomFill_CurveAndTrihedron.Copy (method)
  Copy(): GeomFill_LocationLaw;

  // GeomFill_CurveAndTrihedron.D0 (method)
  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;

  // GeomFill_CurveAndTrihedron.D1 (method)
  D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomFill_CurveAndTrihedron.D2 (method)
  D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomFill_CurveAndTrihedron.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_CurveAndTrihedron.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_CurveAndTrihedron.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_CurveAndTrihedron.GetInterval (method)
  GetInterval(First: number, Last: number): { First: number; Last: number };

  // GeomFill_CurveAndTrihedron.GetDomain (method)
  GetDomain(First: number, Last: number): { First: number; Last: number };

  // GeomFill_CurveAndTrihedron.GetMaximalNorm (method)
  GetMaximalNorm(): number;

  // GeomFill_CurveAndTrihedron.GetAverageLaw (method)
  GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;

  // GeomFill_CurveAndTrihedron.IsTranslation (method)
  IsTranslation(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_CurveAndTrihedron.IsRotation (method)
  IsRotation(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_CurveAndTrihedron.Rotation (method)
  Rotation(Center: gp_Pnt): void;

  // GeomFill_CurveAndTrihedron.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_CurveAndTrihedron.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_CurveAndTrihedron.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_CurveAndTrihedron.delete (method)
  delete(): void;

  // GeomFill_CurveAndTrihedron.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Curved: declare class GeomFill_Curved extends GeomFill_Filling

  // GeomFill_Curved.constructor (constructor)
  constructor();
  constructor(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt);
  constructor(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt);
  constructor(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double);
  constructor(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double);

  // GeomFill_Curved.Init (method)
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;

  // GeomFill_Curved.delete (method)
  delete(): void;

  // GeomFill_Curved.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Darboux: declare class GeomFill_Darboux extends GeomFill_TrihedronLaw

  // GeomFill_Darboux.constructor (constructor)
  constructor();

  // GeomFill_Darboux.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_Darboux.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_Darboux.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_Darboux.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_Darboux.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_Darboux.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_Darboux.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_Darboux.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_Darboux.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_Darboux.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_Darboux.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_Darboux.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_Darboux.delete (method)
  delete(): void;

  // GeomFill_Darboux.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_DegeneratedBound: declare class GeomFill_DegeneratedBound extends GeomFill_Boundary

  // GeomFill_DegeneratedBound.constructor (constructor)
  constructor(Point: gp_Pnt, First: number, Last: number, Tol3d: number, Tolang: number);

  // GeomFill_DegeneratedBound.Value (method)
  Value(U: number): gp_Pnt;

  // GeomFill_DegeneratedBound.D1 (method)
  D1(U: number, P: gp_Pnt, V: gp_Vec): void;

  // GeomFill_DegeneratedBound.Reparametrize (method)
  Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

  // GeomFill_DegeneratedBound.Bounds (method)
  Bounds(First: number, Last: number): { First: number; Last: number };

  // GeomFill_DegeneratedBound.IsDegenerated (method)
  IsDegenerated(): boolean;

  // GeomFill_DegeneratedBound.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_DegeneratedBound.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_DegeneratedBound.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_DegeneratedBound.delete (method)
  delete(): void;

  // GeomFill_DegeneratedBound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_DiscreteTrihedron: declare class GeomFill_DiscreteTrihedron extends GeomFill_TrihedronLaw

  // GeomFill_DiscreteTrihedron.constructor (constructor)
  constructor();

  // GeomFill_DiscreteTrihedron.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_DiscreteTrihedron.Init (method)
  Init(): void;

  // GeomFill_DiscreteTrihedron.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_DiscreteTrihedron.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_DiscreteTrihedron.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_DiscreteTrihedron.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_DiscreteTrihedron.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_DiscreteTrihedron.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_DiscreteTrihedron.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_DiscreteTrihedron.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_DiscreteTrihedron.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_DiscreteTrihedron.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_DiscreteTrihedron.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_DiscreteTrihedron.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_DiscreteTrihedron.delete (method)
  delete(): void;

  // GeomFill_DiscreteTrihedron.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_DraftTrihedron: declare class GeomFill_DraftTrihedron extends GeomFill_TrihedronLaw

  // GeomFill_DraftTrihedron.constructor (constructor)
  constructor(BiNormal: gp_Vec, Angle: number);

  // GeomFill_DraftTrihedron.SetAngle (method)
  SetAngle(Angle: number): void;

  // GeomFill_DraftTrihedron.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_DraftTrihedron.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_DraftTrihedron.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_DraftTrihedron.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_DraftTrihedron.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_DraftTrihedron.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_DraftTrihedron.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_DraftTrihedron.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_DraftTrihedron.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_DraftTrihedron.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_DraftTrihedron.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_DraftTrihedron.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_DraftTrihedron.delete (method)
  delete(): void;

  // GeomFill_DraftTrihedron.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
