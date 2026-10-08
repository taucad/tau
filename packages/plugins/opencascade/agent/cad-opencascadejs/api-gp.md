# libcascade — gp

16 top-level symbols. Signatures are verbatim typescript.

gp: declare class gp

  // gp.Resolution (method)
  static Resolution(): number;

  // gp.Origin (method)
  static Origin(): gp_Pnt;

  // gp.DX (method)
  static DX(): gp_Dir;

  // gp.DY (method)
  static DY(): gp_Dir;

  // gp.DZ (method)
  static DZ(): gp_Dir;

  // gp.OX (method)
  static OX(): gp_Ax1;

  // gp.OY (method)
  static OY(): gp_Ax1;

  // gp.OZ (method)
  static OZ(): gp_Ax1;

  // gp.XOY (method)
  static XOY(): gp_Ax2;

  // gp.ZOX (method)
  static ZOX(): gp_Ax2;

  // gp.YOZ (method)
  static YOZ(): gp_Ax2;

  // gp.Origin2d (method)
  static Origin2d(): gp_Pnt2d;

  // gp.DX2d (method)
  static DX2d(): gp_Dir2d;

  // gp.DY2d (method)
  static DY2d(): gp_Dir2d;

  // gp.OX2d (method)
  static OX2d(): gp_Ax2d;

  // gp.OY2d (method)
  static OY2d(): gp_Ax2d;

  // gp.delete (method)
  delete(): void;

  // gp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Ax1: declare class gp_Ax1

  // gp_Ax1.constructor (constructor)
  constructor();
  constructor(theDir: gp_Dir_D);
  constructor(theP: gp_Pnt, theV: gp_Dir);
  constructor(theP: gp_Pnt, theDir: gp_Dir_D);

  // gp_Ax1.SetDirection (method)
  SetDirection(theV: gp_Dir): void;

  // gp_Ax1.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // gp_Ax1.Direction (method)
  Direction(): gp_Dir;

  // gp_Ax1.Location (method)
  Location(): gp_Pnt;

  // gp_Ax1.IsCoaxial (method)
  IsCoaxial(Other: gp_Ax1, AngularTolerance: number, LinearTolerance: number): boolean;

  // gp_Ax1.IsNormal (method)
  IsNormal(theOther: gp_Ax1, theAngularTolerance: number): boolean;

  // gp_Ax1.IsOpposite (method)
  IsOpposite(theOther: gp_Ax1, theAngularTolerance: number): boolean;

  // gp_Ax1.IsParallel (method)
  IsParallel(theOther: gp_Ax1, theAngularTolerance: number): boolean;

  // gp_Ax1.Angle (method)
  Angle(theOther: gp_Ax1): number;

  // gp_Ax1.Reverse (method)
  Reverse(): void;

  // gp_Ax1.Reversed (method)
  Reversed(): gp_Ax1;

  // gp_Ax1.Mirror (method)
  Mirror(P: gp_Pnt): void;
  Mirror(A1: gp_Ax1): void;
  Mirror(A2: gp_Ax2): void;

  // gp_Ax1.Mirrored (method)
  Mirrored(P: gp_Pnt): gp_Ax1;
  Mirrored(A1: gp_Ax1): gp_Ax1;
  Mirrored(A2: gp_Ax2): gp_Ax1;

  // gp_Ax1.Rotate (method)
  Rotate(theA1: gp_Ax1, theAngRad: number): void;

  // gp_Ax1.Rotated (method)
  Rotated(theA1: gp_Ax1, theAngRad: number): gp_Ax1;

  // gp_Ax1.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Ax1.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Ax1;

  // gp_Ax1.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Ax1.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Ax1;

  // gp_Ax1.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Ax1.Translated (method)
  Translated(theV: gp_Vec): gp_Ax1;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax1;

  // gp_Ax1.delete (method)
  delete(): void;

  // gp_Ax1.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Ax2: declare class gp_Ax2

  // gp_Ax2.constructor (constructor)
  constructor();
  constructor(theV: gp_Dir_D);
  constructor(P: gp_Pnt, V: gp_Dir);
  constructor(theP: gp_Pnt, theV: gp_Dir_D);
  constructor(P: gp_Pnt, N: gp_Dir, Vx: gp_Dir);
  constructor(theP: gp_Pnt, theN: gp_Dir_D, theVx: gp_Dir_D);

  // gp_Ax2.SetAxis (method)
  SetAxis(A1: gp_Ax1): void;

  // gp_Ax2.SetDirection (method)
  SetDirection(V: gp_Dir): void;

  // gp_Ax2.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // gp_Ax2.SetXDirection (method)
  SetXDirection(theVx: gp_Dir): void;

  // gp_Ax2.SetYDirection (method)
  SetYDirection(theVy: gp_Dir): void;

  // gp_Ax2.Angle (method)
  Angle(theOther: gp_Ax2): number;

  // gp_Ax2.Axis (method)
  Axis(): gp_Ax1;

  // gp_Ax2.Direction (method)
  Direction(): gp_Dir;

  // gp_Ax2.Location (method)
  Location(): gp_Pnt;

  // gp_Ax2.XDirection (method)
  XDirection(): gp_Dir;

  // gp_Ax2.YDirection (method)
  YDirection(): gp_Dir;

  // gp_Ax2.IsCoplanar (method)
  IsCoplanar(Other: gp_Ax2, LinearTolerance: number, AngularTolerance: number): boolean;
  IsCoplanar(A1: gp_Ax1, LinearTolerance: number, AngularTolerance: number): boolean;

  // gp_Ax2.Mirror (method)
  Mirror(P: gp_Pnt): void;
  Mirror(A1: gp_Ax1): void;
  Mirror(A2: gp_Ax2): void;

  // gp_Ax2.Mirrored (method)
  Mirrored(P: gp_Pnt): gp_Ax2;
  Mirrored(A1: gp_Ax1): gp_Ax2;
  Mirrored(A2: gp_Ax2): gp_Ax2;

  // gp_Ax2.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Ax2.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Ax2;

  // gp_Ax2.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Ax2.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Ax2;

  // gp_Ax2.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Ax2.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Ax2;

  // gp_Ax2.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Ax2.Translated (method)
  Translated(theV: gp_Vec): gp_Ax2;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax2;

  // gp_Ax2.delete (method)
  delete(): void;

  // gp_Ax2.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Ax22d: declare class gp_Ax22d

  // gp_Ax22d.constructor (constructor)
  constructor();
  constructor(theA: gp_Ax2d, theIsSense?: boolean);
  constructor(theP: gp_Pnt2d, theVx: gp_Dir2d, theVy: gp_Dir2d);
  constructor(theP: gp_Pnt2d, theV: gp_Dir2d, theIsSense?: boolean);

  // gp_Ax22d.SetAxis (method)
  SetAxis(theA1: gp_Ax22d): void;

  // gp_Ax22d.SetXAxis (method)
  SetXAxis(theA1: gp_Ax2d): void;

  // gp_Ax22d.SetYAxis (method)
  SetYAxis(theA1: gp_Ax2d): void;

  // gp_Ax22d.SetLocation (method)
  SetLocation(theP: gp_Pnt2d): void;

  // gp_Ax22d.SetXDirection (method)
  SetXDirection(theVx: gp_Dir2d): void;

  // gp_Ax22d.SetYDirection (method)
  SetYDirection(theVy: gp_Dir2d): void;

  // gp_Ax22d.XAxis (method)
  XAxis(): gp_Ax2d;

  // gp_Ax22d.YAxis (method)
  YAxis(): gp_Ax2d;

  // gp_Ax22d.Location (method)
  Location(): gp_Pnt2d;

  // gp_Ax22d.XDirection (method)
  XDirection(): gp_Dir2d;

  // gp_Ax22d.YDirection (method)
  YDirection(): gp_Dir2d;

  // gp_Ax22d.Mirror (method)
  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;

  // gp_Ax22d.Mirrored (method)
  Mirrored(theP: gp_Pnt2d): gp_Ax22d;
  Mirrored(theA: gp_Ax2d): gp_Ax22d;

  // gp_Ax22d.Rotate (method)
  Rotate(theP: gp_Pnt2d, theAng: number): void;

  // gp_Ax22d.Rotated (method)
  Rotated(theP: gp_Pnt2d, theAng: number): gp_Ax22d;

  // gp_Ax22d.Scale (method)
  Scale(theP: gp_Pnt2d, theS: number): void;

  // gp_Ax22d.Scaled (method)
  Scaled(theP: gp_Pnt2d, theS: number): gp_Ax22d;

  // gp_Ax22d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Ax22d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Ax22d;

  // gp_Ax22d.Translate (method)
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Ax22d.Translated (method)
  Translated(theV: gp_Vec2d): gp_Ax22d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax22d;

  // gp_Ax22d.delete (method)
  delete(): void;

  // gp_Ax22d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Ax2d: declare class gp_Ax2d

  // gp_Ax2d.constructor (constructor)
  constructor();
  constructor(theDir: gp_Dir2d_D);
  constructor(theP: gp_Pnt2d, theV: gp_Dir2d);
  constructor(theP: gp_Pnt2d, theDir: gp_Dir2d_D);

  // gp_Ax2d.SetLocation (method)
  SetLocation(theP: gp_Pnt2d): void;

  // gp_Ax2d.SetDirection (method)
  SetDirection(theV: gp_Dir2d): void;

  // gp_Ax2d.Location (method)
  Location(): gp_Pnt2d;

  // gp_Ax2d.Direction (method)
  Direction(): gp_Dir2d;

  // gp_Ax2d.IsCoaxial (method)
  IsCoaxial(Other: gp_Ax2d, AngularTolerance: number, LinearTolerance: number): boolean;

  // gp_Ax2d.IsNormal (method)
  IsNormal(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

  // gp_Ax2d.IsOpposite (method)
  IsOpposite(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

  // gp_Ax2d.IsParallel (method)
  IsParallel(theOther: gp_Ax2d, theAngularTolerance: number): boolean;

  // gp_Ax2d.Angle (method)
  Angle(theOther: gp_Ax2d): number;

  // gp_Ax2d.Reverse (method)
  Reverse(): void;

  // gp_Ax2d.Reversed (method)
  Reversed(): gp_Ax2d;

  // gp_Ax2d.Mirror (method)
  Mirror(P: gp_Pnt2d): void;
  Mirror(A: gp_Ax2d): void;

  // gp_Ax2d.Mirrored (method)
  Mirrored(P: gp_Pnt2d): gp_Ax2d;
  Mirrored(A: gp_Ax2d): gp_Ax2d;

  // gp_Ax2d.Rotate (method)
  Rotate(theP: gp_Pnt2d, theAng: number): void;

  // gp_Ax2d.Rotated (method)
  Rotated(theP: gp_Pnt2d, theAng: number): gp_Ax2d;

  // gp_Ax2d.Scale (method)
  Scale(P: gp_Pnt2d, S: number): void;

  // gp_Ax2d.Scaled (method)
  Scaled(theP: gp_Pnt2d, theS: number): gp_Ax2d;

  // gp_Ax2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Ax2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Ax2d;

  // gp_Ax2d.Translate (method)
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Ax2d.Translated (method)
  Translated(theV: gp_Vec2d): gp_Ax2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Ax2d;

  // gp_Ax2d.delete (method)
  delete(): void;

  // gp_Ax2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Ax3: declare class gp_Ax3

  // gp_Ax3.constructor (constructor)
  constructor();
  constructor(theA: gp_Ax2);
  constructor(theV: gp_Dir_D);
  constructor(theP: gp_Pnt, theV: gp_Dir);
  constructor(theP: gp_Pnt, theV: gp_Dir_D);
  constructor(theP: gp_Pnt, theN: gp_Dir, theVx: gp_Dir);
  constructor(theP: gp_Pnt, theN: gp_Dir_D, theVx: gp_Dir_D);

  // gp_Ax3.XReverse (method)
  XReverse(): void;

  // gp_Ax3.YReverse (method)
  YReverse(): void;

  // gp_Ax3.ZReverse (method)
  ZReverse(): void;

  // gp_Ax3.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Ax3.SetDirection (method)
  SetDirection(theV: gp_Dir): void;

  // gp_Ax3.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // gp_Ax3.SetXDirection (method)
  SetXDirection(theVx: gp_Dir): void;

  // gp_Ax3.SetYDirection (method)
  SetYDirection(theVy: gp_Dir): void;

  // gp_Ax3.Angle (method)
  Angle(theOther: gp_Ax3): number;

  // gp_Ax3.Axis (method)
  Axis(): gp_Ax1;

  // gp_Ax3.Ax2 (method)
  Ax2(): gp_Ax2;

  // gp_Ax3.Direction (method)
  Direction(): gp_Dir;

  // gp_Ax3.Location (method)
  Location(): gp_Pnt;

  // gp_Ax3.XDirection (method)
  XDirection(): gp_Dir;

  // gp_Ax3.YDirection (method)
  YDirection(): gp_Dir;

  // gp_Ax3.Direct (method)
  Direct(): boolean;

  // gp_Ax3.IsCoplanar (method)
  IsCoplanar(theOther: gp_Ax3, theLinearTolerance: number, theAngularTolerance: number): boolean;
  IsCoplanar(theA1: gp_Ax1, theLinearTolerance: number, theAngularTolerance: number): boolean;

  // gp_Ax3.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Ax3.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Ax3;
  Mirrored(theA1: gp_Ax1): gp_Ax3;
  Mirrored(theA2: gp_Ax2): gp_Ax3;

  // gp_Ax3.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Ax3.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Ax3;

  // gp_Ax3.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Ax3.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Ax3;

  // gp_Ax3.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Ax3.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Ax3;

  // gp_Ax3.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Ax3.Translated (method)
  Translated(theV: gp_Vec): gp_Ax3;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Ax3;

  // gp_Ax3.delete (method)
  delete(): void;

  // gp_Ax3.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Circ: declare class gp_Circ

  // gp_Circ.constructor (constructor)
  constructor();
  constructor(theA2: gp_Ax2, theRadius: number);

  // gp_Circ.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Circ.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // gp_Circ.SetPosition (method)
  SetPosition(theA2: gp_Ax2): void;

  // gp_Circ.SetRadius (method)
  SetRadius(theRadius: number): void;

  // gp_Circ.Area (method)
  Area(): number;

  // gp_Circ.Axis (method)
  Axis(): gp_Ax1;

  // gp_Circ.Length (method)
  Length(): number;

  // gp_Circ.Location (method)
  Location(): gp_Pnt;

  // gp_Circ.Position (method)
  Position(): gp_Ax2;

  // gp_Circ.Radius (method)
  Radius(): number;

  // gp_Circ.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Circ.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Circ.Distance (method)
  Distance(theP: gp_Pnt): number;

  // gp_Circ.SquareDistance (method)
  SquareDistance(theP: gp_Pnt): number;

  // gp_Circ.Contains (method)
  Contains(theP: gp_Pnt, theLinearTolerance: number): boolean;

  // gp_Circ.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Circ.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Circ;
  Mirrored(theA1: gp_Ax1): gp_Circ;
  Mirrored(theA2: gp_Ax2): gp_Circ;

  // gp_Circ.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Circ.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Circ;

  // gp_Circ.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Circ.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Circ;

  // gp_Circ.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Circ.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Circ;

  // gp_Circ.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Circ.Translated (method)
  Translated(theV: gp_Vec): gp_Circ;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Circ;

  // gp_Circ.delete (method)
  delete(): void;

  // gp_Circ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Circ2d: declare class gp_Circ2d

  // gp_Circ2d.constructor (constructor)
  constructor();
  constructor(theAxis: gp_Ax22d, theRadius: number);
  constructor(theXAxis: gp_Ax2d, theRadius: number, theIsSense?: boolean);

  // gp_Circ2d.SetLocation (method)
  SetLocation(theP: gp_Pnt2d): void;

  // gp_Circ2d.SetXAxis (method)
  SetXAxis(theA: gp_Ax2d): void;

  // gp_Circ2d.SetAxis (method)
  SetAxis(theA: gp_Ax22d): void;

  // gp_Circ2d.SetYAxis (method)
  SetYAxis(theA: gp_Ax2d): void;

  // gp_Circ2d.SetRadius (method)
  SetRadius(theRadius: number): void;

  // gp_Circ2d.Area (method)
  Area(): number;

  // gp_Circ2d.Coefficients (method)
  Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

  // gp_Circ2d.Contains (method)
  Contains(theP: gp_Pnt2d, theLinearTolerance: number): boolean;

  // gp_Circ2d.Distance (method)
  Distance(theP: gp_Pnt2d): number;

  // gp_Circ2d.SquareDistance (method)
  SquareDistance(theP: gp_Pnt2d): number;

  // gp_Circ2d.Length (method)
  Length(): number;

  // gp_Circ2d.Location (method)
  Location(): gp_Pnt2d;

  // gp_Circ2d.Radius (method)
  Radius(): number;

  // gp_Circ2d.Axis (method)
  Axis(): gp_Ax22d;

  // gp_Circ2d.Position (method)
  Position(): gp_Ax22d;

  // gp_Circ2d.XAxis (method)
  XAxis(): gp_Ax2d;

  // gp_Circ2d.YAxis (method)
  YAxis(): gp_Ax2d;

  // gp_Circ2d.Reverse (method)
  Reverse(): void;

  // gp_Circ2d.Reversed (method)
  Reversed(): gp_Circ2d;

  // gp_Circ2d.IsDirect (method)
  IsDirect(): boolean;

  // gp_Circ2d.Mirror (method)
  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;

  // gp_Circ2d.Mirrored (method)
  Mirrored(theP: gp_Pnt2d): gp_Circ2d;
  Mirrored(theA: gp_Ax2d): gp_Circ2d;

  // gp_Circ2d.Rotate (method)
  Rotate(theP: gp_Pnt2d, theAng: number): void;

  // gp_Circ2d.Rotated (method)
  Rotated(theP: gp_Pnt2d, theAng: number): gp_Circ2d;

  // gp_Circ2d.Scale (method)
  Scale(theP: gp_Pnt2d, theS: number): void;

  // gp_Circ2d.Scaled (method)
  Scaled(theP: gp_Pnt2d, theS: number): gp_Circ2d;

  // gp_Circ2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Circ2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Circ2d;

  // gp_Circ2d.Translate (method)
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Circ2d.Translated (method)
  Translated(theV: gp_Vec2d): gp_Circ2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Circ2d;

  // gp_Circ2d.delete (method)
  delete(): void;

  // gp_Circ2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Cone: declare class gp_Cone

  // gp_Cone.constructor (constructor)
  constructor();
  constructor(theA3: gp_Ax3, theAng: number, theRadius: number);

  // gp_Cone.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Cone.SetLocation (method)
  SetLocation(theLoc: gp_Pnt): void;

  // gp_Cone.SetPosition (method)
  SetPosition(theA3: gp_Ax3): void;

  // gp_Cone.SetRadius (method)
  SetRadius(theR: number): void;

  // gp_Cone.SetSemiAngle (method)
  SetSemiAngle(theAng: number): void;

  // gp_Cone.Apex (method)
  Apex(): gp_Pnt;

  // gp_Cone.UReverse (method)
  UReverse(): void;

  // gp_Cone.VReverse (method)
  VReverse(): void;

  // gp_Cone.Direct (method)
  Direct(): boolean;

  // gp_Cone.Axis (method)
  Axis(): gp_Ax1;

  // gp_Cone.Coefficients (method)
  Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

  // gp_Cone.Location (method)
  Location(): gp_Pnt;

  // gp_Cone.Position (method)
  Position(): gp_Ax3;

  // gp_Cone.RefRadius (method)
  RefRadius(): number;

  // gp_Cone.SemiAngle (method)
  SemiAngle(): number;

  // gp_Cone.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Cone.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Cone.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Cone.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Cone;
  Mirrored(theA1: gp_Ax1): gp_Cone;
  Mirrored(theA2: gp_Ax2): gp_Cone;

  // gp_Cone.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Cone.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Cone;

  // gp_Cone.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Cone.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Cone;

  // gp_Cone.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Cone.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Cone;

  // gp_Cone.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Cone.Translated (method)
  Translated(theV: gp_Vec): gp_Cone;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cone;

  // gp_Cone.delete (method)
  delete(): void;

  // gp_Cone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Cylinder: declare class gp_Cylinder

  // gp_Cylinder.constructor (constructor)
  constructor();
  constructor(theA3: gp_Ax3, theRadius: number);

  // gp_Cylinder.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Cylinder.SetLocation (method)
  SetLocation(theLoc: gp_Pnt): void;

  // gp_Cylinder.SetPosition (method)
  SetPosition(theA3: gp_Ax3): void;

  // gp_Cylinder.SetRadius (method)
  SetRadius(theR: number): void;

  // gp_Cylinder.UReverse (method)
  UReverse(): void;

  // gp_Cylinder.VReverse (method)
  VReverse(): void;

  // gp_Cylinder.Direct (method)
  Direct(): boolean;

  // gp_Cylinder.Axis (method)
  Axis(): gp_Ax1;

  // gp_Cylinder.Coefficients (method)
  Coefficients(theA1?: number, theA2?: number, theA3?: number, theB1?: number, theB2?: number, theB3?: number, theC1?: number, theC2?: number, theC3?: number, theD?: number): { theA1: number; theA2: number; theA3: number; theB1: number; theB2: number; theB3: number; theC1: number; theC2: number; theC3: number; theD: number };

  // gp_Cylinder.Location (method)
  Location(): gp_Pnt;

  // gp_Cylinder.Position (method)
  Position(): gp_Ax3;

  // gp_Cylinder.Radius (method)
  Radius(): number;

  // gp_Cylinder.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Cylinder.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Cylinder.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Cylinder.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Cylinder;
  Mirrored(theA1: gp_Ax1): gp_Cylinder;
  Mirrored(theA2: gp_Ax2): gp_Cylinder;

  // gp_Cylinder.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Cylinder.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Cylinder;

  // gp_Cylinder.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Cylinder.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Cylinder;

  // gp_Cylinder.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Cylinder.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Cylinder;

  // gp_Cylinder.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Cylinder.Translated (method)
  Translated(theV: gp_Vec): gp_Cylinder;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Cylinder;

  // gp_Cylinder.delete (method)
  delete(): void;

  // gp_Cylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Dir: declare class gp_Dir

  // gp_Dir.constructor (constructor)
  constructor();
  constructor(theDir: gp_Dir_D);
  constructor(theV: gp_Vec);
  constructor(theCoord: gp_XYZ);
  constructor(a0: gp_Dir);
  constructor(theXv: number, theYv: number, theZv: number);

  // gp_Dir.SetCoord (method)
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXv: number, theYv: number, theZv: number): void;

  // gp_Dir.SetX (method)
  SetX(theX: number): void;

  // gp_Dir.SetY (method)
  SetY(theY: number): void;

  // gp_Dir.SetZ (method)
  SetZ(theZ: number): void;

  // gp_Dir.SetXYZ (method)
  SetXYZ(theCoord: gp_XYZ): void;

  // gp_Dir.Coord (method)
  Coord(theIndex: number): number;
  Coord(theXv?: number, theYv?: number, theZv?: number): { theXv: number; theYv: number; theZv: number };

  // gp_Dir.X (method)
  X(): number;

  // gp_Dir.Y (method)
  Y(): number;

  // gp_Dir.Z (method)
  Z(): number;

  // gp_Dir.XYZ (method)
  XYZ(): gp_XYZ;

  // gp_Dir.IsEqual (method)
  IsEqual(theOther: gp_Dir, theAngularTolerance: number): boolean;

  // gp_Dir.IsNormal (method)
  IsNormal(theOther: gp_Dir, theAngularTolerance: number): boolean;

  // gp_Dir.IsOpposite (method)
  IsOpposite(theOther: gp_Dir, theAngularTolerance: number): boolean;

  // gp_Dir.IsParallel (method)
  IsParallel(theOther: gp_Dir, theAngularTolerance: number): boolean;

  // gp_Dir.Angle (method)
  Angle(theOther: gp_Dir): number;

  // gp_Dir.AngleWithRef (method)
  AngleWithRef(theOther: gp_Dir, theVRef: gp_Dir): number;

  // gp_Dir.Cross (method)
  Cross(theRight: gp_Dir): void;

  // gp_Dir.Crossed (method)
  Crossed(theRight: gp_Dir): gp_Dir;

  // gp_Dir.CrossCross (method)
  CrossCross(theV1: gp_Dir, theV2: gp_Dir): void;

  // gp_Dir.CrossCrossed (method)
  CrossCrossed(theV1: gp_Dir, theV2: gp_Dir): gp_Dir;

  // gp_Dir.Dot (method)
  Dot(theOther: gp_Dir): number;

  // gp_Dir.DotCross (method)
  DotCross(theV1: gp_Dir, theV2: gp_Dir): number;

  // gp_Dir.Reverse (method)
  Reverse(): void;

  // gp_Dir.Reversed (method)
  Reversed(): gp_Dir;

  // gp_Dir.Mirror (method)
  Mirror(theV: gp_Dir): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Dir.Mirrored (method)
  Mirrored(theV: gp_Dir): gp_Dir;
  Mirrored(theA1: gp_Ax1): gp_Dir;
  Mirrored(theA2: gp_Ax2): gp_Dir;

  // gp_Dir.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Dir.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Dir;

  // gp_Dir.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Dir.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Dir;

  // gp_Dir.delete (method)
  delete(): void;

  // gp_Dir.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Dir_D: typeof gp_Dir_D[keyof typeof gp_Dir_D]

  readonly X: 'X'

  readonly Y: 'Y'

  readonly Z: 'Z'

  readonly NX: 'NX'

  readonly NY: 'NY'

  readonly NZ: 'NZ'

gp_Dir2d: declare class gp_Dir2d

  // gp_Dir2d.constructor (constructor)
  constructor();
  constructor(theDir: gp_Dir2d_D);
  constructor(theV: gp_Vec2d);
  constructor(theCoord: gp_XY);
  constructor(theXv: number, theYv: number);

  // gp_Dir2d.SetCoord (method)
  SetCoord(theIndex: number, theXi: number): void;
  SetCoord(theXv: number, theYv: number): void;

  // gp_Dir2d.SetX (method)
  SetX(theX: number): void;

  // gp_Dir2d.SetY (method)
  SetY(theY: number): void;

  // gp_Dir2d.SetXY (method)
  SetXY(theCoord: gp_XY): void;

  // gp_Dir2d.Coord (method)
  Coord(theIndex: number): number;
  Coord(theXv?: number, theYv?: number): { theXv: number; theYv: number };

  // gp_Dir2d.X (method)
  X(): number;

  // gp_Dir2d.Y (method)
  Y(): number;

  // gp_Dir2d.XY (method)
  XY(): gp_XY;

  // gp_Dir2d.IsEqual (method)
  IsEqual(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

  // gp_Dir2d.IsNormal (method)
  IsNormal(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

  // gp_Dir2d.IsOpposite (method)
  IsOpposite(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

  // gp_Dir2d.IsParallel (method)
  IsParallel(theOther: gp_Dir2d, theAngularTolerance: number): boolean;

  // gp_Dir2d.Angle (method)
  Angle(theOther: gp_Dir2d): number;

  // gp_Dir2d.Crossed (method)
  Crossed(theRight: gp_Dir2d): number;

  // gp_Dir2d.Dot (method)
  Dot(theOther: gp_Dir2d): number;

  // gp_Dir2d.Reverse (method)
  Reverse(): void;

  // gp_Dir2d.Reversed (method)
  Reversed(): gp_Dir2d;

  // gp_Dir2d.Mirror (method)
  Mirror(theV: gp_Dir2d): void;
  Mirror(theA: gp_Ax2d): void;

  // gp_Dir2d.Mirrored (method)
  Mirrored(theV: gp_Dir2d): gp_Dir2d;
  Mirrored(theA: gp_Ax2d): gp_Dir2d;

  // gp_Dir2d.Rotate (method)
  Rotate(Ang: number): void;

  // gp_Dir2d.Rotated (method)
  Rotated(theAng: number): gp_Dir2d;

  // gp_Dir2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Dir2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Dir2d;

  // gp_Dir2d.delete (method)
  delete(): void;

  // gp_Dir2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Dir2d_D: typeof gp_Dir2d_D[keyof typeof gp_Dir2d_D]

  readonly X: 'X'

  readonly Y: 'Y'

  readonly NX: 'NX'

  readonly NY: 'NY'

gp_Elips: declare class gp_Elips

  // gp_Elips.constructor (constructor)
  constructor();
  constructor(theA2: gp_Ax2, theMajorRadius: number, theMinorRadius: number);

  // gp_Elips.SetAxis (method)
  SetAxis(theA1: gp_Ax1): void;

  // gp_Elips.SetLocation (method)
  SetLocation(theP: gp_Pnt): void;

  // gp_Elips.SetMajorRadius (method)
  SetMajorRadius(theMajorRadius: number): void;

  // gp_Elips.SetMinorRadius (method)
  SetMinorRadius(theMinorRadius: number): void;

  // gp_Elips.SetPosition (method)
  SetPosition(theA2: gp_Ax2): void;

  // gp_Elips.Area (method)
  Area(): number;

  // gp_Elips.Axis (method)
  Axis(): gp_Ax1;

  // gp_Elips.Directrix1 (method)
  Directrix1(): gp_Ax1;

  // gp_Elips.Directrix2 (method)
  Directrix2(): gp_Ax1;

  // gp_Elips.Eccentricity (method)
  Eccentricity(): number;

  // gp_Elips.Focal (method)
  Focal(): number;

  // gp_Elips.Focus1 (method)
  Focus1(): gp_Pnt;

  // gp_Elips.Focus2 (method)
  Focus2(): gp_Pnt;

  // gp_Elips.Location (method)
  Location(): gp_Pnt;

  // gp_Elips.MajorRadius (method)
  MajorRadius(): number;

  // gp_Elips.MinorRadius (method)
  MinorRadius(): number;

  // gp_Elips.Parameter (method)
  Parameter(): number;

  // gp_Elips.Position (method)
  Position(): gp_Ax2;

  // gp_Elips.XAxis (method)
  XAxis(): gp_Ax1;

  // gp_Elips.YAxis (method)
  YAxis(): gp_Ax1;

  // gp_Elips.Mirror (method)
  Mirror(theP: gp_Pnt): void;
  Mirror(theA1: gp_Ax1): void;
  Mirror(theA2: gp_Ax2): void;

  // gp_Elips.Mirrored (method)
  Mirrored(theP: gp_Pnt): gp_Elips;
  Mirrored(theA1: gp_Ax1): gp_Elips;
  Mirrored(theA2: gp_Ax2): gp_Elips;

  // gp_Elips.Rotate (method)
  Rotate(theA1: gp_Ax1, theAng: number): void;

  // gp_Elips.Rotated (method)
  Rotated(theA1: gp_Ax1, theAng: number): gp_Elips;

  // gp_Elips.Scale (method)
  Scale(theP: gp_Pnt, theS: number): void;

  // gp_Elips.Scaled (method)
  Scaled(theP: gp_Pnt, theS: number): gp_Elips;

  // gp_Elips.Transform (method)
  Transform(theT: gp_Trsf): void;

  // gp_Elips.Transformed (method)
  Transformed(theT: gp_Trsf): gp_Elips;

  // gp_Elips.Translate (method)
  Translate(theV: gp_Vec): void;
  Translate(theP1: gp_Pnt, theP2: gp_Pnt): void;

  // gp_Elips.Translated (method)
  Translated(theV: gp_Vec): gp_Elips;
  Translated(theP1: gp_Pnt, theP2: gp_Pnt): gp_Elips;

  // gp_Elips.delete (method)
  delete(): void;

  // gp_Elips.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gp_Elips2d: declare class gp_Elips2d

  // gp_Elips2d.constructor (constructor)
  constructor();
  constructor(theA: gp_Ax22d, theMajorRadius: number, theMinorRadius: number);
  constructor(theMajorAxis: gp_Ax2d, theMajorRadius: number, theMinorRadius: number, theIsSense?: boolean);

  // gp_Elips2d.SetLocation (method)
  SetLocation(theP: gp_Pnt2d): void;

  // gp_Elips2d.SetMajorRadius (method)
  SetMajorRadius(theMajorRadius: number): void;

  // gp_Elips2d.SetMinorRadius (method)
  SetMinorRadius(theMinorRadius: number): void;

  // gp_Elips2d.SetAxis (method)
  SetAxis(theA: gp_Ax22d): void;

  // gp_Elips2d.SetXAxis (method)
  SetXAxis(theA: gp_Ax2d): void;

  // gp_Elips2d.SetYAxis (method)
  SetYAxis(theA: gp_Ax2d): void;

  // gp_Elips2d.Area (method)
  Area(): number;

  // gp_Elips2d.Coefficients (method)
  Coefficients(theA?: number, theB?: number, theC?: number, theD?: number, theE?: number, theF?: number): { theA: number; theB: number; theC: number; theD: number; theE: number; theF: number };

  // gp_Elips2d.Directrix1 (method)
  Directrix1(): gp_Ax2d;

  // gp_Elips2d.Directrix2 (method)
  Directrix2(): gp_Ax2d;

  // gp_Elips2d.Eccentricity (method)
  Eccentricity(): number;

  // gp_Elips2d.Focal (method)
  Focal(): number;

  // gp_Elips2d.Focus1 (method)
  Focus1(): gp_Pnt2d;

  // gp_Elips2d.Focus2 (method)
  Focus2(): gp_Pnt2d;

  // gp_Elips2d.Location (method)
  Location(): gp_Pnt2d;

  // gp_Elips2d.MajorRadius (method)
  MajorRadius(): number;

  // gp_Elips2d.MinorRadius (method)
  MinorRadius(): number;

  // gp_Elips2d.Parameter (method)
  Parameter(): number;

  // gp_Elips2d.Axis (method)
  Axis(): gp_Ax22d;

  // gp_Elips2d.XAxis (method)
  XAxis(): gp_Ax2d;

  // gp_Elips2d.YAxis (method)
  YAxis(): gp_Ax2d;

  // gp_Elips2d.Reverse (method)
  Reverse(): void;

  // gp_Elips2d.Reversed (method)
  Reversed(): gp_Elips2d;

  // gp_Elips2d.IsDirect (method)
  IsDirect(): boolean;

  // gp_Elips2d.Mirror (method)
  Mirror(theP: gp_Pnt2d): void;
  Mirror(theA: gp_Ax2d): void;

  // gp_Elips2d.Mirrored (method)
  Mirrored(theP: gp_Pnt2d): gp_Elips2d;
  Mirrored(theA: gp_Ax2d): gp_Elips2d;

  // gp_Elips2d.Rotate (method)
  Rotate(theP: gp_Pnt2d, theAng: number): void;

  // gp_Elips2d.Rotated (method)
  Rotated(theP: gp_Pnt2d, theAng: number): gp_Elips2d;

  // gp_Elips2d.Scale (method)
  Scale(theP: gp_Pnt2d, theS: number): void;

  // gp_Elips2d.Scaled (method)
  Scaled(theP: gp_Pnt2d, theS: number): gp_Elips2d;

  // gp_Elips2d.Transform (method)
  Transform(theT: gp_Trsf2d): void;

  // gp_Elips2d.Transformed (method)
  Transformed(theT: gp_Trsf2d): gp_Elips2d;

  // gp_Elips2d.Translate (method)
  Translate(theV: gp_Vec2d): void;
  Translate(theP1: gp_Pnt2d, theP2: gp_Pnt2d): void;

  // gp_Elips2d.Translated (method)
  Translated(theV: gp_Vec2d): gp_Elips2d;
  Translated(theP1: gp_Pnt2d, theP2: gp_Pnt2d): gp_Elips2d;

  // gp_Elips2d.delete (method)
  delete(): void;

  // gp_Elips2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
