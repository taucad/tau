# libcascade — BRep (3)

3 top-level symbols. Signatures are verbatim typescript.

// Provides class methods to access to the geometry of BRep shapes
BRep_Tool: declare class BRep_Tool

constructor

// If S is Shell, returns True if it has no free boundaries (edges)
static IsClosed(S: TopoDS_Shape): boolean;
static IsClosed(E: TopoDS_Edge, F: TopoDS_Face): boolean;
static IsClosed(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): boolean;
static IsClosed(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): boolean;
static IsClosed(S: TopoDS_Shape): boolean;
static IsClosed(E: TopoDS_Edge, F: TopoDS_Face): boolean;
static IsClosed(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): boolean;
static IsClosed(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): boolean;
static IsClosed(S: TopoDS_Shape): boolean;
static IsClosed(E: TopoDS_Edge, F: TopoDS_Face): boolean;
static IsClosed(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): boolean;
static IsClosed(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): boolean;
static IsClosed(S: TopoDS_Shape): boolean;
static IsClosed(E: TopoDS_Edge, F: TopoDS_Face): boolean;
static IsClosed(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): boolean;
static IsClosed(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): boolean;

// Returns the geometric surface of the face
static Surface(F: TopoDS_Face, L: TopLoc_Location): Geom_Surface;
static Surface(F: TopoDS_Face): Geom_Surface;
static Surface(F: TopoDS_Face, L: TopLoc_Location): Geom_Surface;
static Surface(F: TopoDS_Face): Geom_Surface;
// L: Mutated in place

// Returns the triangulation of the face according to the mesh purpose
static Triangulation(theFace: TopoDS_Face, theLocation: TopLoc_Location, theMeshPurpose: number): Poly_Triangulation;
// theFace: the input face to find triangulation
// theLocation: the face location
// theMeshPurpose: a mesh purpose to find appropriate triangulation (NONE by default)

// Returns all triangulations of the face
static Triangulations(theFace: TopoDS_Face, theLocation: TopLoc_Location): NCollection_List_handle_Poly_Triangulation;
// theFace: the input face
// theLocation: the face location

// Returns the tolerance of the face
static Tolerance(F: TopoDS_Face): number;
static Tolerance(E: TopoDS_Edge): number;
static Tolerance(V: TopoDS_Vertex): number;
static Tolerance(F: TopoDS_Face): number;
static Tolerance(E: TopoDS_Edge): number;
static Tolerance(V: TopoDS_Vertex): number;
static Tolerance(F: TopoDS_Face): number;
static Tolerance(E: TopoDS_Edge): number;
static Tolerance(V: TopoDS_Vertex): number;

// Returns the NaturalRestriction flag of the face
static NaturalRestriction(F: TopoDS_Face): boolean;

// Returns True if <F> has a surface, false otherwise
static IsGeometric(F: TopoDS_Face): boolean;
static IsGeometric(E: TopoDS_Edge): boolean;
static IsGeometric(F: TopoDS_Face): boolean;
static IsGeometric(E: TopoDS_Edge): boolean;

// Returns the 3D curve of the edge
static Curve(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };
static Curve(E: TopoDS_Edge, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };
static Curve(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };
static Curve(E: TopoDS_Edge, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns the 3D polygon of the edge
static Polygon3D(E: TopoDS_Edge, L: TopLoc_Location): Poly_Polygon3D;
// L: Mutated in place

// Returns the curve associated to the edge in the parametric space of the surface
static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, F: TopoDS_Face, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First: number, Last: number, Index: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, F: TopoDS_Face, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First: number, Last: number, Index: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, F: TopoDS_Face, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First: number, Last: number, Index: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, F: TopoDS_Face, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First: number, Last: number, Index: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
static CurveOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
// L: Mutated in place

// For the planar surface builds the 2d curve for the edge by projection of the edge on plane
static CurveOnPlane(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

// Returns the polygon associated to the edge in the parametric space of the face
static PolygonOnSurface(E: TopoDS_Edge, F: TopoDS_Face): Poly_Polygon2D;
static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };
static PolygonOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): Poly_Polygon2D;
static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };
static PolygonOnSurface(E: TopoDS_Edge, F: TopoDS_Face): Poly_Polygon2D;
static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };
static PolygonOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): Poly_Polygon2D;
static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };
static PolygonOnSurface(E: TopoDS_Edge, F: TopoDS_Face): Poly_Polygon2D;
static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };
static PolygonOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): Poly_Polygon2D;
static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };
static PolygonOnSurface(E: TopoDS_Edge, F: TopoDS_Face): Poly_Polygon2D;
static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };
static PolygonOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): Poly_Polygon2D;
static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };

// Returns in
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): Poly_PolygonOnTriangulation;
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): Poly_PolygonOnTriangulation;
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): Poly_PolygonOnTriangulation;
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
// L: Mutated in place

// Returns the SameParameter flag for the edge
static SameParameter(E: TopoDS_Edge): boolean;

// Returns the SameRange flag for the edge
static SameRange(E: TopoDS_Edge): boolean;

// Returns True if the edge is degenerated
static Degenerated(E: TopoDS_Edge): boolean;

// Gets the range of the 3d curve
static Range(E: TopoDS_Edge, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, F: TopoDS_Face, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, F: TopoDS_Face, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, F: TopoDS_Face, First?: number, Last?: number): { First: number; Last: number };

// Gets the UV locations of the extremities of the edge
static UVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static UVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static UVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static UVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
// PFirst: Mutated in place
// PLast: Mutated in place

// Sets the UV locations of the extremities of the edge
static SetUVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static SetUVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static SetUVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static SetUVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;

// Returns True if the edge is on the surfaces of the two faces
static HasContinuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;
static HasContinuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
static HasContinuity(E: TopoDS_Edge): boolean;
static HasContinuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;
static HasContinuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
static HasContinuity(E: TopoDS_Edge): boolean;
static HasContinuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;
static HasContinuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
static HasContinuity(E: TopoDS_Edge): boolean;

// Returns the continuity
static Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): GeomAbs_Shape;
static Continuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): GeomAbs_Shape;
static Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): GeomAbs_Shape;
static Continuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): GeomAbs_Shape;

// Returns the max continuity of edge between some surfaces or GeomAbs_C0 if there are no such surfaces
static MaxContinuity(theEdge: TopoDS_Edge): GeomAbs_Shape;

// Returns the 3d point
static Pnt(V: TopoDS_Vertex): gp_Pnt;

// Returns the parameter of <V> on <E>
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge): number;
static Parameter(theV: TopoDS_Vertex, theE: TopoDS_Edge, theParam: number): { returnValue: boolean; theParam: number };
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, F: TopoDS_Face): number;
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): number;
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge): number;
static Parameter(theV: TopoDS_Vertex, theE: TopoDS_Edge, theParam: number): { returnValue: boolean; theParam: number };
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, F: TopoDS_Face): number;
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): number;
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge): number;
static Parameter(theV: TopoDS_Vertex, theE: TopoDS_Edge, theParam: number): { returnValue: boolean; theParam: number };
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, F: TopoDS_Face): number;
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): number;
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge): number;
static Parameter(theV: TopoDS_Vertex, theE: TopoDS_Edge, theParam: number): { returnValue: boolean; theParam: number };
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, F: TopoDS_Face): number;
static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): number;

// Returns the parameters of the vertex on the face
static Parameters(V: TopoDS_Vertex, F: TopoDS_Face): gp_Pnt2d;

// Returns the maximum tolerance of input shape subshapes
static MaxTolerance(theShape: TopoDS_Shape, theSubShape: TopAbs_ShapeEnum): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRep_ListOfCurveRepresentation: NCollection_List_handle_BRep_CurveRepresentation

BRep_ListOfPointRepresentation: NCollection_List_handle_BRep_PointRepresentation
