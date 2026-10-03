# libcascade — BRepApprox (2)

3 top-level symbols. Signatures are verbatim typescript.

BRepApprox_TheMultiLineToolOfApprox: declare class BRepApprox_TheMultiLineToolOfApprox

  // BRepApprox_TheMultiLineToolOfApprox.constructor (constructor)
  constructor();

  // BRepApprox_TheMultiLineToolOfApprox.FirstPoint (method)
  static FirstPoint(ML: BRepApprox_TheMultiLineOfApprox): number;

  // BRepApprox_TheMultiLineToolOfApprox.LastPoint (method)
  static LastPoint(ML: BRepApprox_TheMultiLineOfApprox): number;

  // BRepApprox_TheMultiLineToolOfApprox.NbP2d (method)
  static NbP2d(ML: BRepApprox_TheMultiLineOfApprox): number;

  // BRepApprox_TheMultiLineToolOfApprox.NbP3d (method)
  static NbP3d(ML: BRepApprox_TheMultiLineOfApprox): number;

  // BRepApprox_TheMultiLineToolOfApprox.Value (method)
  static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
  static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
  static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;

  // BRepApprox_TheMultiLineToolOfApprox.Tangency (method)
  static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

  // BRepApprox_TheMultiLineToolOfApprox.Curvature (method)
  static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
  static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
  static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

  // BRepApprox_TheMultiLineToolOfApprox.MakeMLBetween (method)
  static MakeMLBetween(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number, NbPMin: number): BRepApprox_TheMultiLineOfApprox;

  // BRepApprox_TheMultiLineToolOfApprox.MakeMLOneMorePoint (method)
  static MakeMLOneMorePoint(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number, indbad: number, OtherLine: BRepApprox_TheMultiLineOfApprox): boolean;

  // BRepApprox_TheMultiLineToolOfApprox.WhatStatus (method)
  static WhatStatus(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number): Approx_Status;

  // BRepApprox_TheMultiLineToolOfApprox.Dump (method)
  static Dump(ML: BRepApprox_TheMultiLineOfApprox): void;

  // BRepApprox_TheMultiLineToolOfApprox.delete (method)
  delete(): void;

  // BRepApprox_TheMultiLineToolOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_ThePrmPrmSvSurfacesOfApprox: declare class BRepApprox_ThePrmPrmSvSurfacesOfApprox extends ApproxInt_SvSurfaces

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.constructor (constructor)
  constructor(Surf1: BRepAdaptor_Surface, Surf2: BRepAdaptor_Surface);

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.Compute (method)
  Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.Pnt (method)
  Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.SeekPoint (method)
  SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.Tangency (method)
  Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.TangencyOnSurf1 (method)
  TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.TangencyOnSurf2 (method)
  TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.delete (method)
  delete(): void;

  // BRepApprox_ThePrmPrmSvSurfacesOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox: declare class BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox extends math_FunctionSetWithDerivatives

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.constructor (constructor)
  constructor();
  constructor(IS: IntSurf_Quadric);
  constructor(PS: BRepAdaptor_Surface, IS: IntSurf_Quadric);

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Set (method)
  Set(PS: BRepAdaptor_Surface): void;
  Set(Tolerance: number): void;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.SetImplicitSurface (method)
  SetImplicitSurface(IS: IntSurf_Quadric): void;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.NbVariables (method)
  NbVariables(): number;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.NbEquations (method)
  NbEquations(): number;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Root (method)
  Root(): number;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Tolerance (method)
  Tolerance(): number;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Point (method)
  Point(): gp_Pnt;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.IsTangent (method)
  IsTangent(): boolean;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Direction3d (method)
  Direction3d(): gp_Vec;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.Direction2d (method)
  Direction2d(): gp_Dir2d;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.PSurface (method)
  PSurface(): BRepAdaptor_Surface;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.ISurface (method)
  ISurface(): IntSurf_Quadric;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.delete (method)
  delete(): void;

  // BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
