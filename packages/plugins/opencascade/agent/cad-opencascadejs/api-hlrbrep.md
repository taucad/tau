# libcascade — HLRBRep

18 top-level symbols. Signatures are verbatim typescript.

// Hidden Lines Removal algorithms on the BRep DataStructure
HLRBRep: declare class HLRBRep

constructor

static MakeEdge(ec: HLRBRep_Curve, U1: number, U2: number): TopoDS_Edge;

static MakeEdge3d(ec: HLRBRep_Curve, U1: number, U2: number): TopoDS_Edge;

static PolyHLRAngleAndDeflection(InAngl: number, OutAngl?: number, OutDefl?: number): { OutAngl: number; OutDefl: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Inherited from InternalAlgo to provide methods with Shape from `TopoDS`
HLRBRep_Algo: declare class HLRBRep_Algo extends HLRBRep_InternalAlgo

constructor

// add the Shape
Add(S: TopoDS_Shape, SData: Standard_Transient, nbIso: number): void;
Add(S: TopoDS_Shape, nbIso: number): void;
Add(S: TopoDS_Shape, SData: Standard_Transient, nbIso: number): void;
Add(S: TopoDS_Shape, nbIso: number): void;

// return the index of the Shape and return 0 if the Shape is not found
Index(S: TopoDS_Shape): number;
Index(S: HLRTopoBRep_OutLiner): number;
Index(S: TopoDS_Shape): number;
Index(S: HLRTopoBRep_OutLiner): number;

// nullify all the results of OutLiner from HLRTopoBRep
OutLinedShapeNullify(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The private nested class AreaLimit represents a vertex on the Edge with the state on the left and the right
HLRBRep_AreaLimit: declare class HLRBRep_AreaLimit extends Standard_Transient

constructor

StateBefore(St: TopAbs_State): void;
StateBefore(): TopAbs_State;
StateBefore(St: TopAbs_State): void;
StateBefore(): TopAbs_State;

StateAfter(St: TopAbs_State): void;
StateAfter(): TopAbs_State;
StateAfter(St: TopAbs_State): void;
StateAfter(): TopAbs_State;

EdgeBefore(St: TopAbs_State): void;
EdgeBefore(): TopAbs_State;
EdgeBefore(St: TopAbs_State): void;
EdgeBefore(): TopAbs_State;

EdgeAfter(St: TopAbs_State): void;
EdgeAfter(): TopAbs_State;
EdgeAfter(St: TopAbs_State): void;
EdgeAfter(): TopAbs_State;

Previous(P: HLRBRep_AreaLimit): void;
Previous(): HLRBRep_AreaLimit;
Previous(P: HLRBRep_AreaLimit): void;
Previous(): HLRBRep_AreaLimit;

Next(N: HLRBRep_AreaLimit): void;
Next(): HLRBRep_AreaLimit;
Next(N: HLRBRep_AreaLimit): void;
Next(): HLRBRep_AreaLimit;

Vertex(): HLRAlgo_Intersection;

IsBoundary(): boolean;

IsInterference(): boolean;

Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_BCurveTool: declare class HLRBRep_BCurveTool

constructor

static FirstParameter(C: BRepAdaptor_Curve): number;

static LastParameter(C: BRepAdaptor_Curve): number;

static Continuity(C: BRepAdaptor_Curve): GeomAbs_Shape;

// Returns the number of intervals for continuity
static NbIntervals(C: BRepAdaptor_Curve, S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
static Intervals(C: BRepAdaptor_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

static IsClosed(C: BRepAdaptor_Curve): boolean;

static IsPeriodic(C: BRepAdaptor_Curve): boolean;

static Period(C: BRepAdaptor_Curve): number;

// Computes the point of parameter U on the curve
static Value(C: BRepAdaptor_Curve, U: number): gp_Pnt;

// Computes the point of parameter U on the curve
static D0(C: BRepAdaptor_Curve, U: number, P: gp_Pnt): void;
// P: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
static D1(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V: gp_Vec): void;
// P: Mutated in place
// V: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
static D2(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
static D3(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
static DN(C: BRepAdaptor_Curve, U: number, N: number): gp_Vec;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
static Resolution(C: BRepAdaptor_Curve, R3d: number): number;

// Returns the type of the curve in the current interval
static GetType(C: BRepAdaptor_Curve): GeomAbs_CurveType;

static Line(C: BRepAdaptor_Curve): gp_Lin;

static Circle(C: BRepAdaptor_Curve): gp_Circ;

static Ellipse(C: BRepAdaptor_Curve): gp_Elips;

static Hyperbola(C: BRepAdaptor_Curve): gp_Hypr;

static Parabola(C: BRepAdaptor_Curve): gp_Parab;

static Bezier(C: BRepAdaptor_Curve): Geom_BezierCurve;

static BSpline(C: BRepAdaptor_Curve): Geom_BSplineCurve;

static Degree(C: BRepAdaptor_Curve): number;

static IsRational(C: BRepAdaptor_Curve): boolean;

static NbPoles(C: BRepAdaptor_Curve): number;

static NbKnots(C: BRepAdaptor_Curve): number;

static Poles(C: BRepAdaptor_Curve, T: NCollection_Array1_gp_Pnt): void;

static PolesAndWeights(C: BRepAdaptor_Curve, T: NCollection_Array1_gp_Pnt, W: NCollection_Array1_double): void;

static NbSamples(C: BRepAdaptor_Curve, U0: number, U1: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contains the colors of a shape
HLRBRep_BiPnt2D: declare class HLRBRep_BiPnt2D

constructor

P1(): gp_Pnt2d;

P2(): gp_Pnt2d;

Shape(): TopoDS_Shape;
Shape(S: TopoDS_Shape): void;
Shape(): TopoDS_Shape;
Shape(S: TopoDS_Shape): void;

Rg1Line(): boolean;
Rg1Line(B: boolean): void;
Rg1Line(): boolean;
Rg1Line(B: boolean): void;

RgNLine(): boolean;
RgNLine(B: boolean): void;
RgNLine(): boolean;
RgNLine(B: boolean): void;

OutLine(): boolean;
OutLine(B: boolean): void;
OutLine(): boolean;
OutLine(B: boolean): void;

IntLine(): boolean;
IntLine(B: boolean): void;
IntLine(): boolean;
IntLine(B: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contains the colors of a shape
HLRBRep_BiPoint: declare class HLRBRep_BiPoint

constructor

P1(): gp_Pnt;

P2(): gp_Pnt;

Shape(): TopoDS_Shape;
Shape(S: TopoDS_Shape): void;
Shape(): TopoDS_Shape;
Shape(S: TopoDS_Shape): void;

Rg1Line(): boolean;
Rg1Line(B: boolean): void;
Rg1Line(): boolean;
Rg1Line(B: boolean): void;

RgNLine(): boolean;
RgNLine(B: boolean): void;
RgNLine(): boolean;
RgNLine(B: boolean): void;

OutLine(): boolean;
OutLine(B: boolean): void;
OutLine(): boolean;
OutLine(B: boolean): void;

IntLine(): boolean;
IntLine(B: boolean): void;
IntLine(): boolean;
IntLine(B: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_CInter: declare class HLRBRep_CInter extends IntRes2d_Intersection

constructor

// Set / get minimum number of points in polygon intersection
SetMinNbSamples(theMinNbSamples: number): void;

GetMinNbSamples(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_CLPropsATool: declare class HLRBRep_CLPropsATool

constructor

// Computes the point
static Value(A: HLRBRep_Curve, U: number, P: gp_Pnt2d): void;
// P: Mutated in place

// Computes the point
static D1(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place

// Computes the point
static D2(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Computes the point
static D3(A: HLRBRep_Curve, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// returns the order of continuity of the curve `
static Continuity(A: HLRBRep_Curve): number;

// returns the first parameter bound of the curve
static FirstParameter(A: HLRBRep_Curve): number;

// returns the last parameter bound of the curve
static LastParameter(A: HLRBRep_Curve): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a 2d curve by projection of a 3D curve on a plane with an optional perspective transformation
HLRBRep_Curve: declare class HLRBRep_Curve

constructor

Projector(Proj: HLRAlgo_Projector): void;

// Returns the 3D curve
Curve(): BRepAdaptor_Curve;
Curve(E: TopoDS_Edge): void;
Curve(): BRepAdaptor_Curve;
Curve(E: TopoDS_Edge): void;

// Returns the 3D curve
GetCurve(): BRepAdaptor_Curve;

// Returns the parameter on the 2d curve from the parameter on the 3d curve
Parameter2d(P3d: number): number;

// Returns the parameter on the 3d curve from the parameter on the 2d curve
Parameter3d(P2d: number): number;

// Update the minmax and the internal data
Update(TotMin: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], TotMax: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): number;

// Update the minmax returns tol for enlarge;
UpdateMinMax(TotMin: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], TotMax: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): number;

// Computes the Z coordinate of the point of parameter U on the curve in the viewing coordinate system
Z(U: number): number;

// Computes the 3D point of parameter U on the curve
Value3D(U: number): gp_Pnt;

// Computes the 3D point of parameter U on the curve
D0(U: number, P: gp_Pnt): void;
D0(U: number, P: gp_Pnt2d): void;
D0(U: number, P: gp_Pnt): void;
D0(U: number, P: gp_Pnt2d): void;
// P: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
D1(U: number, P: gp_Pnt, V: gp_Vec): void;
D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;
D1(U: number, P: gp_Pnt, V: gp_Vec): void;
D1(U: number, P: gp_Pnt2d, V: gp_Vec2d): void;
// P: Mutated in place
// V: Mutated in place

// Depending on <AtStart> computes the 2D point and tangent on the curve at sart (or at end)
Tangent(AtStart: boolean, P: gp_Pnt2d, D: gp_Dir2d): void;
// P: Mutated in place
// D: Mutated in place

FirstParameter(): number;

LastParameter(): number;

Continuity(): GeomAbs_Shape;

// If necessary, breaks the curve in intervals of continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

IsClosed(): boolean;

IsPeriodic(): boolean;

Period(): number;

// Computes the point of parameter U on the curve
Value(U: number): gp_Pnt2d;

// Raised if the continuity of the current interval is not C2
D2(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
D3(U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
DN(U: number, N: number): gp_Vec2d;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
Resolution(R3d: number): number;

// Returns the type of the curve in the current interval
GetType(): GeomAbs_CurveType;

Line(): gp_Lin2d;

Circle(): gp_Circ2d;

Ellipse(): gp_Elips2d;

Hyperbola(): gp_Hypr2d;

Parabola(): gp_Parab2d;

IsRational(): boolean;

Degree(): number;

NbPoles(): number;

Poles(TP: NCollection_Array1_gp_Pnt2d): void;
Poles(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d): void;
Poles(TP: NCollection_Array1_gp_Pnt2d): void;
Poles(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d): void;

PolesAndWeights(TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;
PolesAndWeights(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;
PolesAndWeights(TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;
PolesAndWeights(aCurve: Geom_BSplineCurve, TP: NCollection_Array1_gp_Pnt2d, TW: NCollection_Array1_double): void;

NbKnots(): number;

Knots(kn: NCollection_Array1_double): void;

Multiplicities(mu: NCollection_Array1_int): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_CurveTool: declare class HLRBRep_CurveTool

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_EdgeBuilder: declare class HLRBRep_EdgeBuilder

constructor

// Initialize an iteration on the areas
InitAreas(): void;

// Set the current area to the next area
NextArea(): void;

// Set the current area to the previous area
PreviousArea(): void;

// Returns True if there is a current area
HasArea(): boolean;

// Returns the state of the current area
AreaState(): TopAbs_State;

// Returns the edge state of the current area
AreaEdgeState(): TopAbs_State;

// Returns the AreaLimit beginning the current area
LeftLimit(): HLRBRep_AreaLimit;

// Returns the AreaLimit ending the current area
RightLimit(): HLRBRep_AreaLimit;

// Reinitialize the results iteration to the parts with State <ToBuild>
Builds(ToBuild: TopAbs_State): void;

// Returns True if there are more new edges to build
MoreEdges(): boolean;

// Proceeds to the next edge to build
NextEdge(): void;

// True if there are more vertices in the current new edge
MoreVertices(): boolean;

// Proceeds to the next vertex of the current edge
NextVertex(): void;

// Returns the current vertex of the current edge
Current(): HLRAlgo_Intersection;

// Returns True if the current vertex comes from the boundary of the edge
IsBoundary(): boolean;

// Returns True if the current vertex was an interference
IsInterference(): boolean;

// Returns the new orientation of the current vertex
Orientation(): TopAbs_Orientation;

Destroy(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_EdgeData: declare class HLRBRep_EdgeData

constructor

Set(Reg1: boolean, RegN: boolean, EG: TopoDS_Edge, V1: number, V2: number, Out1: boolean, Out2: boolean, Cut1: boolean, Cut2: boolean, Start: number, TolStart: number, End: number, TolEnd: number): void;

Selected(): boolean;
Selected(B: boolean): void;
Selected(): boolean;
Selected(B: boolean): void;

Rg1Line(): boolean;
Rg1Line(B: boolean): void;
Rg1Line(): boolean;
Rg1Line(B: boolean): void;

RgNLine(): boolean;
RgNLine(B: boolean): void;
RgNLine(): boolean;
RgNLine(B: boolean): void;

Vertical(): boolean;
Vertical(B: boolean): void;
Vertical(): boolean;
Vertical(B: boolean): void;

Simple(): boolean;
Simple(B: boolean): void;
Simple(): boolean;
Simple(B: boolean): void;

OutLVSta(): boolean;
OutLVSta(B: boolean): void;
OutLVSta(): boolean;
OutLVSta(B: boolean): void;

OutLVEnd(): boolean;
OutLVEnd(B: boolean): void;
OutLVEnd(): boolean;
OutLVEnd(B: boolean): void;

CutAtSta(): boolean;
CutAtSta(B: boolean): void;
CutAtSta(): boolean;
CutAtSta(B: boolean): void;

CutAtEnd(): boolean;
CutAtEnd(B: boolean): void;
CutAtEnd(): boolean;
CutAtEnd(B: boolean): void;

VerAtSta(): boolean;
VerAtSta(B: boolean): void;
VerAtSta(): boolean;
VerAtSta(B: boolean): void;

VerAtEnd(): boolean;
VerAtEnd(B: boolean): void;
VerAtEnd(): boolean;
VerAtEnd(B: boolean): void;

AutoIntersectionDone(): boolean;
AutoIntersectionDone(B: boolean): void;
AutoIntersectionDone(): boolean;
AutoIntersectionDone(B: boolean): void;

Used(): boolean;
Used(B: boolean): void;
Used(): boolean;
Used(B: boolean): void;

HideCount(): number;
HideCount(I: number): void;
HideCount(): number;
HideCount(I: number): void;

VSta(): number;
VSta(I: number): void;
VSta(): number;
VSta(I: number): void;

VEnd(): number;
VEnd(I: number): void;
VEnd(): number;
VEnd(I: number): void;

UpdateMinMax(theTotMinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

Status(): HLRAlgo_EdgeStatus;

ChangeGeometry(): HLRBRep_Curve;

Geometry(): HLRBRep_Curve;

Curve(): HLRBRep_Curve;

Tolerance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The EdgeFaceTool computes the UV coordinates at a given parameter on a Curve and a Surface
HLRBRep_EdgeFaceTool: declare class HLRBRep_EdgeFaceTool

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_EdgeIList: declare class HLRBRep_EdgeIList

constructor

// Add the interference _to the list <IL>._
static AddInterference(IL: NCollection_List_HLRAlgo_Interference, I: HLRAlgo_Interference, T: HLRBRep_EdgeInterferenceTool): void;
// IL: Mutated in place

// Process complex transitions on the list IL
static ProcessComplex(IL: NCollection_List_HLRAlgo_Interference, T: HLRBRep_EdgeInterferenceTool): void;
// IL: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements the methods required to instantiates the EdgeInterferenceList from {@link HLRAlgo `HLRAlgo`}
HLRBRep_EdgeInterferenceTool: declare class HLRBRep_EdgeInterferenceTool

LoadEdge(): void;

InitVertices(): void;

MoreVertices(): boolean;

NextVertex(): void;

CurrentVertex(): HLRAlgo_Intersection;

CurrentOrientation(): TopAbs_Orientation;

CurrentParameter(): number;

IsPeriodic(): boolean;

// Returns local geometric description of the Edge at parameter
EdgeGeometry(Param: number, Tgt: gp_Dir, Nrm: gp_Dir, Curv?: number): { Curv: number };
// Tgt: Mutated in place
// Nrm: Mutated in place

ParameterOfInterference(I: HLRAlgo_Interference): number;

// True if the two interferences are on the same geometric locus
SameInterferences(I1: HLRAlgo_Interference, I2: HLRAlgo_Interference): boolean;

// True if the Interference and the current Vertex are on the same geometric locus
SameVertexAndInterference(I: HLRAlgo_Interference): boolean;

// Returns the geometry of the boundary at the interference \*
InterferenceBoundaryGeometry(I: HLRAlgo_Interference, Tang: gp_Dir, Norm: gp_Dir, Curv?: number): { Curv: number };
// Tang: Mutated in place
// Norm: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_ExactIntersectionPointOfTheIntPCurvePCurveOfCInter

Perform(Poly1: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, Poly2: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, NumSegOn1: number, NumSegOn2: number, ParamOnSeg1: number, ParamOnSeg2: number): { NumSegOn1: number; NumSegOn2: number; ParamOnSeg1: number; ParamOnSeg2: number };
Perform(Uo: number, Vo: number, UInf: number, VInf: number, USup: number, VSup: number): void;
Perform(Poly1: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, Poly2: HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter, NumSegOn1: number, NumSegOn2: number, ParamOnSeg1: number, ParamOnSeg2: number): { NumSegOn1: number; NumSegOn2: number; ParamOnSeg1: number; ParamOnSeg2: number };
Perform(Uo: number, Vo: number, UInf: number, VInf: number, USup: number, VSup: number): void;

NbRoots(): number;

Roots(U?: number, V?: number): { U: number; V: number };

AnErrorOccurred(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_FaceData: declare class HLRBRep_FaceData

constructor

// <Or> is the orientation of the face
Set(FG: TopoDS_Face, Or: TopAbs_Orientation, Cl: boolean, NW: number): void;

// Set <NE> the number of edges of the wire number <WI>
SetWire(WI: number, NE: number): void;

// Set the edge number <EWI> of the wire <WI>
SetWEdge(WI: number, EWI: number, EI: number, Or: TopAbs_Orientation, OutL: boolean, Inte: boolean, Dble: boolean, IsoL: boolean): void;

Selected(): boolean;
Selected(B: boolean): void;
Selected(): boolean;
Selected(B: boolean): void;

Back(): boolean;
Back(B: boolean): void;
Back(): boolean;
Back(B: boolean): void;

Side(): boolean;
Side(B: boolean): void;
Side(): boolean;
Side(B: boolean): void;

Closed(): boolean;
Closed(B: boolean): void;
Closed(): boolean;
Closed(B: boolean): void;

Hiding(): boolean;
Hiding(B: boolean): void;
Hiding(): boolean;
Hiding(B: boolean): void;

Simple(): boolean;
Simple(B: boolean): void;
Simple(): boolean;
Simple(B: boolean): void;

Cut(): boolean;
Cut(B: boolean): void;
Cut(): boolean;
Cut(B: boolean): void;

WithOutL(): boolean;
WithOutL(B: boolean): void;
WithOutL(): boolean;
WithOutL(B: boolean): void;

Plane(): boolean;
Plane(B: boolean): void;
Plane(): boolean;
Plane(B: boolean): void;

Cylinder(): boolean;
Cylinder(B: boolean): void;
Cylinder(): boolean;
Cylinder(B: boolean): void;

Cone(): boolean;
Cone(B: boolean): void;
Cone(): boolean;
Cone(B: boolean): void;

Sphere(): boolean;
Sphere(B: boolean): void;
Sphere(): boolean;
Sphere(B: boolean): void;

Torus(): boolean;
Torus(B: boolean): void;
Torus(): boolean;
Torus(B: boolean): void;

Size(): number;
Size(S: number): void;
Size(): number;
Size(S: number): void;

Orientation(): TopAbs_Orientation;
Orientation(O: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;
Orientation(O: TopAbs_Orientation): void;

Wires(): HLRAlgo_WiresBlock;

Tolerance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_FaceIterator: declare class HLRBRep_FaceIterator

constructor

// Begin an exploration of the edges of the face <fd>
InitEdge(fd: HLRBRep_FaceData): void;
// fd: Mutated in place

MoreEdge(): boolean;

NextEdge(): void;

// Returns True if the current edge is the first of a wire
BeginningOfWire(): boolean;

// Returns True if the current edge is the last of a wire
EndOfWire(): boolean;

// Skip the current wire in the exploration
SkipWire(): void;

// Returns the edges of the current wire
Wire(): HLRAlgo_EdgesBlock;

Edge(): number;

Orientation(): TopAbs_Orientation;

OutLine(): boolean;

Internal(): boolean;

Double(): boolean;

IsoLine(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
