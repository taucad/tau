# libcascade — GeomAdaptor (2)

9 top-level symbols. Signatures are verbatim typescript.

// An adaptor for surfaces with an applied transformation
GeomAdaptor_TransformedSurface: declare class GeomAdaptor_TransformedSurface extends Adaptor3d_Surface

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Shallow copy of adaptor
ShallowCopy(): Adaptor3d_Surface;

// Loads the surface geometry
Load(theSurface: Geom_Surface, theTrsf: gp_Trsf): void;
Load(theSurface: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTrsf: gp_Trsf, theTolU: number, theTolV: number): void;
Load(theSurface: Geom_Surface, theTrsf: gp_Trsf): void;
Load(theSurface: Geom_Surface, theUFirst: number, theULast: number, theVFirst: number, theVLast: number, theTrsf: gp_Trsf, theTolU: number, theTolV: number): void;
// theSurface: underlying geometry
// theTrsf: transformation to apply

// Sets the transformation
SetTrsf(theTrsf: gp_Trsf): void;
// theTrsf: transformation to apply

// Returns true if non-identity transformation is applied
HasTrsf(): boolean;

// Returns the transformation
Trsf(): gp_Trsf;

Surface(): GeomAdaptor_Surface;

// Returns the underlying {@link GeomAdaptor_Surface`GeomAdaptor_Surface`}
// DEPRECATED
AdaptorSurfaceOriginal(): GeomAdaptor_Surface;

// Returns an adaptor for the transformed surface state
AdaptorSurfaceTransformed(): GeomAdaptor_Surface;

// Returns the underlying original {@link Geom_Surface`Geom_Surface`} without transformation applied
GeomSurfaceOriginal(): Geom_Surface;

// Returns the transformed {@link Geom_Surface`Geom_Surface`} cached for current state
GeomSurfaceTransformed(): Geom_Surface;

// Returns the underlying {@link Geom_Surface`Geom_Surface`}
// DEPRECATED
GeomSurface(): Geom_Surface;

FirstUParameter(): number;

LastUParameter(): number;

FirstVParameter(): number;

LastVParameter(): number;

UContinuity(): GeomAbs_Shape;

VContinuity(): GeomAbs_Shape;

// Returns the number of U intervals for continuity
NbUIntervals(S: GeomAbs_Shape): number;

// Returns the number of V intervals for continuity
NbVIntervals(S: GeomAbs_Shape): number;

// Returns the intervals with the requested continuity in the U direction
UIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the intervals with the requested continuity in the V direction
VIntervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Returns a surface trimmed in the U direction equivalent of <me> between parameters <First> and <Last>
UTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

// Returns a surface trimmed in the V direction between parameters <First> and <Last>
VTrim(First: number, Last: number, Tol: number): Adaptor3d_Surface;

IsUClosed(): boolean;

IsVClosed(): boolean;

IsUPeriodic(): boolean;

UPeriod(): number;

IsVPeriodic(): boolean;

VPeriod(): number;

// Returns tolerance in U direction
ToleranceU(): number;

// Returns tolerance in V direction
ToleranceV(): number;

// Point evaluation
EvalD0(theU: number, theV: number): gp_Pnt;

// D1 evaluation
EvalD1(theU: number, theV: number): Geom_Surface_ResD1;

// D2 evaluation
EvalD2(theU: number, theV: number): Geom_Surface_ResD2;

// D3 evaluation
EvalD3(theU: number, theV: number): Geom_Surface_ResD3;

// DN evaluation
EvalDN(theU: number, theV: number, theNu: number, theNv: number): gp_Vec;

// Returns the parametric U resolution corresponding to the real space resolution <R3d>
UResolution(R3d: number): number;

// Returns the parametric V resolution corresponding to the real space resolution <R3d>
VResolution(R3d: number): number;

// Returns the type of the surface
GetType(): GeomAbs_SurfaceType;

Plane(): gp_Pln;

Cylinder(): gp_Cylinder;

Cone(): gp_Cone;

Sphere(): gp_Sphere;

Torus(): gp_Torus;

UDegree(): number;

NbUPoles(): number;

VDegree(): number;

NbVPoles(): number;

NbUKnots(): number;

NbVKnots(): number;

IsURational(): boolean;

IsVRational(): boolean;

Bezier(): Geom_BezierSurface;

BSpline(): Geom_BSplineSurface;

AxeOfRevolution(): gp_Ax1;

Direction(): gp_Dir;

BasisCurve(): Adaptor3d_Curve;

BasisSurface(): Adaptor3d_Surface;

OffsetValue(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomAdaptor_Curve_OffsetData: interface GeomAdaptor_Curve_OffsetData

BasisAdaptor: GeomAdaptor_Curve

Offset: number

Direction: gp_Dir

EvalRep: GeomEval_RepCurveDesc_Base

GeomAdaptor_Curve_BezierData: interface GeomAdaptor_Curve_BezierData

Curve: Geom_BezierCurve

Cache: BSplCLib_Cache

EvalRep: GeomEval_RepCurveDesc_Base

GeomAdaptor_Curve_BSplineData: interface GeomAdaptor_Curve_BSplineData

Curve: Geom_BSplineCurve

Cache: BSplCLib_Cache

EvalRep: GeomEval_RepCurveDesc_Base

GeomAdaptor_Surface_ExtrusionData: interface GeomAdaptor_Surface_ExtrusionData

BasisCurve: Adaptor3d_Curve

Direction: gp_XYZ

EvalRep: GeomEval_RepSurfaceDesc_Base

GeomAdaptor_Surface_RevolutionData: interface GeomAdaptor_Surface_RevolutionData

BasisCurve: Adaptor3d_Curve

Axis: gp_Ax1

EvalRep: GeomEval_RepSurfaceDesc_Base

GeomAdaptor_Surface_OffsetData: interface GeomAdaptor_Surface_OffsetData

BasisAdaptor: GeomAdaptor_Surface

EquivalentAdaptor: GeomAdaptor_Surface

OffsetSurface: Geom_OffsetSurface

Offset: number

EvalRep: GeomEval_RepSurfaceDesc_Base

GeomAdaptor_Surface_BezierData: interface GeomAdaptor_Surface_BezierData

Surface: Geom_BezierSurface

Cache: BSplSLib_Cache

EvalRep: GeomEval_RepSurfaceDesc_Base

GeomAdaptor_Surface_BSplineData: interface GeomAdaptor_Surface_BSplineData

Surface: Geom_BSplineSurface

Cache: BSplSLib_Cache

EvalRep: GeomEval_RepSurfaceDesc_Base
