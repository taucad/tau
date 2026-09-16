# libcascade — Extrema (2)

29 top-level symbols. Signatures are verbatim typescript.

Extrema_FuncPSNorm: declare class Extrema_FuncPSNorm extends math_FunctionSetWithDerivatives

  constructor

  Initialize(S: Adaptor3d_Surface): void;

  SetPoint(P: gp_Pnt): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  GetStateNumber(): number;

  NbExt(): number;

  SquareDistance(N: number): number;

  Point(N: number): Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GenExtCS: declare class Extrema_GenExtCS

  constructor

  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, Tol2: number): void;
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, Tol2: number): void;

  Perform(C: Adaptor3d_Curve, NbT: number, Tol1: number): void;
  Perform(C: Adaptor3d_Curve, NbT: number, tmin: number, tsup: number, Tol1: number): void;
  Perform(C: Adaptor3d_Curve, NbT: number, Tol1: number): void;
  Perform(C: Adaptor3d_Curve, NbT: number, tmin: number, tsup: number, Tol1: number): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  PointOnCurve(N: number): Extrema_POnCurv;

  PointOnSurface(N: number): Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GenExtPS: declare class Extrema_GenExtPS

  constructor

  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, TolU: number, TolV: number): void;
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number): void;
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, TolU: number, TolV: number): void;
  Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number): void;

  Perform(P: gp_Pnt): void;

  SetFlag(F: Extrema_ExtFlag): void;

  SetAlgo(A: Extrema_ExtAlgo): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  Point(N: number): Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GenExtSS: declare class Extrema_GenExtSS

  constructor

  Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
  Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, U2min: number, U2sup: number, V2min: number, V2sup: number, Tol2: number): void;
  Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
  Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, U2min: number, U2sup: number, V2min: number, V2sup: number, Tol2: number): void;

  Perform(S1: Adaptor3d_Surface, Tol1: number): void;
  Perform(S1: Adaptor3d_Surface, U1min: number, U1sup: number, V1min: number, V1sup: number, Tol1: number): void;
  Perform(S1: Adaptor3d_Surface, Tol1: number): void;
  Perform(S1: Adaptor3d_Surface, U1min: number, U1sup: number, V1min: number, V1sup: number, Tol1: number): void;

  IsDone(): boolean;

  NbExt(): number;

  SquareDistance(N: number): number;

  PointOnS1(N: number): Extrema_POnSurf;

  PointOnS2(N: number): Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GenLocateExtCS: declare class Extrema_GenLocateExtCS

  constructor

  Perform(C: Adaptor3d_Curve, S: Adaptor3d_Surface, T: number, U: number, V: number, Tol1: number, Tol2: number): void;

  IsDone(): boolean;

  SquareDistance(): number;

  PointOnCurve(): Extrema_POnCurv;

  PointOnSurface(): Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GenLocateExtPS: declare class Extrema_GenLocateExtPS

  constructor

  Perform(theP: gp_Pnt, theU0: number, theV0: number, isDistanceCriteria?: boolean): void;

  IsDone(): boolean;

  SquareDistance(): number;

  Point(): Extrema_POnSurf;

  static IsMinDist(theP: gp_Pnt, theS: Adaptor3d_Surface, theU0: number, theV0: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GenLocateExtSS: declare class Extrema_GenLocateExtSS

  constructor

  Perform(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, U1: number, V1: number, U2: number, V2: number, Tol1: number, Tol2: number): void;

  IsDone(): boolean;

  SquareDistance(): number;

  PointOnS1(): Extrema_POnSurf;

  PointOnS2(): Extrema_POnSurf;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GlobOptFuncCCC0: declare class Extrema_GlobOptFuncCCC0 extends math_MultipleVarFunction

  constructor

  NbVariables(): number;

  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GlobOptFuncCCC1: declare class Extrema_GlobOptFuncCCC1 extends math_MultipleVarFunctionWithGradient

  constructor

  NbVariables(): number;

  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GlobOptFuncCCC2: declare class Extrema_GlobOptFuncCCC2 extends math_MultipleVarFunctionWithHessian

  constructor

  NbVariables(): number;

  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GlobOptFuncCQuadric: declare class Extrema_GlobOptFuncCQuadric extends math_MultipleVarFunction

  constructor

  LoadQuad(S: Adaptor3d_Surface, theUf: number, theUl: number, theVf: number, theVl: number): void;

  NbVariables(): number;

  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  QuadricParameters(theCT: math_VectorBase_double, theUV: math_VectorBase_double): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GlobOptFuncCS: declare class Extrema_GlobOptFuncCS extends math_MultipleVarFunctionWithHessian

  constructor

  NbVariables(): number;

  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GlobOptFuncConicS: declare class Extrema_GlobOptFuncConicS extends math_MultipleVarFunction

  constructor

  LoadConic(S: Adaptor3d_Curve, theTf: number, theTl: number): void;

  NbVariables(): number;

  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  ConicParameter(theUV: math_VectorBase_double): number;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_LocateExtCC: declare class Extrema_LocateExtCC

  constructor

  IsDone(): boolean;

  SquareDistance(): number;

  Point(P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_LocateExtCC2d: declare class Extrema_LocateExtCC2d

  constructor

  IsDone(): boolean;

  SquareDistance(): number;

  Point(P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_POnCurv: declare class Extrema_POnCurv

  constructor

  SetValues(theU: number, theP: gp_Pnt): void;

  Value(): gp_Pnt;

  Parameter(): number;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_POnCurv2d: declare class Extrema_POnCurv2d

  constructor

  SetValues(theU: number, theP: gp_Pnt2d): void;

  Value(): gp_Pnt2d;

  Parameter(): number;

  delete(): void;

  [Symbol.dispose](): void;

Extrema_POnSurf: declare class Extrema_POnSurf

  constructor

  Value(): gp_Pnt;

  SetParameters(theU: number, theV: number, thePnt: gp_Pnt): void;

  Parameter(theU?: number, theV?: number): { theU: number; theV: number };

  delete(): void;

  [Symbol.dispose](): void;

Extrema_POnSurfParams: declare class Extrema_POnSurfParams extends Extrema_POnSurf

  constructor

  SetSqrDistance(theSqrDistance: number): void;

  GetSqrDistance(): number;

  SetElementType(theElementType: Extrema_ElementType): void;

  GetElementType(): Extrema_ElementType;

  SetIndices(theIndexU: number, theIndexV: number): void;

  GetIndices(theIndexU?: number, theIndexV?: number): { theIndexU: number; theIndexV: number };

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f: declare class Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f

  constructor

  Initialize(theC: Adaptor2d_Curve2d, theUinf: number, theUsup: number, theTolF?: number): void;

  Perform(theP: gp_Pnt2d): void;

  IsDone(): boolean;

  SquareDistance(theN: number): number;

  NbExt(): number;

  IsMin(theN: number): boolean;

  Point(theN: number): Extrema_POnCurv2d;

  TrimmedSquareDistances(theDist1: number, theDist2: number, theP1: gp_Pnt2d, theP2: gp_Pnt2d): { theDist1: number; theDist2: number };

  delete(): void;

  [Symbol.dispose](): void;

Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db: declare class Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

  constructor

  Initialize(theC: Adaptor3d_Curve, theUinf: number, theUsup: number, theTolF?: number): void;

  Perform(theP: gp_Pnt): void;

  IsDone(): boolean;

  SquareDistance(theN: number): number;

  NbExt(): number;

  IsMin(theN: number): boolean;

  Point(theN: number): Extrema_POnCurv;

  TrimmedSquareDistances(theDist1: number, theDist2: number, theP1: gp_Pnt, theP2: gp_Pnt): { theDist1: number; theDist2: number };

  delete(): void;

  [Symbol.dispose](): void;

Extrema_ELPCOfLocateExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_ExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_EPCOfELPCOfLocateExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_EPCOfExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_classclassclassclassclassclassclassclassAdaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCur_8b7a66bf2ea31743: Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f

Extrema_SequenceOfPOnCurv: NCollection_Sequence_Extrema_POnCurv

Extrema_SequenceOfPOnCurv2d: NCollection_Sequence_Extrema_POnCurv2d

Extrema_SequenceOfPOnSurf: NCollection_Sequence_Extrema_POnSurf
