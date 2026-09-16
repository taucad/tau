# libcascade — CSLib

6 top-level symbols. Signatures are verbatim typescript.

CSLib: declare class CSLib

  constructor

  static DNNUV(theNu: number, theNv: number, theDerSurf: NCollection_Array2_gp_Vec): gp_Vec;
  static DNNUV(theNu: number, theNv: number, theDerSurf1: NCollection_Array2_gp_Vec, theDerSurf2: NCollection_Array2_gp_Vec): gp_Vec;
  static DNNUV(theNu: number, theNv: number, theDerSurf: NCollection_Array2_gp_Vec): gp_Vec;
  static DNNUV(theNu: number, theNv: number, theDerSurf1: NCollection_Array2_gp_Vec, theDerSurf2: NCollection_Array2_gp_Vec): gp_Vec;

  delete(): void;

  [Symbol.dispose](): void;

CSLib_Class2d: declare class CSLib_Class2d

  constructor

  SiDans(thePoint: gp_Pnt2d): CSLib_Class2d_Result;

  SiDans_OnMode(thePoint: gp_Pnt2d, theTol: number): CSLib_Class2d_Result;

  delete(): void;

  [Symbol.dispose](): void;

CSLib_Class2d_Result: typeof CSLib_Class2d_Result[keyof typeof CSLib_Class2d_Result]

CSLib_DerivativeStatus: typeof CSLib_DerivativeStatus[keyof typeof CSLib_DerivativeStatus]

CSLib_NormalPolyDef: declare class CSLib_NormalPolyDef extends math_FunctionWithDerivative

  constructor

  Value(X: number, F: number): { returnValue: boolean; F: number };

  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  delete(): void;

  [Symbol.dispose](): void;

CSLib_NormalStatus: typeof CSLib_NormalStatus[keyof typeof CSLib_NormalStatus]
