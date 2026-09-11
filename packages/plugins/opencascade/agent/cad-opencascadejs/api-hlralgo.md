# libcascade — HLRAlgo

34 top-level symbols. Signatures are verbatim typescript.

HLRAlgo: declare class HLRAlgo

constructor

static UpdateMinMax(x: number, y: number, z: number, Min: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], Max: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): void;

static EnlargeMinMax(tol: number, Min: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], Max: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): void;

static InitMinMax(Big: number, Min: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number], Max: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): void;

static EncodeMinMax(Min: HLRAlgo_EdgesBlock_MinMaxIndices, Max: HLRAlgo_EdgesBlock_MinMaxIndices, MinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

static SizeBox(Min: HLRAlgo_EdgesBlock_MinMaxIndices, Max: HLRAlgo_EdgesBlock_MinMaxIndices): number;

static DecodeMinMax(MinMax: HLRAlgo_EdgesBlock_MinMaxIndices, Min: HLRAlgo_EdgesBlock_MinMaxIndices, Max: HLRAlgo_EdgesBlock_MinMaxIndices): void;

static CopyMinMax(IMin: HLRAlgo_EdgesBlock_MinMaxIndices, IMax: HLRAlgo_EdgesBlock_MinMaxIndices, OMin: HLRAlgo_EdgesBlock_MinMaxIndices, OMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

static AddMinMax(IMin: HLRAlgo_EdgesBlock_MinMaxIndices, IMax: HLRAlgo_EdgesBlock_MinMaxIndices, OMin: HLRAlgo_EdgesBlock_MinMaxIndices, OMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_BiPoint: declare class HLRAlgo_BiPoint

constructor

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

Hidden(): boolean;
Hidden(B: boolean): void;
Hidden(): boolean;
Hidden(B: boolean): void;

Indices(): HLRAlgo_BiPoint_IndicesT;

Points(): HLRAlgo_BiPoint_PointsT;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_BiPoint_PointsT: declare class HLRAlgo_BiPoint_PointsT

constructor

Pnt1: gp_XYZ

Pnt2: gp_XYZ

PntP1: gp_XYZ

PntP2: gp_XYZ

PntP12D(): gp_XY;

PntP22D(): gp_XY;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_EdgeIterator: declare class HLRAlgo_EdgeIterator

constructor

InitHidden(status: HLRAlgo_EdgeStatus): void;

MoreHidden(): boolean;

NextHidden(): void;

Hidden(Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

InitVisible(status: HLRAlgo_EdgeStatus): void;

MoreVisible(): boolean;

NextVisible(): void;

Visible(Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_EdgeStatus: declare class HLRAlgo_EdgeStatus

constructor

Initialize(Start: number, TolStart: number, End: number, TolEnd: number): void;

Bounds(theStart?: number, theTolStart?: number, theEnd?: number, theTolEnd?: number): { theStart: number; theTolStart: number; theEnd: number; theTolEnd: number };

NbVisiblePart(): number;

VisiblePart(Index: number, Start?: number, TolStart?: number, End?: number, TolEnd?: number): { Start: number; TolStart: number; End: number; TolEnd: number };

Hide(Start: number, TolStart: number, End: number, TolEnd: number, OnFace: boolean, OnBoundary: boolean): void;

HideAll(): void;

ShowAll(): void;

AllHidden(): boolean;
AllHidden(B: boolean): void;
AllHidden(): boolean;
AllHidden(B: boolean): void;

AllVisible(): boolean;
AllVisible(B: boolean): void;
AllVisible(): boolean;
AllVisible(B: boolean): void;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_EdgesBlock: declare class HLRAlgo_EdgesBlock extends Standard_Transient

constructor

NbEdges(): number;

Edge(I: number, EI: number): void;
Edge(I: number): number;
Edge(I: number, EI: number): void;
Edge(I: number): number;

Orientation(I: number, Or: TopAbs_Orientation): void;
Orientation(I: number): TopAbs_Orientation;
Orientation(I: number, Or: TopAbs_Orientation): void;
Orientation(I: number): TopAbs_Orientation;

OutLine(I: number): boolean;
OutLine(I: number, B: boolean): void;
OutLine(I: number): boolean;
OutLine(I: number, B: boolean): void;

Internal(I: number): boolean;
Internal(I: number, B: boolean): void;
Internal(I: number): boolean;
Internal(I: number, B: boolean): void;

Double(I: number): boolean;
Double(I: number, B: boolean): void;
Double(I: number): boolean;
Double(I: number, B: boolean): void;

IsoLine(I: number): boolean;
IsoLine(I: number, B: boolean): void;
IsoLine(I: number): boolean;
IsoLine(I: number, B: boolean): void;

UpdateMinMax(TotMinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_EdgesBlock_MinMaxIndices: declare class HLRAlgo_EdgesBlock_MinMaxIndices

constructor

Minimize(theMinMaxIndices: HLRAlgo_EdgesBlock_MinMaxIndices): HLRAlgo_EdgesBlock_MinMaxIndices;

Maximize(theMinMaxIndices: HLRAlgo_EdgesBlock_MinMaxIndices): HLRAlgo_EdgesBlock_MinMaxIndices;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_Interference: declare class HLRAlgo_Interference

constructor

Intersection(I: HLRAlgo_Intersection): void;
Intersection(): HLRAlgo_Intersection;
Intersection(I: HLRAlgo_Intersection): void;
Intersection(): HLRAlgo_Intersection;

Orientation(O: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;
Orientation(O: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;

Transition(Tr: TopAbs_Orientation): void;
Transition(): TopAbs_Orientation;
Transition(Tr: TopAbs_Orientation): void;
Transition(): TopAbs_Orientation;

BoundaryTransition(BTr: TopAbs_Orientation): void;
BoundaryTransition(): TopAbs_Orientation;
BoundaryTransition(BTr: TopAbs_Orientation): void;
BoundaryTransition(): TopAbs_Orientation;

ChangeIntersection(): HLRAlgo_Intersection;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_Intersection: declare class HLRAlgo_Intersection

constructor

Orientation(Ori: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;
Orientation(Ori: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;

Level(Lev: number): void;
Level(): number;
Level(Lev: number): void;
Level(): number;

SegIndex(SegInd: number): void;
SegIndex(): number;
SegIndex(SegInd: number): void;
SegIndex(): number;

Index(Ind: number): void;
Index(): number;
Index(Ind: number): void;
Index(): number;

Parameter(P: number): void;
Parameter(): number;
Parameter(P: number): void;
Parameter(): number;

Tolerance(T: number): void;
Tolerance(): number;
Tolerance(T: number): void;
Tolerance(): number;

State(S: TopAbs_State): void;
State(): TopAbs_State;
State(S: TopAbs_State): void;
State(): TopAbs_State;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_PolyAlgo: declare class HLRAlgo_PolyAlgo extends Standard_Transient

constructor

Init(theNbShells: number): void;

PolyShell(): NCollection_Array1_handle_HLRAlgo_PolyShellData;

ChangePolyShell(): NCollection_Array1_handle_HLRAlgo_PolyShellData;

Clear(): void;

Update(): void;

InitHide(): void;

MoreHide(): boolean;

NextHide(): void;

Hide(status: HLRAlgo_EdgeStatus, Index?: number, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; Index: number; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

InitShow(): void;

MoreShow(): boolean;

NextShow(): void;

Show(Index?: number, reg1?: boolean, regn?: boolean, outl?: boolean, intl?: boolean): { returnValue: HLRAlgo_BiPoint_PointsT; Index: number; reg1: boolean; regn: boolean; outl: boolean; intl: boolean; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_PolyData: declare class HLRAlgo_PolyData extends Standard_Transient

constructor

HNodes(HNodes: NCollection_HArray1_gp_XYZ): void;

HTData(HTData: NCollection_HArray1_HLRAlgo_TriangleData): void;

HPHDat(HPHDat: NCollection_HArray1_HLRAlgo_PolyHidingData): void;

FaceIndex(I: number): void;
FaceIndex(): number;
FaceIndex(I: number): void;
FaceIndex(): number;

Nodes(): NCollection_Array1_gp_XYZ;

TData(): NCollection_Array1_HLRAlgo_TriangleData;

PHDat(): NCollection_Array1_HLRAlgo_PolyHidingData;

UpdateGlobalMinMax(theBox: Bnd_Box): void;

Hiding(): boolean;

HideByPolyData(thePoints: HLRAlgo_BiPoint_PointsT, theTriangle: HLRAlgo_PolyData_Triangle, theIndices: HLRAlgo_BiPoint_IndicesT, HidingShell: boolean, status: HLRAlgo_EdgeStatus): void;

Indices(): HLRAlgo_PolyData_FaceIndices;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_PolyHidingData: declare class HLRAlgo_PolyHidingData

constructor

Set(Index: number, Minim: number, Maxim: number, A: number, B: number, C: number, D: number): void;

Indices(): HLRAlgo_PolyHidingData_TriangleIndices;

Plane(): HLRAlgo_PolyHidingData_PlaneT;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_PolyInternalNode: declare class HLRAlgo_PolyInternalNode extends Standard_Transient

constructor

Indices(): HLRAlgo_PolyInternalNode_NodeIndices;

Data(): HLRAlgo_PolyInternalNode_NodeData;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_PolyInternalSegment: declare class HLRAlgo_PolyInternalSegment

constructor

LstSg1: number

LstSg2: number

NxtSg1: number

NxtSg2: number

Conex1: number

Conex2: number

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_PolyMask: typeof HLRAlgo_PolyMask[keyof typeof HLRAlgo_PolyMask]

HLRAlgo_PolyShellData: declare class HLRAlgo_PolyShellData extends Standard_Transient

constructor

UpdateGlobalMinMax(theBox: Bnd_Box): void;

UpdateHiding(nbHiding: number): void;

Hiding(): boolean;

PolyData(): NCollection_Array1_handle_HLRAlgo_PolyData;

HidingPolyData(): NCollection_Array1_handle_HLRAlgo_PolyData;

Edges(): NCollection_List_HLRAlgo_BiPoint;

Indices(): HLRAlgo_PolyShellData_ShellIndices;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_Projector: declare class HLRAlgo_Projector

constructor

Set(T: gp_Trsf, Persp: boolean, Focus: number): void;

Directions(D1: gp_Vec2d, D2: gp_Vec2d, D3: gp_Vec2d): void;

Scaled(On?: boolean): void;

Perspective(): boolean;

Transformation(): gp_Trsf;

InvertedTransformation(): gp_Trsf;

FullTransformation(): gp_Trsf;

Focus(): number;

Transform(D: gp_Vec): void;
Transform(Pnt: gp_Pnt): void;
Transform(D: gp_Vec): void;
Transform(Pnt: gp_Pnt): void;

Project(P: gp_Pnt, Pout: gp_Pnt2d): void;
Project(P: gp_Pnt, X: number, Y: number, Z: number): { X: number; Y: number; Z: number };
Project(P: gp_Pnt, D1: gp_Vec, Pout: gp_Pnt2d, D1out: gp_Vec2d): void;
Project(P: gp_Pnt, Pout: gp_Pnt2d): void;
Project(P: gp_Pnt, X: number, Y: number, Z: number): { X: number; Y: number; Z: number };
Project(P: gp_Pnt, D1: gp_Vec, Pout: gp_Pnt2d, D1out: gp_Vec2d): void;
Project(P: gp_Pnt, Pout: gp_Pnt2d): void;
Project(P: gp_Pnt, X: number, Y: number, Z: number): { X: number; Y: number; Z: number };
Project(P: gp_Pnt, D1: gp_Vec, Pout: gp_Pnt2d, D1out: gp_Vec2d): void;

Shoot(X: number, Y: number): gp_Lin;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_TriangleData: declare class HLRAlgo_TriangleData

constructor

Node1: number

Node2: number

Node3: number

Flags: number

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_WiresBlock: declare class HLRAlgo_WiresBlock extends Standard_Transient

constructor

NbWires(): number;

Set(I: number, W: HLRAlgo_EdgesBlock): void;

Wire(I: number): HLRAlgo_EdgesBlock;

UpdateMinMax(theMinMaxes: HLRAlgo_EdgesBlock_MinMaxIndices): void;

MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

HLRAlgo_BiPoint_IndicesT: interface HLRAlgo_BiPoint_IndicesT

ShapeIndex: number

FaceConex1: number

Face1Pt1: number

Face1Pt2: number

FaceConex2: number

Face2Pt1: number

Face2Pt2: number

MinSeg: number

MaxSeg: number

SegFlags: number

HLRAlgo_PolyData_FaceIndices: interface HLRAlgo_PolyData_FaceIndices

Index: number

Min: number

Max: number

HLRAlgo_PolyData_Triangle: interface HLRAlgo_PolyData_Triangle

V1: gp_XY

V2: gp_XY

V3: gp_XY

Param: number

TolParam: number

TolAng: number

Tolerance: number

HLRAlgo_PolyHidingData_TriangleIndices: interface HLRAlgo_PolyHidingData_TriangleIndices

Index: number

Min: number

Max: number

HLRAlgo_PolyHidingData_PlaneT: interface HLRAlgo_PolyHidingData_PlaneT

Normal: gp_XYZ

D: number

HLRAlgo_PolyInternalNode_NodeIndices: interface HLRAlgo_PolyInternalNode_NodeIndices

NdSg: number

Flag: number

Edg1: number

Edg2: number

HLRAlgo_PolyInternalNode_NodeData: interface HLRAlgo_PolyInternalNode_NodeData

Point: gp_XYZ

Normal: gp_XYZ

UV: gp_XY

PCu1: number

PCu2: number

Scal: number

HLRAlgo_PolyShellData_ShellIndices: interface HLRAlgo_PolyShellData_ShellIndices

Min: number

Max: number

HLRAlgo_Array1OfPHDat: NCollection_Array1_HLRAlgo_PolyHidingData

HLRAlgo_Array1OfTData: NCollection_Array1_HLRAlgo_TriangleData

HLRAlgo_HArray1OfPHDat: NCollection_HArray1_HLRAlgo_PolyHidingData

HLRAlgo_HArray1OfTData: NCollection_HArray1_HLRAlgo_TriangleData

HLRAlgo_InterferenceList: NCollection_List_HLRAlgo_Interference

HLRAlgo_ListIteratorOfInterferenceList: NCollection_TListIterator_HLRAlgo_Interference

HLRAlgo_ListOfBPoint: NCollection_List_HLRAlgo_BiPoint
