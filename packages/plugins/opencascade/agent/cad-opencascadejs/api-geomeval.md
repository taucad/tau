# libcascade — GeomEval

26 top-level symbols. Signatures are verbatim typescript.

GeomEval_AHTBezierCurve: declare class GeomEval_AHTBezierCurve extends Geom_BoundedCurve

  // GeomEval_AHTBezierCurve.constructor (constructor)
  constructor(thePoles: NCollection_Array1_gp_Pnt, theAlgDegree: number, theAlpha: number, theBeta: number);
  constructor(thePoles: NCollection_Array1_gp_Pnt, theWeights: NCollection_Array1_double, theAlgDegree: number, theAlpha: number, theBeta: number);

  // GeomEval_AHTBezierCurve.Poles (method)
  Poles(): NCollection_Array1_gp_Pnt;

  // GeomEval_AHTBezierCurve.Weights (method)
  Weights(): NCollection_Array1_double;

  // GeomEval_AHTBezierCurve.AlgDegree (method)
  AlgDegree(): number;

  // GeomEval_AHTBezierCurve.Alpha (method)
  Alpha(): number;

  // GeomEval_AHTBezierCurve.Beta (method)
  Beta(): number;

  // GeomEval_AHTBezierCurve.NbPoles (method)
  NbPoles(): number;

  // GeomEval_AHTBezierCurve.IsRational (method)
  IsRational(): boolean;

  // GeomEval_AHTBezierCurve.StartPoint (method)
  StartPoint(): gp_Pnt;

  // GeomEval_AHTBezierCurve.EndPoint (method)
  EndPoint(): gp_Pnt;

  // GeomEval_AHTBezierCurve.Reverse (method)
  Reverse(): void;

  // GeomEval_AHTBezierCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // GeomEval_AHTBezierCurve.FirstParameter (method)
  FirstParameter(): number;

  // GeomEval_AHTBezierCurve.LastParameter (method)
  LastParameter(): number;

  // GeomEval_AHTBezierCurve.IsClosed (method)
  IsClosed(): boolean;

  // GeomEval_AHTBezierCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // GeomEval_AHTBezierCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomEval_AHTBezierCurve.IsCN (method)
  IsCN(N: number): boolean;

  // GeomEval_AHTBezierCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // GeomEval_AHTBezierCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // GeomEval_AHTBezierCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // GeomEval_AHTBezierCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // GeomEval_AHTBezierCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // GeomEval_AHTBezierCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_AHTBezierCurve.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_AHTBezierCurve.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_AHTBezierCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_AHTBezierCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_AHTBezierCurve.delete (method)
  delete(): void;

  // GeomEval_AHTBezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_AHTBezierSurface: declare class GeomEval_AHTBezierSurface extends Geom_BoundedSurface

  // GeomEval_AHTBezierSurface.constructor (constructor)
  constructor(thePoles: NCollection_Array2_gp_Pnt, theAlgDegreeU: number, theAlgDegreeV: number, theAlphaU: number, theAlphaV: number, theBetaU: number, theBetaV: number);
  constructor(thePoles: NCollection_Array2_gp_Pnt, theWeights: NCollection_Array2_double, theAlgDegreeU: number, theAlgDegreeV: number, theAlphaU: number, theAlphaV: number, theBetaU: number, theBetaV: number);

  // GeomEval_AHTBezierSurface.Poles (method)
  Poles(): NCollection_Array2_gp_Pnt;

  // GeomEval_AHTBezierSurface.Weights (method)
  Weights(): NCollection_Array2_double;

  // GeomEval_AHTBezierSurface.AlgDegreeU (method)
  AlgDegreeU(): number;

  // GeomEval_AHTBezierSurface.AlgDegreeV (method)
  AlgDegreeV(): number;

  // GeomEval_AHTBezierSurface.AlphaU (method)
  AlphaU(): number;

  // GeomEval_AHTBezierSurface.AlphaV (method)
  AlphaV(): number;

  // GeomEval_AHTBezierSurface.BetaU (method)
  BetaU(): number;

  // GeomEval_AHTBezierSurface.BetaV (method)
  BetaV(): number;

  // GeomEval_AHTBezierSurface.NbPolesU (method)
  NbPolesU(): number;

  // GeomEval_AHTBezierSurface.NbPolesV (method)
  NbPolesV(): number;

  // GeomEval_AHTBezierSurface.IsURational (method)
  IsURational(): boolean;

  // GeomEval_AHTBezierSurface.IsVRational (method)
  IsVRational(): boolean;

  // GeomEval_AHTBezierSurface.UReverse (method)
  UReverse(): void;

  // GeomEval_AHTBezierSurface.VReverse (method)
  VReverse(): void;

  // GeomEval_AHTBezierSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // GeomEval_AHTBezierSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // GeomEval_AHTBezierSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // GeomEval_AHTBezierSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomEval_AHTBezierSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomEval_AHTBezierSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomEval_AHTBezierSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomEval_AHTBezierSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // GeomEval_AHTBezierSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // GeomEval_AHTBezierSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomEval_AHTBezierSurface.IsCNu (method)
  IsCNu(N: number): boolean;

  // GeomEval_AHTBezierSurface.IsCNv (method)
  IsCNv(N: number): boolean;

  // GeomEval_AHTBezierSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // GeomEval_AHTBezierSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // GeomEval_AHTBezierSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // GeomEval_AHTBezierSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // GeomEval_AHTBezierSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // GeomEval_AHTBezierSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_AHTBezierSurface.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_AHTBezierSurface.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_AHTBezierSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_AHTBezierSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_AHTBezierSurface.delete (method)
  delete(): void;

  // GeomEval_AHTBezierSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_CircularHelicoidSurface: declare class GeomEval_CircularHelicoidSurface extends Geom_ElementarySurface

  // GeomEval_CircularHelicoidSurface.constructor (constructor)
  constructor(thePosition: gp_Ax3, thePitch: number);

  // GeomEval_CircularHelicoidSurface.Pitch (method)
  Pitch(): number;

  // GeomEval_CircularHelicoidSurface.SetPitch (method)
  SetPitch(thePitch: number): void;

  // GeomEval_CircularHelicoidSurface.UReverse (method)
  UReverse(): void;

  // GeomEval_CircularHelicoidSurface.VReverse (method)
  VReverse(): void;

  // GeomEval_CircularHelicoidSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // GeomEval_CircularHelicoidSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // GeomEval_CircularHelicoidSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // GeomEval_CircularHelicoidSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomEval_CircularHelicoidSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomEval_CircularHelicoidSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomEval_CircularHelicoidSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomEval_CircularHelicoidSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // GeomEval_CircularHelicoidSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // GeomEval_CircularHelicoidSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // GeomEval_CircularHelicoidSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // GeomEval_CircularHelicoidSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // GeomEval_CircularHelicoidSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // GeomEval_CircularHelicoidSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // GeomEval_CircularHelicoidSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_CircularHelicoidSurface.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_CircularHelicoidSurface.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_CircularHelicoidSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_CircularHelicoidSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_CircularHelicoidSurface.delete (method)
  delete(): void;

  // GeomEval_CircularHelicoidSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_CircularHelixCurve: declare class GeomEval_CircularHelixCurve extends Geom_Curve

  // GeomEval_CircularHelixCurve.constructor (constructor)
  constructor(thePosition: gp_Ax2, theRadius: number, thePitch: number);

  // GeomEval_CircularHelixCurve.Position (method)
  Position(): gp_Ax2;

  // GeomEval_CircularHelixCurve.Radius (method)
  Radius(): number;

  // GeomEval_CircularHelixCurve.Pitch (method)
  Pitch(): number;

  // GeomEval_CircularHelixCurve.Reverse (method)
  Reverse(): void;

  // GeomEval_CircularHelixCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // GeomEval_CircularHelixCurve.FirstParameter (method)
  FirstParameter(): number;

  // GeomEval_CircularHelixCurve.LastParameter (method)
  LastParameter(): number;

  // GeomEval_CircularHelixCurve.IsClosed (method)
  IsClosed(): boolean;

  // GeomEval_CircularHelixCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // GeomEval_CircularHelixCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomEval_CircularHelixCurve.IsCN (method)
  IsCN(N: number): boolean;

  // GeomEval_CircularHelixCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // GeomEval_CircularHelixCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // GeomEval_CircularHelixCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // GeomEval_CircularHelixCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // GeomEval_CircularHelixCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // GeomEval_CircularHelixCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_CircularHelixCurve.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_CircularHelixCurve.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_CircularHelixCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_CircularHelixCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_CircularHelixCurve.delete (method)
  delete(): void;

  // GeomEval_CircularHelixCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_EllipsoidSurface: declare class GeomEval_EllipsoidSurface extends Geom_ElementarySurface

  // GeomEval_EllipsoidSurface.constructor (constructor)
  constructor(thePosition: gp_Ax3, theA: number, theB: number, theC: number);

  // GeomEval_EllipsoidSurface.SemiAxisA (method)
  SemiAxisA(): number;

  // GeomEval_EllipsoidSurface.SemiAxisB (method)
  SemiAxisB(): number;

  // GeomEval_EllipsoidSurface.SemiAxisC (method)
  SemiAxisC(): number;

  // GeomEval_EllipsoidSurface.SetSemiAxisA (method)
  SetSemiAxisA(theA: number): void;

  // GeomEval_EllipsoidSurface.SetSemiAxisB (method)
  SetSemiAxisB(theB: number): void;

  // GeomEval_EllipsoidSurface.SetSemiAxisC (method)
  SetSemiAxisC(theC: number): void;

  // GeomEval_EllipsoidSurface.UReverse (method)
  UReverse(): void;

  // GeomEval_EllipsoidSurface.VReverse (method)
  VReverse(): void;

  // GeomEval_EllipsoidSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // GeomEval_EllipsoidSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // GeomEval_EllipsoidSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // GeomEval_EllipsoidSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomEval_EllipsoidSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomEval_EllipsoidSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomEval_EllipsoidSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomEval_EllipsoidSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // GeomEval_EllipsoidSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // GeomEval_EllipsoidSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // GeomEval_EllipsoidSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // GeomEval_EllipsoidSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // GeomEval_EllipsoidSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // GeomEval_EllipsoidSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // GeomEval_EllipsoidSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_EllipsoidSurface.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_EllipsoidSurface.Coefficients (method)
  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  // GeomEval_EllipsoidSurface.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_EllipsoidSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_EllipsoidSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_EllipsoidSurface.delete (method)
  delete(): void;

  // GeomEval_EllipsoidSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_HypParaboloidSurface: declare class GeomEval_HypParaboloidSurface extends Geom_ElementarySurface

  // GeomEval_HypParaboloidSurface.constructor (constructor)
  constructor(thePosition: gp_Ax3, theA: number, theB: number);

  // GeomEval_HypParaboloidSurface.SemiAxisA (method)
  SemiAxisA(): number;

  // GeomEval_HypParaboloidSurface.SemiAxisB (method)
  SemiAxisB(): number;

  // GeomEval_HypParaboloidSurface.SetSemiAxisA (method)
  SetSemiAxisA(theA: number): void;

  // GeomEval_HypParaboloidSurface.SetSemiAxisB (method)
  SetSemiAxisB(theB: number): void;

  // GeomEval_HypParaboloidSurface.UReverse (method)
  UReverse(): void;

  // GeomEval_HypParaboloidSurface.VReverse (method)
  VReverse(): void;

  // GeomEval_HypParaboloidSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // GeomEval_HypParaboloidSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // GeomEval_HypParaboloidSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // GeomEval_HypParaboloidSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomEval_HypParaboloidSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomEval_HypParaboloidSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomEval_HypParaboloidSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomEval_HypParaboloidSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // GeomEval_HypParaboloidSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // GeomEval_HypParaboloidSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // GeomEval_HypParaboloidSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // GeomEval_HypParaboloidSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // GeomEval_HypParaboloidSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // GeomEval_HypParaboloidSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // GeomEval_HypParaboloidSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_HypParaboloidSurface.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_HypParaboloidSurface.Coefficients (method)
  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  // GeomEval_HypParaboloidSurface.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_HypParaboloidSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_HypParaboloidSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_HypParaboloidSurface.delete (method)
  delete(): void;

  // GeomEval_HypParaboloidSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_HyperboloidSurface: declare class GeomEval_HyperboloidSurface extends Geom_ElementarySurface

  // GeomEval_HyperboloidSurface.constructor (constructor)
  constructor(thePosition: gp_Ax3, theR1: number, theR2: number, theMode?: GeomEval_HyperboloidSurface_SheetMode);

  // GeomEval_HyperboloidSurface.R1 (method)
  R1(): number;

  // GeomEval_HyperboloidSurface.R2 (method)
  R2(): number;

  // GeomEval_HyperboloidSurface.Mode (method)
  Mode(): GeomEval_HyperboloidSurface_SheetMode;

  // GeomEval_HyperboloidSurface.SetR1 (method)
  SetR1(theR1: number): void;

  // GeomEval_HyperboloidSurface.SetR2 (method)
  SetR2(theR2: number): void;

  // GeomEval_HyperboloidSurface.SetMode (method)
  SetMode(theMode: GeomEval_HyperboloidSurface_SheetMode): void;

  // GeomEval_HyperboloidSurface.UReverse (method)
  UReverse(): void;

  // GeomEval_HyperboloidSurface.VReverse (method)
  VReverse(): void;

  // GeomEval_HyperboloidSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // GeomEval_HyperboloidSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // GeomEval_HyperboloidSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // GeomEval_HyperboloidSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomEval_HyperboloidSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomEval_HyperboloidSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomEval_HyperboloidSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomEval_HyperboloidSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // GeomEval_HyperboloidSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // GeomEval_HyperboloidSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // GeomEval_HyperboloidSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // GeomEval_HyperboloidSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // GeomEval_HyperboloidSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // GeomEval_HyperboloidSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // GeomEval_HyperboloidSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_HyperboloidSurface.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_HyperboloidSurface.Coefficients (method)
  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  // GeomEval_HyperboloidSurface.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_HyperboloidSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_HyperboloidSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_HyperboloidSurface.delete (method)
  delete(): void;

  // GeomEval_HyperboloidSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_HyperboloidSurface_SheetMode: typeof GeomEval_HyperboloidSurface_SheetMode[keyof typeof GeomEval_HyperboloidSurface_SheetMode]

  readonly OneSheet: 'OneSheet'

  readonly TwoSheets: 'TwoSheets'

GeomEval_ParaboloidSurface: declare class GeomEval_ParaboloidSurface extends Geom_ElementarySurface

  // GeomEval_ParaboloidSurface.constructor (constructor)
  constructor(thePosition: gp_Ax3, theFocal: number);

  // GeomEval_ParaboloidSurface.Focal (method)
  Focal(): number;

  // GeomEval_ParaboloidSurface.SetFocal (method)
  SetFocal(theFocal: number): void;

  // GeomEval_ParaboloidSurface.UReverse (method)
  UReverse(): void;

  // GeomEval_ParaboloidSurface.VReverse (method)
  VReverse(): void;

  // GeomEval_ParaboloidSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // GeomEval_ParaboloidSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // GeomEval_ParaboloidSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // GeomEval_ParaboloidSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomEval_ParaboloidSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomEval_ParaboloidSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomEval_ParaboloidSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomEval_ParaboloidSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // GeomEval_ParaboloidSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // GeomEval_ParaboloidSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // GeomEval_ParaboloidSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // GeomEval_ParaboloidSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // GeomEval_ParaboloidSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // GeomEval_ParaboloidSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // GeomEval_ParaboloidSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_ParaboloidSurface.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_ParaboloidSurface.Coefficients (method)
  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  // GeomEval_ParaboloidSurface.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_ParaboloidSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_ParaboloidSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_ParaboloidSurface.delete (method)
  delete(): void;

  // GeomEval_ParaboloidSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Base: declare class GeomEval_RepCurveDesc_Base extends Standard_Transient

  Representation: Geom_Curve

  // GeomEval_RepCurveDesc_Base.GetKind (method)
  GetKind(): GeomEval_RepCurveDesc_Base_Kind;

  // GeomEval_RepCurveDesc_Base.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_RepCurveDesc_Base.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_RepCurveDesc_Base.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_RepCurveDesc_Base.delete (method)
  delete(): void;

  // GeomEval_RepCurveDesc_Base.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Base_Kind: typeof GeomEval_RepCurveDesc_Base_Kind[keyof typeof GeomEval_RepCurveDesc_Base_Kind]

  readonly Full: 'Full'

  readonly DerivBounded: 'DerivBounded'

  readonly Mapped: 'Mapped'

GeomEval_RepCurveDesc_DerivBounded: declare class GeomEval_RepCurveDesc_DerivBounded extends GeomEval_RepCurveDesc_Base

  // GeomEval_RepCurveDesc_DerivBounded.constructor (constructor)
  constructor();

  MaxDerivOrder: number

  // GeomEval_RepCurveDesc_DerivBounded.GetKind (method)
  GetKind(): GeomEval_RepCurveDesc_Base_Kind;

  // GeomEval_RepCurveDesc_DerivBounded.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_RepCurveDesc_DerivBounded.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_RepCurveDesc_DerivBounded.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_RepCurveDesc_DerivBounded.delete (method)
  delete(): void;

  // GeomEval_RepCurveDesc_DerivBounded.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Domain1d: declare class GeomEval_RepCurveDesc_Domain1d

  // GeomEval_RepCurveDesc_Domain1d.constructor (constructor)
  constructor();

  First: number

  Last: number

  // GeomEval_RepCurveDesc_Domain1d.Contains (method)
  Contains(theU: number): boolean;

  // GeomEval_RepCurveDesc_Domain1d.delete (method)
  delete(): void;

  // GeomEval_RepCurveDesc_Domain1d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Full: declare class GeomEval_RepCurveDesc_Full extends GeomEval_RepCurveDesc_Base

  // GeomEval_RepCurveDesc_Full.constructor (constructor)
  constructor();

  // GeomEval_RepCurveDesc_Full.GetKind (method)
  GetKind(): GeomEval_RepCurveDesc_Base_Kind;

  // GeomEval_RepCurveDesc_Full.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_RepCurveDesc_Full.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_RepCurveDesc_Full.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_RepCurveDesc_Full.delete (method)
  delete(): void;

  // GeomEval_RepCurveDesc_Full.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Map1d: declare class GeomEval_RepCurveDesc_Map1d

  // GeomEval_RepCurveDesc_Map1d.constructor (constructor)
  constructor();

  Scale: number

  Offset: number

  // GeomEval_RepCurveDesc_Map1d.IsIdentity (method)
  IsIdentity(): boolean;

  // GeomEval_RepCurveDesc_Map1d.IsValid (method)
  IsValid(): boolean;

  // GeomEval_RepCurveDesc_Map1d.Map (method)
  Map(theU: number): number;

  // GeomEval_RepCurveDesc_Map1d.delete (method)
  delete(): void;

  // GeomEval_RepCurveDesc_Map1d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepCurveDesc_Mapped: declare class GeomEval_RepCurveDesc_Mapped extends GeomEval_RepCurveDesc_Base

  // GeomEval_RepCurveDesc_Mapped.constructor (constructor)
  constructor();

  MaxDerivOrder: number

  Domain: GeomEval_RepCurveDesc_Domain1d | null | undefined

  ParamMap: GeomEval_RepCurveDesc_Map1d

  // GeomEval_RepCurveDesc_Mapped.GetKind (method)
  GetKind(): GeomEval_RepCurveDesc_Base_Kind;

  // GeomEval_RepCurveDesc_Mapped.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_RepCurveDesc_Mapped.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_RepCurveDesc_Mapped.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_RepCurveDesc_Mapped.delete (method)
  delete(): void;

  // GeomEval_RepCurveDesc_Mapped.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Base: declare class GeomEval_RepSurfaceDesc_Base extends Standard_Transient

  Representation: Geom_Surface

  // GeomEval_RepSurfaceDesc_Base.GetKind (method)
  GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

  // GeomEval_RepSurfaceDesc_Base.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_RepSurfaceDesc_Base.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_RepSurfaceDesc_Base.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_RepSurfaceDesc_Base.delete (method)
  delete(): void;

  // GeomEval_RepSurfaceDesc_Base.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Base_Kind: typeof GeomEval_RepSurfaceDesc_Base_Kind[keyof typeof GeomEval_RepSurfaceDesc_Base_Kind]

  readonly Full: 'Full'

  readonly DerivBounded: 'DerivBounded'

  readonly Mapped: 'Mapped'

GeomEval_RepSurfaceDesc_DerivBounded: declare class GeomEval_RepSurfaceDesc_DerivBounded extends GeomEval_RepSurfaceDesc_Base

  // GeomEval_RepSurfaceDesc_DerivBounded.constructor (constructor)
  constructor();

  MaxDerivOrder: number

  // GeomEval_RepSurfaceDesc_DerivBounded.GetKind (method)
  GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

  // GeomEval_RepSurfaceDesc_DerivBounded.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_RepSurfaceDesc_DerivBounded.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_RepSurfaceDesc_DerivBounded.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_RepSurfaceDesc_DerivBounded.delete (method)
  delete(): void;

  // GeomEval_RepSurfaceDesc_DerivBounded.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Domain2d: declare class GeomEval_RepSurfaceDesc_Domain2d

  // GeomEval_RepSurfaceDesc_Domain2d.constructor (constructor)
  constructor();

  UFirst: number

  ULast: number

  VFirst: number

  VLast: number

  // GeomEval_RepSurfaceDesc_Domain2d.Contains (method)
  Contains(theU: number, theV: number): boolean;

  // GeomEval_RepSurfaceDesc_Domain2d.delete (method)
  delete(): void;

  // GeomEval_RepSurfaceDesc_Domain2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Full: declare class GeomEval_RepSurfaceDesc_Full extends GeomEval_RepSurfaceDesc_Base

  // GeomEval_RepSurfaceDesc_Full.constructor (constructor)
  constructor();

  // GeomEval_RepSurfaceDesc_Full.GetKind (method)
  GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

  // GeomEval_RepSurfaceDesc_Full.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_RepSurfaceDesc_Full.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_RepSurfaceDesc_Full.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_RepSurfaceDesc_Full.delete (method)
  delete(): void;

  // GeomEval_RepSurfaceDesc_Full.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Map2d: declare class GeomEval_RepSurfaceDesc_Map2d

  // GeomEval_RepSurfaceDesc_Map2d.constructor (constructor)
  constructor();

  ScaleU: number

  OffsetU: number

  ScaleV: number

  OffsetV: number

  SwapUV: boolean

  // GeomEval_RepSurfaceDesc_Map2d.IsIdentity (method)
  IsIdentity(): boolean;

  // GeomEval_RepSurfaceDesc_Map2d.IsValid (method)
  IsValid(): boolean;

  // GeomEval_RepSurfaceDesc_Map2d.Map (method)
  Map(theU: number, theV: number, theURep?: number, theVRep?: number): { theURep: number; theVRep: number };

  // GeomEval_RepSurfaceDesc_Map2d.delete (method)
  delete(): void;

  // GeomEval_RepSurfaceDesc_Map2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_RepSurfaceDesc_Mapped: declare class GeomEval_RepSurfaceDesc_Mapped extends GeomEval_RepSurfaceDesc_Base

  // GeomEval_RepSurfaceDesc_Mapped.constructor (constructor)
  constructor();

  MaxDerivOrder: number

  Domain: GeomEval_RepSurfaceDesc_Domain2d | null | undefined

  ParamMap: GeomEval_RepSurfaceDesc_Map2d

  // GeomEval_RepSurfaceDesc_Mapped.GetKind (method)
  GetKind(): GeomEval_RepSurfaceDesc_Base_Kind;

  // GeomEval_RepSurfaceDesc_Mapped.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_RepSurfaceDesc_Mapped.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_RepSurfaceDesc_Mapped.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_RepSurfaceDesc_Mapped.delete (method)
  delete(): void;

  // GeomEval_RepSurfaceDesc_Mapped.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_SineWaveCurve: declare class GeomEval_SineWaveCurve extends Geom_Curve

  // GeomEval_SineWaveCurve.constructor (constructor)
  constructor(thePosition: gp_Ax2, theAmplitude: number, theOmega: number, thePhase?: number);

  // GeomEval_SineWaveCurve.Position (method)
  Position(): gp_Ax2;

  // GeomEval_SineWaveCurve.Amplitude (method)
  Amplitude(): number;

  // GeomEval_SineWaveCurve.Omega (method)
  Omega(): number;

  // GeomEval_SineWaveCurve.Phase (method)
  Phase(): number;

  // GeomEval_SineWaveCurve.Reverse (method)
  Reverse(): void;

  // GeomEval_SineWaveCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // GeomEval_SineWaveCurve.FirstParameter (method)
  FirstParameter(): number;

  // GeomEval_SineWaveCurve.LastParameter (method)
  LastParameter(): number;

  // GeomEval_SineWaveCurve.IsClosed (method)
  IsClosed(): boolean;

  // GeomEval_SineWaveCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // GeomEval_SineWaveCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomEval_SineWaveCurve.IsCN (method)
  IsCN(N: number): boolean;

  // GeomEval_SineWaveCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // GeomEval_SineWaveCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // GeomEval_SineWaveCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // GeomEval_SineWaveCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // GeomEval_SineWaveCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // GeomEval_SineWaveCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_SineWaveCurve.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_SineWaveCurve.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_SineWaveCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_SineWaveCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_SineWaveCurve.delete (method)
  delete(): void;

  // GeomEval_SineWaveCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_TBezierCurve: declare class GeomEval_TBezierCurve extends Geom_BoundedCurve

  // GeomEval_TBezierCurve.constructor (constructor)
  constructor(thePoles: NCollection_Array1_gp_Pnt, theAlpha: number);
  constructor(thePoles: NCollection_Array1_gp_Pnt, theWeights: NCollection_Array1_double, theAlpha: number);

  // GeomEval_TBezierCurve.Poles (method)
  Poles(): NCollection_Array1_gp_Pnt;

  // GeomEval_TBezierCurve.Weights (method)
  Weights(): NCollection_Array1_double;

  // GeomEval_TBezierCurve.Alpha (method)
  Alpha(): number;

  // GeomEval_TBezierCurve.NbPoles (method)
  NbPoles(): number;

  // GeomEval_TBezierCurve.Order (method)
  Order(): number;

  // GeomEval_TBezierCurve.IsRational (method)
  IsRational(): boolean;

  // GeomEval_TBezierCurve.StartPoint (method)
  StartPoint(): gp_Pnt;

  // GeomEval_TBezierCurve.EndPoint (method)
  EndPoint(): gp_Pnt;

  // GeomEval_TBezierCurve.Reverse (method)
  Reverse(): void;

  // GeomEval_TBezierCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // GeomEval_TBezierCurve.FirstParameter (method)
  FirstParameter(): number;

  // GeomEval_TBezierCurve.LastParameter (method)
  LastParameter(): number;

  // GeomEval_TBezierCurve.IsClosed (method)
  IsClosed(): boolean;

  // GeomEval_TBezierCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // GeomEval_TBezierCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomEval_TBezierCurve.IsCN (method)
  IsCN(N: number): boolean;

  // GeomEval_TBezierCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // GeomEval_TBezierCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // GeomEval_TBezierCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // GeomEval_TBezierCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // GeomEval_TBezierCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // GeomEval_TBezierCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_TBezierCurve.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_TBezierCurve.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_TBezierCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_TBezierCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_TBezierCurve.delete (method)
  delete(): void;

  // GeomEval_TBezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomEval_TBezierSurface: declare class GeomEval_TBezierSurface extends Geom_BoundedSurface

  // GeomEval_TBezierSurface.constructor (constructor)
  constructor(thePoles: NCollection_Array2_gp_Pnt, theAlphaU: number, theAlphaV: number);
  constructor(thePoles: NCollection_Array2_gp_Pnt, theWeights: NCollection_Array2_double, theAlphaU: number, theAlphaV: number);

  // GeomEval_TBezierSurface.Poles (method)
  Poles(): NCollection_Array2_gp_Pnt;

  // GeomEval_TBezierSurface.Weights (method)
  Weights(): NCollection_Array2_double;

  // GeomEval_TBezierSurface.AlphaU (method)
  AlphaU(): number;

  // GeomEval_TBezierSurface.AlphaV (method)
  AlphaV(): number;

  // GeomEval_TBezierSurface.NbUPoles (method)
  NbUPoles(): number;

  // GeomEval_TBezierSurface.NbVPoles (method)
  NbVPoles(): number;

  // GeomEval_TBezierSurface.OrderU (method)
  OrderU(): number;

  // GeomEval_TBezierSurface.OrderV (method)
  OrderV(): number;

  // GeomEval_TBezierSurface.IsRational (method)
  IsRational(): boolean;

  // GeomEval_TBezierSurface.UReverse (method)
  UReverse(): void;

  // GeomEval_TBezierSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // GeomEval_TBezierSurface.VReverse (method)
  VReverse(): void;

  // GeomEval_TBezierSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // GeomEval_TBezierSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // GeomEval_TBezierSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // GeomEval_TBezierSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // GeomEval_TBezierSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // GeomEval_TBezierSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // GeomEval_TBezierSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // GeomEval_TBezierSurface.IsCNu (method)
  IsCNu(N: number): boolean;

  // GeomEval_TBezierSurface.IsCNv (method)
  IsCNv(N: number): boolean;

  // GeomEval_TBezierSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // GeomEval_TBezierSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // GeomEval_TBezierSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // GeomEval_TBezierSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // GeomEval_TBezierSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // GeomEval_TBezierSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // GeomEval_TBezierSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // GeomEval_TBezierSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // GeomEval_TBezierSurface.Copy (method)
  Copy(): Geom_Geometry;

  // GeomEval_TBezierSurface.get_type_name (method)
  static get_type_name(): string;

  // GeomEval_TBezierSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GeomEval_TBezierSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // GeomEval_TBezierSurface.delete (method)
  delete(): void;

  // GeomEval_TBezierSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
