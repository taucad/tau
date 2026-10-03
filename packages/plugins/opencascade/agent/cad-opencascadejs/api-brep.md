# libcascade — BRep

23 top-level symbols. Signatures are verbatim typescript.

BRep_Builder: declare class BRep_Builder extends TopoDS_Builder

  // BRep_Builder.constructor (constructor)
  constructor();

  // BRep_Builder.MakeFace (method)
  MakeFace(F: TopoDS_Face): void;
  MakeFace(theFace: TopoDS_Face, theTriangulation: Poly_Triangulation): void;
  MakeFace(F: TopoDS_Face, S: Geom_Surface, Tol: number): void;
  MakeFace(theFace: TopoDS_Face, theTriangulations: NCollection_List_handle_Poly_Triangulation, theActiveTriangulation: Poly_Triangulation): void;
  MakeFace(F: TopoDS_Face, S: Geom_Surface, L: TopLoc_Location, Tol: number): void;

  // BRep_Builder.UpdateFace (method)
  UpdateFace(F: TopoDS_Face, S: Geom_Surface, L: TopLoc_Location, Tol: number): void;
  UpdateFace(theFace: TopoDS_Face, theTriangulation: Poly_Triangulation, theToReset: boolean): void;
  UpdateFace(F: TopoDS_Face, Tol: number): void;

  // BRep_Builder.NaturalRestriction (method)
  NaturalRestriction(F: TopoDS_Face, N: boolean): void;

  // BRep_Builder.MakeEdge (method)
  MakeEdge(E: TopoDS_Edge): void;
  MakeEdge(E: TopoDS_Edge, P: Poly_Polygon3D): void;
  MakeEdge(E: TopoDS_Edge, C: Geom_Curve, Tol: number): void;
  MakeEdge(E: TopoDS_Edge, N: Poly_PolygonOnTriangulation, T: Poly_Triangulation): void;
  MakeEdge(E: TopoDS_Edge, C: Geom_Curve, L: TopLoc_Location, Tol: number): void;
  MakeEdge(E: TopoDS_Edge, N: Poly_PolygonOnTriangulation, T: Poly_Triangulation, L: TopLoc_Location): void;

  // BRep_Builder.UpdateEdge (method)
  UpdateEdge(E: TopoDS_Edge, P: Poly_Polygon3D): void;
  UpdateEdge(E: TopoDS_Edge, Tol: number): void;
  UpdateEdge(E: TopoDS_Edge, C: Geom_Curve, Tol: number): void;
  UpdateEdge(E: TopoDS_Edge, P: Poly_Polygon3D, L: TopLoc_Location): void;
  UpdateEdge(E: TopoDS_Edge, N: Poly_PolygonOnTriangulation, T: Poly_Triangulation): void;
  UpdateEdge(E: TopoDS_Edge, P: Poly_Polygon2D, S: TopoDS_Face): void;
  UpdateEdge(E: TopoDS_Edge, C: Geom_Curve, L: TopLoc_Location, Tol: number): void;
  UpdateEdge(E: TopoDS_Edge, C: Geom2d_Curve, F: TopoDS_Face, Tol: number): void;
  UpdateEdge(E: TopoDS_Edge, N: Poly_PolygonOnTriangulation, T: Poly_Triangulation, L: TopLoc_Location): void;
  UpdateEdge(E: TopoDS_Edge, N1: Poly_PolygonOnTriangulation, N2: Poly_PolygonOnTriangulation, T: Poly_Triangulation): void;
  UpdateEdge(E: TopoDS_Edge, P: Poly_Polygon2D, S: Geom_Surface, T: TopLoc_Location): void;
  UpdateEdge(E: TopoDS_Edge, P1: Poly_Polygon2D, P2: Poly_Polygon2D, S: TopoDS_Face): void;
  UpdateEdge(E: TopoDS_Edge, C1: Geom2d_Curve, C2: Geom2d_Curve, F: TopoDS_Face, Tol: number): void;
  UpdateEdge(E: TopoDS_Edge, C: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, Tol: number): void;
  UpdateEdge(E: TopoDS_Edge, N1: Poly_PolygonOnTriangulation, N2: Poly_PolygonOnTriangulation, T: Poly_Triangulation, L: TopLoc_Location): void;
  UpdateEdge(E: TopoDS_Edge, P1: Poly_Polygon2D, P2: Poly_Polygon2D, S: Geom_Surface, L: TopLoc_Location): void;
  UpdateEdge(E: TopoDS_Edge, C1: Geom2d_Curve, C2: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, Tol: number): void;
  UpdateEdge(E: TopoDS_Edge, C: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, Tol: number, Pf: gp_Pnt2d, Pl: gp_Pnt2d): void;
  UpdateEdge(E: TopoDS_Edge, C1: Geom2d_Curve, C2: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, Tol: number, Pf: gp_Pnt2d, Pl: gp_Pnt2d): void;

  // BRep_Builder.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, C: GeomAbs_Shape): void;
  Continuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location, C: GeomAbs_Shape): void;

  // BRep_Builder.SameParameter (method)
  SameParameter(E: TopoDS_Edge, S: boolean): void;

  // BRep_Builder.SameRange (method)
  SameRange(E: TopoDS_Edge, S: boolean): void;

  // BRep_Builder.Degenerated (method)
  Degenerated(E: TopoDS_Edge, D: boolean): void;

  // BRep_Builder.Range (method)
  Range(E: TopoDS_Edge, First: number, Last: number, Only3d: boolean): void;
  Range(E: TopoDS_Edge, F: TopoDS_Face, First: number, Last: number): void;
  Range(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First: number, Last: number): void;

  // BRep_Builder.Transfert (method)
  Transfert(Ein: TopoDS_Edge, Eout: TopoDS_Edge): void;
  Transfert(Ein: TopoDS_Edge, Eout: TopoDS_Edge, Vin: TopoDS_Vertex, Vout: TopoDS_Vertex): void;

  // BRep_Builder.MakeVertex (method)
  MakeVertex(V: TopoDS_Vertex): void;
  MakeVertex(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): void;

  // BRep_Builder.UpdateVertex (method)
  UpdateVertex(V: TopoDS_Vertex, Tol: number): void;
  UpdateVertex(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): void;
  UpdateVertex(V: TopoDS_Vertex, P: number, E: TopoDS_Edge, Tol: number): void;
  UpdateVertex(V: TopoDS_Vertex, P: number, E: TopoDS_Edge, F: TopoDS_Face, Tol: number): void;
  UpdateVertex(Ve: TopoDS_Vertex, U: number, V: number, F: TopoDS_Face, Tol: number): void;
  UpdateVertex(V: TopoDS_Vertex, P: number, E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, Tol: number): void;

  // BRep_Builder.delete (method)
  delete(): void;

  // BRep_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_Curve3D: declare class BRep_Curve3D extends BRep_GCurve

  // BRep_Curve3D.constructor (constructor)
  constructor(C: Geom_Curve, L: TopLoc_Location);

  // BRep_Curve3D.D0 (method)
  D0(U: number, P: gp_Pnt): void;

  // BRep_Curve3D.IsCurve3D (method)
  IsCurve3D(): boolean;

  // BRep_Curve3D.Curve3D (method)
  Curve3D(): Geom_Curve;
  Curve3D(C: Geom_Curve): void;

  // BRep_Curve3D.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_Curve3D.get_type_name (method)
  static get_type_name(): string;

  // BRep_Curve3D.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_Curve3D.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_Curve3D.delete (method)
  delete(): void;

  // BRep_Curve3D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_CurveOn2Surfaces: declare class BRep_CurveOn2Surfaces extends BRep_CurveRepresentation

  // BRep_CurveOn2Surfaces.constructor (constructor)
  constructor(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location, C: GeomAbs_Shape);

  // BRep_CurveOn2Surfaces.IsRegularity (method)
  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

  // BRep_CurveOn2Surfaces.D0 (method)
  D0(U: number, P: gp_Pnt): void;

  // BRep_CurveOn2Surfaces.Surface (method)
  Surface(): Geom_Surface;

  // BRep_CurveOn2Surfaces.Surface2 (method)
  Surface2(): Geom_Surface;

  // BRep_CurveOn2Surfaces.Location2 (method)
  Location2(): TopLoc_Location;

  // BRep_CurveOn2Surfaces.Continuity (method)
  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;

  // BRep_CurveOn2Surfaces.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_CurveOn2Surfaces.get_type_name (method)
  static get_type_name(): string;

  // BRep_CurveOn2Surfaces.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_CurveOn2Surfaces.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_CurveOn2Surfaces.delete (method)
  delete(): void;

  // BRep_CurveOn2Surfaces.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_CurveOnClosedSurface: declare class BRep_CurveOnClosedSurface extends BRep_CurveOnSurface

  // BRep_CurveOnClosedSurface.constructor (constructor)
  constructor(PC1: Geom2d_Curve, PC2: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location, C: GeomAbs_Shape);

  // BRep_CurveOnClosedSurface.SetUVPoints2 (method)
  SetUVPoints2(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  // BRep_CurveOnClosedSurface.UVPoints2 (method)
  UVPoints2(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  // BRep_CurveOnClosedSurface.IsCurveOnClosedSurface (method)
  IsCurveOnClosedSurface(): boolean;

  // BRep_CurveOnClosedSurface.IsRegularity (method)
  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

  // BRep_CurveOnClosedSurface.PCurve2 (method)
  PCurve2(): Geom2d_Curve;
  PCurve2(C: Geom2d_Curve): void;

  // BRep_CurveOnClosedSurface.Surface2 (method)
  Surface2(): Geom_Surface;

  // BRep_CurveOnClosedSurface.Location2 (method)
  Location2(): TopLoc_Location;

  // BRep_CurveOnClosedSurface.Continuity (method)
  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;

  // BRep_CurveOnClosedSurface.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_CurveOnClosedSurface.Update (method)
  Update(): void;

  // BRep_CurveOnClosedSurface.get_type_name (method)
  static get_type_name(): string;

  // BRep_CurveOnClosedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_CurveOnClosedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_CurveOnClosedSurface.delete (method)
  delete(): void;

  // BRep_CurveOnClosedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_CurveOnSurface: declare class BRep_CurveOnSurface extends BRep_GCurve

  // BRep_CurveOnSurface.constructor (constructor)
  constructor(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location);

  // BRep_CurveOnSurface.SetUVPoints (method)
  SetUVPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  // BRep_CurveOnSurface.UVPoints (method)
  UVPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  // BRep_CurveOnSurface.D0 (method)
  D0(U: number, P: gp_Pnt): void;

  // BRep_CurveOnSurface.IsCurveOnSurface (method)
  IsCurveOnSurface(): boolean;
  IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  // BRep_CurveOnSurface.Surface (method)
  Surface(): Geom_Surface;

  // BRep_CurveOnSurface.PCurve (method)
  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;

  // BRep_CurveOnSurface.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_CurveOnSurface.Update (method)
  Update(): void;

  // BRep_CurveOnSurface.get_type_name (method)
  static get_type_name(): string;

  // BRep_CurveOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_CurveOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_CurveOnSurface.delete (method)
  delete(): void;

  // BRep_CurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_CurveRepresentation: declare class BRep_CurveRepresentation extends Standard_Transient

  // BRep_CurveRepresentation.IsCurve3D (method)
  IsCurve3D(): boolean;

  // BRep_CurveRepresentation.IsCurveOnSurface (method)
  IsCurveOnSurface(): boolean;
  IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  // BRep_CurveRepresentation.IsRegularity (method)
  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

  // BRep_CurveRepresentation.IsCurveOnClosedSurface (method)
  IsCurveOnClosedSurface(): boolean;

  // BRep_CurveRepresentation.IsPolygon3D (method)
  IsPolygon3D(): boolean;

  // BRep_CurveRepresentation.IsPolygonOnTriangulation (method)
  IsPolygonOnTriangulation(): boolean;
  IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;

  // BRep_CurveRepresentation.IsPolygonOnClosedTriangulation (method)
  IsPolygonOnClosedTriangulation(): boolean;

  // BRep_CurveRepresentation.IsPolygonOnSurface (method)
  IsPolygonOnSurface(): boolean;
  IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  // BRep_CurveRepresentation.IsPolygonOnClosedSurface (method)
  IsPolygonOnClosedSurface(): boolean;

  // BRep_CurveRepresentation.Location (method)
  Location(): TopLoc_Location;
  Location(L: TopLoc_Location): void;

  // BRep_CurveRepresentation.Curve3D (method)
  Curve3D(): Geom_Curve;
  Curve3D(C: Geom_Curve): void;

  // BRep_CurveRepresentation.Surface (method)
  Surface(): Geom_Surface;

  // BRep_CurveRepresentation.PCurve (method)
  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;

  // BRep_CurveRepresentation.PCurve2 (method)
  PCurve2(): Geom2d_Curve;
  PCurve2(C: Geom2d_Curve): void;

  // BRep_CurveRepresentation.Polygon3D (method)
  Polygon3D(): Poly_Polygon3D;
  Polygon3D(P: Poly_Polygon3D): void;

  // BRep_CurveRepresentation.Polygon (method)
  Polygon(): Poly_Polygon2D;
  Polygon(P: Poly_Polygon2D): void;

  // BRep_CurveRepresentation.Polygon2 (method)
  Polygon2(): Poly_Polygon2D;
  Polygon2(P: Poly_Polygon2D): void;

  // BRep_CurveRepresentation.Triangulation (method)
  Triangulation(): Poly_Triangulation;

  // BRep_CurveRepresentation.PolygonOnTriangulation (method)
  PolygonOnTriangulation(): Poly_PolygonOnTriangulation;
  PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;

  // BRep_CurveRepresentation.PolygonOnTriangulation2 (method)
  PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;
  PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;

  // BRep_CurveRepresentation.Surface2 (method)
  Surface2(): Geom_Surface;

  // BRep_CurveRepresentation.Location2 (method)
  Location2(): TopLoc_Location;

  // BRep_CurveRepresentation.Continuity (method)
  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;

  // BRep_CurveRepresentation.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_CurveRepresentation.get_type_name (method)
  static get_type_name(): string;

  // BRep_CurveRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_CurveRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_CurveRepresentation.delete (method)
  delete(): void;

  // BRep_CurveRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_GCurve: declare class BRep_GCurve extends BRep_CurveRepresentation

  // BRep_GCurve.SetRange (method)
  SetRange(First: number, Last: number): void;

  // BRep_GCurve.Range (method)
  Range(First?: number, Last?: number): { First: number; Last: number };

  // BRep_GCurve.First (method)
  First(): number;
  First(F: number): void;

  // BRep_GCurve.Last (method)
  Last(): number;
  Last(L: number): void;

  // BRep_GCurve.D0 (method)
  D0(U: number, P: gp_Pnt): void;

  // BRep_GCurve.Update (method)
  Update(): void;

  // BRep_GCurve.get_type_name (method)
  static get_type_name(): string;

  // BRep_GCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_GCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_GCurve.delete (method)
  delete(): void;

  // BRep_GCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PointOnCurve: declare class BRep_PointOnCurve extends BRep_PointRepresentation

  // BRep_PointOnCurve.constructor (constructor)
  constructor(P: number, C: Geom_Curve, L: TopLoc_Location);

  // BRep_PointOnCurve.IsPointOnCurve (method)
  IsPointOnCurve(): boolean;
  IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;

  // BRep_PointOnCurve.Curve (method)
  Curve(): Geom_Curve;
  Curve(C: Geom_Curve): void;

  // BRep_PointOnCurve.get_type_name (method)
  static get_type_name(): string;

  // BRep_PointOnCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PointOnCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PointOnCurve.delete (method)
  delete(): void;

  // BRep_PointOnCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PointOnCurveOnSurface: declare class BRep_PointOnCurveOnSurface extends BRep_PointsOnSurface

  // BRep_PointOnCurveOnSurface.constructor (constructor)
  constructor(P: number, C: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location);

  // BRep_PointOnCurveOnSurface.IsPointOnCurveOnSurface (method)
  IsPointOnCurveOnSurface(): boolean;
  IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;

  // BRep_PointOnCurveOnSurface.PCurve (method)
  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;

  // BRep_PointOnCurveOnSurface.get_type_name (method)
  static get_type_name(): string;

  // BRep_PointOnCurveOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PointOnCurveOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PointOnCurveOnSurface.delete (method)
  delete(): void;

  // BRep_PointOnCurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PointOnSurface: declare class BRep_PointOnSurface extends BRep_PointsOnSurface

  // BRep_PointOnSurface.constructor (constructor)
  constructor(P1: number, P2: number, S: Geom_Surface, L: TopLoc_Location);

  // BRep_PointOnSurface.IsPointOnSurface (method)
  IsPointOnSurface(): boolean;
  IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  // BRep_PointOnSurface.Parameter2 (method)
  Parameter2(): number;
  Parameter2(P: number): void;

  // BRep_PointOnSurface.get_type_name (method)
  static get_type_name(): string;

  // BRep_PointOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PointOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PointOnSurface.delete (method)
  delete(): void;

  // BRep_PointOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PointRepresentation: declare class BRep_PointRepresentation extends Standard_Transient

  // BRep_PointRepresentation.IsPointOnCurve (method)
  IsPointOnCurve(): boolean;
  IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;

  // BRep_PointRepresentation.IsPointOnCurveOnSurface (method)
  IsPointOnCurveOnSurface(): boolean;
  IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;

  // BRep_PointRepresentation.IsPointOnSurface (method)
  IsPointOnSurface(): boolean;
  IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  // BRep_PointRepresentation.Location (method)
  Location(): TopLoc_Location;
  Location(L: TopLoc_Location): void;

  // BRep_PointRepresentation.Parameter (method)
  Parameter(): number;
  Parameter(P: number): void;

  // BRep_PointRepresentation.Parameter2 (method)
  Parameter2(): number;
  Parameter2(P: number): void;

  // BRep_PointRepresentation.Curve (method)
  Curve(): Geom_Curve;
  Curve(C: Geom_Curve): void;

  // BRep_PointRepresentation.PCurve (method)
  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;

  // BRep_PointRepresentation.Surface (method)
  Surface(): Geom_Surface;
  Surface(S: Geom_Surface): void;

  // BRep_PointRepresentation.get_type_name (method)
  static get_type_name(): string;

  // BRep_PointRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PointRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PointRepresentation.delete (method)
  delete(): void;

  // BRep_PointRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PointsOnSurface: declare class BRep_PointsOnSurface extends BRep_PointRepresentation

  // BRep_PointsOnSurface.Surface (method)
  Surface(): Geom_Surface;
  Surface(S: Geom_Surface): void;

  // BRep_PointsOnSurface.get_type_name (method)
  static get_type_name(): string;

  // BRep_PointsOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PointsOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PointsOnSurface.delete (method)
  delete(): void;

  // BRep_PointsOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_Polygon3D: declare class BRep_Polygon3D extends BRep_CurveRepresentation

  // BRep_Polygon3D.constructor (constructor)
  constructor(P: Poly_Polygon3D, L: TopLoc_Location);

  // BRep_Polygon3D.IsPolygon3D (method)
  IsPolygon3D(): boolean;

  // BRep_Polygon3D.Polygon3D (method)
  Polygon3D(): Poly_Polygon3D;
  Polygon3D(P: Poly_Polygon3D): void;

  // BRep_Polygon3D.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_Polygon3D.get_type_name (method)
  static get_type_name(): string;

  // BRep_Polygon3D.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_Polygon3D.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_Polygon3D.delete (method)
  delete(): void;

  // BRep_Polygon3D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PolygonOnClosedSurface: declare class BRep_PolygonOnClosedSurface extends BRep_PolygonOnSurface

  // BRep_PolygonOnClosedSurface.constructor (constructor)
  constructor(P1: Poly_Polygon2D, P2: Poly_Polygon2D, S: Geom_Surface, L: TopLoc_Location);

  // BRep_PolygonOnClosedSurface.IsPolygonOnClosedSurface (method)
  IsPolygonOnClosedSurface(): boolean;

  // BRep_PolygonOnClosedSurface.Polygon2 (method)
  Polygon2(): Poly_Polygon2D;
  Polygon2(P: Poly_Polygon2D): void;

  // BRep_PolygonOnClosedSurface.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_PolygonOnClosedSurface.get_type_name (method)
  static get_type_name(): string;

  // BRep_PolygonOnClosedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PolygonOnClosedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PolygonOnClosedSurface.delete (method)
  delete(): void;

  // BRep_PolygonOnClosedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PolygonOnClosedTriangulation: declare class BRep_PolygonOnClosedTriangulation extends BRep_PolygonOnTriangulation

  // BRep_PolygonOnClosedTriangulation.constructor (constructor)
  constructor(P1: Poly_PolygonOnTriangulation, P2: Poly_PolygonOnTriangulation, Tr: Poly_Triangulation, L: TopLoc_Location);

  // BRep_PolygonOnClosedTriangulation.IsPolygonOnClosedTriangulation (method)
  IsPolygonOnClosedTriangulation(): boolean;

  // BRep_PolygonOnClosedTriangulation.PolygonOnTriangulation2 (method)
  PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;
  PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;

  // BRep_PolygonOnClosedTriangulation.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_PolygonOnClosedTriangulation.get_type_name (method)
  static get_type_name(): string;

  // BRep_PolygonOnClosedTriangulation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PolygonOnClosedTriangulation.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PolygonOnClosedTriangulation.delete (method)
  delete(): void;

  // BRep_PolygonOnClosedTriangulation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PolygonOnSurface: declare class BRep_PolygonOnSurface extends BRep_CurveRepresentation

  // BRep_PolygonOnSurface.constructor (constructor)
  constructor(P: Poly_Polygon2D, S: Geom_Surface, L: TopLoc_Location);

  // BRep_PolygonOnSurface.IsPolygonOnSurface (method)
  IsPolygonOnSurface(): boolean;
  IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  // BRep_PolygonOnSurface.Surface (method)
  Surface(): Geom_Surface;

  // BRep_PolygonOnSurface.Polygon (method)
  Polygon(): Poly_Polygon2D;
  Polygon(P: Poly_Polygon2D): void;

  // BRep_PolygonOnSurface.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_PolygonOnSurface.get_type_name (method)
  static get_type_name(): string;

  // BRep_PolygonOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PolygonOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PolygonOnSurface.delete (method)
  delete(): void;

  // BRep_PolygonOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_PolygonOnTriangulation: declare class BRep_PolygonOnTriangulation extends BRep_CurveRepresentation

  // BRep_PolygonOnTriangulation.constructor (constructor)
  constructor(P: Poly_PolygonOnTriangulation, T: Poly_Triangulation, L: TopLoc_Location);

  // BRep_PolygonOnTriangulation.IsPolygonOnTriangulation (method)
  IsPolygonOnTriangulation(): boolean;
  IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;

  // BRep_PolygonOnTriangulation.PolygonOnTriangulation (method)
  PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;
  PolygonOnTriangulation(): Poly_PolygonOnTriangulation;

  // BRep_PolygonOnTriangulation.Triangulation (method)
  Triangulation(): Poly_Triangulation;

  // BRep_PolygonOnTriangulation.Copy (method)
  Copy(): BRep_CurveRepresentation;

  // BRep_PolygonOnTriangulation.get_type_name (method)
  static get_type_name(): string;

  // BRep_PolygonOnTriangulation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_PolygonOnTriangulation.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_PolygonOnTriangulation.delete (method)
  delete(): void;

  // BRep_PolygonOnTriangulation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_TEdge: declare class BRep_TEdge extends TopoDS_TEdge

  // BRep_TEdge.constructor (constructor)
  constructor();

  // BRep_TEdge.Tolerance (method)
  Tolerance(): number;
  Tolerance(T: number): void;

  // BRep_TEdge.UpdateTolerance (method)
  UpdateTolerance(T: number): void;

  // BRep_TEdge.SameParameter (method)
  SameParameter(): boolean;
  SameParameter(S: boolean): void;

  // BRep_TEdge.SameRange (method)
  SameRange(): boolean;
  SameRange(S: boolean): void;

  // BRep_TEdge.Degenerated (method)
  Degenerated(): boolean;
  Degenerated(S: boolean): void;

  // BRep_TEdge.Curves (method)
  Curves(): NCollection_List_handle_BRep_CurveRepresentation;

  // BRep_TEdge.ChangeCurves (method)
  ChangeCurves(): NCollection_List_handle_BRep_CurveRepresentation;

  // BRep_TEdge.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // BRep_TEdge.get_type_name (method)
  static get_type_name(): string;

  // BRep_TEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_TEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_TEdge.delete (method)
  delete(): void;

  // BRep_TEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_TFace: declare class BRep_TFace extends TopoDS_TFace

  // BRep_TFace.constructor (constructor)
  constructor();

  // BRep_TFace.Surface (method)
  Surface(): Geom_Surface;
  Surface(theSurface: Geom_Surface): void;

  // BRep_TFace.Location (method)
  Location(): TopLoc_Location;
  Location(theLocation: TopLoc_Location): void;

  // BRep_TFace.Tolerance (method)
  Tolerance(): number;
  Tolerance(theTolerance: number): void;

  // BRep_TFace.NaturalRestriction (method)
  NaturalRestriction(): boolean;
  NaturalRestriction(theRestriction: boolean): void;

  // BRep_TFace.Triangulation (method)
  Triangulation(thePurpose: number): Poly_Triangulation;
  Triangulation(theTriangulation: Poly_Triangulation, theToReset: boolean): void;

  // BRep_TFace.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // BRep_TFace.Triangulations (method)
  Triangulations(): NCollection_List_handle_Poly_Triangulation;
  Triangulations(theTriangulations: NCollection_List_handle_Poly_Triangulation, theActiveTriangulation: Poly_Triangulation): void;

  // BRep_TFace.NbTriangulations (method)
  NbTriangulations(): number;

  // BRep_TFace.ActiveTriangulation (method)
  ActiveTriangulation(): Poly_Triangulation;

  // BRep_TFace.get_type_name (method)
  static get_type_name(): string;

  // BRep_TFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_TFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_TFace.delete (method)
  delete(): void;

  // BRep_TFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_TVertex: declare class BRep_TVertex extends TopoDS_TVertex

  // BRep_TVertex.constructor (constructor)
  constructor();

  // BRep_TVertex.Tolerance (method)
  Tolerance(): number;
  Tolerance(T: number): void;

  // BRep_TVertex.UpdateTolerance (method)
  UpdateTolerance(T: number): void;

  // BRep_TVertex.Pnt (method)
  Pnt(): gp_Pnt;
  Pnt(P: gp_Pnt): void;

  // BRep_TVertex.Points (method)
  Points(): NCollection_List_handle_BRep_PointRepresentation;

  // BRep_TVertex.ChangePoints (method)
  ChangePoints(): NCollection_List_handle_BRep_PointRepresentation;

  // BRep_TVertex.EmptyCopy (method)
  EmptyCopy(): TopoDS_TShape;

  // BRep_TVertex.get_type_name (method)
  static get_type_name(): string;

  // BRep_TVertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRep_TVertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRep_TVertex.delete (method)
  delete(): void;

  // BRep_TVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_Tool: declare class BRep_Tool

  // BRep_Tool.constructor (constructor)
  constructor();

  // BRep_Tool.IsClosed (method)
  static IsClosed(S: TopoDS_Shape): boolean;
  static IsClosed(E: TopoDS_Edge, F: TopoDS_Face): boolean;
  static IsClosed(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): boolean;
  static IsClosed(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): boolean;

  // BRep_Tool.Surface (method)
  static Surface(F: TopoDS_Face, L: TopLoc_Location): Geom_Surface;
  static Surface(F: TopoDS_Face): Geom_Surface;

  // BRep_Tool.Triangulation (method)
  static Triangulation(theFace: TopoDS_Face, theLocation: TopLoc_Location, theMeshPurpose: number): Poly_Triangulation;

  // BRep_Tool.Triangulations (method)
  static Triangulations(theFace: TopoDS_Face, theLocation: TopLoc_Location): NCollection_List_handle_Poly_Triangulation;

  // BRep_Tool.Tolerance (method)
  static Tolerance(F: TopoDS_Face): number;
  static Tolerance(E: TopoDS_Edge): number;
  static Tolerance(V: TopoDS_Vertex): number;

  // BRep_Tool.NaturalRestriction (method)
  static NaturalRestriction(F: TopoDS_Face): boolean;

  // BRep_Tool.IsGeometric (method)
  static IsGeometric(F: TopoDS_Face): boolean;
  static IsGeometric(E: TopoDS_Edge): boolean;

  // BRep_Tool.Curve (method)
  static Curve(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };
  static Curve(E: TopoDS_Edge, First?: number, Last?: number): { returnValue: Geom_Curve; First: number; Last: number; [Symbol.dispose](): void };

  // BRep_Tool.Polygon3D (method)
  static Polygon3D(E: TopoDS_Edge, L: TopLoc_Location): Poly_Polygon3D;

  // BRep_Tool.CurveOnSurface (method)
  static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First?: number, Last?: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
  static CurveOnSurface(E: TopoDS_Edge, F: TopoDS_Face, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };
  static CurveOnSurface(E: TopoDS_Edge, L: TopLoc_Location, First: number, Last: number, Index: number): { C: Geom2d_Curve; S: Geom_Surface; First: number; Last: number; [Symbol.dispose](): void };
  static CurveOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First: number, Last: number, theIsStored: boolean): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

  // BRep_Tool.CurveOnPlane (method)
  static CurveOnPlane(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { returnValue: Geom2d_Curve; First: number; Last: number; [Symbol.dispose](): void };

  // BRep_Tool.PolygonOnSurface (method)
  static PolygonOnSurface(E: TopoDS_Edge, F: TopoDS_Face): Poly_Polygon2D;
  static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };
  static PolygonOnSurface(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): Poly_Polygon2D;
  static PolygonOnSurface(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { C: Poly_Polygon2D; S: Geom_Surface; [Symbol.dispose](): void };

  // BRep_Tool.PolygonOnTriangulation (method)
  static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };
  static PolygonOnTriangulation(E: TopoDS_Edge, T: Poly_Triangulation, L: TopLoc_Location): Poly_PolygonOnTriangulation;
  static PolygonOnTriangulation(E: TopoDS_Edge, L: TopLoc_Location, Index: number): { P: Poly_PolygonOnTriangulation; T: Poly_Triangulation; [Symbol.dispose](): void };

  // BRep_Tool.SameParameter (method)
  static SameParameter(E: TopoDS_Edge): boolean;

  // BRep_Tool.SameRange (method)
  static SameRange(E: TopoDS_Edge): boolean;

  // BRep_Tool.Degenerated (method)
  static Degenerated(E: TopoDS_Edge): boolean;

  // BRep_Tool.Range (method)
  static Range(E: TopoDS_Edge, First?: number, Last?: number): { First: number; Last: number };
  static Range(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, First?: number, Last?: number): { First: number; Last: number };
  static Range(E: TopoDS_Edge, F: TopoDS_Face, First?: number, Last?: number): { First: number; Last: number };

  // BRep_Tool.UVPoints (method)
  static UVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
  static UVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;

  // BRep_Tool.SetUVPoints (method)
  static SetUVPoints(E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;
  static SetUVPoints(E: TopoDS_Edge, F: TopoDS_Face, PFirst: gp_Pnt2d, PLast: gp_Pnt2d): void;

  // BRep_Tool.HasContinuity (method)
  static HasContinuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): boolean;
  static HasContinuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
  static HasContinuity(E: TopoDS_Edge): boolean;

  // BRep_Tool.Continuity (method)
  static Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face): GeomAbs_Shape;
  static Continuity(E: TopoDS_Edge, S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): GeomAbs_Shape;

  // BRep_Tool.MaxContinuity (method)
  static MaxContinuity(theEdge: TopoDS_Edge): GeomAbs_Shape;

  // BRep_Tool.Pnt (method)
  static Pnt(V: TopoDS_Vertex): gp_Pnt;

  // BRep_Tool.Parameter (method)
  static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge): number;
  static Parameter(theV: TopoDS_Vertex, theE: TopoDS_Edge, theParam: number): { returnValue: boolean; theParam: number };
  static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, F: TopoDS_Face): number;
  static Parameter(V: TopoDS_Vertex, E: TopoDS_Edge, S: Geom_Surface, L: TopLoc_Location): number;

  // BRep_Tool.Parameters (method)
  static Parameters(V: TopoDS_Vertex, F: TopoDS_Face): gp_Pnt2d;

  // BRep_Tool.MaxTolerance (method)
  static MaxTolerance(theShape: TopoDS_Shape, theSubShape: TopAbs_ShapeEnum): number;

  // BRep_Tool.delete (method)
  delete(): void;

  // BRep_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRep_ListOfCurveRepresentation: NCollection_List_handle_BRep_CurveRepresentation

BRep_ListOfPointRepresentation: NCollection_List_handle_BRep_PointRepresentation
