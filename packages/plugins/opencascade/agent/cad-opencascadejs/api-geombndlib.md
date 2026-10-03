# libcascade — GeomBndLib

32 top-level symbols. Signatures are verbatim typescript.

GeomBndLib_BSplineCurve: declare class GeomBndLib_BSplineCurve

  // GeomBndLib_BSplineCurve.constructor (constructor)
  constructor(theCurve: Geom_BSplineCurve);

  // GeomBndLib_BSplineCurve.Geometry (method)
  Geometry(): Geom_BSplineCurve;

  // GeomBndLib_BSplineCurve.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_BSplineCurve.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_BSplineCurve.delete (method)
  delete(): void;

  // GeomBndLib_BSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_BSplineCurve2d: declare class GeomBndLib_BSplineCurve2d

  // GeomBndLib_BSplineCurve2d.constructor (constructor)
  constructor(theCurve: Geom2d_BSplineCurve);

  // GeomBndLib_BSplineCurve2d.Geometry (method)
  Geometry(): Geom2d_BSplineCurve;

  // GeomBndLib_BSplineCurve2d.Box (method)
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_BSplineCurve2d.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_BSplineCurve2d.delete (method)
  delete(): void;

  // GeomBndLib_BSplineCurve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_BSplineSurface: declare class GeomBndLib_BSplineSurface

  // GeomBndLib_BSplineSurface.constructor (constructor)
  constructor(theSurf: Geom_BSplineSurface);

  // GeomBndLib_BSplineSurface.Geometry (method)
  Geometry(): Geom_BSplineSurface;

  // GeomBndLib_BSplineSurface.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_BSplineSurface.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_BSplineSurface.delete (method)
  delete(): void;

  // GeomBndLib_BSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_BezierCurve: declare class GeomBndLib_BezierCurve

  // GeomBndLib_BezierCurve.constructor (constructor)
  constructor(theCurve: Geom_BezierCurve);

  // GeomBndLib_BezierCurve.Geometry (method)
  Geometry(): Geom_BezierCurve;

  // GeomBndLib_BezierCurve.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_BezierCurve.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_BezierCurve.delete (method)
  delete(): void;

  // GeomBndLib_BezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_BezierCurve2d: declare class GeomBndLib_BezierCurve2d

  // GeomBndLib_BezierCurve2d.constructor (constructor)
  constructor(theCurve: Geom2d_BezierCurve);

  // GeomBndLib_BezierCurve2d.Geometry (method)
  Geometry(): Geom2d_BezierCurve;

  // GeomBndLib_BezierCurve2d.Box (method)
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_BezierCurve2d.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_BezierCurve2d.delete (method)
  delete(): void;

  // GeomBndLib_BezierCurve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_BezierSurface: declare class GeomBndLib_BezierSurface

  // GeomBndLib_BezierSurface.constructor (constructor)
  constructor(theSurf: Geom_BezierSurface);

  // GeomBndLib_BezierSurface.Geometry (method)
  Geometry(): Geom_BezierSurface;

  // GeomBndLib_BezierSurface.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_BezierSurface.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_BezierSurface.delete (method)
  delete(): void;

  // GeomBndLib_BezierSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Circle: declare class GeomBndLib_Circle

  // GeomBndLib_Circle.constructor (constructor)
  constructor(theCircle: Geom_Circle);

  // GeomBndLib_Circle.Geometry (method)
  Geometry(): Geom_Circle;

  // GeomBndLib_Circle.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  static Box(theCirc: gp_Circ, theTol: number): Bnd_Box;
  static Box(theCirc: gp_Circ, theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Circle.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Circle.delete (method)
  delete(): void;

  // GeomBndLib_Circle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Circle2d: declare class GeomBndLib_Circle2d

  // GeomBndLib_Circle2d.constructor (constructor)
  constructor(theCircle: Geom2d_Circle);

  // GeomBndLib_Circle2d.Geometry (method)
  Geometry(): Geom2d_Circle;

  // GeomBndLib_Circle2d.Box (method)
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  static Box(theCirc: gp_Circ2d, theTol: number): Bnd_Box2d;
  static Box(theCirc: gp_Circ2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Circle2d.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Circle2d.delete (method)
  delete(): void;

  // GeomBndLib_Circle2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Cone: declare class GeomBndLib_Cone

  // GeomBndLib_Cone.constructor (constructor)
  constructor(theSurf: Geom_ConicalSurface);

  // GeomBndLib_Cone.Geometry (method)
  Geometry(): Geom_ConicalSurface;

  // GeomBndLib_Cone.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_Cone.BoxOptimal (method)
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  // GeomBndLib_Cone.delete (method)
  delete(): void;

  // GeomBndLib_Cone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Curve: declare class GeomBndLib_Curve

  // GeomBndLib_Curve.constructor (constructor)
  constructor(theCurve: Adaptor3d_Curve);
  constructor(theCurve: Geom_Curve);

  // GeomBndLib_Curve.GetType (method)
  GetType(): GeomAbs_CurveType;

  // GeomBndLib_Curve.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Curve.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Curve.Add (method)
  Add(theTol: number, theBox: Bnd_Box): void;
  Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;

  // GeomBndLib_Curve.AddOptimal (method)
  AddOptimal(theTol: number, theBox: Bnd_Box): void;
  AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;

  // GeomBndLib_Curve.delete (method)
  delete(): void;

  // GeomBndLib_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Curve2d: declare class GeomBndLib_Curve2d

  // GeomBndLib_Curve2d.constructor (constructor)
  constructor(theCurve: Adaptor2d_Curve2d);
  constructor(theCurve: Geom2d_Curve);

  // GeomBndLib_Curve2d.GetType (method)
  GetType(): GeomAbs_CurveType;

  // GeomBndLib_Curve2d.Box (method)
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Curve2d.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Curve2d.Add (method)
  Add(theTol: number, theBox: Bnd_Box2d): void;
  Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;

  // GeomBndLib_Curve2d.AddOptimal (method)
  AddOptimal(theTol: number, theBox: Bnd_Box2d): void;
  AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;

  // GeomBndLib_Curve2d.delete (method)
  delete(): void;

  // GeomBndLib_Curve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Cylinder: declare class GeomBndLib_Cylinder

  // GeomBndLib_Cylinder.constructor (constructor)
  constructor(theSurf: Geom_CylindricalSurface);

  // GeomBndLib_Cylinder.Geometry (method)
  Geometry(): Geom_CylindricalSurface;

  // GeomBndLib_Cylinder.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_Cylinder.BoxOptimal (method)
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  // GeomBndLib_Cylinder.delete (method)
  delete(): void;

  // GeomBndLib_Cylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Ellipse: declare class GeomBndLib_Ellipse

  // GeomBndLib_Ellipse.constructor (constructor)
  constructor(theEllipse: Geom_Ellipse);

  // GeomBndLib_Ellipse.Geometry (method)
  Geometry(): Geom_Ellipse;

  // GeomBndLib_Ellipse.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  static Box(theElips: gp_Elips, theTol: number): Bnd_Box;
  static Box(theElips: gp_Elips, theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Ellipse.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Ellipse.delete (method)
  delete(): void;

  // GeomBndLib_Ellipse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Ellipse2d: declare class GeomBndLib_Ellipse2d

  // GeomBndLib_Ellipse2d.constructor (constructor)
  constructor(theEllipse: Geom2d_Ellipse);

  // GeomBndLib_Ellipse2d.Geometry (method)
  Geometry(): Geom2d_Ellipse;

  // GeomBndLib_Ellipse2d.Box (method)
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  static Box(theElips: gp_Elips2d, theTol: number): Bnd_Box2d;
  static Box(theElips: gp_Elips2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Ellipse2d.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Ellipse2d.delete (method)
  delete(): void;

  // GeomBndLib_Ellipse2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Hyperbola: declare class GeomBndLib_Hyperbola

  // GeomBndLib_Hyperbola.constructor (constructor)
  constructor(theHyperbola: Geom_Hyperbola);

  // GeomBndLib_Hyperbola.Geometry (method)
  Geometry(): Geom_Hyperbola;

  // GeomBndLib_Hyperbola.Box (method)
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  static Box(theHypr: gp_Hypr, theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Hyperbola.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Hyperbola.delete (method)
  delete(): void;

  // GeomBndLib_Hyperbola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Hyperbola2d: declare class GeomBndLib_Hyperbola2d

  // GeomBndLib_Hyperbola2d.constructor (constructor)
  constructor(theHyperbola: Geom2d_Hyperbola);

  // GeomBndLib_Hyperbola2d.Geometry (method)
  Geometry(): Geom2d_Hyperbola;

  // GeomBndLib_Hyperbola2d.Box (method)
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  static Box(theHypr: gp_Hypr2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Hyperbola2d.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Hyperbola2d.delete (method)
  delete(): void;

  // GeomBndLib_Hyperbola2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Line: declare class GeomBndLib_Line

  // GeomBndLib_Line.constructor (constructor)
  constructor(theLine: Geom_Line);

  // GeomBndLib_Line.Geometry (method)
  Geometry(): Geom_Line;

  // GeomBndLib_Line.Box (method)
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  static Box(theLin: gp_Lin, theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Line.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Line.delete (method)
  delete(): void;

  // GeomBndLib_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Line2d: declare class GeomBndLib_Line2d

  // GeomBndLib_Line2d.constructor (constructor)
  constructor(theLine: Geom2d_Line);

  // GeomBndLib_Line2d.Geometry (method)
  Geometry(): Geom2d_Line;

  // GeomBndLib_Line2d.Box (method)
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  static Box(theLin: gp_Lin2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Line2d.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Line2d.delete (method)
  delete(): void;

  // GeomBndLib_Line2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_OffsetCurve: declare class GeomBndLib_OffsetCurve

  // GeomBndLib_OffsetCurve.constructor (constructor)
  constructor(theCurve: Geom_OffsetCurve);

  // GeomBndLib_OffsetCurve.Geometry (method)
  Geometry(): Geom_OffsetCurve;

  // GeomBndLib_OffsetCurve.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_OffsetCurve.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_OffsetCurve.delete (method)
  delete(): void;

  // GeomBndLib_OffsetCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_OffsetCurve2d: declare class GeomBndLib_OffsetCurve2d

  // GeomBndLib_OffsetCurve2d.constructor (constructor)
  constructor(theCurve: Geom2d_OffsetCurve);

  // GeomBndLib_OffsetCurve2d.Geometry (method)
  Geometry(): Geom2d_OffsetCurve;

  // GeomBndLib_OffsetCurve2d.Box (method)
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_OffsetCurve2d.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_OffsetCurve2d.delete (method)
  delete(): void;

  // GeomBndLib_OffsetCurve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_OffsetSurface: declare class GeomBndLib_OffsetSurface

  // GeomBndLib_OffsetSurface.constructor (constructor)
  constructor(theSurf: Geom_OffsetSurface);

  // GeomBndLib_OffsetSurface.Geometry (method)
  Geometry(): Geom_OffsetSurface;

  // GeomBndLib_OffsetSurface.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_OffsetSurface.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_OffsetSurface.delete (method)
  delete(): void;

  // GeomBndLib_OffsetSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_OtherCurve: declare class GeomBndLib_OtherCurve

  // GeomBndLib_OtherCurve.constructor (constructor)
  constructor(theCurve: Adaptor3d_Curve);

  // GeomBndLib_OtherCurve.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_OtherCurve.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_OtherCurve.delete (method)
  delete(): void;

  // GeomBndLib_OtherCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_OtherCurve2d: declare class GeomBndLib_OtherCurve2d

  // GeomBndLib_OtherCurve2d.constructor (constructor)
  constructor(theCurve: Adaptor2d_Curve2d);

  // GeomBndLib_OtherCurve2d.Box (method)
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_OtherCurve2d.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_OtherCurve2d.delete (method)
  delete(): void;

  // GeomBndLib_OtherCurve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_OtherSurface: declare class GeomBndLib_OtherSurface

  // GeomBndLib_OtherSurface.constructor (constructor)
  constructor(theSurf: Adaptor3d_Surface);

  // GeomBndLib_OtherSurface.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_OtherSurface.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_OtherSurface.delete (method)
  delete(): void;

  // GeomBndLib_OtherSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Parabola: declare class GeomBndLib_Parabola

  // GeomBndLib_Parabola.constructor (constructor)
  constructor(theParabola: Geom_Parabola);

  // GeomBndLib_Parabola.Geometry (method)
  Geometry(): Geom_Parabola;

  // GeomBndLib_Parabola.Box (method)
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  static Box(theParab: gp_Parab, theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Parabola.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  // GeomBndLib_Parabola.delete (method)
  delete(): void;

  // GeomBndLib_Parabola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Parabola2d: declare class GeomBndLib_Parabola2d

  // GeomBndLib_Parabola2d.constructor (constructor)
  constructor(theParabola: Geom2d_Parabola);

  // GeomBndLib_Parabola2d.Geometry (method)
  Geometry(): Geom2d_Parabola;

  // GeomBndLib_Parabola2d.Box (method)
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  static Box(theParab: gp_Parab2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Parabola2d.BoxOptimal (method)
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  // GeomBndLib_Parabola2d.delete (method)
  delete(): void;

  // GeomBndLib_Parabola2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Plane: declare class GeomBndLib_Plane

  // GeomBndLib_Plane.constructor (constructor)
  constructor(thePlane: Geom_Plane);

  // GeomBndLib_Plane.Geometry (method)
  Geometry(): Geom_Plane;

  // GeomBndLib_Plane.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_Plane.BoxOptimal (method)
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  // GeomBndLib_Plane.delete (method)
  delete(): void;

  // GeomBndLib_Plane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Sphere: declare class GeomBndLib_Sphere

  // GeomBndLib_Sphere.constructor (constructor)
  constructor(theSurf: Geom_SphericalSurface);

  // GeomBndLib_Sphere.Geometry (method)
  Geometry(): Geom_SphericalSurface;

  // GeomBndLib_Sphere.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_Sphere.BoxOptimal (method)
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  // GeomBndLib_Sphere.delete (method)
  delete(): void;

  // GeomBndLib_Sphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Surface: declare class GeomBndLib_Surface

  // GeomBndLib_Surface.constructor (constructor)
  constructor(theSurf: Adaptor3d_Surface);
  constructor(theSurf: Geom_Surface);

  // GeomBndLib_Surface.GetType (method)
  GetType(): GeomAbs_SurfaceType;

  // GeomBndLib_Surface.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_Surface.BoxOptimal (method)
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_Surface.Add (method)
  Add(theTol: number, theBox: Bnd_Box): void;
  Add(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;

  // GeomBndLib_Surface.AddOptimal (method)
  AddOptimal(theTol: number, theBox: Bnd_Box): void;
  AddOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;

  // GeomBndLib_Surface.delete (method)
  delete(): void;

  // GeomBndLib_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_SurfaceOfExtrusion: declare class GeomBndLib_SurfaceOfExtrusion

  // GeomBndLib_SurfaceOfExtrusion.constructor (constructor)
  constructor(theSurf: Geom_SurfaceOfLinearExtrusion);

  // GeomBndLib_SurfaceOfExtrusion.Geometry (method)
  Geometry(): Geom_SurfaceOfLinearExtrusion;

  // GeomBndLib_SurfaceOfExtrusion.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_SurfaceOfExtrusion.BoxOptimal (method)
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  // GeomBndLib_SurfaceOfExtrusion.delete (method)
  delete(): void;

  // GeomBndLib_SurfaceOfExtrusion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_SurfaceOfRevolution: declare class GeomBndLib_SurfaceOfRevolution

  // GeomBndLib_SurfaceOfRevolution.constructor (constructor)
  constructor(theSurf: Geom_SurfaceOfRevolution);

  // GeomBndLib_SurfaceOfRevolution.Geometry (method)
  Geometry(): Geom_SurfaceOfRevolution;

  // GeomBndLib_SurfaceOfRevolution.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_SurfaceOfRevolution.BoxOptimal (method)
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  // GeomBndLib_SurfaceOfRevolution.delete (method)
  delete(): void;

  // GeomBndLib_SurfaceOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomBndLib_Torus: declare class GeomBndLib_Torus

  // GeomBndLib_Torus.constructor (constructor)
  constructor(theSurf: Geom_ToroidalSurface);

  // GeomBndLib_Torus.Geometry (method)
  Geometry(): Geom_ToroidalSurface;

  // GeomBndLib_Torus.Box (method)
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  // GeomBndLib_Torus.BoxOptimal (method)
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  // GeomBndLib_Torus.delete (method)
  delete(): void;

  // GeomBndLib_Torus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
