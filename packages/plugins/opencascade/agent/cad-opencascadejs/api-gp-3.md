# libcascade — gp (3)

11 top-level symbols. Signatures are verbatim typescript.

gp_Pln: declare class gp_Pln

  constructor

  Coefficients(theA?: number, theB?: number, theC?: number, theD?: number): { theA: number; theB: number; theC: number; theD: number };

  SetAxis(theA1: gp_Ax1): void;

  SetLocation(theLoc: gp_Pnt): void;

  SetPosition(theA3: gp_Ax3): void;

  UReverse(): void;

  VReverse(): void;

  Direct(): boolean;

  Axis(): gp_Ax1;

  Location(): gp_Pnt;

  Position(): gp_Ax3;

  Distance(theP: gp_Pnt): number;
  Distance(theL: gp_Lin): number;
  Distance(theOther: gp_Pln): number;
  Distance(theP: gp_Pnt): number;
  Distance(theL: gp_Lin): number;
  Distance(theOther: gp_Pln): number;
  Distance(theP: gp_Pnt): number;
  Distance(theL: gp_Lin): number;
  Distance(theOther: gp_Pln): number;

  SignedDistance(theP: gp_Pnt): number;
  SignedDistance(theL: gp_Lin): number;
  SignedDistance(theOther: gp_Pln): number;
  SignedDistance(theP: gp_Pnt): number;
  SignedDistance(theL: gp_Lin): number;
  SignedDistance(theOther: gp_Pln): number;
  SignedDistance(theP: gp_Pnt): number;
  SignedDistance(theL: gp_Lin): number;
  SignedDistance(theOther: gp_Pln): number;

  SquareDistance(theP: gp_Pnt): number;
  SquareDistance(theL: gp_Lin): number;
  SquareDistance(theOther: gp_Pln): number;
  SquareDistance(theP: gp_Pnt): number;
  SquareDistance(theL: gp_Lin): number;
  SquareDistance(theOther: gp_Pln): number;
  SquareDistance(theP: gp_Pnt): number;
  SquareDistance(theL: gp_Lin): number;
  SquareDistance(theOther: gp_Pln): number;

  XAxis(): gp_Ax1;

  YAxis(): gp_Ax1;

  Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;
  Contains(theL: gp_Lin, theLinearTolerance: number, theAngularTolerance: number): boolean;
  Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;
  Contains(theL: gp_Lin, theLinearTolerance: number, theAngularTolerance: number): boolean;

  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  Mirrored(theP: gp_Pnt): gp_Pln;
  Mirrored(theA1: gp_Ax1): gp_Pln;
  Mirrored(theA2: gp_Ax2): gp_Pln;
  Mirrored(theP: gp_Pnt): gp_Pln;
  Mirrored(theA1: gp_Ax1): gp_Pln;
  Mirrored(theA2: gp_Ax2): gp_Pln;
  Mirrored(theP: gp_Pnt): gp_Pln;
  Mirrored(theA1: gp_Ax1): gp_Pln;
  Mirrored(theA2: gp_Ax2): gp_Pln;

  Rotate(theA1: gp_Ax1, theAng: number): void;

  Rotated(theA1: gp_Ax1, theAng: number): gp_Pln;

  Scale(theP: gp_Pnt, theS: number): void;

  Scaled(theP: gp_Pnt, theS: number): gp_Pln;

  Transform(theT: gp_Trsf): void;

  Transformed(theT: gp_Trsf): gp_Pln;

  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  Translated(theV: gp_Vec): gp_Pln;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pln;
  Translated(theV: gp_Vec): gp_Pln;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pln;

  delete(): void;

  [Symbol.dispose](): void;

gp_Pnt: declare class gp_Pnt

  constructor

  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXp: number, theYp: number, theZp: number): void;
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXp: number, theYp: number, theZp: number): void;

  SetX(theX: number): void;

  SetY(theY: number): void;

  SetZ(theZ: number): void;

  SetXYZ(theCoord: gp_XYZ): void;

  Coord(theIndex: number): number;
  Coord(theXp?: number, theYp?: number, theZp?: number): { theXp: number; theYp: number; theZp: number };
  Coord(): gp_XYZ;
  Coord(theIndex: number): number;
  Coord(theXp?: number, theYp?: number, theZp?: number): { theXp: number; theYp: number; theZp: number };
  Coord(): gp_XYZ;
  Coord(theIndex: number): number;
  Coord(theXp?: number, theYp?: number, theZp?: number): { theXp: number; theYp: number; theZp: number };
  Coord(): gp_XYZ;

  X(): number;

  Y(): number;

  Z(): number;

  XYZ(): gp_XYZ;

  ChangeCoord(): gp_XYZ;

  BaryCenter(theAlpha: number, theP: gp_Pnt, theBeta: number): void;

  IsEqual(theOther: gp_Pnt, theLinearTolerance: number): boolean;

  Distance(theOther: gp_Pnt): number;

  SquareDistance(theOther: gp_Pnt): number;

  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  Mirrored(theP: gp_Pnt): gp_Pnt;
  Mirrored(theA1: gp_Ax1): gp_Pnt;
  Mirrored(theA2: gp_Ax2): gp_Pnt;
  Mirrored(theP: gp_Pnt): gp_Pnt;
  Mirrored(theA1: gp_Ax1): gp_Pnt;
  Mirrored(theA2: gp_Ax2): gp_Pnt;
  Mirrored(theP: gp_Pnt): gp_Pnt;
  Mirrored(theA1: gp_Ax1): gp_Pnt;
  Mirrored(theA2: gp_Ax2): gp_Pnt;

  Rotate(theA1: gp_Ax1, theAng: number): void;

  Rotated(theA1: gp_Ax1, theAng: number): gp_Pnt;

  Scale(theP: gp_Pnt, theS: number): void;

  Scaled(theP: gp_Pnt, theS: number): gp_Pnt;

  Transform(theT: gp_Trsf): void;

  Transformed(theT: gp_Trsf): gp_Pnt;

  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  Translated(theV: gp_Vec): gp_Pnt;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pnt;
  Translated(theV: gp_Vec): gp_Pnt;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Pnt;

  delete(): void;

  [Symbol.dispose](): void;

gp_Pnt2d: declare class gp_Pnt2d

  constructor

  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXp: number, theYp: number): void;
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXp: number, theYp: number): void;

  SetX(theX: number): void;

  SetY(theY: number): void;

  SetXY(theCoord: gp_XY): void;

  Coord(theIndex: number): number;
  Coord(theXp?: number, theYp?: number): { theXp: number; theYp: number };
  Coord(): gp_XY;
  Coord(theIndex: number): number;
  Coord(theXp?: number, theYp?: number): { theXp: number; theYp: number };
  Coord(): gp_XY;
  Coord(theIndex: number): number;
  Coord(theXp?: number, theYp?: number): { theXp: number; theYp: number };
  Coord(): gp_XY;

  X(): number;

  Y(): number;

  XY(): gp_XY;

  ChangeCoord(): gp_XY;

  IsEqual(theOther: gp_Pnt2d, theLinearTolerance: number): boolean;

  Distance(theOther: gp_Pnt2d): number;

  SquareDistance(theOther: gp_Pnt2d): number;

  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;
  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;

  Mirrored(theP: gp_Pnt2d): gp_Pnt2d;
  Mirrored(theA: gp_Ax2d): gp_Pnt2d;
  Mirrored(theP: gp_Pnt2d): gp_Pnt2d;
  Mirrored(theA: gp_Ax2d): gp_Pnt2d;

  Rotate(theP: gp_Pnt2d, theAng: number): void;

  Rotated(theP: gp_Pnt2d, theAng: number): gp_Pnt2d;

  Scale(theP: gp_Pnt2d, theS: number): void;

  Scaled(theP: gp_Pnt2d, theS: number): gp_Pnt2d;

  Transform(theT: gp_Trsf2d): void;

  Transformed(theT: gp_Trsf2d): gp_Pnt2d;

  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  Translated(theV: gp_Vec2d): gp_Pnt2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Pnt2d;
  Translated(theV: gp_Vec2d): gp_Pnt2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Pnt2d;

  delete(): void;

  [Symbol.dispose](): void;

gp_Quaternion: declare class gp_Quaternion

  constructor

  IsEqual(theOther: gp_Quaternion): boolean;

  SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec): void;
  SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec, theHelpCrossVec: gp_Vec): void;
  SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec): void;
  SetRotation(theVecFrom: gp_Vec, theVecTo: gp_Vec, theHelpCrossVec: gp_Vec): void;

  SetVectorAndAngle(theAxis: gp_Vec, theAngle: number): void;

  GetVectorAndAngle(theAxis: gp_Vec, theAngle?: number): { theAngle: number };

  SetMatrix(theMat: gp_Mat): void;

  GetMatrix(): gp_Mat;

  SetEulerAngles(theOrder: gp_EulerSequence, theAlpha: number, theBeta: number, theGamma: number): void;

  GetEulerAngles(theOrder: gp_EulerSequence, theAlpha?: number, theBeta?: number, theGamma?: number): { theAlpha: number; theBeta: number; theGamma: number };

  Set(theX: number, theY: number, theZ: number, theW: number): void;
  Set(theQuaternion: gp_Quaternion): void;
  Set(theX: number, theY: number, theZ: number, theW: number): void;
  Set(theQuaternion: gp_Quaternion): void;

  X(): number;

  Y(): number;

  Z(): number;

  W(): number;

  SetIdent(): void;

  Reverse(): void;

  Reversed(): gp_Quaternion;

  Invert(): void;

  Inverted(): gp_Quaternion;

  SquareNorm(): number;

  Norm(): number;

  Scale(theScale: number): void;

  Scaled(theScale: number): gp_Quaternion;

  StabilizeLength(): void;

  Normalize(): void;

  Normalized(): gp_Quaternion;

  Negated(): gp_Quaternion;

  Added(theOther: gp_Quaternion): gp_Quaternion;

  Subtracted(theOther: gp_Quaternion): gp_Quaternion;

  Multiplied(theOther: gp_Quaternion): gp_Quaternion;

  Add(theOther: gp_Quaternion): void;

  Subtract(theOther: gp_Quaternion): void;

  Multiply(theOther: gp_Quaternion): void;
  Multiply(theVec: gp_Vec): gp_Vec;
  Multiply(theOther: gp_Quaternion): void;
  Multiply(theVec: gp_Vec): gp_Vec;

  Dot(theOther: gp_Quaternion): number;

  GetRotationAngle(): number;

  delete(): void;

  [Symbol.dispose](): void;

gp_QuaternionNLerp: declare class gp_QuaternionNLerp

  constructor

  static Interpolate(theQStart: gp_Quaternion, theQEnd: gp_Quaternion, theT: number): gp_Quaternion;
  Interpolate(theT: number, theResultQ: gp_Quaternion): void;

  Init(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

  InitFromUnit(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

  delete(): void;

  [Symbol.dispose](): void;

gp_QuaternionSLerp: declare class gp_QuaternionSLerp

  constructor

  static Interpolate(theQStart: gp_Quaternion, theQEnd: gp_Quaternion, theT: number): gp_Quaternion;
  Interpolate(theT: number, theResultQ: gp_Quaternion): void;

  Init(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

  InitFromUnit(theQStart: gp_Quaternion, theQEnd: gp_Quaternion): void;

  delete(): void;

  [Symbol.dispose](): void;

gp_Sphere: declare class gp_Sphere

  constructor

  SetLocation(theLoc: gp_Pnt): void;

  SetPosition(theA3: gp_Ax3): void;

  SetRadius(theR: number): void;

  Area(): number;

  Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

  UReverse(): void;

  VReverse(): void;

  Direct(): boolean;

  Location(): gp_Pnt;

  Position(): gp_Ax3;

  Radius(): number;

  Volume(): number;

  XAxis(): gp_Ax1;

  YAxis(): gp_Ax1;

  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  Mirrored(theP: gp_Pnt): gp_Sphere;
  Mirrored(theA1: gp_Ax1): gp_Sphere;
  Mirrored(theA2: gp_Ax2): gp_Sphere;
  Mirrored(theP: gp_Pnt): gp_Sphere;
  Mirrored(theA1: gp_Ax1): gp_Sphere;
  Mirrored(theA2: gp_Ax2): gp_Sphere;
  Mirrored(theP: gp_Pnt): gp_Sphere;
  Mirrored(theA1: gp_Ax1): gp_Sphere;
  Mirrored(theA2: gp_Ax2): gp_Sphere;

  Rotate(theA1: gp_Ax1, theAng: number): void;

  Rotated(theA1: gp_Ax1, theAng: number): gp_Sphere;

  Scale(theP: gp_Pnt, theS: number): void;

  Scaled(theP: gp_Pnt, theS: number): gp_Sphere;

  Transform(theT: gp_Trsf): void;

  Transformed(theT: gp_Trsf): gp_Sphere;

  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  Translated(theV: gp_Vec): gp_Sphere;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Sphere;
  Translated(theV: gp_Vec): gp_Sphere;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Sphere;

  delete(): void;

  [Symbol.dispose](): void;

gp_Torus: declare class gp_Torus

  constructor

  SetAxis(theA1: gp_Ax1): void;

  SetLocation(theLoc: gp_Pnt): void;

  SetMajorRadius(theMajorRadius: number): void;

  SetMinorRadius(theMinorRadius: number): void;

  SetPosition(theA3: gp_Ax3): void;

  Area(): number;

  UReverse(): void;

  VReverse(): void;

  Direct(): boolean;

  Axis(): gp_Ax1;

  Coefficients(theCoef: NCollection_Array1_double): void;

  Location(): gp_Pnt;

  Position(): gp_Ax3;

  MajorRadius(): number;

  MinorRadius(): number;

  Volume(): number;

  XAxis(): gp_Ax1;

  YAxis(): gp_Ax1;

  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  Mirrored(theP: gp_Pnt): gp_Torus;
  Mirrored(theA1: gp_Ax1): gp_Torus;
  Mirrored(theA2: gp_Ax2): gp_Torus;
  Mirrored(theP: gp_Pnt): gp_Torus;
  Mirrored(theA1: gp_Ax1): gp_Torus;
  Mirrored(theA2: gp_Ax2): gp_Torus;
  Mirrored(theP: gp_Pnt): gp_Torus;
  Mirrored(theA1: gp_Ax1): gp_Torus;
  Mirrored(theA2: gp_Ax2): gp_Torus;

  Rotate(theA1: gp_Ax1, theAng: number): void;

  Rotated(theA1: gp_Ax1, theAng: number): gp_Torus;

  Scale(theP: gp_Pnt, theS: number): void;

  Scaled(theP: gp_Pnt, theS: number): gp_Torus;

  Transform(theT: gp_Trsf): void;

  Transformed(theT: gp_Trsf): gp_Torus;

  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  Translated(theV: gp_Vec): gp_Torus;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Torus;
  Translated(theV: gp_Vec): gp_Torus;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Torus;

  delete(): void;

  [Symbol.dispose](): void;

gp_Trsf: declare class gp_Trsf

  constructor

  SetMirror(theP: gp_Pnt): void;
  SetMirror(theA1: gp_Ax1): void;
  SetMirror(theA2: gp_Ax2): void;
  SetMirror(theP: gp_Pnt): void;
  SetMirror(theA1: gp_Ax1): void;
  SetMirror(theA2: gp_Ax2): void;
  SetMirror(theP: gp_Pnt): void;
  SetMirror(theA1: gp_Ax1): void;
  SetMirror(theA2: gp_Ax2): void;

  SetRotation(theA1: gp_Ax1, theAng: number): void;
  SetRotation(theR: gp_Quaternion): void;
  SetRotation(theA1: gp_Ax1, theAng: number): void;
  SetRotation(theR: gp_Quaternion): void;

  SetRotationPart(theR: gp_Quaternion): void;

  SetScale(theP: gp_Pnt, theS: number): void;

  SetDisplacement(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;

  SetTransformation(theToSystem: gp_Ax3): void;
  SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
  SetTransformation(R: gp_Quaternion, theT: gp_Vec): void;
  SetTransformation(theToSystem: gp_Ax3): void;
  SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
  SetTransformation(R: gp_Quaternion, theT: gp_Vec): void;
  SetTransformation(theToSystem: gp_Ax3): void;
  SetTransformation(theFromSystem1: gp_Ax3, theToSystem2: gp_Ax3): void;
  SetTransformation(R: gp_Quaternion, theT: gp_Vec): void;

  SetTranslation(theV: gp_Vec): void;
  SetTranslation(theP1: gp_Pnt, theP2: gp_Pnt): void;
  SetTranslation(theV: gp_Vec): void;
  SetTranslation(theP1: gp_Pnt, theP2: gp_Pnt): void;

  SetTranslationPart(theV: gp_Vec): void;

  SetScaleFactor(theS: number): void;

  SetForm(theP: gp_TrsfForm): void;

  SetValues(a11: number, a12: number, a13: number, a14: number, a21: number, a22: number, a23: number, a24: number, a31: number, a32: number, a33: number, a34: number): void;

  IsNegative(): boolean;

  Form(): gp_TrsfForm;

  ScaleFactor(): number;

  TranslationPart(): gp_XYZ;

  GetRotation(theAxis: gp_XYZ, theAngle?: number): { returnValue: boolean; theAngle: number };
  GetRotation(): gp_Quaternion;
  GetRotation(theAxis: gp_XYZ, theAngle?: number): { returnValue: boolean; theAngle: number };
  GetRotation(): gp_Quaternion;

  VectorialPart(): gp_Mat;

  HVectorialPart(): gp_Mat;

  Value(theRow: number, theCol: number): number;

  Invert(): void;

  Inverted(): gp_Trsf;

  Multiplied(theT: gp_Trsf): gp_Trsf;

  Multiply(theT: gp_Trsf): void;

  PreMultiply(theT: gp_Trsf): void;

  Power(theN: number): void;

  Powered(theN: number): gp_Trsf;

  Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
  Transforms(theCoord: gp_XYZ): void;
  Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
  Transforms(theCoord: gp_XYZ): void;

  delete(): void;

  [Symbol.dispose](): void;

gp_Trsf2d: declare class gp_Trsf2d

  constructor

  SetMirror(theP: gp_Pnt2d): void;
  SetMirror(theA: gp_Ax2d): void;
  SetMirror(theP: gp_Pnt2d): void;
  SetMirror(theA: gp_Ax2d): void;

  SetRotation(theP: gp_Pnt2d, theAng: number): void;

  SetScale(theP: gp_Pnt2d, theS: number): void;

  SetTransformation(theFromSystem1: gp_Ax2d, theToSystem2: gp_Ax2d): void;
  SetTransformation(theToSystem: gp_Ax2d): void;
  SetTransformation(theFromSystem1: gp_Ax2d, theToSystem2: gp_Ax2d): void;
  SetTransformation(theToSystem: gp_Ax2d): void;

  SetTranslation(theV: gp_Vec2d): void;
  SetTranslation(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;
  SetTranslation(theV: gp_Vec2d): void;
  SetTranslation(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  SetTranslationPart(theV: gp_Vec2d): void;

  SetScaleFactor(theS: number): void;

  IsNegative(): boolean;

  Form(): gp_TrsfForm;

  ScaleFactor(): number;

  TranslationPart(): gp_XY;

  VectorialPart(): gp_Mat2d;

  HVectorialPart(): gp_Mat2d;

  RotationPart(): number;

  Value(theRow: number, theCol: number): number;

  Invert(): void;

  Inverted(): gp_Trsf2d;

  Multiplied(theT: gp_Trsf2d): gp_Trsf2d;

  Multiply(theT: gp_Trsf2d): void;

  PreMultiply(theT: gp_Trsf2d): void;

  Power(theN: number): void;

  Powered(theN: number): gp_Trsf2d;

  Transforms(theX?: number, theY?: number): { theX: number; theY: number };
  Transforms(theCoord: gp_XY): void;
  Transforms(theX?: number, theY?: number): { theX: number; theY: number };
  Transforms(theCoord: gp_XY): void;

  SetValues(a11: number, a12: number, a13: number, a21: number, a22: number, a23: number): void;

  delete(): void;

  [Symbol.dispose](): void;

gp_TrsfForm: typeof gp_TrsfForm[keyof typeof gp_TrsfForm]
