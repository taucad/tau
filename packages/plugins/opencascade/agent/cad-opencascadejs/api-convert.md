# libcascade — Convert

15 top-level symbols. Signatures are verbatim typescript.

Convert_CircleToBSplineCurve: declare class Convert_CircleToBSplineCurve extends Convert_ConicToBSplineCurve

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_CompBezierCurves2dToBSplineCurve2d: declare class Convert_CompBezierCurves2dToBSplineCurve2d

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_CompBezierCurvesToBSplineCurve: declare class Convert_CompBezierCurvesToBSplineCurve

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_CompPolynomialToPoles: declare class Convert_CompPolynomialToPoles

  constructor

  NbPoles(): number;

  Poles(): NCollection_Array2_double;

  Degree(): number;

  NbKnots(): number;

  Knots(): NCollection_Array1_double;

  Multiplicities(): NCollection_Array1_int;

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Convert_ConeToBSplineSurface: declare class Convert_ConeToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_ConicToBSplineCurve: declare class Convert_ConicToBSplineCurve

  Degree(): number;

  NbPoles(): number;

  NbKnots(): number;

  IsPeriodic(): boolean;

  // DEPRECATED
  Pole(theIndex: number): gp_Pnt2d;

  // DEPRECATED
  Weight(theIndex: number): number;

  // DEPRECATED
  Knot(theIndex: number): number;

  // DEPRECATED
  Multiplicity(theIndex: number): number;

  Poles(): NCollection_Array1_gp_Pnt2d;

  Weights(): NCollection_Array1_double;

  Knots(): NCollection_Array1_double;

  Multiplicities(): NCollection_Array1_int;

  // DEPRECATED
  BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };
  BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theUFirst: number, theULast: number, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };
  BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };
  BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theUFirst: number, theULast: number, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };

  delete(): void;

  [Symbol.dispose](): void;

Convert_CylinderToBSplineSurface: declare class Convert_CylinderToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_ElementarySurfaceToBSplineSurface: declare class Convert_ElementarySurfaceToBSplineSurface

  UDegree(): number;

  VDegree(): number;

  NbUPoles(): number;

  NbVPoles(): number;

  NbUKnots(): number;

  NbVKnots(): number;

  IsUPeriodic(): boolean;

  IsVPeriodic(): boolean;

  // DEPRECATED
  Pole(UIndex: number, VIndex: number): gp_Pnt;

  // DEPRECATED
  Weight(UIndex: number, VIndex: number): number;

  // DEPRECATED
  UKnot(UIndex: number): number;

  // DEPRECATED
  VKnot(VIndex: number): number;

  // DEPRECATED
  UMultiplicity(UIndex: number): number;

  // DEPRECATED
  VMultiplicity(VIndex: number): number;

  Poles(): NCollection_Array2_gp_Pnt;

  Weights(): NCollection_Array2_double;

  UKnots(): NCollection_Array1_double;

  VKnots(): NCollection_Array1_double;

  UMultiplicities(): NCollection_Array1_int;

  VMultiplicities(): NCollection_Array1_int;

  delete(): void;

  [Symbol.dispose](): void;

Convert_EllipseToBSplineCurve: declare class Convert_EllipseToBSplineCurve extends Convert_ConicToBSplineCurve

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_GridPolynomialToPoles: declare class Convert_GridPolynomialToPoles

  constructor

  NbUPoles(): number;

  NbVPoles(): number;

  Poles(): NCollection_Array2_gp_Pnt;

  UDegree(): number;

  VDegree(): number;

  NbUKnots(): number;

  NbVKnots(): number;

  UKnots(): NCollection_Array1_double;

  VKnots(): NCollection_Array1_double;

  UMultiplicities(): NCollection_Array1_int;

  VMultiplicities(): NCollection_Array1_int;

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Convert_HyperbolaToBSplineCurve: declare class Convert_HyperbolaToBSplineCurve extends Convert_ConicToBSplineCurve

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_ParabolaToBSplineCurve: declare class Convert_ParabolaToBSplineCurve extends Convert_ConicToBSplineCurve

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_ParameterisationType: typeof Convert_ParameterisationType[keyof typeof Convert_ParameterisationType]

Convert_SphereToBSplineSurface: declare class Convert_SphereToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Convert_TorusToBSplineSurface: declare class Convert_TorusToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

  constructor

  delete(): void;

  [Symbol.dispose](): void;
