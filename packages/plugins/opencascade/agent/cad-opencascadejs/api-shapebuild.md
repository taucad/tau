# libcascade — ShapeBuild

4 top-level symbols. Signatures are verbatim typescript.

ShapeBuild: declare class ShapeBuild

constructor

static PlaneXOY(): Geom_Plane;

delete(): void;

[Symbol.dispose](): void;

ShapeBuild_Edge: declare class ShapeBuild_Edge

constructor

CopyReplaceVertices(edge: TopoDS_Edge, V1: TopoDS_Vertex, V2: TopoDS_Vertex): TopoDS_Edge;

CopyRanges(toedge: TopoDS_Edge, fromedge: TopoDS_Edge, alpha?: number, beta?: number): void;

SetRange3d(edge: TopoDS_Edge, first: number, last: number): void;

CopyPCurves(toedge: TopoDS_Edge, fromedge: TopoDS_Edge): void;

Copy(edge: TopoDS_Edge, sharepcurves?: boolean): TopoDS_Edge;

RemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface, loc: TopLoc_Location): void;
RemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface, loc: TopLoc_Location): void;
RemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface, loc: TopLoc_Location): void;

ReplacePCurve(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;

ReassignPCurve(edge: TopoDS_Edge, old: TopoDS_Face, sub: TopoDS_Face): boolean;

TransformPCurve(pcurve: Geom2d_Curve, trans: gp_Trsf2d, uFact: number, aFirst?: number, aLast?: number): { returnValue: Geom2d_Curve; aFirst: number; aLast: number; [Symbol.dispose](): void };

RemoveCurve3d(edge: TopoDS_Edge): void;

BuildCurve3d(edge: TopoDS_Edge): boolean;

MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): void;
MakeEdge(edge: TopoDS_Edge, curve: Geom_Curve, L: TopLoc_Location, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face, p1: number, p2: number): void;
MakeEdge(edge: TopoDS_Edge, pcurve: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, p1: number, p2: number): void;

delete(): void;

[Symbol.dispose](): void;

ShapeBuild_ReShape: declare class ShapeBuild_ReShape extends BRepTools_ReShape

constructor

Apply(shape: TopoDS_Shape, until: TopAbs_ShapeEnum, buildmode: number): TopoDS_Shape;
Apply(theShape: TopoDS_Shape, theUntil: TopAbs_ShapeEnum): TopoDS_Shape;
Apply(shape: TopoDS_Shape, until: TopAbs_ShapeEnum, buildmode: number): TopoDS_Shape;
Apply(theShape: TopoDS_Shape, theUntil: TopAbs_ShapeEnum): TopoDS_Shape;

Status(shape: TopoDS_Shape, newsh: TopoDS_Shape, last: boolean): number;
Status(status: ShapeExtend_Status): boolean;
Status(shape: TopoDS_Shape, newsh: TopoDS_Shape, last: boolean): number;
Status(status: ShapeExtend_Status): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ShapeBuild_Vertex: declare class ShapeBuild_Vertex

constructor

CombineVertex(V1: TopoDS_Vertex, V2: TopoDS_Vertex, tolFactor: number): TopoDS_Vertex;
CombineVertex(pnt1: gp_Pnt, pnt2: gp_Pnt, tol1: number, tol2: number, tolFactor: number): TopoDS_Vertex;
CombineVertex(V1: TopoDS_Vertex, V2: TopoDS_Vertex, tolFactor: number): TopoDS_Vertex;
CombineVertex(pnt1: gp_Pnt, pnt2: gp_Pnt, tol1: number, tol2: number, tolFactor: number): TopoDS_Vertex;

delete(): void;

[Symbol.dispose](): void;
