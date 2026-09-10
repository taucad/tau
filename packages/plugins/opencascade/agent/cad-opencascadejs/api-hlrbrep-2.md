# libcascade — HLRBRep (2)

22 top-level symbols. Signatures are verbatim typescript.

// A framework for filtering the computation results of an {@link HLRBRep_Algo`HLRBRep_Algo`} algorithm by extraction
HLRBRep_HLRToShape: declare class HLRBRep_HLRToShape

constructor

// Return visible sharp edges (of C0-continuity)
VCompound(): TopoDS_Shape;
VCompound(S: TopoDS_Shape): TopoDS_Shape;
VCompound(): TopoDS_Shape;
VCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return visible smooth edges (G1-continuity between two surfaces)
Rg1LineVCompound(): TopoDS_Shape;
Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;
Rg1LineVCompound(): TopoDS_Shape;
Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return visible sewn edges (of CN-continuity on one surface)
RgNLineVCompound(): TopoDS_Shape;
RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
RgNLineVCompound(): TopoDS_Shape;
RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return visible outline edges ("silhouette")
OutLineVCompound(): TopoDS_Shape;
OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
OutLineVCompound(): TopoDS_Shape;
OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return visible outline edges ("silhouette")
OutLineVCompound3d(): TopoDS_Shape;

// Return visible isoparameters
IsoLineVCompound(): TopoDS_Shape;
IsoLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
IsoLineVCompound(): TopoDS_Shape;
IsoLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return hidden sharp edges (of C0-continuity)
HCompound(): TopoDS_Shape;
HCompound(S: TopoDS_Shape): TopoDS_Shape;
HCompound(): TopoDS_Shape;
HCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return hidden smooth edges (G1-continuity between two surfaces)
Rg1LineHCompound(): TopoDS_Shape;
Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;
Rg1LineHCompound(): TopoDS_Shape;
Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return hidden sewn edges (of CN-continuity on one surface)
RgNLineHCompound(): TopoDS_Shape;
RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
RgNLineHCompound(): TopoDS_Shape;
RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return hidden outline edges ("silhouette")
OutLineHCompound(): TopoDS_Shape;
OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
OutLineHCompound(): TopoDS_Shape;
OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

// Return hidden isoparameters
IsoLineHCompound(): TopoDS_Shape;
IsoLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
IsoLineHCompound(): TopoDS_Shape;
IsoLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

// Returns compound of resulting edges of required type and visibility, taking into account the kind of space (2d or 3d) For specified shape returns compound of resulting edges of required type and visibility, taking into account the kind of space (2d or 3d)
CompoundOfEdges(type*: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;
CompoundOfEdges(S: TopoDS_Shape, type*: HLRBRep*TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;
CompoundOfEdges(type*: HLRBRep*TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;
CompoundOfEdges(S: TopoDS_Shape, type*: HLRBRep_TypeOfResultingEdge, visible: boolean, In3d: boolean): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_Hider: declare class HLRBRep_Hider

// own hiding the side face number <FI>
OwnHiding(FI: number): void;

// Removes from the edges, the parts hidden by the hiding face number <FI>
Hide(FI: number, MST: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher): void;
// MST: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_IntConicCurveOfCInter: declare class HLRBRep_IntConicCurveOfCInter extends IntRes2d_Intersection

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_InterCSurf: declare class HLRBRep_InterCSurf extends IntCurveSurface_Intersection

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_InternalAlgo: declare class HLRBRep_InternalAlgo extends Standard_Transient

constructor

// set the projector
Projector(P: HLRAlgo_Projector): void;
Projector(): HLRAlgo_Projector;
Projector(P: HLRAlgo_Projector): void;
Projector(): HLRAlgo_Projector;

// update the DataStructure
Update(): void;

// add the shape
Load(S: HLRTopoBRep_OutLiner, SData: Standard_Transient, nbIso: number): void;
Load(S: HLRTopoBRep_OutLiner, nbIso: number): void;
Load(S: HLRTopoBRep_OutLiner, SData: Standard_Transient, nbIso: number): void;
Load(S: HLRTopoBRep_OutLiner, nbIso: number): void;

// return the index of the Shape and return 0 if the Shape is not found
Index(S: HLRTopoBRep_OutLiner): number;

// remove the Shape of Index _._
Remove(I: number): void;

// Change the Shape Data of the Shape of index _._
ShapeData(I: number, SData: Standard_Transient): void;

SeqOfShapeBounds(): NCollection_Sequence_HLRBRep_ShapeBounds;

NbShapes(): number;

ShapeBounds(I: number): HLRBRep_ShapeBounds;

// init the status of the selected edges depending of the back faces of a closed shell
InitEdgeStatus(): void;

// select all the DataStructure
Select(): void;
Select(I: number): void;
Select(): void;
Select(I: number): void;

// select only the edges of the Shape
SelectEdge(I: number): void;

// select only the faces of the Shape
SelectFace(I: number): void;

// set to visible all the edges
ShowAll(): void;
ShowAll(I: number): void;
ShowAll(): void;
ShowAll(I: number): void;

// set to hide all the edges
HideAll(): void;
HideAll(I: number): void;
HideAll(): void;
HideAll(I: number): void;

// own hiding of all the shapes of the DataStructure without hiding by each other
PartialHide(): void;

// hide all the DataStructure
Hide(): void;
Hide(I: number): void;
Hide(I: number, J: number): void;
Hide(): void;
Hide(I: number): void;
Hide(I: number, J: number): void;
Hide(): void;
Hide(I: number): void;
Hide(I: number, J: number): void;

Debug(deb: boolean): void;
Debug(): boolean;
Debug(deb: boolean): void;
Debug(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The LineTool class provides class methods to access the methodes of the Line
HLRBRep_LineTool: declare class HLRBRep_LineTool

constructor

static FirstParameter(C: gp_Lin): number;

static LastParameter(C: gp_Lin): number;

static Continuity(C: gp_Lin): GeomAbs_Shape;

// If necessary, breaks the line in intervals of continuity
static NbIntervals(C: gp_Lin, S: GeomAbs_Shape): number;

// Sets the current working interval
static Intervals(C: gp_Lin, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;
// T: Mutated in place

// Returns the first parameter of the current interval
static IntervalFirst(C: gp_Lin): number;

// Returns the last parameter of the current interval
static IntervalLast(C: gp_Lin): number;

static IntervalContinuity(C: gp_Lin): GeomAbs_Shape;

static IsClosed(C: gp_Lin): boolean;

static IsPeriodic(C: gp_Lin): boolean;

static Period(C: gp_Lin): number;

// Computes the point of parameter U on the line
static Value(C: gp_Lin, U: number): gp_Pnt;

// Computes the point of parameter U on the line
static D0(C: gp_Lin, U: number, P: gp_Pnt): void;
// P: Mutated in place

// Computes the point of parameter U on the line with its first derivative
static D1(C: gp_Lin, U: number, P: gp_Pnt, V: gp_Vec): void;
// P: Mutated in place
// V: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
static D2(C: gp_Lin, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
static D3(C: gp_Lin, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
static DN(C: gp_Lin, U: number, N: number): gp_Vec;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
static Resolution(C: gp_Lin, R3d: number): number;

// Returns the type of the line in the current interval
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

// Returns sample parameters for the line within [U0, U1] range
static SamplePars(C: gp_Lin, U0: number, U1: number, Defl: number, NbMin: number): NCollection_HArray1_double;
// C: the line
// U0: start parameter
// U1: end parameter
// Defl: deflection tolerance (unused for lines)
// NbMin: minimum number of sample points (unused for lines)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter: declare class HLRBRep_MyImpParToolOfTheIntersectorOfTheIntConicCurveOfCInter extends math_FunctionWithDerivative

// Computes the value of the signed distance between the implicit curve and the point at parameter Param on the parametrised curve
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative of the previous function at parameter Param
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value and the derivative of the function
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// to remove Hidden lines on Shapes with Triangulations
HLRBRep_PolyAlgo: declare class HLRBRep_PolyAlgo extends Standard_Transient

constructor

NbShapes(): number;

Shape(I: number): TopoDS_Shape;

// remove the Shape of Index _._
Remove(I: number): void;

// return the index of the Shape and return 0 if the Shape is not found
Index(S: TopoDS_Shape): number;

// Loads the shape S into this framework
Load(theShape: TopoDS_Shape): void;

Algo(): HLRAlgo_PolyAlgo;

// Sets the parameters of the view for this framework
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

// Launches calculation of outlines of the shape visualized by this framework
Update(): void;

InitHide(): void;

MoreHide(): boolean;

NextHide(): void;

Hide(status: HLRAlgo_EdgeStatus, S: TopoDS_Shape, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

InitShow(): void;

MoreShow(): boolean;

NextShow(): void;

Show(S: TopoDS_Shape, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

// Make a shape with the internal outlines in each face
OutLinedShape(S: TopoDS_Shape): TopoDS_Shape;

Debug(): boolean;
Debug(theDebug: boolean): void;
Debug(): boolean;
Debug(theDebug: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A framework for filtering the computation results of an {@link HLRBRep_Algo`HLRBRep_Algo`} algorithm by extraction
HLRBRep_PolyHLRToShape: declare class HLRBRep_PolyHLRToShape

constructor

Update(A: HLRBRep_PolyAlgo): void;

Show(): void;

Hide(): void;

VCompound(): TopoDS_Shape;
VCompound(S: TopoDS_Shape): TopoDS_Shape;
VCompound(): TopoDS_Shape;
VCompound(S: TopoDS_Shape): TopoDS_Shape;

// Sets the extraction filter for visible smooth edges
Rg1LineVCompound(): TopoDS_Shape;
Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;
Rg1LineVCompound(): TopoDS_Shape;
Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;

// Sets the extraction filter for visible sewn edges
RgNLineVCompound(): TopoDS_Shape;
RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
RgNLineVCompound(): TopoDS_Shape;
RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

// Sets the extraction filter for visible outlines
OutLineVCompound(): TopoDS_Shape;
OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;
OutLineVCompound(): TopoDS_Shape;
OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

HCompound(): TopoDS_Shape;
HCompound(S: TopoDS_Shape): TopoDS_Shape;
HCompound(): TopoDS_Shape;
HCompound(S: TopoDS_Shape): TopoDS_Shape;

// Sets the extraction filter for hidden smooth edges
Rg1LineHCompound(): TopoDS_Shape;
Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;
Rg1LineHCompound(): TopoDS_Shape;
Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;

// Sets the extraction filter for hidden sewn edges
RgNLineHCompound(): TopoDS_Shape;
RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
RgNLineHCompound(): TopoDS_Shape;
RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

// Sets the extraction filter for hidden outlines
OutLineHCompound(): TopoDS_Shape;
OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;
OutLineHCompound(): TopoDS_Shape;
OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Template class for computing local properties of a 3D surface
HLRBRep_SLProps: declare class HLRBRep_SLProps

constructor

// Initializes the local properties of the surface S for the new surface
SetSurface(S: unknown): void;

// Initializes the local properties of the surface S for the new parameter values (, <V>)
SetParameters(U: number, V: number): void;

// Returns the point
Value(): gp_Pnt;

// Returns the first U derivative
D1U(): gp_Vec;

// Returns the first V derivative
D1V(): gp_Vec;

// Returns the second U derivatives The derivative is computed if it has not been yet
D2U(): gp_Vec;

// Returns the second V derivative
D2V(): gp_Vec;

// Returns the second UV cross-derivative
DUV(): gp_Vec;

// returns True if the U tangent is defined
IsTangentUDefined(): boolean;

// Returns the tangent direction <D> on the iso-V
TangentU(D: gp_Dir): void;
// D: Mutated in place

// returns if the V tangent is defined
IsTangentVDefined(): boolean;

// Returns the tangent direction <D> on the iso-V
TangentV(D: gp_Dir): void;
// D: Mutated in place

// Tells if the normal is defined
IsNormalDefined(): boolean;

// Returns the normal direction
Normal(): gp_Dir;

// returns True if the curvature is defined
IsCurvatureDefined(): boolean;

// returns True if the point is umbilic (i.e
IsUmbilic(): boolean;

// Returns the maximum curvature
MaxCurvature(): number;

// Returns the minimum curvature
MinCurvature(): number;

// Returns the direction of the maximum and minimum curvature <MaxD> and <MinD>
CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;
// MaxD: Mutated in place
// MinD: Mutated in place

// Returns the mean curvature
MeanCurvature(): number;

// Returns the Gaussian curvature
GaussianCurvature(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_SLPropsATool: declare class HLRBRep_SLPropsATool

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contains a Shape and the bounds of its vertices, edges and faces in the DataStructure
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// compute the OutLinedShape of a Shape with an OutLiner, a Projector and create the Data Structure of a Shape
HLRBRep_ShapeToHLR: declare class HLRBRep_ShapeToHLR

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_SurfaceTool: declare class HLRBRep_SurfaceTool

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter extends math_FunctionSetWithDerivatives

// returns 2
NbVariables(): number;

// returns 2
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheExactInterCSurf: declare class HLRBRep_TheExactInterCSurf

// compute the solution it's possible to write to optimize
Perform(U: number, V: number, W: number, Rsnld: math_FunctionSetRoot, u0: number, v0: number, u1: number, v1: number, w0: number, w1: number): void;

// Returns TRUE if the creation completed without failure
IsDone(): boolean;

IsEmpty(): boolean;

// returns the intersection point The exception NotDone is raised if IsDone is false
Point(): gp_Pnt;

ParameterOnCurve(): number;

ParameterOnSurface(U?: number, V?: number): { U: number; V: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheIntConicCurveOfCInter: declare class HLRBRep_TheIntConicCurveOfCInter extends IntRes2d_Intersection

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheIntPCurvePCurveOfCInter: declare class HLRBRep_TheIntPCurvePCurveOfCInter extends IntRes2d_Intersection

constructor

// Set / get minimum number of points in polygon for intersection
SetMinNbSamples(theMinNbSamples: number): void;

GetMinNbSamples(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheInterferenceOfInterCSurf: declare class HLRBRep_TheInterferenceOfInterCSurf extends Intf_Interference

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter: declare class HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter extends IntRes2d_Intersection

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter extends Intf_Polygon2d

// Returns the tolerance of the polygon
DeflectionOverEstimation(): number;

SetDeflectionOverEstimation(x: number): void;

// Returns True if the polyline is closed
Closed(clos: boolean): void;
Closed(): boolean;
Closed(clos: boolean): void;
Closed(): boolean;

// Give the number of Segments in the polyline
NbSegments(): number;

// Returns the points of the segment <Index> in the Polygon
Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;
// theBegin: Mutated in place
// theEnd: Mutated in place

// Returns the parameter (On the curve) of the first point of the Polygon
InfParameter(): number;

// Returns the parameter (On the curve) of the last point of the Polygon
SupParameter(): number;

AutoIntersectionIsPossible(): boolean;

// Give an approximation of the parameter on the curve according to the discretization of the Curve
ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

CalculRegion(x: number, y: number, x1: number, x2: number, y1: number, y2: number): number;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_ThePolygonOfInterCSurf: declare class HLRBRep_ThePolygonOfInterCSurf

constructor

// Give the bounding box of the polygon
Bounding(): Bnd_Box;

DeflectionOverEstimation(): number;

SetDeflectionOverEstimation(x: number): void;

Closed(flag: boolean): void;
Closed(): boolean;
Closed(flag: boolean): void;
Closed(): boolean;

// Give the number of Segments in the polyline
NbSegments(): number;

// Give the point of range Index in the Polygon
BeginOfSeg(theIndex: number): gp_Pnt;

// Give the point of range Index in the Polygon
EndOfSeg(theIndex: number): gp_Pnt;

// Returns the parameter (On the curve) of the first point of the Polygon
InfParameter(): number;

// Returns the parameter (On the curve) of the last point of the Polygon
SupParameter(): number;

// Give an approximation of the parameter on the curve according to the discretization of the Curve
ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
