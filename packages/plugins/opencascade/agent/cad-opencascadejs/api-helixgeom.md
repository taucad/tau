# libcascade — HelixGeom

6 top-level symbols. Signatures are verbatim typescript.

HelixGeom_BuilderApproxCurve: declare class HelixGeom_BuilderApproxCurve

SetApproxParameters(aCont: GeomAbs_Shape, aMaxDegree: number, aMaxSeg: number): void;

SetTolerance(aTolerance: number): void;

Tolerance(): number;

ToleranceReached(): number;

Curves(): NCollection_Sequence_handle_Geom_Curve;

ErrorStatus(): number;

WarningStatus(): number;

Perform(): void;

delete(): void;

[Symbol.dispose](): void;

HelixGeom_BuilderHelix: declare class HelixGeom_BuilderHelix extends HelixGeom_BuilderHelixGen

constructor

SetPosition(aAx2: gp_Ax2): void;

Position(): gp_Ax2;

Perform(): void;

delete(): void;

[Symbol.dispose](): void;

HelixGeom_BuilderHelixCoil: declare class HelixGeom_BuilderHelixCoil extends HelixGeom_BuilderHelixGen

constructor

Perform(): void;

delete(): void;

[Symbol.dispose](): void;

HelixGeom_BuilderHelixGen: declare class HelixGeom_BuilderHelixGen extends HelixGeom_BuilderApproxCurve

SetCurveParameters(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, bIsClockwise: boolean): void;

CurveParameters(aT1?: number, aT2?: number, aPitch?: number, aRStart?: number, aTaperAngle?: number, bIsClockwise?: boolean): { aT1: number; aT2: number; aPitch: number; aRStart: number; aTaperAngle: number; bIsClockwise: boolean };

delete(): void;

[Symbol.dispose](): void;

HelixGeom_HelixCurve: declare class HelixGeom_HelixCurve extends Adaptor3d_Curve

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Load(): void;
Load(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, aIsCW: boolean): void;
Load(): void;
Load(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, aIsCW: boolean): void;

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

NbIntervals(S: GeomAbs_Shape): number;

Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

Resolution(R3d: number): number;

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

EvalD0(theU: number): gp_Pnt;

EvalD1(theU: number): Geom_Curve_ResD1;

EvalD2(theU: number): Geom_Curve_ResD2;

EvalDN(theU: number, theN: number): gp_Vec;

delete(): void;

[Symbol.dispose](): void;

HelixGeom_Tools: declare class HelixGeom_Tools

constructor

static ApprHelix(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, aIsCW: boolean, aTol: number, theMaxError?: number): { returnValue: number; theBSpl: Geom_BSplineCurve; theMaxError: number; [Symbol.dispose](): void };

static ApprCurve3D(theHC: Adaptor3d_Curve, theTol: number, theCont: GeomAbs_Shape, theMaxSeg: number, theMaxDeg: number, theMaxError?: number): { returnValue: number; theBSpl: Geom_BSplineCurve; theMaxError: number; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;
