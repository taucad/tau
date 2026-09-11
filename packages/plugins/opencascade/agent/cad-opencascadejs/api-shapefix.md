# libcascade — ShapeFix

19 top-level symbols. Signatures are verbatim typescript.

ShapeFix: declare class ShapeFix

constructor

static SameParameter(shape: TopoDS_Shape, enforce: boolean, preci?: number, theProgress?: Message_ProgressRange, theMsgReg?: ShapeExtend_BasicMsgRegistrator): boolean;

static EncodeRegularity(shape: TopoDS_Shape, tolang?: number): void;

static RemoveSmallEdges(shape: TopoDS_Shape, Tolerance: number): { returnValue: TopoDS_Shape; context: ShapeBuild_ReShape; [Symbol.dispose](): void };

static FixVertexPosition(theshape: TopoDS_Shape, theTolerance: number, thecontext: ShapeBuild_ReShape): boolean;

static LeastEdgeSize(theshape: TopoDS_Shape): number;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_ComposeShell: declare class ShapeFix_ComposeShell extends ShapeFix_Root

constructor

Init(Grid: ShapeExtend_CompositeSurface, L: TopLoc_Location, Face: TopoDS_Face, Prec: number): void;

ClosedMode(): boolean;

Perform(): boolean;

SplitEdges(): void;

Result(): TopoDS_Shape;

Status(status: ShapeExtend_Status): boolean;

SetTransferParamTool(TransferParam: ShapeAnalysis_TransferParameters): void;

GetTransferParamTool(): ShapeAnalysis_TransferParameters;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_Edge: declare class ShapeFix_Edge extends Standard_Transient

constructor

Projector(): ShapeConstruct_ProjectCurveOnSurface;

FixRemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixRemovePCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
FixRemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixRemovePCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

FixRemoveCurve3d(edge: TopoDS_Edge): boolean;

FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;

FixAddCurve3d(edge: TopoDS_Edge): boolean;

FixVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixVertexTolerance(edge: TopoDS_Edge): boolean;
FixVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixVertexTolerance(edge: TopoDS_Edge): boolean;

FixReversed2d(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixReversed2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;
FixReversed2d(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
FixReversed2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

FixSameParameter(edge: TopoDS_Edge, tolerance: number): boolean;
FixSameParameter(edge: TopoDS_Edge, face: TopoDS_Face, tolerance: number): boolean;
FixSameParameter(edge: TopoDS_Edge, tolerance: number): boolean;
FixSameParameter(edge: TopoDS_Edge, face: TopoDS_Face, tolerance: number): boolean;

Status(status: ShapeExtend_Status): boolean;

SetContext(context: ShapeBuild_ReShape): void;

Context(): ShapeBuild_ReShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_EdgeConnect: declare class ShapeFix_EdgeConnect

constructor

Add(aFirst: TopoDS_Edge, aSecond: TopoDS_Edge): void;
Add(aShape: TopoDS_Shape): void;
Add(aFirst: TopoDS_Edge, aSecond: TopoDS_Edge): void;
Add(aShape: TopoDS_Shape): void;

Build(): void;

Clear(): void;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_EdgeProjAux: declare class ShapeFix_EdgeProjAux extends Standard_Transient

constructor

Init(F: TopoDS_Face, E: TopoDS_Edge): void;

Compute(preci: number): void;

IsFirstDone(): boolean;

IsLastDone(): boolean;

FirstParam(): number;

LastParam(): number;

IsIso(C: Geom2d_Curve): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_Face: declare class ShapeFix_Face extends ShapeFix_Root

constructor

ClearModes(): void;

Init(face: TopoDS_Face): void;
Init(surf: Geom_Surface, preci: number, fwd: boolean): void;
Init(surf: ShapeAnalysis_Surface, preci: number, fwd: boolean): void;
Init(face: TopoDS_Face): void;
Init(surf: Geom_Surface, preci: number, fwd: boolean): void;
Init(surf: ShapeAnalysis_Surface, preci: number, fwd: boolean): void;
Init(face: TopoDS_Face): void;
Init(surf: Geom_Surface, preci: number, fwd: boolean): void;
Init(surf: ShapeAnalysis_Surface, preci: number, fwd: boolean): void;

SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

SetPrecision(preci: number): void;

SetMinTolerance(mintol: number): void;

SetMaxTolerance(maxtol: number): void;

FixWireMode(): number;

FixOrientationMode(): number;

FixAddNaturalBoundMode(): number;

FixMissingSeamMode(): number;

FixSmallAreaWireMode(): number;

RemoveSmallAreaFaceMode(): number;

FixIntersectingWiresMode(): number;

FixLoopWiresMode(): number;

FixSplitFaceMode(): number;

AutoCorrectPrecisionMode(): number;

FixPeriodicDegeneratedMode(): number;

Face(): TopoDS_Face;

Result(): TopoDS_Shape;

Add(wire: TopoDS_Wire): void;

Perform(theProgress?: Message_ProgressRange): boolean;

FixOrientation(): boolean;
FixOrientation(MapWires: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;
FixOrientation(): boolean;
FixOrientation(MapWires: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

FixAddNaturalBound(): boolean;

FixMissingSeam(): boolean;

FixSmallAreaWire(theIsRemoveSmallFace: boolean): boolean;

FixLoopWire(aResWires: NCollection_Sequence_TopoDS_Shape): boolean;

FixIntersectingWires(): boolean;

FixWiresTwoCoincEdges(): boolean;

FixSplitFace(MapWires: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

FixPeriodicDegenerated(): boolean;

Status(status: ShapeExtend_Status): boolean;

FixWireTool(): ShapeFix_Wire;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_FaceConnect: declare class ShapeFix_FaceConnect

constructor

Add(aFirst: TopoDS_Face, aSecond: TopoDS_Face): boolean;

Build(shell: TopoDS_Shell, sewtoler: number, fixtoler: number): TopoDS_Shell;

Clear(): void;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_FixSmallFace: declare class ShapeFix_FixSmallFace extends ShapeFix_Root

constructor

Init(S: TopoDS_Shape): void;

Perform(): void;

FixSpotFace(): TopoDS_Shape;

ReplaceVerticesInCaseOfSpot(F: TopoDS_Face, tol: number): boolean;

RemoveFacesInCaseOfSpot(F: TopoDS_Face): boolean;

FixStripFace(wasdone?: boolean): TopoDS_Shape;

ReplaceInCaseOfStrip(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;

RemoveFacesInCaseOfStrip(F: TopoDS_Face): boolean;

ComputeSharedEdgeForStripFace(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, F1: TopoDS_Face, tol: number): TopoDS_Edge;

FixSplitFace(S: TopoDS_Shape): TopoDS_Shape;

SplitOneFace(F: TopoDS_Face, theSplittedFaces: TopoDS_Compound): boolean;

FixFace(F: TopoDS_Face): TopoDS_Face;

FixShape(): TopoDS_Shape;

Shape(): TopoDS_Shape;

FixPinFace(F: TopoDS_Face): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_FixSmallSolid: declare class ShapeFix_FixSmallSolid extends ShapeFix_Root

constructor

SetFixMode(theMode: number): void;

SetVolumeThreshold(theThreshold?: number): void;

SetWidthFactorThreshold(theThreshold?: number): void;

Remove(theShape: TopoDS_Shape, theContext: ShapeBuild_ReShape): TopoDS_Shape;

Merge(theShape: TopoDS_Shape, theContext: ShapeBuild_ReShape): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_FreeBounds: declare class ShapeFix_FreeBounds

constructor

GetClosedWires(): TopoDS_Compound;

GetOpenWires(): TopoDS_Compound;

GetShape(): TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_IntersectionTool: declare class ShapeFix_IntersectionTool

constructor

Context(): ShapeBuild_ReShape;

SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, preci: number): boolean;

CutEdge(edge: TopoDS_Edge, pend: number, cut: number, face: TopoDS_Face, iscutline?: boolean): { returnValue: boolean; iscutline: boolean };

FixSelfIntersectWire(face: TopoDS_Face, NbSplit?: number, NbCut?: number, NbRemoved?: number): { returnValue: boolean; sewd: ShapeExtend_WireData; NbSplit: number; NbCut: number; NbRemoved: number; [Symbol.dispose](): void };

FixIntersectingWires(face: TopoDS_Face): boolean;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_Root: declare class ShapeFix_Root extends Standard_Transient

constructor

Set(Root: ShapeFix_Root): void;

SetContext(context: ShapeBuild_ReShape): void;

Context(): ShapeBuild_ReShape;

SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

SetPrecision(preci: number): void;

Precision(): number;

SetMinTolerance(mintol: number): void;

MinTolerance(): number;

SetMaxTolerance(maxtol: number): void;

MaxTolerance(): number;

LimitTolerance(toler: number): number;

SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
SendMsg(message: Message_Msg, gravity: Message_Gravity): void;
SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
SendMsg(message: Message_Msg, gravity: Message_Gravity): void;

SendWarning(shape: TopoDS_Shape, message: Message_Msg): void;
SendWarning(message: Message_Msg): void;
SendWarning(shape: TopoDS_Shape, message: Message_Msg): void;
SendWarning(message: Message_Msg): void;

SendFail(shape: TopoDS_Shape, message: Message_Msg): void;
SendFail(message: Message_Msg): void;
SendFail(shape: TopoDS_Shape, message: Message_Msg): void;
SendFail(message: Message_Msg): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_Shape: declare class ShapeFix_Shape extends ShapeFix_Root

constructor

Init(shape: TopoDS_Shape): void;

Perform(theProgress?: Message_ProgressRange): boolean;

Shape(): TopoDS_Shape;

FixSolidTool(): ShapeFix_Solid;

FixShellTool(): ShapeFix_Shell;

FixFaceTool(): ShapeFix_Face;

FixWireTool(): ShapeFix_Wire;

FixEdgeTool(): ShapeFix_Edge;

Status(status: ShapeExtend_Status): boolean;

SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

SetPrecision(preci: number): void;

SetMinTolerance(mintol: number): void;

SetMaxTolerance(maxtol: number): void;

FixSolidMode(): number;

FixFreeShellMode(): number;

FixFreeFaceMode(): number;

FixFreeWireMode(): number;

FixSameParameterMode(): number;

FixVertexPositionMode(): number;

FixVertexTolMode(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_ShapeTolerance: declare class ShapeFix_ShapeTolerance

constructor

LimitTolerance(shape: TopoDS_Shape, tmin: number, tmax?: number, styp?: TopAbs_ShapeEnum): boolean;

SetTolerance(shape: TopoDS_Shape, preci: number, styp?: TopAbs_ShapeEnum): void;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_Shell: declare class ShapeFix_Shell extends ShapeFix_Root

constructor

Init(shell: TopoDS_Shell): void;

Perform(theProgress?: Message_ProgressRange): boolean;

FixFaceOrientation(shell: TopoDS_Shell, isAccountMultiConex?: boolean, NonManifold?: boolean): boolean;

Shell(): TopoDS_Shell;

Shape(): TopoDS_Shape;

NbShells(): number;

ErrorFaces(): TopoDS_Compound;

Status(status: ShapeExtend_Status): boolean;

FixFaceTool(): ShapeFix_Face;

SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

SetPrecision(preci: number): void;

SetMinTolerance(mintol: number): void;

SetMaxTolerance(maxtol: number): void;

FixFaceMode(): number;

FixOrientationMode(): number;

SetNonManifoldFlag(isNonManifold: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_Solid: declare class ShapeFix_Solid extends ShapeFix_Root

constructor

Init(solid: TopoDS_Solid): void;

Perform(theProgress?: Message_ProgressRange): boolean;

SolidFromShell(shell: TopoDS_Shell): TopoDS_Solid;

Status(status: ShapeExtend_Status): boolean;

Solid(): TopoDS_Shape;

FixShellTool(): ShapeFix_Shell;

SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

SetPrecision(preci: number): void;

SetMinTolerance(mintol: number): void;

SetMaxTolerance(maxtol: number): void;

FixShellMode(): number;

FixShellOrientationMode(): number;

CreateOpenSolidMode(): boolean;

Shape(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_SplitCommonVertex: declare class ShapeFix_SplitCommonVertex extends ShapeFix_Root

constructor

Init(S: TopoDS_Shape): void;

Perform(): void;

Shape(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeFix_SplitTool: declare class ShapeFix_SplitTool

constructor

SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, param1: number, param2: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, fp: number, V1: TopoDS_Vertex, lp: number, V2: TopoDS_Vertex, face: TopoDS_Face, SeqE: NCollection_Sequence_TopoDS_Shape, aNum: number, context: ShapeBuild_ReShape, tol3d: number, tol2d: number): { returnValue: boolean; aNum: number };
SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, param1: number, param2: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, fp: number, V1: TopoDS_Vertex, lp: number, V2: TopoDS_Vertex, face: TopoDS_Face, SeqE: NCollection_Sequence_TopoDS_Shape, aNum: number, context: ShapeBuild_ReShape, tol3d: number, tol2d: number): { returnValue: boolean; aNum: number };
SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, param1: number, param2: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, fp: number, V1: TopoDS_Vertex, lp: number, V2: TopoDS_Vertex, face: TopoDS_Face, SeqE: NCollection_Sequence_TopoDS_Shape, aNum: number, context: ShapeBuild_ReShape, tol3d: number, tol2d: number): { returnValue: boolean; aNum: number };

CutEdge(edge: TopoDS_Edge, pend: number, cut: number, face: TopoDS_Face, iscutline?: boolean): { returnValue: boolean; iscutline: boolean };

delete(): void;

[Symbol.dispose](): void;

ShapeFix_Wire: declare class ShapeFix_Wire extends ShapeFix_Root

constructor

ClearModes(): void;

ClearStatuses(): void;

Init(wire: TopoDS_Wire, face: TopoDS_Face, prec: number): void;
Init(saw: ShapeAnalysis_Wire): void;
Init(wire: TopoDS_Wire, face: TopoDS_Face, prec: number): void;
Init(saw: ShapeAnalysis_Wire): void;

Load(wire: TopoDS_Wire): void;
Load(sbwd: ShapeExtend_WireData): void;
Load(wire: TopoDS_Wire): void;
Load(sbwd: ShapeExtend_WireData): void;

SetFace(face: TopoDS_Face): void;
SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetFace(face: TopoDS_Face): void;
SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;

SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surf: Geom_Surface): void;
SetSurface(surf: Geom_Surface, loc: TopLoc_Location): void;
SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surf: Geom_Surface): void;
SetSurface(surf: Geom_Surface, loc: TopLoc_Location): void;
SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
SetSurface(surf: Geom_Surface): void;
SetSurface(surf: Geom_Surface, loc: TopLoc_Location): void;

SetPrecision(preci: number): void;

SetMaxTailAngle(theMaxTailAngle: number): void;

SetMaxTailWidth(theMaxTailWidth: number): void;

IsLoaded(): boolean;

IsReady(): boolean;

NbEdges(): number;

Wire(): TopoDS_Wire;

WireAPIMake(): TopoDS_Wire;

Analyzer(): ShapeAnalysis_Wire;

WireData(): ShapeExtend_WireData;

Face(): TopoDS_Face;

ModifyTopologyMode(): boolean;

ModifyGeometryMode(): boolean;

ModifyRemoveLoopMode(): number;

ClosedWireMode(): boolean;

PreferencePCurveMode(): boolean;

FixGapsByRangesMode(): boolean;

FixReorderMode(): number;

FixSmallMode(): number;

FixConnectedMode(): number;

FixEdgeCurvesMode(): number;

FixDegeneratedMode(): number;

FixSelfIntersectionMode(): number;

FixLackingMode(): number;

FixGaps3dMode(): number;

FixGaps2dMode(): number;

FixReversed2dMode(): number;

FixRemovePCurveMode(): number;

FixAddPCurveMode(): number;

FixRemoveCurve3dMode(): number;

FixAddCurve3dMode(): number;

FixSeamMode(): number;

FixShiftedMode(): number;

FixSameParameterMode(): number;

FixVertexToleranceMode(): number;

FixNotchedEdgesMode(): number;

FixSelfIntersectingEdgeMode(): number;

FixIntersectingEdgesMode(): number;

FixNonAdjacentIntersectingEdgesMode(): number;

FixTailMode(): number;

Perform(theProgress?: Message_ProgressRange): boolean;

FixReorder(theModeBoth: boolean): boolean;
FixReorder(wi: ShapeAnalysis_WireOrder): boolean;
FixReorder(theModeBoth: boolean): boolean;
FixReorder(wi: ShapeAnalysis_WireOrder): boolean;

FixSmall(lockvtx: boolean, precsmall: number): number;
FixSmall(num: number, lockvtx: boolean, precsmall: number): boolean;
FixSmall(lockvtx: boolean, precsmall: number): number;
FixSmall(num: number, lockvtx: boolean, precsmall: number): boolean;

FixConnected(prec: number): boolean;
FixConnected(num: number, prec: number, theUpdateWire: boolean): boolean;
FixConnected(prec: number): boolean;
FixConnected(num: number, prec: number, theUpdateWire: boolean): boolean;

FixEdgeCurves(): boolean;

FixDegenerated(): boolean;
FixDegenerated(num: number): boolean;
FixDegenerated(): boolean;
FixDegenerated(num: number): boolean;

FixSelfIntersection(): boolean;

FixLacking(force: boolean): boolean;
FixLacking(num: number, force: boolean): boolean;
FixLacking(force: boolean): boolean;
FixLacking(num: number, force: boolean): boolean;

FixClosed(prec?: number): boolean;

FixGaps3d(): boolean;

FixGaps2d(): boolean;

FixSeam(num: number): boolean;

FixShifted(): boolean;

FixNotchedEdges(): boolean;

FixGap3d(num: number, convert?: boolean): boolean;

FixGap2d(num: number, convert?: boolean): boolean;

FixTails(): boolean;

StatusReorder(status: ShapeExtend_Status): boolean;

StatusSmall(status: ShapeExtend_Status): boolean;

StatusConnected(status: ShapeExtend_Status): boolean;

StatusEdgeCurves(status: ShapeExtend_Status): boolean;

StatusDegenerated(status: ShapeExtend_Status): boolean;

StatusSelfIntersection(status: ShapeExtend_Status): boolean;

StatusLacking(status: ShapeExtend_Status): boolean;

StatusClosed(status: ShapeExtend_Status): boolean;

StatusGaps3d(status: ShapeExtend_Status): boolean;

StatusGaps2d(status: ShapeExtend_Status): boolean;

StatusNotches(status: ShapeExtend_Status): boolean;

StatusRemovedSegment(): boolean;

StatusFixTails(status: ShapeExtend_Status): boolean;

LastFixStatus(status: ShapeExtend_Status): boolean;

FixEdgeTool(): ShapeFix_Edge;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
