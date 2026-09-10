# libcascade — ShapeBuild

4 top-level symbols. Signatures are verbatim typescript.

// This package provides basic building tools for other packages in ShapeHealing
ShapeBuild: declare class ShapeBuild

constructor

// Rebuilds a shape with substitution of some components Returns a {@link Geom_Surface`Geom_Surface`} which is the Plane XOY (Z positive) This allows to consider an UV space homologous to a 3D space, with this support surface
static PlaneXOY(): Geom_Plane;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides low-level operators for building an edge 3d curve, copying edge with replaced vertices etc
ShapeBuild_Edge: declare class ShapeBuild_Edge

constructor

// Copy edge and replace one or both its vertices to a given one(s)
CopyReplaceVertices(edge: TopoDS_Edge, V1: TopoDS_Vertex, V2: TopoDS_Vertex): TopoDS_Edge;

// Copies ranges for curve3d and all common pcurves from edge <fromedge> into edge <toedge>
CopyRanges(toedge: TopoDS_Edge, fromedge: TopoDS_Edge, alpha?: number, beta?: number): void;

// Sets range on 3d curve only
SetRange3d(edge: TopoDS_Edge, first: number, last: number): void;

// Makes a copy of pcurves from edge <fromedge> into edge <toedge>
CopyPCurves(toedge: TopoDS_Edge, fromedge: TopoDS_Edge): void;

// Make a copy of <edge> by call to `CopyReplaceVertices()` (i.e
Copy(edge: TopoDS_Edge, sharepcurves?: boolean): TopoDS_Edge;

// Removes the PCurve(s) which could be recorded in an Edge for the given Face
RemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface, loc: TopLoc_Location): void;
RemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface, loc: TopLoc_Location): void;
RemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface): void;
RemovePCurve(edge: TopoDS_Edge, surf: Geom_Surface, loc: TopLoc_Location): void;

// Replace the PCurve in an Edge for the given Face In case if edge is seam, i.e
ReplacePCurve(edge: TopoDS_Edge, pcurve: Geom2d_Curve, face: TopoDS_Face): void;

// Reassign edge pcurve lying on face <old> to another face
ReassignPCurve(edge: TopoDS_Edge, old: TopoDS_Face, sub: TopoDS_Face): boolean;

// Transforms the PCurve with given matrix and affinity U factor
TransformPCurve(pcurve: Geom2d_Curve, trans: gp_Trsf2d, uFact: number, aFirst?: number, aLast?: number): { returnValue: Geom2d_Curve; aFirst: number; aLast: number; [Symbol.dispose](): void };

// Removes the Curve3D recorded in an Edge
RemoveCurve3d(edge: TopoDS_Edge): void;

// Calls BRepTools::BuildCurve3D
BuildCurve3d(edge: TopoDS_Edge): boolean;

// Makes edge with curve and location
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
// edge: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Rebuilds a Shape by making pre-defined substitutions on some of its components
ShapeBuild_ReShape: declare class ShapeBuild_ReShape extends BRepTools_ReShape

constructor

// Applies the substitutions requests to a shape
Apply(shape: TopoDS_Shape, until: TopAbs_ShapeEnum, buildmode: number): TopoDS_Shape;
Apply(theShape: TopoDS_Shape, theUntil: TopAbs_ShapeEnum): TopoDS_Shape;
Apply(shape: TopoDS_Shape, until: TopAbs_ShapeEnum, buildmode: number): TopoDS_Shape;
Apply(theShape: TopoDS_Shape, theUntil: TopAbs_ShapeEnum): TopoDS_Shape;

// Returns a complete substitution status for a shape 0
Status(shape: TopoDS_Shape, newsh: TopoDS_Shape, last: boolean): number;
Status(status: ShapeExtend_Status): boolean;
Status(shape: TopoDS_Shape, newsh: TopoDS_Shape, last: boolean): number;
Status(status: ShapeExtend_Status): boolean;
// newsh: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides low-level functions used for constructing vertices
ShapeBuild_Vertex: declare class ShapeBuild_Vertex

constructor

// Combines new vertex from two others
CombineVertex(V1: TopoDS_Vertex, V2: TopoDS_Vertex, tolFactor: number): TopoDS_Vertex;
CombineVertex(pnt1: gp_Pnt, pnt2: gp_Pnt, tol1: number, tol2: number, tolFactor: number): TopoDS_Vertex;
CombineVertex(V1: TopoDS_Vertex, V2: TopoDS_Vertex, tolFactor: number): TopoDS_Vertex;
CombineVertex(pnt1: gp_Pnt, pnt2: gp_Pnt, tol1: number, tol2: number, tolFactor: number): TopoDS_Vertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
