# libcascade — BRepTools

15 top-level symbols. Signatures are verbatim typescript.

BRepTools: declare class BRepTools

  constructor

  static UVBounds(F: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, W: TopoDS_Wire, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, E: TopoDS_Edge, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, W: TopoDS_Wire, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, E: TopoDS_Edge, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, W: TopoDS_Wire, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, E: TopoDS_Edge, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };

  static AddUVBounds(F: TopoDS_Face, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, W: TopoDS_Wire, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, E: TopoDS_Edge, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, W: TopoDS_Wire, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, E: TopoDS_Edge, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, W: TopoDS_Wire, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, E: TopoDS_Edge, B: Bnd_Box2d): void;

  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;

  static UpdateFaceUVPoints(theF: TopoDS_Face): void;

  static Clean(theShape: TopoDS_Shape, theForce?: boolean): void;

  static CleanGeometry(theShape: TopoDS_Shape): void;

  static RemoveUnusedPCurves(S: TopoDS_Shape): void;

  static Triangulation(theShape: TopoDS_Shape, theLinDefl: number, theToCheckFreeEdges?: boolean): boolean;

  static UnloadTriangulation(theShape: TopoDS_Shape, theTriangulationIdx?: number): boolean;

  static ActivateTriangulation(theShape: TopoDS_Shape, theTriangulationIdx: number, theToActivateStrictly?: boolean): boolean;

  static UnloadAllTriangulations(theShape: TopoDS_Shape): boolean;

  static Compare(V1: TopoDS_Vertex, V2: TopoDS_Vertex): boolean;
  static Compare(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;
  static Compare(V1: TopoDS_Vertex, V2: TopoDS_Vertex): boolean;
  static Compare(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

  static OuterWire(F: TopoDS_Face): TopoDS_Wire;

  static Map3DEdges(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  static IsReallyClosed(E: TopoDS_Edge, F: TopoDS_Face): boolean;

  static DetectClosedness(theFace: TopoDS_Face, theUclosed?: boolean, theVclosed?: boolean): { theUclosed: boolean; theVclosed: boolean };

  static Write(theShape: TopoDS_Shape, theFile: string, theProgress: Message_ProgressRange): boolean;
  static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: TopTools_FormatVersion, theProgress: Message_ProgressRange): boolean;
  static Write(theShape: TopoDS_Shape, theFile: string, theProgress: Message_ProgressRange): boolean;
  static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: TopTools_FormatVersion, theProgress: Message_ProgressRange): boolean;

  static Read(Sh: TopoDS_Shape, File: string, B: BRep_Builder, theProgress: Message_ProgressRange): boolean;

  static EvalAndUpdateTol(theE: TopoDS_Edge, theC3d: Geom_Curve, theC2d: Geom2d_Curve, theS: Geom_Surface, theF: number, theL: number): number;

  static OriEdgeInFace(theEdge: TopoDS_Edge, theFace: TopoDS_Face): TopAbs_Orientation;

  static RemoveInternals(theS: TopoDS_Shape, theForce: boolean): void;

  static CheckLocations(theS: TopoDS_Shape, theProblemShapes: NCollection_List_TopoDS_Shape): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_CopyModification: declare class BRepTools_CopyModification extends BRepTools_Modification

  constructor

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_GTrsfModification: declare class BRepTools_GTrsfModification extends BRepTools_Modification

  constructor

  GTrsf(): gp_GTrsf;

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_History: declare class BRepTools_History extends Standard_Transient

  constructor

  static IsSupportedType(theShape: TopoDS_Shape): boolean;

  AddGenerated(theInitial: TopoDS_Shape, theGenerated: TopoDS_Shape): void;

  AddModified(theInitial: TopoDS_Shape, theModified: TopoDS_Shape): void;

  Remove(theRemoved: TopoDS_Shape): void;

  ReplaceGenerated(theInitial: TopoDS_Shape, theGenerated: TopoDS_Shape): void;

  ReplaceModified(theInitial: TopoDS_Shape, theModified: TopoDS_Shape): void;

  Clear(): void;

  Generated(theInitial: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Modified(theInitial: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  IsRemoved(theInitial: TopoDS_Shape): boolean;

  HasGenerated(): boolean;

  HasModified(): boolean;

  HasRemoved(): boolean;

  Merge(theHistory23: BRepTools_History): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_History_TRelationType: typeof BRepTools_History_TRelationType[keyof typeof BRepTools_History_TRelationType]

BRepTools_Modification: declare class BRepTools_Modification extends Standard_Transient

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_Modifier: declare class BRepTools_Modifier

  constructor

  Init(S: TopoDS_Shape): void;

  Perform(M: BRepTools_Modification, theProgress?: Message_ProgressRange): void;

  IsDone(): boolean;

  IsMutableInput(): boolean;

  SetMutableInput(theMutableInput: boolean): void;

  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_NurbsConvertModification: declare class BRepTools_NurbsConvertModification extends BRepTools_CopyModification

  constructor

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  GetUpdatedEdges(): NCollection_List_TopoDS_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_PurgeLocations: declare class BRepTools_PurgeLocations

  constructor

  Perform(theShape: TopoDS_Shape): boolean;

  GetResult(): TopoDS_Shape;

  IsDone(): boolean;

  ModifiedShape(theInitShape: TopoDS_Shape): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_Quilt: declare class BRepTools_Quilt

  constructor

  Bind(Eold: TopoDS_Edge, Enew: TopoDS_Edge): void;
  Bind(Vold: TopoDS_Vertex, Vnew: TopoDS_Vertex): void;
  Bind(Eold: TopoDS_Edge, Enew: TopoDS_Edge): void;
  Bind(Vold: TopoDS_Vertex, Vnew: TopoDS_Vertex): void;

  Add(S: TopoDS_Shape): void;

  IsCopied(S: TopoDS_Shape): boolean;

  Copy(S: TopoDS_Shape): TopoDS_Shape;

  Shells(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_ReShape: declare class BRepTools_ReShape extends Standard_Transient

  constructor

  Clear(): void;

  Remove(shape: TopoDS_Shape): void;

  Replace(shape: TopoDS_Shape, newshape: TopoDS_Shape): void;

  IsRecorded(shape: TopoDS_Shape): boolean;

  Value(shape: TopoDS_Shape): TopoDS_Shape;

  ValueLeaf(theShape: TopoDS_Shape): TopoDS_Shape;

  Status(shape: TopoDS_Shape, newsh: TopoDS_Shape, last: boolean): number;

  Apply(theShape: TopoDS_Shape, theUntil?: TopAbs_ShapeEnum): TopoDS_Shape;

  ModeConsiderLocation(): boolean;

  CopyVertex(theV: TopoDS_Vertex, theTol: number): TopoDS_Vertex;
  CopyVertex(theV: TopoDS_Vertex, theNewPos: gp_Pnt, aTol: number): TopoDS_Vertex;
  CopyVertex(theV: TopoDS_Vertex, theTol: number): TopoDS_Vertex;
  CopyVertex(theV: TopoDS_Vertex, theNewPos: gp_Pnt, aTol: number): TopoDS_Vertex;

  IsNewShape(theShape: TopoDS_Shape): boolean;

  History(): BRepTools_History;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_ShapeSet: declare class BRepTools_ShapeSet extends TopTools_ShapeSet

  constructor

  IsWithTriangles(): boolean;

  IsWithNormals(): boolean;

  SetWithTriangles(theWithTriangles: boolean): void;

  SetWithNormals(theWithNormals: boolean): void;

  Clear(): void;

  AddGeometry(S: TopoDS_Shape): void;

  AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  Check(T: TopAbs_ShapeEnum, S: TopoDS_Shape): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_Substitution: declare class BRepTools_Substitution

  constructor

  Clear(): void;

  Substitute(OldShape: TopoDS_Shape, NewShapes: NCollection_List_TopoDS_Shape): void;

  Build(S: TopoDS_Shape): void;

  IsCopied(S: TopoDS_Shape): boolean;

  Copy(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_TrsfModification: declare class BRepTools_TrsfModification extends BRepTools_Modification

  constructor

  Trsf(): gp_Trsf;

  IsCopyMesh(): boolean;

  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepTools_WireExplorer: declare class BRepTools_WireExplorer

  constructor

  Init(W: TopoDS_Wire): void;
  Init(W: TopoDS_Wire, F: TopoDS_Face): void;
  Init(W: TopoDS_Wire, F: TopoDS_Face, UMin: number, UMax: number, VMin: number, VMax: number): void;
  Init(W: TopoDS_Wire): void;
  Init(W: TopoDS_Wire, F: TopoDS_Face): void;
  Init(W: TopoDS_Wire, F: TopoDS_Face, UMin: number, UMax: number, VMin: number, VMax: number): void;
  Init(W: TopoDS_Wire): void;
  Init(W: TopoDS_Wire, F: TopoDS_Face): void;
  Init(W: TopoDS_Wire, F: TopoDS_Face, UMin: number, UMax: number, VMin: number, VMax: number): void;

  More(): boolean;

  Next(): void;

  Current(): TopoDS_Edge;

  Orientation(): TopAbs_Orientation;

  CurrentVertex(): TopoDS_Vertex;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;
