# libcascade — BSplSLib

3 top-level symbols. Signatures are verbatim typescript.

BSplSLib: declare class BSplSLib

  // BSplSLib.constructor (constructor)
  constructor();

  // BSplSLib.RationalDerivative (method)
  static RationalDerivative(UDeg: number, VDeg: number, N: number, M: number, Ders: number, RDers: number, All: boolean): { Ders: number; RDers: number };

  // BSplSLib.D0 (method)
  static D0(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt): void;

  // BSplSLib.D1 (method)
  static D1(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, Degree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

  // BSplSLib.D2 (method)
  static D2(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

  // BSplSLib.D3 (method)
  static D3(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

  // BSplSLib.DN (method)
  static DN(U: number, V: number, Nu: number, Nv: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, Vn: gp_Vec): void;

  // BSplSLib.Iso (method)
  static Iso(Param: number, IsU: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Degree: number, Periodic: boolean, CPoles: NCollection_Array1_gp_Pnt, CWeights: NCollection_Array1_double): void;

  // BSplSLib.Reverse (method)
  static Reverse(Poles: NCollection_Array2_gp_Pnt, Last: number, UDirection: boolean): void;
  static Reverse(Weights: NCollection_Array2_double, Last: number, UDirection: boolean): void;

  // BSplSLib.HomogeneousD0 (method)
  static HomogeneousD0(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, W: number, P: gp_Pnt): { W: number };

  // BSplSLib.HomogeneousD1 (method)
  static HomogeneousD1(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, N: gp_Pnt, Nu: gp_Vec, Nv: gp_Vec, D?: number, Du?: number, Dv?: number): { D: number; Du: number; Dv: number };

  // BSplSLib.IsRational (method)
  static IsRational(Weights: NCollection_Array2_double, I1: number, I2: number, J1: number, J2: number, Epsilon?: number): boolean;

  // BSplSLib.SetPoles (method)
  static SetPoles(Poles: NCollection_Array2_gp_Pnt, FP: NCollection_Array1_double, UDirection: boolean): void;
  static SetPoles(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, FP: NCollection_Array1_double, UDirection: boolean): void;

  // BSplSLib.GetPoles (method)
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, UDirection: boolean): void;
  static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UDirection: boolean): void;

  // BSplSLib.MovePoint (method)
  static MovePoint(U: number, V: number, Displ: gp_Vec, UIndex1: number, UIndex2: number, VIndex1: number, VIndex2: number, UDegree: number, VDegree: number, Rational: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UFirstIndex: number, ULastIndex: number, VFirstIndex: number, VLastIndex: number, NewPoles: NCollection_Array2_gp_Pnt): { UFirstIndex: number; ULastIndex: number; VFirstIndex: number; VLastIndex: number };

  // BSplSLib.InsertKnots (method)
  static InsertKnots(UDirection: boolean, Degree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, AddKnots: NCollection_Array1_double, AddMults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int, Epsilon: number, Add: boolean): void;

  // BSplSLib.RemoveKnot (method)
  static RemoveKnot(UDirection: boolean, Index: number, Mult: number, Degree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int, Tolerance: number): boolean;

  // BSplSLib.IncreaseDegree (method)
  static IncreaseDegree(UDirection: boolean, Degree: number, NewDegree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int): void;

  // BSplSLib.Unperiodize (method)
  static Unperiodize(UDirection: boolean, Degree: number, Mults: NCollection_Array1_int, Knots: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, NewMults: NCollection_Array1_int, NewKnots: NCollection_Array1_double, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double): void;

  // BSplSLib.NoWeights (method)
  static NoWeights(): NCollection_Array2_double;

  // BSplSLib.BuildCache (method)
  static BuildCache(U: number, V: number, USpanDomain: number, VSpanDomain: number, UPeriodicFlag: boolean, VPeriodicFlag: boolean, UDegree: number, VDegree: number, UIndex: number, VIndex: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, CachePoles: NCollection_Array2_gp_Pnt, CacheWeights: NCollection_Array2_double): void;
  static BuildCache(theU: number, theV: number, theUSpanDomain: number, theVSpanDomain: number, theUPeriodic: boolean, theVPeriodic: boolean, theUDegree: number, theVDegree: number, theUIndex: number, theVIndex: number, theUFlatKnots: NCollection_Array1_double, theVFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array2_gp_Pnt, theWeights: NCollection_Array2_double, theCacheArray: NCollection_Array2_double): void;

  // BSplSLib.CacheD0 (method)
  static CacheD0(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt): void;

  // BSplSLib.CoefsD0 (method)
  static CoefsD0(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt): void;

  // BSplSLib.CacheD1 (method)
  static CacheD1(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec): void;

  // BSplSLib.CoefsD1 (method)
  static CoefsD1(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec): void;

  // BSplSLib.CacheD2 (method)
  static CacheD2(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec, VecUU: gp_Vec, VecUV: gp_Vec, VecVV: gp_Vec): void;

  // BSplSLib.CoefsD2 (method)
  static CoefsD2(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec, VecUU: gp_Vec, VecUV: gp_Vec, VecVV: gp_Vec): void;

  // BSplSLib.PolesCoefficients (method)
  static PolesCoefficients(Poles: NCollection_Array2_gp_Pnt, CachePoles: NCollection_Array2_gp_Pnt): void;

  // BSplSLib.Resolution (method)
  static Resolution(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

  // BSplSLib.Interpolate (method)
  static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, InversionProblem?: number): { InversionProblem: number };
  static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, InversionProblem?: number): { InversionProblem: number };

  // BSplSLib.FunctionMultiply (method)
  static FunctionMultiply(Function: BSplSLib_EvaluatorFunction, UBSplineDegree: number, VBSplineDegree: number, UBSplineKnots: NCollection_Array1_double, VBSplineKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UNewDegree: number, VNewDegree: number, NewNumerator: NCollection_Array2_gp_Pnt, NewDenominator: NCollection_Array2_double, theStatus?: number): { theStatus: number };

  // BSplSLib.UnitWeights (method)
  static UnitWeights(theNbUPoles: number, theNbVPoles: number): NCollection_Array2_double;

  // BSplSLib.delete (method)
  delete(): void;

  // BSplSLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BSplSLib_Cache: declare class BSplSLib_Cache extends Standard_Transient

  // BSplSLib_Cache.constructor (constructor)
  constructor(theDegreeU: number, thePeriodicU: boolean, theFlatKnotsU: NCollection_Array1_double, theDegreeV: number, thePeriodicV: boolean, theFlatKnotsV: NCollection_Array1_double, theWeights?: NCollection_Array2_double);

  // BSplSLib_Cache.IsCacheValid (method)
  IsCacheValid(theParameterU: number, theParameterV: number): boolean;

  // BSplSLib_Cache.BuildCache (method)
  BuildCache(theParameterU: number, theParameterV: number, theFlatKnotsU: NCollection_Array1_double, theFlatKnotsV: NCollection_Array1_double, thePoles: NCollection_Array2_gp_Pnt, theWeights?: NCollection_Array2_double): void;

  // BSplSLib_Cache.D0 (method)
  D0(theU: number, theV: number, thePoint: gp_Pnt): void;

  // BSplSLib_Cache.D1 (method)
  D1(theU: number, theV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec): void;

  // BSplSLib_Cache.D2 (method)
  D2(theU: number, theV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec, theCurvatureU: gp_Vec, theCurvatureV: gp_Vec, theCurvatureUV: gp_Vec): void;

  // BSplSLib_Cache.D0Local (method)
  D0Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt): void;

  // BSplSLib_Cache.D1Local (method)
  D1Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec): void;

  // BSplSLib_Cache.D2Local (method)
  D2Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec, theCurvatureU: gp_Vec, theCurvatureV: gp_Vec, theCurvatureUV: gp_Vec): void;

  // BSplSLib_Cache.get_type_name (method)
  static get_type_name(): string;

  // BSplSLib_Cache.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BSplSLib_Cache.DynamicType (method)
  DynamicType(): Standard_Type;

  // BSplSLib_Cache.delete (method)
  delete(): void;

  // BSplSLib_Cache.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BSplSLib_EvaluatorFunction: declare class BSplSLib_EvaluatorFunction

  // BSplSLib_EvaluatorFunction.Evaluate (method)
  Evaluate(theDerivativeRequest: number, theUParameter: number, theVParameter: number, theResult: number, theErrorCode: number): { theResult: number; theErrorCode: number };

  // BSplSLib_EvaluatorFunction.delete (method)
  delete(): void;

  // BSplSLib_EvaluatorFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
