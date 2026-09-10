# libcascade — BRepPrim

11 top-level symbols. Signatures are verbatim typescript.

// implements the abstract Builder with the BRep Builder
BRepPrim_Builder: declare class BRepPrim_Builder

constructor

Builder(): BRep_Builder;

// Make a empty Shell
MakeShell(S: TopoDS_Shell): void;
// S: Mutated in place

// Returns in <F> a Face built with the plane equation
MakeFace(F: TopoDS_Face, P: gp_Pln): void;
// F: Mutated in place

// Returns in <W> an empty Wire
MakeWire(W: TopoDS_Wire): void;
// W: Mutated in place

// Returns in <E> a degenerated edge
MakeDegeneratedEdge(E: TopoDS_Edge): void;
// E: Mutated in place

// Returns in <E> an Edge built with the line equation <L>
MakeEdge(E: TopoDS_Edge, L: gp_Lin): void;
MakeEdge(E: TopoDS_Edge, C: gp_Circ): void;
MakeEdge(E: TopoDS_Edge, L: gp_Lin): void;
MakeEdge(E: TopoDS_Edge, C: gp_Circ): void;
// E: Mutated in place

// Sets the line <L> to be the curve representing the edge <E> in the parametric space of the surface of <F>
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, C: gp_Circ2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L1: gp_Lin2d, L2: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, C: gp_Circ2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L1: gp_Lin2d, L2: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L: gp_Lin2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, C: gp_Circ2d): void;
SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L1: gp_Lin2d, L2: gp_Lin2d): void;
// E: Mutated in place

// Returns in <V> a Vertex built with the point
MakeVertex(V: TopoDS_Vertex, P: gp_Pnt): void;
// V: Mutated in place

// Reverses the Face <F>
ReverseFace(F: TopoDS_Face): void;
// F: Mutated in place

// Adds the Vertex <V> in the Edge <E>
AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P: number, direct: boolean): void;
AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P1: number, P2: number): void;
AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P: number, direct: boolean): void;
AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P1: number, P2: number): void;
// E: Mutated in place

// <P1,P2> are the parameters of the vertex on the edge
SetParameters(E: TopoDS_Edge, V: TopoDS_Vertex, P1: number, P2: number): void;
// E: Mutated in place

// Adds the Edge <E> in the Wire <W>, if direct is False the Edge is reversed
AddWireEdge(W: TopoDS_Wire, E: TopoDS_Edge, direct: boolean): void;
// W: Mutated in place

// Adds the Wire <W> in the Face <F>
AddFaceWire(F: TopoDS_Face, W: TopoDS_Wire): void;
// F: Mutated in place

// Adds the Face <F> in the Shell <Sh>
AddShellFace(Sh: TopoDS_Shell, F: TopoDS_Face): void;
// Sh: Mutated in place

// This is called once an edge is completed
CompleteEdge(E: TopoDS_Edge): void;
// E: Mutated in place

// This is called once a wire is completed
CompleteWire(W: TopoDS_Wire): void;
// W: Mutated in place

// This is called once a face is completed
CompleteFace(F: TopoDS_Face): void;
// F: Mutated in place

// This is called once a shell is completed
CompleteShell(S: TopoDS_Shell): void;
// S: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implement the cone primitive
BRepPrim_Cone: declare class BRepPrim_Cone extends BRepPrim_Revolution

constructor

// The surface normal should be directed towards the outside
MakeEmptyLateralFace(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Cylinder primitive
BRepPrim_Cylinder: declare class BRepPrim_Cylinder extends BRepPrim_Revolution

constructor

// The surface normal should be directed towards the outside
MakeEmptyLateralFace(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepPrim_Direction: typeof BRepPrim_Direction[keyof typeof BRepPrim_Direction]

// The FaceBuilder is an algorithm to build a BRep Face from a Geom Surface
BRepPrim_FaceBuilder: declare class BRepPrim_FaceBuilder

constructor

Init(B: BRep_Builder, S: Geom_Surface): void;
Init(B: BRep_Builder, S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number): void;
Init(B: BRep_Builder, S: Geom_Surface): void;
Init(B: BRep_Builder, S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number): void;

Face(): TopoDS_Face;

// Returns the edge of index _1 - Edge VMin 2 - Edge UMax 3 - Edge VMax 4 - Edge UMin._
Edge(I: number): TopoDS_Edge;

// Returns the vertex of index _1 - Vertex UMin,VMin 2 - Vertex UMax,VMin 3 - Vertex UMax,VMax 4 - Vertex UMin,VMax._
Vertex(I: number): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A wedge is defined by
BRepPrim_GWedge: declare class BRepPrim_GWedge

constructor

// Returns the coordinates system from <me>
Axes(): gp_Ax2;

// Returns Xmin value from <me>
GetXMin(): number;

// Returns YMin value from <me>
GetYMin(): number;

// Returns ZMin value from <me>
GetZMin(): number;

// Returns Z2Min value from <me>
GetZ2Min(): number;

// Returns X2Min value from <me>
GetX2Min(): number;

// Returns XMax value from <me>
GetXMax(): number;

// Returns YMax value from <me>
GetYMax(): number;

// Returns ZMax value from <me>
GetZMax(): number;

// Returns Z2Max value from <me>
GetZ2Max(): number;

// Returns X2Max value from <me>
GetX2Max(): number;

// Opens <me> in <d1> direction
Open(d1: BRepPrim_Direction): void;

// Closes <me> in <d1> direction
Close(d1: BRepPrim_Direction): void;

// Returns True if <me> is open in <d1> direction
IsInfinite(d1: BRepPrim_Direction): boolean;

// Returns the Shell containing the Faces of <me>
Shell(): TopoDS_Shell;

// Returns True if <me> has a Face in <d1> direction
HasFace(d1: BRepPrim_Direction): boolean;

// Returns the Face of <me> located in <d1> direction
Face(d1: BRepPrim_Direction): TopoDS_Face;

// Returns the plane of the Face of <me> located in <d1> direction
Plane(d1: BRepPrim_Direction): gp_Pln;

// Returns True if <me> has a Wire in <d1> direction
HasWire(d1: BRepPrim_Direction): boolean;

// Returns the Wire of <me> located in <d1> direction
Wire(d1: BRepPrim_Direction): TopoDS_Wire;

// Returns True if <me> has an Edge in <d1><d2> direction
HasEdge(d1: BRepPrim_Direction, d2: BRepPrim_Direction): boolean;

// Returns the Edge of <me> located in <d1><d2> direction
Edge(d1: BRepPrim_Direction, d2: BRepPrim_Direction): TopoDS_Edge;

// Returns the line of the Edge of <me> located in <d1><d2> direction
Line(d1: BRepPrim_Direction, d2: BRepPrim_Direction): gp_Lin;

// Returns True if <me> has a Vertex in <d1><d2><d3> direction
HasVertex(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): boolean;

// Returns the Vertex of <me> located in <d1><d2><d3> direction
Vertex(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): TopoDS_Vertex;

// Returns the point of the Vertex of <me> located in <d1><d2><d3> direction
Point(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): gp_Pnt;

// Checks a shape on degeneracy
IsDegeneratedShape(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Algorithm to build primitives with one axis of revolution
BRepPrim_OneAxis: declare class BRepPrim_OneAxis

// The MeridianOffset is added to the parameters on the meridian curve and to the V values of the pcurves
SetMeridianOffset(MeridianOffset?: number): void;

// Returns the Ax2 from <me>
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

// Returns a face with no edges
MakeEmptyLateralFace(): TopoDS_Face;

// Returns an edge with a 3D curve made from the meridian in the XZ plane rotated by <Ang> around the Z-axis
MakeEmptyMeridianEdge(Ang: number): TopoDS_Edge;

// Sets the parametric curve of the edge <E> in the face <F> to be the 2d representation of the meridian
SetMeridianPCurve(E: TopoDS_Edge, F: TopoDS_Face): void;
// E: Mutated in place

// Returns the meridian point at parameter <V> in the plane XZ
MeridianValue(V: number): gp_Pnt2d;

// Returns True if the point of parameter <V> on the meridian is on the Axis
MeridianOnAxis(V: number): boolean;

// Returns True if the meridian is closed
MeridianClosed(): boolean;

// Returns True if VMax is infinite
VMaxInfinite(): boolean;

// Returns True if VMin is infinite
VMinInfinite(): boolean;

// Returns True if there is a top face
HasTop(): boolean;

// Returns True if there is a bottom face
HasBottom(): boolean;

// Returns True if there are Start and End faces
HasSides(): boolean;

// Returns the Shell containing all the Faces of the primitive
Shell(): TopoDS_Shell;

// Returns the lateral Face
LateralFace(): TopoDS_Face;

// Returns the top planar Face
TopFace(): TopoDS_Face;

// Returns the Bottom planar Face
BottomFace(): TopoDS_Face;

// Returns the Face starting the slice, it is oriented toward the exterior of the primitive
StartFace(): TopoDS_Face;

// Returns the Face ending the slice, it is oriented toward the exterior of the primitive
EndFace(): TopoDS_Face;

// Returns the wire in the lateral face
LateralWire(): TopoDS_Wire;

// Returns the wire in the lateral face with the start edge
LateralStartWire(): TopoDS_Wire;

// Returns the wire with in lateral face with the end edge
LateralEndWire(): TopoDS_Wire;

// Returns the wire in the top face
TopWire(): TopoDS_Wire;

// Returns the wire in the bottom face
BottomWire(): TopoDS_Wire;

// Returns the wire in the start face
StartWire(): TopoDS_Wire;

// Returns the wire in the start face with the AxisEdge
AxisStartWire(): TopoDS_Wire;

// Returns the Wire in the end face
EndWire(): TopoDS_Wire;

// Returns the Wire in the end face with the AxisEdge
AxisEndWire(): TopoDS_Wire;

// Returns the Edge built along the Axis and oriented on +Z of the Axis
AxisEdge(): TopoDS_Edge;

// Returns the Edge at angle 0
StartEdge(): TopoDS_Edge;

// Returns the Edge at angle Angle
EndEdge(): TopoDS_Edge;

// Returns the linear Edge between start Face and top Face
StartTopEdge(): TopoDS_Edge;

// Returns the linear Edge between start Face and bottom Face
StartBottomEdge(): TopoDS_Edge;

// Returns the linear Edge between end Face and top Face
EndTopEdge(): TopoDS_Edge;

// Returns the linear Edge between end Face and bottom Face
EndBottomEdge(): TopoDS_Edge;

// Returns the edge at VMax
TopEdge(): TopoDS_Edge;

// Returns the edge at VMin
BottomEdge(): TopoDS_Edge;

// Returns the Vertex at the Top altitude on the axis
AxisTopVertex(): TopoDS_Vertex;

// Returns the Vertex at the Bottom altitude on the axis
AxisBottomVertex(): TopoDS_Vertex;

// Returns the vertex (0,VMax)
TopStartVertex(): TopoDS_Vertex;

// Returns the vertex (angle,VMax)
TopEndVertex(): TopoDS_Vertex;

// Returns the vertex (0,VMin)
BottomStartVertex(): TopoDS_Vertex;

// Returns the vertex (angle,VMax)
BottomEndVertex(): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implement the OneAxis algorithm for a revolution surface
BRepPrim_Revolution: declare class BRepPrim_Revolution extends BRepPrim_OneAxis

constructor

// The surface normal should be directed towards the outside
MakeEmptyLateralFace(): TopoDS_Face;

// Returns an edge with a 3D curve made from the meridian in the XZ plane rotated by <Ang> around the Z-axis
MakeEmptyMeridianEdge(Ang: number): TopoDS_Edge;

// Returns the meridian point at parameter <V> in the plane XZ
MeridianValue(V: number): gp_Pnt2d;

// Sets the parametric urve of the edge <E> in the face <F> to be the 2d representation of the meridian
SetMeridianPCurve(E: TopoDS_Edge, F: TopoDS_Face): void;
// E: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements the sphere primitive
BRepPrim_Sphere: declare class BRepPrim_Sphere extends BRepPrim_Revolution

constructor

// The surface normal should be directed towards the outside
MakeEmptyLateralFace(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements the torus primitive
BRepPrim_Torus: declare class BRepPrim_Torus extends BRepPrim_Revolution

constructor

// The surface normal should be directed towards the outside
MakeEmptyLateralFace(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides constructors without Builders
BRepPrim_Wedge: declare class BRepPrim_Wedge extends BRepPrim_GWedge

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
