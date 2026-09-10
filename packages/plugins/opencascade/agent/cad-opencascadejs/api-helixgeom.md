# libcascade — HelixGeom

6 top-level symbols. Signatures are verbatim typescript.

// Base class for helix curve approximation algorithms
HelixGeom_BuilderApproxCurve: declare class HelixGeom_BuilderApproxCurve

// Sets approximation parameters
SetApproxParameters(aCont: GeomAbs_Shape, aMaxDegree: number, aMaxSeg: number): void;

// Sets approximation tolerance
SetTolerance(aTolerance: number): void;

// Gets approximation tolerance
Tolerance(): number;

// Gets actual tolerance reached by approximation algorithm
ToleranceReached(): number;

// Gets sequence of BSpline curves representing helix coils
Curves(): NCollection_Sequence_handle_Geom_Curve;

// Returns error status of algorithm
ErrorStatus(): number;

// Returns warning status of algorithm
WarningStatus(): number;

// Performs calculations
Perform(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Upper level class for geometrical algorithm of building helix curves using arbitrary axis
HelixGeom_BuilderHelix: declare class HelixGeom_BuilderHelix extends HelixGeom_BuilderHelixGen

constructor

// Sets coordinate axes for helix
SetPosition(aAx2: gp_Ax2): void;

// Gets coordinate axes for helix
Position(): gp_Ax2;

// Performs calculations
Perform(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation of algorithm for building helix coil with axis OZ
HelixGeom_BuilderHelixCoil: declare class HelixGeom_BuilderHelixCoil extends HelixGeom_BuilderHelixGen

constructor

// Performs calculations
Perform(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Base class for helix curve building algorithms with parameter management
HelixGeom_BuilderHelixGen: declare class HelixGeom_BuilderHelixGen extends HelixGeom_BuilderApproxCurve

// Sets parameters for building helix curves
SetCurveParameters(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, bIsClockwise: boolean): void;

// Gets parameters for building helix curves
CurveParameters(aT1?: number, aT2?: number, aPitch?: number, aRStart?: number, aTaperAngle?: number, bIsClockwise?: boolean): { aT1: number; aT2: number; aPitch: number; aRStart: number; aTaperAngle: number; bIsClockwise: boolean };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Adaptor class for calculation of helix curves with analytical expressions
HelixGeom_HelixCurve: declare class HelixGeom_HelixCurve extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Sets default values for parameters
Load(): void;
Load(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, aIsCW: boolean): void;
Load(): void;
Load(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, aIsCW: boolean): void;

// Gets first parameter
FirstParameter(): number;

// Gets last parameter
LastParameter(): number;

// Gets continuity
Continuity(): GeomAbs_Shape;

// Gets number of intervals
NbIntervals(S: GeomAbs_Shape): number;

// Gets parametric intervals
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Gets parametric resolution
Resolution(R3d: number): number;

// Returns False
IsClosed(): boolean;

// Returns False
IsPeriodic(): boolean;

// Returns 2\*PI
Period(): number;

// Computes the point of parameter theU on the curve
EvalD0(theU: number): gp_Pnt;

// Computes the point and first derivative at parameter theU
EvalD1(theU: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter theU
EvalD2(theU: number): Geom_Curve_ResD2;

// Returns the derivative of order theN at parameter theU
EvalDN(theU: number, theN: number): gp_Vec;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Static utility class providing approximation algorithms for helix curves
HelixGeom_Tools: declare class HelixGeom_Tools

constructor

// Approximates a parametric helix curve using B-spline representation
static ApprHelix(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, aIsCW: boolean, aTol: number, theMaxError?: number): { returnValue: number; theBSpl: Geom_BSplineCurve; theMaxError: number; [Symbol.dispose](): void };
// aT1: [in] Start parameter (angular position in radians)
// aT2: [in] End parameter (angular position in radians)
// aPitch: [in] Helix pitch (vertical distance per 2\*PI radians)
// aRStart: [in] Starting radius at parameter aT1
// aTaperAngle: [in] Taper angle in radians (0 = cylindrical helix)
// aIsCW: [in] True for clockwise, false for counter-clockwise
// aTol: [in] Approximation tolerance
// theMaxError: [out] Maximum approximation error achieved

// Approximates a generic 3D curve using B-spline representation
static ApprCurve3D(theHC: Adaptor3d_Curve, theTol: number, theCont: GeomAbs_Shape, theMaxSeg: number, theMaxDeg: number, theMaxError?: number): { returnValue: number; theBSpl: Geom_BSplineCurve; theMaxError: number; [Symbol.dispose](): void };
// theHC: [in] Handle to the curve adaptor to approximate
// theTol: [in] Approximation tolerance
// theCont: [in] Required continuity (C0, C1, C2)
// theMaxSeg: [in] Maximum number of curve segments
// theMaxDeg: [in] Maximum degree of B-spline curve
// theMaxError: [out] Maximum approximation error achieved

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
