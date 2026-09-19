# libcascade — GeomBndLib

32 top-level symbols. Signatures are verbatim typescript.

GeomBndLib_BSplineCurve: declare class GeomBndLib_BSplineCurve

  constructor

  Geometry(): Geom_BSplineCurve;

  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_BSplineCurve2d: declare class GeomBndLib_BSplineCurve2d

  constructor

  Geometry(): Geom2d_BSplineCurve;

  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_BSplineSurface: declare class GeomBndLib_BSplineSurface

  constructor

  Geometry(): Geom_BSplineSurface;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_BezierCurve: declare class GeomBndLib_BezierCurve

  constructor

  Geometry(): Geom_BezierCurve;

  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_BezierCurve2d: declare class GeomBndLib_BezierCurve2d

  constructor

  Geometry(): Geom2d_BezierCurve;

  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_BezierSurface: declare class GeomBndLib_BezierSurface

  constructor

  Geometry(): Geom_BezierSurface;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Circle: declare class GeomBndLib_Circle

  constructor

  Geometry(): Geom_Circle;

  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  static Box(theCirc: gp_Circ, theTol: number): Bnd_Box;
  static Box(theCirc: gp_Circ, theU1: number, theU2: number, theTol: number): Bnd_Box;
  static Box(theCirc: gp_Circ, theTol: number): Bnd_Box;
  static Box(theCirc: gp_Circ, theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Circle2d: declare class GeomBndLib_Circle2d

  constructor

  Geometry(): Geom2d_Circle;

  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  static Box(theCirc: gp_Circ2d, theTol: number): Bnd_Box2d;
  static Box(theCirc: gp_Circ2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  static Box(theCirc: gp_Circ2d, theTol: number): Bnd_Box2d;
  static Box(theCirc: gp_Circ2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Cone: declare class GeomBndLib_Cone

  constructor

  Geometry(): Geom_ConicalSurface;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Curve: declare class GeomBndLib_Curve

  constructor

  GetType(): GeomAbs_CurveType;

  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  Add(theTol: number, theBox: Bnd_Box): void;
  Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;
  Add(theTol: number, theBox: Bnd_Box): void;
  Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;

  AddOptimal(theTol: number, theBox: Bnd_Box): void;
  AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;
  AddOptimal(theTol: number, theBox: Bnd_Box): void;
  AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Curve2d: declare class GeomBndLib_Curve2d

  constructor

  GetType(): GeomAbs_CurveType;

  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  Add(theTol: number, theBox: Bnd_Box2d): void;
  Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;
  Add(theTol: number, theBox: Bnd_Box2d): void;
  Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;

  AddOptimal(theTol: number, theBox: Bnd_Box2d): void;
  AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;
  AddOptimal(theTol: number, theBox: Bnd_Box2d): void;
  AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Cylinder: declare class GeomBndLib_Cylinder

  constructor

  Geometry(): Geom_CylindricalSurface;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Ellipse: declare class GeomBndLib_Ellipse

  constructor

  Geometry(): Geom_Ellipse;

  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  static Box(theElips: gp_Elips, theTol: number): Bnd_Box;
  static Box(theElips: gp_Elips, theU1: number, theU2: number, theTol: number): Bnd_Box;
  static Box(theElips: gp_Elips, theTol: number): Bnd_Box;
  static Box(theElips: gp_Elips, theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Ellipse2d: declare class GeomBndLib_Ellipse2d

  constructor

  Geometry(): Geom2d_Ellipse;

  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  static Box(theElips: gp_Elips2d, theTol: number): Bnd_Box2d;
  static Box(theElips: gp_Elips2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  static Box(theElips: gp_Elips2d, theTol: number): Bnd_Box2d;
  static Box(theElips: gp_Elips2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Hyperbola: declare class GeomBndLib_Hyperbola

  constructor

  Geometry(): Geom_Hyperbola;

  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  static Box(theHypr: gp_Hypr, theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Hyperbola2d: declare class GeomBndLib_Hyperbola2d

  constructor

  Geometry(): Geom2d_Hyperbola;

  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  static Box(theHypr: gp_Hypr2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Line: declare class GeomBndLib_Line

  constructor

  Geometry(): Geom_Line;

  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  static Box(theLin: gp_Lin, theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Line2d: declare class GeomBndLib_Line2d

  constructor

  Geometry(): Geom2d_Line;

  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  static Box(theLin: gp_Lin2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_OffsetCurve: declare class GeomBndLib_OffsetCurve

  constructor

  Geometry(): Geom_OffsetCurve;

  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_OffsetCurve2d: declare class GeomBndLib_OffsetCurve2d

  constructor

  Geometry(): Geom2d_OffsetCurve;

  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_OffsetSurface: declare class GeomBndLib_OffsetSurface

  constructor

  Geometry(): Geom_OffsetSurface;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_OtherCurve: declare class GeomBndLib_OtherCurve

  constructor

  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_OtherCurve2d: declare class GeomBndLib_OtherCurve2d

  constructor

  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  BoxOptimal(theTol: number): Bnd_Box2d;
  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_OtherSurface: declare class GeomBndLib_OtherSurface

  constructor

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Parabola: declare class GeomBndLib_Parabola

  constructor

  Geometry(): Geom_Parabola;

  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  static Box(theParab: gp_Parab, theU1: number, theU2: number, theTol: number): Bnd_Box;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Parabola2d: declare class GeomBndLib_Parabola2d

  constructor

  Geometry(): Geom2d_Parabola;

  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
  Box(theTol: number): Bnd_Box2d;
  static Box(theParab: gp_Parab2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Plane: declare class GeomBndLib_Plane

  constructor

  Geometry(): Geom_Plane;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Sphere: declare class GeomBndLib_Sphere

  constructor

  Geometry(): Geom_SphericalSurface;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Surface: declare class GeomBndLib_Surface

  constructor

  GetType(): GeomAbs_SurfaceType;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  Add(theTol: number, theBox: Bnd_Box): void;
  Add(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;
  Add(theTol: number, theBox: Bnd_Box): void;
  Add(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;

  AddOptimal(theTol: number, theBox: Bnd_Box): void;
  AddOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;
  AddOptimal(theTol: number, theBox: Bnd_Box): void;
  AddOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number, theBox: Bnd_Box): void;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_SurfaceOfExtrusion: declare class GeomBndLib_SurfaceOfExtrusion

  constructor

  Geometry(): Geom_SurfaceOfLinearExtrusion;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_SurfaceOfRevolution: declare class GeomBndLib_SurfaceOfRevolution

  constructor

  Geometry(): Geom_SurfaceOfRevolution;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;

GeomBndLib_Torus: declare class GeomBndLib_Torus

  constructor

  Geometry(): Geom_ToroidalSurface;

  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  Box(theTol: number): Bnd_Box;
  Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;
  BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
  BoxOptimal(theTol: number): Bnd_Box;

  delete(): void;

  [Symbol.dispose](): void;
