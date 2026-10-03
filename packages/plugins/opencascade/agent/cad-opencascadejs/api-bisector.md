# libcascade — Bisector

11 top-level symbols. Signatures are verbatim typescript.

Bisector: declare class Bisector

  // Bisector.constructor (constructor)
  constructor();

  // Bisector.IsConvex (method)
  static IsConvex(Cu: Geom2d_Curve, Sign: number): boolean;

  // Bisector.delete (method)
  delete(): void;

  // Bisector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_Bisec: declare class Bisector_Bisec

  // Bisector_Bisec.constructor (constructor)
  constructor();

  // Bisector_Bisec.Perform (method)
  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;

  // Bisector_Bisec.Value (method)
  Value(): Geom2d_TrimmedCurve;

  // Bisector_Bisec.ChangeValue (method)
  ChangeValue(): Geom2d_TrimmedCurve;

  // Bisector_Bisec.delete (method)
  delete(): void;

  // Bisector_Bisec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_BisecAna: declare class Bisector_BisecAna extends Bisector_Curve

  // Bisector_BisecAna.constructor (constructor)
  constructor();

  // Bisector_BisecAna.Perform (method)
  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;

  // Bisector_BisecAna.Init (method)
  Init(bisector: Geom2d_TrimmedCurve): void;

  // Bisector_BisecAna.IsExtendAtStart (method)
  IsExtendAtStart(): boolean;

  // Bisector_BisecAna.IsExtendAtEnd (method)
  IsExtendAtEnd(): boolean;

  // Bisector_BisecAna.SetTrim (method)
  SetTrim(Cu: Geom2d_Curve): void;
  SetTrim(uf: number, ul: number): void;

  // Bisector_BisecAna.Reverse (method)
  Reverse(): void;

  // Bisector_BisecAna.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Bisector_BisecAna.IsCN (method)
  IsCN(N: number): boolean;

  // Bisector_BisecAna.Copy (method)
  Copy(): Geom2d_Geometry;

  // Bisector_BisecAna.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Bisector_BisecAna.FirstParameter (method)
  FirstParameter(): number;

  // Bisector_BisecAna.LastParameter (method)
  LastParameter(): number;

  // Bisector_BisecAna.IsClosed (method)
  IsClosed(): boolean;

  // Bisector_BisecAna.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Bisector_BisecAna.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Bisector_BisecAna.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Bisector_BisecAna.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Bisector_BisecAna.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Bisector_BisecAna.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Bisector_BisecAna.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Bisector_BisecAna.Geom2dCurve (method)
  Geom2dCurve(): Geom2d_Curve;

  // Bisector_BisecAna.Parameter (method)
  Parameter(P: gp_Pnt2d): number;

  // Bisector_BisecAna.ParameterOfStartPoint (method)
  ParameterOfStartPoint(): number;

  // Bisector_BisecAna.ParameterOfEndPoint (method)
  ParameterOfEndPoint(): number;

  // Bisector_BisecAna.NbIntervals (method)
  NbIntervals(): number;

  // Bisector_BisecAna.IntervalFirst (method)
  IntervalFirst(Index: number): number;

  // Bisector_BisecAna.IntervalLast (method)
  IntervalLast(Index: number): number;

  // Bisector_BisecAna.Dump (method)
  Dump(Deep?: number, Offset?: number): void;

  // Bisector_BisecAna.get_type_name (method)
  static get_type_name(): string;

  // Bisector_BisecAna.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Bisector_BisecAna.DynamicType (method)
  DynamicType(): Standard_Type;

  // Bisector_BisecAna.delete (method)
  delete(): void;

  // Bisector_BisecAna.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_BisecCC: declare class Bisector_BisecCC extends Bisector_Curve

  // Bisector_BisecCC.constructor (constructor)
  constructor();
  constructor(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, Side1: number, Side2: number, Origin: gp_Pnt2d, DistMax?: number);

  // Bisector_BisecCC.Perform (method)
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, Side1: number, Side2: number, Origin: gp_Pnt2d, DistMax?: number): void;

  // Bisector_BisecCC.IsExtendAtStart (method)
  IsExtendAtStart(): boolean;

  // Bisector_BisecCC.IsExtendAtEnd (method)
  IsExtendAtEnd(): boolean;

  // Bisector_BisecCC.Reverse (method)
  Reverse(): void;

  // Bisector_BisecCC.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Bisector_BisecCC.IsCN (method)
  IsCN(N: number): boolean;

  // Bisector_BisecCC.ChangeGuide (method)
  ChangeGuide(): Bisector_BisecCC;

  // Bisector_BisecCC.Copy (method)
  Copy(): Geom2d_Geometry;

  // Bisector_BisecCC.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Bisector_BisecCC.FirstParameter (method)
  FirstParameter(): number;

  // Bisector_BisecCC.LastParameter (method)
  LastParameter(): number;

  // Bisector_BisecCC.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Bisector_BisecCC.NbIntervals (method)
  NbIntervals(): number;

  // Bisector_BisecCC.IntervalFirst (method)
  IntervalFirst(Index: number): number;

  // Bisector_BisecCC.IntervalLast (method)
  IntervalLast(Index: number): number;

  // Bisector_BisecCC.IntervalContinuity (method)
  IntervalContinuity(): GeomAbs_Shape;

  // Bisector_BisecCC.IsClosed (method)
  IsClosed(): boolean;

  // Bisector_BisecCC.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Bisector_BisecCC.ValueAndDist (method)
  ValueAndDist(U: number, U1?: number, U2?: number, Distance?: number): { returnValue: gp_Pnt2d; U1: number; U2: number; Distance: number; [Symbol.dispose](): void };

  // Bisector_BisecCC.ValueByInt (method)
  ValueByInt(U: number, U1?: number, U2?: number, Distance?: number): { returnValue: gp_Pnt2d; U1: number; U2: number; Distance: number; [Symbol.dispose](): void };

  // Bisector_BisecCC.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Bisector_BisecCC.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Bisector_BisecCC.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Bisector_BisecCC.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Bisector_BisecCC.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Bisector_BisecCC.IsEmpty (method)
  IsEmpty(): boolean;

  // Bisector_BisecCC.LinkBisCurve (method)
  LinkBisCurve(U: number): number;

  // Bisector_BisecCC.LinkCurveBis (method)
  LinkCurveBis(U: number): number;

  // Bisector_BisecCC.Parameter (method)
  Parameter(P: gp_Pnt2d): number;

  // Bisector_BisecCC.Curve (method)
  Curve(IndCurve: number): Geom2d_Curve;

  // Bisector_BisecCC.Polygon (method)
  Polygon(): Bisector_PolyBis;

  // Bisector_BisecCC.Dump (method)
  Dump(Deep?: number, Offset?: number): void;

  // Bisector_BisecCC.get_type_name (method)
  static get_type_name(): string;

  // Bisector_BisecCC.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Bisector_BisecCC.DynamicType (method)
  DynamicType(): Standard_Type;

  // Bisector_BisecCC.delete (method)
  delete(): void;

  // Bisector_BisecCC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_BisecPC: declare class Bisector_BisecPC extends Bisector_Curve

  // Bisector_BisecPC.constructor (constructor)
  constructor();
  constructor(Cu: Geom2d_Curve, P: gp_Pnt2d, Side: number, DistMax?: number);
  constructor(Cu: Geom2d_Curve, P: gp_Pnt2d, Side: number, UMin: number, UMax: number);

  // Bisector_BisecPC.Perform (method)
  Perform(Cu: Geom2d_Curve, P: gp_Pnt2d, Side: number, DistMax?: number): void;

  // Bisector_BisecPC.IsExtendAtStart (method)
  IsExtendAtStart(): boolean;

  // Bisector_BisecPC.IsExtendAtEnd (method)
  IsExtendAtEnd(): boolean;

  // Bisector_BisecPC.Reverse (method)
  Reverse(): void;

  // Bisector_BisecPC.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Bisector_BisecPC.Copy (method)
  Copy(): Geom2d_Geometry;

  // Bisector_BisecPC.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Bisector_BisecPC.IsCN (method)
  IsCN(N: number): boolean;

  // Bisector_BisecPC.FirstParameter (method)
  FirstParameter(): number;

  // Bisector_BisecPC.LastParameter (method)
  LastParameter(): number;

  // Bisector_BisecPC.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Bisector_BisecPC.NbIntervals (method)
  NbIntervals(): number;

  // Bisector_BisecPC.IntervalFirst (method)
  IntervalFirst(Index: number): number;

  // Bisector_BisecPC.IntervalLast (method)
  IntervalLast(Index: number): number;

  // Bisector_BisecPC.IntervalContinuity (method)
  IntervalContinuity(): GeomAbs_Shape;

  // Bisector_BisecPC.IsClosed (method)
  IsClosed(): boolean;

  // Bisector_BisecPC.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Bisector_BisecPC.Distance (method)
  Distance(U: number): number;

  // Bisector_BisecPC.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Bisector_BisecPC.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Bisector_BisecPC.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Bisector_BisecPC.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Bisector_BisecPC.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Bisector_BisecPC.Dump (method)
  Dump(Deep?: number, Offset?: number): void;

  // Bisector_BisecPC.LinkBisCurve (method)
  LinkBisCurve(U: number): number;

  // Bisector_BisecPC.LinkCurveBis (method)
  LinkCurveBis(U: number): number;

  // Bisector_BisecPC.Parameter (method)
  Parameter(P: gp_Pnt2d): number;

  // Bisector_BisecPC.IsEmpty (method)
  IsEmpty(): boolean;

  // Bisector_BisecPC.get_type_name (method)
  static get_type_name(): string;

  // Bisector_BisecPC.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Bisector_BisecPC.DynamicType (method)
  DynamicType(): Standard_Type;

  // Bisector_BisecPC.delete (method)
  delete(): void;

  // Bisector_BisecPC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_Curve: declare class Bisector_Curve extends Geom2d_Curve

  // Bisector_Curve.Parameter (method)
  Parameter(P: gp_Pnt2d): number;

  // Bisector_Curve.IsExtendAtStart (method)
  IsExtendAtStart(): boolean;

  // Bisector_Curve.IsExtendAtEnd (method)
  IsExtendAtEnd(): boolean;

  // Bisector_Curve.NbIntervals (method)
  NbIntervals(): number;

  // Bisector_Curve.IntervalFirst (method)
  IntervalFirst(Index: number): number;

  // Bisector_Curve.IntervalLast (method)
  IntervalLast(Index: number): number;

  // Bisector_Curve.get_type_name (method)
  static get_type_name(): string;

  // Bisector_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Bisector_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Bisector_Curve.delete (method)
  delete(): void;

  // Bisector_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_FunctionH: declare class Bisector_FunctionH extends math_FunctionWithDerivative

  // Bisector_FunctionH.constructor (constructor)
  constructor(C2: Geom2d_Curve, P1: gp_Pnt2d, T1: gp_Vec2d);

  // Bisector_FunctionH.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // Bisector_FunctionH.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // Bisector_FunctionH.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // Bisector_FunctionH.delete (method)
  delete(): void;

  // Bisector_FunctionH.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_FunctionInter: declare class Bisector_FunctionInter extends math_FunctionWithDerivative

  // Bisector_FunctionInter.constructor (constructor)
  constructor();
  constructor(C: Geom2d_Curve, Bis1: Bisector_Curve, Bis2: Bisector_Curve);

  // Bisector_FunctionInter.Perform (method)
  Perform(C: Geom2d_Curve, Bis1: Bisector_Curve, Bis2: Bisector_Curve): void;

  // Bisector_FunctionInter.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // Bisector_FunctionInter.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // Bisector_FunctionInter.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // Bisector_FunctionInter.delete (method)
  delete(): void;

  // Bisector_FunctionInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_Inter: declare class Bisector_Inter extends IntRes2d_Intersection

  // Bisector_Inter.constructor (constructor)
  constructor();
  constructor(C1: Bisector_Bisec, D1: IntRes2d_Domain, C2: Bisector_Bisec, D2: IntRes2d_Domain, TolConf: number, Tol: number, ComunElement: boolean);

  // Bisector_Inter.Perform (method)
  Perform(C1: Bisector_Bisec, D1: IntRes2d_Domain, C2: Bisector_Bisec, D2: IntRes2d_Domain, TolConf: number, Tol: number, ComunElement: boolean): void;

  // Bisector_Inter.delete (method)
  delete(): void;

  // Bisector_Inter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_PointOnBis: declare class Bisector_PointOnBis

  // Bisector_PointOnBis.constructor (constructor)
  constructor();
  constructor(Param1: number, Param2: number, ParamBis: number, Distance: number, Point: gp_Pnt2d);

  // Bisector_PointOnBis.ParamOnC1 (method)
  ParamOnC1(Param: number): void;
  ParamOnC1(): number;

  // Bisector_PointOnBis.ParamOnC2 (method)
  ParamOnC2(Param: number): void;
  ParamOnC2(): number;

  // Bisector_PointOnBis.ParamOnBis (method)
  ParamOnBis(Param: number): void;
  ParamOnBis(): number;

  // Bisector_PointOnBis.Distance (method)
  Distance(Distance: number): void;
  Distance(): number;

  // Bisector_PointOnBis.IsInfinite (method)
  IsInfinite(Infinite: boolean): void;
  IsInfinite(): boolean;

  // Bisector_PointOnBis.Point (method)
  Point(P: gp_Pnt2d): void;
  Point(): gp_Pnt2d;

  // Bisector_PointOnBis.Dump (method)
  Dump(): void;

  // Bisector_PointOnBis.delete (method)
  delete(): void;

  // Bisector_PointOnBis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bisector_PolyBis: declare class Bisector_PolyBis

  // Bisector_PolyBis.constructor (constructor)
  constructor();

  // Bisector_PolyBis.Append (method)
  Append(Point: Bisector_PointOnBis): void;

  // Bisector_PolyBis.Length (method)
  Length(): number;

  // Bisector_PolyBis.IsEmpty (method)
  IsEmpty(): boolean;

  // Bisector_PolyBis.Value (method)
  Value(Index: number): Bisector_PointOnBis;

  // Bisector_PolyBis.First (method)
  First(): Bisector_PointOnBis;

  // Bisector_PolyBis.Last (method)
  Last(): Bisector_PointOnBis;

  // Bisector_PolyBis.Interval (method)
  Interval(U: number): number;

  // Bisector_PolyBis.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Bisector_PolyBis.delete (method)
  delete(): void;

  // Bisector_PolyBis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
