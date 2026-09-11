# libcascade — StepToGeom

1 top-level symbols. Signatures are verbatim typescript.

StepToGeom: declare class StepToGeom

constructor

static MakeAxis1Placement(SA: StepGeom_Axis1Placement, theLocalFactors?: StepData_Factors): Geom_Axis1Placement;

static MakeAxis2Placement(SA: StepGeom_Axis2Placement3d, theLocalFactors: StepData_Factors): Geom_Axis2Placement;
static MakeAxis2Placement(SP: StepGeom_SuParameters): Geom_Axis2Placement;
static MakeAxis2Placement(SA: StepGeom_Axis2Placement3d, theLocalFactors: StepData_Factors): Geom_Axis2Placement;
static MakeAxis2Placement(SP: StepGeom_SuParameters): Geom_Axis2Placement;

static MakeAxisPlacement(SA: StepGeom_Axis2Placement2d, theLocalFactors?: StepData_Factors): Geom2d_AxisPlacement;

static MakeBoundedCurve(SC: StepGeom_BoundedCurve, theLocalFactors?: StepData_Factors): Geom_BoundedCurve;

static MakeBoundedCurve2d(SC: StepGeom_BoundedCurve, theLocalFactors?: StepData_Factors): Geom2d_BoundedCurve;

static MakeBoundedSurface(SS: StepGeom_BoundedSurface, theLocalFactors?: StepData_Factors): Geom_BoundedSurface;

static MakeBSplineCurve(SC: StepGeom_BSplineCurve, theLocalFactors?: StepData_Factors): Geom_BSplineCurve;

static MakeBSplineCurve2d(SC: StepGeom_BSplineCurve, theLocalFactors?: StepData_Factors): Geom2d_BSplineCurve;

static MakeBSplineSurface(SS: StepGeom_BSplineSurface, theLocalFactors?: StepData_Factors): Geom_BSplineSurface;

static MakeCartesianPoint(SP: StepGeom_CartesianPoint, theLocalFactors?: StepData_Factors): Geom_CartesianPoint;

static MakeCartesianPoint2d(SP: StepGeom_CartesianPoint, theLocalFactors?: StepData_Factors): Geom2d_CartesianPoint;

static MakeCircle(SC: StepGeom_Circle, theLocalFactors?: StepData_Factors): Geom_Circle;

static MakeCircle2d(SC: StepGeom_Circle, theLocalFactors?: StepData_Factors): Geom2d_Circle;

static MakeConic(SC: StepGeom_Conic, theLocalFactors?: StepData_Factors): Geom_Conic;

static MakeConic2d(SC: StepGeom_Conic, theLocalFactors?: StepData_Factors): Geom2d_Conic;

static MakeConicalSurface(SS: StepGeom_ConicalSurface, theLocalFactors?: StepData_Factors): Geom_ConicalSurface;

static MakeCurve(SC: StepGeom_Curve, theLocalFactors?: StepData_Factors): Geom_Curve;

static MakeCurve2d(SC: StepGeom_Curve, theLocalFactors?: StepData_Factors): Geom2d_Curve;

static MakeCylindricalSurface(SS: StepGeom_CylindricalSurface, theLocalFactors?: StepData_Factors): Geom_CylindricalSurface;

static MakeDirection(SD: StepGeom_Direction): Geom_Direction;

static MakeDirection2d(SD: StepGeom_Direction): Geom2d_Direction;

static MakeElementarySurface(SS: StepGeom_ElementarySurface, theLocalFactors?: StepData_Factors): Geom_ElementarySurface;

static MakeEllipse(SC: StepGeom_Ellipse, theLocalFactors?: StepData_Factors): Geom_Ellipse;

static MakeEllipse2d(SC: StepGeom_Ellipse, theLocalFactors?: StepData_Factors): Geom2d_Ellipse;

static MakeHyperbola(SC: StepGeom_Hyperbola, theLocalFactors?: StepData_Factors): Geom_Hyperbola;

static MakeHyperbola2d(SC: StepGeom_Hyperbola, theLocalFactors?: StepData_Factors): Geom2d_Hyperbola;

static MakeLine(SC: StepGeom_Line, theLocalFactors?: StepData_Factors): Geom_Line;

static MakeLine2d(SC: StepGeom_Line, theLocalFactors?: StepData_Factors): Geom2d_Line;

static MakeParabola(SC: StepGeom_Parabola, theLocalFactors?: StepData_Factors): Geom_Parabola;

static MakeParabola2d(SC: StepGeom_Parabola, theLocalFactors?: StepData_Factors): Geom2d_Parabola;

static MakePlane(SP: StepGeom_Plane, theLocalFactors?: StepData_Factors): Geom_Plane;

static MakePolyline(SPL: StepGeom_Polyline, theLocalFactors?: StepData_Factors): Geom_BSplineCurve;

static MakePolyline2d(SPL: StepGeom_Polyline, theLocalFactors?: StepData_Factors): Geom2d_BSplineCurve;

static MakeRectangularTrimmedSurface(SS: StepGeom_RectangularTrimmedSurface, theLocalFactors?: StepData_Factors): Geom_RectangularTrimmedSurface;

static MakeSphericalSurface(SS: StepGeom_SphericalSurface, theLocalFactors?: StepData_Factors): Geom_SphericalSurface;

static MakeSurface(SS: StepGeom_Surface, theLocalFactors?: StepData_Factors): Geom_Surface;

static MakeSurfaceOfLinearExtrusion(SS: StepGeom_SurfaceOfLinearExtrusion, theLocalFactors?: StepData_Factors): Geom_SurfaceOfLinearExtrusion;

static MakeSurfaceOfRevolution(SS: StepGeom_SurfaceOfRevolution, theLocalFactors?: StepData_Factors): Geom_SurfaceOfRevolution;

static MakeSweptSurface(SS: StepGeom_SweptSurface, theLocalFactors?: StepData_Factors): Geom_SweptSurface;

static MakeToroidalSurface(SS: StepGeom_ToroidalSurface, theLocalFactors?: StepData_Factors): Geom_ToroidalSurface;

static MakeTransformation2d(SCTO: StepGeom_CartesianTransformationOperator2d, CT: gp_Trsf2d, theLocalFactors: StepData_Factors): boolean;

static MakeTransformation3d(SCTO: StepGeom_CartesianTransformationOperator3d, CT: gp_Trsf, theLocalFactors: StepData_Factors): boolean;

static MakeTrimmedCurve(SC: StepGeom_TrimmedCurve, theLocalFactors?: StepData_Factors): Geom_TrimmedCurve;

static MakeTrimmedCurve2d(SC: StepGeom_TrimmedCurve, theLocalFactors?: StepData_Factors): Geom2d_BSplineCurve;

static MakeVectorWithMagnitude(SV: StepGeom_Vector, theLocalFactors?: StepData_Factors): Geom_VectorWithMagnitude;

static MakeVectorWithMagnitude2d(SV: StepGeom_Vector): Geom2d_VectorWithMagnitude;

static MakeYprRotation(SR: StepKinematics_SpatialRotation, theCntxt: StepRepr_GlobalUnitAssignedContext): NCollection_HArray1_double;

delete(): void;

[Symbol.dispose](): void;
