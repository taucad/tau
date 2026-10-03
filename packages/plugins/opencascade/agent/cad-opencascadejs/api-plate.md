# libcascade — Plate

15 top-level symbols. Signatures are verbatim typescript.

Plate_D1: declare class Plate_D1

  // Plate_D1.constructor (constructor)
  constructor(ref: Plate_D1);
  constructor(du: gp_XYZ, dv: gp_XYZ);

  // Plate_D1.DU (method)
  DU(): gp_XYZ;

  // Plate_D1.DV (method)
  DV(): gp_XYZ;

  // Plate_D1.delete (method)
  delete(): void;

  // Plate_D1.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_D2: declare class Plate_D2

  // Plate_D2.constructor (constructor)
  constructor(ref: Plate_D2);
  constructor(duu: gp_XYZ, duv: gp_XYZ, dvv: gp_XYZ);

  // Plate_D2.delete (method)
  delete(): void;

  // Plate_D2.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_D3: declare class Plate_D3

  // Plate_D3.constructor (constructor)
  constructor(ref: Plate_D3);
  constructor(duuu: gp_XYZ, duuv: gp_XYZ, duvv: gp_XYZ, dvvv: gp_XYZ);

  // Plate_D3.delete (method)
  delete(): void;

  // Plate_D3.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_FreeGtoCConstraint: declare class Plate_FreeGtoCConstraint

  // Plate_FreeGtoCConstraint.constructor (constructor)
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1, IncrementalLoad?: number, orientation?: number);
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1, D2S: Plate_D2, D2T: Plate_D2, IncrementalLoad?: number, orientation?: number);
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1, D2S: Plate_D2, D2T: Plate_D2, D3S: Plate_D3, D3T: Plate_D3, IncrementalLoad?: number, orientation?: number);

  // Plate_FreeGtoCConstraint.nb_PPC (method)
  nb_PPC(): number;

  // Plate_FreeGtoCConstraint.GetPPC (method)
  GetPPC(Index: number): Plate_PinpointConstraint;

  // Plate_FreeGtoCConstraint.nb_LSC (method)
  nb_LSC(): number;

  // Plate_FreeGtoCConstraint.LSC (method)
  LSC(Index: number): Plate_LinearScalarConstraint;

  // Plate_FreeGtoCConstraint.delete (method)
  delete(): void;

  // Plate_FreeGtoCConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_GlobalTranslationConstraint: declare class Plate_GlobalTranslationConstraint

  // Plate_GlobalTranslationConstraint.constructor (constructor)
  constructor(SOfXY: NCollection_Sequence_gp_XY);

  // Plate_GlobalTranslationConstraint.LXYZC (method)
  LXYZC(): Plate_LinearXYZConstraint;

  // Plate_GlobalTranslationConstraint.delete (method)
  delete(): void;

  // Plate_GlobalTranslationConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_GtoCConstraint: declare class Plate_GtoCConstraint

  // Plate_GtoCConstraint.constructor (constructor)
  constructor(ref: Plate_GtoCConstraint);
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1);
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1, nP: gp_XYZ);
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1, D2S: Plate_D2, D2T: Plate_D2);
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1, D2S: Plate_D2, D2T: Plate_D2, nP: gp_XYZ);
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1, D2S: Plate_D2, D2T: Plate_D2, D3S: Plate_D3, D3T: Plate_D3);
  constructor(point2d: gp_XY, D1S: Plate_D1, D1T: Plate_D1, D2S: Plate_D2, D2T: Plate_D2, D3S: Plate_D3, D3T: Plate_D3, nP: gp_XYZ);

  // Plate_GtoCConstraint.nb_PPC (method)
  nb_PPC(): number;

  // Plate_GtoCConstraint.GetPPC (method)
  GetPPC(Index: number): Plate_PinpointConstraint;

  // Plate_GtoCConstraint.D1SurfInit (method)
  D1SurfInit(): Plate_D1;

  // Plate_GtoCConstraint.delete (method)
  delete(): void;

  // Plate_GtoCConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_LineConstraint: declare class Plate_LineConstraint

  // Plate_LineConstraint.constructor (constructor)
  constructor(point2d: gp_XY, lin: gp_Lin, iu?: number, iv?: number);

  // Plate_LineConstraint.LSC (method)
  LSC(): Plate_LinearScalarConstraint;

  // Plate_LineConstraint.delete (method)
  delete(): void;

  // Plate_LineConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_LinearScalarConstraint: declare class Plate_LinearScalarConstraint

  // Plate_LinearScalarConstraint.constructor (constructor)
  constructor();
  constructor(thePPC1: Plate_PinpointConstraint, theCoeff: gp_XYZ);
  constructor(thePPC: NCollection_Array1_Plate_PinpointConstraint, theCoeff: NCollection_Array1_gp_XYZ);
  constructor(thePPC: NCollection_Array1_Plate_PinpointConstraint, theCoeff: NCollection_Array2_gp_XYZ);
  constructor(ColLen: number, RowLen: number);

  // Plate_LinearScalarConstraint.GetPPC (method)
  GetPPC(): NCollection_Array1_Plate_PinpointConstraint;

  // Plate_LinearScalarConstraint.Coeff (method)
  Coeff(): NCollection_Array2_gp_XYZ;

  // Plate_LinearScalarConstraint.SetPPC (method)
  SetPPC(Index: number, Value: Plate_PinpointConstraint): void;

  // Plate_LinearScalarConstraint.SetCoeff (method)
  SetCoeff(Row: number, Col: number, Value: gp_XYZ): void;

  // Plate_LinearScalarConstraint.delete (method)
  delete(): void;

  // Plate_LinearScalarConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_LinearXYZConstraint: declare class Plate_LinearXYZConstraint

  // Plate_LinearXYZConstraint.constructor (constructor)
  constructor();
  constructor(thePPC: NCollection_Array1_Plate_PinpointConstraint, theCoeff: NCollection_Array1_double);
  constructor(thePPC: NCollection_Array1_Plate_PinpointConstraint, theCoeff: NCollection_Array2_double);
  constructor(ColLen: number, RowLen: number);

  // Plate_LinearXYZConstraint.GetPPC (method)
  GetPPC(): NCollection_Array1_Plate_PinpointConstraint;

  // Plate_LinearXYZConstraint.Coeff (method)
  Coeff(): NCollection_Array2_double;

  // Plate_LinearXYZConstraint.SetPPC (method)
  SetPPC(Index: number, Value: Plate_PinpointConstraint): void;

  // Plate_LinearXYZConstraint.SetCoeff (method)
  SetCoeff(Row: number, Col: number, Value: number): void;

  // Plate_LinearXYZConstraint.delete (method)
  delete(): void;

  // Plate_LinearXYZConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_PinpointConstraint: declare class Plate_PinpointConstraint

  // Plate_PinpointConstraint.constructor (constructor)
  constructor();
  constructor(point2d: gp_XY, ImposedValue: gp_XYZ, iu?: number, iv?: number);

  // Plate_PinpointConstraint.Pnt2d (method)
  Pnt2d(): gp_XY;

  // Plate_PinpointConstraint.Idu (method)
  Idu(): number;

  // Plate_PinpointConstraint.Idv (method)
  Idv(): number;

  // Plate_PinpointConstraint.Value (method)
  Value(): gp_XYZ;

  // Plate_PinpointConstraint.delete (method)
  delete(): void;

  // Plate_PinpointConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_PlaneConstraint: declare class Plate_PlaneConstraint

  // Plate_PlaneConstraint.constructor (constructor)
  constructor(point2d: gp_XY, pln: gp_Pln, iu?: number, iv?: number);

  // Plate_PlaneConstraint.LSC (method)
  LSC(): Plate_LinearScalarConstraint;

  // Plate_PlaneConstraint.delete (method)
  delete(): void;

  // Plate_PlaneConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_Plate: declare class Plate_Plate

  // Plate_Plate.constructor (constructor)
  constructor();
  constructor(Ref: Plate_Plate);

  // Plate_Plate.Copy (method)
  Copy(Ref: Plate_Plate): Plate_Plate;

  // Plate_Plate.Load (method)
  Load(PConst: Plate_PinpointConstraint): void;
  Load(LXYZConst: Plate_LinearXYZConstraint): void;
  Load(LScalarConst: Plate_LinearScalarConstraint): void;
  Load(GTConst: Plate_GlobalTranslationConstraint): void;
  Load(LConst: Plate_LineConstraint): void;
  Load(PConst: Plate_PlaneConstraint): void;
  Load(SCConst: Plate_SampledCurveConstraint): void;
  Load(GtoCConst: Plate_GtoCConstraint): void;
  Load(FGtoCConst: Plate_FreeGtoCConstraint): void;

  // Plate_Plate.SolveTI (method)
  SolveTI(ord?: number, anisotropie?: number, theProgress?: Message_ProgressRange): void;

  // Plate_Plate.IsDone (method)
  IsDone(): boolean;

  // Plate_Plate.destroy (method)
  destroy(): void;

  // Plate_Plate.Init (method)
  Init(): void;

  // Plate_Plate.Evaluate (method)
  Evaluate(point2d: gp_XY): gp_XYZ;

  // Plate_Plate.EvaluateDerivative (method)
  EvaluateDerivative(point2d: gp_XY, iu: number, iv: number): gp_XYZ;

  // Plate_Plate.CoefPol (method)
  CoefPol(): NCollection_HArray2_gp_XYZ;

  // Plate_Plate.SetPolynomialPartOnly (method)
  SetPolynomialPartOnly(PPOnly?: boolean): void;

  // Plate_Plate.Continuity (method)
  Continuity(): number;

  // Plate_Plate.UVBox (method)
  UVBox(UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };

  // Plate_Plate.UVConstraints (method)
  UVConstraints(Seq: NCollection_Sequence_gp_XY): void;

  // Plate_Plate.delete (method)
  delete(): void;

  // Plate_Plate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_SampledCurveConstraint: declare class Plate_SampledCurveConstraint

  // Plate_SampledCurveConstraint.constructor (constructor)
  constructor(SOPPC: NCollection_Sequence_Plate_PinpointConstraint, n: number);

  // Plate_SampledCurveConstraint.LXYZC (method)
  LXYZC(): Plate_LinearXYZConstraint;

  // Plate_SampledCurveConstraint.delete (method)
  delete(): void;

  // Plate_SampledCurveConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Plate_Array1OfPinpointConstraint: NCollection_Array1_Plate_PinpointConstraint

Plate_SequenceOfPinpointConstraint: NCollection_Sequence_Plate_PinpointConstraint
