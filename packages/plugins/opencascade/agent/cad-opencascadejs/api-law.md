# libcascade — Law

12 top-level symbols. Signatures are verbatim typescript.

Law: declare class Law

  // Law.constructor (constructor)
  constructor();

  // Law.MixBnd (method)
  static MixBnd(Lin: Law_Linear): Law_BSpFunc;
  static MixBnd(Degree: number, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Lin: Law_Linear): NCollection_HArray1_double;

  // Law.MixTgt (method)
  static MixTgt(Degree: number, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NulOnTheRight: boolean, Index: number): NCollection_HArray1_double;

  // Law.Reparametrize (method)
  static Reparametrize(Curve: Adaptor3d_Curve, First: number, Last: number, HasDF: boolean, HasDL: boolean, DFirst: number, DLast: number, Rev: boolean, NbPoints: number): Law_BSpline;

  // Law.Scale (method)
  static Scale(First: number, Last: number, HasF: boolean, HasL: boolean, VFirst: number, VLast: number): Law_BSpline;

  // Law.ScaleCub (method)
  static ScaleCub(First: number, Last: number, HasF: boolean, HasL: boolean, VFirst: number, VLast: number): Law_BSpline;

  // Law.delete (method)
  delete(): void;

  // Law.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_BSpFunc: declare class Law_BSpFunc extends Law_Function

  // Law_BSpFunc.constructor (constructor)
  constructor();
  constructor(C: Law_BSpline, First: number, Last: number);

  // Law_BSpFunc.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Law_BSpFunc.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Law_BSpFunc.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Law_BSpFunc.Value (method)
  Value(X: number): number;

  // Law_BSpFunc.D1 (method)
  D1(X: number, F: number, D: number): { F: number; D: number };

  // Law_BSpFunc.D2 (method)
  D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

  // Law_BSpFunc.Trim (method)
  Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

  // Law_BSpFunc.Bounds (method)
  Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

  // Law_BSpFunc.Curve (method)
  Curve(): Law_BSpline;

  // Law_BSpFunc.SetCurve (method)
  SetCurve(C: Law_BSpline): void;

  // Law_BSpFunc.get_type_name (method)
  static get_type_name(): string;

  // Law_BSpFunc.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Law_BSpFunc.DynamicType (method)
  DynamicType(): Standard_Type;

  // Law_BSpFunc.delete (method)
  delete(): void;

  // Law_BSpFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_BSpline: declare class Law_BSpline extends Standard_Transient

  // Law_BSpline.constructor (constructor)
  constructor(Poles: NCollection_Array1_double, Knots: NCollection_Array1_double, Multiplicities: NCollection_Array1_int, Degree: number, Periodic?: boolean);
  constructor(Poles: NCollection_Array1_double, Weights: NCollection_Array1_double, Knots: NCollection_Array1_double, Multiplicities: NCollection_Array1_int, Degree: number, Periodic?: boolean);

  // Law_BSpline.IncreaseDegree (method)
  IncreaseDegree(Degree: number): void;

  // Law_BSpline.IncreaseMultiplicity (method)
  IncreaseMultiplicity(Index: number, M: number): void;
  IncreaseMultiplicity(I1: number, I2: number, M: number): void;

  // Law_BSpline.IncrementMultiplicity (method)
  IncrementMultiplicity(I1: number, I2: number, M: number): void;

  // Law_BSpline.InsertKnot (method)
  InsertKnot(U: number, M?: number, ParametricTolerance?: number, Add?: boolean): void;

  // Law_BSpline.InsertKnots (method)
  InsertKnots(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, ParametricTolerance?: number, Add?: boolean): void;

  // Law_BSpline.RemoveKnot (method)
  RemoveKnot(Index: number, M: number, Tolerance: number): boolean;

  // Law_BSpline.Reverse (method)
  Reverse(): void;

  // Law_BSpline.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Law_BSpline.Segment (method)
  Segment(U1: number, U2: number): void;

  // Law_BSpline.SetKnot (method)
  SetKnot(Index: number, K: number): void;
  SetKnot(Index: number, K: number, M: number): void;

  // Law_BSpline.SetKnots (method)
  SetKnots(K: NCollection_Array1_double): void;

  // Law_BSpline.PeriodicNormalization (method)
  PeriodicNormalization(U?: number): { U: number };

  // Law_BSpline.SetPeriodic (method)
  SetPeriodic(): void;

  // Law_BSpline.SetOrigin (method)
  SetOrigin(Index: number): void;

  // Law_BSpline.SetNotPeriodic (method)
  SetNotPeriodic(): void;

  // Law_BSpline.SetPole (method)
  SetPole(Index: number, P: number): void;
  SetPole(Index: number, P: number, Weight: number): void;

  // Law_BSpline.SetWeight (method)
  SetWeight(Index: number, Weight: number): void;

  // Law_BSpline.IsCN (method)
  IsCN(N: number): boolean;

  // Law_BSpline.IsClosed (method)
  IsClosed(): boolean;

  // Law_BSpline.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Law_BSpline.IsRational (method)
  IsRational(): boolean;

  // Law_BSpline.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Law_BSpline.Degree (method)
  Degree(): number;

  // Law_BSpline.Value (method)
  Value(U: number): number;

  // Law_BSpline.D0 (method)
  D0(U: number, P?: number): { P: number };

  // Law_BSpline.D1 (method)
  D1(U: number, P?: number, V1?: number): { P: number; V1: number };

  // Law_BSpline.D2 (method)
  D2(U: number, P?: number, V1?: number, V2?: number): { P: number; V1: number; V2: number };

  // Law_BSpline.D3 (method)
  D3(U: number, P?: number, V1?: number, V2?: number, V3?: number): { P: number; V1: number; V2: number; V3: number };

  // Law_BSpline.DN (method)
  DN(U: number, N: number): number;

  // Law_BSpline.LocalValue (method)
  LocalValue(U: number, FromK1: number, ToK2: number): number;

  // Law_BSpline.LocalD0 (method)
  LocalD0(U: number, FromK1: number, ToK2: number, P?: number): { P: number };

  // Law_BSpline.LocalD1 (method)
  LocalD1(U: number, FromK1: number, ToK2: number, P?: number, V1?: number): { P: number; V1: number };

  // Law_BSpline.LocalD2 (method)
  LocalD2(U: number, FromK1: number, ToK2: number, P?: number, V1?: number, V2?: number): { P: number; V1: number; V2: number };

  // Law_BSpline.LocalD3 (method)
  LocalD3(U: number, FromK1: number, ToK2: number, P?: number, V1?: number, V2?: number, V3?: number): { P: number; V1: number; V2: number; V3: number };

  // Law_BSpline.LocalDN (method)
  LocalDN(U: number, FromK1: number, ToK2: number, N: number): number;

  // Law_BSpline.EndPoint (method)
  EndPoint(): number;

  // Law_BSpline.FirstUKnotIndex (method)
  FirstUKnotIndex(): number;

  // Law_BSpline.FirstParameter (method)
  FirstParameter(): number;

  // Law_BSpline.Knot (method)
  Knot(Index: number): number;

  // Law_BSpline.Knots (method)
  Knots(K: NCollection_Array1_double): void;

  // Law_BSpline.KnotSequence (method)
  KnotSequence(K: NCollection_Array1_double): void;

  // Law_BSpline.KnotDistribution (method)
  KnotDistribution(): GeomAbs_BSplKnotDistribution;

  // Law_BSpline.LastUKnotIndex (method)
  LastUKnotIndex(): number;

  // Law_BSpline.LastParameter (method)
  LastParameter(): number;

  // Law_BSpline.LocateU (method)
  LocateU(U: number, ParametricTolerance: number, I1: number, I2: number, WithKnotRepetition: boolean): { I1: number; I2: number };

  // Law_BSpline.Multiplicity (method)
  Multiplicity(Index: number): number;

  // Law_BSpline.Multiplicities (method)
  Multiplicities(M: NCollection_Array1_int): void;

  // Law_BSpline.NbKnots (method)
  NbKnots(): number;

  // Law_BSpline.NbPoles (method)
  NbPoles(): number;

  // Law_BSpline.Pole (method)
  Pole(Index: number): number;

  // Law_BSpline.Poles (method)
  Poles(P: NCollection_Array1_double): void;

  // Law_BSpline.StartPoint (method)
  StartPoint(): number;

  // Law_BSpline.Weight (method)
  Weight(Index: number): number;

  // Law_BSpline.Weights (method)
  Weights(W: NCollection_Array1_double): void;

  // Law_BSpline.MaxDegree (method)
  static MaxDegree(): number;

  // Law_BSpline.MovePointAndTangent (method)
  MovePointAndTangent(U: number, NewValue: number, Derivative: number, Tolerance: number, StartingCondition: number, EndingCondition: number, ErrorStatus?: number): { ErrorStatus: number };

  // Law_BSpline.Resolution (method)
  Resolution(Tolerance3D: number, UTolerance?: number): { UTolerance: number };

  // Law_BSpline.Copy (method)
  Copy(): Law_BSpline;

  // Law_BSpline.get_type_name (method)
  static get_type_name(): string;

  // Law_BSpline.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Law_BSpline.DynamicType (method)
  DynamicType(): Standard_Type;

  // Law_BSpline.delete (method)
  delete(): void;

  // Law_BSpline.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_BSplineKnotSplitting: declare class Law_BSplineKnotSplitting

  // Law_BSplineKnotSplitting.constructor (constructor)
  constructor(BasisLaw: Law_BSpline, ContinuityRange: number);

  // Law_BSplineKnotSplitting.NbSplits (method)
  NbSplits(): number;

  // Law_BSplineKnotSplitting.Splitting (method)
  Splitting(SplitValues: NCollection_Array1_int): void;

  // Law_BSplineKnotSplitting.SplitValue (method)
  SplitValue(Index: number): number;

  // Law_BSplineKnotSplitting.delete (method)
  delete(): void;

  // Law_BSplineKnotSplitting.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_Composite: declare class Law_Composite extends Law_Function

  // Law_Composite.constructor (constructor)
  constructor();
  constructor(First: number, Last: number, Tol: number);

  // Law_Composite.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Law_Composite.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Law_Composite.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Law_Composite.Value (method)
  Value(X: number): number;

  // Law_Composite.D1 (method)
  D1(X: number, F: number, D: number): { F: number; D: number };

  // Law_Composite.D2 (method)
  D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

  // Law_Composite.Trim (method)
  Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

  // Law_Composite.Bounds (method)
  Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

  // Law_Composite.ChangeElementaryLaw (method)
  ChangeElementaryLaw(W: number): Law_Function;

  // Law_Composite.ChangeLaws (method)
  ChangeLaws(): NCollection_List_handle_Law_Function;

  // Law_Composite.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Law_Composite.SetPeriodic (method)
  SetPeriodic(): void;

  // Law_Composite.get_type_name (method)
  static get_type_name(): string;

  // Law_Composite.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Law_Composite.DynamicType (method)
  DynamicType(): Standard_Type;

  // Law_Composite.delete (method)
  delete(): void;

  // Law_Composite.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_Constant: declare class Law_Constant extends Law_Function

  // Law_Constant.constructor (constructor)
  constructor();

  // Law_Constant.Set (method)
  Set(Radius: number, PFirst: number, PLast: number): void;

  // Law_Constant.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Law_Constant.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Law_Constant.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Law_Constant.Value (method)
  Value(X: number): number;

  // Law_Constant.D1 (method)
  D1(X: number, F: number, D: number): { F: number; D: number };

  // Law_Constant.D2 (method)
  D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

  // Law_Constant.Trim (method)
  Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

  // Law_Constant.Bounds (method)
  Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

  // Law_Constant.get_type_name (method)
  static get_type_name(): string;

  // Law_Constant.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Law_Constant.DynamicType (method)
  DynamicType(): Standard_Type;

  // Law_Constant.delete (method)
  delete(): void;

  // Law_Constant.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_Function: declare class Law_Function extends Standard_Transient

  // Law_Function.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Law_Function.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Law_Function.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Law_Function.Value (method)
  Value(X: number): number;

  // Law_Function.D1 (method)
  D1(X: number, F: number, D: number): { F: number; D: number };

  // Law_Function.D2 (method)
  D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

  // Law_Function.Trim (method)
  Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

  // Law_Function.Bounds (method)
  Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

  // Law_Function.get_type_name (method)
  static get_type_name(): string;

  // Law_Function.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Law_Function.DynamicType (method)
  DynamicType(): Standard_Type;

  // Law_Function.delete (method)
  delete(): void;

  // Law_Function.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_Interpol: declare class Law_Interpol extends Law_BSpFunc

  // Law_Interpol.constructor (constructor)
  constructor();

  // Law_Interpol.Set (method)
  Set(ParAndRad: NCollection_Array1_gp_Pnt2d, Periodic: boolean): void;
  Set(ParAndRad: NCollection_Array1_gp_Pnt2d, Dd: number, Df: number, Periodic: boolean): void;

  // Law_Interpol.SetInRelative (method)
  SetInRelative(ParAndRad: NCollection_Array1_gp_Pnt2d, Ud: number, Uf: number, Periodic: boolean): void;
  SetInRelative(ParAndRad: NCollection_Array1_gp_Pnt2d, Ud: number, Uf: number, Dd: number, Df: number, Periodic: boolean): void;

  // Law_Interpol.get_type_name (method)
  static get_type_name(): string;

  // Law_Interpol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Law_Interpol.DynamicType (method)
  DynamicType(): Standard_Type;

  // Law_Interpol.delete (method)
  delete(): void;

  // Law_Interpol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_Interpolate: declare class Law_Interpolate

  // Law_Interpolate.constructor (constructor)
  constructor(Points: NCollection_HArray1_double, PeriodicFlag: boolean, Tolerance: number);
  constructor(Points: NCollection_HArray1_double, Parameters: NCollection_HArray1_double, PeriodicFlag: boolean, Tolerance: number);

  // Law_Interpolate.Load (method)
  Load(InitialTangent: number, FinalTangent: number): void;
  Load(Tangents: NCollection_Array1_double, TangentFlags: NCollection_HArray1_bool): void;

  // Law_Interpolate.Perform (method)
  Perform(): void;

  // Law_Interpolate.Curve (method)
  Curve(): Law_BSpline;

  // Law_Interpolate.IsDone (method)
  IsDone(): boolean;

  // Law_Interpolate.delete (method)
  delete(): void;

  // Law_Interpolate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_Linear: declare class Law_Linear extends Law_Function

  // Law_Linear.constructor (constructor)
  constructor();

  // Law_Linear.Set (method)
  Set(Pdeb: number, Valdeb: number, Pfin: number, Valfin: number): void;

  // Law_Linear.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Law_Linear.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Law_Linear.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Law_Linear.Value (method)
  Value(X: number): number;

  // Law_Linear.D1 (method)
  D1(X: number, F: number, D: number): { F: number; D: number };

  // Law_Linear.D2 (method)
  D2(X: number, F: number, D: number, D2: number): { F: number; D: number; D2: number };

  // Law_Linear.Trim (method)
  Trim(PFirst: number, PLast: number, Tol: number): Law_Function;

  // Law_Linear.Bounds (method)
  Bounds(PFirst: number, PLast: number): { PFirst: number; PLast: number };

  // Law_Linear.get_type_name (method)
  static get_type_name(): string;

  // Law_Linear.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Law_Linear.DynamicType (method)
  DynamicType(): Standard_Type;

  // Law_Linear.delete (method)
  delete(): void;

  // Law_Linear.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_S: declare class Law_S extends Law_BSpFunc

  // Law_S.constructor (constructor)
  constructor();

  // Law_S.Set (method)
  Set(Pdeb: number, Valdeb: number, Pfin: number, Valfin: number): void;
  Set(Pdeb: number, Valdeb: number, Ddeb: number, Pfin: number, Valfin: number, Dfin: number): void;

  // Law_S.get_type_name (method)
  static get_type_name(): string;

  // Law_S.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Law_S.DynamicType (method)
  DynamicType(): Standard_Type;

  // Law_S.delete (method)
  delete(): void;

  // Law_S.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Law_Laws: NCollection_List_handle_Law_Function
