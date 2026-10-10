# libcascade — gp (2)

14 top-level symbols. Signatures are verbatim typescript.

gp_EulerSequence: typeof gp_EulerSequence[keyof typeof gp_EulerSequence]

  readonly gp_EulerAngles: 'gp_EulerAngles'

  readonly gp_YawPitchRoll: 'gp_YawPitchRoll'

  readonly gp_Extrinsic_XYZ: 'gp_Extrinsic_XYZ'

  readonly gp_Extrinsic_XZY: 'gp_Extrinsic_XZY'

  readonly gp_Extrinsic_YZX: 'gp_Extrinsic_YZX'

  readonly gp_Extrinsic_YXZ: 'gp_Extrinsic_YXZ'

  readonly gp_Extrinsic_ZXY: 'gp_Extrinsic_ZXY'

  readonly gp_Extrinsic_ZYX: 'gp_Extrinsic_ZYX'

  readonly gp_Intrinsic_XYZ: 'gp_Intrinsic_XYZ'

  readonly gp_Intrinsic_XZY: 'gp_Intrinsic_XZY'

  readonly gp_Intrinsic_YZX: 'gp_Intrinsic_YZX'

  readonly gp_Intrinsic_YXZ: 'gp_Intrinsic_YXZ'

  readonly gp_Intrinsic_ZXY: 'gp_Intrinsic_ZXY'

  readonly gp_Intrinsic_ZYX: 'gp_Intrinsic_ZYX'

  readonly gp_Extrinsic_XYX: 'gp_Extrinsic_XYX'

  readonly gp_Extrinsic_XZX: 'gp_Extrinsic_XZX'

  readonly gp_Extrinsic_YZY: 'gp_Extrinsic_YZY'

  readonly gp_Extrinsic_YXY: 'gp_Extrinsic_YXY'

  readonly gp_Extrinsic_ZYZ: 'gp_Extrinsic_ZYZ'

  readonly gp_Extrinsic_ZXZ: 'gp_Extrinsic_ZXZ'

  readonly gp_Intrinsic_XYX: 'gp_Intrinsic_XYX'

  readonly gp_Intrinsic_XZX: 'gp_Intrinsic_XZX'

  readonly gp_Intrinsic_YZY: 'gp_Intrinsic_YZY'

  readonly gp_Intrinsic_YXY: 'gp_Intrinsic_YXY'

  readonly gp_Intrinsic_ZXZ: 'gp_Intrinsic_ZXZ'

  readonly gp_Intrinsic_ZYZ: 'gp_Intrinsic_ZYZ'

gp_GTrsf: declare class gp_GTrsf

  // gp_GTrsf.constructor (constructor)
  constructor();
  constructor(theT: gp_Trsf);
  constructor(theM: gp_Mat, theV: gp_XYZ);

  // gp_GTrsf.SetAffinity (method)
  SetAffinity(theA1: gp_Ax1, theRatio: number): void;
  SetAffinity(theA2: gp_Ax2, theRatio: number): void;

  // gp_GTrsf.SetValue (method)
  SetValue(theRow: number, theCol: number, theValue: number): void;

  // gp_GTrsf.SetVectorialPart (method)
  SetVectorialPart(theMatrix: gp_Mat): void;

  // gp_GTrsf.SetTranslationPart (method)
  SetTranslationPart(theCoord: gp_XYZ): void;

  // gp_GTrsf.SetTrsf (method)
  SetTrsf(theT: gp_Trsf): void;

  // gp_GTrsf.IsNegative (method)
  IsNegative(): boolean;

  // gp_GTrsf.IsSingular (method)
  IsSingular(): boolean;

  // gp_GTrsf.Form (method)
  Form(): gp_TrsfForm;

  // gp_GTrsf.SetForm (method)
  SetForm(): void;

  // gp_GTrsf.TranslationPart (method)
  TranslationPart(): gp_XYZ;

  // gp_GTrsf.VectorialPart (method)
  VectorialPart(): gp_Mat;

  // gp_GTrsf.Value (method)
  Value(theRow: number, theCol: number): number;

  // gp_GTrsf.Invert (method)
  Invert(): void;

  // gp_GTrsf.Inverted (method)
  Inverted(): gp_GTrsf;

  // gp_GTrsf.Multiplied (method)
  Multiplied(theT: gp_GTrsf): gp_GTrsf;

  // gp_GTrsf.Multiply (method)
  Multiply(theT: gp_GTrsf): void;

  // gp_GTrsf.PreMultiply (method)
  PreMultiply(theT: gp_GTrsf): void;

  // gp_GTrsf.Power (method)
  Power(theN: number): void;

  // gp_GTrsf.Powered (method)
  Powered(theN: number): gp_GTrsf;

  // gp_GTrsf.Transforms (method)
  Transforms(theCoord: gp_XYZ): void;
  Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

  // gp_GTrsf.Trsf (method)
  Trsf(): gp_Trsf;

  // gp_GTrsf.delete (method)
  delete(): void;

  // gp_GTrsf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_GTrsf2d: declare class gp_GTrsf2d

  // gp_GTrsf2d.constructor (constructor)
  constructor();
  constructor(theT: gp_Trsf2d);
  constructor(theM: gp_Mat2d, theV: gp_XY);

  // gp_GTrsf2d.SetAffinity (method)
  SetAffinity(theA: gp_Ax2d, theRatio: number): void;

  // gp_GTrsf2d.SetValue (method)
  SetValue(theRow: number, theCol: number, theValue: number): void;

  // gp_GTrsf2d.SetTranslationPart (method)
  SetTranslationPart(theCoord: gp_XY): void;

  // gp_GTrsf2d.SetTrsf2d (method)
  SetTrsf2d(theT: gp_Trsf2d): void;

  // gp_GTrsf2d.SetVectorialPart (method)
  SetVectorialPart(theMatrix: gp_Mat2d): void;

  // gp_GTrsf2d.IsNegative (method)
  IsNegative(): boolean;

  // gp_GTrsf2d.IsSingular (method)
  IsSingular(): boolean;

  // gp_GTrsf2d.Form (method)
  Form(): gp_TrsfForm;

  // gp_GTrsf2d.TranslationPart (method)
  TranslationPart(): gp_XY;

  // gp_GTrsf2d.VectorialPart (method)
  VectorialPart(): gp_Mat2d;

  // gp_GTrsf2d.Value (method)
  Value(theRow: number, theCol: number): number;

  // gp_GTrsf2d.Invert (method)
  Invert(): void;

  // gp_GTrsf2d.Inverted (method)
  Inverted(): gp_GTrsf2d;

  // gp_GTrsf2d.Multiplied (method)
  Multiplied(theT: gp_GTrsf2d): gp_GTrsf2d;

  // gp_GTrsf2d.Multiply (method)
  Multiply(theT: gp_GTrsf2d): void;

  // gp_GTrsf2d.PreMultiply (method)
  PreMultiply(theT: gp_GTrsf2d): void;

  // gp_GTrsf2d.Power (method)
  Power(theN: number): void;

  // gp_GTrsf2d.Powered (method)
  Powered(theN: number): gp_GTrsf2d;

  // gp_GTrsf2d.Transforms (method)
  Transforms(theCoord: gp_XY): void;
  Transforms(theX?: number, theY?: number): { theX: number; theY: number };

  // gp_GTrsf2d.Transformed (method)
  Transformed(theCoord: gp_XY): gp_XY;

  // gp_GTrsf2d.Trsf2d (method)
  Trsf2d(): gp_Trsf2d;

  // gp_GTrsf2d.delete (method)
  delete(): void;

  // gp_GTrsf2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Hypr: declare class gp_Hypr

  // gp_Hypr.constructor (constructor)
  constructor();
  constructor(theA2: gp_Ax2, theMajorRadius: number, theMinorRadius: number);

  // gp_Hypr.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Hypr.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // gp_Hypr.SetMajorRadius (method)
  SetMajorRadius(theMajorRadius: number): void;

  // gp_Hypr.SetMinorRadius (method)
  SetMinorRadius(theMinorRadius: number): void;

  // gp_Hypr.SetPosition (method)
  SetPosition(theA2: gp_Ax2): void;

  // gp_Hypr.Asymptote1 (method)
  Asymptote1(): gp_Ax1;

  // gp_Hypr.Asymptote2 (method)
  Asymptote2(): gp_Ax1;

  // gp_Hypr.Axis (method)
  Axis(): gp_Ax1;

  // gp_Hypr.ConjugateBranch1 (method)
  ConjugateBranch1(): gp_Hypr;

  // gp_Hypr.ConjugateBranch2 (method)
  ConjugateBranch2(): gp_Hypr;

  // gp_Hypr.Directrix1 (method)
  Directrix1(): gp_Ax1;

  // gp_Hypr.Directrix2 (method)
  Directrix2(): gp_Ax1;

  // gp_Hypr.Eccentricity (method)
  Eccentricity(): number;

  // gp_Hypr.Focal (method)
  Focal(): number;

  // gp_Hypr.Focus1 (method)
  Focus1(): gp_Pnt;

  // gp_Hypr.Focus2 (method)
  Focus2(): gp_Pnt;

  // gp_Hypr.Location (method)
  Location(): gp_Pnt;

  // gp_Hypr.MajorRadius (method)
  MajorRadius(): number;

  // gp_Hypr.MinorRadius (method)
  MinorRadius(): number;

  // gp_Hypr.OtherBranch (method)
  OtherBranch(): gp_Hypr;

  // gp_Hypr.Parameter (method)
  Parameter(): number;

  // gp_Hypr.Position (method)
  Position(): gp_Ax2;

  // gp_Hypr.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Hypr.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Hypr.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Hypr.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Hypr;
  Mirrored(theA1: gp_Ax1): gp_Hypr;
  Mirrored(theA2: gp_Ax2): gp_Hypr;

  // gp_Hypr.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Hypr.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Hypr;

  // gp_Hypr.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Hypr.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Hypr;

  // gp_Hypr.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Hypr.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Hypr;

  // gp_Hypr.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Hypr.Translated (method)
  Translated(theV: gp_Vec): gp_Hypr;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Hypr;

  // gp_Hypr.delete (method)
  delete(): void;

  // gp_Hypr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Hypr2d: declare class gp_Hypr2d

  // gp_Hypr2d.constructor (constructor)
  constructor();
  constructor(theA: gp_Ax22d, theMajorRadius: number, theMinorRadius: number);
  constructor(theMajorAxis: gp_Ax2d, theMajorRadius: number, theMinorRadius: number, theIsSense?: boolean);

  // gp_Hypr2d.SetLocation (method)
  SetLocation(theP: gp_Pnt2d): void;

  // gp_Hypr2d.SetMajorRadius (method)
  SetMajorRadius(theMajorRadius: number): void;

  // gp_Hypr2d.SetMinorRadius (method)
  SetMinorRadius(theMinorRadius: number): void;

  // gp_Hypr2d.SetAxis (method)
  SetAxis(theA: gp_Ax22d): void;

  // gp_Hypr2d.SetXAxis (method)
  SetXAxis(theA: gp_Ax2d): void;

  // gp_Hypr2d.SetYAxis (method)
  SetYAxis(theA: gp_Ax2d): void;

  // gp_Hypr2d.Asymptote1 (method)
  Asymptote1(): gp_Ax2d;

  // gp_Hypr2d.Asymptote2 (method)
  Asymptote2(): gp_Ax2d;

  // gp_Hypr2d.Coefficients (method)
  Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

  // gp_Hypr2d.ConjugateBranch1 (method)
  ConjugateBranch1(): gp_Hypr2d;

  // gp_Hypr2d.ConjugateBranch2 (method)
  ConjugateBranch2(): gp_Hypr2d;

  // gp_Hypr2d.Directrix1 (method)
  Directrix1(): gp_Ax2d;

  // gp_Hypr2d.Directrix2 (method)
  Directrix2(): gp_Ax2d;

  // gp_Hypr2d.Eccentricity (method)
  Eccentricity(): number;

  // gp_Hypr2d.Focal (method)
  Focal(): number;

  // gp_Hypr2d.Focus1 (method)
  Focus1(): gp_Pnt2d;

  // gp_Hypr2d.Focus2 (method)
  Focus2(): gp_Pnt2d;

  // gp_Hypr2d.Location (method)
  Location(): gp_Pnt2d;

  // gp_Hypr2d.MajorRadius (method)
  MajorRadius(): number;

  // gp_Hypr2d.MinorRadius (method)
  MinorRadius(): number;

  // gp_Hypr2d.OtherBranch (method)
  OtherBranch(): gp_Hypr2d;

  // gp_Hypr2d.Parameter (method)
  Parameter(): number;

  // gp_Hypr2d.Axis (method)
  Axis(): gp_Ax22d;

  // gp_Hypr2d.XAxis (method)
  XAxis(): gp_Ax2d;

  // gp_Hypr2d.YAxis (method)
  YAxis(): gp_Ax2d;

  // gp_Hypr2d.Reverse (method)
  Reverse(): void;

  // gp_Hypr2d.Reversed (method)
  Reversed(): gp_Hypr2d;

  // gp_Hypr2d.IsDirect (method)
  IsDirect(): boolean;

  // gp_Hypr2d.Mirror (method)
  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;

  // gp_Hypr2d.Mirrored (method)
  Mirrored(theP: gp_Pnt2d): gp_Hypr2d;
  Mirrored(theA: gp_Ax2d): gp_Hypr2d;

  // gp_Hypr2d.Rotate (method)
  Rotate(theP: gp_Pnt2d, theAng: number): void;

  // gp_Hypr2d.Rotated (method)
  Rotated(theP: gp_Pnt2d, theAng: number): gp_Hypr2d;

  // gp_Hypr2d.Scale (method)
  Scale(theP: gp_Pnt2d, theS: number): void;

  // gp_Hypr2d.Scaled (method)
  Scaled(theP: gp_Pnt2d, theS: number): gp_Hypr2d;

  // gp_Hypr2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Hypr2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Hypr2d;

  // gp_Hypr2d.Translate (method)
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Hypr2d.Translated (method)
  Translated(theV: gp_Vec2d): gp_Hypr2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Hypr2d;

  // gp_Hypr2d.delete (method)
  delete(): void;

  // gp_Hypr2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Lin: declare class gp_Lin

  // gp_Lin.constructor (constructor)
  constructor();
  constructor(theA1: gp_Ax1);
  constructor(theP: gp_Pnt, theV: gp_Dir);

  // gp_Lin.Reverse (method)
  Reverse(): void;

  // gp_Lin.Reversed (method)
  Reversed(): gp_Lin;

  // gp_Lin.SetDirection (method)
  SetDirection(theV: gp_Dir): void;

  // gp_Lin.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // gp_Lin.SetPosition (method)
  SetPosition(theA1: gp_Ax1): void;

  // gp_Lin.Direction (method)
  Direction(): gp_Dir;

  // gp_Lin.Location (method)
  Location(): gp_Pnt;

  // gp_Lin.Position (method)
  Position(): gp_Ax1;

  // gp_Lin.Angle (method)
  Angle(theOther: gp_Lin): number;

  // gp_Lin.Contains (method)
  Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;

  // gp_Lin.Distance (method)
  Distance(theP: gp_Pnt): number;
  Distance(theOther: gp_Lin): number;

  // gp_Lin.SquareDistance (method)
  SquareDistance(theP: gp_Pnt): number;
  SquareDistance(theOther: gp_Lin): number;

  // gp_Lin.Normal (method)
  Normal(theP: gp_Pnt): gp_Lin;

  // gp_Lin.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Lin.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Lin;
  Mirrored(theA1: gp_Ax1): gp_Lin;
  Mirrored(theA2: gp_Ax2): gp_Lin;

  // gp_Lin.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Lin.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Lin;

  // gp_Lin.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Lin.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Lin;

  // gp_Lin.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Lin.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Lin;

  // gp_Lin.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Lin.Translated (method)
  Translated(theV: gp_Vec): gp_Lin;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Lin;

  // gp_Lin.delete (method)
  delete(): void;

  // gp_Lin.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Lin2d: declare class gp_Lin2d

  // gp_Lin2d.constructor (constructor)
  constructor();
  constructor(theA: gp_Ax2d);
  constructor(theP: gp_Pnt2d, theV: gp_Dir2d);
  constructor(theA: number, theB: number, theC: number);

  // gp_Lin2d.Reverse (method)
  Reverse(): void;

  // gp_Lin2d.Reversed (method)
  Reversed(): gp_Lin2d;

  // gp_Lin2d.SetDirection (method)
  SetDirection(theV: gp_Dir2d): void;

  // gp_Lin2d.SetLocation (method)
  SetLocation(theP: gp_Pnt2d): void;

  // gp_Lin2d.SetPosition (method)
  SetPosition(theA: gp_Ax2d): void;

  // gp_Lin2d.Coefficients (method)
  Coefficients(theA?: number, theB?: number, theC?: number): { theA: number; theB: number; theC: number };

  // gp_Lin2d.Direction (method)
  Direction(): gp_Dir2d;

  // gp_Lin2d.Location (method)
  Location(): gp_Pnt2d;

  // gp_Lin2d.Position (method)
  Position(): gp_Ax2d;

  // gp_Lin2d.Angle (method)
  Angle(theOther: gp_Lin2d): number;

  // gp_Lin2d.Contains (method)
  Contains(theP: gp_Pnt2d, theLinearTolerance: number): boolean;

  // gp_Lin2d.Distance (method)
  Distance(theP: gp_Pnt2d): number;
  Distance(theOther: gp_Lin2d): number;

  // gp_Lin2d.SquareDistance (method)
  SquareDistance(theP: gp_Pnt2d): number;
  SquareDistance(theOther: gp_Lin2d): number;

  // gp_Lin2d.Normal (method)
  Normal(theP: gp_Pnt2d): gp_Lin2d;

  // gp_Lin2d.Mirror (method)
  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;

  // gp_Lin2d.Mirrored (method)
  Mirrored(theP: gp_Pnt2d): gp_Lin2d;
  Mirrored(theA: gp_Ax2d): gp_Lin2d;

  // gp_Lin2d.Rotate (method)
  Rotate(theP: gp_Pnt2d, theAng: number): void;

  // gp_Lin2d.Rotated (method)
  Rotated(theP: gp_Pnt2d, theAng: number): gp_Lin2d;

  // gp_Lin2d.Scale (method)
  Scale(theP: gp_Pnt2d, theS: number): void;

  // gp_Lin2d.Scaled (method)
  Scaled(theP: gp_Pnt2d, theS: number): gp_Lin2d;

  // gp_Lin2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Lin2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Lin2d;

  // gp_Lin2d.Translate (method)
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Lin2d.Translated (method)
  Translated(theV: gp_Vec2d): gp_Lin2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Lin2d;

  // gp_Lin2d.delete (method)
  delete(): void;

  // gp_Lin2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Mat: declare class gp_Mat

  // gp_Mat.constructor (constructor)
  constructor();
  constructor(theCol1: gp_XYZ, theCol2: gp_XYZ, theCol3: gp_XYZ);
  constructor(theA11: number, theA12: number, theA13: number, theA21: number, theA22: number, theA23: number, theA31: number, theA32: number, theA33: number);

  // gp_Mat.SetCol (method)
  SetCol(theCol: number, theValue: gp_XYZ): void;

  // gp_Mat.SetCols (method)
  SetCols(theCol1: gp_XYZ, theCol2: gp_XYZ, theCol3: gp_XYZ): void;

  // gp_Mat.SetCross (method)
  SetCross(theRef: gp_XYZ): void;

  // gp_Mat.SetDiagonal (method)
  SetDiagonal(theX1: number, theX2: number, theX3: number): void;

  // gp_Mat.SetDot (method)
  SetDot(theRef: gp_XYZ): void;

  // gp_Mat.SetIdentity (method)
  SetIdentity(): void;

  // gp_Mat.SetRotation (method)
  SetRotation(theAxis: gp_XYZ, theAng: number): void;

  // gp_Mat.SetRow (method)
  SetRow(theRow: number, theValue: gp_XYZ): void;

  // gp_Mat.SetRows (method)
  SetRows(theRow1: gp_XYZ, theRow2: gp_XYZ, theRow3: gp_XYZ): void;

  // gp_Mat.SetScale (method)
  SetScale(theS: number): void;

  // gp_Mat.SetValue (method)
  SetValue(theRow: number, theCol: number, theValue: number): void;

  // gp_Mat.Column (method)
  Column(theCol: number): gp_XYZ;

  // gp_Mat.Determinant (method)
  Determinant(): number;

  // gp_Mat.Diagonal (method)
  Diagonal(): gp_XYZ;

  // gp_Mat.Row (method)
  Row(theRow: number): gp_XYZ;

  // gp_Mat.Value (method)
  Value(theRow: number, theCol: number): number;

  // gp_Mat.ChangeValue (method)
  ChangeValue(theRow: number, theCol: number): number;

  // gp_Mat.IsSingular (method)
  IsSingular(): boolean;

  // gp_Mat.Add (method)
  Add(theOther: gp_Mat): void;

  // gp_Mat.Added (method)
  Added(theOther: gp_Mat): gp_Mat;

  // gp_Mat.Divide (method)
  Divide(theScalar: number): void;

  // gp_Mat.Divided (method)
  Divided(theScalar: number): gp_Mat;

  // gp_Mat.Invert (method)
  Invert(): void;

  // gp_Mat.Inverted (method)
  Inverted(): gp_Mat;

  // gp_Mat.Multiplied (method)
  Multiplied(theOther: gp_Mat): gp_Mat;
  Multiplied(theScalar: number): gp_Mat;

  // gp_Mat.Multiply (method)
  Multiply(theOther: gp_Mat): void;
  Multiply(theScalar: number): void;

  // gp_Mat.PreMultiply (method)
  PreMultiply(theOther: gp_Mat): void;

  // gp_Mat.Power (method)
  Power(N: number): void;

  // gp_Mat.Powered (method)
  Powered(theN: number): gp_Mat;

  // gp_Mat.Subtract (method)
  Subtract(theOther: gp_Mat): void;

  // gp_Mat.Subtracted (method)
  Subtracted(theOther: gp_Mat): gp_Mat;

  // gp_Mat.Transpose (method)
  Transpose(): void;

  // gp_Mat.Transposed (method)
  Transposed(): gp_Mat;

  // gp_Mat.delete (method)
  delete(): void;

  // gp_Mat.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Mat2d: declare class gp_Mat2d

  // gp_Mat2d.constructor (constructor)
  constructor();
  constructor(theCol1: gp_XY, theCol2: gp_XY);

  // gp_Mat2d.SetCol (method)
  SetCol(theCol: number, theValue: gp_XY): void;

  // gp_Mat2d.SetCols (method)
  SetCols(theCol1: gp_XY, theCol2: gp_XY): void;

  // gp_Mat2d.SetDiagonal (method)
  SetDiagonal(theX1: number, theX2: number): void;

  // gp_Mat2d.SetIdentity (method)
  SetIdentity(): void;

  // gp_Mat2d.SetRotation (method)
  SetRotation(theAng: number): void;

  // gp_Mat2d.SetRow (method)
  SetRow(theRow: number, theValue: gp_XY): void;

  // gp_Mat2d.SetRows (method)
  SetRows(theRow1: gp_XY, theRow2: gp_XY): void;

  // gp_Mat2d.SetScale (method)
  SetScale(theS: number): void;

  // gp_Mat2d.SetValue (method)
  SetValue(theRow: number, theCol: number, theValue: number): void;

  // gp_Mat2d.Column (method)
  Column(theCol: number): gp_XY;

  // gp_Mat2d.Determinant (method)
  Determinant(): number;

  // gp_Mat2d.Diagonal (method)
  Diagonal(): gp_XY;

  // gp_Mat2d.Row (method)
  Row(theRow: number): gp_XY;

  // gp_Mat2d.Value (method)
  Value(theRow: number, theCol: number): number;

  // gp_Mat2d.ChangeValue (method)
  ChangeValue(theRow: number, theCol: number): number;

  // gp_Mat2d.IsSingular (method)
  IsSingular(): boolean;

  // gp_Mat2d.Add (method)
  Add(Other: gp_Mat2d): void;

  // gp_Mat2d.Added (method)
  Added(theOther: gp_Mat2d): gp_Mat2d;

  // gp_Mat2d.Divide (method)
  Divide(theScalar: number): void;

  // gp_Mat2d.Divided (method)
  Divided(theScalar: number): gp_Mat2d;

  // gp_Mat2d.Invert (method)
  Invert(): void;

  // gp_Mat2d.Inverted (method)
  Inverted(): gp_Mat2d;

  // gp_Mat2d.Multiplied (method)
  Multiplied(theOther: gp_Mat2d): gp_Mat2d;
  Multiplied(theScalar: number): gp_Mat2d;

  // gp_Mat2d.Multiply (method)
  Multiply(theOther: gp_Mat2d): void;
  Multiply(theScalar: number): void;

  // gp_Mat2d.PreMultiply (method)
  PreMultiply(theOther: gp_Mat2d): void;

  // gp_Mat2d.Power (method)
  Power(theN: number): void;

  // gp_Mat2d.Powered (method)
  Powered(theN: number): gp_Mat2d;

  // gp_Mat2d.Subtract (method)
  Subtract(theOther: gp_Mat2d): void;

  // gp_Mat2d.Subtracted (method)
  Subtracted(theOther: gp_Mat2d): gp_Mat2d;

  // gp_Mat2d.Transpose (method)
  Transpose(): void;

  // gp_Mat2d.Transposed (method)
  Transposed(): gp_Mat2d;

  // gp_Mat2d.delete (method)
  delete(): void;

  // gp_Mat2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Parab: declare class gp_Parab

  // gp_Parab.constructor (constructor)
  constructor();
  constructor(theA2: gp_Ax2, theFocal: number);
  constructor(theD: gp_Ax1, theF: gp_Pnt);

  // gp_Parab.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Parab.SetFocal (method)
  SetFocal(theFocal: number): void;

  // gp_Parab.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // gp_Parab.SetPosition (method)
  SetPosition(theA2: gp_Ax2): void;

  // gp_Parab.Axis (method)
  Axis(): gp_Ax1;

  // gp_Parab.Directrix (method)
  Directrix(): gp_Ax1;

  // gp_Parab.Focal (method)
  Focal(): number;

  // gp_Parab.Focus (method)
  Focus(): gp_Pnt;

  // gp_Parab.Location (method)
  Location(): gp_Pnt;

  // gp_Parab.Parameter (method)
  Parameter(): number;

  // gp_Parab.Position (method)
  Position(): gp_Ax2;

  // gp_Parab.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Parab.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Parab.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Parab.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Parab;
  Mirrored(theA1: gp_Ax1): gp_Parab;
  Mirrored(theA2: gp_Ax2): gp_Parab;

  // gp_Parab.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Parab.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Parab;

  // gp_Parab.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Parab.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Parab;

  // gp_Parab.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Parab.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Parab;

  // gp_Parab.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Parab.Translated (method)
  Translated(theV: gp_Vec): gp_Parab;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Parab;

  // gp_Parab.delete (method)
  delete(): void;

  // gp_Parab.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Parab2d: declare class gp_Parab2d

  // gp_Parab2d.constructor (constructor)
  constructor();
  constructor(theAxes: gp_Ax22d, theFocalLength: number);
  constructor(theMirrorAxis: gp_Ax2d, theFocalLength: number, theSense?: boolean);
  constructor(theDirectrix: gp_Ax2d, theFocus: gp_Pnt2d, theSense?: boolean);

  // gp_Parab2d.SetFocal (method)
  SetFocal(theFocal: number): void;

  // gp_Parab2d.SetLocation (method)
  SetLocation(theP: gp_Pnt2d): void;

  // gp_Parab2d.SetMirrorAxis (method)
  SetMirrorAxis(theA: gp_Ax2d): void;

  // gp_Parab2d.SetAxis (method)
  SetAxis(theA: gp_Ax22d): void;

  // gp_Parab2d.Coefficients (method)
  Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

  // gp_Parab2d.Directrix (method)
  Directrix(): gp_Ax2d;

  // gp_Parab2d.Focal (method)
  Focal(): number;

  // gp_Parab2d.Focus (method)
  Focus(): gp_Pnt2d;

  // gp_Parab2d.Location (method)
  Location(): gp_Pnt2d;

  // gp_Parab2d.MirrorAxis (method)
  MirrorAxis(): gp_Ax2d;

  // gp_Parab2d.Axis (method)
  Axis(): gp_Ax22d;

  // gp_Parab2d.Parameter (method)
  Parameter(): number;

  // gp_Parab2d.Reverse (method)
  Reverse(): void;

  // gp_Parab2d.Reversed (method)
  Reversed(): gp_Parab2d;

  // gp_Parab2d.IsDirect (method)
  IsDirect(): boolean;

  // gp_Parab2d.Mirror (method)
  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;

  // gp_Parab2d.Mirrored (method)
  Mirrored(theP: gp_Pnt2d): gp_Parab2d;
  Mirrored(theA: gp_Ax2d): gp_Parab2d;

  // gp_Parab2d.Rotate (method)
  Rotate(theP: gp_Pnt2d, theAng: number): void;

  // gp_Parab2d.Rotated (method)
  Rotated(theP: gp_Pnt2d, theAng: number): gp_Parab2d;

  // gp_Parab2d.Scale (method)
  Scale(theP: gp_Pnt2d, theS: number): void;

  // gp_Parab2d.Scaled (method)
  Scaled(theP: gp_Pnt2d, theS: number): gp_Parab2d;

  // gp_Parab2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Parab2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Parab2d;

  // gp_Parab2d.Translate (method)
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Parab2d.Translated (method)
  Translated(theV: gp_Vec2d): gp_Parab2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Parab2d;

  // gp_Parab2d.delete (method)
  delete(): void;

  // gp_Parab2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Pln: declare class gp_Pln

  // gp_Pln.constructor (constructor)
  constructor();
  constructor(theA3: gp_Ax3);
  constructor(theP: gp_Pnt, theV: gp_Dir);
  constructor(theA: number, theB: number, theC: number, theD: number);

  // gp_Pln.Coefficients (method)
  Coefficients(theA?: number, theB?: number, theC?: number, theD?: number): { theA: number; theB: number; theC: number; theD: number };

  // gp_Pln.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Pln.SetLocation (method)
  SetLocation(theLoc: gp_Pnt): void;

  // gp_Pln.SetPosition (method)
  SetPosition(theA3: gp_Ax3): void;

  // gp_Pln.UReverse (method)
  UReverse(): void;

  // gp_Pln.VReverse (method)
  VReverse(): void;

  // gp_Pln.Direct (method)
  Direct(): boolean;

  // gp_Pln.Axis (method)
  Axis(): gp_Ax1;

  // gp_Pln.Location (method)
  Location(): gp_Pnt;

  // gp_Pln.Position (method)
  Position(): gp_Ax3;

  // gp_Pln.Distance (method)
  Distance(theP: gp_Pnt): number;
  Distance(theL: gp_Lin): number;
  Distance(theOther: gp_Pln): number;

  // gp_Pln.SignedDistance (method)
  SignedDistance(theP: gp_Pnt): number;
  SignedDistance(theL: gp_Lin): number;
  SignedDistance(theOther: gp_Pln): number;

  // gp_Pln.SquareDistance (method)
  SquareDistance(theP: gp_Pnt): number;
  SquareDistance(theL: gp_Lin): number;
  SquareDistance(theOther: gp_Pln): number;

  // gp_Pln.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Pln.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Pln.Contains (method)
  Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;
  Contains(theL: gp_Lin, theLinearTolerance: number, theAngularTolerance: number): boolean;

  // gp_Pln.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Pln.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Pln;
  Mirrored(theA1: gp_Ax1): gp_Pln;
  Mirrored(theA2: gp_Ax2): gp_Pln;

  // gp_Pln.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Pln.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Pln;

  // gp_Pln.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Pln.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Pln;

  // gp_Pln.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Pln.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Pln;

  // gp_Pln.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Pln.Translated (method)
  Translated(theV: gp_Vec): gp_Pln;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pln;

  // gp_Pln.delete (method)
  delete(): void;

  // gp_Pln.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Pnt: declare class gp_Pnt

  // gp_Pnt.constructor (constructor)
  constructor();
  constructor(theCoord: gp_XYZ);
  constructor(theXp: number, theYp: number, theZp: number);

  // gp_Pnt.SetCoord (method)
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXp: number, theYp: number, theZp: number): void;

  // gp_Pnt.SetX (method)
  SetX(theX: number): void;

  // gp_Pnt.SetY (method)
  SetY(theY: number): void;

  // gp_Pnt.SetZ (method)
  SetZ(theZ: number): void;

  // gp_Pnt.SetXYZ (method)
  SetXYZ(theCoord: gp_XYZ): void;

  // gp_Pnt.Coord (method)
  Coord(theIndex: number): number;
  Coord(theXp?: number, theYp?: number, theZp?: number): { theXp: number; theYp: number; theZp: number };
  Coord(): gp_XYZ;

  // gp_Pnt.X (method)
  X(): number;

  // gp_Pnt.Y (method)
  Y(): number;

  // gp_Pnt.Z (method)
  Z(): number;

  // gp_Pnt.XYZ (method)
  XYZ(): gp_XYZ;

  // gp_Pnt.ChangeCoord (method)
  ChangeCoord(): gp_XYZ;

  // gp_Pnt.BaryCenter (method)
  BaryCenter(theAlpha: number, theP: gp_Pnt, theBeta: number): void;

  // gp_Pnt.IsEqual (method)
  IsEqual(theOther: gp_Pnt, theLinearTolerance: number): boolean;

  // gp_Pnt.Distance (method)
  Distance(theOther: gp_Pnt): number;

  // gp_Pnt.SquareDistance (method)
  SquareDistance(theOther: gp_Pnt): number;

  // gp_Pnt.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Pnt.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Pnt;
  Mirrored(theA1: gp_Ax1): gp_Pnt;
  Mirrored(theA2: gp_Ax2): gp_Pnt;

  // gp_Pnt.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Pnt.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Pnt;

  // gp_Pnt.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Pnt.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Pnt;

  // gp_Pnt.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Pnt.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Pnt;

  // gp_Pnt.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Pnt.Translated (method)
  Translated(theV: gp_Vec): gp_Pnt;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pnt;

  // gp_Pnt.delete (method)
  delete(): void;

  // gp_Pnt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Pnt2d: declare class gp_Pnt2d

  // gp_Pnt2d.constructor (constructor)
  constructor();
  constructor(theCoord: gp_XY);
  constructor(theXp: number, theYp: number);

  // gp_Pnt2d.SetCoord (method)
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXp: number, theYp: number): void;

  // gp_Pnt2d.SetX (method)
  SetX(theX: number): void;

  // gp_Pnt2d.SetY (method)
  SetY(theY: number): void;

  // gp_Pnt2d.SetXY (method)
  SetXY(theCoord: gp_XY): void;

  // gp_Pnt2d.Coord (method)
  Coord(theIndex: number): number;
  Coord(theXp?: number, theYp?: number): { theXp: number; theYp: number };
  Coord(): gp_XY;

  // gp_Pnt2d.X (method)
  X(): number;

  // gp_Pnt2d.Y (method)
  Y(): number;

  // gp_Pnt2d.XY (method)
  XY(): gp_XY;

  // gp_Pnt2d.ChangeCoord (method)
  ChangeCoord(): gp_XY;

  // gp_Pnt2d.IsEqual (method)
  IsEqual(theOther: gp_Pnt2d, theLinearTolerance: number): boolean;

  // gp_Pnt2d.Distance (method)
  Distance(theOther: gp_Pnt2d): number;

  // gp_Pnt2d.SquareDistance (method)
  SquareDistance(theOther: gp_Pnt2d): number;

  // gp_Pnt2d.Mirror (method)
  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;

  // gp_Pnt2d.Mirrored (method)
  Mirrored(theP: gp_Pnt2d): gp_Pnt2d;
  Mirrored(theA: gp_Ax2d): gp_Pnt2d;

  // gp_Pnt2d.Rotate (method)
  Rotate(theP: gp_Pnt2d, theAng: number): void;

  // gp_Pnt2d.Rotated (method)
  Rotated(theP: gp_Pnt2d, theAng: number): gp_Pnt2d;

  // gp_Pnt2d.Scale (method)
  Scale(theP: gp_Pnt2d, theS: number): void;

  // gp_Pnt2d.Scaled (method)
  Scaled(theP: gp_Pnt2d, theS: number): gp_Pnt2d;

  // gp_Pnt2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Pnt2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Pnt2d;

  // gp_Pnt2d.Translate (method)
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Pnt2d.Translated (method)
  Translated(theV: gp_Vec2d): gp_Pnt2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Pnt2d;

  // gp_Pnt2d.delete (method)
  delete(): void;

  // gp_Pnt2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
