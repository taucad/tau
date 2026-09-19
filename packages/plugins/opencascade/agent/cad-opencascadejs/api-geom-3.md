# libcascade — Geom (3)

22 top-level symbols. Signatures are verbatim typescript.

Geom_OffsetSurface: declare class Geom_OffsetSurface extends Geom_Surface

  constructor

  HasEvalRepresentation(): boolean;

  EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

  SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

  ClearEvalRepresentation(): void;

  SetBasisSurface(S: Geom_Surface, isNotCheckC0?: boolean): void;

  SetOffsetValue(D: number): void;

  Offset(): number;

  BasisSurface(): Geom_Surface;

  UReverse(): void;

  UReversedParameter(U: number): number;

  VReverse(): void;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  Continuity(): GeomAbs_Shape;

  IsCNu(N: number): boolean;

  IsCNv(N: number): boolean;

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  UPeriod(): number;

  IsVPeriodic(): boolean;

  VPeriod(): number;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  Copy(): Geom_Geometry;

  Surface(): Geom_Surface;

  UOsculatingSurface(U: number, V: number, IsOpposite?: boolean): { returnValue: boolean; IsOpposite: boolean; UOsculSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

  VOsculatingSurface(U: number, V: number, IsOpposite?: boolean): { returnValue: boolean; IsOpposite: boolean; VOsculSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

  GetBasisSurfContinuity(): GeomAbs_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_Parabola: declare class Geom_Parabola extends Geom_Conic

  constructor

  SetFocal(Focal: number): void;

  SetParab(Prb: gp_Parab): void;

  Parab(): gp_Parab;

  ReversedParameter(U: number): number;

  FirstParameter(): number;

  LastParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Directrix(): gp_Ax1;

  Eccentricity(): number;

  Focus(): gp_Pnt;

  Focal(): number;

  Parameter(): number;

  EvalD0(U: number): gp_Pnt;

  EvalD1(U: number): Geom_Curve_ResD1;

  EvalD2(U: number): Geom_Curve_ResD2;

  EvalD3(U: number): Geom_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  TransformedParameter(U: number, T: gp_Trsf): number;

  ParametricTransformation(T: gp_Trsf): number;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_Plane: declare class Geom_Plane extends Geom_ElementarySurface

  constructor

  SetPln(Pl: gp_Pln): void;

  Pln(): gp_Pln;

  UReverse(): void;

  UReversedParameter(U: number): number;

  VReverse(): void;

  VReversedParameter(V: number): number;

  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  Coefficients(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

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

Geom_Point: declare class Geom_Point extends Geom_Geometry

  Coord(X: number, Y: number, Z: number): { X: number; Y: number; Z: number };

  Pnt(): gp_Pnt;

  X(): number;

  Y(): number;

  Z(): number;

  Distance(Other: Geom_Point): number;

  SquareDistance(Other: Geom_Point): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_RectangularTrimmedSurface: declare class Geom_RectangularTrimmedSurface extends Geom_BoundedSurface

  constructor

  SetTrim(U1: number, U2: number, V1: number, V2: number, USense: boolean, VSense: boolean): void;
  SetTrim(Param1: number, Param2: number, UTrim: boolean, Sense: boolean): void;
  SetTrim(U1: number, U2: number, V1: number, V2: number, USense: boolean, VSense: boolean): void;
  SetTrim(Param1: number, Param2: number, UTrim: boolean, Sense: boolean): void;

  BasisSurface(): Geom_Surface;

  UReverse(): void;

  UReversedParameter(U: number): number;

  VReverse(): void;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  Continuity(): GeomAbs_Shape;

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsCNu(N: number): boolean;

  IsCNv(N: number): boolean;

  IsUPeriodic(): boolean;

  UPeriod(): number;

  IsVPeriodic(): boolean;

  VPeriod(): number;

  UIso(U: number): Geom_Curve;

  VIso(V: number): Geom_Curve;

  EvalD0(U: number, V: number): gp_Pnt;

  EvalD1(U: number, V: number): Geom_Surface_ResD1;

  EvalD2(U: number, V: number): Geom_Surface_ResD2;

  EvalD3(U: number, V: number): Geom_Surface_ResD3;

  EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_SphericalSurface: declare class Geom_SphericalSurface extends Geom_ElementarySurface

  constructor

  SetRadius(R: number): void;

  SetSphere(S: gp_Sphere): void;

  Sphere(): gp_Sphere;

  UReversedParameter(U: number): number;

  VReversedParameter(V: number): number;

  Area(): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  Coefficients(A1?: number, A2?: number, A3?: number, B1?: number, B2?: number, B3?: number, C1?: number, C2?: number, C3?: number, D?: number): { A1: number; A2: number; A3: number; B1: number; B2: number; B3: number; C1: number; C2: number; C3: number; D: number };

  Radius(): number;

  Volume(): number;

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

Geom_Surface: declare class Geom_Surface extends Geom_Geometry

  UReverse(): void;

  UReversed(): Geom_Surface;

  UReversedParameter(U: number): number;

  VReverse(): void;

  VReversed(): Geom_Surface;

  VReversedParameter(V: number): number;

  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsUPeriodic(): boolean;

  UPeriod(): number;

  IsVPeriodic(): boolean;

  VPeriod(): number;

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

  D0(U: number, V: number, P: gp_Pnt): void;

  D1(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec): void;

  D2(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;

  D3(U: number, V: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;

  DN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

  Value(U: number, V: number): gp_Pnt;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_SurfaceOfLinearExtrusion: declare class Geom_SurfaceOfLinearExtrusion extends Geom_SweptSurface

  constructor

  HasEvalRepresentation(): boolean;

  EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

  SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

  ClearEvalRepresentation(): void;

  SetDirection(V: gp_Dir): void;

  SetBasisCurve(C: Geom_Curve): void;

  UReverse(): void;

  UReversedParameter(U: number): number;

  VReverse(): void;

  VReversedParameter(V: number): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsCNu(N: number): boolean;

  IsCNv(N: number): boolean;

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

  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_SurfaceOfRevolution: declare class Geom_SurfaceOfRevolution extends Geom_SweptSurface

  constructor

  HasEvalRepresentation(): boolean;

  EvalRepresentation(): GeomEval_RepSurfaceDesc_Base;

  SetEvalRepresentation(theDesc: GeomEval_RepSurfaceDesc_Base): void;

  ClearEvalRepresentation(): void;

  SetAxis(A1: gp_Ax1): void;

  SetDirection(V: gp_Dir): void;

  SetBasisCurve(C: Geom_Curve): void;

  SetLocation(P: gp_Pnt): void;

  Axis(): gp_Ax1;

  Location(): gp_Pnt;

  ReferencePlane(): gp_Ax2;

  UReverse(): void;

  UReversedParameter(U: number): number;

  VReverse(): void;

  VReversedParameter(V: number): number;

  TransformParameters(U: number, V: number, T: gp_Trsf): { U: number; V: number };

  ParametricTransformation(T: gp_Trsf): gp_GTrsf2d;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsCNu(N: number): boolean;

  IsCNv(N: number): boolean;

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

Geom_SweptSurface: declare class Geom_SweptSurface extends Geom_Surface

  Continuity(): GeomAbs_Shape;

  Direction(): gp_Dir;

  BasisCurve(): Geom_Curve;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_ToroidalSurface: declare class Geom_ToroidalSurface extends Geom_ElementarySurface

  constructor

  SetMajorRadius(MajorRadius: number): void;

  SetMinorRadius(MinorRadius: number): void;

  SetTorus(T: gp_Torus): void;

  Torus(): gp_Torus;

  UReversedParameter(U: number): number;

  VReversedParameter(V: number): number;

  Area(): number;

  Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

  Coefficients(Coef: NCollection_Array1_double): void;

  MajorRadius(): number;

  MinorRadius(): number;

  Volume(): number;

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

Geom_Transformation: declare class Geom_Transformation extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  SetMirror(thePnt: gp_Pnt): void;
  SetMirror(theA1: gp_Ax1): void;
  SetMirror(theA2: gp_Ax2): void;
  SetMirror(thePnt: gp_Pnt): void;
  SetMirror(theA1: gp_Ax1): void;
  SetMirror(theA2: gp_Ax2): void;
  SetMirror(thePnt: gp_Pnt): void;
  SetMirror(theA1: gp_Ax1): void;
  SetMirror(theA2: gp_Ax2): void;

  SetRotation(theA1: gp_Ax1, theAng: number): void;

  SetScale(thePnt: gp_Pnt, theScale: number): void;

  SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
  SetTransformation(theToSystem: gp_Ax3): void;
  SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
  SetTransformation(theToSystem: gp_Ax3): void;

  SetTranslation(theVec: gp_Vec): void;
  SetTranslation(P1: gp_Pnt, P2: gp_Pnt): void;
  SetTranslation(theVec: gp_Vec): void;
  SetTranslation(P1: gp_Pnt, P2: gp_Pnt): void;

  SetTrsf(theTrsf: gp_Trsf): void;

  IsNegative(): boolean;

  Form(): gp_TrsfForm;

  ScaleFactor(): number;

  Trsf(): gp_Trsf;

  Value(theRow: number, theCol: number): number;

  Invert(): void;

  Inverted(): Geom_Transformation;

  Multiplied(Other: Geom_Transformation): Geom_Transformation;

  Multiply(theOther: Geom_Transformation): void;

  Power(N: number): void;

  Powered(N: number): Geom_Transformation;

  PreMultiply(Other: Geom_Transformation): void;

  Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

  Copy(): Geom_Transformation;

  delete(): void;

  [Symbol.dispose](): void;

Geom_TrimmedCurve: declare class Geom_TrimmedCurve extends Geom_BoundedCurve

  constructor

  Reverse(): void;

  ReversedParameter(U: number): number;

  SetTrim(U1: number, U2: number, Sense?: boolean, theAdjustPeriodic?: boolean): void;

  BasisCurve(): Geom_Curve;

  Continuity(): GeomAbs_Shape;

  IsCN(N: number): boolean;

  EndPoint(): gp_Pnt;

  FirstParameter(): number;

  IsClosed(): boolean;

  IsPeriodic(): boolean;

  Period(): number;

  LastParameter(): number;

  StartPoint(): gp_Pnt;

  EvalD0(U: number): gp_Pnt;

  EvalD1(U: number): Geom_Curve_ResD1;

  EvalD2(U: number): Geom_Curve_ResD2;

  EvalD3(U: number): Geom_Curve_ResD3;

  EvalDN(U: number, N: number): gp_Vec;

  Transform(T: gp_Trsf): void;

  TransformedParameter(U: number, T: gp_Trsf): number;

  ParametricTransformation(T: gp_Trsf): number;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_UndefinedDerivative: declare class Geom_UndefinedDerivative extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Geom_UndefinedValue: declare class Geom_UndefinedValue extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Geom_Vector: declare class Geom_Vector extends Geom_Geometry

  Reverse(): void;

  Reversed(): Geom_Vector;

  Angle(Other: Geom_Vector): number;

  AngleWithRef(Other: Geom_Vector, VRef: Geom_Vector): number;

  Coord(X?: number, Y?: number, Z?: number): { X: number; Y: number; Z: number };

  Magnitude(): number;

  SquareMagnitude(): number;

  X(): number;

  Y(): number;

  Z(): number;

  Cross(Other: Geom_Vector): void;

  Crossed(Other: Geom_Vector): Geom_Vector;

  CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

  CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

  Dot(Other: Geom_Vector): number;

  DotCross(V1: Geom_Vector, V2: Geom_Vector): number;

  Vec(): gp_Vec;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Geom_VectorWithMagnitude: declare class Geom_VectorWithMagnitude extends Geom_Vector

  constructor

  SetCoord(X: number, Y: number, Z: number): void;

  SetVec(V: gp_Vec): void;

  SetX(X: number): void;

  SetY(Y: number): void;

  SetZ(Z: number): void;

  Magnitude(): number;

  SquareMagnitude(): number;

  Add(Other: Geom_Vector): void;

  Added(Other: Geom_Vector): Geom_VectorWithMagnitude;

  Cross(Other: Geom_Vector): void;

  Crossed(Other: Geom_Vector): Geom_Vector;

  CrossCross(V1: Geom_Vector, V2: Geom_Vector): void;

  CrossCrossed(V1: Geom_Vector, V2: Geom_Vector): Geom_Vector;

  Divide(Scalar: number): void;

  Divided(Scalar: number): Geom_VectorWithMagnitude;

  Multiplied(Scalar: number): Geom_VectorWithMagnitude;

  Multiply(Scalar: number): void;

  Normalize(): void;

  Normalized(): Geom_VectorWithMagnitude;

  Subtract(Other: Geom_Vector): void;

  Subtracted(Other: Geom_Vector): Geom_VectorWithMagnitude;

  Transform(T: gp_Trsf): void;

  Copy(): Geom_Geometry;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

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
