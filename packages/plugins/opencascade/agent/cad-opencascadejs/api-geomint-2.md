# libcascade — GeomInt (2)

5 top-level symbols. Signatures are verbatim typescript.

GeomInt_TheMultiLineToolOfWLApprox: declare class GeomInt_TheMultiLineToolOfWLApprox

  constructor

  static FirstPoint(ML: GeomInt_TheMultiLineOfWLApprox): number;

  static LastPoint(ML: GeomInt_TheMultiLineOfWLApprox): number;

  static NbP2d(ML: GeomInt_TheMultiLineOfWLApprox): number;

  static NbP3d(ML: GeomInt_TheMultiLineOfWLApprox): number;

  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  static Value(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;

  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Tangency(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Curvature(ML: GeomInt_TheMultiLineOfWLApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

  static MakeMLBetween(ML: GeomInt_TheMultiLineOfWLApprox, I1: number, I2: number, NbPMin: number): GeomInt_TheMultiLineOfWLApprox;

  static MakeMLOneMorePoint(ML: GeomInt_TheMultiLineOfWLApprox, I1: number, I2: number, indbad: number, OtherLine: GeomInt_TheMultiLineOfWLApprox): boolean;

  static WhatStatus(ML: GeomInt_TheMultiLineOfWLApprox, I1: number, I2: number): Approx_Status;

  static Dump(ML: GeomInt_TheMultiLineOfWLApprox): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomInt_ThePrmPrmSvSurfacesOfWLApprox: declare class GeomInt_ThePrmPrmSvSurfacesOfWLApprox extends ApproxInt_SvSurfaces

  constructor

  Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

  Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

  SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

  Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

  TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  delete(): void;

  [Symbol.dispose](): void;

GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox: declare class GeomInt_TheZerImpFuncOfTheImpPrmSvSurfacesOfWLApprox extends math_FunctionSetWithDerivatives

  constructor

  Set(PS: Adaptor3d_Surface): void;
  Set(Tolerance: number): void;
  Set(PS: Adaptor3d_Surface): void;
  Set(Tolerance: number): void;

  SetImplicitSurface(IS: IntSurf_Quadric): void;

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Root(): number;

  Tolerance(): number;

  Point(): gp_Pnt;

  IsTangent(): boolean;

  Direction3d(): gp_Vec;

  Direction2d(): gp_Dir2d;

  PSurface(): Adaptor3d_Surface;

  ISurface(): IntSurf_Quadric;

  delete(): void;

  [Symbol.dispose](): void;

GeomInt_WLApprox: declare class GeomInt_WLApprox

  constructor

  SetParameters(Tol3d: number, Tol2d: number, DegMin: number, DegMax: number, NbIterMax: number, NbPntMax?: number, ApproxWithTangency?: boolean, Parametrization?: Approx_ParametrizationType): void;

  TolReached3d(): number;

  TolReached2d(): number;

  IsDone(): boolean;

  NbMultiCurves(): number;

  Value(Index: number): AppParCurves_MultiBSpCurve;

  static Parameters(Line: GeomInt_TheMultiLineOfWLApprox, firstP: number, lastP: number, Par: Approx_ParametrizationType, TheParameters: math_VectorBase_double): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomInt_VectorOfReal: NCollection_DynamicArray_double
