# libcascade — GeomFill

18 top-level symbols. Signatures are verbatim typescript.

GeomFill: declare class GeomFill

  constructor

  static Surface(Curve1: Geom_Curve, Curve2: Geom_Curve): Geom_Surface;

  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, nplan: gp_Vec, pt1: gp_Pnt, pt2: gp_Pnt, Rayon: number, Center: gp_Pnt, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): void;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Rayon: number, DRayon: number, Center: gp_Pnt, DCenter: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, d2n1w: gp_Vec, d2n2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, d2nplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Dtang1: gp_Vec, Dtang2: gp_Vec, Rayon: number, DRayon: number, D2Rayon: number, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, nplan: gp_Vec, pt1: gp_Pnt, pt2: gp_Pnt, Rayon: number, Center: gp_Pnt, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): void;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Rayon: number, DRayon: number, Center: gp_Pnt, DCenter: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, d2n1w: gp_Vec, d2n2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, d2nplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Dtang1: gp_Vec, Dtang2: gp_Vec, Rayon: number, DRayon: number, D2Rayon: number, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, nplan: gp_Vec, pt1: gp_Pnt, pt2: gp_Pnt, Rayon: number, Center: gp_Pnt, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): void;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Rayon: number, DRayon: number, Center: gp_Pnt, DCenter: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  static GetCircle(TConv: Convert_ParameterisationType, ns1: gp_Vec, ns2: gp_Vec, dn1w: gp_Vec, dn2w: gp_Vec, d2n1w: gp_Vec, d2n2w: gp_Vec, nplan: gp_Vec, dnplan: gp_Vec, d2nplan: gp_Vec, pts1: gp_Pnt, pts2: gp_Pnt, tang1: gp_Vec, tang2: gp_Vec, Dtang1: gp_Vec, Dtang2: gp_Vec, Rayon: number, DRayon: number, D2Rayon: number, Center: gp_Pnt, DCenter: gp_Vec, D2Center: gp_Vec, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  static Knots(TypeConv: Convert_ParameterisationType, TKnots: NCollection_Array1_double): void;

  static Mults(TypeConv: Convert_ParameterisationType, TMults: NCollection_Array1_int): void;

  static GetMinimalWeights(TConv: Convert_ParameterisationType, AngleMin: number, AngleMax: number, Weigths: NCollection_Array1_double): void;

  static GetTolerance(TConv: Convert_ParameterisationType, AngleMin: number, Radius: number, AngularTol: number, SpatialTol: number): number;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_AppSurf: declare class GeomFill_AppSurf extends AppBlend_Approx

  constructor

  Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

  SetParType(ParType: Approx_ParametrizationType): void;

  SetContinuity(C: GeomAbs_Shape): void;

  SetCriteriumWeight(W1: number, W2: number, W3: number): void;

  ParType(): Approx_ParametrizationType;

  Continuity(): GeomAbs_Shape;

  CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

  Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, SpApprox: boolean): void;
  Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, NbMaxP: number): void;
  Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, SpApprox: boolean): void;
  Perform(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator, NbMaxP: number): void;

  PerformSmoothing(Lin: GeomFill_Line, SecGen: GeomFill_SectionGenerator): void;

  IsDone(): boolean;

  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  UDegree(): number;

  VDegree(): number;

  SurfPoles(): NCollection_Array2_gp_Pnt;

  SurfWeights(): NCollection_Array2_double;

  SurfUKnots(): NCollection_Array1_double;

  SurfVKnots(): NCollection_Array1_double;

  SurfUMults(): NCollection_Array1_int;

  SurfVMults(): NCollection_Array1_int;

  NbCurves2d(): number;

  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  Curves2dDegree(): number;

  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  Curves2dKnots(): NCollection_Array1_double;

  Curves2dMults(): NCollection_Array1_int;

  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  TolCurveOnSurf(Index: number): number;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_AppSweep: declare class GeomFill_AppSweep extends AppBlend_Approx

  constructor

  Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

  SetParType(ParType: Approx_ParametrizationType): void;

  SetContinuity(C: GeomAbs_Shape): void;

  SetCriteriumWeight(W1: number, W2: number, W3: number): void;

  ParType(): Approx_ParametrizationType;

  Continuity(): GeomAbs_Shape;

  CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

  IsDone(): boolean;

  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  UDegree(): number;

  VDegree(): number;

  SurfPoles(): NCollection_Array2_gp_Pnt;

  SurfWeights(): NCollection_Array2_double;

  SurfUKnots(): NCollection_Array1_double;

  SurfVKnots(): NCollection_Array1_double;

  SurfUMults(): NCollection_Array1_int;

  SurfVMults(): NCollection_Array1_int;

  NbCurves2d(): number;

  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  Curves2dDegree(): number;

  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  Curves2dKnots(): NCollection_Array1_double;

  Curves2dMults(): NCollection_Array1_int;

  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  TolCurveOnSurf(Index: number): number;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_ApproxStyle: typeof GeomFill_ApproxStyle[keyof typeof GeomFill_ApproxStyle]

GeomFill_BSplineCurves: declare class GeomFill_BSplineCurves

  constructor

  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, C4: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, C4: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, C4: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, C3: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BSplineCurve, C2: Geom_BSplineCurve, Type: GeomFill_FillingStyle): void;

  Surface(): Geom_BSplineSurface;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_BezierCurves: declare class GeomFill_BezierCurves

  constructor

  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, C4: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, C4: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, C4: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, C3: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;
  Init(C1: Geom_BezierCurve, C2: Geom_BezierCurve, Type: GeomFill_FillingStyle): void;

  Surface(): Geom_BezierSurface;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_BoundWithSurf: declare class GeomFill_BoundWithSurf extends GeomFill_Boundary

  constructor

  Value(U: number): gp_Pnt;

  D1(U: number, P: gp_Pnt, V: gp_Vec): void;

  HasNormals(): boolean;

  Norm(U: number): gp_Vec;

  D1Norm(U: number, N: gp_Vec, DN: gp_Vec): void;

  Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

  Bounds(First: number, Last: number): { First: number; Last: number };

  IsDegenerated(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Boundary: declare class GeomFill_Boundary extends Standard_Transient

  Value(U: number): gp_Pnt;

  D1(U: number, P: gp_Pnt, V: gp_Vec): void;

  HasNormals(): boolean;

  Norm(U: number): gp_Vec;

  D1Norm(U: number, N: gp_Vec, DN: gp_Vec): void;

  Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

  Points(PFirst: gp_Pnt, PLast: gp_Pnt): void;

  Bounds(First: number, Last: number): { First: number; Last: number };

  IsDegenerated(): boolean;

  Tol3d(): number;
  Tol3d(Tol: number): void;
  Tol3d(): number;
  Tol3d(Tol: number): void;

  Tolang(): number;
  Tolang(Tol: number): void;
  Tolang(): number;
  Tolang(Tol: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_CircularBlendFunc: declare class GeomFill_CircularBlendFunc extends Approx_SweepFunction

  constructor

  D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;

  D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  D2(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  Nb2dCurves(): number;

  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  IsRational(): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  SetInterval(First: number, Last: number): void;

  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  SetTolerance(Tol3d: number, Tol2d: number): void;

  BarycentreOfSurf(): gp_Pnt;

  MaximalSection(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_ConstantBiNormal: declare class GeomFill_ConstantBiNormal extends GeomFill_TrihedronLaw

  constructor

  Copy(): GeomFill_TrihedronLaw;

  SetCurve(C: Adaptor3d_Curve): boolean;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  IsOnlyBy3dCurve(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_ConstrainedFilling: declare class GeomFill_ConstrainedFilling

  constructor

  Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, NoCheck: boolean): void;
  Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, B4: GeomFill_Boundary, NoCheck: boolean): void;
  Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, NoCheck: boolean): void;
  Init(B1: GeomFill_Boundary, B2: GeomFill_Boundary, B3: GeomFill_Boundary, B4: GeomFill_Boundary, NoCheck: boolean): void;

  SetDomain(l: number, B: GeomFill_BoundWithSurf): void;

  ReBuild(): void;

  Boundary(I: number): GeomFill_Boundary;

  Surface(): Geom_BSplineSurface;

  Eval(W: number, Ord: number, Result?: number): { returnValue: number; Result: number };

  CheckCoonsAlgPatch(I: number): void;

  CheckTgteField(I: number): void;

  CheckApprox(I: number): void;

  CheckResult(I: number): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Coons: declare class GeomFill_Coons extends GeomFill_Filling

  constructor

  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_CoonsAlgPatch: declare class GeomFill_CoonsAlgPatch extends Standard_Transient

  constructor

  Func(): { f1: Law_Function; f2: Law_Function; [Symbol.dispose](): void };
  Func(I: number): Law_Function;
  Func(): { f1: Law_Function; f2: Law_Function; [Symbol.dispose](): void };
  Func(I: number): Law_Function;

  SetFunc(f1: Law_Function, f2: Law_Function): void;

  Value(U: number, V: number): gp_Pnt;

  D1U(U: number, V: number): gp_Vec;

  D1V(U: number, V: number): gp_Vec;

  DUV(U: number, V: number): gp_Vec;

  Corner(I: number): gp_Pnt;

  Bound(I: number): GeomFill_Boundary;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_CornerState: declare class GeomFill_CornerState

  constructor

  Gap(): number;
  Gap(G: number): void;
  Gap(): number;
  Gap(G: number): void;

  TgtAng(): number;
  TgtAng(Ang: number): void;
  TgtAng(): number;
  TgtAng(Ang: number): void;

  HasConstraint(): boolean;

  Constraint(): void;

  NorAng(): number;
  NorAng(Ang: number): void;
  NorAng(): number;
  NorAng(Ang: number): void;

  IsToKill(Scal?: number): { returnValue: boolean; Scal: number };

  DoKill(Scal: number): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_CorrectedFrenet: declare class GeomFill_CorrectedFrenet extends GeomFill_TrihedronLaw

  constructor

  Copy(): GeomFill_TrihedronLaw;

  SetCurve(C: Adaptor3d_Curve): boolean;

  SetInterval(First: number, Last: number): void;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  EvaluateBestMode(): GeomFill_Trihedron;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  IsOnlyBy3dCurve(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_CurveAndTrihedron: declare class GeomFill_CurveAndTrihedron extends GeomFill_LocationLaw

  constructor

  SetCurve(C: Adaptor3d_Curve): boolean;

  GetCurve(): Adaptor3d_Curve;

  SetTrsf(Transfo: gp_Mat): void;

  Copy(): GeomFill_LocationLaw;

  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
  D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;

  D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;

  D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  SetInterval(First: number, Last: number): void;

  GetInterval(First: number, Last: number): { First: number; Last: number };

  GetDomain(First: number, Last: number): { First: number; Last: number };

  GetMaximalNorm(): number;

  GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;

  IsTranslation(Error: number): { returnValue: boolean; Error: number };

  IsRotation(Error: number): { returnValue: boolean; Error: number };

  Rotation(Center: gp_Pnt): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Curved: declare class GeomFill_Curved extends GeomFill_Filling

  constructor

  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomFill_Darboux: declare class GeomFill_Darboux extends GeomFill_TrihedronLaw

  constructor

  Copy(): GeomFill_TrihedronLaw;

  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  IsConstant(): boolean;

  IsOnlyBy3dCurve(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
