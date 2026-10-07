# libcascade — StepToGeom

1 top-level symbols. Signatures are verbatim typescript.

StepToGeom: declare class StepToGeom

  // StepToGeom.constructor (constructor)
  constructor();

  // StepToGeom.MakeAxis1Placement (method)
  static MakeAxis1Placement(SA: StepGeom_Axis1Placement, theLocalFactors?: StepData_Factors): Geom_Axis1Placement;

  // StepToGeom.MakeAxis2Placement (method)
  static MakeAxis2Placement(SA: StepGeom_Axis2Placement3d, theLocalFactors: StepData_Factors): Geom_Axis2Placement;
  static MakeAxis2Placement(SP: StepGeom_SuParameters): Geom_Axis2Placement;

  // StepToGeom.MakeAxisPlacement (method)
  static MakeAxisPlacement(SA: StepGeom_Axis2Placement2d, theLocalFactors?: StepData_Factors): Geom2d_AxisPlacement;

  // StepToGeom.MakeBoundedCurve (method)
  static MakeBoundedCurve(SC: StepGeom_BoundedCurve, theLocalFactors?: StepData_Factors): Geom_BoundedCurve;

  // StepToGeom.MakeBoundedCurve2d (method)
  static MakeBoundedCurve2d(SC: StepGeom_BoundedCurve, theLocalFactors?: StepData_Factors): Geom2d_BoundedCurve;

  // StepToGeom.MakeBoundedSurface (method)
  static MakeBoundedSurface(SS: StepGeom_BoundedSurface, theLocalFactors?: StepData_Factors): Geom_BoundedSurface;

  // StepToGeom.MakeBSplineCurve (method)
  static MakeBSplineCurve(SC: StepGeom_BSplineCurve, theLocalFactors?: StepData_Factors): Geom_BSplineCurve;

  // StepToGeom.MakeBSplineCurve2d (method)
  static MakeBSplineCurve2d(SC: StepGeom_BSplineCurve, theLocalFactors?: StepData_Factors): Geom2d_BSplineCurve;

  // StepToGeom.MakeBSplineSurface (method)
  static MakeBSplineSurface(SS: StepGeom_BSplineSurface, theLocalFactors?: StepData_Factors): Geom_BSplineSurface;

  // StepToGeom.MakeCartesianPoint (method)
  static MakeCartesianPoint(SP: StepGeom_CartesianPoint, theLocalFactors?: StepData_Factors): Geom_CartesianPoint;

  // StepToGeom.MakeCartesianPoint2d (method)
  static MakeCartesianPoint2d(SP: StepGeom_CartesianPoint, theLocalFactors?: StepData_Factors): Geom2d_CartesianPoint;

  // StepToGeom.MakeCircle (method)
  static MakeCircle(SC: StepGeom_Circle, theLocalFactors?: StepData_Factors): Geom_Circle;

  // StepToGeom.MakeCircle2d (method)
  static MakeCircle2d(SC: StepGeom_Circle, theLocalFactors?: StepData_Factors): Geom2d_Circle;

  // StepToGeom.MakeConic (method)
  static MakeConic(SC: StepGeom_Conic, theLocalFactors?: StepData_Factors): Geom_Conic;

  // StepToGeom.MakeConic2d (method)
  static MakeConic2d(SC: StepGeom_Conic, theLocalFactors?: StepData_Factors): Geom2d_Conic;

  // StepToGeom.MakeConicalSurface (method)
  static MakeConicalSurface(SS: StepGeom_ConicalSurface, theLocalFactors?: StepData_Factors): Geom_ConicalSurface;

  // StepToGeom.MakeCurve (method)
  static MakeCurve(SC: StepGeom_Curve, theLocalFactors?: StepData_Factors): Geom_Curve;

  // StepToGeom.MakeCurve2d (method)
  static MakeCurve2d(SC: StepGeom_Curve, theLocalFactors?: StepData_Factors): Geom2d_Curve;

  // StepToGeom.MakeCylindricalSurface (method)
  static MakeCylindricalSurface(SS: StepGeom_CylindricalSurface, theLocalFactors?: StepData_Factors): Geom_CylindricalSurface;

  // StepToGeom.MakeDirection (method)
  static MakeDirection(SD: StepGeom_Direction): Geom_Direction;

  // StepToGeom.MakeDirection2d (method)
  static MakeDirection2d(SD: StepGeom_Direction): Geom2d_Direction;

  // StepToGeom.MakeElementarySurface (method)
  static MakeElementarySurface(SS: StepGeom_ElementarySurface, theLocalFactors?: StepData_Factors): Geom_ElementarySurface;

  // StepToGeom.MakeEllipse (method)
  static MakeEllipse(SC: StepGeom_Ellipse, theLocalFactors?: StepData_Factors): Geom_Ellipse;

  // StepToGeom.MakeEllipse2d (method)
  static MakeEllipse2d(SC: StepGeom_Ellipse, theLocalFactors?: StepData_Factors): Geom2d_Ellipse;

  // StepToGeom.MakeHyperbola (method)
  static MakeHyperbola(SC: StepGeom_Hyperbola, theLocalFactors?: StepData_Factors): Geom_Hyperbola;

  // StepToGeom.MakeHyperbola2d (method)
  static MakeHyperbola2d(SC: StepGeom_Hyperbola, theLocalFactors?: StepData_Factors): Geom2d_Hyperbola;

  // StepToGeom.MakeLine (method)
  static MakeLine(SC: StepGeom_Line, theLocalFactors?: StepData_Factors): Geom_Line;

  // StepToGeom.MakeLine2d (method)
  static MakeLine2d(SC: StepGeom_Line, theLocalFactors?: StepData_Factors): Geom2d_Line;

  // StepToGeom.MakeParabola (method)
  static MakeParabola(SC: StepGeom_Parabola, theLocalFactors?: StepData_Factors): Geom_Parabola;

  // StepToGeom.MakeParabola2d (method)
  static MakeParabola2d(SC: StepGeom_Parabola, theLocalFactors?: StepData_Factors): Geom2d_Parabola;

  // StepToGeom.MakePlane (method)
  static MakePlane(SP: StepGeom_Plane, theLocalFactors?: StepData_Factors): Geom_Plane;

  // StepToGeom.MakePolyline (method)
  static MakePolyline(SPL: StepGeom_Polyline, theLocalFactors?: StepData_Factors): Geom_BSplineCurve;

  // StepToGeom.MakePolyline2d (method)
  static MakePolyline2d(SPL: StepGeom_Polyline, theLocalFactors?: StepData_Factors): Geom2d_BSplineCurve;

  // StepToGeom.MakeRectangularTrimmedSurface (method)
  static MakeRectangularTrimmedSurface(SS: StepGeom_RectangularTrimmedSurface, theLocalFactors?: StepData_Factors): Geom_RectangularTrimmedSurface;

  // StepToGeom.MakeSphericalSurface (method)
  static MakeSphericalSurface(SS: StepGeom_SphericalSurface, theLocalFactors?: StepData_Factors): Geom_SphericalSurface;

  // StepToGeom.MakeSurface (method)
  static MakeSurface(SS: StepGeom_Surface, theLocalFactors?: StepData_Factors): Geom_Surface;

  // StepToGeom.MakeSurfaceOfLinearExtrusion (method)
  static MakeSurfaceOfLinearExtrusion(SS: StepGeom_SurfaceOfLinearExtrusion, theLocalFactors?: StepData_Factors): Geom_SurfaceOfLinearExtrusion;

  // StepToGeom.MakeSurfaceOfRevolution (method)
  static MakeSurfaceOfRevolution(SS: StepGeom_SurfaceOfRevolution, theLocalFactors?: StepData_Factors): Geom_SurfaceOfRevolution;

  // StepToGeom.MakeSweptSurface (method)
  static MakeSweptSurface(SS: StepGeom_SweptSurface, theLocalFactors?: StepData_Factors): Geom_SweptSurface;

  // StepToGeom.MakeToroidalSurface (method)
  static MakeToroidalSurface(SS: StepGeom_ToroidalSurface, theLocalFactors?: StepData_Factors): Geom_ToroidalSurface;

  // StepToGeom.MakeTransformation2d (method)
  static MakeTransformation2d(SCTO: StepGeom_CartesianTransformationOperator2d, CT: gp_Trsf2d, theLocalFactors: StepData_Factors): boolean;

  // StepToGeom.MakeTransformation3d (method)
  static MakeTransformation3d(SCTO: StepGeom_CartesianTransformationOperator3d, CT: gp_Trsf, theLocalFactors: StepData_Factors): boolean;

  // StepToGeom.MakeTrimmedCurve (method)
  static MakeTrimmedCurve(SC: StepGeom_TrimmedCurve, theLocalFactors?: StepData_Factors): Geom_TrimmedCurve;

  // StepToGeom.MakeTrimmedCurve2d (method)
  static MakeTrimmedCurve2d(SC: StepGeom_TrimmedCurve, theLocalFactors?: StepData_Factors): Geom2d_BSplineCurve;

  // StepToGeom.MakeVectorWithMagnitude (method)
  static MakeVectorWithMagnitude(SV: StepGeom_Vector, theLocalFactors?: StepData_Factors): Geom_VectorWithMagnitude;

  // StepToGeom.MakeVectorWithMagnitude2d (method)
  static MakeVectorWithMagnitude2d(SV: StepGeom_Vector): Geom2d_VectorWithMagnitude;

  // StepToGeom.MakeYprRotation (method)
  static MakeYprRotation(SR: StepKinematics_SpatialRotation, theCntxt: StepRepr_GlobalUnitAssignedContext): NCollection_HArray1_double;

  // StepToGeom.delete (method)
  delete(): void;

  // StepToGeom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
