# libcascade — Geom2dEval

13 top-level symbols. Signatures are verbatim typescript.

Geom2dEval_AHTBezierCurve: declare class Geom2dEval_AHTBezierCurve extends Geom2d_BoundedCurve

  constructor

  Poles(): NCollection_Array1_gp_Pnt2d;

  Weights(): NCollection_Array1_double;

  AlgDegree(): number;

  Alpha(): number;

  Beta(): number;

  NbPoles(): number;

  IsRational(): boolean;

  StartPoint(): gp_Pnt2d;

  EndPoint(): gp_Pnt2d;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  Transform(T: gp_Trsf2d): void;

  Copy(): Geom2d_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_ArchimedeanSpiralCurve: declare class Geom2dEval_ArchimedeanSpiralCurve extends Geom2d_Curve

  constructor

  Position(): gp_Ax2d;

  InitialRadius(): number;

  GrowthRate(): number;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  Transform(T: gp_Trsf2d): void;

  Copy(): Geom2d_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_CircleInvoluteCurve: declare class Geom2dEval_CircleInvoluteCurve extends Geom2d_Curve

  constructor

  Position(): gp_Ax2d;

  Radius(): number;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  Transform(T: gp_Trsf2d): void;

  Copy(): Geom2d_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_LogarithmicSpiralCurve: declare class Geom2dEval_LogarithmicSpiralCurve extends Geom2d_Curve

  constructor

  Position(): gp_Ax2d;

  Scale(): number;
  Scale(P: gp_Pnt2d, S: number): void;
  Scale(): number;
  Scale(P: gp_Pnt2d, S: number): void;

  GrowthExponent(): number;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  Transform(T: gp_Trsf2d): void;

  Copy(): Geom2d_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Base: declare class Geom2dEval_RepCurveDesc_Base extends Standard_Transient

  Representation: Geom2d_Curve

  GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Base_Kind: typeof Geom2dEval_RepCurveDesc_Base_Kind[keyof typeof Geom2dEval_RepCurveDesc_Base_Kind]

Geom2dEval_RepCurveDesc_DerivBounded: declare class Geom2dEval_RepCurveDesc_DerivBounded extends Geom2dEval_RepCurveDesc_Base

  constructor

  MaxDerivOrder: number

  GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Domain1d: declare class Geom2dEval_RepCurveDesc_Domain1d

  constructor

  First: number

  Last: number

  Contains(theU: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Full: declare class Geom2dEval_RepCurveDesc_Full extends Geom2dEval_RepCurveDesc_Base

  constructor

  GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Map1d: declare class Geom2dEval_RepCurveDesc_Map1d

  constructor

  Scale: number

  Offset: number

  IsIdentity(): boolean;

  IsValid(): boolean;

  Map(theU: number): number;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Mapped: declare class Geom2dEval_RepCurveDesc_Mapped extends Geom2dEval_RepCurveDesc_Base

  constructor

  MaxDerivOrder: number

  Domain: Geom2dEval_RepCurveDesc_Domain1d | null | undefined

  ParamMap: Geom2dEval_RepCurveDesc_Map1d

  GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_SineWaveCurve: declare class Geom2dEval_SineWaveCurve extends Geom2d_Curve

  constructor

  Position(): gp_Ax2d;

  Amplitude(): number;

  Omega(): number;

  Phase(): number;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  Transform(T: gp_Trsf2d): void;

  Copy(): Geom2d_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dEval_TBezierCurve: declare class Geom2dEval_TBezierCurve extends Geom2d_BoundedCurve

  constructor

  Poles(): NCollection_Array1_gp_Pnt2d;

  Weights(): NCollection_Array1_double;

  Alpha(): number;

  NbPoles(): number;

  Order(): number;

  IsRational(): boolean;

  StartPoint(): gp_Pnt2d;

  EndPoint(): gp_Pnt2d;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt2d;

  EvalD1(U: number): Geom2d_Curve_ResD1;

  EvalD2(U: number): Geom2d_Curve_ResD2;

  EvalD3(U: number): Geom2d_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec2d;

  Transform(T: gp_Trsf2d): void;

  Copy(): Geom2d_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
