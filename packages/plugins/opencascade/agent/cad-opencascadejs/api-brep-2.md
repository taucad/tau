# libcascade — BRep (2)

19 top-level symbols. Signatures are verbatim typescript.

BRep_Curve3D: declare class BRep_Curve3D extends BRep_GCurve

  constructor

  D0(U: number, P: gp_Pnt): void;

  IsCurve3D(): boolean;

  Curve3D(): Geom_Curve;
  Curve3D(C: Geom_Curve): void;
  Curve3D(): Geom_Curve;
  Curve3D(C: Geom_Curve): void;

  Copy(): BRep_CurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_CurveOn2Surfaces: declare class BRep_CurveOn2Surfaces extends BRep_CurveRepresentation

  constructor

  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

  D0(U: number, P: gp_Pnt): void;

  Surface(): Geom_Surface;

  Surface2(): Geom_Surface;

  Location2(): TopLoc_Location;

  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;
  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;

  Copy(): BRep_CurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_CurveOnClosedSurface: declare class BRep_CurveOnClosedSurface extends BRep_CurveOnSurface

  constructor

  SetUVPoints2(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  UVPoints2(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  IsCurveOnClosedSurface(): boolean;

  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

  PCurve2(): Geom2d_Curve;
  PCurve2(C: Geom2d_Curve): void;
  PCurve2(): Geom2d_Curve;
  PCurve2(C: Geom2d_Curve): void;

  Surface2(): Geom_Surface;

  Location2(): TopLoc_Location;

  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;
  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;

  Copy(): BRep_CurveRepresentation;

  Update(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_CurveOnSurface: declare class BRep_CurveOnSurface extends BRep_GCurve

  constructor

  SetUVPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  UVPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

  D0(U: number, P: gp_Pnt): void;

  IsCurveOnSurface(): boolean;
  IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
  IsCurveOnSurface(): boolean;
  IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  Surface(): Geom_Surface;

  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;
  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;

  Copy(): BRep_CurveRepresentation;

  Update(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_CurveRepresentation: declare class BRep_CurveRepresentation extends Standard_Transient

  IsCurve3D(): boolean;

  IsCurveOnSurface(): boolean;
  IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
  IsCurveOnSurface(): boolean;
  IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
  IsRegularity(): boolean;
  IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

  IsCurveOnClosedSurface(): boolean;

  IsPolygon3D(): boolean;

  IsPolygonOnTriangulation(): boolean;
  IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;
  IsPolygonOnTriangulation(): boolean;
  IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;

  IsPolygonOnClosedTriangulation(): boolean;

  IsPolygonOnSurface(): boolean;
  IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
  IsPolygonOnSurface(): boolean;
  IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  IsPolygonOnClosedSurface(): boolean;

  Location(): TopLoc_Location;
  Location(L: TopLoc_Location): void;
  Location(): TopLoc_Location;
  Location(L: TopLoc_Location): void;

  Curve3D(): Geom_Curve;
  Curve3D(C: Geom_Curve): void;
  Curve3D(): Geom_Curve;
  Curve3D(C: Geom_Curve): void;

  Surface(): Geom_Surface;

  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;
  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;

  PCurve2(): Geom2d_Curve;
  PCurve2(C: Geom2d_Curve): void;
  PCurve2(): Geom2d_Curve;
  PCurve2(C: Geom2d_Curve): void;

  Polygon3D(): Poly_Polygon3D;
  Polygon3D(P: Poly_Polygon3D): void;
  Polygon3D(): Poly_Polygon3D;
  Polygon3D(P: Poly_Polygon3D): void;

  Polygon(): Poly_Polygon2D;
  Polygon(P: Poly_Polygon2D): void;
  Polygon(): Poly_Polygon2D;
  Polygon(P: Poly_Polygon2D): void;

  Polygon2(): Poly_Polygon2D;
  Polygon2(P: Poly_Polygon2D): void;
  Polygon2(): Poly_Polygon2D;
  Polygon2(P: Poly_Polygon2D): void;

  Triangulation(): Poly_Triangulation;

  PolygonOnTriangulation(): Poly_PolygonOnTriangulation;
  PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;
  PolygonOnTriangulation(): Poly_PolygonOnTriangulation;
  PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;

  PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;
  PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;
  PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;
  PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;

  Surface2(): Geom_Surface;

  Location2(): TopLoc_Location;

  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;
  Continuity(): GeomAbs_Shape;
  Continuity(C: GeomAbs_Shape): void;

  Copy(): BRep_CurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_GCurve: declare class BRep_GCurve extends BRep_CurveRepresentation

  SetRange(First: number, Last: number): void;

  Range(First?: number, Last?: number): { First: number; Last: number };

  First(): number;
  First(F: number): void;
  First(): number;
  First(F: number): void;

  Last(): number;
  Last(L: number): void;
  Last(): number;
  Last(L: number): void;

  D0(U: number, P: gp_Pnt): void;

  Update(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PointOnCurve: declare class BRep_PointOnCurve extends BRep_PointRepresentation

  constructor

  IsPointOnCurve(): boolean;
  IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;
  IsPointOnCurve(): boolean;
  IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;

  Curve(): Geom_Curve;
  Curve(C: Geom_Curve): void;
  Curve(): Geom_Curve;
  Curve(C: Geom_Curve): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PointOnCurveOnSurface: declare class BRep_PointOnCurveOnSurface extends BRep_PointsOnSurface

  constructor

  IsPointOnCurveOnSurface(): boolean;
  IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;
  IsPointOnCurveOnSurface(): boolean;
  IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;

  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;
  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PointOnSurface: declare class BRep_PointOnSurface extends BRep_PointsOnSurface

  constructor

  IsPointOnSurface(): boolean;
  IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
  IsPointOnSurface(): boolean;
  IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  Parameter2(): number;
  Parameter2(P: number): void;
  Parameter2(): number;
  Parameter2(P: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PointRepresentation: declare class BRep_PointRepresentation extends Standard_Transient

  IsPointOnCurve(): boolean;
  IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;
  IsPointOnCurve(): boolean;
  IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;

  IsPointOnCurveOnSurface(): boolean;
  IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;
  IsPointOnCurveOnSurface(): boolean;
  IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;

  IsPointOnSurface(): boolean;
  IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
  IsPointOnSurface(): boolean;
  IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  Location(): TopLoc_Location;
  Location(L: TopLoc_Location): void;
  Location(): TopLoc_Location;
  Location(L: TopLoc_Location): void;

  Parameter(): number;
  Parameter(P: number): void;
  Parameter(): number;
  Parameter(P: number): void;

  Parameter2(): number;
  Parameter2(P: number): void;
  Parameter2(): number;
  Parameter2(P: number): void;

  Curve(): Geom_Curve;
  Curve(C: Geom_Curve): void;
  Curve(): Geom_Curve;
  Curve(C: Geom_Curve): void;

  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;
  PCurve(): Geom2d_Curve;
  PCurve(C: Geom2d_Curve): void;

  Surface(): Geom_Surface;
  Surface(S: Geom_Surface): void;
  Surface(): Geom_Surface;
  Surface(S: Geom_Surface): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PointsOnSurface: declare class BRep_PointsOnSurface extends BRep_PointRepresentation

  Surface(): Geom_Surface;
  Surface(S: Geom_Surface): void;
  Surface(): Geom_Surface;
  Surface(S: Geom_Surface): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_Polygon3D: declare class BRep_Polygon3D extends BRep_CurveRepresentation

  constructor

  IsPolygon3D(): boolean;

  Polygon3D(): Poly_Polygon3D;
  Polygon3D(P: Poly_Polygon3D): void;
  Polygon3D(): Poly_Polygon3D;
  Polygon3D(P: Poly_Polygon3D): void;

  Copy(): BRep_CurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PolygonOnClosedSurface: declare class BRep_PolygonOnClosedSurface extends BRep_PolygonOnSurface

  constructor

  IsPolygonOnClosedSurface(): boolean;

  Polygon2(): Poly_Polygon2D;
  Polygon2(P: Poly_Polygon2D): void;
  Polygon2(): Poly_Polygon2D;
  Polygon2(P: Poly_Polygon2D): void;

  Copy(): BRep_CurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PolygonOnClosedTriangulation: declare class BRep_PolygonOnClosedTriangulation extends BRep_PolygonOnTriangulation

  constructor

  IsPolygonOnClosedTriangulation(): boolean;

  PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;
  PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;
  PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;
  PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;

  Copy(): BRep_CurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PolygonOnSurface: declare class BRep_PolygonOnSurface extends BRep_CurveRepresentation

  constructor

  IsPolygonOnSurface(): boolean;
  IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
  IsPolygonOnSurface(): boolean;
  IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

  Surface(): Geom_Surface;

  Polygon(): Poly_Polygon2D;
  Polygon(P: Poly_Polygon2D): void;
  Polygon(): Poly_Polygon2D;
  Polygon(P: Poly_Polygon2D): void;

  Copy(): BRep_CurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_PolygonOnTriangulation: declare class BRep_PolygonOnTriangulation extends BRep_CurveRepresentation

  constructor

  IsPolygonOnTriangulation(): boolean;
  IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;
  IsPolygonOnTriangulation(): boolean;
  IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;

  PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;
  PolygonOnTriangulation(): Poly_PolygonOnTriangulation;
  PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;
  PolygonOnTriangulation(): Poly_PolygonOnTriangulation;

  Triangulation(): Poly_Triangulation;

  Copy(): BRep_CurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_TEdge: declare class BRep_TEdge extends TopoDS_TEdge

  constructor

  Tolerance(): number;
  Tolerance(T: number): void;
  Tolerance(): number;
  Tolerance(T: number): void;

  UpdateTolerance(T: number): void;

  SameParameter(): boolean;
  SameParameter(S: boolean): void;
  SameParameter(): boolean;
  SameParameter(S: boolean): void;

  SameRange(): boolean;
  SameRange(S: boolean): void;
  SameRange(): boolean;
  SameRange(S: boolean): void;

  Degenerated(): boolean;
  Degenerated(S: boolean): void;
  Degenerated(): boolean;
  Degenerated(S: boolean): void;

  Curves(): NCollection_List_handle_BRep_CurveRepresentation;

  ChangeCurves(): NCollection_List_handle_BRep_CurveRepresentation;

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_TFace: declare class BRep_TFace extends TopoDS_TFace

  constructor

  Surface(): Geom_Surface;
  Surface(theSurface: Geom_Surface): void;
  Surface(): Geom_Surface;
  Surface(theSurface: Geom_Surface): void;

  Location(): TopLoc_Location;
  Location(theLocation: TopLoc_Location): void;
  Location(): TopLoc_Location;
  Location(theLocation: TopLoc_Location): void;

  Tolerance(): number;
  Tolerance(theTolerance: number): void;
  Tolerance(): number;
  Tolerance(theTolerance: number): void;

  NaturalRestriction(): boolean;
  NaturalRestriction(theRestriction: boolean): void;
  NaturalRestriction(): boolean;
  NaturalRestriction(theRestriction: boolean): void;

  Triangulation(thePurpose: number): Poly_Triangulation;
  Triangulation(theTriangulation: Poly_Triangulation, theToReset: boolean): void;
  Triangulation(thePurpose: number): Poly_Triangulation;
  Triangulation(theTriangulation: Poly_Triangulation, theToReset: boolean): void;

  EmptyCopy(): TopoDS_TShape;

  Triangulations(): NCollection_List_handle_Poly_Triangulation;
  Triangulations(theTriangulations: NCollection_List_handle_Poly_Triangulation, theActiveTriangulation: Poly_Triangulation): void;
  Triangulations(): NCollection_List_handle_Poly_Triangulation;
  Triangulations(theTriangulations: NCollection_List_handle_Poly_Triangulation, theActiveTriangulation: Poly_Triangulation): void;

  NbTriangulations(): number;

  ActiveTriangulation(): Poly_Triangulation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRep_TVertex: declare class BRep_TVertex extends TopoDS_TVertex

  constructor

  Tolerance(): number;
  Tolerance(T: number): void;
  Tolerance(): number;
  Tolerance(T: number): void;

  UpdateTolerance(T: number): void;

  Pnt(): gp_Pnt;
  Pnt(P: gp_Pnt): void;
  Pnt(): gp_Pnt;
  Pnt(P: gp_Pnt): void;

  Points(): NCollection_List_handle_BRep_PointRepresentation;

  ChangePoints(): NCollection_List_handle_BRep_PointRepresentation;

  EmptyCopy(): TopoDS_TShape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
