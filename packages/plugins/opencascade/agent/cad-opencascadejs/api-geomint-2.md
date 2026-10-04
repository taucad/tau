# libcascade — GeomInt (2)

6 top-level symbols. Signatures are verbatim typescript.

GeomInt_TheMultiLineOfWLApprox: declare class GeomInt_TheMultiLineOfWLApprox

  // GeomInt_TheMultiLineOfWLApprox.constructor (constructor)
  constructor();
  constructor(line: IntPatch_WLine, NbP3d: number, NbP2d: number, ApproxU1V1: boolean, ApproxU2V2: boolean, xo: number, yo: number, zo: number, u1o: number, v1o: number, u2o: number, v2o: number, P2DOnFirst: boolean, IndMin?: number, IndMax?: number);

  // GeomInt_TheMultiLineOfWLApprox.FirstPoint (method)
  FirstPoint(): number;

  // GeomInt_TheMultiLineOfWLApprox.LastPoint (method)
  LastPoint(): number;

  // GeomInt_TheMultiLineOfWLApprox.NbP2d (method)
  NbP2d(): number;

  // GeomInt_TheMultiLineOfWLApprox.NbP3d (method)
  NbP3d(): number;

  // GeomInt_TheMultiLineOfWLApprox.WhatStatus (method)
  WhatStatus(): Approx_Status;

  // GeomInt_TheMultiLineOfWLApprox.Value (method)
  Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
  Value(MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;

  // GeomInt_TheMultiLineOfWLApprox.Tangency (method)
  Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  Tangency(MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomInt_TheMultiLineOfWLApprox.MakeMLBetween (method)
  MakeMLBetween(Low: number, High: number, NbPointsToInsert: number): GeomInt_TheMultiLineOfWLApprox;

  // GeomInt_TheMultiLineOfWLApprox.MakeMLOneMorePoint (method)
  MakeMLOneMorePoint(Low: number, High: number, indbad: number, OtherLine: GeomInt_TheMultiLineOfWLApprox): boolean;

  // GeomInt_TheMultiLineOfWLApprox.Dump (method)
  Dump(): void;

  // GeomInt_TheMultiLineOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_TheMultiLineOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_TheMultiLineToolOfWLApprox: declare class GeomInt_TheMultiLineToolOfWLApprox

  // GeomInt_TheMultiLineToolOfWLApprox.constructor (constructor)
  constructor();

  // GeomInt_TheMultiLineToolOfWLApprox.FirstPoint (method)
  static FirstPoint(ML: GeomInt_TheMultiLineOfWLApprox): number;

  // GeomInt_TheMultiLineToolOfWLApprox.LastPoint (method)
  static LastPoint(ML: GeomInt_TheMultiLineOfWLApprox): number;

  // GeomInt_TheMultiLineToolOfWLApprox.NbP2d (method)
  static NbP2d(ML: GeomInt_TheMultiLineOfWLApprox): number;

  // GeomInt_TheMultiLineToolOfWLApprox.NbP3d (method)
  static NbP3d(ML: GeomInt_TheMultiLineOfWLApprox): number;

  // GeomInt_TheMultiLineToolOfWLApprox.Value (method)
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;

  // GeomInt_TheMultiLineToolOfWLApprox.Tangency (method)
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomInt_TheMultiLineToolOfWLApprox.Curvature (method)
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

  // GeomInt_TheMultiLineToolOfWLApprox.MakeMLBetween (method)
  static MakeMLBetween(ML: GeomInt_TheMultiLineOfWLApprox, I1: number, I2: number, NbPMin: number): GeomInt_TheMultiLineOfWLApprox;

  // GeomInt_TheMultiLineToolOfWLApprox.MakeMLOneMorePoint (method)
  static MakeMLOneMorePoint(ML: GeomInt_TheMultiLineOfWLApprox, I1: number, I2: number, indbad: number, OtherLine: GeomInt_TheMultiLineOfWLApprox): boolean;

  // GeomInt_TheMultiLineToolOfWLApprox.WhatStatus (method)
  static WhatStatus(ML: GeomInt_TheMultiLineOfWLApprox, I1: number, I2: number): Approx_Status;

  // GeomInt_TheMultiLineToolOfWLApprox.Dump (method)
  static Dump(ML: GeomInt_TheMultiLineOfWLApprox): void;

  // GeomInt_TheMultiLineToolOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_TheMultiLineToolOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_ThePrmPrmSvSurfacesOfWLApprox: declare class GeomInt_ThePrmPrmSvSurfacesOfWLApprox extends ApproxInt_SvSurfaces

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.constructor (constructor)
  constructor(Surf1: Adaptor3d_Surface, Surf2: Adaptor3d_Surface);

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.Compute (method)
  Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.Pnt (method)
  Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.SeekPoint (method)
  SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.Tangency (method)
  Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.TangencyOnSurf1 (method)
  TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.TangencyOnSurf2 (method)
  TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_ThePrmPrmSvSurfacesOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox: declare class GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox extends math_FunctionSetWithDerivatives

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.constructor (constructor)
  constructor();
  constructor(IS: IntSurf_Quadric);
  constructor(PS: Adaptor3d_Surface, IS: IntSurf_Quadric);

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Set (method)
  Set(PS: Adaptor3d_Surface): void;
  Set(Tolerance: number): void;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.SetImplicitSurface (method)
  SetImplicitSurface(IS: IntSurf_Quadric): void;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.NbVariables (method)
  NbVariables(): number;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.NbEquations (method)
  NbEquations(): number;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Root (method)
  Root(): number;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Tolerance (method)
  Tolerance(): number;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Point (method)
  Point(): gp_Pnt;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.IsTangent (method)
  IsTangent(): boolean;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Direction3d (method)
  Direction3d(): gp_Vec;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.Direction2d (method)
  Direction2d(): gp_Dir2d;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.PSurface (method)
  PSurface(): Adaptor3d_Surface;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.ISurface (method)
  ISurface(): IntSurf_Quadric;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.delete (method)
  delete(): void;

  // GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_WLApprox: declare class GeomInt_WLApprox

  // GeomInt_WLApprox.constructor (constructor)
  constructor();

  // GeomInt_WLApprox.SetParameters (method)
  SetParameters(Tol3d: number, Tol2d: number, DegMin: number, DegMax: number, NbIterMax: number, NbPntMax?: number, ApproxWithTangency?: boolean, Parametrization?: Approx_ParametrizationType): void;

  // GeomInt_WLApprox.TolReached3d (method)
  TolReached3d(): number;

  // GeomInt_WLApprox.TolReached2d (method)
  TolReached2d(): number;

  // GeomInt_WLApprox.IsDone (method)
  IsDone(): boolean;

  // GeomInt_WLApprox.NbMultiCurves (method)
  NbMultiCurves(): number;

  // GeomInt_WLApprox.Value (method)
  Value(Index: number): AppParCurves_MultiBSpCurve;

  // GeomInt_WLApprox.Parameters (method)
  static Parameters(Line: GeomInt_TheMultiLineOfWLApprox, firstP: number, lastP: number, Par: Approx_ParametrizationType, TheParameters: math_VectorBase_double): void;

  // GeomInt_WLApprox.delete (method)
  delete(): void;

  // GeomInt_WLApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomInt_VectorOfReal: NCollection_DynamicArray_double
