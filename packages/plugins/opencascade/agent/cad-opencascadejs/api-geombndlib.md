# libcascade — GeomBndLib

27 top-level symbols. Signatures are verbatim typescript.

// Computes bounding box for a 3D BSpline curve ({@link Geom_BSplineCurve`Geom_BSplineCurve`})
GeomBndLib_BSplineCurve: declare class GeomBndLib_BSplineCurve

constructor

Geometry(): Geom_BSplineCurve;

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Compute precise bounding box using numerical optimization
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 2D BSpline curve ({@link Geom2d_BSplineCurve`Geom2d_BSplineCurve`})
GeomBndLib_BSplineCurve2d: declare class GeomBndLib_BSplineCurve2d

constructor

Geometry(): Geom2d_BSplineCurve;

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Compute precise bounding box using numerical optimization
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a BSpline surface ({@link Geom_BSplineSurface`Geom_BSplineSurface`})
GeomBndLib_BSplineSurface: declare class GeomBndLib_BSplineSurface

constructor

Geometry(): Geom_BSplineSurface;

// Compute bounding box for full surface
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Compute precise bounding box for full surface
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 3D Bezier curve ({@link Geom_BezierCurve`Geom_BezierCurve`})
GeomBndLib_BezierCurve: declare class GeomBndLib_BezierCurve

constructor

Geometry(): Geom_BezierCurve;

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Compute precise bounding box using numerical optimization
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 2D Bezier curve ({@link Geom2d_BezierCurve`Geom2d_BezierCurve`})
GeomBndLib_BezierCurve2d: declare class GeomBndLib_BezierCurve2d

constructor

Geometry(): Geom2d_BezierCurve;

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Compute precise bounding box using numerical optimization
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a Bezier surface ({@link Geom_BezierSurface`Geom_BezierSurface`})
GeomBndLib_BezierSurface: declare class GeomBndLib_BezierSurface

constructor

Geometry(): Geom_BezierSurface;

// Compute bounding box for full surface
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Compute precise bounding box for full surface
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 3D circle ({@link Geom_Circle`Geom_Circle`})
GeomBndLib_Circle: declare class GeomBndLib_Circle

constructor

Geometry(): Geom_Circle;

// Compute bounding box for full circle
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
static Box(theCirc: gp_Circ, theTol: number): Bnd_Box;
static Box(theCirc: gp_Circ, theU1: number, theU2: number, theTol: number): Bnd_Box;
static Box(theCirc: gp_Circ, theTol: number): Bnd_Box;
static Box(theCirc: gp_Circ, theU1: number, theU2: number, theTol: number): Bnd_Box;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 2D circle ({@link Geom2d_Circle`Geom2d_Circle`})
GeomBndLib_Circle2d: declare class GeomBndLib_Circle2d

constructor

Geometry(): Geom2d_Circle;

// Compute bounding box for full circle
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
static Box(theCirc: gp_Circ2d, theTol: number): Bnd_Box2d;
static Box(theCirc: gp_Circ2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;
static Box(theCirc: gp_Circ2d, theTol: number): Bnd_Box2d;
static Box(theCirc: gp_Circ2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a conical surface ({@link Geom_ConicalSurface`Geom_ConicalSurface`})
GeomBndLib_Cone: declare class GeomBndLib_Cone

constructor

Geometry(): Geom_ConicalSurface;

// Compute bounding box for full cone
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// For analytical surfaces, BoxOptimal is same as Box
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Variant-based dispatcher for 3D curve bounding box computation
GeomBndLib_Curve: declare class GeomBndLib_Curve

constructor

// Return detected curve type
GetType(): GeomAbs_CurveType;

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Compute precise bounding box for full curve
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Add bounding box for full curve
Add(theTol: number, theBox: Bnd_Box): void;
Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;
Add(theTol: number, theBox: Bnd_Box): void;
Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;
// theBox: Mutated in place

// Add precise bounding box for full curve
AddOptimal(theTol: number, theBox: Bnd_Box): void;
AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;
AddOptimal(theTol: number, theBox: Bnd_Box): void;
AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box): void;
// theBox: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Variant-based dispatcher for 2D curve bounding box computation
GeomBndLib_Curve2d: declare class GeomBndLib_Curve2d

constructor

// Return detected curve type
GetType(): GeomAbs_CurveType;

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Compute precise bounding box for full curve
BoxOptimal(theTol: number): Bnd_Box2d;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
BoxOptimal(theTol: number): Bnd_Box2d;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Add bounding box for full curve
Add(theTol: number, theBox: Bnd_Box2d): void;
Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;
Add(theTol: number, theBox: Bnd_Box2d): void;
Add(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;
// theBox: Mutated in place

// Add precise bounding box for full curve
AddOptimal(theTol: number, theBox: Bnd_Box2d): void;
AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;
AddOptimal(theTol: number, theBox: Bnd_Box2d): void;
AddOptimal(theU1: number, theU2: number, theTol: number, theBox: Bnd_Box2d): void;
// theBox: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a cylindrical surface ({@link Geom_CylindricalSurface`Geom_CylindricalSurface`})
GeomBndLib_Cylinder: declare class GeomBndLib_Cylinder

constructor

Geometry(): Geom_CylindricalSurface;

// Compute bounding box for full cylinder
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// For analytical surfaces, BoxOptimal is same as Box
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 3D ellipse ({@link Geom_Ellipse`Geom_Ellipse`})
GeomBndLib_Ellipse: declare class GeomBndLib_Ellipse

constructor

Geometry(): Geom_Ellipse;

// Compute bounding box for full ellipse
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
static Box(theElips: gp_Elips, theTol: number): Bnd_Box;
static Box(theElips: gp_Elips, theU1: number, theU2: number, theTol: number): Bnd_Box;
static Box(theElips: gp_Elips, theTol: number): Bnd_Box;
static Box(theElips: gp_Elips, theU1: number, theU2: number, theTol: number): Bnd_Box;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 2D ellipse ({@link Geom2d_Ellipse`Geom2d_Ellipse`})
GeomBndLib_Ellipse2d: declare class GeomBndLib_Ellipse2d

constructor

Geometry(): Geom2d_Ellipse;

// Compute bounding box for full ellipse
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
static Box(theElips: gp_Elips2d, theTol: number): Bnd_Box2d;
static Box(theElips: gp_Elips2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;
static Box(theElips: gp_Elips2d, theTol: number): Bnd_Box2d;
static Box(theElips: gp_Elips2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 3D hyperbola ({@link Geom_Hyperbola`Geom_Hyperbola`})
GeomBndLib_Hyperbola: declare class GeomBndLib_Hyperbola

constructor

Geometry(): Geom_Hyperbola;

// Compute bounding box for arc [theU1, theU2]
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
static Box(theHypr: gp_Hypr, theU1: number, theU2: number, theTol: number): Bnd_Box;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 2D hyperbola ({@link Geom2d_Hyperbola`Geom2d_Hyperbola`})
GeomBndLib_Hyperbola2d: declare class GeomBndLib_Hyperbola2d

constructor

Geometry(): Geom2d_Hyperbola;

// Compute bounding box for arc [theU1, theU2]
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
static Box(theHypr: gp_Hypr2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 3D line ({@link Geom_Line`Geom_Line`})
GeomBndLib_Line: declare class GeomBndLib_Line

constructor

Geometry(): Geom_Line;

// Compute bounding box for line segment [theU1, theU2]
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
static Box(theLin: gp_Lin, theU1: number, theU2: number, theTol: number): Bnd_Box;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 2D line ({@link Geom2d_Line`Geom2d_Line`})
GeomBndLib_Line2d: declare class GeomBndLib_Line2d

constructor

Geometry(): Geom2d_Line;

// Compute bounding box for line segment [theU1, theU2]
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
static Box(theLin: gp_Lin2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 3D offset curve ({@link Geom_OffsetCurve`Geom_OffsetCurve`})
GeomBndLib_OffsetCurve: declare class GeomBndLib_OffsetCurve

constructor

Geometry(): Geom_OffsetCurve;

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Compute precise bounding box for full curve
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 2D offset curve ({@link Geom2d_OffsetCurve`Geom2d_OffsetCurve`})
GeomBndLib_OffsetCurve2d: declare class GeomBndLib_OffsetCurve2d

constructor

Geometry(): Geom2d_OffsetCurve;

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Compute precise bounding box for full curve
BoxOptimal(theTol: number): Bnd_Box2d;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
BoxOptimal(theTol: number): Bnd_Box2d;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for an offset surface ({@link Geom_OffsetSurface`Geom_OffsetSurface`})
GeomBndLib_OffsetSurface: declare class GeomBndLib_OffsetSurface

constructor

Geometry(): Geom_OffsetSurface;

// Compute bounding box for full surface
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Compute precise bounding box for full surface
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a general 3D curve via adaptor
GeomBndLib_OtherCurve: declare class GeomBndLib_OtherCurve

constructor

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Compute precise bounding box for full curve
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a general 2D curve via adaptor
GeomBndLib_OtherCurve2d: declare class GeomBndLib_OtherCurve2d

constructor

// Compute bounding box for full curve
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Compute precise bounding box for full curve
BoxOptimal(theTol: number): Bnd_Box2d;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
BoxOptimal(theTol: number): Bnd_Box2d;
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a general surface via adaptor
GeomBndLib_OtherSurface: declare class GeomBndLib_OtherSurface

constructor

// Compute bounding box for full surface
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Compute precise bounding box for full surface
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 3D parabola ({@link Geom_Parabola`Geom_Parabola`})
GeomBndLib_Parabola: declare class GeomBndLib_Parabola

constructor

Geometry(): Geom_Parabola;

// Compute bounding box for arc [theU1, theU2]
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
static Box(theParab: gp_Parab, theU1: number, theU2: number, theTol: number): Bnd_Box;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 2D parabola ({@link Geom2d_Parabola`Geom2d_Parabola`})
GeomBndLib_Parabola2d: declare class GeomBndLib_Parabola2d

constructor

Geometry(): Geom2d_Parabola;

// Compute bounding box for arc [theU1, theU2]
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
Box(theU1: number, theU2: number, theTol: number): Bnd_Box2d;
Box(theTol: number): Bnd_Box2d;
static Box(theParab: gp_Parab2d, theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// For analytical curves, BoxOptimal is same as Box
BoxOptimal(theU1: number, theU2: number, theTol: number): Bnd_Box2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes bounding box for a 3D plane ({@link Geom_Plane`Geom_Plane`})
GeomBndLib_Plane: declare class GeomBndLib_Plane

constructor

Geometry(): Geom_Plane;

// Compute bounding box for full plane (infinite)
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
Box(theTol: number): Bnd_Box;
Box(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;

// For analytical surfaces, BoxOptimal is same as Box
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;
BoxOptimal(theUMin: number, theUMax: number, theVMin: number, theVMax: number, theTol: number): Bnd_Box;
BoxOptimal(theTol: number): Bnd_Box;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
