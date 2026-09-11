# libcascade — BRep (3)

3 top-level symbols. Signatures are verbatim typescript.

BRep_Tool: declare class BRep_Tool

constructor

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

static Surface(F: TopoDS_Face, L: TopLoc_Location): Geom_Surface;
static Surface(F: TopoDS_Face): Geom_Surface;
static Surface(F: TopoDS_Face, L: TopLoc_Location): Geom_Surface;
static Surface(F: TopoDS_Face): Geom_Surface;

static Triangulation(theFace: TopoDS_Face, theLocation: TopLoc_Location, theMeshPurpose: number): Poly_Triangulation;

static Triangulations(theFace: TopoDS_Face, theLocation: TopLoc_Location): NCollection_List_handle_Poly_Triangulation;

static Tolerance(F: TopoDS_Face): number;
static Tolerance(E: TopoDS_Edge): number;
static Tolerance(V: TopoDS_Vertex): number;
static Tolerance(F: TopoDS_Face): number;
static Tolerance(E: TopoDS_Edge): number;
static Tolerance(V: TopoDS_Vertex): number;
static Tolerance(F: TopoDS_Face): number;
static Tolerance(E: TopoDS_Edge): number;
static Tolerance(V: TopoDS_Vertex): number;

static NaturalRestriction(F: TopoDS_Face): boolean;

static IsGeometric(F: TopoDS_Face): boolean;
static IsGeometric(E: TopoDS_Edge): boolean;
static IsGeometric(F: TopoDS_Face): boolean;
static IsGeometric(E: TopoDS_Edge): boolean;

static Curve(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };
static Curve(E: TopoDS_Edge, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };
static Curve(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };
static Curve(E: TopoDS_Edge, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };

static Polygon3D(E: TopoDS_Edge, L: TopLoc_Location): Poly_Polygon3D;

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

static CurveOnPlane(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

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

static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): Poly_PolygonOnTriangulation;
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): Poly_PolygonOnTriangulation;
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
static PolygonOnTriangulation(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): Poly_PolygonOnTriangulation;
static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };

static SameParameter(E: TopoDS_Edge): boolean;

static SameRange(E: TopoDS_Edge): boolean;

static Degenerated(E: TopoDS_Edge): boolean;

static Range(E: TopoDS_Edge, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, F: TopoDS_Face, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, F: TopoDS_Face, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { First: number; Last: number };
static Range(E: TopoDS_Edge, F: TopoDS_Face, First?: number, Last?: number): { First: number; Last: number };

static UVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static UVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static UVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static UVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;

static SetUVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static SetUVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static SetUVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
static SetUVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;

static HasContinuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;
static HasContinuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
static HasContinuity(E: TopoDS_Edge): boolean;
static HasContinuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;
static HasContinuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
static HasContinuity(E: TopoDS_Edge): boolean;
static HasContinuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;
static HasContinuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
static HasContinuity(E: TopoDS_Edge): boolean;

static Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): GeomAbs_Shape;
static Continuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): GeomAbs_Shape;
static Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): GeomAbs_Shape;
static Continuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): GeomAbs_Shape;

static MaxContinuity(theEdge: TopoDS_Edge): GeomAbs_Shape;

static Pnt(V: TopoDS_Vertex): gp_Pnt;

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

static Parameters(V: TopoDS_Vertex, F: TopoDS_Face): gp_Pnt2d;

static MaxTolerance(theShape: TopoDS_Shape, theSubShape: TopAbs_ShapeEnum): number;

delete(): void;

[Symbol.dispose](): void;

BRep_ListOfCurveRepresentation: NCollection_List_handle_BRep_CurveRepresentation

BRep_ListOfPointRepresentation: NCollection_List_handle_BRep_PointRepresentation
