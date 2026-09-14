# libcascade — GeomEval

26 top-level symbols. Signatures are verbatim typescript.

GeomEval_AHTBezierCurve: declare class GeomEval_AHTBezierCurve extends Geom_BoundedCurve

  constructor

  Poles(): NCollection_Array1_gp_Pnt;

  Weights(): NCollection_Array1_double;

  AlgDegree(): number;

  Alpha(): number;

  Beta(): number;

  NbPoles(): number;

  IsRational(): boolean;

  StartPoint(): gp_Pnt;

  EndPoint(): gp_Pnt;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt;

  EvalD1(U: number): Geom_Curve_ResD1;

  EvalD2(U: number): Geom_Curve_ResD2;

  EvalD3(U: number): Geom_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_AHTBezierSurface: declare class GeomEval_AHTBezierSurface extends Geom_BoundedSurface

  constructor

  Poles(): NCollection_Array2_gp_Pnt;

  Weights(): NCollection_Array2_double;

  AlgDegreeU(): number;

  AlgDegreeV(): number;

  AlphaU(): number;

  AlphaV(): number;

  BetaU(): number;

  BetaV(): number;

  NbPolesU(): number;

  NbPolesV(): number;

  IsURational(): boolean;

  IsVRational(): boolean;

  UReverse(): void;

  VReverse(): void;

  UReversedParameter(U: number): number;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  Continuity(): GeomAbs_Shape;

  IsCNu(N: number): boolean;

  IsCNv(N: number): boolean;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_CircularHelicoidSurface: declare class GeomEval_CircularHelicoidSurface extends Geom_ElementarySurface

  constructor

  Pitch(): number;

  SetPitch(thePitch: number): void;

  UReverse(): void;

  VReverse(): void;

  UReversedParameter(U: number): number;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_CircularHelixCurve: declare class GeomEval_CircularHelixCurve extends Geom_Curve

  constructor

  Position(): gp_Ax2;

  Radius(): number;

  Pitch(): number;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt;

  EvalD1(U: number): Geom_Curve_ResD1;

  EvalD2(U: number): Geom_Curve_ResD2;

  EvalD3(U: number): Geom_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_EllipsoidSurface: declare class GeomEval_EllipsoidSurface extends Geom_ElementarySurface

  constructor

  SemiAxisA(): number;

  SemiAxisB(): number;

  SemiAxisC(): number;

  SetSemiAxisA(theA: number): void;

  SetSemiAxisB(theB: number): void;

  SetSemiAxisC(theC: number): void;

  UReverse(): void;

  VReverse(): void;

  UReversedParameter(U: number): number;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_HypParaboloidSurface: declare class GeomEval_HypParaboloidSurface extends Geom_ElementarySurface

  constructor

  SemiAxisA(): number;

  SemiAxisB(): number;

  SetSemiAxisA(theA: number): void;

  SetSemiAxisB(theB: number): void;

  UReverse(): void;

  VReverse(): void;

  UReversedParameter(U: number): number;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_HyperboloidSurface: declare class GeomEval_HyperboloidSurface extends Geom_ElementarySurface

  constructor

  R1(): number;

  R2(): number;

  Mode(): GeomEval_HyperboloidSurface_SheetMode;

  SetR1(theR1: number): void;

  SetR2(theR2: number): void;

  SetMode(theMode: GeomEval_HyperboloidSurface_SheetMode): void;

  UReverse(): void;

  VReverse(): void;

  UReversedParameter(U: number): number;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_HyperboloidSurface_SheetMode: typeof GeomEval_HyperboloidSurface_SheetMode[keyof typeof GeomEval_HyperboloidSurface_SheetMode]

GeomEval_ParaboloidSurface: declare class GeomEval_ParaboloidSurface extends Geom_ElementarySurface

  constructor

  Focal(): number;

  SetFocal(theFocal: number): void;

  UReverse(): void;

  VReverse(): void;

  UReversedParameter(U: number): number;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Base: declare class GeomEval_RepCurveDesc_Base extends Standard_Transient

  Representation: Geom_Curve

  GetKind(): GeomEval_RepCurveDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Base_Kind: typeof GeomEval_RepCurveDesc_Base_Kind[keyof typeof GeomEval_RepCurveDesc_Base_Kind]

GeomEval_RepCurveDesc_DerivBounded: declare class GeomEval_RepCurveDesc_DerivBounded extends GeomEval_RepCurveDesc_Base

  constructor

  MaxDerivOrder: number

  GetKind(): GeomEval_RepCurveDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Domain1d: declare class GeomEval_RepCurveDesc_Domain1d

  constructor

  First: number

  Last: number

  Contains(theU: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Full: declare class GeomEval_RepCurveDesc_Full extends GeomEval_RepCurveDesc_Base

  constructor

  GetKind(): GeomEval_RepCurveDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Map1d: declare class GeomEval_RepCurveDesc_Map1d

  constructor

  Scale: number

  Offset: number

  IsIdentity(): boolean;

  IsValid(): boolean;

  Map(theU: number): number;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Mapped: declare class GeomEval_RepCurveDesc_Mapped extends GeomEval_RepCurveDesc_Base

  constructor

  MaxDerivOrder: number

  Domain: GeomEval_RepCurveDesc_Domain1d | null | undefined

  ParamMap: GeomEval_RepCurveDesc_Map1d

  GetKind(): GeomEval_RepCurveDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Base: declare class GeomEval_RepSurfaceDesc_Base extends Standard_Transient

  Representation: Geom_Surface

  GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Base_Kind: typeof GeomEval_RepSurfaceDesc_Base_Kind[keyof typeof GeomEval_RepSurfaceDesc_Base_Kind]

GeomEval_RepSurfaceDesc_DerivBounded: declare class GeomEval_RepSurfaceDesc_DerivBounded extends GeomEval_RepSurfaceDesc_Base

  constructor

  MaxDerivOrder: number

  GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Domain2d: declare class GeomEval_RepSurfaceDesc_Domain2d

  constructor

  UFirst: number

  ULast: number

  VFirst: number

  VLast: number

  Contains(theU: number, theV: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Full: declare class GeomEval_RepSurfaceDesc_Full extends GeomEval_RepSurfaceDesc_Base

  constructor

  GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Map2d: declare class GeomEval_RepSurfaceDesc_Map2d

  constructor

  ScaleU: number

  OffsetU: number

  ScaleV: number

  OffsetV: number

  SwapUV: boolean

  IsIdentity(): boolean;

  IsValid(): boolean;

  Map(theU: number, theV: number, theURep?: number, theVRep?: number): { theURep: number; theVRep: number };

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Mapped: declare class GeomEval_RepSurfaceDesc_Mapped extends GeomEval_RepSurfaceDesc_Base

  constructor

  MaxDerivOrder: number

  Domain: GeomEval_RepSurfaceDesc_Domain2d | null | undefined

  ParamMap: GeomEval_RepSurfaceDesc_Map2d

  GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_SineWaveCurve: declare class GeomEval_SineWaveCurve extends Geom_Curve

  constructor

  Position(): gp_Ax2;

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

  EvalD0(U: number): gp_Pnt;

  EvalD1(U: number): Geom_Curve_ResD1;

  EvalD2(U: number): Geom_Curve_ResD2;

  EvalD3(U: number): Geom_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_TBezierCurve: declare class GeomEval_TBezierCurve extends Geom_BoundedCurve

  constructor

  Poles(): NCollection_Array1_gp_Pnt;

  Weights(): NCollection_Array1_double;

  Alpha(): number;

  NbPoles(): number;

  Order(): number;

  IsRational(): boolean;

  StartPoint(): gp_Pnt;

  EndPoint(): gp_Pnt;

  Reverse(): void;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EvalD0(U: number): gp_Pnt;

  EvalD1(U: number): Geom_Curve_ResD1;

  EvalD2(U: number): Geom_Curve_ResD2;

  EvalD3(U: number): Geom_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GeomEval_TBezierSurface: declare class GeomEval_TBezierSurface extends Geom_BoundedSurface

  constructor

  Poles(): NCollection_Array2_gp_Pnt;

  Weights(): NCollection_Array2_double;

  AlphaU(): number;

  AlphaV(): number;

  NbUPoles(): number;

  NbVPoles(): number;

  OrderU(): number;

  OrderV(): number;

  IsRational(): boolean;

  UReverse(): void;

  UReversedParameter(U: number): number;

  VReverse(): void;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  Continuity(): GeomAbs_Shape;

  IsCNu(N: number): boolean;

  IsCNv(N: number): boolean;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
