# libcascade — Bisector

11 top-level symbols. Signatures are verbatim typescript.

Bisector: declare class Bisector

  constructor

  static IsConvex(Cu: Geom2d_Curve, Sign: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Bisector_Bisec: declare class Bisector_Bisec

  constructor

  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, ajointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;

  Value(): Geom2d_TrimmedCurve;

  ChangeValue(): Geom2d_TrimmedCurve;

  delete(): void;

  [Symbol.dispose](): void;

Bisector_BisecAna: declare class Bisector_BisecAna extends Bisector_Curve

  constructor

  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;
  Perform(Cu: Geom2d_Curve, Pnt: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt: Geom2d_Point, Cu: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Pnt1: Geom2d_Point, Pnt2: Geom2d_Point, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, Tolerance: number, oncurve: boolean): void;
  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, Sense: number, jointype: GeomAbs_JoinType, Tolerance: number, oncurve: boolean): void;

  Init(bisector: Geom2d_TrimmedCurve): void;

  IsExtendAtStart(): boolean;

  IsExtendAtEnd(): boolean;

  SetTrim(Cu: Geom2d_Curve): void;
  SetTrim(uf: number, ul: number): void;
  SetTrim(Cu: Geom2d_Curve): void;
  SetTrim(uf: number, ul: number): void;

  Reverse(): void;

  ReversedParameter(U: number): number;

  IsCN(N: number): boolean;

  Copy(): Geom2d_Geometry;

  Transform(T: gp_Trsf2d): void;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  Geom2dCurve(): Geom2d_Curve;

  Parameter(P: gp_Pnt2d): number;

  ParameterOfStartPoint(): number;

  ParameterOfEndPoint(): number;

  NbIntervals(): number;

  IntervalFirst(Index: number): number;

  IntervalLast(Index: number): number;

  Dump(Deep?: number, Offset?: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Bisector_BisecCC: declare class Bisector_BisecCC extends Bisector_Curve

  constructor

  Perform(Cu1: Geom2d_Curve, Cu2: Geom2d_Curve, Side1: number, Side2: number, Origin: gp_Pnt2d, DistMax?: number): void;

  IsExtendAtStart(): boolean;

  IsExtendAtEnd(): boolean;

  Reverse(): void;

  ReversedParameter(U: number): number;

  IsCN(N: number): boolean;

  ChangeGuide(): Bisector_BisecCC;

  Copy(): Geom2d_Geometry;

  Transform(T: gp_Trsf2d): void;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(): number;

  IntervalFirst(Index: number): number;

  IntervalLast(Index: number): number;

  IntervalContinuity(): GeomAbs_Shape;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  ValueAndDist(U: number, U1?: number, U2?: number, Distance?: number): { returnValue: gp_Pnt2d; U1: number; U2: number; Distance: number; [Symbol.dispose](): void };

  ValueByInt(U: number, U1?: number, U2?: number, Distance?: number): { returnValue: gp_Pnt2d; U1: number; U2: number; Distance: number; [Symbol.dispose](): void };

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  IsEmpty(): boolean;

  LinkBisCurve(U: number): number;

  LinkCurveBis(U: number): number;

  Parameter(P: gp_Pnt2d): number;

  Curve(IndCurve: number): Geom2d_Curve;

  Polygon(): Bisector_PolyBis;

  Dump(Deep?: number, Offset?: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Bisector_BisecPC: declare class Bisector_BisecPC extends Bisector_Curve

  constructor

  Perform(Cu: Geom2d_Curve, P: gp_Pnt2d, Side: number, DistMax?: number): void;

  IsExtendAtStart(): boolean;

  IsExtendAtEnd(): boolean;

  Reverse(): void;

  ReversedParameter(U: number): number;

  Copy(): Geom2d_Geometry;

  Transform(T: gp_Trsf2d): void;

  IsCN(N: number): boolean;

  FirstParameter(): number;

  LastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(): number;

  IntervalFirst(Index: number): number;

  IntervalLast(Index: number): number;

  IntervalContinuity(): GeomAbs_Shape;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Distance(U: number): number;

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  Dump(Deep?: number, Offset?: number): void;

  LinkBisCurve(U: number): number;

  LinkCurveBis(U: number): number;

  Parameter(P: gp_Pnt2d): number;

  IsEmpty(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Bisector_Curve: declare class Bisector_Curve extends Geom2d_Curve

  Parameter(P: gp_Pnt2d): number;

  IsExtendAtStart(): boolean;

  IsExtendAtEnd(): boolean;

  NbIntervals(): number;

  IntervalFirst(Index: number): number;

  IntervalLast(Index: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Bisector_FunctionH: declare class Bisector_FunctionH extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

Bisector_FunctionInter: declare class Bisector_FunctionInter extends math_FunctionWithDerivative

  constructor

  Perform(C: Geom2d_Curve, Bis1: Bisector_Curve, Bis2: Bisector_Curve): void;

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

Bisector_Inter: declare class Bisector_Inter extends IntRes2d_Intersection

  constructor

  Perform(C1: Bisector_Bisec, D1: IntRes2d_Domain, C2: Bisector_Bisec, D2: IntRes2d_Domain, TolConf: number, Tol: number, ComunElement: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

Bisector_PointOnBis: declare class Bisector_PointOnBis

  constructor

  ParamOnC1(Param: number): void;
  ParamOnC1(): number;
  ParamOnC1(Param: number): void;
  ParamOnC1(): number;

  ParamOnC2(Param: number): void;
  ParamOnC2(): number;
  ParamOnC2(Param: number): void;
  ParamOnC2(): number;

  ParamOnBis(Param: number): void;
  ParamOnBis(): number;
  ParamOnBis(Param: number): void;
  ParamOnBis(): number;

  Distance(Distance: number): void;
  Distance(): number;
  Distance(Distance: number): void;
  Distance(): number;

  IsInfinite(Infinite: boolean): void;
  IsInfinite(): boolean;
  IsInfinite(Infinite: boolean): void;
  IsInfinite(): boolean;

  Point(P: gp_Pnt2d): void;
  Point(): gp_Pnt2d;
  Point(P: gp_Pnt2d): void;
  Point(): gp_Pnt2d;

  Dump(): void;

  delete(): void;

  [Symbol.dispose](): void;

Bisector_PolyBis: declare class Bisector_PolyBis

  constructor

  Append(Point: Bisector_PointOnBis): void;

  Length(): number;

  IsEmpty(): boolean;

  Value(Index: number): Bisector_PointOnBis;

  First(): Bisector_PointOnBis;

  Last(): Bisector_PointOnBis;

  Interval(U: number): number;

  Transform(T: gp_Trsf2d): void;

  delete(): void;

  [Symbol.dispose](): void;
