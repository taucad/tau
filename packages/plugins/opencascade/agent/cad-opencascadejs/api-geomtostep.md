# libcascade — GeomToStep

33 top-level symbols. Signatures are verbatim typescript.

// This class implements the mapping between classes Axis1Placement from Geom and Ax1 from gp, and the class Axis1Placement from StepGeom which describes an Axis1Placement from Prostep
GeomToStep_MakeAxis1Placement: declare class GeomToStep_MakeAxis1Placement extends GeomToStep_Root

constructor

Value(): StepGeom_Axis1Placement;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Axis2Placement from Geom and Ax2, Ax22d from gp, and the class Axis2Placement2d from StepGeom which describes an axis2_placement_2d from Prostep
GeomToStep_MakeAxis2Placement2d: declare class GeomToStep_MakeAxis2Placement2d extends GeomToStep_Root

constructor

Value(): StepGeom_Axis2Placement2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Axis2Placement from Geom and Ax2, Ax3 from gp, and the class Axis2Placement3d from StepGeom which describes an axis2_placement_3d from Prostep
GeomToStep_MakeAxis2Placement3d: declare class GeomToStep_MakeAxis2Placement3d extends GeomToStep_Root

constructor

Value(): StepGeom_Axis2Placement3d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes BSplineCurve from Geom, Geom2d and the class BSplineCurveWithKnots from StepGeom which describes a bspline_curve_with_knots from Prostep
GeomToStep_MakeBSplineCurveWithKnots: declare class GeomToStep_MakeBSplineCurveWithKnots extends GeomToStep_Root

constructor

Value(): StepGeom_BSplineCurveWithKnots;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes BSplineCurve from Geom, Geom2d and the class BSplineCurveWithKnotsAndRationalBSplineCurve from StepGeom which describes a rational_bspline_curve_with_knots from Prostep
GeomToStep_MakeBSplineCurveWithKnotsAndRationalBSplineCurve: declare class GeomToStep_MakeBSplineCurveWithKnotsAndRationalBSplineCurve extends GeomToStep_Root

constructor

Value(): StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class BSplineSurface from Geom and the class BSplineSurfaceWithKnots from StepGeom which describes a bspline_Surface_with_knots from Prostep
GeomToStep_MakeBSplineSurfaceWithKnots: declare class GeomToStep_MakeBSplineSurfaceWithKnots extends GeomToStep_Root

constructor

Value(): StepGeom_BSplineSurfaceWithKnots;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class BSplineSurface from Geom and the class BSplineSurfaceWithKnotsAndRationalBSplineSurface from StepGeom which describes a rational_bspline_Surface_with_knots from Prostep
GeomToStep_MakeBSplineSurfaceWithKnotsAndRationalBSplineSurface: declare class GeomToStep_MakeBSplineSurfaceWithKnotsAndRationalBSplineSurface extends GeomToStep_Root

constructor

Value(): StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes BoundedCurve from Geom, Geom2d and the class BoundedCurve from StepGeom which describes a BoundedCurve from prostep
GeomToStep_MakeBoundedCurve: declare class GeomToStep_MakeBoundedCurve extends GeomToStep_Root

constructor

Value(): StepGeom_BoundedCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes BoundedSurface from Geom and the class BoundedSurface from StepGeom which describes a BoundedSurface from prostep
GeomToStep_MakeBoundedSurface: declare class GeomToStep_MakeBoundedSurface extends GeomToStep_Root

constructor

Value(): StepGeom_BoundedSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes CartesianPoint from Geom and Pnt from gp, and the class CartesianPoint from StepGeom which describes a point from Prostep
GeomToStep_MakeCartesianPoint: declare class GeomToStep_MakeCartesianPoint extends GeomToStep_Root

constructor

Value(): StepGeom_CartesianPoint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class creates a cartesian_transformation_operator from {@link gp_Trsf`gp_Trsf`}
GeomToStep_MakeCartesianTransformationOperator: declare class GeomToStep_MakeCartesianTransformationOperator extends GeomToStep_Root

constructor

// Returns the created entity
Value(): StepGeom_CartesianTransformationOperator3d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Circle from Geom, and Circ from gp, and the class Circle from StepGeom which describes a circle from Prostep
GeomToStep_MakeCircle: declare class GeomToStep_MakeCircle extends GeomToStep_Root

constructor

Value(): StepGeom_Circle;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Conic from Geom and the class Conic from StepGeom which describes a Conic from prostep
GeomToStep_MakeConic: declare class GeomToStep_MakeConic extends GeomToStep_Root

constructor

Value(): StepGeom_Conic;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class ConicalSurface from Geom and the class ConicalSurface from StepGeom which describes a conical_surface from Prostep
GeomToStep_MakeConicalSurface: declare class GeomToStep_MakeConicalSurface extends GeomToStep_Root

constructor

Value(): StepGeom_ConicalSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Curve from Geom and the class Curve from StepGeom which describes a Curve from prostep
GeomToStep_MakeCurve: declare class GeomToStep_MakeCurve extends GeomToStep_Root

constructor

Value(): StepGeom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class CylindricalSurface from Geom and the class CylindricalSurface from StepGeom which describes a cylindrical_surface from Prostep
GeomToStep_MakeCylindricalSurface: declare class GeomToStep_MakeCylindricalSurface extends GeomToStep_Root

constructor

Value(): StepGeom_CylindricalSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Direction from Geom, Geom2d and Dir, Dir2d from gp, and the class Direction from StepGeom which describes a direction from Prostep
GeomToStep_MakeDirection: declare class GeomToStep_MakeDirection extends GeomToStep_Root

constructor

Value(): StepGeom_Direction;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes ElementarySurface from Geom and the class ElementarySurface from StepGeom which describes a ElementarySurface from prostep
GeomToStep_MakeElementarySurface: declare class GeomToStep_MakeElementarySurface extends GeomToStep_Root

constructor

Value(): StepGeom_ElementarySurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Ellipse from Geom, and Circ from gp, and the class Ellipse from StepGeom which describes a Ellipse from Prostep
GeomToStep_MakeEllipse: declare class GeomToStep_MakeEllipse extends GeomToStep_Root

constructor

Value(): StepGeom_Ellipse;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between the class Hyperbola from Geom and the class Hyperbola from StepGeom which describes a Hyperbola from ProSTEP
GeomToStep_MakeHyperbola: declare class GeomToStep_MakeHyperbola extends GeomToStep_Root

constructor

Value(): StepGeom_Hyperbola;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Line from Geom and Lin from gp, and the class Line from StepGeom which describes a line from Prostep
GeomToStep_MakeLine: declare class GeomToStep_MakeLine extends GeomToStep_Root

constructor

Value(): StepGeom_Line;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between the class Parabola from Geom and the class Parabola from StepGeom which describes a Parabola from ProSTEP
GeomToStep_MakeParabola: declare class GeomToStep_MakeParabola extends GeomToStep_Root

constructor

Value(): StepGeom_Parabola;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Plane from Geom and Pln from gp, and the class Plane from StepGeom which describes a plane from Prostep
GeomToStep_MakePlane: declare class GeomToStep_MakePlane extends GeomToStep_Root

constructor

Value(): StepGeom_Plane;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between an Array1 of points from gp and a Polyline from StepGeom
GeomToStep_MakePolyline: declare class GeomToStep_MakePolyline extends GeomToStep_Root

constructor

Value(): StepGeom_Polyline;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class RectangularTrimmedSurface from Geom and the class RectangularTrimmedSurface from StepGeom which describes a rectangular_trimmed_surface from ISO-IS 10303-42
GeomToStep_MakeRectangularTrimmedSurface: declare class GeomToStep_MakeRectangularTrimmedSurface extends GeomToStep_Root

constructor

Value(): StepGeom_RectangularTrimmedSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class SphericalSurface from Geom and the class SphericalSurface from StepGeom which describes a spherical_surface from Prostep
GeomToStep_MakeSphericalSurface: declare class GeomToStep_MakeSphericalSurface extends GeomToStep_Root

constructor

Value(): StepGeom_SphericalSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Surface from Geom and the class Surface from StepGeom which describes a Surface from prostep
GeomToStep_MakeSurface: declare class GeomToStep_MakeSurface extends GeomToStep_Root

constructor

Value(): StepGeom_Surface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class SurfaceOfLinearExtrusion from Geom and the class SurfaceOfLinearExtrusion from StepGeom which describes a surface_of_linear_extrusion from Prostep
GeomToStep_MakeSurfaceOfLinearExtrusion: declare class GeomToStep_MakeSurfaceOfLinearExtrusion extends GeomToStep_Root

constructor

Value(): StepGeom_SurfaceOfLinearExtrusion;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class SurfaceOfRevolution from Geom and the class SurfaceOfRevolution from StepGeom which describes a surface_of_revolution from Prostep
GeomToStep_MakeSurfaceOfRevolution: declare class GeomToStep_MakeSurfaceOfRevolution extends GeomToStep_Root

constructor

Value(): StepGeom_SurfaceOfRevolution;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes SweptSurface from Geom and the class SweptSurface from StepGeom which describes a SweptSurface from prostep
GeomToStep_MakeSweptSurface: declare class GeomToStep_MakeSweptSurface extends GeomToStep_Root

constructor

Value(): StepGeom_SweptSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between class ToroidalSurface from Geom and the class ToroidalSurface from StepGeom which describes a toroidal_surface from Prostep
GeomToStep_MakeToroidalSurface: declare class GeomToStep_MakeToroidalSurface extends GeomToStep_Root

constructor

Value(): StepGeom_ToroidalSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the mapping between classes Vector from Geom, Geom2d and Vec, Vec2d from gp, and the class Vector from StepGeom which describes a Vector from Prostep
GeomToStep_MakeVector: declare class GeomToStep_MakeVector extends GeomToStep_Root

constructor

Value(): StepGeom_Vector;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the common services for all classes of GeomToStep which report error
GeomToStep_Root: declare class GeomToStep_Root

constructor

IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
