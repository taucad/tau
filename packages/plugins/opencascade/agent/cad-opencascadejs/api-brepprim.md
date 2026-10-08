# libcascade — BRepPrim

11 top-level symbols. Signatures are verbatim typescript.

BRepPrim_Builder: declare class BRepPrim_Builder

  // BRepPrim_Builder.constructor (constructor)
  constructor();
  constructor(B: BRep_Builder);

  // BRepPrim_Builder.Builder (method)
  Builder(): BRep_Builder;

  // BRepPrim_Builder.MakeShell (method)
  MakeShell(S: TopoDS_Shell): void;

  // BRepPrim_Builder.MakeFace (method)
  MakeFace(F: TopoDS_Face, P: gp_Pln): void;

  // BRepPrim_Builder.MakeWire (method)
  MakeWire(W: TopoDS_Wire): void;

  // BRepPrim_Builder.MakeDegeneratedEdge (method)
  MakeDegeneratedEdge(E: TopoDS_Edge): void;

  // BRepPrim_Builder.MakeEdge (method)
  MakeEdge(E: TopoDS_Edge, L: gp_Lin): void;
  MakeEdge(E: TopoDS_Edge, C: gp_Circ): void;

  // BRepPrim_Builder.SetPCurve (method)
  SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L: gp_Lin2d): void;
  SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, C: gp_Circ2d): void;
  SetPCurve(E: TopoDS_Edge, F: TopoDS_Face, L1: gp_Lin2d, L2: gp_Lin2d): void;

  // BRepPrim_Builder.MakeVertex (method)
  MakeVertex(V: TopoDS_Vertex, P: gp_Pnt): void;

  // BRepPrim_Builder.ReverseFace (method)
  ReverseFace(F: TopoDS_Face): void;

  // BRepPrim_Builder.AddEdgeVertex (method)
  AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P: number, direct: boolean): void;
  AddEdgeVertex(E: TopoDS_Edge, V: TopoDS_Vertex, P1: number, P2: number): void;

  // BRepPrim_Builder.SetParameters (method)
  SetParameters(E: TopoDS_Edge, V: TopoDS_Vertex, P1: number, P2: number): void;

  // BRepPrim_Builder.AddWireEdge (method)
  AddWireEdge(W: TopoDS_Wire, E: TopoDS_Edge, direct: boolean): void;

  // BRepPrim_Builder.AddFaceWire (method)
  AddFaceWire(F: TopoDS_Face, W: TopoDS_Wire): void;

  // BRepPrim_Builder.AddShellFace (method)
  AddShellFace(Sh: TopoDS_Shell, F: TopoDS_Face): void;

  // BRepPrim_Builder.CompleteEdge (method)
  CompleteEdge(E: TopoDS_Edge): void;

  // BRepPrim_Builder.CompleteWire (method)
  CompleteWire(W: TopoDS_Wire): void;

  // BRepPrim_Builder.CompleteFace (method)
  CompleteFace(F: TopoDS_Face): void;

  // BRepPrim_Builder.CompleteShell (method)
  CompleteShell(S: TopoDS_Shell): void;

  // BRepPrim_Builder.delete (method)
  delete(): void;

  // BRepPrim_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_Cone: declare class BRepPrim_Cone extends BRepPrim_Revolution

  // BRepPrim_Cone.constructor (constructor)
  constructor(Angle: number);
  constructor(Angle: number, Apex: gp_Pnt);
  constructor(Angle: number, Axes: gp_Ax2);
  constructor(R1: number, R2: number, H: number);
  constructor(Angle: number, Position: gp_Ax2, Height: number, Radius?: number);
  constructor(Center: gp_Pnt, R1: number, R2: number, H: number);
  constructor(Axes: gp_Ax2, R1: number, R2: number, H: number);

  // BRepPrim_Cone.MakeEmptyLateralFace (method)
  MakeEmptyLateralFace(): TopoDS_Face;

  // BRepPrim_Cone.delete (method)
  delete(): void;

  // BRepPrim_Cone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_Cylinder: declare class BRepPrim_Cylinder extends BRepPrim_Revolution

  // BRepPrim_Cylinder.constructor (constructor)
  constructor(Radius: number);
  constructor(Center: gp_Pnt, Radius: number);
  constructor(Axes: gp_Ax2, Radius: number);
  constructor(R: number, H: number);
  constructor(Position: gp_Ax2, Radius: number, Height: number);
  constructor(Center: gp_Pnt, R: number, H: number);

  // BRepPrim_Cylinder.MakeEmptyLateralFace (method)
  MakeEmptyLateralFace(): TopoDS_Face;

  // BRepPrim_Cylinder.delete (method)
  delete(): void;

  // BRepPrim_Cylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_Direction: typeof BRepPrim_Direction[keyof typeof BRepPrim_Direction]

  readonly BRepPrim_XMin: 'BRepPrim_XMin'

  readonly BRepPrim_XMax: 'BRepPrim_XMax'

  readonly BRepPrim_YMin: 'BRepPrim_YMin'

  readonly BRepPrim_YMax: 'BRepPrim_YMax'

  readonly BRepPrim_ZMin: 'BRepPrim_ZMin'

  readonly BRepPrim_ZMax: 'BRepPrim_ZMax'

BRepPrim_FaceBuilder: declare class BRepPrim_FaceBuilder

  // BRepPrim_FaceBuilder.constructor (constructor)
  constructor();
  constructor(B: BRep_Builder, S: Geom_Surface);
  constructor(B: BRep_Builder, S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number);

  // BRepPrim_FaceBuilder.Init (method)
  Init(B: BRep_Builder, S: Geom_Surface): void;
  Init(B: BRep_Builder, S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number): void;

  // BRepPrim_FaceBuilder.Face (method)
  Face(): TopoDS_Face;

  // BRepPrim_FaceBuilder.Edge (method)
  Edge(I: number): TopoDS_Edge;

  // BRepPrim_FaceBuilder.Vertex (method)
  Vertex(I: number): TopoDS_Vertex;

  // BRepPrim_FaceBuilder.delete (method)
  delete(): void;

  // BRepPrim_FaceBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_GWedge: declare class BRepPrim_GWedge

  // BRepPrim_GWedge.constructor (constructor)
  constructor();
  constructor(B: BRepPrim_Builder, Axes: gp_Ax2, dx: number, dy: number, dz: number);
  constructor(B: BRepPrim_Builder, Axes: gp_Ax2, dx: number, dy: number, dz: number, ltx: number);
  constructor(B: BRepPrim_Builder, Axes: gp_Ax2, xmin: number, ymin: number, zmin: number, z2min: number, x2min: number, xmax: number, ymax: number, zmax: number, z2max: number, x2max: number);

  // BRepPrim_GWedge.Axes (method)
  Axes(): gp_Ax2;

  // BRepPrim_GWedge.GetXMin (method)
  GetXMin(): number;

  // BRepPrim_GWedge.GetYMin (method)
  GetYMin(): number;

  // BRepPrim_GWedge.GetZMin (method)
  GetZMin(): number;

  // BRepPrim_GWedge.GetZ2Min (method)
  GetZ2Min(): number;

  // BRepPrim_GWedge.GetX2Min (method)
  GetX2Min(): number;

  // BRepPrim_GWedge.GetXMax (method)
  GetXMax(): number;

  // BRepPrim_GWedge.GetYMax (method)
  GetYMax(): number;

  // BRepPrim_GWedge.GetZMax (method)
  GetZMax(): number;

  // BRepPrim_GWedge.GetZ2Max (method)
  GetZ2Max(): number;

  // BRepPrim_GWedge.GetX2Max (method)
  GetX2Max(): number;

  // BRepPrim_GWedge.Open (method)
  Open(d1: BRepPrim_Direction): void;

  // BRepPrim_GWedge.Close (method)
  Close(d1: BRepPrim_Direction): void;

  // BRepPrim_GWedge.IsInfinite (method)
  IsInfinite(d1: BRepPrim_Direction): boolean;

  // BRepPrim_GWedge.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepPrim_GWedge.HasFace (method)
  HasFace(d1: BRepPrim_Direction): boolean;

  // BRepPrim_GWedge.Face (method)
  Face(d1: BRepPrim_Direction): TopoDS_Face;

  // BRepPrim_GWedge.Plane (method)
  Plane(d1: BRepPrim_Direction): gp_Pln;

  // BRepPrim_GWedge.HasWire (method)
  HasWire(d1: BRepPrim_Direction): boolean;

  // BRepPrim_GWedge.Wire (method)
  Wire(d1: BRepPrim_Direction): TopoDS_Wire;

  // BRepPrim_GWedge.HasEdge (method)
  HasEdge(d1: BRepPrim_Direction, d2: BRepPrim_Direction): boolean;

  // BRepPrim_GWedge.Edge (method)
  Edge(d1: BRepPrim_Direction, d2: BRepPrim_Direction): TopoDS_Edge;

  // BRepPrim_GWedge.Line (method)
  Line(d1: BRepPrim_Direction, d2: BRepPrim_Direction): gp_Lin;

  // BRepPrim_GWedge.HasVertex (method)
  HasVertex(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): boolean;

  // BRepPrim_GWedge.Vertex (method)
  Vertex(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): TopoDS_Vertex;

  // BRepPrim_GWedge.Point (method)
  Point(d1: BRepPrim_Direction, d2: BRepPrim_Direction, d3: BRepPrim_Direction): gp_Pnt;

  // BRepPrim_GWedge.IsDegeneratedShape (method)
  IsDegeneratedShape(): boolean;

  // BRepPrim_GWedge.delete (method)
  delete(): void;

  // BRepPrim_GWedge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_OneAxis: declare class BRepPrim_OneAxis

  // BRepPrim_OneAxis.SetMeridianOffset (method)
  SetMeridianOffset(MeridianOffset?: number): void;

  // BRepPrim_OneAxis.Axes (method)
  Axes(): gp_Ax2;
  Axes(A: gp_Ax2): void;

  // BRepPrim_OneAxis.Angle (method)
  Angle(): number;
  Angle(A: number): void;

  // BRepPrim_OneAxis.VMin (method)
  VMin(): number;
  VMin(V: number): void;

  // BRepPrim_OneAxis.VMax (method)
  VMax(): number;
  VMax(V: number): void;

  // BRepPrim_OneAxis.MakeEmptyLateralFace (method)
  MakeEmptyLateralFace(): TopoDS_Face;

  // BRepPrim_OneAxis.MakeEmptyMeridianEdge (method)
  MakeEmptyMeridianEdge(Ang: number): TopoDS_Edge;

  // BRepPrim_OneAxis.SetMeridianPCurve (method)
  SetMeridianPCurve(E: TopoDS_Edge, F: TopoDS_Face): void;

  // BRepPrim_OneAxis.MeridianValue (method)
  MeridianValue(V: number): gp_Pnt2d;

  // BRepPrim_OneAxis.MeridianOnAxis (method)
  MeridianOnAxis(V: number): boolean;

  // BRepPrim_OneAxis.MeridianClosed (method)
  MeridianClosed(): boolean;

  // BRepPrim_OneAxis.VMaxInfinite (method)
  VMaxInfinite(): boolean;

  // BRepPrim_OneAxis.VMinInfinite (method)
  VMinInfinite(): boolean;

  // BRepPrim_OneAxis.HasTop (method)
  HasTop(): boolean;

  // BRepPrim_OneAxis.HasBottom (method)
  HasBottom(): boolean;

  // BRepPrim_OneAxis.HasSides (method)
  HasSides(): boolean;

  // BRepPrim_OneAxis.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepPrim_OneAxis.LateralFace (method)
  LateralFace(): TopoDS_Face;

  // BRepPrim_OneAxis.TopFace (method)
  TopFace(): TopoDS_Face;

  // BRepPrim_OneAxis.BottomFace (method)
  BottomFace(): TopoDS_Face;

  // BRepPrim_OneAxis.StartFace (method)
  StartFace(): TopoDS_Face;

  // BRepPrim_OneAxis.EndFace (method)
  EndFace(): TopoDS_Face;

  // BRepPrim_OneAxis.LateralWire (method)
  LateralWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.LateralStartWire (method)
  LateralStartWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.LateralEndWire (method)
  LateralEndWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.TopWire (method)
  TopWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.BottomWire (method)
  BottomWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.StartWire (method)
  StartWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.AxisStartWire (method)
  AxisStartWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.EndWire (method)
  EndWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.AxisEndWire (method)
  AxisEndWire(): TopoDS_Wire;

  // BRepPrim_OneAxis.AxisEdge (method)
  AxisEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.StartEdge (method)
  StartEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.EndEdge (method)
  EndEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.StartTopEdge (method)
  StartTopEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.StartBottomEdge (method)
  StartBottomEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.EndTopEdge (method)
  EndTopEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.EndBottomEdge (method)
  EndBottomEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.TopEdge (method)
  TopEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.BottomEdge (method)
  BottomEdge(): TopoDS_Edge;

  // BRepPrim_OneAxis.AxisTopVertex (method)
  AxisTopVertex(): TopoDS_Vertex;

  // BRepPrim_OneAxis.AxisBottomVertex (method)
  AxisBottomVertex(): TopoDS_Vertex;

  // BRepPrim_OneAxis.TopStartVertex (method)
  TopStartVertex(): TopoDS_Vertex;

  // BRepPrim_OneAxis.TopEndVertex (method)
  TopEndVertex(): TopoDS_Vertex;

  // BRepPrim_OneAxis.BottomStartVertex (method)
  BottomStartVertex(): TopoDS_Vertex;

  // BRepPrim_OneAxis.BottomEndVertex (method)
  BottomEndVertex(): TopoDS_Vertex;

  // BRepPrim_OneAxis.delete (method)
  delete(): void;

  // BRepPrim_OneAxis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_Revolution: declare class BRepPrim_Revolution extends BRepPrim_OneAxis

  // BRepPrim_Revolution.constructor (constructor)
  constructor(A: gp_Ax2, VMin: number, VMax: number, M: Geom_Curve, PM: Geom2d_Curve);

  // BRepPrim_Revolution.MakeEmptyLateralFace (method)
  MakeEmptyLateralFace(): TopoDS_Face;

  // BRepPrim_Revolution.MakeEmptyMeridianEdge (method)
  MakeEmptyMeridianEdge(Ang: number): TopoDS_Edge;

  // BRepPrim_Revolution.MeridianValue (method)
  MeridianValue(V: number): gp_Pnt2d;

  // BRepPrim_Revolution.SetMeridianPCurve (method)
  SetMeridianPCurve(E: TopoDS_Edge, F: TopoDS_Face): void;

  // BRepPrim_Revolution.delete (method)
  delete(): void;

  // BRepPrim_Revolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_Sphere: declare class BRepPrim_Sphere extends BRepPrim_Revolution

  // BRepPrim_Sphere.constructor (constructor)
  constructor(Radius: number);
  constructor(Center: gp_Pnt, Radius: number);
  constructor(Axes: gp_Ax2, Radius: number);

  // BRepPrim_Sphere.MakeEmptyLateralFace (method)
  MakeEmptyLateralFace(): TopoDS_Face;

  // BRepPrim_Sphere.delete (method)
  delete(): void;

  // BRepPrim_Sphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_Torus: declare class BRepPrim_Torus extends BRepPrim_Revolution

  // BRepPrim_Torus.constructor (constructor)
  constructor(Major: number, Minor: number);
  constructor(Position: gp_Ax2, Major: number, Minor: number);
  constructor(Center: gp_Pnt, Major: number, Minor: number);

  // BRepPrim_Torus.MakeEmptyLateralFace (method)
  MakeEmptyLateralFace(): TopoDS_Face;

  // BRepPrim_Torus.delete (method)
  delete(): void;

  // BRepPrim_Torus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrim_Wedge: declare class BRepPrim_Wedge extends BRepPrim_GWedge

  // BRepPrim_Wedge.constructor (constructor)
  constructor();
  constructor(Axes: gp_Ax2, dx: number, dy: number, dz: number);
  constructor(Axes: gp_Ax2, dx: number, dy: number, dz: number, ltx: number);
  constructor(Axes: gp_Ax2, xmin: number, ymin: number, zmin: number, z2min: number, x2min: number, xmax: number, ymax: number, zmax: number, z2max: number, x2max: number);

  // BRepPrim_Wedge.delete (method)
  delete(): void;

  // BRepPrim_Wedge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
