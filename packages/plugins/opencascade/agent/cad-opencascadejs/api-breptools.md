# libcascade — BRepTools

15 top-level symbols. Signatures are verbatim typescript.

BRepTools: declare class BRepTools

  // BRepTools.constructor (constructor)
  constructor();

  // BRepTools.UVBounds (method)
  static UVBounds(F: TopoDS_Face, UMin?: number, UMax?: number, VMin?: number, VMax?: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, W: TopoDS_Wire, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };
  static UVBounds(F: TopoDS_Face, E: TopoDS_Edge, UMin: number, UMax: number, VMin: number, VMax: number): { UMin: number; UMax: number; VMin: number; VMax: number };

  // BRepTools.AddUVBounds (method)
  static AddUVBounds(F: TopoDS_Face, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, W: TopoDS_Wire, B: Bnd_Box2d): void;
  static AddUVBounds(F: TopoDS_Face, E: TopoDS_Edge, B: Bnd_Box2d): void;

  // BRepTools.Update (method)
  static Update(V: TopoDS_Vertex): void;
  static Update(E: TopoDS_Edge): void;
  static Update(W: TopoDS_Wire): void;
  static Update(F: TopoDS_Face): void;
  static Update(S: TopoDS_Shell): void;
  static Update(S: TopoDS_Solid): void;
  static Update(C: TopoDS_CompSolid): void;
  static Update(C: TopoDS_Compound): void;
  static Update(S: TopoDS_Shape): void;

  // BRepTools.UpdateFaceUVPoints (method)
  static UpdateFaceUVPoints(theF: TopoDS_Face): void;

  // BRepTools.Clean (method)
  static Clean(theShape: TopoDS_Shape, theForce?: boolean): void;

  // BRepTools.CleanGeometry (method)
  static CleanGeometry(theShape: TopoDS_Shape): void;

  // BRepTools.RemoveUnusedPCurves (method)
  static RemoveUnusedPCurves(S: TopoDS_Shape): void;

  // BRepTools.Triangulation (method)
  static Triangulation(theShape: TopoDS_Shape, theLinDefl: number, theToCheckFreeEdges?: boolean): boolean;

  // BRepTools.UnloadTriangulation (method)
  static UnloadTriangulation(theShape: TopoDS_Shape, theTriangulationIdx?: number): boolean;

  // BRepTools.ActivateTriangulation (method)
  static ActivateTriangulation(theShape: TopoDS_Shape, theTriangulationIdx: number, theToActivateStrictly?: boolean): boolean;

  // BRepTools.UnloadAllTriangulations (method)
  static UnloadAllTriangulations(theShape: TopoDS_Shape): boolean;

  // BRepTools.Compare (method)
  static Compare(V1: TopoDS_Vertex, V2: TopoDS_Vertex): boolean;
  static Compare(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

  // BRepTools.OuterWire (method)
  static OuterWire(F: TopoDS_Face): TopoDS_Wire;

  // BRepTools.Map3DEdges (method)
  static Map3DEdges(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BRepTools.IsReallyClosed (method)
  static IsReallyClosed(E: TopoDS_Edge, F: TopoDS_Face): boolean;

  // BRepTools.DetectClosedness (method)
  static DetectClosedness(theFace: TopoDS_Face, theUclosed?: boolean, theVclosed?: boolean): { theUclosed: boolean; theVclosed: boolean };

  // BRepTools.Write (method)
  static Write(theShape: TopoDS_Shape, theFile: string, theProgress: Message_ProgressRange): boolean;
  static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: TopTools_FormatVersion, theProgress: Message_ProgressRange): boolean;

  // BRepTools.Read (method)
  static Read(Sh: TopoDS_Shape, File: string, B: BRep_Builder, theProgress: Message_ProgressRange): boolean;

  // BRepTools.EvalAndUpdateTol (method)
  static EvalAndUpdateTol(theE: TopoDS_Edge, theC3d: Geom_Curve, theC2d: Geom2d_Curve, theS: Geom_Surface, theF: number, theL: number): number;

  // BRepTools.OriEdgeInFace (method)
  static OriEdgeInFace(theEdge: TopoDS_Edge, theFace: TopoDS_Face): TopAbs_Orientation;

  // BRepTools.RemoveInternals (method)
  static RemoveInternals(theS: TopoDS_Shape, theForce: boolean): void;

  // BRepTools.CheckLocations (method)
  static CheckLocations(theS: TopoDS_Shape, theProblemShapes: NCollection_List_TopoDS_Shape): void;

  // BRepTools.delete (method)
  delete(): void;

  // BRepTools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_CopyModification: declare class BRepTools_CopyModification extends BRepTools_Modification

  // BRepTools_CopyModification.constructor (constructor)
  constructor(theCopyGeom?: boolean, theCopyMesh?: boolean);

  // BRepTools_CopyModification.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // BRepTools_CopyModification.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_CopyModification.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // BRepTools_CopyModification.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_CopyModification.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // BRepTools_CopyModification.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // BRepTools_CopyModification.NewTriangulation (method)
  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  // BRepTools_CopyModification.NewPolygon (method)
  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  // BRepTools_CopyModification.NewPolygonOnTriangulation (method)
  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  // BRepTools_CopyModification.get_type_name (method)
  static get_type_name(): string;

  // BRepTools_CopyModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTools_CopyModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTools_CopyModification.delete (method)
  delete(): void;

  // BRepTools_CopyModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_GTrsfModification: declare class BRepTools_GTrsfModification extends BRepTools_Modification

  // BRepTools_GTrsfModification.constructor (constructor)
  constructor(T: gp_GTrsf);

  // BRepTools_GTrsfModification.GTrsf (method)
  GTrsf(): gp_GTrsf;

  // BRepTools_GTrsfModification.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // BRepTools_GTrsfModification.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_GTrsfModification.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // BRepTools_GTrsfModification.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_GTrsfModification.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // BRepTools_GTrsfModification.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // BRepTools_GTrsfModification.NewTriangulation (method)
  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  // BRepTools_GTrsfModification.NewPolygon (method)
  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  // BRepTools_GTrsfModification.NewPolygonOnTriangulation (method)
  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  // BRepTools_GTrsfModification.get_type_name (method)
  static get_type_name(): string;

  // BRepTools_GTrsfModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTools_GTrsfModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTools_GTrsfModification.delete (method)
  delete(): void;

  // BRepTools_GTrsfModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_History: declare class BRepTools_History extends Standard_Transient

  // BRepTools_History.constructor (constructor)
  constructor();

  // BRepTools_History.IsSupportedType (method)
  static IsSupportedType(theShape: TopoDS_Shape): boolean;

  // BRepTools_History.AddGenerated (method)
  AddGenerated(theInitial: TopoDS_Shape, theGenerated: TopoDS_Shape): void;

  // BRepTools_History.AddModified (method)
  AddModified(theInitial: TopoDS_Shape, theModified: TopoDS_Shape): void;

  // BRepTools_History.Remove (method)
  Remove(theRemoved: TopoDS_Shape): void;

  // BRepTools_History.ReplaceGenerated (method)
  ReplaceGenerated(theInitial: TopoDS_Shape, theGenerated: TopoDS_Shape): void;

  // BRepTools_History.ReplaceModified (method)
  ReplaceModified(theInitial: TopoDS_Shape, theModified: TopoDS_Shape): void;

  // BRepTools_History.Clear (method)
  Clear(): void;

  // BRepTools_History.Generated (method)
  Generated(theInitial: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepTools_History.Modified (method)
  Modified(theInitial: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepTools_History.IsRemoved (method)
  IsRemoved(theInitial: TopoDS_Shape): boolean;

  // BRepTools_History.HasGenerated (method)
  HasGenerated(): boolean;

  // BRepTools_History.HasModified (method)
  HasModified(): boolean;

  // BRepTools_History.HasRemoved (method)
  HasRemoved(): boolean;

  // BRepTools_History.Merge (method)
  Merge(theHistory23: BRepTools_History): void;

  // BRepTools_History.get_type_name (method)
  static get_type_name(): string;

  // BRepTools_History.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTools_History.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTools_History.delete (method)
  delete(): void;

  // BRepTools_History.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_History_TRelationType: typeof BRepTools_History_TRelationType[keyof typeof BRepTools_History_TRelationType]

  readonly TRelationType_Removed: 'TRelationType_Removed'

  readonly TRelationType_Generated: 'TRelationType_Generated'

  readonly TRelationType_Modified: 'TRelationType_Modified'

BRepTools_Modification: declare class BRepTools_Modification extends Standard_Transient

  // BRepTools_Modification.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // BRepTools_Modification.NewTriangulation (method)
  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  // BRepTools_Modification.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_Modification.NewPolygon (method)
  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  // BRepTools_Modification.NewPolygonOnTriangulation (method)
  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  // BRepTools_Modification.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // BRepTools_Modification.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_Modification.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // BRepTools_Modification.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // BRepTools_Modification.get_type_name (method)
  static get_type_name(): string;

  // BRepTools_Modification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTools_Modification.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTools_Modification.delete (method)
  delete(): void;

  // BRepTools_Modification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_Modifier: declare class BRepTools_Modifier

  // BRepTools_Modifier.constructor (constructor)
  constructor(theMutableInput?: boolean);
  constructor(S: TopoDS_Shape);
  constructor(S: TopoDS_Shape, M: BRepTools_Modification);

  // BRepTools_Modifier.Init (method)
  Init(S: TopoDS_Shape): void;

  // BRepTools_Modifier.Perform (method)
  Perform(M: BRepTools_Modification, theProgress?: Message_ProgressRange): void;

  // BRepTools_Modifier.IsDone (method)
  IsDone(): boolean;

  // BRepTools_Modifier.IsMutableInput (method)
  IsMutableInput(): boolean;

  // BRepTools_Modifier.SetMutableInput (method)
  SetMutableInput(theMutableInput: boolean): void;

  // BRepTools_Modifier.ModifiedShape (method)
  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  // BRepTools_Modifier.delete (method)
  delete(): void;

  // BRepTools_Modifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_NurbsConvertModification: declare class BRepTools_NurbsConvertModification extends BRepTools_CopyModification

  // BRepTools_NurbsConvertModification.constructor (constructor)
  constructor();

  // BRepTools_NurbsConvertModification.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // BRepTools_NurbsConvertModification.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_NurbsConvertModification.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // BRepTools_NurbsConvertModification.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_NurbsConvertModification.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // BRepTools_NurbsConvertModification.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // BRepTools_NurbsConvertModification.NewTriangulation (method)
  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  // BRepTools_NurbsConvertModification.NewPolygon (method)
  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  // BRepTools_NurbsConvertModification.NewPolygonOnTriangulation (method)
  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  // BRepTools_NurbsConvertModification.GetUpdatedEdges (method)
  GetUpdatedEdges(): NCollection_List_TopoDS_Shape;

  // BRepTools_NurbsConvertModification.get_type_name (method)
  static get_type_name(): string;

  // BRepTools_NurbsConvertModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTools_NurbsConvertModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTools_NurbsConvertModification.delete (method)
  delete(): void;

  // BRepTools_NurbsConvertModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_PurgeLocations: declare class BRepTools_PurgeLocations

  // BRepTools_PurgeLocations.constructor (constructor)
  constructor();

  // BRepTools_PurgeLocations.Perform (method)
  Perform(theShape: TopoDS_Shape): boolean;

  // BRepTools_PurgeLocations.GetResult (method)
  GetResult(): TopoDS_Shape;

  // BRepTools_PurgeLocations.IsDone (method)
  IsDone(): boolean;

  // BRepTools_PurgeLocations.ModifiedShape (method)
  ModifiedShape(theInitShape: TopoDS_Shape): TopoDS_Shape;

  // BRepTools_PurgeLocations.delete (method)
  delete(): void;

  // BRepTools_PurgeLocations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_Quilt: declare class BRepTools_Quilt

  // BRepTools_Quilt.constructor (constructor)
  constructor();

  // BRepTools_Quilt.Bind (method)
  Bind(Eold: TopoDS_Edge, Enew: TopoDS_Edge): void;
  Bind(Vold: TopoDS_Vertex, Vnew: TopoDS_Vertex): void;

  // BRepTools_Quilt.Add (method)
  Add(S: TopoDS_Shape): void;

  // BRepTools_Quilt.IsCopied (method)
  IsCopied(S: TopoDS_Shape): boolean;

  // BRepTools_Quilt.Copy (method)
  Copy(S: TopoDS_Shape): TopoDS_Shape;

  // BRepTools_Quilt.Shells (method)
  Shells(): TopoDS_Shape;

  // BRepTools_Quilt.delete (method)
  delete(): void;

  // BRepTools_Quilt.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_ReShape: declare class BRepTools_ReShape extends Standard_Transient

  // BRepTools_ReShape.constructor (constructor)
  constructor();

  // BRepTools_ReShape.Clear (method)
  Clear(): void;

  // BRepTools_ReShape.Remove (method)
  Remove(shape: TopoDS_Shape): void;

  // BRepTools_ReShape.Replace (method)
  Replace(shape: TopoDS_Shape, newshape: TopoDS_Shape): void;

  // BRepTools_ReShape.IsRecorded (method)
  IsRecorded(shape: TopoDS_Shape): boolean;

  // BRepTools_ReShape.Value (method)
  Value(shape: TopoDS_Shape): TopoDS_Shape;

  // BRepTools_ReShape.ValueLeaf (method)
  ValueLeaf(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepTools_ReShape.Status (method)
  Status(shape: TopoDS_Shape, newsh: TopoDS_Shape, last: boolean): number;

  // BRepTools_ReShape.Apply (method)
  Apply(theShape: TopoDS_Shape, theUntil?: TopAbs_ShapeEnum): TopoDS_Shape;

  // BRepTools_ReShape.ModeConsiderLocation (method)
  ModeConsiderLocation(): boolean;

  // BRepTools_ReShape.CopyVertex (method)
  CopyVertex(theV: TopoDS_Vertex, theTol: number): TopoDS_Vertex;
  CopyVertex(theV: TopoDS_Vertex, theNewPos: gp_Pnt, aTol: number): TopoDS_Vertex;

  // BRepTools_ReShape.IsNewShape (method)
  IsNewShape(theShape: TopoDS_Shape): boolean;

  // BRepTools_ReShape.History (method)
  History(): BRepTools_History;

  // BRepTools_ReShape.get_type_name (method)
  static get_type_name(): string;

  // BRepTools_ReShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTools_ReShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTools_ReShape.delete (method)
  delete(): void;

  // BRepTools_ReShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_ShapeSet: declare class BRepTools_ShapeSet extends TopTools_ShapeSet

  // BRepTools_ShapeSet.constructor (constructor)
  constructor(theWithTriangles?: boolean, theWithNormals?: boolean);
  constructor(theBuilder: BRep_Builder, theWithTriangles?: boolean, theWithNormals?: boolean);

  // BRepTools_ShapeSet.IsWithTriangles (method)
  IsWithTriangles(): boolean;

  // BRepTools_ShapeSet.IsWithNormals (method)
  IsWithNormals(): boolean;

  // BRepTools_ShapeSet.SetWithTriangles (method)
  SetWithTriangles(theWithTriangles: boolean): void;

  // BRepTools_ShapeSet.SetWithNormals (method)
  SetWithNormals(theWithNormals: boolean): void;

  // BRepTools_ShapeSet.Clear (method)
  Clear(): void;

  // BRepTools_ShapeSet.AddGeometry (method)
  AddGeometry(S: TopoDS_Shape): void;

  // BRepTools_ShapeSet.AddShapes (method)
  AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  // BRepTools_ShapeSet.Check (method)
  Check(T: TopAbs_ShapeEnum, S: TopoDS_Shape): void;

  // BRepTools_ShapeSet.delete (method)
  delete(): void;

  // BRepTools_ShapeSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_Substitution: declare class BRepTools_Substitution

  // BRepTools_Substitution.constructor (constructor)
  constructor();

  // BRepTools_Substitution.Clear (method)
  Clear(): void;

  // BRepTools_Substitution.Substitute (method)
  Substitute(OldShape: TopoDS_Shape, NewShapes: NCollection_List_TopoDS_Shape): void;

  // BRepTools_Substitution.Build (method)
  Build(S: TopoDS_Shape): void;

  // BRepTools_Substitution.IsCopied (method)
  IsCopied(S: TopoDS_Shape): boolean;

  // BRepTools_Substitution.Copy (method)
  Copy(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepTools_Substitution.delete (method)
  delete(): void;

  // BRepTools_Substitution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_TrsfModification: declare class BRepTools_TrsfModification extends BRepTools_Modification

  // BRepTools_TrsfModification.constructor (constructor)
  constructor(T: gp_Trsf);

  // BRepTools_TrsfModification.Trsf (method)
  Trsf(): gp_Trsf;

  // BRepTools_TrsfModification.IsCopyMesh (method)
  IsCopyMesh(): boolean;

  // BRepTools_TrsfModification.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // BRepTools_TrsfModification.NewTriangulation (method)
  NewTriangulation(F: TopoDS_Face): { returnValue: boolean; T: Poly_Triangulation; [Symbol.dispose](): void };

  // BRepTools_TrsfModification.NewPolygon (method)
  NewPolygon(E: TopoDS_Edge): { returnValue: boolean; P: Poly_Polygon3D; [Symbol.dispose](): void };

  // BRepTools_TrsfModification.NewPolygonOnTriangulation (method)
  NewPolygonOnTriangulation(E: TopoDS_Edge, F: TopoDS_Face): { returnValue: boolean; P: Poly_PolygonOnTriangulation; [Symbol.dispose](): void };

  // BRepTools_TrsfModification.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_TrsfModification.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // BRepTools_TrsfModification.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepTools_TrsfModification.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // BRepTools_TrsfModification.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // BRepTools_TrsfModification.get_type_name (method)
  static get_type_name(): string;

  // BRepTools_TrsfModification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepTools_TrsfModification.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepTools_TrsfModification.delete (method)
  delete(): void;

  // BRepTools_TrsfModification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepTools_WireExplorer: declare class BRepTools_WireExplorer

  // BRepTools_WireExplorer.constructor (constructor)
  constructor();
  constructor(W: TopoDS_Wire);
  constructor(W: TopoDS_Wire, F: TopoDS_Face);

  // BRepTools_WireExplorer.Init (method)
  Init(W: TopoDS_Wire): void;
  Init(W: TopoDS_Wire, F: TopoDS_Face): void;
  Init(W: TopoDS_Wire, F: TopoDS_Face, UMin: number, UMax: number, VMin: number, VMax: number): void;

  // BRepTools_WireExplorer.More (method)
  More(): boolean;

  // BRepTools_WireExplorer.Next (method)
  Next(): void;

  // BRepTools_WireExplorer.Current (method)
  Current(): TopoDS_Edge;

  // BRepTools_WireExplorer.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // BRepTools_WireExplorer.CurrentVertex (method)
  CurrentVertex(): TopoDS_Vertex;

  // BRepTools_WireExplorer.Clear (method)
  Clear(): void;

  // BRepTools_WireExplorer.delete (method)
  delete(): void;

  // BRepTools_WireExplorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
