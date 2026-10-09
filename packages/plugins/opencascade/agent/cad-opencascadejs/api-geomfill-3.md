# libcascade — GeomFill (3)

17 top-level symbols. Signatures are verbatim typescript.

GeomFill_SectionGenerator: declare class GeomFill_SectionGenerator extends GeomFill_Profiler

  // GeomFill_SectionGenerator.constructor (constructor)
  constructor();

  // GeomFill_SectionGenerator.SetParam (method)
  SetParam(Params: NCollection_HArray1_double): void;

  // GeomFill_SectionGenerator.GetShape (method)
  GetShape(NbPoles?: number, NbKnots?: number, Degree?: number, NbPoles2d?: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // GeomFill_SectionGenerator.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // GeomFill_SectionGenerator.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // GeomFill_SectionGenerator.Section (method)
  Section(P: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;

  // GeomFill_SectionGenerator.Parameter (method)
  Parameter(P: number): number;

  // GeomFill_SectionGenerator.delete (method)
  delete(): void;

  // GeomFill_SectionGenerator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_SectionLaw: declare class GeomFill_SectionLaw extends Standard_Transient

  // GeomFill_SectionLaw.D0 (method)
  D0(Param: number, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): boolean;

  // GeomFill_SectionLaw.D1 (method)
  D1(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  // GeomFill_SectionLaw.D2 (method)
  D2(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // GeomFill_SectionLaw.BSplineSurface (method)
  BSplineSurface(): Geom_BSplineSurface;

  // GeomFill_SectionLaw.SectionShape (method)
  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  // GeomFill_SectionLaw.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // GeomFill_SectionLaw.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // GeomFill_SectionLaw.IsRational (method)
  IsRational(): boolean;

  // GeomFill_SectionLaw.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomFill_SectionLaw.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomFill_SectionLaw.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_SectionLaw.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_SectionLaw.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_SectionLaw.GetInterval (method)
  GetInterval(First: number, Last: number): { First: number; Last: number };

  // GeomFill_SectionLaw.GetDomain (method)
  GetDomain(First: number, Last: number): { First: number; Last: number };

  // GeomFill_SectionLaw.GetTolerance (method)
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  // GeomFill_SectionLaw.SetTolerance (method)
  SetTolerance(Tol3d: number, Tol2d: number): void;

  // GeomFill_SectionLaw.BarycentreOfSurf (method)
  BarycentreOfSurf(): gp_Pnt;

  // GeomFill_SectionLaw.MaximalSection (method)
  MaximalSection(): number;

  // GeomFill_SectionLaw.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // GeomFill_SectionLaw.IsConstant (method)
  IsConstant(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_SectionLaw.ConstantSection (method)
  ConstantSection(): Geom_Curve;

  // GeomFill_SectionLaw.IsConicalLaw (method)
  IsConicalLaw(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_SectionLaw.CirclSection (method)
  CirclSection(Param: number): Geom_Curve;

  // GeomFill_SectionLaw.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_SectionLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_SectionLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_SectionLaw.delete (method)
  delete(): void;

  // GeomFill_SectionLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_SectionPlacement: declare class GeomFill_SectionPlacement

  // GeomFill_SectionPlacement.constructor (constructor)
  constructor(L: GeomFill_LocationLaw, Section: Geom_Geometry);

  // GeomFill_SectionPlacement.SetLocation (method)
  SetLocation(L: GeomFill_LocationLaw): void;

  // GeomFill_SectionPlacement.Perform (method)
  Perform(Tol: number): void;
  Perform(Path: Adaptor3d_Curve, Tol: number): void;
  Perform(ParamOnPath: number, Tol: number): void;

  // GeomFill_SectionPlacement.IsDone (method)
  IsDone(): boolean;

  // GeomFill_SectionPlacement.ParameterOnPath (method)
  ParameterOnPath(): number;

  // GeomFill_SectionPlacement.ParameterOnSection (method)
  ParameterOnSection(): number;

  // GeomFill_SectionPlacement.Distance (method)
  Distance(): number;

  // GeomFill_SectionPlacement.Angle (method)
  Angle(): number;

  // GeomFill_SectionPlacement.Transformation (method)
  Transformation(WithTranslation: boolean, WithCorrection?: boolean): gp_Trsf;

  // GeomFill_SectionPlacement.Section (method)
  Section(WithTranslation: boolean): Geom_Curve;

  // GeomFill_SectionPlacement.ModifiedSection (method)
  ModifiedSection(WithTranslation: boolean): Geom_Curve;

  // GeomFill_SectionPlacement.delete (method)
  delete(): void;

  // GeomFill_SectionPlacement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_SimpleBound: declare class GeomFill_SimpleBound extends GeomFill_Boundary

  // GeomFill_SimpleBound.constructor (constructor)
  constructor(Curve: Adaptor3d_Curve, Tol3d: number, Tolang: number);

  // GeomFill_SimpleBound.Value (method)
  Value(U: number): gp_Pnt;

  // GeomFill_SimpleBound.D1 (method)
  D1(U: number, P: gp_Pnt, V: gp_Vec): void;

  // GeomFill_SimpleBound.Reparametrize (method)
  Reparametrize(First: number, Last: number, HasDF: boolean, HasDL: boolean, DF: number, DL: number, Rev: boolean): void;

  // GeomFill_SimpleBound.Bounds (method)
  Bounds(First: number, Last: number): { First: number; Last: number };

  // GeomFill_SimpleBound.IsDegenerated (method)
  IsDegenerated(): boolean;

  // GeomFill_SimpleBound.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_SimpleBound.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_SimpleBound.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_SimpleBound.delete (method)
  delete(): void;

  // GeomFill_SimpleBound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_SnglrFunc: declare class GeomFill_SnglrFunc extends Adaptor3d_Curve

  // GeomFill_SnglrFunc.constructor (constructor)
  constructor(HC: Adaptor3d_Curve);

  // GeomFill_SnglrFunc.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // GeomFill_SnglrFunc.SetRatio (method)
  SetRatio(Ratio: number): void;

  // GeomFill_SnglrFunc.FirstParameter (method)
  FirstParameter(): number;

  // GeomFill_SnglrFunc.LastParameter (method)
  LastParameter(): number;

  // GeomFill_SnglrFunc.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_SnglrFunc.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_SnglrFunc.IsPeriodic (method)
  IsPeriodic(): boolean;

  // GeomFill_SnglrFunc.Period (method)
  Period(): number;

  // GeomFill_SnglrFunc.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // GeomFill_SnglrFunc.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // GeomFill_SnglrFunc.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // GeomFill_SnglrFunc.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // GeomFill_SnglrFunc.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // GeomFill_SnglrFunc.Resolution (method)
  Resolution(R3d: number): number;

  // GeomFill_SnglrFunc.GetType (method)
  GetType(): GeomAbs_CurveType;

  // GeomFill_SnglrFunc.delete (method)
  delete(): void;

  // GeomFill_SnglrFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Stretch: declare class GeomFill_Stretch extends GeomFill_Filling

  // GeomFill_Stretch.constructor (constructor)
  constructor();
  constructor(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt);
  constructor(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double);

  // GeomFill_Stretch.Init (method)
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt): void;
  Init(P1: NCollection_Array1_gp_Pnt, P2: NCollection_Array1_gp_Pnt, P3: NCollection_Array1_gp_Pnt, P4: NCollection_Array1_gp_Pnt, W1: NCollection_Array1_double, W2: NCollection_Array1_double, W3: NCollection_Array1_double, W4: NCollection_Array1_double): void;

  // GeomFill_Stretch.delete (method)
  delete(): void;

  // GeomFill_Stretch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Sweep: declare class GeomFill_Sweep

  // GeomFill_Sweep.constructor (constructor)
  constructor(Location: GeomFill_LocationLaw, WithKpart?: boolean);

  // GeomFill_Sweep.SetDomain (method)
  SetDomain(First: number, Last: number, SectionFirst: number, SectionLast: number): void;

  // GeomFill_Sweep.SetTolerance (method)
  SetTolerance(Tol3d: number, BoundTol?: number, Tol2d?: number, TolAngular?: number): void;

  // GeomFill_Sweep.SetForceApproxC1 (method)
  SetForceApproxC1(ForceApproxC1: boolean): void;

  // GeomFill_Sweep.ExchangeUV (method)
  ExchangeUV(): boolean;

  // GeomFill_Sweep.UReversed (method)
  UReversed(): boolean;

  // GeomFill_Sweep.VReversed (method)
  VReversed(): boolean;

  // GeomFill_Sweep.Build (method)
  Build(Section: GeomFill_SectionLaw, Methode?: GeomFill_ApproxStyle, Continuity?: GeomAbs_Shape, Degmax?: number, Segmax?: number): void;

  // GeomFill_Sweep.IsDone (method)
  IsDone(): boolean;

  // GeomFill_Sweep.ErrorOnSurface (method)
  ErrorOnSurface(): number;

  // GeomFill_Sweep.ErrorOnRestriction (method)
  ErrorOnRestriction(IsFirst: boolean, UError?: number, VError?: number): { UError: number; VError: number };

  // GeomFill_Sweep.ErrorOnTrace (method)
  ErrorOnTrace(IndexOfTrace: number, UError?: number, VError?: number): { UError: number; VError: number };

  // GeomFill_Sweep.Surface (method)
  Surface(): Geom_Surface;

  // GeomFill_Sweep.Restriction (method)
  Restriction(IsFirst: boolean): Geom2d_Curve;

  // GeomFill_Sweep.NumberOfTrace (method)
  NumberOfTrace(): number;

  // GeomFill_Sweep.Trace (method)
  Trace(IndexOfTrace: number): Geom2d_Curve;

  // GeomFill_Sweep.delete (method)
  delete(): void;

  // GeomFill_Sweep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_SweepFunction: declare class GeomFill_SweepFunction extends Approx_SweepFunction

  // GeomFill_SweepFunction.constructor (constructor)
  constructor(Section: GeomFill_SectionLaw, Location: GeomFill_LocationLaw, FirstParameter: number, FirstParameterOnS: number, RatioParameterOnS: number);

  // GeomFill_SweepFunction.D0 (method)
  D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;

  // GeomFill_SweepFunction.D1 (method)
  D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  // GeomFill_SweepFunction.D2 (method)
  D2(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // GeomFill_SweepFunction.Nb2dCurves (method)
  Nb2dCurves(): number;

  // GeomFill_SweepFunction.SectionShape (method)
  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  // GeomFill_SweepFunction.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // GeomFill_SweepFunction.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // GeomFill_SweepFunction.IsRational (method)
  IsRational(): boolean;

  // GeomFill_SweepFunction.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_SweepFunction.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_SweepFunction.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_SweepFunction.Resolution (method)
  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // GeomFill_SweepFunction.GetTolerance (method)
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  // GeomFill_SweepFunction.SetTolerance (method)
  SetTolerance(Tol3d: number, Tol2d: number): void;

  // GeomFill_SweepFunction.BarycentreOfSurf (method)
  BarycentreOfSurf(): gp_Pnt;

  // GeomFill_SweepFunction.MaximalSection (method)
  MaximalSection(): number;

  // GeomFill_SweepFunction.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // GeomFill_SweepFunction.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_SweepFunction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_SweepFunction.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_SweepFunction.delete (method)
  delete(): void;

  // GeomFill_SweepFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Tensor: declare class GeomFill_Tensor

  // GeomFill_Tensor.constructor (constructor)
  constructor(NbRow: number, NbCol: number, NbMat: number);

  // GeomFill_Tensor.Init (method)
  Init(InitialValue: number): void;

  // GeomFill_Tensor.Value (method)
  Value(Row: number, Col: number, Mat: number): number;

  // GeomFill_Tensor.ChangeValue (method)
  ChangeValue(Row: number, Col: number, Mat: number): number;

  // GeomFill_Tensor.Multiply (method)
  Multiply(Right: math_VectorBase_double, Product: math_Matrix): void;

  // GeomFill_Tensor.delete (method)
  delete(): void;

  // GeomFill_Tensor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_TgtField: declare class GeomFill_TgtField extends Standard_Transient

  // GeomFill_TgtField.IsScalable (method)
  IsScalable(): boolean;

  // GeomFill_TgtField.Scale (method)
  Scale(Func: Law_BSpline): void;

  // GeomFill_TgtField.Value (method)
  Value(W: number): gp_Vec;

  // GeomFill_TgtField.D1 (method)
  D1(W: number): gp_Vec;
  D1(W: number, V: gp_Vec, DV: gp_Vec): void;

  // GeomFill_TgtField.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_TgtField.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_TgtField.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_TgtField.delete (method)
  delete(): void;

  // GeomFill_TgtField.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_TgtOnCoons: declare class GeomFill_TgtOnCoons extends GeomFill_TgtField

  // GeomFill_TgtOnCoons.constructor (constructor)
  constructor(K: GeomFill_CoonsAlgPatch, I: number);

  // GeomFill_TgtOnCoons.Value (method)
  Value(W: number): gp_Vec;

  // GeomFill_TgtOnCoons.D1 (method)
  D1(W: number): gp_Vec;
  D1(W: number, V: gp_Vec, DV: gp_Vec): void;

  // GeomFill_TgtOnCoons.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_TgtOnCoons.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_TgtOnCoons.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_TgtOnCoons.delete (method)
  delete(): void;

  // GeomFill_TgtOnCoons.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Trihedron: typeof GeomFill_Trihedron[keyof typeof GeomFill_Trihedron]

  readonly GeomFill_IsCorrectedFrenet: 'GeomFill_IsCorrectedFrenet'

  readonly GeomFill_IsFixed: 'GeomFill_IsFixed'

  readonly GeomFill_IsFrenet: 'GeomFill_IsFrenet'

  readonly GeomFill_IsConstantNormal: 'GeomFill_IsConstantNormal'

  readonly GeomFill_IsDarboux: 'GeomFill_IsDarboux'

  readonly GeomFill_IsGuideAC: 'GeomFill_IsGuideAC'

  readonly GeomFill_IsGuidePlan: 'GeomFill_IsGuidePlan'

  readonly GeomFill_IsGuideACWithContact: 'GeomFill_IsGuideACWithContact'

  readonly GeomFill_IsGuidePlanWithContact: 'GeomFill_IsGuidePlanWithContact'

  readonly GeomFill_IsDiscreteTrihedron: 'GeomFill_IsDiscreteTrihedron'

GeomFill_TrihedronLaw: declare class GeomFill_TrihedronLaw extends Standard_Transient

  // GeomFill_TrihedronLaw.SetCurve (method)
  SetCurve(C: Adaptor3d_Curve): boolean;

  // GeomFill_TrihedronLaw.Copy (method)
  Copy(): GeomFill_TrihedronLaw;

  // GeomFill_TrihedronLaw.ErrorStatus (method)
  ErrorStatus(): GeomFill_PipeError;

  // GeomFill_TrihedronLaw.D0 (method)
  D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;

  // GeomFill_TrihedronLaw.D1 (method)
  D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;

  // GeomFill_TrihedronLaw.D2 (method)
  D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;

  // GeomFill_TrihedronLaw.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_TrihedronLaw.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_TrihedronLaw.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_TrihedronLaw.GetInterval (method)
  GetInterval(First?: number, Last?: number): { First: number; Last: number };

  // GeomFill_TrihedronLaw.GetAverageLaw (method)
  GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;

  // GeomFill_TrihedronLaw.IsConstant (method)
  IsConstant(): boolean;

  // GeomFill_TrihedronLaw.IsOnlyBy3dCurve (method)
  IsOnlyBy3dCurve(): boolean;

  // GeomFill_TrihedronLaw.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_TrihedronLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_TrihedronLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_TrihedronLaw.delete (method)
  delete(): void;

  // GeomFill_TrihedronLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_TrihedronWithGuide: declare class GeomFill_TrihedronWithGuide extends GeomFill_TrihedronLaw

  // GeomFill_TrihedronWithGuide.Guide (method)
  Guide(): Adaptor3d_Curve;

  // GeomFill_TrihedronWithGuide.Origine (method)
  Origine(Param1: number, Param2: number): void;

  // GeomFill_TrihedronWithGuide.CurrentPointOnGuide (method)
  CurrentPointOnGuide(): gp_Pnt;

  // GeomFill_TrihedronWithGuide.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_TrihedronWithGuide.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_TrihedronWithGuide.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_TrihedronWithGuide.delete (method)
  delete(): void;

  // GeomFill_TrihedronWithGuide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_UniformSection: declare class GeomFill_UniformSection extends GeomFill_SectionLaw

  // GeomFill_UniformSection.constructor (constructor)
  constructor(C: Geom_Curve, FirstParameter?: number, LastParameter?: number);

  // GeomFill_UniformSection.D0 (method)
  D0(Param: number, Poles: NCollection_Array1_gp_Pnt, Weigths: NCollection_Array1_double): boolean;

  // GeomFill_UniformSection.D1 (method)
  D1(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  // GeomFill_UniformSection.D2 (method)
  D2(Param: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // GeomFill_UniformSection.BSplineSurface (method)
  BSplineSurface(): Geom_BSplineSurface;

  // GeomFill_UniformSection.SectionShape (method)
  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  // GeomFill_UniformSection.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // GeomFill_UniformSection.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // GeomFill_UniformSection.IsRational (method)
  IsRational(): boolean;

  // GeomFill_UniformSection.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomFill_UniformSection.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomFill_UniformSection.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // GeomFill_UniformSection.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // GeomFill_UniformSection.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // GeomFill_UniformSection.GetInterval (method)
  GetInterval(First: number, Last: number): { First: number; Last: number };

  // GeomFill_UniformSection.GetDomain (method)
  GetDomain(First: number, Last: number): { First: number; Last: number };

  // GeomFill_UniformSection.GetTolerance (method)
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  // GeomFill_UniformSection.BarycentreOfSurf (method)
  BarycentreOfSurf(): gp_Pnt;

  // GeomFill_UniformSection.MaximalSection (method)
  MaximalSection(): number;

  // GeomFill_UniformSection.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // GeomFill_UniformSection.IsConstant (method)
  IsConstant(Error: number): { returnValue: boolean; Error: number };

  // GeomFill_UniformSection.ConstantSection (method)
  ConstantSection(): Geom_Curve;

  // GeomFill_UniformSection.get_type_name (method)
  static get_type_name(): string;

  // GeomFill_UniformSection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomFill_UniformSection.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomFill_UniformSection.delete (method)
  delete(): void;

  // GeomFill_UniformSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomFill_Gordon_BuildReport: interface GeomFill_Gordon_BuildReport

  Status: GeomFill_Gordon_ResultStatus

  FailedStage: GeomFill_Gordon_BuildStage

  IsApproximate: boolean

  MaxContactGap: number

  MaxReparametrizationDeviation: number

  MaxProfileDeviation: number

  MaxGuideDeviation: number

  MaxApproximationDeviation: number

GeomFill_SequenceOfTrsf: NCollection_Sequence_gp_Trsf
