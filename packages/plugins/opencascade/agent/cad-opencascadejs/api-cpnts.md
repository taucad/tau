# libcascade — CPnts

4 top-level symbols. Signatures are verbatim typescript.

CPnts_AbscissaPoint: declare class CPnts_AbscissaPoint

  // CPnts_AbscissaPoint.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve, Abscissa: number, U0: number, Resolution: number);
  constructor(C: Adaptor2d_Curve2d, Abscissa: number, U0: number, Resolution: number);
  constructor(C: Adaptor3d_Curve, Abscissa: number, U0: number, Ui: number, Resolution: number);
  constructor(C: Adaptor2d_Curve2d, Abscissa: number, U0: number, Ui: number, Resolution: number);

  // CPnts_AbscissaPoint.Length (method)
  static Length(C: Adaptor3d_Curve): number;
  static Length(C: Adaptor2d_Curve2d): number;
  static Length(C: Adaptor3d_Curve, Tol: number): number;
  static Length(C: Adaptor2d_Curve2d, Tol: number): number;
  static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
  static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
  static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
  static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;

  // CPnts_AbscissaPoint.Init (method)
  Init(C: Adaptor3d_Curve): void;
  Init(C: Adaptor2d_Curve2d): void;
  Init(C: Adaptor3d_Curve, Tol: number): void;
  Init(C: Adaptor2d_Curve2d, Tol: number): void;
  Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
  Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
  Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
  Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;

  // CPnts_AbscissaPoint.Perform (method)
  Perform(Abscissa: number, U0: number, Resolution: number): void;
  Perform(Abscissa: number, U0: number, Ui: number, Resolution: number): void;

  // CPnts_AbscissaPoint.AdvPerform (method)
  AdvPerform(Abscissa: number, U0: number, Ui: number, Resolution: number): void;

  // CPnts_AbscissaPoint.IsDone (method)
  IsDone(): boolean;

  // CPnts_AbscissaPoint.Parameter (method)
  Parameter(): number;

  // CPnts_AbscissaPoint.SetParameter (method)
  SetParameter(P: number): void;

  // CPnts_AbscissaPoint.delete (method)
  delete(): void;

  // CPnts_AbscissaPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CPnts_MyGaussFunction: declare class CPnts_MyGaussFunction extends math_Function

  // CPnts_MyGaussFunction.constructor (constructor)
  constructor();

  // CPnts_MyGaussFunction.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // CPnts_MyGaussFunction.delete (method)
  delete(): void;

  // CPnts_MyGaussFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CPnts_MyRootFunction: declare class CPnts_MyRootFunction extends math_FunctionWithDerivative

  // CPnts_MyRootFunction.constructor (constructor)
  constructor();

  // CPnts_MyRootFunction.Init (method)
  Init(X0: number, L: number): void;
  Init(X0: number, L: number, Tol: number): void;

  // CPnts_MyRootFunction.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // CPnts_MyRootFunction.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // CPnts_MyRootFunction.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // CPnts_MyRootFunction.delete (method)
  delete(): void;

  // CPnts_MyRootFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CPnts_UniformDeflection: declare class CPnts_UniformDeflection

  // CPnts_UniformDeflection.constructor (constructor)
  constructor();
  constructor(C: Adaptor3d_Curve, Deflection: number, Resolution: number, WithControl: boolean);
  constructor(C: Adaptor2d_Curve2d, Deflection: number, Resolution: number, WithControl: boolean);
  constructor(C: Adaptor3d_Curve, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean);
  constructor(C: Adaptor2d_Curve2d, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean);

  // CPnts_UniformDeflection.Initialize (method)
  Initialize(C: Adaptor3d_Curve, Deflection: number, Resolution: number, WithControl: boolean): void;
  Initialize(C: Adaptor2d_Curve2d, Deflection: number, Resolution: number, WithControl: boolean): void;
  Initialize(C: Adaptor3d_Curve, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;
  Initialize(C: Adaptor2d_Curve2d, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;

  // CPnts_UniformDeflection.IsAllDone (method)
  IsAllDone(): boolean;

  // CPnts_UniformDeflection.Next (method)
  Next(): void;

  // CPnts_UniformDeflection.More (method)
  More(): boolean;

  // CPnts_UniformDeflection.Value (method)
  Value(): number;

  // CPnts_UniformDeflection.Point (method)
  Point(): gp_Pnt;

  // CPnts_UniformDeflection.delete (method)
  delete(): void;

  // CPnts_UniformDeflection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
