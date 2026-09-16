# libcascade — ApproxInt

2 top-level symbols. Signatures are verbatim typescript.

ApproxInt_KnotTools: declare class ApproxInt_KnotTools

  constructor

  static BuildKnots(thePntsXYZ: NCollection_Array1_gp_Pnt, thePntsU1V1: NCollection_Array1_gp_Pnt2d, thePntsU2V2: NCollection_Array1_gp_Pnt2d, thePars: math_VectorBase_double, theApproxXYZ: boolean, theApproxU1V1: boolean, theApproxU2V2: boolean, theMinNbPnts: number, theKnots: NCollection_DynamicArray_int): void;

  static BuildCurvature(theCoords: any, theDim: number, thePars: math_VectorBase_double, theCurv: NCollection_Array1_double, theMaxCurv?: number): { theMaxCurv: number };

  static DefineParType(theWL: IntPatch_WLine, theFpar: number, theLpar: number, theApproxXYZ: boolean, theApproxU1V1: boolean, theApproxU2V2: boolean): Approx_ParametrizationType;

  delete(): void;

  [Symbol.dispose](): void;

ApproxInt_SvSurfaces: declare class ApproxInt_SvSurfaces

  Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

  Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

  SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

  Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

  TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

  SetUseSolver(theUseSol: boolean): void;

  GetUseSolver(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
