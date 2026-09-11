# libcascade — ExtremaPC

20 top-level symbols. Signatures are verbatim typescript.

ExtremaPC_Config: declare class ExtremaPC_Config

constructor

Tolerance: number

Domain: unknown | null | undefined

NbSamples: number

Mode: ExtremaPC_SearchMode

IncludeEndpoints: boolean

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_ExtremumResult: declare class ExtremaPC_ExtremumResult

constructor

Parameter: number

Point: gp_Pnt

SquareDistance: number

IsMinimum: boolean

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_Result: declare class ExtremaPC_Result

constructor

Status: ExtremaPC_Status

Extrema: NCollection_DynamicArray_ExtremaPC_ExtremumResult

InfiniteSquareDistance: number

IsDone(): boolean;

IsInfinite(): boolean;

NbExt(): number;

MinSquareDistance(): number;

MinIndex(): number;

MaxSquareDistance(): number;

MaxIndex(): number;

Clear(): void;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_SearchMode: typeof ExtremaPC_SearchMode[keyof typeof ExtremaPC_SearchMode]

ExtremaPC_Status: typeof ExtremaPC_Status[keyof typeof ExtremaPC_Status]

ExtremaPC_BSplineCurve: declare class ExtremaPC_BSplineCurve

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

Curve(): Geom_BSplineCurve;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_BezierCurve: declare class ExtremaPC_BezierCurve

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

Curve(): Geom_BezierCurve;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_Circle: declare class ExtremaPC_Circle

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

Circle(): gp_Circ;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_Curve: declare class ExtremaPC_Curve

constructor

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

IsInitialized(): boolean;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_DistanceFunction: declare class ExtremaPC_DistanceFunction

constructor

Value(theU: number, theF?: number): { returnValue: boolean; theF: number };

Values(theU: number, theF?: number, theDF?: number): { returnValue: boolean; theF: number; theDF: number };

Derivative(theU: number, theDF?: number): { returnValue: boolean; theDF: number };

FirstParameter(): number;

LastParameter(): number;

Point(): gp_Pnt;

Curve(): Adaptor3d_Curve;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_Ellipse: declare class ExtremaPC_Ellipse

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

Ellipse(): gp_Elips;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_GridEvaluator: declare class ExtremaPC_GridEvaluator

constructor

Grid(): any;

Result(): ExtremaPC_Result;

Perform(theCurve: Adaptor3d_Curve, theP: gp_Pnt, theDomain: unknown, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

static BuildUniformParams(theUMin: number, theUMax: number, theNbSamples: number): math_VectorBase_double;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_GridEvaluator_CandidateType: typeof ExtremaPC_GridEvaluator_CandidateType[keyof typeof ExtremaPC_GridEvaluator_CandidateType]

ExtremaPC_Hyperbola: declare class ExtremaPC_Hyperbola

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

Hyperbola(): gp_Hypr;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_Line: declare class ExtremaPC_Line

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

Line(): gp_Lin;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_OffsetCurve: declare class ExtremaPC_OffsetCurve

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_OtherCurve: declare class ExtremaPC_OtherCurve

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_Parabola: declare class ExtremaPC_Parabola

constructor

Value(theU: number): gp_Pnt;

IsBounded(): boolean;

Domain(): unknown;

Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;

Parabola(): gp_Parab;

delete(): void;

[Symbol.dispose](): void;

ExtremaPC_GridEvaluator_GridPoint: interface ExtremaPC_GridEvaluator_GridPoint

Param: number

Point: gp_Pnt

D1: gp_Vec

ExtremaPC_GridEvaluator_Candidate: interface ExtremaPC_GridEvaluator_Candidate

Type: ExtremaPC_GridEvaluator_CandidateType

IdxLo: number

IdxHi: number

StartU: number
