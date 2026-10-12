# libcascade — Extrema (2)

24 top-level symbols. Signatures are verbatim typescript.

Extrema_GenLocateExtPS: declare class Extrema_GenLocateExtPS

  // Extrema_GenLocateExtPS.constructor (constructor)
  constructor(theS: Adaptor3d_Surface, theTolU?: number, theTolV?: number);

  // Extrema_GenLocateExtPS.Perform (method)
  Perform(theP: gp_Pnt, theU0: number, theV0: number, isDistanceCriteria?: boolean): void;

  // Extrema_GenLocateExtPS.IsDone (method)
  IsDone(): boolean;

  // Extrema_GenLocateExtPS.SquareDistance (method)
  SquareDistance(): number;

  // Extrema_GenLocateExtPS.Point (method)
  Point(): Extrema_POnSurf;

  // Extrema_GenLocateExtPS.IsMinDist (method)
  static IsMinDist(theP: gp_Pnt, theS: Adaptor3d_Surface, theU0: number, theV0: number): boolean;

  // Extrema_GenLocateExtPS.delete (method)
  delete(): void;

  // Extrema_GenLocateExtPS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GenLocateExtSS: declare class Extrema_GenLocateExtSS

  // Extrema_GenLocateExtSS.constructor (constructor)
  constructor();
  constructor(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, U1: number, V1: number, U2: number, V2: number, Tol1: number, Tol2: number);

  // Extrema_GenLocateExtSS.Perform (method)
  Perform(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, U1: number, V1: number, U2: number, V2: number, Tol1: number, Tol2: number): void;

  // Extrema_GenLocateExtSS.IsDone (method)
  IsDone(): boolean;

  // Extrema_GenLocateExtSS.SquareDistance (method)
  SquareDistance(): number;

  // Extrema_GenLocateExtSS.PointOnS1 (method)
  PointOnS1(): Extrema_POnSurf;

  // Extrema_GenLocateExtSS.PointOnS2 (method)
  PointOnS2(): Extrema_POnSurf;

  // Extrema_GenLocateExtSS.delete (method)
  delete(): void;

  // Extrema_GenLocateExtSS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GlobOptFuncCCC0: declare class Extrema_GlobOptFuncCCC0 extends math_MultipleVarFunction

  // Extrema_GlobOptFuncCCC0.constructor (constructor)
  constructor(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve);
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d);

  // Extrema_GlobOptFuncCCC0.NbVariables (method)
  NbVariables(): number;

  // Extrema_GlobOptFuncCCC0.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncCCC0.delete (method)
  delete(): void;

  // Extrema_GlobOptFuncCCC0.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GlobOptFuncCCC1: declare class Extrema_GlobOptFuncCCC1 extends math_MultipleVarFunctionWithGradient

  // Extrema_GlobOptFuncCCC1.constructor (constructor)
  constructor(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve);
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d);

  // Extrema_GlobOptFuncCCC1.NbVariables (method)
  NbVariables(): number;

  // Extrema_GlobOptFuncCCC1.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncCCC1.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // Extrema_GlobOptFuncCCC1.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncCCC1.delete (method)
  delete(): void;

  // Extrema_GlobOptFuncCCC1.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GlobOptFuncCCC2: declare class Extrema_GlobOptFuncCCC2 extends math_MultipleVarFunctionWithHessian

  // Extrema_GlobOptFuncCCC2.constructor (constructor)
  constructor(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve);
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d);

  // Extrema_GlobOptFuncCCC2.NbVariables (method)
  NbVariables(): number;

  // Extrema_GlobOptFuncCCC2.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncCCC2.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // Extrema_GlobOptFuncCCC2.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncCCC2.delete (method)
  delete(): void;

  // Extrema_GlobOptFuncCCC2.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GlobOptFuncCQuadric: declare class Extrema_GlobOptFuncCQuadric extends math_MultipleVarFunction

  // Extrema_GlobOptFuncCQuadric.constructor (constructor)
  constructor(C: Adaptor3d_Curve);
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface);
  constructor(C: Adaptor3d_Curve, theTf: number, theTl: number);

  // Extrema_GlobOptFuncCQuadric.LoadQuad (method)
  LoadQuad(S: Adaptor3d_Surface, theUf: number, theUl: number, theVf: number, theVl: number): void;

  // Extrema_GlobOptFuncCQuadric.NbVariables (method)
  NbVariables(): number;

  // Extrema_GlobOptFuncCQuadric.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncCQuadric.QuadricParameters (method)
  QuadricParameters(theCT: math_VectorBase_double, theUV: math_VectorBase_double): void;

  // Extrema_GlobOptFuncCQuadric.delete (method)
  delete(): void;

  // Extrema_GlobOptFuncCQuadric.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GlobOptFuncCS: declare class Extrema_GlobOptFuncCS extends math_MultipleVarFunctionWithHessian

  // Extrema_GlobOptFuncCS.constructor (constructor)
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface);

  // Extrema_GlobOptFuncCS.NbVariables (method)
  NbVariables(): number;

  // Extrema_GlobOptFuncCS.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncCS.Gradient (method)
  Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

  // Extrema_GlobOptFuncCS.Values (method)
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
  Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncCS.delete (method)
  delete(): void;

  // Extrema_GlobOptFuncCS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GlobOptFuncConicS: declare class Extrema_GlobOptFuncConicS extends math_MultipleVarFunction

  // Extrema_GlobOptFuncConicS.constructor (constructor)
  constructor(S: Adaptor3d_Surface);
  constructor(C: Adaptor3d_Curve, S: Adaptor3d_Surface);
  constructor(S: Adaptor3d_Surface, theUf: number, theUl: number, theVf: number, theVl: number);

  // Extrema_GlobOptFuncConicS.LoadConic (method)
  LoadConic(S: Adaptor3d_Curve, theTf: number, theTl: number): void;

  // Extrema_GlobOptFuncConicS.NbVariables (method)
  NbVariables(): number;

  // Extrema_GlobOptFuncConicS.Value (method)
  Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

  // Extrema_GlobOptFuncConicS.ConicParameter (method)
  ConicParameter(theUV: math_VectorBase_double): number;

  // Extrema_GlobOptFuncConicS.delete (method)
  delete(): void;

  // Extrema_GlobOptFuncConicS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_LocateExtCC: declare class Extrema_LocateExtCC

  // Extrema_LocateExtCC.constructor (constructor)
  constructor(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, U0: number, V0: number);

  // Extrema_LocateExtCC.IsDone (method)
  IsDone(): boolean;

  // Extrema_LocateExtCC.SquareDistance (method)
  SquareDistance(): number;

  // Extrema_LocateExtCC.Point (method)
  Point(P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;

  // Extrema_LocateExtCC.delete (method)
  delete(): void;

  // Extrema_LocateExtCC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_LocateExtCC2d: declare class Extrema_LocateExtCC2d

  // Extrema_LocateExtCC2d.constructor (constructor)
  constructor(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, U0: number, V0: number);

  // Extrema_LocateExtCC2d.IsDone (method)
  IsDone(): boolean;

  // Extrema_LocateExtCC2d.SquareDistance (method)
  SquareDistance(): number;

  // Extrema_LocateExtCC2d.Point (method)
  Point(P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;

  // Extrema_LocateExtCC2d.delete (method)
  delete(): void;

  // Extrema_LocateExtCC2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_POnCurv: declare class Extrema_POnCurv

  // Extrema_POnCurv.constructor (constructor)
  constructor();
  constructor(theU: number, theP: gp_Pnt);

  // Extrema_POnCurv.SetValues (method)
  SetValues(theU: number, theP: gp_Pnt): void;

  // Extrema_POnCurv.Value (method)
  Value(): gp_Pnt;

  // Extrema_POnCurv.Parameter (method)
  Parameter(): number;

  // Extrema_POnCurv.delete (method)
  delete(): void;

  // Extrema_POnCurv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_POnCurv2d: declare class Extrema_POnCurv2d

  // Extrema_POnCurv2d.constructor (constructor)
  constructor();
  constructor(theU: number, theP: gp_Pnt2d);

  // Extrema_POnCurv2d.SetValues (method)
  SetValues(theU: number, theP: gp_Pnt2d): void;

  // Extrema_POnCurv2d.Value (method)
  Value(): gp_Pnt2d;

  // Extrema_POnCurv2d.Parameter (method)
  Parameter(): number;

  // Extrema_POnCurv2d.delete (method)
  delete(): void;

  // Extrema_POnCurv2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_POnSurf: declare class Extrema_POnSurf

  // Extrema_POnSurf.constructor (constructor)
  constructor();
  constructor(theU: number, theV: number, theP: gp_Pnt);

  // Extrema_POnSurf.Value (method)
  Value(): gp_Pnt;

  // Extrema_POnSurf.SetParameters (method)
  SetParameters(theU: number, theV: number, thePnt: gp_Pnt): void;

  // Extrema_POnSurf.Parameter (method)
  Parameter(theU?: number, theV?: number): { theU: number; theV: number };

  // Extrema_POnSurf.delete (method)
  delete(): void;

  // Extrema_POnSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_POnSurfParams: declare class Extrema_POnSurfParams extends Extrema_POnSurf

  // Extrema_POnSurfParams.constructor (constructor)
  constructor();
  constructor(theU: number, theV: number, thePnt: gp_Pnt);

  // Extrema_POnSurfParams.SetSqrDistance (method)
  SetSqrDistance(theSqrDistance: number): void;

  // Extrema_POnSurfParams.GetSqrDistance (method)
  GetSqrDistance(): number;

  // Extrema_POnSurfParams.SetElementType (method)
  SetElementType(theElementType: Extrema_ElementType): void;

  // Extrema_POnSurfParams.GetElementType (method)
  GetElementType(): Extrema_ElementType;

  // Extrema_POnSurfParams.SetIndices (method)
  SetIndices(theIndexU: number, theIndexV: number): void;

  // Extrema_POnSurfParams.GetIndices (method)
  GetIndices(theIndexU?: number, theIndexV?: number): { theIndexU: number; theIndexV: number };

  // Extrema_POnSurfParams.delete (method)
  delete(): void;

  // Extrema_POnSurfParams.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f: declare class Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.constructor (constructor)
  constructor();
  constructor(theP: gp_Pnt2d, theC: Adaptor2d_Curve2d, theTolF?: number);
  constructor(theP: gp_Pnt2d, theC: Adaptor2d_Curve2d, theUinf: number, theUsup: number, theTolF?: number);

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.Initialize (method)
  Initialize(theC: Adaptor2d_Curve2d, theUinf: number, theUsup: number, theTolF?: number): void;

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.Perform (method)
  Perform(theP: gp_Pnt2d): void;

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.IsDone (method)
  IsDone(): boolean;

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.SquareDistance (method)
  SquareDistance(theN: number): number;

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.NbExt (method)
  NbExt(): number;

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.IsMin (method)
  IsMin(theN: number): boolean;

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.Point (method)
  Point(theN: number): Extrema_POnCurv2d;

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.TrimmedSquareDistances (method)
  TrimmedSquareDistances(theDist1: number, theDist2: number, theP1: gp_Pnt2d, theP2: gp_Pnt2d): { theDist1: number; theDist2: number };

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.delete (method)
  delete(): void;

  // Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db: declare class Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.constructor (constructor)
  constructor();
  constructor(theP: gp_Pnt, theC: Adaptor3d_Curve, theTolF?: number);
  constructor(theP: gp_Pnt, theC: Adaptor3d_Curve, theUinf: number, theUsup: number, theTolF?: number);

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.Initialize (method)
  Initialize(theC: Adaptor3d_Curve, theUinf: number, theUsup: number, theTolF?: number): void;

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.Perform (method)
  Perform(theP: gp_Pnt): void;

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.IsDone (method)
  IsDone(): boolean;

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.SquareDistance (method)
  SquareDistance(theN: number): number;

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.NbExt (method)
  NbExt(): number;

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.IsMin (method)
  IsMin(theN: number): boolean;

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.Point (method)
  Point(theN: number): Extrema_POnCurv;

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.TrimmedSquareDistances (method)
  TrimmedSquareDistances(theDist1: number, theDist2: number, theP1: gp_Pnt, theP2: gp_Pnt): { theDist1: number; theDist2: number };

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.delete (method)
  delete(): void;

  // Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Extrema_ELPCOfLocateExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_ExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_EPCOfELPCOfLocateExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_EPCOfExtPC: Extrema_GGExtPC_Adaptor3d_Curve_Extrema_CurveTool_Extrema_ExtPElC_gp_Pnt_gp_Vec_Extrema_POnCurv_NCollection_Sequence_Extrema_POnCurv_Extrema_GGenExtPC_Adaptor3d_Curve_Extrema_CurveToo_9726d4281525f8db

Extrema_GGExtPC_classclassclassclassclassclassclassclassAdaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCur_8b7a66bf2ea31743: Extrema_GGExtPC_Adaptor2d_Curve2d_Extrema_Curve2dTool_Extrema_ExtPElC2d_gp_Pnt2d_gp_Vec2d_Extrema_POnCurv2d_NCollection_Sequence_Extrema_POnCurv2d_Extrema_GGenExtPC_Adaptor2d_Curve2d_255e67ef2564152f

Extrema_SequenceOfPOnCurv: NCollection_Sequence_Extrema_POnCurv

Extrema_SequenceOfPOnCurv2d: NCollection_Sequence_Extrema_POnCurv2d

Extrema_SequenceOfPOnSurf: NCollection_Sequence_Extrema_POnSurf
