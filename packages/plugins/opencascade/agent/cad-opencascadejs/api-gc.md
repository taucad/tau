# libcascade — GC

33 top-level symbols. Signatures are verbatim typescript.

GC_MakeArcOfCircle: declare class GC_MakeArcOfCircle extends GC_Root

  // GC_MakeArcOfCircle.constructor (constructor)
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theP3: gp_Pnt);
  constructor(theP1: gp_Pnt, theV: gp_Vec, theP2: gp_Pnt);
  constructor(theCirc: gp_Circ, theAlpha1: number, theAlpha2: number, theSense: boolean);
  constructor(theCirc: gp_Circ, theP: gp_Pnt, theAlpha: number, theSense: boolean);
  constructor(theCirc: gp_Circ, theP1: gp_Pnt, theP2: gp_Pnt, theSense: boolean);

  // GC_MakeArcOfCircle.Value (method)
  Value(): Geom_TrimmedCurve;

  // GC_MakeArcOfCircle.delete (method)
  delete(): void;

  // GC_MakeArcOfCircle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeArcOfCircle2d: declare class GC_MakeArcOfCircle2d extends GC_Root

  // GC_MakeArcOfCircle2d.constructor (constructor)
  constructor(theP1: gp_Pnt2d, theP2: gp_Pnt2d, theP3: gp_Pnt2d);
  constructor(theP1: gp_Pnt2d, theV: gp_Vec2d, theP2: gp_Pnt2d);
  constructor(theCircle: gp_Circ2d, theAlpha1: number, theAlpha2: number, theSense?: boolean);
  constructor(theCircle: gp_Circ2d, thePoint: gp_Pnt2d, theAlpha: number, theSense?: boolean);
  constructor(theCircle: gp_Circ2d, theP1: gp_Pnt2d, theP2: gp_Pnt2d, theSense?: boolean);

  // GC_MakeArcOfCircle2d.Value (method)
  Value(): Geom2d_TrimmedCurve;

  // GC_MakeArcOfCircle2d.delete (method)
  delete(): void;

  // GC_MakeArcOfCircle2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeArcOfEllipse: declare class GC_MakeArcOfEllipse extends GC_Root

  // GC_MakeArcOfEllipse.constructor (constructor)
  constructor(theElips: gp_Elips, theAlpha1: number, theAlpha2: number, theSense: boolean);
  constructor(theElips: gp_Elips, theP: gp_Pnt, theAlpha: number, theSense: boolean);
  constructor(theElips: gp_Elips, theP1: gp_Pnt, theP2: gp_Pnt, theSense: boolean);

  // GC_MakeArcOfEllipse.Value (method)
  Value(): Geom_TrimmedCurve;

  // GC_MakeArcOfEllipse.delete (method)
  delete(): void;

  // GC_MakeArcOfEllipse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeArcOfEllipse2d: declare class GC_MakeArcOfEllipse2d extends GC_Root

  // GC_MakeArcOfEllipse2d.constructor (constructor)
  constructor(theEllipse: gp_Elips2d, theAlpha1: number, theAlpha2: number, theSense?: boolean);
  constructor(theEllipse: gp_Elips2d, thePoint: gp_Pnt2d, theAlpha: number, theSense?: boolean);
  constructor(theEllipse: gp_Elips2d, theP1: gp_Pnt2d, theP2: gp_Pnt2d, theSense?: boolean);

  // GC_MakeArcOfEllipse2d.Value (method)
  Value(): Geom2d_TrimmedCurve;

  // GC_MakeArcOfEllipse2d.delete (method)
  delete(): void;

  // GC_MakeArcOfEllipse2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeArcOfHyperbola: declare class GC_MakeArcOfHyperbola extends GC_Root

  // GC_MakeArcOfHyperbola.constructor (constructor)
  constructor(theHypr: gp_Hypr, theAlpha1: number, theAlpha2: number, theSense: boolean);
  constructor(theHypr: gp_Hypr, theP: gp_Pnt, theAlpha: number, theSense: boolean);
  constructor(theHypr: gp_Hypr, theP1: gp_Pnt, theP2: gp_Pnt, theSense: boolean);

  // GC_MakeArcOfHyperbola.Value (method)
  Value(): Geom_TrimmedCurve;

  // GC_MakeArcOfHyperbola.delete (method)
  delete(): void;

  // GC_MakeArcOfHyperbola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeArcOfHyperbola2d: declare class GC_MakeArcOfHyperbola2d extends GC_Root

  // GC_MakeArcOfHyperbola2d.constructor (constructor)
  constructor(theHyperbola: gp_Hypr2d, theAlpha1: number, theAlpha2: number, theSense?: boolean);
  constructor(theHyperbola: gp_Hypr2d, thePoint: gp_Pnt2d, theAlpha: number, theSense?: boolean);
  constructor(theHyperbola: gp_Hypr2d, theP1: gp_Pnt2d, theP2: gp_Pnt2d, theSense?: boolean);

  // GC_MakeArcOfHyperbola2d.Value (method)
  Value(): Geom2d_TrimmedCurve;

  // GC_MakeArcOfHyperbola2d.delete (method)
  delete(): void;

  // GC_MakeArcOfHyperbola2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeArcOfParabola: declare class GC_MakeArcOfParabola extends GC_Root

  // GC_MakeArcOfParabola.constructor (constructor)
  constructor(theParab: gp_Parab, theAlpha1: number, theAlpha2: number, theSense: boolean);
  constructor(theParab: gp_Parab, theP: gp_Pnt, theAlpha: number, theSense: boolean);
  constructor(theParab: gp_Parab, theP1: gp_Pnt, theP2: gp_Pnt, theSense: boolean);

  // GC_MakeArcOfParabola.Value (method)
  Value(): Geom_TrimmedCurve;

  // GC_MakeArcOfParabola.delete (method)
  delete(): void;

  // GC_MakeArcOfParabola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeArcOfParabola2d: declare class GC_MakeArcOfParabola2d extends GC_Root

  // GC_MakeArcOfParabola2d.constructor (constructor)
  constructor(theParabola: gp_Parab2d, theAlpha1: number, theAlpha2: number, theSense?: boolean);
  constructor(theParabola: gp_Parab2d, thePoint: gp_Pnt2d, theAlpha: number, theSense?: boolean);
  constructor(theParabola: gp_Parab2d, theP1: gp_Pnt2d, theP2: gp_Pnt2d, theSense?: boolean);

  // GC_MakeArcOfParabola2d.Value (method)
  Value(): Geom2d_TrimmedCurve;

  // GC_MakeArcOfParabola2d.delete (method)
  delete(): void;

  // GC_MakeArcOfParabola2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeCircle: declare class GC_MakeCircle extends GC_Root

  // GC_MakeCircle.constructor (constructor)
  constructor(theC: gp_Circ);
  constructor(theA2: gp_Ax2, theRadius: number);
  constructor(theCirc: gp_Circ, theDist: number);
  constructor(theCirc: gp_Circ, thePoint: gp_Pnt);
  constructor(theAxis: gp_Ax1, theRadius: number);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theP3: gp_Pnt);
  constructor(theCenter: gp_Pnt, theNorm: gp_Dir, theRadius: number);
  constructor(theCenter: gp_Pnt, thePtAxis: gp_Pnt, theRadius: number);

  // GC_MakeCircle.Value (method)
  Value(): Geom_Circle;

  // GC_MakeCircle.delete (method)
  delete(): void;

  // GC_MakeCircle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeCircle2d: declare class GC_MakeCircle2d extends GC_Root

  // GC_MakeCircle2d.constructor (constructor)
  constructor(theCircle: gp_Circ2d);
  constructor(theAxis: gp_Ax22d, theRadius: number);
  constructor(theCircle: gp_Circ2d, theDist: number);
  constructor(theCircle: gp_Circ2d, thePoint: gp_Pnt2d);
  constructor(theAxis: gp_Ax2d, theRadius: number, theSense?: boolean);
  constructor(theP1: gp_Pnt2d, theP2: gp_Pnt2d, theP3: gp_Pnt2d);
  constructor(theCenter: gp_Pnt2d, theRadius: number, theSense?: boolean);
  constructor(theCenter: gp_Pnt2d, thePoint: gp_Pnt2d, theSense?: boolean);

  // GC_MakeCircle2d.Value (method)
  Value(): Geom2d_Circle;

  // GC_MakeCircle2d.delete (method)
  delete(): void;

  // GC_MakeCircle2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeConicalSurface: declare class GC_MakeConicalSurface extends GC_Root

  // GC_MakeConicalSurface.constructor (constructor)
  constructor(theC: gp_Cone);
  constructor(theA2: gp_Ax2, theAng: number, theRadius: number);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theP3: gp_Pnt, theP4: gp_Pnt);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theR1: number, theR2: number);

  // GC_MakeConicalSurface.Value (method)
  Value(): Geom_ConicalSurface;

  // GC_MakeConicalSurface.delete (method)
  delete(): void;

  // GC_MakeConicalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeCylindricalSurface: declare class GC_MakeCylindricalSurface extends GC_Root

  // GC_MakeCylindricalSurface.constructor (constructor)
  constructor(theC: gp_Cylinder);
  constructor(theCirc: gp_Circ);
  constructor(theA2: gp_Ax2, theRadius: number);
  constructor(theCyl: gp_Cylinder, thePoint: gp_Pnt);
  constructor(theCyl: gp_Cylinder, theDist: number);
  constructor(theAxis: gp_Ax1, theRadius: number);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theP3: gp_Pnt);

  // GC_MakeCylindricalSurface.Value (method)
  Value(): Geom_CylindricalSurface;

  // GC_MakeCylindricalSurface.delete (method)
  delete(): void;

  // GC_MakeCylindricalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeEllipse: declare class GC_MakeEllipse extends GC_Root

  // GC_MakeEllipse.constructor (constructor)
  constructor(theE: gp_Elips);
  constructor(theA2: gp_Ax2, theMajorRadius: number, theMinorRadius: number);
  constructor(theS1: gp_Pnt, theS2: gp_Pnt, theCenter: gp_Pnt);

  // GC_MakeEllipse.Value (method)
  Value(): Geom_Ellipse;

  // GC_MakeEllipse.delete (method)
  delete(): void;

  // GC_MakeEllipse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeEllipse2d: declare class GC_MakeEllipse2d extends GC_Root

  // GC_MakeEllipse2d.constructor (constructor)
  constructor(theEllipse: gp_Elips2d);
  constructor(theAxis: gp_Ax22d, theMajorRadius: number, theMinorRadius: number);
  constructor(theS1: gp_Pnt2d, theS2: gp_Pnt2d, theCenter: gp_Pnt2d);
  constructor(theMajorAxis: gp_Ax2d, theMajorRadius: number, theMinorRadius: number, theSense?: boolean);

  // GC_MakeEllipse2d.Value (method)
  Value(): Geom2d_Ellipse;

  // GC_MakeEllipse2d.delete (method)
  delete(): void;

  // GC_MakeEllipse2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeHyperbola: declare class GC_MakeHyperbola extends GC_Root

  // GC_MakeHyperbola.constructor (constructor)
  constructor(theH: gp_Hypr);
  constructor(theA2: gp_Ax2, theMajorRadius: number, theMinorRadius: number);
  constructor(theS1: gp_Pnt, theS2: gp_Pnt, theCenter: gp_Pnt);

  // GC_MakeHyperbola.Value (method)
  Value(): Geom_Hyperbola;

  // GC_MakeHyperbola.delete (method)
  delete(): void;

  // GC_MakeHyperbola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeHyperbola2d: declare class GC_MakeHyperbola2d extends GC_Root

  // GC_MakeHyperbola2d.constructor (constructor)
  constructor(theHyperbola: gp_Hypr2d);
  constructor(theAxis: gp_Ax22d, theMajorRadius: number, theMinorRadius: number);
  constructor(theS1: gp_Pnt2d, theS2: gp_Pnt2d, theCenter: gp_Pnt2d);
  constructor(theMajorAxis: gp_Ax2d, theMajorRadius: number, theMinorRadius: number, theSense: boolean);

  // GC_MakeHyperbola2d.Value (method)
  Value(): Geom2d_Hyperbola;

  // GC_MakeHyperbola2d.delete (method)
  delete(): void;

  // GC_MakeHyperbola2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeLine: declare class GC_MakeLine extends GC_Root

  // GC_MakeLine.constructor (constructor)
  constructor(theA1: gp_Ax1);
  constructor(theL: gp_Lin);
  constructor(theP: gp_Pnt, theV: gp_Dir);
  constructor(theLin: gp_Lin, thePoint: gp_Pnt);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt);

  // GC_MakeLine.Value (method)
  Value(): Geom_Line;

  // GC_MakeLine.delete (method)
  delete(): void;

  // GC_MakeLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeLine2d: declare class GC_MakeLine2d extends GC_Root

  // GC_MakeLine2d.constructor (constructor)
  constructor(theAxis: gp_Ax2d);
  constructor(theLine: gp_Lin2d);
  constructor(thePoint: gp_Pnt2d, theDir: gp_Dir2d);
  constructor(theLine: gp_Lin2d, thePoint: gp_Pnt2d);
  constructor(theLine: gp_Lin2d, theDist: number);
  constructor(theP1: gp_Pnt2d, theP2: gp_Pnt2d);

  // GC_MakeLine2d.Value (method)
  Value(): Geom2d_Line;

  // GC_MakeLine2d.delete (method)
  delete(): void;

  // GC_MakeLine2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeMirror: declare class GC_MakeMirror

  // GC_MakeMirror.constructor (constructor)
  constructor(thePoint: gp_Pnt);
  constructor(theAxis: gp_Ax1);
  constructor(theLine: gp_Lin);
  constructor(thePlane: gp_Pln);
  constructor(thePlane: gp_Ax2);
  constructor(thePoint: gp_Pnt, theDirec: gp_Dir);

  // GC_MakeMirror.Value (method)
  Value(): Geom_Transformation;

  // GC_MakeMirror.delete (method)
  delete(): void;

  // GC_MakeMirror.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeMirror2d: declare class GC_MakeMirror2d

  // GC_MakeMirror2d.constructor (constructor)
  constructor(thePoint: gp_Pnt2d);
  constructor(theAxis: gp_Ax2d);
  constructor(theLine: gp_Lin2d);
  constructor(thePoint: gp_Pnt2d, theDirec: gp_Dir2d);

  // GC_MakeMirror2d.Value (method)
  Value(): Geom2d_Transformation;

  // GC_MakeMirror2d.delete (method)
  delete(): void;

  // GC_MakeMirror2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeParabola2d: declare class GC_MakeParabola2d extends GC_Root

  // GC_MakeParabola2d.constructor (constructor)
  constructor(theParabola: gp_Parab2d);
  constructor(theAxis: gp_Ax22d, theFocal: number);
  constructor(theFocus: gp_Pnt2d, theVertex: gp_Pnt2d);
  constructor(theMirrorAxis: gp_Ax2d, theFocal: number, theSense: boolean);
  constructor(theDirectrix: gp_Ax2d, theFocus: gp_Pnt2d, theSense?: boolean);

  // GC_MakeParabola2d.Value (method)
  Value(): Geom2d_Parabola;

  // GC_MakeParabola2d.delete (method)
  delete(): void;

  // GC_MakeParabola2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakePlane: declare class GC_MakePlane extends GC_Root

  // GC_MakePlane.constructor (constructor)
  constructor(thePl: gp_Pln);
  constructor(theAxis: gp_Ax1);
  constructor(theP: gp_Pnt, theV: gp_Dir);
  constructor(thePln: gp_Pln, thePoint: gp_Pnt);
  constructor(thePln: gp_Pln, theDist: number);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theP3: gp_Pnt);
  constructor(theA: number, theB: number, theC: number, theD: number);

  // GC_MakePlane.Value (method)
  Value(): Geom_Plane;

  // GC_MakePlane.delete (method)
  delete(): void;

  // GC_MakePlane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeRotation: declare class GC_MakeRotation

  // GC_MakeRotation.constructor (constructor)
  constructor(theLine: gp_Lin, theAngle: number);
  constructor(theAxis: gp_Ax1, theAngle: number);
  constructor(thePoint: gp_Pnt, theDirec: gp_Dir, theAngle: number);

  // GC_MakeRotation.Value (method)
  Value(): Geom_Transformation;

  // GC_MakeRotation.delete (method)
  delete(): void;

  // GC_MakeRotation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeRotation2d: declare class GC_MakeRotation2d

  // GC_MakeRotation2d.constructor (constructor)
  constructor(thePoint: gp_Pnt2d, theAngle: number);

  // GC_MakeRotation2d.Value (method)
  Value(): Geom2d_Transformation;

  // GC_MakeRotation2d.delete (method)
  delete(): void;

  // GC_MakeRotation2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeScale: declare class GC_MakeScale

  // GC_MakeScale.constructor (constructor)
  constructor(thePoint: gp_Pnt, theScale: number);

  // GC_MakeScale.Value (method)
  Value(): Geom_Transformation;

  // GC_MakeScale.delete (method)
  delete(): void;

  // GC_MakeScale.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeScale2d: declare class GC_MakeScale2d

  // GC_MakeScale2d.constructor (constructor)
  constructor(thePoint: gp_Pnt2d, theScale: number);

  // GC_MakeScale2d.Value (method)
  Value(): Geom2d_Transformation;

  // GC_MakeScale2d.delete (method)
  delete(): void;

  // GC_MakeScale2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeSegment: declare class GC_MakeSegment extends GC_Root

  // GC_MakeSegment.constructor (constructor)
  constructor(theP1: gp_Pnt, theP2: gp_Pnt);
  constructor(theLine: gp_Lin, theU1: number, theU2: number);
  constructor(theLine: gp_Lin, thePoint: gp_Pnt, theUlast: number);
  constructor(theLine: gp_Lin, theP1: gp_Pnt, theP2: gp_Pnt);

  // GC_MakeSegment.Value (method)
  Value(): Geom_TrimmedCurve;

  // GC_MakeSegment.delete (method)
  delete(): void;

  // GC_MakeSegment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeSegment2d: declare class GC_MakeSegment2d extends GC_Root

  // GC_MakeSegment2d.constructor (constructor)
  constructor(theP1: gp_Pnt2d, theP2: gp_Pnt2d);
  constructor(theP1: gp_Pnt2d, theV: gp_Dir2d, theP2: gp_Pnt2d);
  constructor(theLine: gp_Lin2d, theU1: number, theU2: number);
  constructor(theLine: gp_Lin2d, thePoint: gp_Pnt2d, theUlast: number);
  constructor(theLine: gp_Lin2d, theP1: gp_Pnt2d, theP2: gp_Pnt2d);

  // GC_MakeSegment2d.Value (method)
  Value(): Geom2d_TrimmedCurve;

  // GC_MakeSegment2d.delete (method)
  delete(): void;

  // GC_MakeSegment2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeTranslation: declare class GC_MakeTranslation

  // GC_MakeTranslation.constructor (constructor)
  constructor(theVect: gp_Vec);
  constructor(thePoint1: gp_Pnt, thePoint2: gp_Pnt);

  // GC_MakeTranslation.Value (method)
  Value(): Geom_Transformation;

  // GC_MakeTranslation.delete (method)
  delete(): void;

  // GC_MakeTranslation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeTranslation2d: declare class GC_MakeTranslation2d

  // GC_MakeTranslation2d.constructor (constructor)
  constructor(theVect: gp_Vec2d);
  constructor(thePoint1: gp_Pnt2d, thePoint2: gp_Pnt2d);

  // GC_MakeTranslation2d.Value (method)
  Value(): Geom2d_Transformation;

  // GC_MakeTranslation2d.delete (method)
  delete(): void;

  // GC_MakeTranslation2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeTrimmedCone: declare class GC_MakeTrimmedCone extends GC_Root

  // GC_MakeTrimmedCone.constructor (constructor)
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theP3: gp_Pnt, theP4: gp_Pnt);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theR1: number, theR2: number);

  // GC_MakeTrimmedCone.Value (method)
  Value(): Geom_RectangularTrimmedSurface;

  // GC_MakeTrimmedCone.delete (method)
  delete(): void;

  // GC_MakeTrimmedCone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_MakeTrimmedCylinder: declare class GC_MakeTrimmedCylinder extends GC_Root

  // GC_MakeTrimmedCylinder.constructor (constructor)
  constructor(theCirc: gp_Circ, theHeight: number);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt, theP3: gp_Pnt);
  constructor(theA1: gp_Ax1, theRadius: number, theHeight: number);

  // GC_MakeTrimmedCylinder.Value (method)
  Value(): Geom_RectangularTrimmedSurface;

  // GC_MakeTrimmedCylinder.delete (method)
  delete(): void;

  // GC_MakeTrimmedCylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GC_Root: declare class GC_Root

  // GC_Root.constructor (constructor)
  constructor();

  // GC_Root.IsDone (method)
  IsDone(): boolean;

  // GC_Root.IsError (method)
  IsError(): boolean;

  // GC_Root.Status (method)
  Status(): gce_ErrorType;

  // GC_Root.delete (method)
  delete(): void;

  // GC_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
