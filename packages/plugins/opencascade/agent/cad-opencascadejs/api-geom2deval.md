# libcascade — Geom2dEval

13 top-level symbols. Signatures are verbatim typescript.

Geom2dEval_AHTBezierCurve: declare class Geom2dEval_AHTBezierCurve extends Geom2d_BoundedCurve

  // Geom2dEval_AHTBezierCurve.constructor (constructor)
  constructor(thePoles: NCollection_Array1_gp_Pnt2d, theAlgDegree: number, theAlpha: number, theBeta: number);
  constructor(thePoles: NCollection_Array1_gp_Pnt2d, theWeights: NCollection_Array1_double, theAlgDegree: number, theAlpha: number, theBeta: number);

  // Geom2dEval_AHTBezierCurve.Poles (method)
  Poles(): NCollection_Array1_gp_Pnt2d;

  // Geom2dEval_AHTBezierCurve.Weights (method)
  Weights(): NCollection_Array1_double;

  // Geom2dEval_AHTBezierCurve.AlgDegree (method)
  AlgDegree(): number;

  // Geom2dEval_AHTBezierCurve.Alpha (method)
  Alpha(): number;

  // Geom2dEval_AHTBezierCurve.Beta (method)
  Beta(): number;

  // Geom2dEval_AHTBezierCurve.NbPoles (method)
  NbPoles(): number;

  // Geom2dEval_AHTBezierCurve.IsRational (method)
  IsRational(): boolean;

  // Geom2dEval_AHTBezierCurve.StartPoint (method)
  StartPoint(): gp_Pnt2d;

  // Geom2dEval_AHTBezierCurve.EndPoint (method)
  EndPoint(): gp_Pnt2d;

  // Geom2dEval_AHTBezierCurve.Reverse (method)
  Reverse(): void;

  // Geom2dEval_AHTBezierCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2dEval_AHTBezierCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2dEval_AHTBezierCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2dEval_AHTBezierCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2dEval_AHTBezierCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2dEval_AHTBezierCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2dEval_AHTBezierCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2dEval_AHTBezierCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2dEval_AHTBezierCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2dEval_AHTBezierCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2dEval_AHTBezierCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2dEval_AHTBezierCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2dEval_AHTBezierCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2dEval_AHTBezierCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2dEval_AHTBezierCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_AHTBezierCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_AHTBezierCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_AHTBezierCurve.delete (method)
  delete(): void;

  // Geom2dEval_AHTBezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_ArchimedeanSpiralCurve: declare class Geom2dEval_ArchimedeanSpiralCurve extends Geom2d_Curve

  // Geom2dEval_ArchimedeanSpiralCurve.constructor (constructor)
  constructor(thePosition: gp_Ax2d, theInitialRadius: number, theGrowthRate: number);

  // Geom2dEval_ArchimedeanSpiralCurve.Position (method)
  Position(): gp_Ax2d;

  // Geom2dEval_ArchimedeanSpiralCurve.InitialRadius (method)
  InitialRadius(): number;

  // Geom2dEval_ArchimedeanSpiralCurve.GrowthRate (method)
  GrowthRate(): number;

  // Geom2dEval_ArchimedeanSpiralCurve.Reverse (method)
  Reverse(): void;

  // Geom2dEval_ArchimedeanSpiralCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2dEval_ArchimedeanSpiralCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2dEval_ArchimedeanSpiralCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2dEval_ArchimedeanSpiralCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2dEval_ArchimedeanSpiralCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2dEval_ArchimedeanSpiralCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2dEval_ArchimedeanSpiralCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2dEval_ArchimedeanSpiralCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2dEval_ArchimedeanSpiralCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2dEval_ArchimedeanSpiralCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2dEval_ArchimedeanSpiralCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2dEval_ArchimedeanSpiralCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2dEval_ArchimedeanSpiralCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2dEval_ArchimedeanSpiralCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2dEval_ArchimedeanSpiralCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_ArchimedeanSpiralCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_ArchimedeanSpiralCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_ArchimedeanSpiralCurve.delete (method)
  delete(): void;

  // Geom2dEval_ArchimedeanSpiralCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_CircleInvoluteCurve: declare class Geom2dEval_CircleInvoluteCurve extends Geom2d_Curve

  // Geom2dEval_CircleInvoluteCurve.constructor (constructor)
  constructor(thePosition: gp_Ax2d, theRadius: number);

  // Geom2dEval_CircleInvoluteCurve.Position (method)
  Position(): gp_Ax2d;

  // Geom2dEval_CircleInvoluteCurve.Radius (method)
  Radius(): number;

  // Geom2dEval_CircleInvoluteCurve.Reverse (method)
  Reverse(): void;

  // Geom2dEval_CircleInvoluteCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2dEval_CircleInvoluteCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2dEval_CircleInvoluteCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2dEval_CircleInvoluteCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2dEval_CircleInvoluteCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2dEval_CircleInvoluteCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2dEval_CircleInvoluteCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2dEval_CircleInvoluteCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2dEval_CircleInvoluteCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2dEval_CircleInvoluteCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2dEval_CircleInvoluteCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2dEval_CircleInvoluteCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2dEval_CircleInvoluteCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2dEval_CircleInvoluteCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2dEval_CircleInvoluteCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_CircleInvoluteCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_CircleInvoluteCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_CircleInvoluteCurve.delete (method)
  delete(): void;

  // Geom2dEval_CircleInvoluteCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_LogarithmicSpiralCurve: declare class Geom2dEval_LogarithmicSpiralCurve extends Geom2d_Curve

  // Geom2dEval_LogarithmicSpiralCurve.constructor (constructor)
  constructor(thePosition: gp_Ax2d, theScale: number, theGrowthExponent: number);

  // Geom2dEval_LogarithmicSpiralCurve.Position (method)
  Position(): gp_Ax2d;

  // Geom2dEval_LogarithmicSpiralCurve.Scale (method)
  Scale(): number;
  Scale(P: gp_Pnt2d, S: number): void;

  // Geom2dEval_LogarithmicSpiralCurve.GrowthExponent (method)
  GrowthExponent(): number;

  // Geom2dEval_LogarithmicSpiralCurve.Reverse (method)
  Reverse(): void;

  // Geom2dEval_LogarithmicSpiralCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2dEval_LogarithmicSpiralCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2dEval_LogarithmicSpiralCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2dEval_LogarithmicSpiralCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2dEval_LogarithmicSpiralCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2dEval_LogarithmicSpiralCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2dEval_LogarithmicSpiralCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2dEval_LogarithmicSpiralCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2dEval_LogarithmicSpiralCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2dEval_LogarithmicSpiralCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2dEval_LogarithmicSpiralCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2dEval_LogarithmicSpiralCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2dEval_LogarithmicSpiralCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2dEval_LogarithmicSpiralCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2dEval_LogarithmicSpiralCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_LogarithmicSpiralCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_LogarithmicSpiralCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_LogarithmicSpiralCurve.delete (method)
  delete(): void;

  // Geom2dEval_LogarithmicSpiralCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Base: declare class Geom2dEval_RepCurveDesc_Base extends Standard_Transient

  Representation: Geom2d_Curve

  // Geom2dEval_RepCurveDesc_Base.GetKind (method)
  GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

  // Geom2dEval_RepCurveDesc_Base.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_RepCurveDesc_Base.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_RepCurveDesc_Base.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_RepCurveDesc_Base.delete (method)
  delete(): void;

  // Geom2dEval_RepCurveDesc_Base.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Base_Kind: typeof Geom2dEval_RepCurveDesc_Base_Kind[keyof typeof Geom2dEval_RepCurveDesc_Base_Kind]

  readonly Full: 'Full'

  readonly DerivBounded: 'DerivBounded'

  readonly Mapped: 'Mapped'

Geom2dEval_RepCurveDesc_DerivBounded: declare class Geom2dEval_RepCurveDesc_DerivBounded extends Geom2dEval_RepCurveDesc_Base

  // Geom2dEval_RepCurveDesc_DerivBounded.constructor (constructor)
  constructor();

  MaxDerivOrder: number

  // Geom2dEval_RepCurveDesc_DerivBounded.GetKind (method)
  GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

  // Geom2dEval_RepCurveDesc_DerivBounded.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_RepCurveDesc_DerivBounded.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_RepCurveDesc_DerivBounded.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_RepCurveDesc_DerivBounded.delete (method)
  delete(): void;

  // Geom2dEval_RepCurveDesc_DerivBounded.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Domain1d: declare class Geom2dEval_RepCurveDesc_Domain1d

  // Geom2dEval_RepCurveDesc_Domain1d.constructor (constructor)
  constructor();

  First: number

  Last: number

  // Geom2dEval_RepCurveDesc_Domain1d.Contains (method)
  Contains(theU: number): boolean;

  // Geom2dEval_RepCurveDesc_Domain1d.delete (method)
  delete(): void;

  // Geom2dEval_RepCurveDesc_Domain1d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Full: declare class Geom2dEval_RepCurveDesc_Full extends Geom2dEval_RepCurveDesc_Base

  // Geom2dEval_RepCurveDesc_Full.constructor (constructor)
  constructor();

  // Geom2dEval_RepCurveDesc_Full.GetKind (method)
  GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

  // Geom2dEval_RepCurveDesc_Full.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_RepCurveDesc_Full.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_RepCurveDesc_Full.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_RepCurveDesc_Full.delete (method)
  delete(): void;

  // Geom2dEval_RepCurveDesc_Full.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Map1d: declare class Geom2dEval_RepCurveDesc_Map1d

  // Geom2dEval_RepCurveDesc_Map1d.constructor (constructor)
  constructor();

  Scale: number

  Offset: number

  // Geom2dEval_RepCurveDesc_Map1d.IsIdentity (method)
  IsIdentity(): boolean;

  // Geom2dEval_RepCurveDesc_Map1d.IsValid (method)
  IsValid(): boolean;

  // Geom2dEval_RepCurveDesc_Map1d.Map (method)
  Map(theU: number): number;

  // Geom2dEval_RepCurveDesc_Map1d.delete (method)
  delete(): void;

  // Geom2dEval_RepCurveDesc_Map1d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_RepCurveDesc_Mapped: declare class Geom2dEval_RepCurveDesc_Mapped extends Geom2dEval_RepCurveDesc_Base

  // Geom2dEval_RepCurveDesc_Mapped.constructor (constructor)
  constructor();

  MaxDerivOrder: number

  Domain: Geom2dEval_RepCurveDesc_Domain1d | null | undefined

  ParamMap: Geom2dEval_RepCurveDesc_Map1d

  // Geom2dEval_RepCurveDesc_Mapped.GetKind (method)
  GetKind(): Geom2dEval_RepCurveDesc_Base_Kind;

  // Geom2dEval_RepCurveDesc_Mapped.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_RepCurveDesc_Mapped.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_RepCurveDesc_Mapped.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_RepCurveDesc_Mapped.delete (method)
  delete(): void;

  // Geom2dEval_RepCurveDesc_Mapped.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_SineWaveCurve: declare class Geom2dEval_SineWaveCurve extends Geom2d_Curve

  // Geom2dEval_SineWaveCurve.constructor (constructor)
  constructor(thePosition: gp_Ax2d, theAmplitude: number, theOmega: number, thePhase?: number);

  // Geom2dEval_SineWaveCurve.Position (method)
  Position(): gp_Ax2d;

  // Geom2dEval_SineWaveCurve.Amplitude (method)
  Amplitude(): number;

  // Geom2dEval_SineWaveCurve.Omega (method)
  Omega(): number;

  // Geom2dEval_SineWaveCurve.Phase (method)
  Phase(): number;

  // Geom2dEval_SineWaveCurve.Reverse (method)
  Reverse(): void;

  // Geom2dEval_SineWaveCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2dEval_SineWaveCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2dEval_SineWaveCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2dEval_SineWaveCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2dEval_SineWaveCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2dEval_SineWaveCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2dEval_SineWaveCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2dEval_SineWaveCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2dEval_SineWaveCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2dEval_SineWaveCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2dEval_SineWaveCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2dEval_SineWaveCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2dEval_SineWaveCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2dEval_SineWaveCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2dEval_SineWaveCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_SineWaveCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_SineWaveCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_SineWaveCurve.delete (method)
  delete(): void;

  // Geom2dEval_SineWaveCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dEval_TBezierCurve: declare class Geom2dEval_TBezierCurve extends Geom2d_BoundedCurve

  // Geom2dEval_TBezierCurve.constructor (constructor)
  constructor(thePoles: NCollection_Array1_gp_Pnt2d, theAlpha: number);
  constructor(thePoles: NCollection_Array1_gp_Pnt2d, theWeights: NCollection_Array1_double, theAlpha: number);

  // Geom2dEval_TBezierCurve.Poles (method)
  Poles(): NCollection_Array1_gp_Pnt2d;

  // Geom2dEval_TBezierCurve.Weights (method)
  Weights(): NCollection_Array1_double;

  // Geom2dEval_TBezierCurve.Alpha (method)
  Alpha(): number;

  // Geom2dEval_TBezierCurve.NbPoles (method)
  NbPoles(): number;

  // Geom2dEval_TBezierCurve.Order (method)
  Order(): number;

  // Geom2dEval_TBezierCurve.IsRational (method)
  IsRational(): boolean;

  // Geom2dEval_TBezierCurve.StartPoint (method)
  StartPoint(): gp_Pnt2d;

  // Geom2dEval_TBezierCurve.EndPoint (method)
  EndPoint(): gp_Pnt2d;

  // Geom2dEval_TBezierCurve.Reverse (method)
  Reverse(): void;

  // Geom2dEval_TBezierCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2dEval_TBezierCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2dEval_TBezierCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2dEval_TBezierCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2dEval_TBezierCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2dEval_TBezierCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2dEval_TBezierCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2dEval_TBezierCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2dEval_TBezierCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2dEval_TBezierCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2dEval_TBezierCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2dEval_TBezierCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2dEval_TBezierCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2dEval_TBezierCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2dEval_TBezierCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2dEval_TBezierCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2dEval_TBezierCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2dEval_TBezierCurve.delete (method)
  delete(): void;

  // Geom2dEval_TBezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
