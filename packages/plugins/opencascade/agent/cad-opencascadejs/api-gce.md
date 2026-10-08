# libcascade — gce

25 top-level symbols. Signatures are verbatim typescript.

gce_ErrorType: typeof gce_ErrorType[keyof typeof gce_ErrorType]

  readonly gce_Done: 'gce_Done'

  readonly gce_ConfusedPoints: 'gce_ConfusedPoints'

  readonly gce_NegativeRadius: 'gce_NegativeRadius'

  readonly gce_ColinearPoints: 'gce_ColinearPoints'

  readonly gce_IntersectionError: 'gce_IntersectionError'

  readonly gce_NullAxis: 'gce_NullAxis'

  readonly gce_NullAngle: 'gce_NullAngle'

  readonly gce_NullRadius: 'gce_NullRadius'

  readonly gce_InvertAxis: 'gce_InvertAxis'

  readonly gce_BadAngle: 'gce_BadAngle'

  readonly gce_InvertRadius: 'gce_InvertRadius'

  readonly gce_NullFocusLength: 'gce_NullFocusLength'

  readonly gce_NullVector: 'gce_NullVector'

  readonly gce_BadEquation: 'gce_BadEquation'

gce_MakeCirc: declare class gce_MakeCirc extends gce_Root

  // gce_MakeCirc.constructor (constructor)
  constructor(A2: gp_Ax2, Radius: number);
  constructor(Circ: gp_Circ, Dist: number);
  constructor(Circ: gp_Circ, Point: gp_Pnt);
  constructor(Axis: gp_Ax1, Radius: number);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt);
  constructor(Center: gp_Pnt, Norm: gp_Dir, Radius: number);
  constructor(Center: gp_Pnt, Plane: gp_Pln, Radius: number);
  constructor(Center: gp_Pnt, Ptaxis: gp_Pnt, Radius: number);

  // gce_MakeCirc.Value (method)
  Value(): gp_Circ;

  // gce_MakeCirc.Operator (method)
  Operator(): gp_Circ;

  // gce_MakeCirc.delete (method)
  delete(): void;

  // gce_MakeCirc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeCirc2d: declare class gce_MakeCirc2d extends gce_Root

  // gce_MakeCirc2d.constructor (constructor)
  constructor(Axis: gp_Ax22d, Radius: number);
  constructor(Circ: gp_Circ2d, Dist: number);
  constructor(Circ: gp_Circ2d, Point: gp_Pnt2d);
  constructor(XAxis: gp_Ax2d, Radius: number, Sense?: boolean);
  constructor(P1: gp_Pnt2d, P2: gp_Pnt2d, P3: gp_Pnt2d);
  constructor(Center: gp_Pnt2d, Radius: number, Sense?: boolean);
  constructor(Center: gp_Pnt2d, Point: gp_Pnt2d, Sense?: boolean);

  // gce_MakeCirc2d.Value (method)
  Value(): gp_Circ2d;

  // gce_MakeCirc2d.Operator (method)
  Operator(): gp_Circ2d;

  // gce_MakeCirc2d.delete (method)
  delete(): void;

  // gce_MakeCirc2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeCone: declare class gce_MakeCone extends gce_Root

  // gce_MakeCone.constructor (constructor)
  constructor(Cone: gp_Cone, Point: gp_Pnt);
  constructor(Cone: gp_Cone, Dist: number);
  constructor(A2: gp_Ax2, Ang: number, Radius: number);
  constructor(Axis: gp_Ax1, P1: gp_Pnt, P2: gp_Pnt);
  constructor(Axis: gp_Lin, P1: gp_Pnt, P2: gp_Pnt);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, P4: gp_Pnt);
  constructor(P1: gp_Pnt, P2: gp_Pnt, R1: number, R2: number);

  // gce_MakeCone.Value (method)
  Value(): gp_Cone;

  // gce_MakeCone.Operator (method)
  Operator(): gp_Cone;

  // gce_MakeCone.delete (method)
  delete(): void;

  // gce_MakeCone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeCylinder: declare class gce_MakeCylinder extends gce_Root

  // gce_MakeCylinder.constructor (constructor)
  constructor(Circ: gp_Circ);
  constructor(A2: gp_Ax2, Radius: number);
  constructor(Cyl: gp_Cylinder, Point: gp_Pnt);
  constructor(Cyl: gp_Cylinder, Dist: number);
  constructor(Axis: gp_Ax1, Radius: number);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt);

  // gce_MakeCylinder.Value (method)
  Value(): gp_Cylinder;

  // gce_MakeCylinder.Operator (method)
  Operator(): gp_Cylinder;

  // gce_MakeCylinder.delete (method)
  delete(): void;

  // gce_MakeCylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeDir: declare class gce_MakeDir extends gce_Root

  // gce_MakeDir.constructor (constructor)
  constructor(V: gp_Vec);
  constructor(Coord: gp_XYZ);
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(Xv: number, Yv: number, Zv: number);

  // gce_MakeDir.Value (method)
  Value(): gp_Dir;

  // gce_MakeDir.Operator (method)
  Operator(): gp_Dir;

  // gce_MakeDir.delete (method)
  delete(): void;

  // gce_MakeDir.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeDir2d: declare class gce_MakeDir2d extends gce_Root

  // gce_MakeDir2d.constructor (constructor)
  constructor(V: gp_Vec2d);
  constructor(Coord: gp_XY);
  constructor(Xv: number, Yv: number);
  constructor(P1: gp_Pnt2d, P2: gp_Pnt2d);

  // gce_MakeDir2d.Value (method)
  Value(): gp_Dir2d;

  // gce_MakeDir2d.Operator (method)
  Operator(): gp_Dir2d;

  // gce_MakeDir2d.delete (method)
  delete(): void;

  // gce_MakeDir2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeElips: declare class gce_MakeElips extends gce_Root

  // gce_MakeElips.constructor (constructor)
  constructor(A2: gp_Ax2, MajorRadius: number, MinorRadius: number);
  constructor(S1: gp_Pnt, S2: gp_Pnt, Center: gp_Pnt);

  // gce_MakeElips.Value (method)
  Value(): gp_Elips;

  // gce_MakeElips.Operator (method)
  Operator(): gp_Elips;

  // gce_MakeElips.delete (method)
  delete(): void;

  // gce_MakeElips.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeElips2d: declare class gce_MakeElips2d extends gce_Root

  // gce_MakeElips2d.constructor (constructor)
  constructor(A: gp_Ax22d, MajorRadius: number, MinorRadius: number);
  constructor(S1: gp_Pnt2d, S2: gp_Pnt2d, Center: gp_Pnt2d);
  constructor(MajorAxis: gp_Ax2d, MajorRadius: number, MinorRadius: number, Sense?: boolean);

  // gce_MakeElips2d.Value (method)
  Value(): gp_Elips2d;

  // gce_MakeElips2d.Operator (method)
  Operator(): gp_Elips2d;

  // gce_MakeElips2d.delete (method)
  delete(): void;

  // gce_MakeElips2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeHypr: declare class gce_MakeHypr extends gce_Root

  // gce_MakeHypr.constructor (constructor)
  constructor(A2: gp_Ax2, MajorRadius: number, MinorRadius: number);
  constructor(S1: gp_Pnt, S2: gp_Pnt, Center: gp_Pnt);

  // gce_MakeHypr.Value (method)
  Value(): gp_Hypr;

  // gce_MakeHypr.Operator (method)
  Operator(): gp_Hypr;

  // gce_MakeHypr.delete (method)
  delete(): void;

  // gce_MakeHypr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeHypr2d: declare class gce_MakeHypr2d extends gce_Root

  // gce_MakeHypr2d.constructor (constructor)
  constructor(S1: gp_Pnt2d, S2: gp_Pnt2d, Center: gp_Pnt2d);
  constructor(A: gp_Ax22d, MajorRadius: number, MinorRadius: number);
  constructor(MajorAxis: gp_Ax2d, MajorRadius: number, MinorRadius: number, Sense: boolean);

  // gce_MakeHypr2d.Value (method)
  Value(): gp_Hypr2d;

  // gce_MakeHypr2d.Operator (method)
  Operator(): gp_Hypr2d;

  // gce_MakeHypr2d.delete (method)
  delete(): void;

  // gce_MakeHypr2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeLin: declare class gce_MakeLin extends gce_Root

  // gce_MakeLin.constructor (constructor)
  constructor(A1: gp_Ax1);
  constructor(P: gp_Pnt, V: gp_Dir);
  constructor(Lin: gp_Lin, Point: gp_Pnt);
  constructor(P1: gp_Pnt, P2: gp_Pnt);

  // gce_MakeLin.Value (method)
  Value(): gp_Lin;

  // gce_MakeLin.Operator (method)
  Operator(): gp_Lin;

  // gce_MakeLin.delete (method)
  delete(): void;

  // gce_MakeLin.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeLin2d: declare class gce_MakeLin2d extends gce_Root

  // gce_MakeLin2d.constructor (constructor)
  constructor(A: gp_Ax2d);
  constructor(P: gp_Pnt2d, V: gp_Dir2d);
  constructor(Lin: gp_Lin2d, Dist: number);
  constructor(Lin: gp_Lin2d, Point: gp_Pnt2d);
  constructor(P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(A: number, B: number, C: number);

  // gce_MakeLin2d.Value (method)
  Value(): gp_Lin2d;

  // gce_MakeLin2d.Operator (method)
  Operator(): gp_Lin2d;

  // gce_MakeLin2d.delete (method)
  delete(): void;

  // gce_MakeLin2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeMirror: declare class gce_MakeMirror

  // gce_MakeMirror.constructor (constructor)
  constructor(Point: gp_Pnt);
  constructor(Axis: gp_Ax1);
  constructor(Line: gp_Lin);
  constructor(Plane: gp_Pln);
  constructor(Plane: gp_Ax2);
  constructor(Point: gp_Pnt, Direc: gp_Dir);

  // gce_MakeMirror.Value (method)
  Value(): gp_Trsf;

  // gce_MakeMirror.Operator (method)
  Operator(): gp_Trsf;

  // gce_MakeMirror.delete (method)
  delete(): void;

  // gce_MakeMirror.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeMirror2d: declare class gce_MakeMirror2d

  // gce_MakeMirror2d.constructor (constructor)
  constructor(Point: gp_Pnt2d);
  constructor(Axis: gp_Ax2d);
  constructor(Line: gp_Lin2d);
  constructor(Point: gp_Pnt2d, Direc: gp_Dir2d);

  // gce_MakeMirror2d.Value (method)
  Value(): gp_Trsf2d;

  // gce_MakeMirror2d.Operator (method)
  Operator(): gp_Trsf2d;

  // gce_MakeMirror2d.delete (method)
  delete(): void;

  // gce_MakeMirror2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeParab: declare class gce_MakeParab extends gce_Root

  // gce_MakeParab.constructor (constructor)
  constructor(A2: gp_Ax2, Focal: number);
  constructor(D: gp_Ax1, F: gp_Pnt);

  // gce_MakeParab.Value (method)
  Value(): gp_Parab;

  // gce_MakeParab.Operator (method)
  Operator(): gp_Parab;

  // gce_MakeParab.delete (method)
  delete(): void;

  // gce_MakeParab.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeParab2d: declare class gce_MakeParab2d extends gce_Root

  // gce_MakeParab2d.constructor (constructor)
  constructor(A: gp_Ax22d, Focal: number);
  constructor(MirrorAxis: gp_Ax2d, Focal: number, Sense?: boolean);
  constructor(D: gp_Ax2d, F: gp_Pnt2d, Sense?: boolean);
  constructor(S1: gp_Pnt2d, Center: gp_Pnt2d, Sense?: boolean);

  // gce_MakeParab2d.Value (method)
  Value(): gp_Parab2d;

  // gce_MakeParab2d.Operator (method)
  Operator(): gp_Parab2d;

  // gce_MakeParab2d.delete (method)
  delete(): void;

  // gce_MakeParab2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakePln: declare class gce_MakePln extends gce_Root

  // gce_MakePln.constructor (constructor)
  constructor(A2: gp_Ax2);
  constructor(Axis: gp_Ax1);
  constructor(P: gp_Pnt, V: gp_Dir);
  constructor(Pln: gp_Pln, Point: gp_Pnt);
  constructor(Pln: gp_Pln, Dist: number);
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt);
  constructor(A: number, B: number, C: number, D: number);

  // gce_MakePln.Value (method)
  Value(): gp_Pln;

  // gce_MakePln.Operator (method)
  Operator(): gp_Pln;

  // gce_MakePln.delete (method)
  delete(): void;

  // gce_MakePln.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeRotation: declare class gce_MakeRotation

  // gce_MakeRotation.constructor (constructor)
  constructor(Line: gp_Lin, Angle: number);
  constructor(Axis: gp_Ax1, Angle: number);
  constructor(Point: gp_Pnt, Direc: gp_Dir, Angle: number);

  // gce_MakeRotation.Value (method)
  Value(): gp_Trsf;

  // gce_MakeRotation.Operator (method)
  Operator(): gp_Trsf;

  // gce_MakeRotation.delete (method)
  delete(): void;

  // gce_MakeRotation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeRotation2d: declare class gce_MakeRotation2d

  // gce_MakeRotation2d.constructor (constructor)
  constructor(Point: gp_Pnt2d, Angle: number);

  // gce_MakeRotation2d.Value (method)
  Value(): gp_Trsf2d;

  // gce_MakeRotation2d.Operator (method)
  Operator(): gp_Trsf2d;

  // gce_MakeRotation2d.delete (method)
  delete(): void;

  // gce_MakeRotation2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeScale: declare class gce_MakeScale

  // gce_MakeScale.constructor (constructor)
  constructor(Point: gp_Pnt, Scale: number);

  // gce_MakeScale.Value (method)
  Value(): gp_Trsf;

  // gce_MakeScale.Operator (method)
  Operator(): gp_Trsf;

  // gce_MakeScale.delete (method)
  delete(): void;

  // gce_MakeScale.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeScale2d: declare class gce_MakeScale2d

  // gce_MakeScale2d.constructor (constructor)
  constructor(Point: gp_Pnt2d, Scale: number);

  // gce_MakeScale2d.Value (method)
  Value(): gp_Trsf2d;

  // gce_MakeScale2d.Operator (method)
  Operator(): gp_Trsf2d;

  // gce_MakeScale2d.delete (method)
  delete(): void;

  // gce_MakeScale2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeTranslation: declare class gce_MakeTranslation

  // gce_MakeTranslation.constructor (constructor)
  constructor(Vect: gp_Vec);
  constructor(Point1: gp_Pnt, Point2: gp_Pnt);

  // gce_MakeTranslation.Value (method)
  Value(): gp_Trsf;

  // gce_MakeTranslation.Operator (method)
  Operator(): gp_Trsf;

  // gce_MakeTranslation.delete (method)
  delete(): void;

  // gce_MakeTranslation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_MakeTranslation2d: declare class gce_MakeTranslation2d

  // gce_MakeTranslation2d.constructor (constructor)
  constructor(Vect: gp_Vec2d);
  constructor(Point1: gp_Pnt2d, Point2: gp_Pnt2d);

  // gce_MakeTranslation2d.Value (method)
  Value(): gp_Trsf2d;

  // gce_MakeTranslation2d.Operator (method)
  Operator(): gp_Trsf2d;

  // gce_MakeTranslation2d.delete (method)
  delete(): void;

  // gce_MakeTranslation2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

gce_Root: declare class gce_Root

  // gce_Root.constructor (constructor)
  constructor();

  // gce_Root.IsDone (method)
  IsDone(): boolean;

  // gce_Root.IsError (method)
  IsError(): boolean;

  // gce_Root.Status (method)
  Status(): gce_ErrorType;

  // gce_Root.delete (method)
  delete(): void;

  // gce_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
