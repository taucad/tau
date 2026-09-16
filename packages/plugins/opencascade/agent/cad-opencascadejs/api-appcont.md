# libcascade — AppCont

2 top-level symbols. Signatures are verbatim typescript.

AppCont_Function: declare class AppCont_Function

  GetNumberOfPoints(theNbPnt?: number, theNbPnt2d?: number): { theNbPnt: number; theNbPnt2d: number };

  GetNbOf3dPoints(): number;

  GetNbOf2dPoints(): number;

  FirstParameter(): number;

  LastParameter(): number;

  Value(theU: number, thePnt2d: NCollection_Array1_gp_Pnt2d, thePnt: NCollection_Array1_gp_Pnt): boolean;

  D1(theU: number, theVec2d: NCollection_Array1_gp_Vec2d, theVec: NCollection_Array1_gp_Vec): boolean;

  PeriodInformation(argNo0: number, IsPeriodic: boolean, thePeriod: number): { IsPeriodic: boolean; thePeriod: number };

  delete(): void;

  [Symbol.dispose](): void;

AppCont_LeastSquare: declare class AppCont_LeastSquare

  constructor

  Value(): AppParCurves_MultiCurve;

  Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;
