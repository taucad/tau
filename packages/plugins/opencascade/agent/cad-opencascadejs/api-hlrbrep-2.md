# libcascade — HLRBRep (2)

25 top-level symbols. Signatures are verbatim typescript.

HLRBRep_LineTool: declare class HLRBRep_LineTool

constructor

static FirstParameter(C: gp_Lin): number;

static LastParameter(C: gp_Lin): number;

static Continuity(C: gp_Lin): GeomAbs_Shape;

static NbIntervals(C: gp_Lin, S: GeomAbs_Shape): number;

static Intervals(C: gp_Lin, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;

static IntervalFirst(C: gp_Lin): number;

static IntervalLast(C: gp_Lin): number;

static IntervalContinuity(C: gp_Lin): GeomAbs_Shape;

static IsClosed(C: gp_Lin): boolean;

static IsPeriodic(C: gp_Lin): boolean;

static Period(C: gp_Lin): number;

static Value(C: gp_Lin, U: number): gp_Pnt;

static D0(C: gp_Lin, U: number, P: gp_Pnt): void;

static D1(C: gp_Lin, U: number, P: gp_Pnt, V: gp_Vec): void;

static D2(C: gp_Lin, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

static D3(C: gp_Lin, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

static DN(C: gp_Lin, U: number, N: number): gp_Vec;

static Resolution(C: gp_Lin, R3d: number): number;

static GetType(C: gp_Lin): GeomAbs_CurveType;

static Line(C: gp_Lin): gp_Lin;

static Circle(C: gp_Lin): gp_Circ;

static Ellipse(C: gp_Lin): gp_Elips;

static Hyperbola(C: gp_Lin): gp_Hypr;

static Parabola(C: gp_Lin): gp_Parab;

static Bezier(C: gp_Lin): Geom_BezierCurve;

static BSpline(C: gp_Lin): Geom_BSplineCurve;

static Degree(C: gp_Lin): number;

static NbPoles(C: gp_Lin): number;

static Poles(C: gp_Lin, TP: NCollection_Array1_gp_Pnt): void;

static IsRational(C: gp_Lin): boolean;

static PolesAndWeights(C: gp_Lin, TP: NCollection_Array1_gp_Pnt, TW: NCollection_Array1_double): void;

static NbKnots(C: gp_Lin): number;

static KnotsAndMultiplicities(C: gp_Lin, TK: NCollection_Array1_double, TM: NCollection_Array1_int): void;

static NbSamples(C: gp_Lin, U0: number, U1: number): number;

static SamplePars(C: gp_Lin, U0: number, U1: number, Defl: number, NbMin: number): NCollection_HArray1_double;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter: declare class HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter extends math_FunctionWithDerivative

Value(X: number, F: number): { returnValue: boolean; F: number };

Derivative(X: number, D: number): { returnValue: boolean; D: number };

Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

delete(): void;

[Symbol.dispose](): void;

HLRBRep_PolyAlgo: declare class HLRBRep_PolyAlgo extends Standard_Transient

constructor

NbShapes(): number;

Shape(I: number): TopoDS_Shape;

Remove(I: number): void;

Index(S: TopoDS_Shape): number;

Load(theShape: TopoDS_Shape): void;

Algo(): HLRAlgo_PolyAlgo;

Projector(): HLRAlgo_Projector;
Projector(theProj: HLRAlgo_Projector): void;
Projector(): HLRAlgo_Projector;
Projector(theProj: HLRAlgo_Projector): void;

TolAngular(): number;
TolAngular(theTol: number): void;
TolAngular(): number;
TolAngular(theTol: number): void;

TolCoef(): number;
TolCoef(theTol: number): void;
TolCoef(): number;
TolCoef(theTol: number): void;

Update(): void;

InitHide(): void;

MoreHide(): boolean;

NextHide(): void;

Hide(status: HLRAlgo_EdgeStatus, S: TopoDS_Shape, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

InitShow(): void;

MoreShow(): boolean;

NextShow(): void;

Show(S: TopoDS_Shape, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

OutLinedShape(S: TopoDS_Shape): TopoDS_Shape;

Debug(): boolean;
Debug(theDebug: boolean): void;
Debug(): boolean;
Debug(theDebug: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_PolyHLRToShape: declare class HLRBRep_PolyHLRToShape

constructor

Update(A: HLRBRep_PolyAlgo): void;

Show(): void;

Hide(): void;

VCompound(): TopoDS_Shape;
VCompound(S: TopoDS_Shape): TopoDS_Shape;
VCompound(): TopoDS_Shape;
VCompound(S: TopoDS_Shape): TopoDS_Shape;

Rg1LineVCompound(): TopoDS_Shape;
Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;
Rg1LineVCompound(): TopoDS_Shape;
Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;

RgNLineVCompound(): TopoDS_Shape;
RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
RgNLineVCompound(): TopoDS_Shape;
RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

OutLineVCompound(): TopoDS_Shape;
OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
OutLineVCompound(): TopoDS_Shape;
OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

HCompound(): TopoDS_Shape;
HCompound(S: TopoDS_Shape): TopoDS_Shape;
HCompound(): TopoDS_Shape;
HCompound(S: TopoDS_Shape): TopoDS_Shape;

Rg1LineHCompound(): TopoDS_Shape;
Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;
Rg1LineHCompound(): TopoDS_Shape;
Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;

RgNLineHCompound(): TopoDS_Shape;
RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
RgNLineHCompound(): TopoDS_Shape;
RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

OutLineHCompound(): TopoDS_Shape;
OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
OutLineHCompound(): TopoDS_Shape;
OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_SLProps: declare class HLRBRep_SLProps

constructor

SetSurface(S: unknown): void;

SetParameters(U: number, V: number): void;

Value(): gp_Pnt;

D1U(): gp_Vec;

D1V(): gp_Vec;

D2U(): gp_Vec;

D2V(): gp_Vec;

DUV(): gp_Vec;

IsTangentUDefined(): boolean;

TangentU(D: gp_Dir): void;

IsTangentVDefined(): boolean;

TangentV(D: gp_Dir): void;

IsNormalDefined(): boolean;

Normal(): gp_Dir;

IsCurvatureDefined(): boolean;

IsUmbilic(): boolean;

MaxCurvature(): number;

MinCurvature(): number;

CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;

MeanCurvature(): number;

GaussianCurvature(): number;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_SLPropsATool: declare class HLRBRep_SLPropsATool

constructor

delete(): void;

[Symbol.dispose](): void;

HLRBRep_ShapeBounds: declare class HLRBRep_ShapeBounds

constructor

Translate(NV: number, NE: number, NF: number): void;

Shape(S: HLRTopoBRep_OutLiner): void;
Shape(): HLRTopoBRep_OutLiner;
Shape(S: HLRTopoBRep_OutLiner): void;
Shape(): HLRTopoBRep_OutLiner;

ShapeData(SD: Standard_Transient): void;
ShapeData(): Standard_Transient;
ShapeData(SD: Standard_Transient): void;
ShapeData(): Standard_Transient;

NbOfIso(nbIso: number): void;
NbOfIso(): number;
NbOfIso(nbIso: number): void;
NbOfIso(): number;

Sizes(NV?: number, NE?: number, NF?: number): { NV: number; NE: number; NF: number };

Bounds(V1?: number, V2?: number, E1?: number, E2?: number, F1?: number, F2?: number): { V1: number; V2: number; E1: number; E2: number; F1: number; F2: number };

UpdateMinMax(theTotMinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_ShapeToHLR: declare class HLRBRep_ShapeToHLR

constructor

delete(): void;

[Symbol.dispose](): void;

HLRBRep_SurfaceTool: declare class HLRBRep_SurfaceTool

constructor

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter extends math_FunctionSetWithDerivatives

NbVariables(): number;

NbEquations(): number;

Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheExactInterCSurf: declare class HLRBRep_TheExactInterCSurf

Perform(U: number, V: number, W: number, Rsnld: math_FunctionSetRoot, u0: number, v0: number, u1: number, v1: number, w0: number, w1: number): void;

IsDone(): boolean;

IsEmpty(): boolean;

Point(): gp_Pnt;

ParameterOnCurve(): number;

ParameterOnSurface(U?: number, V?: number): { U: number; V: number };

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheIntConicCurveOfCInter: declare class HLRBRep_TheIntConicCurveOfCInter extends IntRes2d_Intersection

constructor

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheIntPCurvePCurveOfCInter: declare class HLRBRep_TheIntPCurvePCurveOfCInter extends IntRes2d_Intersection

constructor

SetMinNbSamples(theMinNbSamples: number): void;

GetMinNbSamples(): number;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheInterferenceOfInterCSurf: declare class HLRBRep_TheInterferenceOfInterCSurf extends Intf_Interference

constructor

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter: declare class HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter extends IntRes2d_Intersection

constructor

delete(): void;

[Symbol.dispose](): void;

HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter extends Intf_Polygon2d

DeflectionOverEstimation(): number;

SetDeflectionOverEstimation(x: number): void;

Closed(clos: boolean): void;
Closed(): boolean;
Closed(clos: boolean): void;
Closed(): boolean;

NbSegments(): number;

Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;

InfParameter(): number;

SupParameter(): number;

AutoIntersectionIsPossible(): boolean;

ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

CalculRegion(x: number, y: number, x1: number, x2: number, y1: number, y2: number): number;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_ThePolygonOfInterCSurf: declare class HLRBRep_ThePolygonOfInterCSurf

constructor

Bounding(): Bnd_Box;

DeflectionOverEstimation(): number;

SetDeflectionOverEstimation(x: number): void;

Closed(flag: boolean): void;
Closed(): boolean;
Closed(flag: boolean): void;
Closed(): boolean;

NbSegments(): number;

BeginOfSeg(theIndex: number): gp_Pnt;

EndOfSeg(theIndex: number): gp_Pnt;

InfParameter(): number;

SupParameter(): number;

ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_ThePolygonToolOfInterCSurf: declare class HLRBRep_ThePolygonToolOfInterCSurf

constructor

static Bounding(thePolygon: HLRBRep_ThePolygonOfInterCSurf): Bnd_Box;

static DeflectionOverEstimation(thePolygon: HLRBRep_ThePolygonOfInterCSurf): number;

static Closed(thePolygon: HLRBRep_ThePolygonOfInterCSurf): boolean;

static NbSegments(thePolygon: HLRBRep_ThePolygonOfInterCSurf): number;

static BeginOfSeg(thePolygon: HLRBRep_ThePolygonOfInterCSurf, Index: number): gp_Pnt;

static EndOfSeg(thePolygon: HLRBRep_ThePolygonOfInterCSurf, Index: number): gp_Pnt;

static Dump(thePolygon: HLRBRep_ThePolygonOfInterCSurf): void;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_ThePolyhedronToolOfInterCSurf: declare class HLRBRep_ThePolyhedronToolOfInterCSurf

constructor

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheProjPCurOfCInter: declare class HLRBRep_TheProjPCurOfCInter

constructor

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheQuadCurvExactInterCSurf: declare class HLRBRep_TheQuadCurvExactInterCSurf

IsDone(): boolean;

NbRoots(): number;

Root(Index: number): number;

NbIntervals(): number;

Intervals(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf: declare class HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf extends math_FunctionWithDerivative

constructor

Value(X: number, F: number): { returnValue: boolean; F: number };

Derivative(X: number, D: number): { returnValue: boolean; D: number };

Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

delete(): void;

[Symbol.dispose](): void;

HLRBRep_TypeOfResultingEdge: typeof HLRBRep_TypeOfResultingEdge[keyof typeof HLRBRep_TypeOfResultingEdge]

HLRBRep_VertexList: declare class HLRBRep_VertexList

IsPeriodic(): boolean;

More(): boolean;

Next(): void;

Current(): HLRAlgo_Intersection;

IsBoundary(): boolean;

IsInterference(): boolean;

Orientation(): TopAbs_Orientation;

Transition(): TopAbs_Orientation;

BoundaryTransition(): TopAbs_Orientation;

delete(): void;

[Symbol.dispose](): void;

HLRBRep_SeqOfShapeBounds: NCollection_Sequence_HLRBRep_ShapeBounds
