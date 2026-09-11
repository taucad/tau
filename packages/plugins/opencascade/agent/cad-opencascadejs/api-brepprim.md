# libcascade — BRepPrim

11 top-level symbols. Signatures are verbatim typescript.

BRepPrim_Builder: declare class BRepPrim_Builder

constructor

Builder(): BRep_Builder;

MakeShell(S: TopoDS_Shell): void;

MakeFace(F: TopoDS_Face, P: gp_Pln): void;

MakeWire(W: TopoDS_Wire): void;

MakeDegeneratedEdge(E: TopoDS_Edge): void;

MakeEdge(E: TopoDS_Edge, L: gp_Lin): void;
MakeEdge(E: TopoDS_Edge, C: gp_Circ): void;
MakeEdge(E: TopoDS_Edge, L: gp_Lin): void;
MakeEdge(E: TopoDS_Edge, C: gp_Circ): void;

SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, C: gp_Circ2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L1: gp_Lin2d, L2: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, C: gp_Circ2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L1: gp_Lin2d, L2: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, C: gp_Circ2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L1: gp_Lin2d, L2: gp_Lin2d): void;

MakeVertex(V: TopoDS_Vertex, P: gp_Pnt): void;

ReverseFace(F: TopoDS_Face): void;

AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P: number, direct: boolean): void;
AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P1: number, P2: number): void;
AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P: number, direct: boolean): void;
AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P1: number, P2: number): void;

SetParameters(E: TopoDS_Edge, V: TopoDS_Vertex, P1: number, P2: number): void;

AddWireEdge(W: TopoDS_Wire, E: TopoDS_Edge, direct: boolean): void;

AddFaceWire(F: TopoDS_Face, W: TopoDS_Wire): void;

AddShellFace(Sh: TopoDS_Shell, F: TopoDS_Face): void;

CompleteEdge(E: TopoDS_Edge): void;

CompleteWire(W: TopoDS_Wire): void;

CompleteFace(F: TopoDS_Face): void;

CompleteShell(S: TopoDS_Shell): void;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_Cone: declare class BRepPrim_Cone extends BRepPrim_Revolution

constructor

MakeEmptyLateralFace(): TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_Cylinder: declare class BRepPrim_Cylinder extends BRepPrim_Revolution

constructor

MakeEmptyLateralFace(): TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_Direction: typeof BRepPrim_Direction[keyof typeof BRepPrim_Direction]

BRepPrim_FaceBuilder: declare class BRepPrim_FaceBuilder

constructor

Init(B: BRep_Builder, S: Geom_Surface): void;
Init(B: BRep_Builder, S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number): void;
Init(B: BRep_Builder, S: Geom_Surface): void;
Init(B: BRep_Builder, S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number): void;

Face(): TopoDS_Face;

Edge(I: number): TopoDS_Edge;

Vertex(I: number): TopoDS_Vertex;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_GWedge: declare class BRepPrim_GWedge

constructor

Axes(): gp_Ax2;

GetXMin(): number;

GetYMin(): number;

GetZMin(): number;

GetZ2Min(): number;

GetX2Min(): number;

GetXMax(): number;

GetYMax(): number;

GetZMax(): number;

GetZ2Max(): number;

GetX2Max(): number;

Open(d1: BRepPrim_Direction): void;

Close(d1: BRepPrim_Direction): void;

IsInfinite(d1: BRepPrim_Direction): boolean;

Shell(): TopoDS_Shell;

HasFace(d1: BRepPrim_Direction): boolean;

Face(d1: BRepPrim_Direction): TopoDS_Face;

Plane(d1: BRepPrim_Direction): gp_Pln;

HasWire(d1: BRepPrim_Direction): boolean;

Wire(d1: BRepPrim_Direction): TopoDS_Wire;

HasEdge(d1: BRepPrim_Direction, d2: BRepPrim_Direction): boolean;

Edge(d1: BRepPrim_Direction, d2: BRepPrim_Direction): TopoDS_Edge;

Line(d1: BRepPrim_Direction, d2: BRepPrim_Direction): gp_Lin;

HasVertex(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): boolean;

Vertex(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): TopoDS_Vertex;

Point(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): gp_Pnt;

IsDegeneratedShape(): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_OneAxis: declare class BRepPrim_OneAxis

SetMeridianOffset(MeridianOffset?: number): void;

Axes(): gp_Ax2;
Axes(A: gp_Ax2): void;
Axes(): gp_Ax2;
Axes(A: gp_Ax2): void;

Angle(): number;
Angle(A: number): void;
Angle(): number;
Angle(A: number): void;

VMin(): number;
VMin(V: number): void;
VMin(): number;
VMin(V: number): void;

VMax(): number;
VMax(V: number): void;
VMax(): number;
VMax(V: number): void;

MakeEmptyLateralFace(): TopoDS_Face;

MakeEmptyMeridianEdge(Ang: number): TopoDS_Edge;

SetMeridianPCurve(E: TopoDS_Edge, F: TopoDS_Face): void;

MeridianValue(V: number): gp_Pnt2d;

MeridianOnAxis(V: number): boolean;

MeridianClosed(): boolean;

VMaxInfinite(): boolean;

VMinInfinite(): boolean;

HasTop(): boolean;

HasBottom(): boolean;

HasSides(): boolean;

Shell(): TopoDS_Shell;

LateralFace(): TopoDS_Face;

TopFace(): TopoDS_Face;

BottomFace(): TopoDS_Face;

StartFace(): TopoDS_Face;

EndFace(): TopoDS_Face;

LateralWire(): TopoDS_Wire;

LateralStartWire(): TopoDS_Wire;

LateralEndWire(): TopoDS_Wire;

TopWire(): TopoDS_Wire;

BottomWire(): TopoDS_Wire;

StartWire(): TopoDS_Wire;

AxisStartWire(): TopoDS_Wire;

EndWire(): TopoDS_Wire;

AxisEndWire(): TopoDS_Wire;

AxisEdge(): TopoDS_Edge;

StartEdge(): TopoDS_Edge;

EndEdge(): TopoDS_Edge;

StartTopEdge(): TopoDS_Edge;

StartBottomEdge(): TopoDS_Edge;

EndTopEdge(): TopoDS_Edge;

EndBottomEdge(): TopoDS_Edge;

TopEdge(): TopoDS_Edge;

BottomEdge(): TopoDS_Edge;

AxisTopVertex(): TopoDS_Vertex;

AxisBottomVertex(): TopoDS_Vertex;

TopStartVertex(): TopoDS_Vertex;

TopEndVertex(): TopoDS_Vertex;

BottomStartVertex(): TopoDS_Vertex;

BottomEndVertex(): TopoDS_Vertex;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_Revolution: declare class BRepPrim_Revolution extends BRepPrim_OneAxis

constructor

MakeEmptyLateralFace(): TopoDS_Face;

MakeEmptyMeridianEdge(Ang: number): TopoDS_Edge;

MeridianValue(V: number): gp_Pnt2d;

SetMeridianPCurve(E: TopoDS_Edge, F: TopoDS_Face): void;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_Sphere: declare class BRepPrim_Sphere extends BRepPrim_Revolution

constructor

MakeEmptyLateralFace(): TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_Torus: declare class BRepPrim_Torus extends BRepPrim_Revolution

constructor

MakeEmptyLateralFace(): TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;

BRepPrim_Wedge: declare class BRepPrim_Wedge extends BRepPrim_GWedge

constructor

delete(): void;

[Symbol.dispose](): void;
