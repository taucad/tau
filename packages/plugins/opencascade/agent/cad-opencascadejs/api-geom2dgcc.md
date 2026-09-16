# libcascade — Geom2dGcc

28 top-level symbols. Signatures are verbatim typescript.

Geom2dGcc: declare class Geom2dGcc

  constructor

  static Unqualified(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

  static Enclosing(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

  static Enclosed(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

  static Outside(Obj: Geom2dAdaptor_Curve): Geom2dGcc_QualifiedCurve;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanOn: declare class Geom2dGcc_Circ2d2TanOn

  constructor

  Results(Circ: GccAna_Circ2d2TanOn): void;
  Results(Circ: Geom2dGcc_Circ2d2TanOnGeo): void;
  Results(Circ: GccAna_Circ2d2TanOn): void;
  Results(Circ: Geom2dGcc_Circ2d2TanOnGeo): void;

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  IsTheSame1(Index: number): boolean;

  IsTheSame2(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanOnGeo: declare class Geom2dGcc_Circ2d2TanOnGeo

  constructor

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  IsTheSame1(Index: number): boolean;

  IsTheSame2(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanOnIter: declare class Geom2dGcc_Circ2d2TanOnIter

  constructor

  IsDone(): boolean;

  ThisSolution(): gp_Circ2d;

  WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  CenterOn3(ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  IsTheSame1(): boolean;

  IsTheSame2(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanRad: declare class Geom2dGcc_Circ2d2TanRad

  constructor

  Results(Circ: GccAna_Circ2d2TanRad): void;
  Results(Circ: Geom2dGcc_Circ2d2TanRadGeo): void;
  Results(Circ: GccAna_Circ2d2TanRad): void;
  Results(Circ: Geom2dGcc_Circ2d2TanRadGeo): void;

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  IsTheSame1(Index: number): boolean;

  IsTheSame2(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2d2TanRadGeo: declare class Geom2dGcc_Circ2d2TanRadGeo

  constructor

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  IsTheSame1(Index: number): boolean;

  IsTheSame2(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2d3Tan: declare class Geom2dGcc_Circ2d3Tan

  constructor

  Results(Circ: GccAna_Circ2d3Tan, Rank1: number, Rank2: number, Rank3: number): void;

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency3(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  IsTheSame1(Index: number): boolean;

  IsTheSame2(Index: number): boolean;

  IsTheSame3(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2d3TanIter: declare class Geom2dGcc_Circ2d3TanIter

  constructor

  IsDone(): boolean;

  ThisSolution(): gp_Circ2d;

  WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position, Qualif3?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position; Qualif3: GccEnt_Position };

  Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency3(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  IsTheSame1(): boolean;

  IsTheSame2(): boolean;

  IsTheSame3(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2dTanCen: declare class Geom2dGcc_Circ2dTanCen

  constructor

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  IsTheSame1(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2dTanCenGeo: declare class Geom2dGcc_Circ2dTanCenGeo

  constructor

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2dTanOnRad: declare class Geom2dGcc_Circ2dTanOnRad

  constructor

  Results(Circ: GccAna_Circ2dTanOnRad): void;
  Results(Circ: Geom2dGcc_Circ2dTanOnRadGeo): void;
  Results(Circ: GccAna_Circ2dTanOnRad): void;
  Results(Circ: Geom2dGcc_Circ2dTanOnRadGeo): void;

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  IsTheSame1(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Circ2dTanOnRadGeo: declare class Geom2dGcc_Circ2dTanOnRadGeo

  constructor

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Circ2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  CenterOn3(Index: number, ParArg: number, PntSol: gp_Pnt2d): { ParArg: number };

  IsTheSame1(Index: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_CurveTool: declare class Geom2dGcc_CurveTool

  constructor

  static FirstParameter(C: Geom2dAdaptor_Curve): number;

  static LastParameter(C: Geom2dAdaptor_Curve): number;

  static EpsX(C: Geom2dAdaptor_Curve, Tol: number): number;

  static NbSamples(C: Geom2dAdaptor_Curve): number;

  static Value(C: Geom2dAdaptor_Curve, X: number): gp_Pnt2d;

  static D1(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d): void;

  static D2(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d): void;

  static D3(C: Geom2dAdaptor_Curve, U: number, P: gp_Pnt2d, T: gp_Vec2d, N: gp_Vec2d, dN: gp_Vec2d): void;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanCirCu: declare class Geom2dGcc_FunctionTanCirCu extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanCuCu: declare class Geom2dGcc_FunctionTanCuCu extends math_FunctionSetWithDerivatives

  constructor

  InitDerivative(X: math_VectorBase_double, Point1: gp_Pnt2d, Point2: gp_Pnt2d, Tan1: gp_Vec2d, Tan2: gp_Vec2d, D21: gp_Vec2d, D22: gp_Vec2d): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanCuCuOnCu: declare class Geom2dGcc_FunctionTanCuCuOnCu extends math_FunctionSetWithDerivatives

  constructor

  InitDerivative(X: math_VectorBase_double, Point1: gp_Pnt2d, Point2: gp_Pnt2d, Point3: gp_Pnt2d, Tan1: gp_Vec2d, Tan2: gp_Vec2d, Tan3: gp_Vec2d, D21: gp_Vec2d, D22: gp_Vec2d, D23: gp_Vec2d): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanCuPnt: declare class Geom2dGcc_FunctionTanCuPnt extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_FunctionTanObl: declare class Geom2dGcc_FunctionTanObl extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_IsParallel: declare class Geom2dGcc_IsParallel extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Lin2d2Tan: declare class Geom2dGcc_Lin2d2Tan

  constructor

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Lin2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Lin2d2TanIter: declare class Geom2dGcc_Lin2d2TanIter

  constructor

  IsDone(): boolean;

  ThisSolution(): gp_Lin2d;

  WhichQualifier(Qualif1?: GccEnt_Position, Qualif2?: GccEnt_Position): { Qualif1: GccEnt_Position; Qualif2: GccEnt_Position };

  Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Tangency2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Lin2dTanObl: declare class Geom2dGcc_Lin2dTanObl

  constructor

  IsDone(): boolean;

  NbSolutions(): number;

  ThisSolution(Index: number): gp_Lin2d;

  WhichQualifier(Index: number, Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  Tangency1(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Intersection2(Index: number, ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Lin2dTanOblIter: declare class Geom2dGcc_Lin2dTanOblIter

  constructor

  IsDone(): boolean;

  ThisSolution(): gp_Lin2d;

  WhichQualifier(Qualif1?: GccEnt_Position): { Qualif1: GccEnt_Position };

  Tangency1(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  Intersection2(ParSol: number, ParArg: number, PntSol: gp_Pnt2d): { ParSol: number; ParArg: number };

  IsParallel2(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_QCurve: declare class Geom2dGcc_QCurve

  constructor

  Qualified(): Geom2dAdaptor_Curve;

  Qualifier(): GccEnt_Position;

  IsUnqualified(): boolean;

  IsEnclosing(): boolean;

  IsEnclosed(): boolean;

  IsOutside(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_QualifiedCurve: declare class Geom2dGcc_QualifiedCurve

  constructor

  Qualified(): Geom2dAdaptor_Curve;

  Qualifier(): GccEnt_Position;

  IsUnqualified(): boolean;

  IsEnclosing(): boolean;

  IsEnclosed(): boolean;

  IsOutside(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Geom2dGcc_Type1: typeof Geom2dGcc_Type1[keyof typeof Geom2dGcc_Type1]

Geom2dGcc_Type2: typeof Geom2dGcc_Type2[keyof typeof Geom2dGcc_Type2]

Geom2dGcc_Type3: typeof Geom2dGcc_Type3[keyof typeof Geom2dGcc_Type3]
