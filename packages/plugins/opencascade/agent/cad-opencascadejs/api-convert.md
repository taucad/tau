# libcascade — Convert

15 top-level symbols. Signatures are verbatim typescript.

Convert_CircleToBSplineCurve: declare class Convert_CircleToBSplineCurve extends Convert_ConicToBSplineCurve

  // Convert_CircleToBSplineCurve.constructor (constructor)
  constructor(C: gp_Circ2d, Parameterisation?: Convert_ParameterisationType);
  constructor(C: gp_Circ2d, U1: number, U2: number, Parameterisation?: Convert_ParameterisationType);

  // Convert_CircleToBSplineCurve.delete (method)
  delete(): void;

  // Convert_CircleToBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_CompBezierCurves2dToBSplineCurve2d: declare class Convert_CompBezierCurves2dToBSplineCurve2d

  // Convert_CompBezierCurves2dToBSplineCurve2d.constructor (constructor)
  constructor(theAngularTolerance?: number);

  // Convert_CompBezierCurves2dToBSplineCurve2d.delete (method)
  delete(): void;

  // Convert_CompBezierCurves2dToBSplineCurve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_CompBezierCurvesToBSplineCurve: declare class Convert_CompBezierCurvesToBSplineCurve

  // Convert_CompBezierCurvesToBSplineCurve.constructor (constructor)
  constructor(theAngularTolerance?: number);

  // Convert_CompBezierCurvesToBSplineCurve.delete (method)
  delete(): void;

  // Convert_CompBezierCurvesToBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_CompPolynomialToPoles: declare class Convert_CompPolynomialToPoles

  // Convert_CompPolynomialToPoles.constructor (constructor)
  constructor(Dimension: number, MaxDegree: number, Degree: number, Coefficients: NCollection_Array1_double, PolynomialIntervals: NCollection_Array1_double, TrueIntervals: NCollection_Array1_double);
  constructor(NumCurves: number, Continuity: number, Dimension: number, MaxDegree: number, NumCoeffPerCurve: NCollection_HArray1_int, Coefficients: NCollection_HArray1_double, PolynomialIntervals: NCollection_HArray2_double, TrueIntervals: NCollection_HArray1_double);
  constructor(NumCurves: number, Dimension: number, MaxDegree: number, Continuity: NCollection_Array1_int, NumCoeffPerCurve: NCollection_Array1_int, Coefficients: NCollection_Array1_double, PolynomialIntervals: NCollection_Array2_double, TrueIntervals: NCollection_Array1_double);

  // Convert_CompPolynomialToPoles.NbPoles (method)
  NbPoles(): number;

  // Convert_CompPolynomialToPoles.Poles (method)
  Poles(): NCollection_Array2_double;

  // Convert_CompPolynomialToPoles.Degree (method)
  Degree(): number;

  // Convert_CompPolynomialToPoles.NbKnots (method)
  NbKnots(): number;

  // Convert_CompPolynomialToPoles.Knots (method)
  Knots(): NCollection_Array1_double;

  // Convert_CompPolynomialToPoles.Multiplicities (method)
  Multiplicities(): NCollection_Array1_int;

  // Convert_CompPolynomialToPoles.IsDone (method)
  IsDone(): boolean;

  // Convert_CompPolynomialToPoles.delete (method)
  delete(): void;

  // Convert_CompPolynomialToPoles.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_ConeToBSplineSurface: declare class Convert_ConeToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

  // Convert_ConeToBSplineSurface.constructor (constructor)
  constructor(C: gp_Cone, V1: number, V2: number);
  constructor(C: gp_Cone, U1: number, U2: number, V1: number, V2: number);

  // Convert_ConeToBSplineSurface.delete (method)
  delete(): void;

  // Convert_ConeToBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_ConicToBSplineCurve: declare class Convert_ConicToBSplineCurve

  // Convert_ConicToBSplineCurve.Degree (method)
  Degree(): number;

  // Convert_ConicToBSplineCurve.NbPoles (method)
  NbPoles(): number;

  // Convert_ConicToBSplineCurve.NbKnots (method)
  NbKnots(): number;

  // Convert_ConicToBSplineCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // DEPRECATED
  // Convert_ConicToBSplineCurve.Pole (method)
  Pole(theIndex: number): gp_Pnt2d;

  // DEPRECATED
  // Convert_ConicToBSplineCurve.Weight (method)
  Weight(theIndex: number): number;

  // DEPRECATED
  // Convert_ConicToBSplineCurve.Knot (method)
  Knot(theIndex: number): number;

  // DEPRECATED
  // Convert_ConicToBSplineCurve.Multiplicity (method)
  Multiplicity(theIndex: number): number;

  // Convert_ConicToBSplineCurve.Poles (method)
  Poles(): NCollection_Array1_gp_Pnt2d;

  // Convert_ConicToBSplineCurve.Weights (method)
  Weights(): NCollection_Array1_double;

  // Convert_ConicToBSplineCurve.Knots (method)
  Knots(): NCollection_Array1_double;

  // Convert_ConicToBSplineCurve.Multiplicities (method)
  Multiplicities(): NCollection_Array1_int;

  // DEPRECATED
  // Convert_ConicToBSplineCurve.BuildCosAndSin (method)
  BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };
  BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theUFirst: number, theULast: number, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };

  // Convert_ConicToBSplineCurve.delete (method)
  delete(): void;

  // Convert_ConicToBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_CylinderToBSplineSurface: declare class Convert_CylinderToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

  // Convert_CylinderToBSplineSurface.constructor (constructor)
  constructor(Cyl: gp_Cylinder, V1: number, V2: number);
  constructor(Cyl: gp_Cylinder, U1: number, U2: number, V1: number, V2: number);

  // Convert_CylinderToBSplineSurface.delete (method)
  delete(): void;

  // Convert_CylinderToBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_ElementarySurfaceToBSplineSurface: declare class Convert_ElementarySurfaceToBSplineSurface

  // Convert_ElementarySurfaceToBSplineSurface.UDegree (method)
  UDegree(): number;

  // Convert_ElementarySurfaceToBSplineSurface.VDegree (method)
  VDegree(): number;

  // Convert_ElementarySurfaceToBSplineSurface.NbUPoles (method)
  NbUPoles(): number;

  // Convert_ElementarySurfaceToBSplineSurface.NbVPoles (method)
  NbVPoles(): number;

  // Convert_ElementarySurfaceToBSplineSurface.NbUKnots (method)
  NbUKnots(): number;

  // Convert_ElementarySurfaceToBSplineSurface.NbVKnots (method)
  NbVKnots(): number;

  // Convert_ElementarySurfaceToBSplineSurface.IsUPeriodic (method)
  IsUPeriodic(): boolean;

  // Convert_ElementarySurfaceToBSplineSurface.IsVPeriodic (method)
  IsVPeriodic(): boolean;

  // DEPRECATED
  // Convert_ElementarySurfaceToBSplineSurface.Pole (method)
  Pole(UIndex: number, VIndex: number): gp_Pnt;

  // DEPRECATED
  // Convert_ElementarySurfaceToBSplineSurface.Weight (method)
  Weight(UIndex: number, VIndex: number): number;

  // DEPRECATED
  // Convert_ElementarySurfaceToBSplineSurface.UKnot (method)
  UKnot(UIndex: number): number;

  // DEPRECATED
  // Convert_ElementarySurfaceToBSplineSurface.VKnot (method)
  VKnot(VIndex: number): number;

  // DEPRECATED
  // Convert_ElementarySurfaceToBSplineSurface.UMultiplicity (method)
  UMultiplicity(UIndex: number): number;

  // DEPRECATED
  // Convert_ElementarySurfaceToBSplineSurface.VMultiplicity (method)
  VMultiplicity(VIndex: number): number;

  // Convert_ElementarySurfaceToBSplineSurface.Poles (method)
  Poles(): NCollection_Array2_gp_Pnt;

  // Convert_ElementarySurfaceToBSplineSurface.Weights (method)
  Weights(): NCollection_Array2_double;

  // Convert_ElementarySurfaceToBSplineSurface.UKnots (method)
  UKnots(): NCollection_Array1_double;

  // Convert_ElementarySurfaceToBSplineSurface.VKnots (method)
  VKnots(): NCollection_Array1_double;

  // Convert_ElementarySurfaceToBSplineSurface.UMultiplicities (method)
  UMultiplicities(): NCollection_Array1_int;

  // Convert_ElementarySurfaceToBSplineSurface.VMultiplicities (method)
  VMultiplicities(): NCollection_Array1_int;

  // Convert_ElementarySurfaceToBSplineSurface.delete (method)
  delete(): void;

  // Convert_ElementarySurfaceToBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_EllipseToBSplineCurve: declare class Convert_EllipseToBSplineCurve extends Convert_ConicToBSplineCurve

  // Convert_EllipseToBSplineCurve.constructor (constructor)
  constructor(E: gp_Elips2d, Parameterisation?: Convert_ParameterisationType);
  constructor(E: gp_Elips2d, U1: number, U2: number, Parameterisation?: Convert_ParameterisationType);

  // Convert_EllipseToBSplineCurve.delete (method)
  delete(): void;

  // Convert_EllipseToBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_GridPolynomialToPoles: declare class Convert_GridPolynomialToPoles

  // Convert_GridPolynomialToPoles.constructor (constructor)
  constructor(theMaxUDegree: number, theMaxVDegree: number, theNumCoeff: NCollection_Array1_int, theCoefficients: NCollection_Array1_double, thePolynomialUIntervals: NCollection_Array1_double, thePolynomialVIntervals: NCollection_Array1_double);
  constructor(theMaxUDegree: number, theMaxVDegree: number, theNumCoeff: NCollection_HArray1_int, theCoefficients: NCollection_HArray1_double, thePolynomialUIntervals: NCollection_HArray1_double, thePolynomialVIntervals: NCollection_HArray1_double);
  constructor(theNbUSurfaces: number, theNbVSurfaces: number, theUContinuity: number, theVContinuity: number, theMaxUDegree: number, theMaxVDegree: number, theNumCoeffPerSurface: NCollection_Array2_int, theCoefficients: NCollection_Array1_double, thePolynomialUIntervals: NCollection_Array1_double, thePolynomialVIntervals: NCollection_Array1_double, theTrueUIntervals: NCollection_Array1_double, theTrueVIntervals: NCollection_Array1_double);
  constructor(theNbUSurfaces: number, theNbVSurfaces: number, theUContinuity: number, theVContinuity: number, theMaxUDegree: number, theMaxVDegree: number, theNumCoeffPerSurface: NCollection_HArray2_int, theCoefficients: NCollection_HArray1_double, thePolynomialUIntervals: NCollection_HArray1_double, thePolynomialVIntervals: NCollection_HArray1_double, theTrueUIntervals: NCollection_HArray1_double, theTrueVIntervals: NCollection_HArray1_double);

  // Convert_GridPolynomialToPoles.NbUPoles (method)
  NbUPoles(): number;

  // Convert_GridPolynomialToPoles.NbVPoles (method)
  NbVPoles(): number;

  // Convert_GridPolynomialToPoles.Poles (method)
  Poles(): NCollection_Array2_gp_Pnt;

  // Convert_GridPolynomialToPoles.UDegree (method)
  UDegree(): number;

  // Convert_GridPolynomialToPoles.VDegree (method)
  VDegree(): number;

  // Convert_GridPolynomialToPoles.NbUKnots (method)
  NbUKnots(): number;

  // Convert_GridPolynomialToPoles.NbVKnots (method)
  NbVKnots(): number;

  // Convert_GridPolynomialToPoles.UKnots (method)
  UKnots(): NCollection_Array1_double;

  // Convert_GridPolynomialToPoles.VKnots (method)
  VKnots(): NCollection_Array1_double;

  // Convert_GridPolynomialToPoles.UMultiplicities (method)
  UMultiplicities(): NCollection_Array1_int;

  // Convert_GridPolynomialToPoles.VMultiplicities (method)
  VMultiplicities(): NCollection_Array1_int;

  // Convert_GridPolynomialToPoles.IsDone (method)
  IsDone(): boolean;

  // Convert_GridPolynomialToPoles.delete (method)
  delete(): void;

  // Convert_GridPolynomialToPoles.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_HyperbolaToBSplineCurve: declare class Convert_HyperbolaToBSplineCurve extends Convert_ConicToBSplineCurve

  // Convert_HyperbolaToBSplineCurve.constructor (constructor)
  constructor(H: gp_Hypr2d, U1: number, U2: number);

  // Convert_HyperbolaToBSplineCurve.delete (method)
  delete(): void;

  // Convert_HyperbolaToBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_ParabolaToBSplineCurve: declare class Convert_ParabolaToBSplineCurve extends Convert_ConicToBSplineCurve

  // Convert_ParabolaToBSplineCurve.constructor (constructor)
  constructor(Prb: gp_Parab2d, U1: number, U2: number);

  // Convert_ParabolaToBSplineCurve.delete (method)
  delete(): void;

  // Convert_ParabolaToBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_ParameterisationType: typeof Convert_ParameterisationType[keyof typeof Convert_ParameterisationType]

  readonly Convert_TgtThetaOver2: 'Convert_TgtThetaOver2'

  readonly Convert_TgtThetaOver2_1: 'Convert_TgtThetaOver2_1'

  readonly Convert_TgtThetaOver2_2: 'Convert_TgtThetaOver2_2'

  readonly Convert_TgtThetaOver2_3: 'Convert_TgtThetaOver2_3'

  readonly Convert_TgtThetaOver2_4: 'Convert_TgtThetaOver2_4'

  readonly Convert_QuasiAngular: 'Convert_QuasiAngular'

  readonly Convert_RationalC1: 'Convert_RationalC1'

  readonly Convert_Polynomial: 'Convert_Polynomial'

Convert_SphereToBSplineSurface: declare class Convert_SphereToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

  // Convert_SphereToBSplineSurface.constructor (constructor)
  constructor(Sph: gp_Sphere);
  constructor(Sph: gp_Sphere, Param1: number, Param2: number, UTrim?: boolean);
  constructor(Sph: gp_Sphere, U1: number, U2: number, V1: number, V2: number);

  // Convert_SphereToBSplineSurface.delete (method)
  delete(): void;

  // Convert_SphereToBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Convert_TorusToBSplineSurface: declare class Convert_TorusToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

  // Convert_TorusToBSplineSurface.constructor (constructor)
  constructor(T: gp_Torus);
  constructor(T: gp_Torus, Param1: number, Param2: number, UTrim?: boolean);
  constructor(T: gp_Torus, U1: number, U2: number, V1: number, V2: number);

  // Convert_TorusToBSplineSurface.delete (method)
  delete(): void;

  // Convert_TorusToBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
