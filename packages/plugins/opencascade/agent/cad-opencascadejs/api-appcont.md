# libcascade — AppCont

2 top-level symbols. Signatures are verbatim typescript.

AppCont_Function: declare class AppCont_Function

  // AppCont_Function.GetNumberOfPoints (method)
  GetNumberOfPoints(theNbPnt?: number, theNbPnt2d?: number): { theNbPnt: number; theNbPnt2d: number };

  // AppCont_Function.GetNbOf3dPoints (method)
  GetNbOf3dPoints(): number;

  // AppCont_Function.GetNbOf2dPoints (method)
  GetNbOf2dPoints(): number;

  // AppCont_Function.FirstParameter (method)
  FirstParameter(): number;

  // AppCont_Function.LastParameter (method)
  LastParameter(): number;

  // AppCont_Function.Value (method)
  Value(theU: number, thePnt2d: NCollection_Array1_gp_Pnt2d, thePnt: NCollection_Array1_gp_Pnt): boolean;

  // AppCont_Function.D1 (method)
  D1(theU: number, theVec2d: NCollection_Array1_gp_Vec2d, theVec: NCollection_Array1_gp_Vec): boolean;

  // AppCont_Function.PeriodInformation (method)
  PeriodInformation(argNo0: number, IsPeriodic: boolean, thePeriod: number): { IsPeriodic: boolean; thePeriod: number };

  // AppCont_Function.delete (method)
  delete(): void;

  // AppCont_Function.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

AppCont_LeastSquare: declare class AppCont_LeastSquare

  // AppCont_LeastSquare.constructor (constructor)
  constructor(SSP: AppCont_Function, U0: number, U1: number, FirstCons: AppParCurves_Constraint, LastCons: AppParCurves_Constraint, Deg: number, NbPoints: number);

  // AppCont_LeastSquare.Value (method)
  Value(): AppParCurves_MultiCurve;

  // AppCont_LeastSquare.Error (method)
  Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  // AppCont_LeastSquare.IsDone (method)
  IsDone(): boolean;

  // AppCont_LeastSquare.delete (method)
  delete(): void;

  // AppCont_LeastSquare.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
