# libcascade — ShapeBuild

4 top-level symbols. Signatures are verbatim typescript.

ShapeBuild: declare class ShapeBuild

  // ShapeBuild.constructor (constructor)
  constructor();

  // ShapeBuild.PlaneXOY (method)
  static PlaneXOY(): Geom_Plane;

  // ShapeBuild.delete (method)
  delete(): void;

  // ShapeBuild.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeBuild_Edge: declare class ShapeBuild_Edge

  // ShapeBuild_Edge.constructor (constructor)
  constructor();

  // ShapeBuild_Edge.CopyReplaceVertices (method)
  CopyReplaceVertices(edge: TopoDS_Edge, V1: TopoDS_Vertex, V2: TopoDS_Vertex): TopoDS_Edge;

  // ShapeBuild_Edge.CopyRanges (method)
  CopyRanges(toedge: TopoDS_Edge, fromedge: TopoDS_Edge, alpha?: number, beta?: number): void;

  // ShapeBuild_Edge.SetRange3d (method)
  SetRange3d(edge: TopoDS_Edge, first: number, last: number): void;

  // ShapeBuild_Edge.CopyPCurves (method)
  CopyPCurves(toedge: TopoDS_Edge, fromedge: TopoDS_Edge): void;

  // ShapeBuild_Edge.Copy (method)
  Copy(edge: TopoDS_Edge, sharepcurves?: boolean): TopoDS_Edge;

  // ShapeBuild_Edge.RemovePCurve (method)
  RemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): void;
  RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface): void;
  RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface, loc: TopLoc_Location): void;

  // ShapeBuild_Edge.ReplacePCurve (method)
  ReplacePCurve(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;

  // ShapeBuild_Edge.ReassignPCurve (method)
  ReassignPCurve(edge: TopoDS_Edge, old: TopoDS_Face, sub: TopoDS_Face): boolean;

  // ShapeBuild_Edge.TransformPCurve (method)
  TransformPCurve(pcurve: Geom2d_Curve, trans: gp_Trsf2d, uFact: number, aFirst?: number, aLast?: number): { returnValue: Geom2d_Curve; aFirst: number; aLast: number; [Symbol.dispose](): void };

  // ShapeBuild_Edge.RemoveCurve3d (method)
  RemoveCurve3d(edge: TopoDS_Edge): void;

  // ShapeBuild_Edge.BuildCurve3d (method)
  BuildCurve3d(edge: TopoDS_Edge): boolean;

  // ShapeBuild_Edge.MakeEdge (method)
  MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location): void;
  MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;
  MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): void;
  MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location, p1: number, p2: number): void;
  MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face, p1: number, p2: number): void;
  MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, p1: number, p2: number): void;

  // ShapeBuild_Edge.delete (method)
  delete(): void;

  // ShapeBuild_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeBuild_ReShape: declare class ShapeBuild_ReShape extends BRepTools_ReShape

  // ShapeBuild_ReShape.constructor (constructor)
  constructor();

  // ShapeBuild_ReShape.Apply (method)
  Apply(shape: TopoDS_Shape, until: TopAbs_ShapeEnum, buildmode: number): TopoDS_Shape;
  Apply(theShape: TopoDS_Shape, theUntil: TopAbs_ShapeEnum): TopoDS_Shape;

  // ShapeBuild_ReShape.Status (method)
  Status(shape: TopoDS_Shape, newsh: TopoDS_Shape, last: boolean): number;
  Status(status: ShapeExtend_Status): boolean;

  // ShapeBuild_ReShape.get_type_name (method)
  static get_type_name(): string;

  // ShapeBuild_ReShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeBuild_ReShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeBuild_ReShape.delete (method)
  delete(): void;

  // ShapeBuild_ReShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeBuild_Vertex: declare class ShapeBuild_Vertex

  // ShapeBuild_Vertex.constructor (constructor)
  constructor();

  // ShapeBuild_Vertex.CombineVertex (method)
  CombineVertex(V1: TopoDS_Vertex, V2: TopoDS_Vertex, tolFactor: number): TopoDS_Vertex;
  CombineVertex(pnt1: gp_Pnt, pnt2: gp_Pnt, tol1: number, tol2: number, tolFactor: number): TopoDS_Vertex;

  // ShapeBuild_Vertex.delete (method)
  delete(): void;

  // ShapeBuild_Vertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
