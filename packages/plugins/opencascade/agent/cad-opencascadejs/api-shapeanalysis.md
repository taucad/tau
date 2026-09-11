# libcascade — ShapeAnalysis

15 top-level symbols. Signatures are verbatim typescript.

ShapeAnalysis: declare class ShapeAnalysis

constructor

static OuterWire(theFace: TopoDS_Face): TopoDS_Wire;

static TotCross2D(sewd: ShapeExtend_WireData, aFace: TopoDS_Face): number;

static ContourArea(theWire: TopoDS_Wire): number;

static IsOuterBound(face: TopoDS_Face): boolean;

static AdjustByPeriod(Val: number, ToVal: number, Period: number): number;

static AdjustToPeriod(Val: number, ValMin: number, ValMax: number): number;

static FindBounds(shape: TopoDS_Shape, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;

static GetFaceUVBounds(F: TopoDS_Face, Umin?: number, Umax?: number, Vmin?: number, Vmax?: number): { Umin: number; Umax: number; Vmin: number; Vmax: number };

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_BoxBndTreeSelector: declare class ShapeAnalysis_BoxBndTreeSelector

constructor

DefineBoxes(theFBox: Bnd_Box, theLBox: Bnd_Box): void;

DefineVertexes(theVf: TopoDS_Vertex, theVl: TopoDS_Vertex): void;

DefinePnt(theFPnt: gp_Pnt, theLPnt: gp_Pnt): void;

GetNb(): number;

SetNb(theNb: number): void;

LoadList(elem: number): void;

SetStop(): void;

SetTolerance(theTol: number): void;

ContWire(nbWire: number): boolean;

LastCheckStatus(theStatus: ShapeExtend_Status): boolean;

Reject(argNo0: Bnd_Box): boolean;

Accept(argNo0: number): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_CanonicalRecognition: declare class ShapeAnalysis_CanonicalRecognition

constructor

SetShape(theShape: TopoDS_Shape): void;

GetShape(): TopoDS_Shape;

GetGap(): number;

GetStatus(): number;

ClearStatus(): void;

IsPlane(theTol: number, thePln: gp_Pln): boolean;

IsCylinder(theTol: number, theCyl: gp_Cylinder): boolean;

IsCone(theTol: number, theCone: gp_Cone): boolean;

IsSphere(theTol: number, theSphere: gp_Sphere): boolean;

IsLine(theTol: number, theLin: gp_Lin): boolean;

IsCircle(theTol: number, theCirc: gp_Circ): boolean;

IsEllipse(theTol: number, theElips: gp_Elips): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_CheckSmallFace: declare class ShapeAnalysis_CheckSmallFace

constructor

IsSpotFace(F: TopoDS_Face, spot: gp_Pnt, spotol: number, tol: number): { returnValue: number; spotol: number };

CheckSpotFace(F: TopoDS_Face, tol?: number): boolean;

IsStripSupport(F: TopoDS_Face, tol?: number): boolean;

CheckStripEdges(E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number, dmax?: number): { returnValue: boolean; dmax: number };

FindStripEdges(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number, dmax?: number): { returnValue: boolean; dmax: number };

CheckSingleStrip(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;

CheckStripFace(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;

CheckSplittingVertices(F: TopoDS_Face, MapEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, MapParam: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher, theAllVert: TopoDS_Compound): number;

CheckPin(F: TopoDS_Face, whatrow?: number, sence?: number): { returnValue: boolean; whatrow: number; sence: number };

CheckTwisted(F: TopoDS_Face, paramu?: number, paramv?: number): { returnValue: boolean; paramu: number; paramv: number };

CheckPinFace(F: TopoDS_Face, mapEdges: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, toler: number): boolean;

CheckPinEdges(theFirstEdge: TopoDS_Edge, theSecondEdge: TopoDS_Edge, coef1: number, coef2: number, toler: number): boolean;

Status(status: ShapeExtend_Status): boolean;

SetTolerance(tol: number): void;

Tolerance(): number;

StatusSpot(status: ShapeExtend_Status): boolean;

StatusStrip(status: ShapeExtend_Status): boolean;

StatusPin(status: ShapeExtend_Status): boolean;

StatusTwisted(status: ShapeExtend_Status): boolean;

StatusSplitVert(status: ShapeExtend_Status): boolean;

StatusPinFace(status: ShapeExtend_Status): boolean;

StatusPinEdges(status: ShapeExtend_Status): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_Curve: declare class ShapeAnalysis_Curve

constructor

Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };

ProjectAct(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param?: number): { returnValue: number; param: number };

NextProject(paramPrev: number, C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
NextProject(paramPrev: number, C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param?: number): { returnValue: number; param: number };
NextProject(paramPrev: number, C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
NextProject(paramPrev: number, C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param?: number): { returnValue: number; param: number };

ValidateRange(Crv: Geom_Curve, First: number, Last: number, prec: number): { returnValue: boolean; First: number; Last: number };

FillBndBox(C2d: Geom2d_Curve, First: number, Last: number, NPoints: number, Exact: boolean, Box: Bnd_Box2d): void;

SelectForwardSeam(C1: Geom2d_Curve, C2: Geom2d_Curve): number;

static IsPlanar(pnts: NCollection_Array1_gp_Pnt, Normal: gp_XYZ, preci: number): boolean;
static IsPlanar(curve: Geom_Curve, Normal: gp_XYZ, preci: number): boolean;
static IsPlanar(pnts: NCollection_Array1_gp_Pnt, Normal: gp_XYZ, preci: number): boolean;
static IsPlanar(curve: Geom_Curve, Normal: gp_XYZ, preci: number): boolean;

static GetSamplePoints(curve: Geom2d_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt2d): boolean;
static GetSamplePoints(curve: Geom_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt): boolean;
static GetSamplePoints(curve: Geom2d_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt2d): boolean;
static GetSamplePoints(curve: Geom_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt): boolean;

static IsClosed(curve: Geom_Curve, preci?: number): boolean;

static IsPeriodic(curve: Geom_Curve): boolean;
static IsPeriodic(curve: Geom2d_Curve): boolean;
static IsPeriodic(curve: Geom_Curve): boolean;
static IsPeriodic(curve: Geom2d_Curve): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_Edge: declare class ShapeAnalysis_Edge

constructor

HasCurve3d(edge: TopoDS_Edge): boolean;

Curve3d(edge: TopoDS_Edge, cf: number, cl: number, orient: boolean): { returnValue: boolean; C3d: Geom_Curve; cf: number; cl: number; [Symbol.dispose](): void };

IsClosed3d(edge: TopoDS_Edge): boolean;

HasPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
HasPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
HasPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
HasPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

PCurve(edge: TopoDS_Edge, face: TopoDS_Face, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
PCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
PCurve(edge: TopoDS_Edge, face: TopoDS_Face, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
PCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };

BoundUV(edge: TopoDS_Edge, face: TopoDS_Face, first: gp_Pnt2d, last: gp_Pnt2d): boolean;
BoundUV(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, first: gp_Pnt2d, last: gp_Pnt2d): boolean;
BoundUV(edge: TopoDS_Edge, face: TopoDS_Face, first: gp_Pnt2d, last: gp_Pnt2d): boolean;
BoundUV(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, first: gp_Pnt2d, last: gp_Pnt2d): boolean;

IsSeam(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
IsSeam(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
IsSeam(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
IsSeam(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

FirstVertex(edge: TopoDS_Edge): TopoDS_Vertex;

LastVertex(edge: TopoDS_Edge): TopoDS_Vertex;

GetEndTangent2d(edge: TopoDS_Edge, face: TopoDS_Face, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;
GetEndTangent2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;
GetEndTangent2d(edge: TopoDS_Edge, face: TopoDS_Face, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;
GetEndTangent2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;

CheckVerticesWithCurve3d(edge: TopoDS_Edge, preci?: number, vtx?: number): boolean;

CheckVerticesWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face, preci: number, vtx: number): boolean;
CheckVerticesWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, preci: number, vtx: number): boolean;
CheckVerticesWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face, preci: number, vtx: number): boolean;
CheckVerticesWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, preci: number, vtx: number): boolean;

CheckVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };
CheckVertexTolerance(edge: TopoDS_Edge, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };
CheckVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };
CheckVertexTolerance(edge: TopoDS_Edge, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };

CheckCurve3dWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
CheckCurve3dWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
CheckCurve3dWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
CheckCurve3dWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

Status(status: ShapeExtend_Status): boolean;

CheckSameParameter(edge: TopoDS_Edge, maxdev: number, NbControl: number): { returnValue: boolean; maxdev: number };
CheckSameParameter(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theMaxdev: number, theNbControl: number): { returnValue: boolean; theMaxdev: number };
CheckSameParameter(edge: TopoDS_Edge, maxdev: number, NbControl: number): { returnValue: boolean; maxdev: number };
CheckSameParameter(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theMaxdev: number, theNbControl: number): { returnValue: boolean; theMaxdev: number };

CheckPCurveRange(theFirst: number, theLast: number, thePC: Geom2d_Curve): boolean;

CheckOverlapping(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theTolOverlap: number, theDomainDist: number): { returnValue: boolean; theTolOverlap: number };

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_FreeBoundData: declare class ShapeAnalysis_FreeBoundData extends Standard_Transient

constructor

Clear(): void;

SetFreeBound(freebound: TopoDS_Wire): void;

SetArea(area: number): void;

SetPerimeter(perimeter: number): void;

SetRatio(ratio: number): void;

SetWidth(width: number): void;

AddNotch(notch: TopoDS_Wire, width: number): void;

FreeBound(): TopoDS_Wire;

Area(): number;

Perimeter(): number;

Ratio(): number;

Width(): number;

NbNotches(): number;

Notches(): NCollection_HSequence_TopoDS_Shape;

Notch(index: number): TopoDS_Wire;

NotchWidth(index: number): number;
NotchWidth(notch: TopoDS_Wire): number;
NotchWidth(index: number): number;
NotchWidth(notch: TopoDS_Wire): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_FreeBounds: declare class ShapeAnalysis_FreeBounds

constructor

GetClosedWires(): TopoDS_Compound;

GetOpenWires(): TopoDS_Compound;

static ConnectEdgesToWires(edges: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): NCollection_HSequence_TopoDS_Shape;

static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): NCollection_HSequence_TopoDS_Shape;
static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean, vertices: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_HSequence_TopoDS_Shape;
static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): NCollection_HSequence_TopoDS_Shape;
static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean, vertices: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_HSequence_TopoDS_Shape;

static SplitWires(wires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): { closed: NCollection_HSequence_TopoDS_Shape; open: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

static DispatchWires(wires: NCollection_HSequence_TopoDS_Shape, closed: TopoDS_Compound, open: TopoDS_Compound): void;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_FreeBoundsProperties: declare class ShapeAnalysis_FreeBoundsProperties

constructor

Init(shape: TopoDS_Shape, tolerance: number, splitclosed: boolean, splitopen: boolean): void;
Init(shape: TopoDS_Shape, splitclosed: boolean, splitopen: boolean): void;
Init(shape: TopoDS_Shape, tolerance: number, splitclosed: boolean, splitopen: boolean): void;
Init(shape: TopoDS_Shape, splitclosed: boolean, splitopen: boolean): void;

Perform(): boolean;

IsLoaded(): boolean;

Shape(): TopoDS_Shape;

Tolerance(): number;

NbFreeBounds(): number;

NbClosedFreeBounds(): number;

NbOpenFreeBounds(): number;

ClosedFreeBounds(): NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData;

OpenFreeBounds(): NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData;

ClosedFreeBound(index: number): ShapeAnalysis_FreeBoundData;

OpenFreeBound(index: number): ShapeAnalysis_FreeBoundData;

DispatchBounds(): boolean;

CheckContours(prec?: number): boolean;

CheckNotches(prec: number): { returnValue: boolean; fbData: ShapeAnalysis_FreeBoundData; [Symbol.dispose](): void };
CheckNotches(freebound: TopoDS_Wire, num: number, notch: TopoDS_Wire, distMax: number, prec: number): { returnValue: boolean; distMax: number };
CheckNotches(prec: number): { returnValue: boolean; fbData: ShapeAnalysis_FreeBoundData; [Symbol.dispose](): void };
CheckNotches(freebound: TopoDS_Wire, num: number, notch: TopoDS_Wire, distMax: number, prec: number): { returnValue: boolean; distMax: number };

FillProperties(prec: number): { returnValue: boolean; fbData: ShapeAnalysis_FreeBoundData; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_Geom: declare class ShapeAnalysis_Geom

constructor

static NearestPlane(Pnts: NCollection_Array1_gp_Pnt, aPln: gp_Pln, Dmax?: number): { returnValue: boolean; Dmax: number };

static PositionTrsf(coefs: NCollection_HArray2_double, trsf: gp_Trsf, unit: number, prec: number): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_ShapeContents: declare class ShapeAnalysis_ShapeContents

constructor

Clear(): void;

ClearFlags(): void;

Perform(shape: TopoDS_Shape): void;

ModifyBigSplineMode(): boolean;

ModifyIndirectMode(): boolean;

ModifyOffsetSurfaceMode(): boolean;

ModifyTrimmed3dMode(): boolean;

ModifyOffsetCurveMode(): boolean;

ModifyTrimmed2dMode(): boolean;

NbSolids(): number;

NbShells(): number;

NbFaces(): number;

NbWires(): number;

NbEdges(): number;

NbVertices(): number;

NbSolidsWithVoids(): number;

NbBigSplines(): number;

NbC0Surfaces(): number;

NbC0Curves(): number;

NbOffsetSurf(): number;

NbIndirectSurf(): number;

NbOffsetCurves(): number;

NbTrimmedCurve2d(): number;

NbTrimmedCurve3d(): number;

NbBSplibeSurf(): number;

NbBezierSurf(): number;

NbTrimSurf(): number;

NbWireWitnSeam(): number;

NbWireWithSevSeams(): number;

NbFaceWithSevWires(): number;

NbNoPCurve(): number;

NbFreeFaces(): number;

NbFreeWires(): number;

NbFreeEdges(): number;

NbSharedSolids(): number;

NbSharedShells(): number;

NbSharedFaces(): number;

NbSharedWires(): number;

NbSharedFreeWires(): number;

NbSharedFreeEdges(): number;

NbSharedEdges(): number;

NbSharedVertices(): number;

BigSplineSec(): NCollection_HSequence_TopoDS_Shape;

IndirectSec(): NCollection_HSequence_TopoDS_Shape;

OffsetSurfaceSec(): NCollection_HSequence_TopoDS_Shape;

Trimmed3dSec(): NCollection_HSequence_TopoDS_Shape;

OffsetCurveSec(): NCollection_HSequence_TopoDS_Shape;

Trimmed2dSec(): NCollection_HSequence_TopoDS_Shape;

// DEPRECATED
ModifyOffestSurfaceMode(): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_ShapeTolerance: declare class ShapeAnalysis_ShapeTolerance

constructor

Tolerance(shape: TopoDS*Shape, mode: number, type*?: TopAbs_ShapeEnum): number;

OverTolerance(shape: TopoDS*Shape, value: number, type*?: TopAbs_ShapeEnum): NCollection_HSequence_TopoDS_Shape;

InTolerance(shape: TopoDS*Shape, valmin: number, valmax: number, type*?: TopAbs_ShapeEnum): NCollection_HSequence_TopoDS_Shape;

InitTolerance(): void;

AddTolerance(shape: TopoDS*Shape, type*?: TopAbs_ShapeEnum): void;

GlobalTolerance(mode: number): number;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_Shell: declare class ShapeAnalysis_Shell

constructor

Clear(): void;

LoadShells(shape: TopoDS_Shape): void;

CheckOrientedShells(shape: TopoDS_Shape, alsofree?: boolean, checkinternaledges?: boolean): boolean;

IsLoaded(shape: TopoDS_Shape): boolean;

NbLoaded(): number;

Loaded(num: number): TopoDS_Shape;

HasBadEdges(): boolean;

BadEdges(): TopoDS_Compound;

HasFreeEdges(): boolean;

FreeEdges(): TopoDS_Compound;

HasConnectedEdges(): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_Surface: declare class ShapeAnalysis_Surface extends Standard_Transient

constructor

Init(S: Geom_Surface): void;
Init(other: ShapeAnalysis_Surface): void;
Init(S: Geom_Surface): void;
Init(other: ShapeAnalysis_Surface): void;

SetDomain(U1: number, U2: number, V1: number, V2: number): void;

Surface(): Geom_Surface;

Adaptor3d(): GeomAdaptor_Surface;

TrueAdaptor3d(): GeomAdaptor_Surface;

Gap(): number;

Value(u: number, v: number): gp_Pnt;
Value(p2d: gp_Pnt2d): gp_Pnt;
Value(u: number, v: number): gp_Pnt;
Value(p2d: gp_Pnt2d): gp_Pnt;

HasSingularities(preci: number): boolean;

NbSingularities(preci: number): number;

Singularity(num: number, preci: number, P3d: gp_Pnt, firstP2d: gp_Pnt2d, lastP2d: gp_Pnt2d, firstpar?: number, lastpar?: number, uisodeg?: boolean): { returnValue: boolean; preci: number; firstpar: number; lastpar: number; uisodeg: boolean };

IsDegenerated(P3d: gp_Pnt, preci: number): boolean;
IsDegenerated(p2d1: gp_Pnt2d, p2d2: gp_Pnt2d, tol: number, ratio: number): boolean;
IsDegenerated(P3d: gp_Pnt, preci: number): boolean;
IsDegenerated(p2d1: gp_Pnt2d, p2d2: gp_Pnt2d, tol: number, ratio: number): boolean;

DegeneratedValues(P3d: gp_Pnt, preci: number, firstP2d: gp_Pnt2d, lastP2d: gp_Pnt2d, firstpar: number, lastpar: number, forward: boolean): { returnValue: boolean; firstpar: number; lastpar: number };

ProjectDegenerated(P3d: gp_Pnt, preci: number, neighbour: gp_Pnt2d, result: gp_Pnt2d): boolean;
ProjectDegenerated(nbrPnt: number, points: NCollection_Sequence_gp_Pnt, pnt2d: NCollection_Sequence_gp_Pnt2d, preci: number, direct: boolean): boolean;
ProjectDegenerated(P3d: gp_Pnt, preci: number, neighbour: gp_Pnt2d, result: gp_Pnt2d): boolean;
ProjectDegenerated(nbrPnt: number, points: NCollection_Sequence_gp_Pnt, pnt2d: NCollection_Sequence_gp_Pnt2d, preci: number, direct: boolean): boolean;

Bounds(ufirst?: number, ulast?: number, vfirst?: number, vlast?: number): { ufirst: number; ulast: number; vfirst: number; vlast: number };

ComputeBoundIsos(): void;

UIso(U: number): Geom_Curve;

VIso(V: number): Geom_Curve;

IsUClosed(preci?: number): boolean;

IsVClosed(preci?: number): boolean;

ValueOfUV(P3D: gp_Pnt, preci: number): gp_Pnt2d;

NextValueOfUV(p2dPrev: gp_Pnt2d, P3D: gp_Pnt, preci: number, maxpreci?: number): gp_Pnt2d;

UVFromIso(P3D: gp_Pnt, preci: number, U?: number, V?: number): { returnValue: number; U: number; V: number };

UCloseVal(): number;

VCloseVal(): number;

GetBoxUF(): Bnd_Box;

GetBoxUL(): Bnd_Box;

GetBoxVF(): Bnd_Box;

GetBoxVL(): Bnd_Box;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeAnalysis_TransferParameters: declare class ShapeAnalysis_TransferParameters extends Standard_Transient

constructor

Init(E: TopoDS_Edge, F: TopoDS_Face): void;

SetMaxTolerance(maxtol: number): void;

Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
Perform(Param: number, To2d: boolean): number;
Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
Perform(Param: number, To2d: boolean): number;

TransferRange(newEdge: TopoDS_Edge, prevPar: number, currPar: number, To2d: boolean): void;

IsSameRange(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
