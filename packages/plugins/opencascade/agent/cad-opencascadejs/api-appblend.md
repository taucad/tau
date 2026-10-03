# libcascade — AppBlend

1 top-level symbols. Signatures are verbatim typescript.

AppBlend_Approx: declare class AppBlend_Approx

  // AppBlend_Approx.IsDone (method)
  IsDone(): boolean;

  // AppBlend_Approx.SurfShape (method)
  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  // AppBlend_Approx.Surface (method)
  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  // AppBlend_Approx.UDegree (method)
  UDegree(): number;

  // AppBlend_Approx.VDegree (method)
  VDegree(): number;

  // AppBlend_Approx.SurfPoles (method)
  SurfPoles(): NCollection_Array2_gp_Pnt;

  // AppBlend_Approx.SurfWeights (method)
  SurfWeights(): NCollection_Array2_double;

  // AppBlend_Approx.SurfUKnots (method)
  SurfUKnots(): NCollection_Array1_double;

  // AppBlend_Approx.SurfVKnots (method)
  SurfVKnots(): NCollection_Array1_double;

  // AppBlend_Approx.SurfUMults (method)
  SurfUMults(): NCollection_Array1_int;

  // AppBlend_Approx.SurfVMults (method)
  SurfVMults(): NCollection_Array1_int;

  // AppBlend_Approx.NbCurves2d (method)
  NbCurves2d(): number;

  // AppBlend_Approx.Curves2dShape (method)
  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  // AppBlend_Approx.Curve2d (method)
  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  // AppBlend_Approx.Curves2dDegree (method)
  Curves2dDegree(): number;

  // AppBlend_Approx.Curve2dPoles (method)
  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  // AppBlend_Approx.Curves2dKnots (method)
  Curves2dKnots(): NCollection_Array1_double;

  // AppBlend_Approx.Curves2dMults (method)
  Curves2dMults(): NCollection_Array1_int;

  // AppBlend_Approx.TolReached (method)
  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  // AppBlend_Approx.TolCurveOnSurf (method)
  TolCurveOnSurf(Index: number): number;

  // AppBlend_Approx.delete (method)
  delete(): void;

  // AppBlend_Approx.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
