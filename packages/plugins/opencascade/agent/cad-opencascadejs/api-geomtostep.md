# libcascade — GeomToStep

33 top-level symbols. Signatures are verbatim typescript.

GeomToStep_MakeAxis1Placement: declare class GeomToStep_MakeAxis1Placement extends GeomToStep_Root

  // GeomToStep_MakeAxis1Placement.constructor (constructor)
  constructor(A: gp_Ax1, theLocalFactors?: StepData_Factors);
  constructor(A: gp_Ax2d, theLocalFactors?: StepData_Factors);
  constructor(A: Geom_Axis1Placement, theLocalFactors?: StepData_Factors);
  constructor(A: Geom2d_AxisPlacement, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeAxis1Placement.Value (method)
  Value(): StepGeom_Axis1Placement;

  // GeomToStep_MakeAxis1Placement.delete (method)
  delete(): void;

  // GeomToStep_MakeAxis1Placement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeAxis2Placement2d: declare class GeomToStep_MakeAxis2Placement2d extends GeomToStep_Root

  // GeomToStep_MakeAxis2Placement2d.constructor (constructor)
  constructor(A: gp_Ax2, theLocalFactors?: StepData_Factors);
  constructor(A: gp_Ax22d, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeAxis2Placement2d.Value (method)
  Value(): StepGeom_Axis2Placement2d;

  // GeomToStep_MakeAxis2Placement2d.delete (method)
  delete(): void;

  // GeomToStep_MakeAxis2Placement2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeAxis2Placement3d: declare class GeomToStep_MakeAxis2Placement3d extends GeomToStep_Root

  // GeomToStep_MakeAxis2Placement3d.constructor (constructor)
  constructor(theLocalFactors?: StepData_Factors);
  constructor(A: gp_Ax2, theLocalFactors?: StepData_Factors);
  constructor(A: gp_Ax3, theLocalFactors?: StepData_Factors);
  constructor(T: gp_Trsf, theLocalFactors?: StepData_Factors);
  constructor(A: Geom_Axis2Placement, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeAxis2Placement3d.Value (method)
  Value(): StepGeom_Axis2Placement3d;

  // GeomToStep_MakeAxis2Placement3d.delete (method)
  delete(): void;

  // GeomToStep_MakeAxis2Placement3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeBSplineCurveWithKnots: declare class GeomToStep_MakeBSplineCurveWithKnots extends GeomToStep_Root

  // GeomToStep_MakeBSplineCurveWithKnots.constructor (constructor)
  constructor(Bsplin: Geom_BSplineCurve, theLocalFactors?: StepData_Factors);
  constructor(Bsplin: Geom2d_BSplineCurve, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeBSplineCurveWithKnots.Value (method)
  Value(): StepGeom_BSplineCurveWithKnots;

  // GeomToStep_MakeBSplineCurveWithKnots.delete (method)
  delete(): void;

  // GeomToStep_MakeBSplineCurveWithKnots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeBSplineCurveWithKnotsAndRationalBSplineCurve: declare class GeomToStep_MakeBSplineCurveWithKnotsAndRationalBSplineCurve extends GeomToStep_Root

  // GeomToStep_MakeBSplineCurveWithKnotsAndRationalBSplineCurve.constructor (constructor)
  constructor(Bsplin: Geom_BSplineCurve, theLocalFactors?: StepData_Factors);
  constructor(Bsplin: Geom2d_BSplineCurve, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeBSplineCurveWithKnotsAndRationalBSplineCurve.Value (method)
  Value(): StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve;

  // GeomToStep_MakeBSplineCurveWithKnotsAndRationalBSplineCurve.delete (method)
  delete(): void;

  // GeomToStep_MakeBSplineCurveWithKnotsAndRationalBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeBSplineSurfaceWithKnots: declare class GeomToStep_MakeBSplineSurfaceWithKnots extends GeomToStep_Root

  // GeomToStep_MakeBSplineSurfaceWithKnots.constructor (constructor)
  constructor(Bsplin: Geom_BSplineSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeBSplineSurfaceWithKnots.Value (method)
  Value(): StepGeom_BSplineSurfaceWithKnots;

  // GeomToStep_MakeBSplineSurfaceWithKnots.delete (method)
  delete(): void;

  // GeomToStep_MakeBSplineSurfaceWithKnots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeBSplineSurfaceWithKnotsAndRationalBSplineSurface: declare class GeomToStep_MakeBSplineSurfaceWithKnotsAndRationalBSplineSurface extends GeomToStep_Root

  // GeomToStep_MakeBSplineSurfaceWithKnotsAndRationalBSplineSurface.constructor (constructor)
  constructor(Bsplin: Geom_BSplineSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeBSplineSurfaceWithKnotsAndRationalBSplineSurface.Value (method)
  Value(): StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface;

  // GeomToStep_MakeBSplineSurfaceWithKnotsAndRationalBSplineSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeBSplineSurfaceWithKnotsAndRationalBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeBoundedCurve: declare class GeomToStep_MakeBoundedCurve extends GeomToStep_Root

  // GeomToStep_MakeBoundedCurve.constructor (constructor)
  constructor(C: Geom_BoundedCurve, theLocalFactors?: StepData_Factors);
  constructor(C: Geom2d_BoundedCurve, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeBoundedCurve.Value (method)
  Value(): StepGeom_BoundedCurve;

  // GeomToStep_MakeBoundedCurve.delete (method)
  delete(): void;

  // GeomToStep_MakeBoundedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeBoundedSurface: declare class GeomToStep_MakeBoundedSurface extends GeomToStep_Root

  // GeomToStep_MakeBoundedSurface.constructor (constructor)
  constructor(C: Geom_BoundedSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeBoundedSurface.Value (method)
  Value(): StepGeom_BoundedSurface;

  // GeomToStep_MakeBoundedSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeBoundedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeCartesianPoint: declare class GeomToStep_MakeCartesianPoint extends GeomToStep_Root

  // GeomToStep_MakeCartesianPoint.constructor (constructor)
  constructor(P: Geom2d_CartesianPoint);
  constructor(P: gp_Pnt, aFactor: number);
  constructor(P: gp_Pnt2d, aFactor: number);
  constructor(P: Geom_CartesianPoint, aFactor: number);

  // GeomToStep_MakeCartesianPoint.Value (method)
  Value(): StepGeom_CartesianPoint;

  // GeomToStep_MakeCartesianPoint.delete (method)
  delete(): void;

  // GeomToStep_MakeCartesianPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeCartesianTransformationOperator: declare class GeomToStep_MakeCartesianTransformationOperator extends GeomToStep_Root

  // GeomToStep_MakeCartesianTransformationOperator.constructor (constructor)
  constructor(theTrsf: gp_Trsf, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeCartesianTransformationOperator.Value (method)
  Value(): StepGeom_CartesianTransformationOperator3d;

  // GeomToStep_MakeCartesianTransformationOperator.delete (method)
  delete(): void;

  // GeomToStep_MakeCartesianTransformationOperator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeCircle: declare class GeomToStep_MakeCircle extends GeomToStep_Root

  // GeomToStep_MakeCircle.constructor (constructor)
  constructor(C: gp_Circ, theLocalFactors?: StepData_Factors);
  constructor(C: Geom_Circle, theLocalFactors?: StepData_Factors);
  constructor(C: Geom2d_Circle, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeCircle.Value (method)
  Value(): StepGeom_Circle;

  // GeomToStep_MakeCircle.delete (method)
  delete(): void;

  // GeomToStep_MakeCircle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeConic: declare class GeomToStep_MakeConic extends GeomToStep_Root

  // GeomToStep_MakeConic.constructor (constructor)
  constructor(C: Geom_Conic, theLocalFactors?: StepData_Factors);
  constructor(C: Geom2d_Conic, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeConic.Value (method)
  Value(): StepGeom_Conic;

  // GeomToStep_MakeConic.delete (method)
  delete(): void;

  // GeomToStep_MakeConic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeConicalSurface: declare class GeomToStep_MakeConicalSurface extends GeomToStep_Root

  // GeomToStep_MakeConicalSurface.constructor (constructor)
  constructor(CSurf: Geom_ConicalSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeConicalSurface.Value (method)
  Value(): StepGeom_ConicalSurface;

  // GeomToStep_MakeConicalSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeConicalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeCurve: declare class GeomToStep_MakeCurve extends GeomToStep_Root

  // GeomToStep_MakeCurve.constructor (constructor)
  constructor(C: Geom_Curve, theLocalFactors?: StepData_Factors);
  constructor(C: Geom2d_Curve, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeCurve.Value (method)
  Value(): StepGeom_Curve;

  // GeomToStep_MakeCurve.delete (method)
  delete(): void;

  // GeomToStep_MakeCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeCylindricalSurface: declare class GeomToStep_MakeCylindricalSurface extends GeomToStep_Root

  // GeomToStep_MakeCylindricalSurface.constructor (constructor)
  constructor(CSurf: Geom_CylindricalSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeCylindricalSurface.Value (method)
  Value(): StepGeom_CylindricalSurface;

  // GeomToStep_MakeCylindricalSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeCylindricalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeDirection: declare class GeomToStep_MakeDirection extends GeomToStep_Root

  // GeomToStep_MakeDirection.constructor (constructor)
  constructor(D: gp_Dir);
  constructor(D: gp_Dir2d);
  constructor(D: Geom_Direction);
  constructor(D: Geom2d_Direction);

  // GeomToStep_MakeDirection.Value (method)
  Value(): StepGeom_Direction;

  // GeomToStep_MakeDirection.delete (method)
  delete(): void;

  // GeomToStep_MakeDirection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeElementarySurface: declare class GeomToStep_MakeElementarySurface extends GeomToStep_Root

  // GeomToStep_MakeElementarySurface.constructor (constructor)
  constructor(S: Geom_ElementarySurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeElementarySurface.Value (method)
  Value(): StepGeom_ElementarySurface;

  // GeomToStep_MakeElementarySurface.delete (method)
  delete(): void;

  // GeomToStep_MakeElementarySurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeEllipse: declare class GeomToStep_MakeEllipse extends GeomToStep_Root

  // GeomToStep_MakeEllipse.constructor (constructor)
  constructor(C: gp_Elips, theLocalFactors?: StepData_Factors);
  constructor(C: Geom_Ellipse, theLocalFactors?: StepData_Factors);
  constructor(C: Geom2d_Ellipse, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeEllipse.Value (method)
  Value(): StepGeom_Ellipse;

  // GeomToStep_MakeEllipse.delete (method)
  delete(): void;

  // GeomToStep_MakeEllipse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeHyperbola: declare class GeomToStep_MakeHyperbola extends GeomToStep_Root

  // GeomToStep_MakeHyperbola.constructor (constructor)
  constructor(C: Geom2d_Hyperbola, theLocalFactors?: StepData_Factors);
  constructor(C: Geom_Hyperbola, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeHyperbola.Value (method)
  Value(): StepGeom_Hyperbola;

  // GeomToStep_MakeHyperbola.delete (method)
  delete(): void;

  // GeomToStep_MakeHyperbola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeLine: declare class GeomToStep_MakeLine extends GeomToStep_Root

  // GeomToStep_MakeLine.constructor (constructor)
  constructor(L: gp_Lin, theLocalFactors?: StepData_Factors);
  constructor(L: gp_Lin2d, theLocalFactors?: StepData_Factors);
  constructor(C: Geom_Line, theLocalFactors?: StepData_Factors);
  constructor(C: Geom2d_Line, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeLine.Value (method)
  Value(): StepGeom_Line;

  // GeomToStep_MakeLine.delete (method)
  delete(): void;

  // GeomToStep_MakeLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeParabola: declare class GeomToStep_MakeParabola extends GeomToStep_Root

  // GeomToStep_MakeParabola.constructor (constructor)
  constructor(C: Geom2d_Parabola, theLocalFactors?: StepData_Factors);
  constructor(C: Geom_Parabola, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeParabola.Value (method)
  Value(): StepGeom_Parabola;

  // GeomToStep_MakeParabola.delete (method)
  delete(): void;

  // GeomToStep_MakeParabola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakePlane: declare class GeomToStep_MakePlane extends GeomToStep_Root

  // GeomToStep_MakePlane.constructor (constructor)
  constructor(P: gp_Pln, theLocalFactors?: StepData_Factors);
  constructor(P: Geom_Plane, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakePlane.Value (method)
  Value(): StepGeom_Plane;

  // GeomToStep_MakePlane.delete (method)
  delete(): void;

  // GeomToStep_MakePlane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakePolyline: declare class GeomToStep_MakePolyline extends GeomToStep_Root

  // GeomToStep_MakePolyline.constructor (constructor)
  constructor(P: NCollection_Array1_gp_Pnt, theLocalFactors?: StepData_Factors);
  constructor(P: NCollection_Array1_gp_Pnt2d, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakePolyline.Value (method)
  Value(): StepGeom_Polyline;

  // GeomToStep_MakePolyline.delete (method)
  delete(): void;

  // GeomToStep_MakePolyline.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeRectangularTrimmedSurface: declare class GeomToStep_MakeRectangularTrimmedSurface extends GeomToStep_Root

  // GeomToStep_MakeRectangularTrimmedSurface.constructor (constructor)
  constructor(RTSurf: Geom_RectangularTrimmedSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeRectangularTrimmedSurface.Value (method)
  Value(): StepGeom_RectangularTrimmedSurface;

  // GeomToStep_MakeRectangularTrimmedSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeRectangularTrimmedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeSphericalSurface: declare class GeomToStep_MakeSphericalSurface extends GeomToStep_Root

  // GeomToStep_MakeSphericalSurface.constructor (constructor)
  constructor(CSurf: Geom_SphericalSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeSphericalSurface.Value (method)
  Value(): StepGeom_SphericalSurface;

  // GeomToStep_MakeSphericalSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeSphericalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeSurface: declare class GeomToStep_MakeSurface extends GeomToStep_Root

  // GeomToStep_MakeSurface.constructor (constructor)
  constructor(C: Geom_Surface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeSurface.Value (method)
  Value(): StepGeom_Surface;

  // GeomToStep_MakeSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeSurfaceOfLinearExtrusion: declare class GeomToStep_MakeSurfaceOfLinearExtrusion extends GeomToStep_Root

  // GeomToStep_MakeSurfaceOfLinearExtrusion.constructor (constructor)
  constructor(CSurf: Geom_SurfaceOfLinearExtrusion, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeSurfaceOfLinearExtrusion.Value (method)
  Value(): StepGeom_SurfaceOfLinearExtrusion;

  // GeomToStep_MakeSurfaceOfLinearExtrusion.delete (method)
  delete(): void;

  // GeomToStep_MakeSurfaceOfLinearExtrusion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeSurfaceOfRevolution: declare class GeomToStep_MakeSurfaceOfRevolution extends GeomToStep_Root

  // GeomToStep_MakeSurfaceOfRevolution.constructor (constructor)
  constructor(RevSurf: Geom_SurfaceOfRevolution, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeSurfaceOfRevolution.Value (method)
  Value(): StepGeom_SurfaceOfRevolution;

  // GeomToStep_MakeSurfaceOfRevolution.delete (method)
  delete(): void;

  // GeomToStep_MakeSurfaceOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeSweptSurface: declare class GeomToStep_MakeSweptSurface extends GeomToStep_Root

  // GeomToStep_MakeSweptSurface.constructor (constructor)
  constructor(S: Geom_SweptSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeSweptSurface.Value (method)
  Value(): StepGeom_SweptSurface;

  // GeomToStep_MakeSweptSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeSweptSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeToroidalSurface: declare class GeomToStep_MakeToroidalSurface extends GeomToStep_Root

  // GeomToStep_MakeToroidalSurface.constructor (constructor)
  constructor(TorSurf: Geom_ToroidalSurface, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeToroidalSurface.Value (method)
  Value(): StepGeom_ToroidalSurface;

  // GeomToStep_MakeToroidalSurface.delete (method)
  delete(): void;

  // GeomToStep_MakeToroidalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_MakeVector: declare class GeomToStep_MakeVector extends GeomToStep_Root

  // GeomToStep_MakeVector.constructor (constructor)
  constructor(V: gp_Vec, theLocalFactors?: StepData_Factors);
  constructor(V: gp_Vec2d, theLocalFactors?: StepData_Factors);
  constructor(V: Geom_Vector, theLocalFactors?: StepData_Factors);
  constructor(V: Geom2d_Vector, theLocalFactors?: StepData_Factors);

  // GeomToStep_MakeVector.Value (method)
  Value(): StepGeom_Vector;

  // GeomToStep_MakeVector.delete (method)
  delete(): void;

  // GeomToStep_MakeVector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToStep_Root: declare class GeomToStep_Root

  // GeomToStep_Root.constructor (constructor)
  constructor();

  // GeomToStep_Root.IsDone (method)
  IsDone(): boolean;

  // GeomToStep_Root.delete (method)
  delete(): void;

  // GeomToStep_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
