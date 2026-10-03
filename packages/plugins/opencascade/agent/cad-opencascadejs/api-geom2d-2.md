# libcascade — Geom2d (2)

9 top-level symbols. Signatures are verbatim typescript.

Geom2d_Transformation: declare class Geom2d_Transformation extends Standard_Transient

  // Geom2d_Transformation.constructor (constructor)
  constructor();
  constructor(T: gp_Trsf2d);

  // Geom2d_Transformation.SetMirror (method)
  SetMirror(P: gp_Pnt2d): void;
  SetMirror(A: gp_Ax2d): void;

  // Geom2d_Transformation.SetRotation (method)
  SetRotation(P: gp_Pnt2d, Ang: number): void;

  // Geom2d_Transformation.SetScale (method)
  SetScale(P: gp_Pnt2d, S: number): void;

  // Geom2d_Transformation.SetTransformation (method)
  SetTransformation(FromSystem1: gp_Ax2d, ToSystem2: gp_Ax2d): void;
  SetTransformation(ToSystem: gp_Ax2d): void;

  // Geom2d_Transformation.SetTranslation (method)
  SetTranslation(V: gp_Vec2d): void;
  SetTranslation(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  // Geom2d_Transformation.SetTrsf2d (method)
  SetTrsf2d(T: gp_Trsf2d): void;

  // Geom2d_Transformation.IsNegative (method)
  IsNegative(): boolean;

  // Geom2d_Transformation.Form (method)
  Form(): gp_TrsfForm;

  // Geom2d_Transformation.ScaleFactor (method)
  ScaleFactor(): number;

  // Geom2d_Transformation.Trsf2d (method)
  Trsf2d(): gp_Trsf2d;

  // Geom2d_Transformation.Value (method)
  Value(Row: number, Col: number): number;

  // Geom2d_Transformation.Invert (method)
  Invert(): void;

  // Geom2d_Transformation.Inverted (method)
  Inverted(): Geom2d_Transformation;

  // Geom2d_Transformation.Multiplied (method)
  Multiplied(Other: Geom2d_Transformation): Geom2d_Transformation;

  // Geom2d_Transformation.Multiply (method)
  Multiply(Other: Geom2d_Transformation): void;

  // Geom2d_Transformation.Power (method)
  Power(N: number): void;

  // Geom2d_Transformation.Powered (method)
  Powered(N: number): Geom2d_Transformation;

  // Geom2d_Transformation.PreMultiply (method)
  PreMultiply(Other: Geom2d_Transformation): void;

  // Geom2d_Transformation.Transforms (method)
  Transforms(X?: number, Y?: number): { X: number; Y: number };

  // Geom2d_Transformation.Copy (method)
  Copy(): Geom2d_Transformation;

  // Geom2d_Transformation.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Transformation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Transformation.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Transformation.delete (method)
  delete(): void;

  // Geom2d_Transformation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_TrimmedCurve: declare class Geom2d_TrimmedCurve extends Geom2d_BoundedCurve

  // Geom2d_TrimmedCurve.constructor (constructor)
  constructor(C: Geom2d_Curve, U1: number, U2: number, Sense?: boolean, theAdjustPeriodic?: boolean);

  // Geom2d_TrimmedCurve.Reverse (method)
  Reverse(): void;

  // Geom2d_TrimmedCurve.ReversedParameter (method)
  ReversedParameter(U: number): number;

  // Geom2d_TrimmedCurve.SetTrim (method)
  SetTrim(U1: number, U2: number, Sense?: boolean, theAdjustPeriodic?: boolean): void;

  // Geom2d_TrimmedCurve.BasisCurve (method)
  BasisCurve(): Geom2d_Curve;

  // Geom2d_TrimmedCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // Geom2d_TrimmedCurve.IsCN (method)
  IsCN(N: number): boolean;

  // Geom2d_TrimmedCurve.EndPoint (method)
  EndPoint(): gp_Pnt2d;

  // Geom2d_TrimmedCurve.FirstParameter (method)
  FirstParameter(): number;

  // Geom2d_TrimmedCurve.IsClosed (method)
  IsClosed(): boolean;

  // Geom2d_TrimmedCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // Geom2d_TrimmedCurve.Period (method)
  Period(): number;

  // Geom2d_TrimmedCurve.LastParameter (method)
  LastParameter(): number;

  // Geom2d_TrimmedCurve.StartPoint (method)
  StartPoint(): gp_Pnt2d;

  // Geom2d_TrimmedCurve.EvalD0 (method)
  EvalD0(U: number): gp_Pnt2d;

  // Geom2d_TrimmedCurve.EvalD1 (method)
  EvalD1(U: number): Geom2d_Curve_ResD1;

  // Geom2d_TrimmedCurve.EvalD2 (method)
  EvalD2(U: number): Geom2d_Curve_ResD2;

  // Geom2d_TrimmedCurve.EvalD3 (method)
  EvalD3(U: number): Geom2d_Curve_ResD3;

  // Geom2d_TrimmedCurve.EvalDN (method)
  EvalDN(U: number, N: number): gp_Vec2d;

  // Geom2d_TrimmedCurve.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_TrimmedCurve.TransformedParameter (method)
  TransformedParameter(U: number, T: gp_Trsf2d): number;

  // Geom2d_TrimmedCurve.ParametricTransformation (method)
  ParametricTransformation(T: gp_Trsf2d): number;

  // Geom2d_TrimmedCurve.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_TrimmedCurve.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_TrimmedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_TrimmedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_TrimmedCurve.delete (method)
  delete(): void;

  // Geom2d_TrimmedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_UndefinedDerivative: declare class Geom2d_UndefinedDerivative extends Standard_DomainError

  // Geom2d_UndefinedDerivative.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Geom2d_UndefinedDerivative.ExceptionType (method)
  ExceptionType(): string;

  // Geom2d_UndefinedDerivative.delete (method)
  delete(): void;

  // Geom2d_UndefinedDerivative.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_UndefinedValue: declare class Geom2d_UndefinedValue extends Standard_DomainError

  // Geom2d_UndefinedValue.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Geom2d_UndefinedValue.ExceptionType (method)
  ExceptionType(): string;

  // Geom2d_UndefinedValue.delete (method)
  delete(): void;

  // Geom2d_UndefinedValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Vector: declare class Geom2d_Vector extends Geom2d_Geometry

  // Geom2d_Vector.Reverse (method)
  Reverse(): void;

  // Geom2d_Vector.Reversed (method)
  Reversed(): Geom2d_Vector;

  // Geom2d_Vector.Angle (method)
  Angle(Other: Geom2d_Vector): number;

  // Geom2d_Vector.Coord (method)
  Coord(X?: number, Y?: number): { X: number; Y: number };

  // Geom2d_Vector.Magnitude (method)
  Magnitude(): number;

  // Geom2d_Vector.SquareMagnitude (method)
  SquareMagnitude(): number;

  // Geom2d_Vector.X (method)
  X(): number;

  // Geom2d_Vector.Y (method)
  Y(): number;

  // Geom2d_Vector.Crossed (method)
  Crossed(Other: Geom2d_Vector): number;

  // Geom2d_Vector.Dot (method)
  Dot(Other: Geom2d_Vector): number;

  // Geom2d_Vector.Vec2d (method)
  Vec2d(): gp_Vec2d;

  // Geom2d_Vector.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_Vector.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_Vector.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_Vector.delete (method)
  delete(): void;

  // Geom2d_Vector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_VectorWithMagnitude: declare class Geom2d_VectorWithMagnitude extends Geom2d_Vector

  // Geom2d_VectorWithMagnitude.constructor (constructor)
  constructor(V: gp_Vec2d);
  constructor(X: number, Y: number);
  constructor(P1: gp_Pnt2d, P2: gp_Pnt2d);

  // Geom2d_VectorWithMagnitude.SetCoord (method)
  SetCoord(X: number, Y: number): void;

  // Geom2d_VectorWithMagnitude.SetVec2d (method)
  SetVec2d(V: gp_Vec2d): void;

  // Geom2d_VectorWithMagnitude.SetX (method)
  SetX(X: number): void;

  // Geom2d_VectorWithMagnitude.SetY (method)
  SetY(Y: number): void;

  // Geom2d_VectorWithMagnitude.Magnitude (method)
  Magnitude(): number;

  // Geom2d_VectorWithMagnitude.SquareMagnitude (method)
  SquareMagnitude(): number;

  // Geom2d_VectorWithMagnitude.Add (method)
  Add(Other: Geom2d_Vector): void;

  // Geom2d_VectorWithMagnitude.Added (method)
  Added(Other: Geom2d_Vector): Geom2d_VectorWithMagnitude;

  // Geom2d_VectorWithMagnitude.Crossed (method)
  Crossed(Other: Geom2d_Vector): number;

  // Geom2d_VectorWithMagnitude.Divide (method)
  Divide(Scalar: number): void;

  // Geom2d_VectorWithMagnitude.Divided (method)
  Divided(Scalar: number): Geom2d_VectorWithMagnitude;

  // Geom2d_VectorWithMagnitude.Multiplied (method)
  Multiplied(Scalar: number): Geom2d_VectorWithMagnitude;

  // Geom2d_VectorWithMagnitude.Multiply (method)
  Multiply(Scalar: number): void;

  // Geom2d_VectorWithMagnitude.Normalize (method)
  Normalize(): void;

  // Geom2d_VectorWithMagnitude.Normalized (method)
  Normalized(): Geom2d_VectorWithMagnitude;

  // Geom2d_VectorWithMagnitude.Subtract (method)
  Subtract(Other: Geom2d_Vector): void;

  // Geom2d_VectorWithMagnitude.Subtracted (method)
  Subtracted(Other: Geom2d_Vector): Geom2d_VectorWithMagnitude;

  // Geom2d_VectorWithMagnitude.Transform (method)
  Transform(T: gp_Trsf2d): void;

  // Geom2d_VectorWithMagnitude.Copy (method)
  Copy(): Geom2d_Geometry;

  // Geom2d_VectorWithMagnitude.get_type_name (method)
  static get_type_name(): string;

  // Geom2d_VectorWithMagnitude.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Geom2d_VectorWithMagnitude.DynamicType (method)
  DynamicType(): Standard_Type;

  // Geom2d_VectorWithMagnitude.delete (method)
  delete(): void;

  // Geom2d_VectorWithMagnitude.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2d_Curve_ResD1: interface Geom2d_Curve_ResD1

  Point: gp_Pnt2d

  D1: gp_Vec2d

Geom2d_Curve_ResD2: interface Geom2d_Curve_ResD2

  Point: gp_Pnt2d

  D1: gp_Vec2d

  D2: gp_Vec2d

Geom2d_Curve_ResD3: interface Geom2d_Curve_ResD3

  Point: gp_Pnt2d

  D1: gp_Vec2d

  D2: gp_Vec2d

  D3: gp_Vec2d
