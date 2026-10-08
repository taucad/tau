# libcascade — CSLib

6 top-level symbols. Signatures are verbatim typescript.

CSLib: declare class CSLib

  // CSLib.constructor (constructor)
  constructor();

  // CSLib.DNNUV (method)
  static DNNUV(theNu: number, theNv: number, theDerSurf: NCollection_Array2_gp_Vec): gp_Vec;
  static DNNUV(theNu: number, theNv: number, theDerSurf1: NCollection_Array2_gp_Vec, theDerSurf2: NCollection_Array2_gp_Vec): gp_Vec;

  // CSLib.delete (method)
  delete(): void;

  // CSLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CSLib_Class2d: declare class CSLib_Class2d

  // CSLib_Class2d.constructor (constructor)
  constructor();
  constructor(thePnts2d: NCollection_Array1_gp_Pnt2d, theTolU: number, theTolV: number, theUMin: number, theVMin: number, theUMax: number, theVMax: number);
  constructor(thePnts2d: NCollection_Sequence_gp_Pnt2d, theTolU: number, theTolV: number, theUMin: number, theVMin: number, theUMax: number, theVMax: number);
  constructor(thePnts2d: NCollection_DynamicArray_gp_Pnt2d, theTolU: number, theTolV: number, theUMin: number, theVMin: number, theUMax: number, theVMax: number);

  // CSLib_Class2d.SiDans (method)
  SiDans(thePoint: gp_Pnt2d): CSLib_Class2d_Result;

  // CSLib_Class2d.SiDans_OnMode (method)
  SiDans_OnMode(thePoint: gp_Pnt2d, theTol: number): CSLib_Class2d_Result;

  // CSLib_Class2d.delete (method)
  delete(): void;

  // CSLib_Class2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CSLib_Class2d_Result: typeof CSLib_Class2d_Result[keyof typeof CSLib_Class2d_Result]

  readonly Result_Inside: 'Result_Inside'

  readonly Result_Outside: 'Result_Outside'

  readonly Result_Uncertain: 'Result_Uncertain'

CSLib_DerivativeStatus: typeof CSLib_DerivativeStatus[keyof typeof CSLib_DerivativeStatus]

  readonly CSLib_Done: 'CSLib_Done'

  readonly CSLib_D1uIsNull: 'CSLib_D1uIsNull'

  readonly CSLib_D1vIsNull: 'CSLib_D1vIsNull'

  readonly CSLib_D1IsNull: 'CSLib_D1IsNull'

  readonly CSLib_D1uD1vRatioIsNull: 'CSLib_D1uD1vRatioIsNull'

  readonly CSLib_D1vD1uRatioIsNull: 'CSLib_D1vD1uRatioIsNull'

  readonly CSLib_D1uIsParallelD1v: 'CSLib_D1uIsParallelD1v'

CSLib_NormalPolyDef: declare class CSLib_NormalPolyDef extends math_FunctionWithDerivative

  // CSLib_NormalPolyDef.constructor (constructor)
  constructor(theK0: number, theLi: NCollection_Array1_double);

  // CSLib_NormalPolyDef.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // CSLib_NormalPolyDef.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // CSLib_NormalPolyDef.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // CSLib_NormalPolyDef.delete (method)
  delete(): void;

  // CSLib_NormalPolyDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CSLib_NormalStatus: typeof CSLib_NormalStatus[keyof typeof CSLib_NormalStatus]

  readonly CSLib_Singular: 'CSLib_Singular'

  readonly CSLib_Defined: 'CSLib_Defined'

  readonly CSLib_InfinityOfSolutions: 'CSLib_InfinityOfSolutions'

  readonly CSLib_D1NuIsNull: 'CSLib_D1NuIsNull'

  readonly CSLib_D1NvIsNull: 'CSLib_D1NvIsNull'

  readonly CSLib_D1NIsNull: 'CSLib_D1NIsNull'

  readonly CSLib_D1NuNvRatioIsNull: 'CSLib_D1NuNvRatioIsNull'

  readonly CSLib_D1NvNuRatioIsNull: 'CSLib_D1NvNuRatioIsNull'

  readonly CSLib_D1NuIsParallelD1Nv: 'CSLib_D1NuIsParallelD1Nv'
