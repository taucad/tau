# libcascade — Geom (3)

19 top-level symbols. Signatures are verbatim typescript.

Geom_RectangularTrimmedSurface: declare class Geom_RectangularTrimmedSurface extends Geom_BoundedSurface

  // Geom_RectangularTrimmedSurface.constructor (constructor)
  constructor(S: Geom_Surface, Param1: number, Param2: number, UTrim: boolean, Sense?: boolean);
  constructor(S: Geom_Surface, U1: number, U2: number, V1: number, V2: number, USense?: boolean, VSense?: boolean);

  // Geom_RectangularTrimmedSurface.SetTrim (method)
  SetTrim(U1: number, U2: number, V1: number, V2: number, USense: boolean, VSense: boolean): void;
  SetTrim(Param1: number, Param2: number, UTrim: boolean, Sense: boolean): void;

  // Geom_RectangularTrimmedSurface.BasisSurface (method)
  BasisSurface(): Geom_Surface;

  // Geom_RectangularTrimmedSurface.UReverse (method)
  UReverse(): void;

  // Geom_RectangularTrimmedSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_RectangularTrimmedSurface.VReverse (method)
  VReverse(): void;

  // Geom_RectangularTrimmedSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_RectangularTrimmedSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_RectangularTrimmedSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_RectangularTrimmedSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_RectangularTrimmedSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_RectangularTrimmedSurface.IsCNu (method)
  IsCNu(N: number): boolean;

  // Geom_RectangularTrimmedSurface.IsCNv (method)
  IsCNv(N: number): boolean;

  // Geom_RectangularTrimmedSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_RectangularTrimmedSurface.UPeriod (method)
  UPeriod(): number;

  // Geom_RectangularTrimmedSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_RectangularTrimmedSurface.VPeriod (method)
  VPeriod(): number;

  // Geom_RectangularTrimmedSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_RectangularTrimmedSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_RectangularTrimmedSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_RectangularTrimmedSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_RectangularTrimmedSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_RectangularTrimmedSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_RectangularTrimmedSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_RectangularTrimmedSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_RectangularTrimmedSurface.TransformParameters (method)
  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  // Geom_RectangularTrimmedSurface.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  // Geom_RectangularTrimmedSurface.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_RectangularTrimmedSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_RectangularTrimmedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_RectangularTrimmedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_RectangularTrimmedSurface.delete (method)
  delete(): void;

  // Geom_RectangularTrimmedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_SphericalSurface: declare class Geom_SphericalSurface extends Geom_ElementarySurface

  // Geom_SphericalSurface.constructor (constructor)
  constructor(S: gp_Sphere);
  constructor(A3: gp_Ax3, Radius: number);

  // Geom_SphericalSurface.SetRadius (method)
  SetRadius(R: number): void;

  // Geom_SphericalSurface.SetSphere (method)
  SetSphere(S: gp_Sphere): void;

  // Geom_SphericalSurface.Sphere (method)
  Sphere(): gp_Sphere;

  // Geom_SphericalSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_SphericalSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_SphericalSurface.Area (method)
  Area(): number;

  // Geom_SphericalSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_SphericalSurface.Coefficients (method)
  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  // Geom_SphericalSurface.Radius (method)
  Radius(): number;

  // Geom_SphericalSurface.Volume (method)
  Volume(): number;

  // Geom_SphericalSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_SphericalSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_SphericalSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_SphericalSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_SphericalSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_SphericalSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_SphericalSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_SphericalSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_SphericalSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_SphericalSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_SphericalSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_SphericalSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_SphericalSurface.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_SphericalSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_SphericalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_SphericalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_SphericalSurface.delete (method)
  delete(): void;

  // Geom_SphericalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Surface: declare class Geom_Surface extends Geom_Geometry

  // Geom_Surface.UReverse (method)
  UReverse(): void;

  // Geom_Surface.UReversed (method)
  UReversed(): Geom_Surface;

  // Geom_Surface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_Surface.VReverse (method)
  VReverse(): void;

  // Geom_Surface.VReversed (method)
  VReversed(): Geom_Surface;

  // Geom_Surface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_Surface.TransformParameters (method)
  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  // Geom_Surface.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  // Geom_Surface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_Surface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_Surface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_Surface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_Surface.UPeriod (method)
  UPeriod(): number;

  // Geom_Surface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_Surface.VPeriod (method)
  VPeriod(): number;

  // Geom_Surface.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_Surface.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_Surface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_Surface.IsCNu (method)
  IsCNu(N: number): boolean;

  // Geom_Surface.IsCNv (method)
  IsCNv(N: number): boolean;

  // Geom_Surface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_Surface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_Surface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_Surface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_Surface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_Surface.D0 (method)
  D0(U: number, V: number, P: gp_Pnt): void;

  // Geom_Surface.D1 (method)
  D1(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

  // Geom_Surface.D2 (method)
  D2(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;

  // Geom_Surface.D3 (method)
  D3(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;

  // Geom_Surface.DN (method)
  DN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_Surface.Value (method)
  Value(U: number, V: number): gp_Pnt;

  // Geom_Surface.get_type_name (method)
  static get_type_name(): string;

  // Geom_Surface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Surface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Surface.delete (method)
  delete(): void;

  // Geom_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_SurfaceOfLinearExtrusion: declare class Geom_SurfaceOfLinearExtrusion extends Geom_SweptSurface

  // Geom_SurfaceOfLinearExtrusion.constructor (constructor)
  constructor(C: Geom_Curve, V: gp_Dir);

  // Geom_SurfaceOfLinearExtrusion.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom_SurfaceOfLinearExtrusion.EvalRepresentation (method)
  EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

  // Geom_SurfaceOfLinearExtrusion.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

  // Geom_SurfaceOfLinearExtrusion.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom_SurfaceOfLinearExtrusion.SetDirection (method)
  SetDirection(V: gp_Dir): void;

  // Geom_SurfaceOfLinearExtrusion.SetBasisCurve (method)
  SetBasisCurve(C: Geom_Curve): void;

  // Geom_SurfaceOfLinearExtrusion.UReverse (method)
  UReverse(): void;

  // Geom_SurfaceOfLinearExtrusion.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_SurfaceOfLinearExtrusion.VReverse (method)
  VReverse(): void;

  // Geom_SurfaceOfLinearExtrusion.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_SurfaceOfLinearExtrusion.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_SurfaceOfLinearExtrusion.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_SurfaceOfLinearExtrusion.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_SurfaceOfLinearExtrusion.IsCNu (method)
  IsCNu(N: number): boolean;

  // Geom_SurfaceOfLinearExtrusion.IsCNv (method)
  IsCNv(N: number): boolean;

  // Geom_SurfaceOfLinearExtrusion.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_SurfaceOfLinearExtrusion.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_SurfaceOfLinearExtrusion.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_SurfaceOfLinearExtrusion.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_SurfaceOfLinearExtrusion.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_SurfaceOfLinearExtrusion.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_SurfaceOfLinearExtrusion.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_SurfaceOfLinearExtrusion.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_SurfaceOfLinearExtrusion.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_SurfaceOfLinearExtrusion.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_SurfaceOfLinearExtrusion.TransformParameters (method)
  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  // Geom_SurfaceOfLinearExtrusion.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  // Geom_SurfaceOfLinearExtrusion.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_SurfaceOfLinearExtrusion.get_type_name (method)
  static get_type_name(): string;

  // Geom_SurfaceOfLinearExtrusion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_SurfaceOfLinearExtrusion.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_SurfaceOfLinearExtrusion.delete (method)
  delete(): void;

  // Geom_SurfaceOfLinearExtrusion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_SurfaceOfRevolution: declare class Geom_SurfaceOfRevolution extends Geom_SweptSurface

  // Geom_SurfaceOfRevolution.constructor (constructor)
  constructor(C: Geom_Curve, A1: gp_Ax1);

  // Geom_SurfaceOfRevolution.HasEvalRepresentation (method)
  HasEvalRepresentation(): boolean;

  // Geom_SurfaceOfRevolution.EvalRepresentation (method)
  EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

  // Geom_SurfaceOfRevolution.SetEvalRepresentation (method)
  SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

  // Geom_SurfaceOfRevolution.ClearEvalRepresentation (method)
  ClearEvalRepresentation(): void;

  // Geom_SurfaceOfRevolution.SetAxis (method)
  SetAxis(A1: gp_Ax1): void;

  // Geom_SurfaceOfRevolution.SetDirection (method)
  SetDirection(V: gp_Dir): void;

  // Geom_SurfaceOfRevolution.SetBasisCurve (method)
  SetBasisCurve(C: Geom_Curve): void;

  // Geom_SurfaceOfRevolution.SetLocation (method)
  SetLocation(P: gp_Pnt): void;

  // Geom_SurfaceOfRevolution.Axis (method)
  Axis(): gp_Ax1;

  // Geom_SurfaceOfRevolution.Location (method)
  Location(): gp_Pnt;

  // Geom_SurfaceOfRevolution.ReferencePlane (method)
  ReferencePlane(): gp_Ax2;

  // Geom_SurfaceOfRevolution.UReverse (method)
  UReverse(): void;

  // Geom_SurfaceOfRevolution.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_SurfaceOfRevolution.VReverse (method)
  VReverse(): void;

  // Geom_SurfaceOfRevolution.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_SurfaceOfRevolution.TransformParameters (method)
  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  // Geom_SurfaceOfRevolution.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  // Geom_SurfaceOfRevolution.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_SurfaceOfRevolution.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_SurfaceOfRevolution.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_SurfaceOfRevolution.IsCNu (method)
  IsCNu(N: number): boolean;

  // Geom_SurfaceOfRevolution.IsCNv (method)
  IsCNv(N: number): boolean;

  // Geom_SurfaceOfRevolution.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_SurfaceOfRevolution.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_SurfaceOfRevolution.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_SurfaceOfRevolution.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_SurfaceOfRevolution.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_SurfaceOfRevolution.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_SurfaceOfRevolution.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_SurfaceOfRevolution.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_SurfaceOfRevolution.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_SurfaceOfRevolution.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_SurfaceOfRevolution.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_SurfaceOfRevolution.get_type_name (method)
  static get_type_name(): string;

  // Geom_SurfaceOfRevolution.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_SurfaceOfRevolution.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_SurfaceOfRevolution.delete (method)
  delete(): void;

  // Geom_SurfaceOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_SweptSurface: declare class Geom_SweptSurface extends Geom_Surface

  // Geom_SweptSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_SweptSurface.Direction (method)
  Direction(): gp_Dir;

  // Geom_SweptSurface.BasisCurve (method)
  BasisCurve(): Geom_Curve;

  // Geom_SweptSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_SweptSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_SweptSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_SweptSurface.delete (method)
  delete(): void;

  // Geom_SweptSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_ToroidalSurface: declare class Geom_ToroidalSurface extends Geom_ElementarySurface

  // Geom_ToroidalSurface.constructor (constructor)
  constructor(T: gp_Torus);
  constructor(A3: gp_Ax3, MajorRadius: number, MinorRadius: number);

  // Geom_ToroidalSurface.SetMajorRadius (method)
  SetMajorRadius(MajorRadius: number): void;

  // Geom_ToroidalSurface.SetMinorRadius (method)
  SetMinorRadius(MinorRadius: number): void;

  // Geom_ToroidalSurface.SetTorus (method)
  SetTorus(T: gp_Torus): void;

  // Geom_ToroidalSurface.Torus (method)
  Torus(): gp_Torus;

  // Geom_ToroidalSurface.UReversedParameter (method)
  UReversedParameter(U: number): number;

  // Geom_ToroidalSurface.VReversedParameter (method)
  VReversedParameter(V: number): number;

  // Geom_ToroidalSurface.Area (method)
  Area(): number;

  // Geom_ToroidalSurface.Bounds (method)
  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  // Geom_ToroidalSurface.Coefficients (method)
  Coefficients(Coef: NCollection_Array1_double): void;

  // Geom_ToroidalSurface.MajorRadius (method)
  MajorRadius(): number;

  // Geom_ToroidalSurface.MinorRadius (method)
  MinorRadius(): number;

  // Geom_ToroidalSurface.Volume (method)
  Volume(): number;

  // Geom_ToroidalSurface.IsUClosed (method)
  IsUClosed(): boolean;

  // Geom_ToroidalSurface.IsVClosed (method)
  IsVClosed(): boolean;

  // Geom_ToroidalSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Geom_ToroidalSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // Geom_ToroidalSurface.UIso (method)
  UIso(U: number): Geom_Curve;

  // Geom_ToroidalSurface.VIso (method)
  VIso(V: number): Geom_Curve;

  // Geom_ToroidalSurface.EvalD0 (method)
  EvalD0(U: number, V: number): gp_Pnt;

  // Geom_ToroidalSurface.EvalD1 (method)
  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  // Geom_ToroidalSurface.EvalD2 (method)
  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  // Geom_ToroidalSurface.EvalD3 (method)
  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  // Geom_ToroidalSurface.EvalDN (method)
  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  // Geom_ToroidalSurface.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_ToroidalSurface.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_ToroidalSurface.get_type_name (method)
  static get_type_name(): string;

  // Geom_ToroidalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_ToroidalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_ToroidalSurface.delete (method)
  delete(): void;

  // Geom_ToroidalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Transformation: declare class Geom_Transformation extends Standard_Transient

  // Geom_Transformation.constructor (constructor)
  constructor();
  constructor(T: gp_Trsf);

  // Geom_Transformation.get_type_name (method)
  static get_type_name(): string;

  // Geom_Transformation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Transformation.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Transformation.SetMirror (method)
  SetMirror(thePnt: gp_Pnt): void;
  SetMirror(theA1: gp_Ax1): void;
  SetMirror(theA2: gp_Ax2): void;

  // Geom_Transformation.SetRotation (method)
  SetRotation(theA1: gp_Ax1, theAng: number): void;

  // Geom_Transformation.SetScale (method)
  SetScale(thePnt: gp_Pnt, theScale: number): void;

  // Geom_Transformation.SetTransformation (method)
  SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
  SetTransformation(theToSystem: gp_Ax3): void;

  // Geom_Transformation.SetTranslation (method)
  SetTranslation(theVec: gp_Vec): void;
  SetTranslation(P1: gp_Pnt, P2: gp_Pnt): void;

  // Geom_Transformation.SetTrsf (method)
  SetTrsf(theTrsf: gp_Trsf): void;

  // Geom_Transformation.IsNegative (method)
  IsNegative(): boolean;

  // Geom_Transformation.Form (method)
  Form(): gp_TrsfForm;

  // Geom_Transformation.ScaleFactor (method)
  ScaleFactor(): number;

  // Geom_Transformation.Trsf (method)
  Trsf(): gp_Trsf;

  // Geom_Transformation.Value (method)
  Value(theRow: number, theCol: number): number;

  // Geom_Transformation.Invert (method)
  Invert(): void;

  // Geom_Transformation.Inverted (method)
  Inverted(): Geom_Transformation;

  // Geom_Transformation.Multiplied (method)
  Multiplied(Other: Geom_Transformation): Geom_Transformation;

  // Geom_Transformation.Multiply (method)
  Multiply(theOther: Geom_Transformation): void;

  // Geom_Transformation.Power (method)
  Power(N: number): void;

  // Geom_Transformation.Powered (method)
  Powered(N: number): Geom_Transformation;

  // Geom_Transformation.PreMultiply (method)
  PreMultiply(Other: Geom_Transformation): void;

  // Geom_Transformation.Transforms (method)
  Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

  // Geom_Transformation.Copy (method)
  Copy(): Geom_Transformation;

  // Geom_Transformation.delete (method)
  delete(): void;

  // Geom_Transformation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_TrimmedCurve: declare class Geom_TrimmedCurve extends Geom_BoundedCurve

  // Geom_TrimmedCurve.constructor (constructor)
  constructor(C: Geom_Curve, U1: number, U2: number, Sense?: boolean, theAdjustPeriodic?: boolean);

  // Geom_TrimmedCurve.Reverse (method)
  Reverse(): void;

  // Geom_TrimmedCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom_TrimmedCurve.SetTrim (method)
  SetTrim(U1: number, U2: number, Sense?: boolean, theAdjustPeriodic?: boolean): void;

  // Geom_TrimmedCurve.BasisCurve (method)
  BasisCurve(): Geom_Curve;

  // Geom_TrimmedCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom_TrimmedCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom_TrimmedCurve.EndPoint (method)
  EndPoint(): gp_Pnt;

  // Geom_TrimmedCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom_TrimmedCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom_TrimmedCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom_TrimmedCurve.Period (method)
  Period(): number;

  // Geom_TrimmedCurve.LastParameter (method)
  LastParameter(): number;

  // Geom_TrimmedCurve.StartPoint (method)
  StartPoint(): gp_Pnt;

  // Geom_TrimmedCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt;

  // Geom_TrimmedCurve.EvalD1 (method)
  EvalD1(U: number): Geom_Curve_ResD1;

  // Geom_TrimmedCurve.EvalD2 (method)
  EvalD2(U: number): Geom_Curve_ResD2;

  // Geom_TrimmedCurve.EvalD3 (method)
  EvalD3(U: number): Geom_Curve_ResD3;

  // Geom_TrimmedCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec;

  // Geom_TrimmedCurve.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_TrimmedCurve.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf): number;

  // Geom_TrimmedCurve.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf): number;

  // Geom_TrimmedCurve.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_TrimmedCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom_TrimmedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_TrimmedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_TrimmedCurve.delete (method)
  delete(): void;

  // Geom_TrimmedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_UndefinedDerivative: declare class Geom_UndefinedDerivative extends Standard_DomainError

  // Geom_UndefinedDerivative.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Geom_UndefinedDerivative.ExceptionType (method)
  ExceptionType(): string;

  // Geom_UndefinedDerivative.delete (method)
  delete(): void;

  // Geom_UndefinedDerivative.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_UndefinedValue: declare class Geom_UndefinedValue extends Standard_DomainError

  // Geom_UndefinedValue.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Geom_UndefinedValue.ExceptionType (method)
  ExceptionType(): string;

  // Geom_UndefinedValue.delete (method)
  delete(): void;

  // Geom_UndefinedValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Vector: declare class Geom_Vector extends Geom_Geometry

  // Geom_Vector.Reverse (method)
  Reverse(): void;

  // Geom_Vector.Reversed (method)
  Reversed(): Geom_Vector;

  // Geom_Vector.Angle (method)
  Angle(Other: Geom_Vector): number;

  // Geom_Vector.AngleWithRef (method)
  AngleWithRef(Other: Geom_Vector, VRef: Geom_Vector): number;

  // Geom_Vector.Coord (method)
  Coord(X?: number, Y?: number, Z?: number): { X: number; Y: number; Z: number };

  // Geom_Vector.Magnitude (method)
  Magnitude(): number;

  // Geom_Vector.SquareMagnitude (method)
  SquareMagnitude(): number;

  // Geom_Vector.X (method)
  X(): number;

  // Geom_Vector.Y (method)
  Y(): number;

  // Geom_Vector.Z (method)
  Z(): number;

  // Geom_Vector.Cross (method)
  Cross(Other: Geom_Vector): void;

  // Geom_Vector.Crossed (method)
  Crossed(Other: Geom_Vector): Geom_Vector;

  // Geom_Vector.CrossCross (method)
  CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

  // Geom_Vector.CrossCrossed (method)
  CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

  // Geom_Vector.Dot (method)
  Dot(Other: Geom_Vector): number;

  // Geom_Vector.DotCross (method)
  DotCross(V1: Geom_Vector, V2: Geom_Vector): number;

  // Geom_Vector.Vec (method)
  Vec(): gp_Vec;

  // Geom_Vector.get_type_name (method)
  static get_type_name(): string;

  // Geom_Vector.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_Vector.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_Vector.delete (method)
  delete(): void;

  // Geom_Vector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_VectorWithMagnitude: declare class Geom_VectorWithMagnitude extends Geom_Vector

  // Geom_VectorWithMagnitude.constructor (constructor)
  constructor(V: gp_Vec);
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(X: number, Y: number, Z: number);

  // Geom_VectorWithMagnitude.SetCoord (method)
  SetCoord(X: number, Y: number, Z: number): void;

  // Geom_VectorWithMagnitude.SetVec (method)
  SetVec(V: gp_Vec): void;

  // Geom_VectorWithMagnitude.SetX (method)
  SetX(X: number): void;

  // Geom_VectorWithMagnitude.SetY (method)
  SetY(Y: number): void;

  // Geom_VectorWithMagnitude.SetZ (method)
  SetZ(Z: number): void;

  // Geom_VectorWithMagnitude.Magnitude (method)
  Magnitude(): number;

  // Geom_VectorWithMagnitude.SquareMagnitude (method)
  SquareMagnitude(): number;

  // Geom_VectorWithMagnitude.Add (method)
  Add(Other: Geom_Vector): void;

  // Geom_VectorWithMagnitude.Added (method)
  Added(Other: Geom_Vector): Geom_VectorWithMagnitude;

  // Geom_VectorWithMagnitude.Cross (method)
  Cross(Other: Geom_Vector): void;

  // Geom_VectorWithMagnitude.Crossed (method)
  Crossed(Other: Geom_Vector): Geom_Vector;

  // Geom_VectorWithMagnitude.CrossCross (method)
  CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

  // Geom_VectorWithMagnitude.CrossCrossed (method)
  CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

  // Geom_VectorWithMagnitude.Divide (method)
  Divide(Scalar: number): void;

  // Geom_VectorWithMagnitude.Divided (method)
  Divided(Scalar: number): Geom_VectorWithMagnitude;

  // Geom_VectorWithMagnitude.Multiplied (method)
  Multiplied(Scalar: number): Geom_VectorWithMagnitude;

  // Geom_VectorWithMagnitude.Multiply (method)
  Multiply(Scalar: number): void;

  // Geom_VectorWithMagnitude.Normalize (method)
  Normalize(): void;

  // Geom_VectorWithMagnitude.Normalized (method)
  Normalized(): Geom_VectorWithMagnitude;

  // Geom_VectorWithMagnitude.Subtract (method)
  Subtract(Other: Geom_Vector): void;

  // Geom_VectorWithMagnitude.Subtracted (method)
  Subtracted(Other: Geom_Vector): Geom_VectorWithMagnitude;

  // Geom_VectorWithMagnitude.Transform (method)
  Transform(T: gp_Trsf): void;

  // Geom_VectorWithMagnitude.Copy (method)
  Copy(): Geom_Geometry;

  // Geom_VectorWithMagnitude.get_type_name (method)
  static get_type_name(): string;

  // Geom_VectorWithMagnitude.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom_VectorWithMagnitude.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom_VectorWithMagnitude.delete (method)
  delete(): void;

  // Geom_VectorWithMagnitude.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom_Curve_ResD1: interface Geom_Curve_ResD1

  Point: gp_Pnt

  D1: gp_Vec

Geom_Curve_ResD2: interface Geom_Curve_ResD2

  Point: gp_Pnt

  D1: gp_Vec

  D2: gp_Vec

Geom_Curve_ResD3: interface Geom_Curve_ResD3

  Point: gp_Pnt

  D1: gp_Vec

  D2: gp_Vec

  D3: gp_Vec

Geom_Surface_ResD1: interface Geom_Surface_ResD1

  Point: gp_Pnt

  D1U: gp_Vec

  D1V: gp_Vec

Geom_Surface_ResD2: interface Geom_Surface_ResD2

  Point: gp_Pnt

  D1U: gp_Vec

  D1V: gp_Vec

  D2U: gp_Vec

  D2V: gp_Vec

  D2UV: gp_Vec

Geom_Surface_ResD3: interface Geom_Surface_ResD3

  Point: gp_Pnt

  D1U: gp_Vec

  D1V: gp_Vec

  D2U: gp_Vec

  D2V: gp_Vec

  D2UV: gp_Vec

  D3U: gp_Vec

  D3V: gp_Vec

  D3UUV: gp_Vec

  D3UVV: gp_Vec
