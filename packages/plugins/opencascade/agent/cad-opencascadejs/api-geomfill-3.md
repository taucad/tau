# libcascade — GeomFill (3)

13 top-level symbols. Signatures are verbatim typescript.

// High-level Gordon surface construction from arbitrary curve networks
GeomFill_Gordon: declare class GeomFill_Gordon

constructor

// Initializes the algorithm with profile and guide curves
Init(theProfiles: NCollection_Array1_handle_Geom_Curve, theGuides: NCollection_Array1_handle_Geom_Curve, theTolerance: number): void;
// theProfiles: array of profile curves (V-direction sections, must be >= 2)
// theGuides: array of guide curves (U-direction sections, must be >= 2)
// theTolerance: geometric tolerance for intersection detection

// Performs the Gordon surface construction
Perform(): void;

// Enables/disables parallel processing in internal stages
SetParallelMode(theToUseParallel: boolean): void;

// Sets optional fallback behavior for failures in exact B-spline construction
SetApproximationMode(theMode: GeomFill_Gordon_ApproximationMode): void;

// Returns current fallback behavior
GetApproximationMode(): GeomFill_Gordon_ApproximationMode;

// Returns true if internal parallel processing is enabled
IsParallelMode(): boolean;

// Returns true if the surface was successfully constructed
IsDone(): boolean;

// Returns true if the resulting surface was produced by approximate fallback
IsApproximate(): boolean;

// Returns the result state of the last `Perform()` call
Status(): GeomFill_Gordon_ResultStatus;

// Returns diagnostics for the last `Perform()` call
Report(): GeomFill_Gordon_BuildReport;

// Returns the resulting Gordon B-spline surface
Surface(): Geom_BSplineSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Result state of the last `Perform()` call
GeomFill_Gordon_ResultStatus: typeof GeomFill_Gordon_ResultStatus[keyof typeof GeomFill_Gordon_ResultStatus]

// Controls behavior when exact pole-based construction fails
GeomFill_Gordon_ApproximationMode: typeof GeomFill_Gordon_ApproximationMode[keyof typeof GeomFill_Gordon_ApproximationMode]

// Construction stage reached by the last `Perform()` call
GeomFill_Gordon_BuildStage: typeof GeomFill_Gordon_BuildStage[keyof typeof GeomFill_Gordon_BuildStage]

// Trihedron in the case of a sweeping along a guide curve
GeomFill_GuideTrihedronAC: declare class GeomFill_GuideTrihedronAC extends GeomFill_TrihedronWithGuide

constructor

// initialize curve of trihedron law
SetCurve(C: Adaptor3d_Curve): boolean;

Copy(): GeomFill_TrihedronLaw;

Guide(): Adaptor3d_Curve;

// compute Triedrhon on curve at parameter
D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// Normal: Mutated in place
// BiNormal: Mutated in place

// compute Triedrhon and derivative Trihedron on curve at parameter Warning
D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// DTangent: Mutated in place
// Normal: Mutated in place
// DNormal: Mutated in place
// BiNormal: Mutated in place
// DBiNormal: Mutated in place

// compute Trihedron on curve first and second derivatives
D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// DTangent: Mutated in place
// D2Tangent: Mutated in place
// Normal: Mutated in place
// DNormal: Mutated in place
// D2Normal: Mutated in place
// BiNormal: Mutated in place
// DBiNormal: Mutated in place
// D2BiNormal: Mutated in place

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Get average value of M(t) and V(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Say if the law is Constant
IsConstant(): boolean;

// Say if the law is defined, only by the 3d Geometry of the set Curve Return False by Default
IsOnlyBy3dCurve(): boolean;

Origine(Param1: number, Param2: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Trihedron in the case of sweeping along a guide curve defined by the orthogonal plan on the trajectory
GeomFill_GuideTrihedronPlan: declare class GeomFill_GuideTrihedronPlan extends GeomFill_TrihedronWithGuide

constructor

// initialize curve of trihedron law
SetCurve(C: Adaptor3d_Curve): boolean;

Copy(): GeomFill_TrihedronLaw;

// Give a status to the {@link Law`Law`} Returns PipeOk (default implementation)
ErrorStatus(): GeomFill_PipeError;

Guide(): Adaptor3d_Curve;

// compute Triedrhon on curve at parameter
D0(Param: number, Tangent: gp_Vec, Normal: gp_Vec, BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// Normal: Mutated in place
// BiNormal: Mutated in place

// compute Triedrhon and derivative Trihedron on curve at parameter Warning
D1(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// DTangent: Mutated in place
// Normal: Mutated in place
// DNormal: Mutated in place
// BiNormal: Mutated in place
// DBiNormal: Mutated in place

// compute Trihedron on curve first and second derivatives
D2(Param: number, Tangent: gp_Vec, DTangent: gp_Vec, D2Tangent: gp_Vec, Normal: gp_Vec, DNormal: gp_Vec, D2Normal: gp_Vec, BiNormal: gp_Vec, DBiNormal: gp_Vec, D2BiNormal: gp_Vec): boolean;
// Tangent: Mutated in place
// DTangent: Mutated in place
// D2Tangent: Mutated in place
// Normal: Mutated in place
// DNormal: Mutated in place
// D2Normal: Mutated in place
// BiNormal: Mutated in place
// DBiNormal: Mutated in place
// D2BiNormal: Mutated in place

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Get average value of M(t) and V(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(ATangent: gp_Vec, ANormal: gp_Vec, ABiNormal: gp_Vec): void;
// ATangent: Mutated in place
// ANormal: Mutated in place
// ABiNormal: Mutated in place

// Say if the law is Constant
IsConstant(): boolean;

// Say if the law is defined, only by the 3d Geometry of the set Curve Return False by Default
IsOnlyBy3dCurve(): boolean;

Origine(Param1: number, Param2: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// class for instantiation of AppBlend
GeomFill_Line: declare class GeomFill_Line extends Standard_Transient

constructor

NbPoints(): number;

Point(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_LocFunction: declare class GeomFill_LocFunction

constructor

// compute the section for v = param
D0(Param: number, First: number, Last: number): boolean;

// compute the first derivative in v direction of the section for v = param
D1(Param: number, First: number, Last: number): boolean;

// compute the second derivative in v direction of the section for v = param
D2(Param: number, First: number, Last: number): boolean;

DN(Param: number, First: number, Last: number, Order: number, Result?: number, Ier?: number): { Result: number; Ier: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_LocationDraft: declare class GeomFill_LocationDraft extends GeomFill_LocationLaw

constructor

SetStopSurf(Surf: Adaptor3d_Surface): void;

SetAngle(Angle: number): void;

// calculation of poles on locking surfaces (the intersection between the generatrixand the surface at the cross - section points myNbPts)
SetCurve(C: Adaptor3d_Curve): boolean;

GetCurve(): Adaptor3d_Curve;

// Set a transformation Matrix like the law M(t) become Mat \* M(t)
SetTrsf(Transfo: gp_Mat): void;

Copy(): GeomFill_LocationLaw;

// compute Location compute Location and 2d points
D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
// M: Mutated in place
// V: Mutated in place

// compute location 2d points and associated first derivatives
D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;
// M: Mutated in place
// V: Mutated in place
// DM: Mutated in place
// DV: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place

// compute location 2d points and associated first and second derivatives
D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;
// M: Mutated in place
// V: Mutated in place
// DM: Mutated in place
// DV: Mutated in place
// D2M: Mutated in place
// D2V: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// D2Poles2d: Mutated in place

// Say if the first restriction is defined in this class
HasFirstRestriction(): boolean;

// Say if the last restriction is defined in this class
HasLastRestriction(): boolean;

// Give the number of trace (Curves 2d which are not restriction) Returns 1 (default implementation)
TraceNumber(): number;

// Returnsthe number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Gets the bounds of the parametric interval on the function
GetInterval(First: number, Last: number): { First: number; Last: number };

// Gets the bounds of the function parametric domain
GetDomain(First: number, Last: number): { First: number; Last: number };

// Returns the resolutions in the sub-space 2d <Index> This information is useful to find a good tolerance in 2d approximation
Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Get the maximum Norm of the matrix-location part
GetMaximalNorm(): number;

// Get average value of M(t) and V(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;
// AM: Mutated in place
// AV: Mutated in place

// Say if the Location {@link Law`Law`}, is an translation of Location The default implementation is " returns False "
IsTranslation(Error: number): { returnValue: boolean; Error: number };

// Say if the Location {@link Law`Law`}, is a rotation of Location The default implementation is " returns False "
IsRotation(Error: number): { returnValue: boolean; Error: number };

Rotation(Center: gp_Pnt): void;

// Say if the generatrice interset the surface
IsIntersec(): boolean;

Direction(): gp_Dir;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomFill_LocationGuide: declare class GeomFill_LocationGuide extends GeomFill_LocationLaw

constructor

Set(Section: GeomFill_SectionLaw, rotat: boolean, SFirst: number, SLast: number, PrecAngle: number, LastAngle?: number): { LastAngle: number };

EraseRotation(): void;

// calculating poles on a surface (courbe guide / the surface of rotation in points myNbPts)
SetCurve(C: Adaptor3d_Curve): boolean;

GetCurve(): Adaptor3d_Curve;

// Set a transformation Matrix like the law M(t) become Mat \* M(t)
SetTrsf(Transfo: gp_Mat): void;

Copy(): GeomFill_LocationLaw;

// compute Location compute Location and 2d points
D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
// M: Mutated in place
// V: Mutated in place

// compute location 2d points and associated first derivatives
D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;
// M: Mutated in place
// V: Mutated in place
// DM: Mutated in place
// DV: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place

// compute location 2d points and associated first and second derivatives
D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;
// M: Mutated in place
// V: Mutated in place
// DM: Mutated in place
// DV: Mutated in place
// D2M: Mutated in place
// D2V: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// D2Poles2d: Mutated in place

// Say if the first restriction is defined in this class
HasFirstRestriction(): boolean;

// Say if the last restriction is defined in this class
HasLastRestriction(): boolean;

// Give the number of trace (Curves 2d which are not restriction) Returns 1 (default implementation)
TraceNumber(): number;

// Give a status to the {@link Law`Law`} Returns PipeOk (default implementation)
ErrorStatus(): GeomFill_PipeError;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Gets the bounds of the parametric interval on the function
GetInterval(First: number, Last: number): { First: number; Last: number };

// Gets the bounds of the function parametric domain
GetDomain(First: number, Last: number): { First: number; Last: number };

// Is useful, if (me) have to run numerical algorithm to perform D0, D1 or D2 The default implementation make nothing
SetTolerance(Tol3d: number, Tol2d: number): void;

// Returns the resolutions in the sub-space 2d <Index> This information is useful to find a good tolerance in 2d approximation
Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Get the maximum Norm of the matrix-location part
GetMaximalNorm(): number;

// Get average value of M(t) and V(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;
// AM: Mutated in place
// AV: Mutated in place

// Say if the Location {@link Law`Law`}, is an translation of Location The default implementation is " returns False "
IsTranslation(Error: number): { returnValue: boolean; Error: number };

// Say if the Location {@link Law`Law`}, is a rotation of Location The default implementation is " returns False "
IsRotation(Error: number): { returnValue: boolean; Error: number };

Rotation(Center: gp_Pnt): void;

Section(): Geom_Curve;

Guide(): Adaptor3d_Curve;

SetOrigine(Param1: number, Param2: number): void;

ComputeAutomaticLaw(): { returnValue: GeomFill_PipeError; ParAndRad: NCollection_HArray1_gp_Pnt2d; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// To define location law in Sweeping location is defined by an Matrix M and an Vector V, and transform an point P in MP+V
GeomFill_LocationLaw: declare class GeomFill_LocationLaw extends Standard_Transient

// initialize curve of location law
SetCurve(C: Adaptor3d_Curve): boolean;

GetCurve(): Adaptor3d_Curve;

// Set a transformation Matrix like the law M(t) become Mat \* M(t)
SetTrsf(Transfo: gp_Mat): void;

Copy(): GeomFill_LocationLaw;

// compute Location compute Location and 2d points
D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec): boolean;
D0(Param: number, M: gp_Mat, V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d): boolean;
// M: Mutated in place
// V: Mutated in place

// compute location 2d points and associated first derivatives
D1(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d): boolean;
// M: Mutated in place
// V: Mutated in place
// DM: Mutated in place
// DV: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place

// compute location 2d points and associated first and second derivatives
D2(Param: number, M: gp_Mat, V: gp_Vec, DM: gp_Mat, DV: gp_Vec, D2M: gp_Mat, D2V: gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d): boolean;
// M: Mutated in place
// V: Mutated in place
// DM: Mutated in place
// DV: Mutated in place
// D2M: Mutated in place
// D2V: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// D2Poles2d: Mutated in place

// get the number of 2d curves (Restrictions + Traces) to approximate
Nb2dCurves(): number;

// Say if the first restriction is defined in this class
HasFirstRestriction(): boolean;

// Say if the last restriction is defined in this class
HasLastRestriction(): boolean;

// Give the number of trace (Curves 2d which are not restriction) Returns 0 (default implementation)
TraceNumber(): number;

// Give a status to the {@link Law`Law`} Returns PipeOk (default implementation)
ErrorStatus(): GeomFill_PipeError;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Gets the bounds of the parametric interval on the function
GetInterval(First: number, Last: number): { First: number; Last: number };

// Gets the bounds of the function parametric domain
GetDomain(First: number, Last: number): { First: number; Last: number };

// Returns the resolutions in the sub-space 2d <Index> This information is useful to find a good tolerance in 2d approximation
Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Is useful, if (me) have to run numerical algorithm to perform D0, D1 or D2 The default implementation make nothing
SetTolerance(Tol3d: number, Tol2d: number): void;

// Get the maximum Norm of the matrix-location part
GetMaximalNorm(): number;

// Get average value of M(t) and V(t) it is useful to make fast approximation of rational surfaces
GetAverageLaw(AM: gp_Mat, AV: gp_Vec): void;
// AM: Mutated in place
// AV: Mutated in place

// Say if the Location {@link Law`Law`}, is an translation of Location The default implementation is " returns False "
IsTranslation(Error: number): { returnValue: boolean; Error: number };

// Say if the Location {@link Law`Law`}, is a rotation of Location The default implementation is " returns False "
IsRotation(Error: number): { returnValue: boolean; Error: number };

Rotation(Center: gp_Pnt): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Low-level Gordon surface construction from a compatible B-spline curve network
GeomFill_NetworkSurface: declare class GeomFill_NetworkSurface

constructor

// Initializes the algorithm with a compatible profile/guide B-spline network
Init(theProfiles: NCollection_Array1_handle_Geom_BSplineCurve, theGuides: NCollection_Array1_handle_Geom_BSplineCurve, theProfileParameters: NCollection_Array1_double, theGuideParameters: NCollection_Array1_double, theIntersectionPoints: NCollection_Array2_gp_Pnt, theIntersectionWeights: NCollection_Array2_double, theTolerance: number, theIsUClosed: boolean, theIsVClosed: boolean): void;
// theProfiles: profile curves evaluated in U direction
// theGuides: guide curves evaluated in V direction
// theProfileParameters: V parameters locating profiles on guide skin
// theGuideParameters: U parameters locating guides on profile skin
// theIntersectionPoints: validated profile/guide contact grid
// theIntersectionWeights: rational weights for the contact grid
// theTolerance: geometric tolerance for closed-seam checks
// theIsUClosed: indicates that first/last guide curves close the U seam
// theIsVClosed: indicates that first/last profile curves close the V seam

// Performs the pole-based network surface construction
Perform(): void;

// Returns true if the surface was successfully constructed
IsDone(): boolean;

// Returns the result state of the last `Perform()` call
Status(): GeomFill_NetworkSurface_ResultStatus;

// Returns the constructed B-spline surface
Surface(): Geom_BSplineSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Result state of the last `Perform()` call
GeomFill_NetworkSurface_ResultStatus: typeof GeomFill_NetworkSurface_ResultStatus[keyof typeof GeomFill_NetworkSurface_ResultStatus]
