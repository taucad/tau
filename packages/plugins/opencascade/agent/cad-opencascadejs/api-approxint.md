# libcascade — ApproxInt

2 top-level symbols. Signatures are verbatim typescript.

ApproxInt_KnotTools: declare class ApproxInt_KnotTools

  // ApproxInt_KnotTools.constructor (constructor)
  constructor();

  // ApproxInt_KnotTools.BuildKnots (method)
  static BuildKnots(thePntsXYZ: NCollection_Array1_gp_Pnt, thePntsU1V1: NCollection_Array1_gp_Pnt2d, thePntsU2V2: NCollection_Array1_gp_Pnt2d, thePars: math_VectorBase_double, theApproxXYZ: boolean, theApproxU1V1: boolean, theApproxU2V2: boolean, theMinNbPnts: number, theKnots: NCollection_DynamicArray_int): void;

  // ApproxInt_KnotTools.BuildCurvature (method)
  static BuildCurvature(theCoords: any, theDim: number, thePars: math_VectorBase_double, theCurv: NCollection_Array1_double, theMaxCurv?: number): { theMaxCurv: number };

  // ApproxInt_KnotTools.DefineParType (method)
  static DefineParType(theWL: IntPatch_WLine, theFpar: number, theLpar: number, theApproxXYZ: boolean, theApproxU1V1: boolean, theApproxU2V2: boolean): Approx_ParametrizationType;

  // ApproxInt_KnotTools.delete (method)
  delete(): void;

  // ApproxInt_KnotTools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ApproxInt_SvSurfaces: declare class ApproxInt_SvSurfaces

  // ApproxInt_SvSurfaces.Compute (method)
  Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

  // ApproxInt_SvSurfaces.Pnt (method)
  Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

  // ApproxInt_SvSurfaces.SeekPoint (method)
  SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

  // ApproxInt_SvSurfaces.Tangency (method)
  Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

  // ApproxInt_SvSurfaces.TangencyOnSurf1 (method)
  TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // ApproxInt_SvSurfaces.TangencyOnSurf2 (method)
  TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  // ApproxInt_SvSurfaces.SetUseSolver (method)
  SetUseSolver(theUseSol: boolean): void;

  // ApproxInt_SvSurfaces.GetUseSolver (method)
  GetUseSolver(): boolean;

  // ApproxInt_SvSurfaces.delete (method)
  delete(): void;

  // ApproxInt_SvSurfaces.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
