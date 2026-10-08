# libcascade — gp (3)

12 top-level symbols. Signatures are verbatim typescript.

gp_Quaternion: declare class gp_Quaternion

  // gp_Quaternion.constructor (constructor)
  constructor();
  constructor(theMat: gp_Mat);
  constructor(theVecFrom: gp_Vec, theVecTo: gp_Vec);
  constructor(theAxis: gp_Vec, theAngle: number);
  constructor(theVecFrom: gp_Vec, theVecTo: gp_Vec, theHelpCrossVec: gp_Vec);
  constructor(theX: number, theY: number, theZ: number, theW: number);

  // gp_Quaternion.IsEqual (method)
  IsEqual(theOther: gp_Quaternion): boolean;

  // gp_Quaternion.SetRotation (method)
  SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec): void;
  SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec, theHelpCrossVec: gp_Vec): void;

  // gp_Quaternion.SetVectorAndAngle (method)
  SetVectorAndAngle(theAxis: gp_Vec, theAngle: number): void;

  // gp_Quaternion.GetVectorAndAngle (method)
  GetVectorAndAngle(theAxis: gp_Vec, theAngle?: number): { theAngle: number };

  // gp_Quaternion.SetMatrix (method)
  SetMatrix(theMat: gp_Mat): void;

  // gp_Quaternion.GetMatrix (method)
  GetMatrix(): gp_Mat;

  // gp_Quaternion.SetEulerAngles (method)
  SetEulerAngles(theOrder: gp_EulerSequence, theAlpha: number, theBeta: number, theGamma: number): void;

  // gp_Quaternion.GetEulerAngles (method)
  GetEulerAngles(theOrder: gp_EulerSequence, theAlpha?: number, theBeta?: number, theGamma?: number): { theAlpha: number; theBeta: number; theGamma: number };

  // gp_Quaternion.Set (method)
  Set(theX: number, theY: number, theZ: number, theW: number): void;
  Set(theQuaternion: gp_Quaternion): void;

  // gp_Quaternion.X (method)
  X(): number;

  // gp_Quaternion.Y (method)
  Y(): number;

  // gp_Quaternion.Z (method)
  Z(): number;

  // gp_Quaternion.W (method)
  W(): number;

  // gp_Quaternion.SetIdent (method)
  SetIdent(): void;

  // gp_Quaternion.Reverse (method)
  Reverse(): void;

  // gp_Quaternion.Reversed (method)
  Reversed(): gp_Quaternion;

  // gp_Quaternion.Invert (method)
  Invert(): void;

  // gp_Quaternion.Inverted (method)
  Inverted(): gp_Quaternion;

  // gp_Quaternion.SquareNorm (method)
  SquareNorm(): number;

  // gp_Quaternion.Norm (method)
  Norm(): number;

  // gp_Quaternion.Scale (method)
  Scale(theScale: number): void;

  // gp_Quaternion.Scaled (method)
  Scaled(theScale: number): gp_Quaternion;

  // gp_Quaternion.StabilizeLength (method)
  StabilizeLength(): void;

  // gp_Quaternion.Normalize (method)
  Normalize(): void;

  // gp_Quaternion.Normalized (method)
  Normalized(): gp_Quaternion;

  // gp_Quaternion.Negated (method)
  Negated(): gp_Quaternion;

  // gp_Quaternion.Added (method)
  Added(theOther: gp_Quaternion): gp_Quaternion;

  // gp_Quaternion.Subtracted (method)
  Subtracted(theOther: gp_Quaternion): gp_Quaternion;

  // gp_Quaternion.Multiplied (method)
  Multiplied(theOther: gp_Quaternion): gp_Quaternion;

  // gp_Quaternion.Add (method)
  Add(theOther: gp_Quaternion): void;

  // gp_Quaternion.Subtract (method)
  Subtract(theOther: gp_Quaternion): void;

  // gp_Quaternion.Multiply (method)
  Multiply(theOther: gp_Quaternion): void;
  Multiply(theVec: gp_Vec): gp_Vec;

  // gp_Quaternion.Dot (method)
  Dot(theOther: gp_Quaternion): number;

  // gp_Quaternion.GetRotationAngle (method)
  GetRotationAngle(): number;

  // gp_Quaternion.delete (method)
  delete(): void;

  // gp_Quaternion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_QuaternionNLerp: declare class gp_QuaternionNLerp

  // gp_QuaternionNLerp.constructor (constructor)
  constructor();
  constructor(theQStart: gp_Quaternion, theQEnd: gp_Quaternion);

  // gp_QuaternionNLerp.Interpolate (method)
  static Interpolate(theQStart: gp_Quaternion, theQEnd: gp_Quaternion, theT: number): gp_Quaternion;
  Interpolate(theT: number, theResultQ: gp_Quaternion): void;

  // gp_QuaternionNLerp.Init (method)
  Init(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

  // gp_QuaternionNLerp.InitFromUnit (method)
  InitFromUnit(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

  // gp_QuaternionNLerp.delete (method)
  delete(): void;

  // gp_QuaternionNLerp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_QuaternionSLerp: declare class gp_QuaternionSLerp

  // gp_QuaternionSLerp.constructor (constructor)
  constructor();
  constructor(theQStart: gp_Quaternion, theQEnd: gp_Quaternion);

  // gp_QuaternionSLerp.Interpolate (method)
  static Interpolate(theQStart: gp_Quaternion, theQEnd: gp_Quaternion, theT: number): gp_Quaternion;
  Interpolate(theT: number, theResultQ: gp_Quaternion): void;

  // gp_QuaternionSLerp.Init (method)
  Init(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

  // gp_QuaternionSLerp.InitFromUnit (method)
  InitFromUnit(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

  // gp_QuaternionSLerp.delete (method)
  delete(): void;

  // gp_QuaternionSLerp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Sphere: declare class gp_Sphere

  // gp_Sphere.constructor (constructor)
  constructor();
  constructor(theA3: gp_Ax3, theRadius: number);

  // gp_Sphere.SetLocation (method)
  SetLocation(theLoc: gp_Pnt): void;

  // gp_Sphere.SetPosition (method)
  SetPosition(theA3: gp_Ax3): void;

  // gp_Sphere.SetRadius (method)
  SetRadius(theR: number): void;

  // gp_Sphere.Area (method)
  Area(): number;

  // gp_Sphere.Coefficients (method)
  Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

  // gp_Sphere.UReverse (method)
  UReverse(): void;

  // gp_Sphere.VReverse (method)
  VReverse(): void;

  // gp_Sphere.Direct (method)
  Direct(): boolean;

  // gp_Sphere.Location (method)
  Location(): gp_Pnt;

  // gp_Sphere.Position (method)
  Position(): gp_Ax3;

  // gp_Sphere.Radius (method)
  Radius(): number;

  // gp_Sphere.Volume (method)
  Volume(): number;

  // gp_Sphere.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Sphere.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Sphere.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Sphere.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Sphere;
  Mirrored(theA1: gp_Ax1): gp_Sphere;
  Mirrored(theA2: gp_Ax2): gp_Sphere;

  // gp_Sphere.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Sphere.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Sphere;

  // gp_Sphere.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Sphere.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Sphere;

  // gp_Sphere.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Sphere.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Sphere;

  // gp_Sphere.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Sphere.Translated (method)
  Translated(theV: gp_Vec): gp_Sphere;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Sphere;

  // gp_Sphere.delete (method)
  delete(): void;

  // gp_Sphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Torus: declare class gp_Torus

  // gp_Torus.constructor (constructor)
  constructor();
  constructor(theA3: gp_Ax3, theMajorRadius: number, theMinorRadius: number);

  // gp_Torus.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Torus.SetLocation (method)
  SetLocation(theLoc: gp_Pnt): void;

  // gp_Torus.SetMajorRadius (method)
  SetMajorRadius(theMajorRadius: number): void;

  // gp_Torus.SetMinorRadius (method)
  SetMinorRadius(theMinorRadius: number): void;

  // gp_Torus.SetPosition (method)
  SetPosition(theA3: gp_Ax3): void;

  // gp_Torus.Area (method)
  Area(): number;

  // gp_Torus.UReverse (method)
  UReverse(): void;

  // gp_Torus.VReverse (method)
  VReverse(): void;

  // gp_Torus.Direct (method)
  Direct(): boolean;

  // gp_Torus.Axis (method)
  Axis(): gp_Ax1;

  // gp_Torus.Coefficients (method)
  Coefficients(theCoef: NCollection_Array1_double): void;

  // gp_Torus.Location (method)
  Location(): gp_Pnt;

  // gp_Torus.Position (method)
  Position(): gp_Ax3;

  // gp_Torus.MajorRadius (method)
  MajorRadius(): number;

  // gp_Torus.MinorRadius (method)
  MinorRadius(): number;

  // gp_Torus.Volume (method)
  Volume(): number;

  // gp_Torus.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Torus.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Torus.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Torus.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Torus;
  Mirrored(theA1: gp_Ax1): gp_Torus;
  Mirrored(theA2: gp_Ax2): gp_Torus;

  // gp_Torus.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Torus.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Torus;

  // gp_Torus.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Torus.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Torus;

  // gp_Torus.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Torus.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Torus;

  // gp_Torus.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Torus.Translated (method)
  Translated(theV: gp_Vec): gp_Torus;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Torus;

  // gp_Torus.delete (method)
  delete(): void;

  // gp_Torus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Trsf: declare class gp_Trsf

  // gp_Trsf.constructor (constructor)
  constructor();
  constructor(theT: gp_Trsf2d);

  // gp_Trsf.SetMirror (method)
  SetMirror(theP: gp_Pnt): void;
  SetMirror(theA1: gp_Ax1): void;
  SetMirror(theA2: gp_Ax2): void;

  // gp_Trsf.SetRotation (method)
  SetRotation(theA1: gp_Ax1, theAng: number): void;
  SetRotation(theR: gp_Quaternion): void;

  // gp_Trsf.SetRotationPart (method)
  SetRotationPart(theR: gp_Quaternion): void;

  // gp_Trsf.SetScale (method)
  SetScale(theP: gp_Pnt, theS: number): void;

  // gp_Trsf.SetDisplacement (method)
  SetDisplacement(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;

  // gp_Trsf.SetTransformation (method)
  SetTransformation(theToSystem: gp_Ax3): void;
  SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
  SetTransformation(R: gp_Quaternion, theT: gp_Vec): void;

  // gp_Trsf.SetTranslation (method)
  SetTranslation(theV: gp_Vec): void;
  SetTranslation(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Trsf.SetTranslationPart (method)
  SetTranslationPart(theV: gp_Vec): void;

  // gp_Trsf.SetScaleFactor (method)
  SetScaleFactor(theS: number): void;

  // gp_Trsf.SetForm (method)
  SetForm(theP: gp_TrsfForm): void;

  // gp_Trsf.SetValues (method)
  SetValues(a11: number, a12: number, a13: number, a14: number, a21: number, a22: number, a23: number, a24: number, a31: number, a32: number, a33: number, a34: number): void;

  // gp_Trsf.IsNegative (method)
  IsNegative(): boolean;

  // gp_Trsf.Form (method)
  Form(): gp_TrsfForm;

  // gp_Trsf.ScaleFactor (method)
  ScaleFactor(): number;

  // gp_Trsf.TranslationPart (method)
  TranslationPart(): gp_XYZ;

  // gp_Trsf.GetRotation (method)
  GetRotation(theAxis: gp_XYZ, theAngle?: number): { returnValue: boolean; theAngle: number };
  GetRotation(): gp_Quaternion;

  // gp_Trsf.VectorialPart (method)
  VectorialPart(): gp_Mat;

  // gp_Trsf.HVectorialPart (method)
  HVectorialPart(): gp_Mat;

  // gp_Trsf.Value (method)
  Value(theRow: number, theCol: number): number;

  // gp_Trsf.Invert (method)
  Invert(): void;

  // gp_Trsf.Inverted (method)
  Inverted(): gp_Trsf;

  // gp_Trsf.Multiplied (method)
  Multiplied(theT: gp_Trsf): gp_Trsf;

  // gp_Trsf.Multiply (method)
  Multiply(theT: gp_Trsf): void;

  // gp_Trsf.PreMultiply (method)
  PreMultiply(theT: gp_Trsf): void;

  // gp_Trsf.Power (method)
  Power(theN: number): void;

  // gp_Trsf.Powered (method)
  Powered(theN: number): gp_Trsf;

  // gp_Trsf.Transforms (method)
  Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
  Transforms(theCoord: gp_XYZ): void;

  // gp_Trsf.delete (method)
  delete(): void;

  // gp_Trsf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Trsf2d: declare class gp_Trsf2d

  // gp_Trsf2d.constructor (constructor)
  constructor();
  constructor(theT: gp_Trsf);

  // gp_Trsf2d.SetMirror (method)
  SetMirror(theP: gp_Pnt2d): void;
  SetMirror(theA: gp_Ax2d): void;

  // gp_Trsf2d.SetRotation (method)
  SetRotation(theP: gp_Pnt2d, theAng: number): void;

  // gp_Trsf2d.SetScale (method)
  SetScale(theP: gp_Pnt2d, theS: number): void;

  // gp_Trsf2d.SetTransformation (method)
  SetTransformation(theFromSystem1: gp_Ax2d, theToSystem2: gp_Ax2d): void;
  SetTransformation(theToSystem: gp_Ax2d): void;

  // gp_Trsf2d.SetTranslation (method)
  SetTranslation(theV: gp_Vec2d): void;
  SetTranslation(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Trsf2d.SetTranslationPart (method)
  SetTranslationPart(theV: gp_Vec2d): void;

  // gp_Trsf2d.SetScaleFactor (method)
  SetScaleFactor(theS: number): void;

  // gp_Trsf2d.IsNegative (method)
  IsNegative(): boolean;

  // gp_Trsf2d.Form (method)
  Form(): gp_TrsfForm;

  // gp_Trsf2d.ScaleFactor (method)
  ScaleFactor(): number;

  // gp_Trsf2d.TranslationPart (method)
  TranslationPart(): gp_XY;

  // gp_Trsf2d.VectorialPart (method)
  VectorialPart(): gp_Mat2d;

  // gp_Trsf2d.HVectorialPart (method)
  HVectorialPart(): gp_Mat2d;

  // gp_Trsf2d.RotationPart (method)
  RotationPart(): number;

  // gp_Trsf2d.Value (method)
  Value(theRow: number, theCol: number): number;

  // gp_Trsf2d.Invert (method)
  Invert(): void;

  // gp_Trsf2d.Inverted (method)
  Inverted(): gp_Trsf2d;

  // gp_Trsf2d.Multiplied (method)
  Multiplied(theT: gp_Trsf2d): gp_Trsf2d;

  // gp_Trsf2d.Multiply (method)
  Multiply(theT: gp_Trsf2d): void;

  // gp_Trsf2d.PreMultiply (method)
  PreMultiply(theT: gp_Trsf2d): void;

  // gp_Trsf2d.Power (method)
  Power(theN: number): void;

  // gp_Trsf2d.Powered (method)
  Powered(theN: number): gp_Trsf2d;

  // gp_Trsf2d.Transforms (method)
  Transforms(theX?: number, theY?: number): { theX: number; theY: number };
  Transforms(theCoord: gp_XY): void;

  // gp_Trsf2d.SetValues (method)
  SetValues(a11: number, a12: number, a13: number, a21: number, a22: number, a23: number): void;

  // gp_Trsf2d.delete (method)
  delete(): void;

  // gp_Trsf2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_TrsfForm: typeof gp_TrsfForm[keyof typeof gp_TrsfForm]

  readonly gp_Identity: 'gp_Identity'

  readonly gp_Rotation: 'gp_Rotation'

  readonly gp_Translation: 'gp_Translation'

  readonly gp_PntMirror: 'gp_PntMirror'

  readonly gp_Ax1Mirror: 'gp_Ax1Mirror'

  readonly gp_Ax2Mirror: 'gp_Ax2Mirror'

  readonly gp_Scale: 'gp_Scale'

  readonly gp_CompoundTrsf: 'gp_CompoundTrsf'

  readonly gp_Other: 'gp_Other'

gp_Vec: declare class gp_Vec

  // gp_Vec.constructor (constructor)
  constructor();
  constructor(theV: gp_Dir);
  constructor(theCoord: gp_XYZ);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt);
  constructor(theXv: number, theYv: number, theZv: number);

  // gp_Vec.SetCoord (method)
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXv: number, theYv: number, theZv: number): void;

  // gp_Vec.SetX (method)
  SetX(theX: number): void;

  // gp_Vec.SetY (method)
  SetY(theY: number): void;

  // gp_Vec.SetZ (method)
  SetZ(theZ: number): void;

  // gp_Vec.SetXYZ (method)
  SetXYZ(theCoord: gp_XYZ): void;

  // gp_Vec.Coord (method)
  Coord(theIndex: number): number;
  Coord(theXv?: number, theYv?: number, theZv?: number): { theXv: number; theYv: number; theZv: number };

  // gp_Vec.X (method)
  X(): number;

  // gp_Vec.Y (method)
  Y(): number;

  // gp_Vec.Z (method)
  Z(): number;

  // gp_Vec.XYZ (method)
  XYZ(): gp_XYZ;

  // gp_Vec.IsEqual (method)
  IsEqual(theOther: gp_Vec, theLinearTolerance: number, theAngularTolerance: number): boolean;

  // gp_Vec.IsNormal (method)
  IsNormal(theOther: gp_Vec, theAngularTolerance: number): boolean;

  // gp_Vec.IsOpposite (method)
  IsOpposite(theOther: gp_Vec, theAngularTolerance: number): boolean;

  // gp_Vec.IsParallel (method)
  IsParallel(theOther: gp_Vec, theAngularTolerance: number): boolean;

  // gp_Vec.Angle (method)
  Angle(theOther: gp_Vec): number;

  // gp_Vec.AngleWithRef (method)
  AngleWithRef(theOther: gp_Vec, theVRef: gp_Vec): number;

  // gp_Vec.Magnitude (method)
  Magnitude(): number;

  // gp_Vec.SquareMagnitude (method)
  SquareMagnitude(): number;

  // gp_Vec.Add (method)
  Add(theOther: gp_Vec): void;

  // gp_Vec.Added (method)
  Added(theOther: gp_Vec): gp_Vec;

  // gp_Vec.Subtract (method)
  Subtract(theRight: gp_Vec): void;

  // gp_Vec.Subtracted (method)
  Subtracted(theRight: gp_Vec): gp_Vec;

  // gp_Vec.Multiply (method)
  Multiply(theScalar: number): void;

  // gp_Vec.Multiplied (method)
  Multiplied(theScalar: number): gp_Vec;

  // gp_Vec.Divide (method)
  Divide(theScalar: number): void;

  // gp_Vec.Divided (method)
  Divided(theScalar: number): gp_Vec;

  // gp_Vec.Cross (method)
  Cross(theRight: gp_Vec): void;

  // gp_Vec.Crossed (method)
  Crossed(theRight: gp_Vec): gp_Vec;

  // gp_Vec.CrossMagnitude (method)
  CrossMagnitude(theRight: gp_Vec): number;

  // gp_Vec.CrossSquareMagnitude (method)
  CrossSquareMagnitude(theRight: gp_Vec): number;

  // gp_Vec.CrossCross (method)
  CrossCross(theV1: gp_Vec, theV2: gp_Vec): void;

  // gp_Vec.CrossCrossed (method)
  CrossCrossed(theV1: gp_Vec, theV2: gp_Vec): gp_Vec;

  // gp_Vec.Dot (method)
  Dot(theOther: gp_Vec): number;

  // gp_Vec.DotCross (method)
  DotCross(theV1: gp_Vec, theV2: gp_Vec): number;

  // gp_Vec.Normalize (method)
  Normalize(): void;

  // gp_Vec.Normalized (method)
  Normalized(): gp_Vec;

  // gp_Vec.Reverse (method)
  Reverse(): void;

  // gp_Vec.Reversed (method)
  Reversed(): gp_Vec;

  // gp_Vec.SetLinearForm (method)
  SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec, theV4: gp_Vec): void;
  SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theA3: number, theV3: gp_Vec): void;
  SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec, theV3: gp_Vec): void;
  SetLinearForm(theA1: number, theV1: gp_Vec, theA2: number, theV2: gp_Vec): void;
  SetLinearForm(theA1: number, theV1: gp_Vec, theV2: gp_Vec): void;
  SetLinearForm(theV1: gp_Vec, theV2: gp_Vec): void;

  // gp_Vec.Mirror (method)
  Mirror(theV: gp_Vec): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Vec.Mirrored (method)
  Mirrored(theV: gp_Vec): gp_Vec;
  Mirrored(theA1: gp_Ax1): gp_Vec;
  Mirrored(theA2: gp_Ax2): gp_Vec;

  // gp_Vec.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Vec.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Vec;

  // gp_Vec.Scale (method)
  Scale(theS: number): void;

  // gp_Vec.Scaled (method)
  Scaled(theS: number): gp_Vec;

  // gp_Vec.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Vec.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Vec;

  // gp_Vec.delete (method)
  delete(): void;

  // gp_Vec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Vec2d: declare class gp_Vec2d

  // gp_Vec2d.constructor (constructor)
  constructor();
  constructor(theV: gp_Dir2d);
  constructor(theCoord: gp_XY);
  constructor(theXv: number, theYv: number);
  constructor(theP1: gp_Pnt2d, theP2: gp_Pnt2d);

  // gp_Vec2d.SetCoord (method)
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXv: number, theYv: number): void;

  // gp_Vec2d.SetX (method)
  SetX(theX: number): void;

  // gp_Vec2d.SetY (method)
  SetY(theY: number): void;

  // gp_Vec2d.SetXY (method)
  SetXY(theCoord: gp_XY): void;

  // gp_Vec2d.Coord (method)
  Coord(theIndex: number): number;
  Coord(theXv?: number, theYv?: number): { theXv: number; theYv: number };

  // gp_Vec2d.X (method)
  X(): number;

  // gp_Vec2d.Y (method)
  Y(): number;

  // gp_Vec2d.XY (method)
  XY(): gp_XY;

  // gp_Vec2d.IsEqual (method)
  IsEqual(theOther: gp_Vec2d, theLinearTolerance: number, theAngularTolerance: number): boolean;

  // gp_Vec2d.IsNormal (method)
  IsNormal(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

  // gp_Vec2d.IsOpposite (method)
  IsOpposite(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

  // gp_Vec2d.IsParallel (method)
  IsParallel(theOther: gp_Vec2d, theAngularTolerance: number): boolean;

  // gp_Vec2d.Angle (method)
  Angle(theOther: gp_Vec2d): number;

  // gp_Vec2d.Magnitude (method)
  Magnitude(): number;

  // gp_Vec2d.SquareMagnitude (method)
  SquareMagnitude(): number;

  // gp_Vec2d.Add (method)
  Add(theOther: gp_Vec2d): void;

  // gp_Vec2d.Added (method)
  Added(theOther: gp_Vec2d): gp_Vec2d;

  // gp_Vec2d.Crossed (method)
  Crossed(theRight: gp_Vec2d): number;

  // gp_Vec2d.CrossMagnitude (method)
  CrossMagnitude(theRight: gp_Vec2d): number;

  // gp_Vec2d.CrossSquareMagnitude (method)
  CrossSquareMagnitude(theRight: gp_Vec2d): number;

  // gp_Vec2d.Divide (method)
  Divide(theScalar: number): void;

  // gp_Vec2d.Divided (method)
  Divided(theScalar: number): gp_Vec2d;

  // gp_Vec2d.Dot (method)
  Dot(theOther: gp_Vec2d): number;

  // gp_Vec2d.GetNormal (method)
  GetNormal(): gp_Vec2d;

  // gp_Vec2d.Multiply (method)
  Multiply(theScalar: number): void;

  // gp_Vec2d.Multiplied (method)
  Multiplied(theScalar: number): gp_Vec2d;

  // gp_Vec2d.Normalize (method)
  Normalize(): void;

  // gp_Vec2d.Normalized (method)
  Normalized(): gp_Vec2d;

  // gp_Vec2d.Reverse (method)
  Reverse(): void;

  // gp_Vec2d.Reversed (method)
  Reversed(): gp_Vec2d;

  // gp_Vec2d.Subtract (method)
  Subtract(theRight: gp_Vec2d): void;

  // gp_Vec2d.Subtracted (method)
  Subtracted(theRight: gp_Vec2d): gp_Vec2d;

  // gp_Vec2d.SetLinearForm (method)
  SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
  SetLinearForm(theA1: number, theV1: gp_Vec2d, theA2: number, theV2: gp_Vec2d): void;
  SetLinearForm(theA1: number, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
  SetLinearForm(theV1: gp_Vec2d, theV2: gp_Vec2d): void;

  // gp_Vec2d.Mirror (method)
  Mirror(theV: gp_Vec2d): void;
  Mirror(theA1: gp_Ax2d): void;

  // gp_Vec2d.Mirrored (method)
  Mirrored(theV: gp_Vec2d): gp_Vec2d;
  Mirrored(theA1: gp_Ax2d): gp_Vec2d;

  // gp_Vec2d.Rotate (method)
  Rotate(theAng: number): void;

  // gp_Vec2d.Rotated (method)
  Rotated(theAng: number): gp_Vec2d;

  // gp_Vec2d.Scale (method)
  Scale(theS: number): void;

  // gp_Vec2d.Scaled (method)
  Scaled(theS: number): gp_Vec2d;

  // gp_Vec2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Vec2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Vec2d;

  // gp_Vec2d.delete (method)
  delete(): void;

  // gp_Vec2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_XY: declare class gp_XY

  // gp_XY.constructor (constructor)
  constructor();
  constructor(theX: number, theY: number);

  // gp_XY.SetCoord (method)
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theX: number, theY: number): void;

  // gp_XY.SetX (method)
  SetX(theX: number): void;

  // gp_XY.SetY (method)
  SetY(theY: number): void;

  // gp_XY.Coord (method)
  Coord(theIndex: number): number;
  Coord(theX?: number, theY?: number): { theX: number; theY: number };

  // gp_XY.ChangeCoord (method)
  ChangeCoord(theIndex: number): number;

  // gp_XY.X (method)
  X(): number;

  // gp_XY.Y (method)
  Y(): number;

  // gp_XY.Modulus (method)
  Modulus(): number;

  // gp_XY.SquareModulus (method)
  SquareModulus(): number;

  // gp_XY.IsEqual (method)
  IsEqual(theOther: gp_XY, theTolerance: number): boolean;

  // gp_XY.Add (method)
  Add(theOther: gp_XY): void;

  // gp_XY.Added (method)
  Added(theOther: gp_XY): gp_XY;

  // gp_XY.Crossed (method)
  Crossed(theOther: gp_XY): number;

  // gp_XY.CrossMagnitude (method)
  CrossMagnitude(theRight: gp_XY): number;

  // gp_XY.CrossSquareMagnitude (method)
  CrossSquareMagnitude(theRight: gp_XY): number;

  // gp_XY.Divide (method)
  Divide(theScalar: number): void;

  // gp_XY.Divided (method)
  Divided(theScalar: number): gp_XY;

  // gp_XY.Dot (method)
  Dot(theOther: gp_XY): number;

  // gp_XY.Multiply (method)
  Multiply(theScalar: number): void;
  Multiply(theOther: gp_XY): void;
  Multiply(theMatrix: gp_Mat2d): void;

  // gp_XY.Multiplied (method)
  Multiplied(theScalar: number): gp_XY;
  Multiplied(theOther: gp_XY): gp_XY;
  Multiplied(theMatrix: gp_Mat2d): gp_XY;

  // gp_XY.Normalize (method)
  Normalize(): void;

  // gp_XY.Normalized (method)
  Normalized(): gp_XY;

  // gp_XY.Reverse (method)
  Reverse(): void;

  // gp_XY.Reversed (method)
  Reversed(): gp_XY;

  // gp_XY.SetLinearForm (method)
  SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY): void;
  SetLinearForm(theA1: number, theXY1: gp_XY, theA2: number, theXY2: gp_XY, theXY3: gp_XY): void;
  SetLinearForm(theA1: number, theXY1: gp_XY, theXY2: gp_XY): void;
  SetLinearForm(theXY1: gp_XY, theXY2: gp_XY): void;

  // gp_XY.Subtract (method)
  Subtract(theOther: gp_XY): void;

  // gp_XY.Subtracted (method)
  Subtracted(theOther: gp_XY): gp_XY;

  // gp_XY.delete (method)
  delete(): void;

  // gp_XY.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_XYZ: declare class gp_XYZ

  // gp_XYZ.constructor (constructor)
  constructor();
  constructor(theX: number, theY: number, theZ: number);

  // gp_XYZ.SetCoord (method)
  SetCoord(theX: number, theY: number, theZ: number): void;
  SetCoord(theIndex: number, theXi: number): void;

  // gp_XYZ.SetX (method)
  SetX(theX: number): void;

  // gp_XYZ.SetY (method)
  SetY(theY: number): void;

  // gp_XYZ.SetZ (method)
  SetZ(theZ: number): void;

  // gp_XYZ.Coord (method)
  Coord(theIndex: number): number;
  Coord(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };

  // gp_XYZ.ChangeCoord (method)
  ChangeCoord(theIndex: number): number;

  // gp_XYZ.GetData (method)
  GetData(): number;

  // gp_XYZ.ChangeData (method)
  ChangeData(): number;

  // gp_XYZ.X (method)
  X(): number;

  // gp_XYZ.Y (method)
  Y(): number;

  // gp_XYZ.Z (method)
  Z(): number;

  // gp_XYZ.Modulus (method)
  Modulus(): number;

  // gp_XYZ.SquareModulus (method)
  SquareModulus(): number;

  // gp_XYZ.IsEqual (method)
  IsEqual(theOther: gp_XYZ, theTolerance: number): boolean;

  // gp_XYZ.Add (method)
  Add(theOther: gp_XYZ): void;

  // gp_XYZ.Added (method)
  Added(theOther: gp_XYZ): gp_XYZ;

  // gp_XYZ.Cross (method)
  Cross(theOther: gp_XYZ): void;

  // gp_XYZ.Crossed (method)
  Crossed(theOther: gp_XYZ): gp_XYZ;

  // gp_XYZ.CrossMagnitude (method)
  CrossMagnitude(theRight: gp_XYZ): number;

  // gp_XYZ.CrossSquareMagnitude (method)
  CrossSquareMagnitude(theRight: gp_XYZ): number;

  // gp_XYZ.CrossCross (method)
  CrossCross(theCoord1: gp_XYZ, theCoord2: gp_XYZ): void;

  // gp_XYZ.CrossCrossed (method)
  CrossCrossed(theCoord1: gp_XYZ, theCoord2: gp_XYZ): gp_XYZ;

  // gp_XYZ.Divide (method)
  Divide(theScalar: number): void;

  // gp_XYZ.Divided (method)
  Divided(theScalar: number): gp_XYZ;

  // gp_XYZ.Dot (method)
  Dot(theOther: gp_XYZ): number;

  // gp_XYZ.DotCross (method)
  DotCross(theCoord1: gp_XYZ, theCoord2: gp_XYZ): number;

  // gp_XYZ.Multiply (method)
  Multiply(theScalar: number): void;
  Multiply(theOther: gp_XYZ): void;
  Multiply(theMatrix: gp_Mat): void;

  // gp_XYZ.Multiplied (method)
  Multiplied(theScalar: number): gp_XYZ;
  Multiplied(theOther: gp_XYZ): gp_XYZ;
  Multiplied(theMatrix: gp_Mat): gp_XYZ;

  // gp_XYZ.Normalize (method)
  Normalize(): void;

  // gp_XYZ.Normalized (method)
  Normalized(): gp_XYZ;

  // gp_XYZ.Reverse (method)
  Reverse(): void;

  // gp_XYZ.Reversed (method)
  Reversed(): gp_XYZ;

  // gp_XYZ.Subtract (method)
  Subtract(theOther: gp_XYZ): void;

  // gp_XYZ.Subtracted (method)
  Subtracted(theOther: gp_XYZ): gp_XYZ;

  // gp_XYZ.SetLinearForm (method)
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ, theXYZ4: gp_XYZ): void;
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theA3: number, theXYZ3: gp_XYZ): void;
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ, theXYZ3: gp_XYZ): void;
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theA2: number, theXYZ2: gp_XYZ): void;
  SetLinearForm(theA1: number, theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;
  SetLinearForm(theXYZ1: gp_XYZ, theXYZ2: gp_XYZ): void;

  // gp_XYZ.delete (method)
  delete(): void;

  // gp_XYZ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
