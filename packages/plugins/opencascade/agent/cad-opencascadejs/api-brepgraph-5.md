# libcascade — BRepGraph (5)

48 top-level symbols. Signatures are verbatim typescript.

BRepGraph_Tool_Wire: declare class BRepGraph_Tool_Wire

  // BRepGraph_Tool_Wire.constructor (constructor)
  constructor();

  // BRepGraph_Tool_Wire.Usage (method)
  static Usage(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): any;

  // BRepGraph_Tool_Wire.IsClosed (method)
  static IsClosed(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
  static IsClosed(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;

  // BRepGraph_Tool_Wire.NbCoEdges (method)
  static NbCoEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
  static NbCoEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;

  // BRepGraph_Tool_Wire.NbDistinctEdges (method)
  static NbDistinctEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
  static NbDistinctEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;

  // BRepGraph_Tool_Wire.FaceOf (method)
  static FaceOf(theGraph: BRepGraph, theWire: BRepGraph_WireId): BRepGraph_FaceId;
  static FaceOf(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): BRepGraph_FaceId;

  // BRepGraph_Tool_Wire.IsOuter (method)
  static IsOuter(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
  static IsOuter(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;

  // BRepGraph_Tool_Wire.delete (method)
  delete(): void;

  // BRepGraph_Tool_Wire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView: declare class BRepGraph_TopoView

  // BRepGraph_TopoView.Faces (method)
  Faces(): BRepGraph_TopoView_FaceOps;

  // BRepGraph_TopoView.Edges (method)
  Edges(): BRepGraph_TopoView_EdgeOps;

  // BRepGraph_TopoView.Vertices (method)
  Vertices(): BRepGraph_TopoView_VertexOps;

  // BRepGraph_TopoView.Wires (method)
  Wires(): BRepGraph_TopoView_WireOps;

  // BRepGraph_TopoView.Shells (method)
  Shells(): BRepGraph_TopoView_ShellOps;

  // BRepGraph_TopoView.Solids (method)
  Solids(): BRepGraph_TopoView_SolidOps;

  // BRepGraph_TopoView.CoEdges (method)
  CoEdges(): BRepGraph_TopoView_CoEdgeOps;

  // BRepGraph_TopoView.Compounds (method)
  Compounds(): BRepGraph_TopoView_CompoundOps;

  // BRepGraph_TopoView.CompSolids (method)
  CompSolids(): BRepGraph_TopoView_CompSolidOps;

  // BRepGraph_TopoView.Products (method)
  Products(): BRepGraph_TopoView_ProductOps;

  // BRepGraph_TopoView.Occurrences (method)
  Occurrences(): BRepGraph_TopoView_OccurrenceOps;

  // BRepGraph_TopoView.Gen (method)
  Gen(): BRepGraph_TopoView_GenOps;

  // BRepGraph_TopoView.Geometry (method)
  Geometry(): BRepGraph_TopoView_GeometryOps;

  // BRepGraph_TopoView.delete (method)
  delete(): void;

  // BRepGraph_TopoView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_CoEdgeOps: declare class BRepGraph_TopoView_CoEdgeOps

  // BRepGraph_TopoView_CoEdgeOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_CoEdgeOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_CoEdgeOps.StartId (method)
  StartId(): BRepGraph_CoEdgeId;

  // BRepGraph_TopoView_CoEdgeOps.EndId (method)
  EndId(): BRepGraph_CoEdgeId;

  // BRepGraph_TopoView_CoEdgeOps.Definition (method)
  Definition(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  // BRepGraph_TopoView_CoEdgeOps.Edge (method)
  Edge(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_EdgeId;

  // BRepGraph_TopoView_CoEdgeOps.Face (method)
  Face(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_FaceId;

  // BRepGraph_TopoView_CoEdgeOps.Wire (method)
  Wire(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_WireId;

  // BRepGraph_TopoView_CoEdgeOps.Curve2D (method)
  Curve2D(theCoEdge: BRepGraph_CoEdgeId): Geom2d_Curve;

  // BRepGraph_TopoView_CoEdgeOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_CoEdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_CompSolidOps: declare class BRepGraph_TopoView_CompSolidOps

  // BRepGraph_TopoView_CompSolidOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_CompSolidOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_CompSolidOps.StartId (method)
  StartId(): BRepGraph_CompSolidId;

  // BRepGraph_TopoView_CompSolidOps.EndId (method)
  EndId(): BRepGraph_CompSolidId;

  // BRepGraph_TopoView_CompSolidOps.Definition (method)
  Definition(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;

  // BRepGraph_TopoView_CompSolidOps.Relations (method)
  Relations(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidRelations;

  // BRepGraph_TopoView_CompSolidOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_CompSolidOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_CompoundOps: declare class BRepGraph_TopoView_CompoundOps

  // BRepGraph_TopoView_CompoundOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_CompoundOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_CompoundOps.StartId (method)
  StartId(): BRepGraph_CompoundId;

  // BRepGraph_TopoView_CompoundOps.EndId (method)
  EndId(): BRepGraph_CompoundId;

  // BRepGraph_TopoView_CompoundOps.Definition (method)
  Definition(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;

  // BRepGraph_TopoView_CompoundOps.Relations (method)
  Relations(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundRelations;

  // BRepGraph_TopoView_CompoundOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_CompoundOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_EdgeOps: declare class BRepGraph_TopoView_EdgeOps

  // BRepGraph_TopoView_EdgeOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_EdgeOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_EdgeOps.StartId (method)
  StartId(): BRepGraph_EdgeId;

  // BRepGraph_TopoView_EdgeOps.EndId (method)
  EndId(): BRepGraph_EdgeId;

  // BRepGraph_TopoView_EdgeOps.Definition (method)
  Definition(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;

  // BRepGraph_TopoView_EdgeOps.Relations (method)
  Relations(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeRelations;

  // BRepGraph_TopoView_EdgeOps.NbFaces (method)
  NbFaces(theEdge: BRepGraph_EdgeId): number;

  // BRepGraph_TopoView_EdgeOps.WiresOf (method)
  WiresOf(theEdge: BRepGraph_EdgeId): BRepGraph_WiresOfEdge;
  WiresOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_WiresOfEdge;

  // BRepGraph_TopoView_EdgeOps.FacesOf (method)
  FacesOf(theEdge: BRepGraph_EdgeId): BRepGraph_FacesOfEdge;
  FacesOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_FacesOfEdge;

  // BRepGraph_TopoView_EdgeOps.CoEdges (method)
  CoEdges(theEdge: BRepGraph_EdgeId): BRepGraph_CoEdgeId[];

  // BRepGraph_TopoView_EdgeOps.Curve3D (method)
  Curve3D(theEdge: BRepGraph_EdgeId): Geom_Curve;

  // BRepGraph_TopoView_EdgeOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_EdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_FaceOps: declare class BRepGraph_TopoView_FaceOps

  // BRepGraph_TopoView_FaceOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_FaceOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_FaceOps.StartId (method)
  StartId(): BRepGraph_FaceId;

  // BRepGraph_TopoView_FaceOps.EndId (method)
  EndId(): BRepGraph_FaceId;

  // BRepGraph_TopoView_FaceOps.Definition (method)
  Definition(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;

  // BRepGraph_TopoView_FaceOps.Relations (method)
  Relations(theFace: BRepGraph_FaceId): BRepGraphInc_FaceRelations;

  // BRepGraph_TopoView_FaceOps.Surface (method)
  Surface(theFace: BRepGraph_FaceId): Geom_Surface;

  // BRepGraph_TopoView_FaceOps.ActiveTriangulation (method)
  ActiveTriangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

  // BRepGraph_TopoView_FaceOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_FaceOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_GenOps: declare class BRepGraph_TopoView_GenOps

  // BRepGraph_TopoView_GenOps.TopoEntity (method)
  TopoEntity(theId: BRepGraph_NodeId): BRepGraphInc_BaseDef;

  // BRepGraph_TopoView_GenOps.CompoundRefIds (method)
  CompoundRefIds(theChild: BRepGraph_NodeId): BRepGraph_ChildRefId[];

  // BRepGraph_TopoView_GenOps.OccurrenceRefIds (method)
  OccurrenceRefIds(theChild: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];

  // BRepGraph_TopoView_GenOps.HasCompoundParents (method)
  HasCompoundParents(theNode: BRepGraph_NodeId): boolean;

  // BRepGraph_TopoView_GenOps.HasOccurrenceParents (method)
  HasOccurrenceParents(theNode: BRepGraph_NodeId): boolean;

  // BRepGraph_TopoView_GenOps.NbNodes (method)
  NbNodes(): number;

  // BRepGraph_TopoView_GenOps.Nb (method)
  Nb(theKind: BRepGraph_NodeId_Kind): number;

  // BRepGraph_TopoView_GenOps.IsValid (method)
  IsValid(theNode: BRepGraph_NodeId): boolean;

  // BRepGraph_TopoView_GenOps.IsActive (method)
  IsActive(theNode: BRepGraph_NodeId): boolean;

  // BRepGraph_TopoView_GenOps.IsRemoved (method)
  IsRemoved(theNode: BRepGraph_NodeId): boolean;

  // BRepGraph_TopoView_GenOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_GenOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_GeometryOps: declare class BRepGraph_TopoView_GeometryOps

  // BRepGraph_TopoView_GeometryOps.NbFaceSurfaces (method)
  NbFaceSurfaces(): number;

  // BRepGraph_TopoView_GeometryOps.NbEdgeCurves3D (method)
  NbEdgeCurves3D(): number;

  // BRepGraph_TopoView_GeometryOps.NbCoEdgeCurves2D (method)
  NbCoEdgeCurves2D(): number;

  // BRepGraph_TopoView_GeometryOps.NbActiveFaceSurfaces (method)
  NbActiveFaceSurfaces(): number;

  // BRepGraph_TopoView_GeometryOps.NbActiveEdgeCurves3D (method)
  NbActiveEdgeCurves3D(): number;

  // BRepGraph_TopoView_GeometryOps.NbActiveCoEdgeCurves2D (method)
  NbActiveCoEdgeCurves2D(): number;

  // BRepGraph_TopoView_GeometryOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_GeometryOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_OccurrenceOps: declare class BRepGraph_TopoView_OccurrenceOps

  // BRepGraph_TopoView_OccurrenceOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_OccurrenceOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_OccurrenceOps.StartId (method)
  StartId(): BRepGraph_OccurrenceId;

  // BRepGraph_TopoView_OccurrenceOps.EndId (method)
  EndId(): BRepGraph_OccurrenceId;

  // BRepGraph_TopoView_OccurrenceOps.Definition (method)
  Definition(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;

  // BRepGraph_TopoView_OccurrenceOps.Relations (method)
  Relations(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceRelations;

  // BRepGraph_TopoView_OccurrenceOps.Product (method)
  Product(theOccurrence: BRepGraph_OccurrenceId): BRepGraph_ProductId;

  // BRepGraph_TopoView_OccurrenceOps.ParentProduct (method)
  ParentProduct(theOccurrence: BRepGraph_OccurrenceId): BRepGraph_ProductId;

  // BRepGraph_TopoView_OccurrenceOps.OccurrenceLocation (method)
  OccurrenceLocation(theOccurrence: BRepGraph_OccurrenceId): TopLoc_Location;

  // BRepGraph_TopoView_OccurrenceOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_OccurrenceOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_ProductOps: declare class BRepGraph_TopoView_ProductOps

  // BRepGraph_TopoView_ProductOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_ProductOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_ProductOps.StartId (method)
  StartId(): BRepGraph_ProductId;

  // BRepGraph_TopoView_ProductOps.EndId (method)
  EndId(): BRepGraph_ProductId;

  // BRepGraph_TopoView_ProductOps.Definition (method)
  Definition(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;

  // BRepGraph_TopoView_ProductOps.Relations (method)
  Relations(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductRelations;

  // BRepGraph_TopoView_ProductOps.ShapeRoot (method)
  ShapeRoot(theProduct: BRepGraph_ProductId): BRepGraph_NodeId;

  // BRepGraph_TopoView_ProductOps.IsAssembly (method)
  IsAssembly(theProduct: BRepGraph_ProductId): boolean;

  // BRepGraph_TopoView_ProductOps.IsPart (method)
  IsPart(theProduct: BRepGraph_ProductId): boolean;

  // BRepGraph_TopoView_ProductOps.ShapeRootNode (method)
  ShapeRootNode(theProduct: BRepGraph_ProductId): BRepGraph_NodeId;

  // BRepGraph_TopoView_ProductOps.NbComponents (method)
  NbComponents(theProduct: BRepGraph_ProductId): number;

  // BRepGraph_TopoView_ProductOps.Component (method)
  Component(theProduct: BRepGraph_ProductId, theComponentIdx: number): BRepGraph_OccurrenceId;

  // BRepGraph_TopoView_ProductOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_ProductOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_ShellOps: declare class BRepGraph_TopoView_ShellOps

  // BRepGraph_TopoView_ShellOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_ShellOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_ShellOps.StartId (method)
  StartId(): BRepGraph_ShellId;

  // BRepGraph_TopoView_ShellOps.EndId (method)
  EndId(): BRepGraph_ShellId;

  // BRepGraph_TopoView_ShellOps.Definition (method)
  Definition(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;

  // BRepGraph_TopoView_ShellOps.Relations (method)
  Relations(theShell: BRepGraph_ShellId): BRepGraphInc_ShellRelations;

  // BRepGraph_TopoView_ShellOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_ShellOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_SolidOps: declare class BRepGraph_TopoView_SolidOps

  // BRepGraph_TopoView_SolidOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_SolidOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_SolidOps.StartId (method)
  StartId(): BRepGraph_SolidId;

  // BRepGraph_TopoView_SolidOps.EndId (method)
  EndId(): BRepGraph_SolidId;

  // BRepGraph_TopoView_SolidOps.Definition (method)
  Definition(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;

  // BRepGraph_TopoView_SolidOps.Relations (method)
  Relations(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidRelations;

  // BRepGraph_TopoView_SolidOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_SolidOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_VertexOps: declare class BRepGraph_TopoView_VertexOps

  // BRepGraph_TopoView_VertexOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_VertexOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_VertexOps.StartId (method)
  StartId(): BRepGraph_VertexId;

  // BRepGraph_TopoView_VertexOps.EndId (method)
  EndId(): BRepGraph_VertexId;

  // BRepGraph_TopoView_VertexOps.Definition (method)
  Definition(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;

  // BRepGraph_TopoView_VertexOps.Relations (method)
  Relations(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexRelations;

  // BRepGraph_TopoView_VertexOps.Edges (method)
  Edges(theVertex: BRepGraph_VertexId): BRepGraph_EdgeId[];

  // BRepGraph_TopoView_VertexOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_VertexOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_TopoView_WireOps: declare class BRepGraph_TopoView_WireOps

  // BRepGraph_TopoView_WireOps.Nb (method)
  Nb(): number;

  // BRepGraph_TopoView_WireOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_TopoView_WireOps.StartId (method)
  StartId(): BRepGraph_WireId;

  // BRepGraph_TopoView_WireOps.EndId (method)
  EndId(): BRepGraph_WireId;

  // BRepGraph_TopoView_WireOps.Definition (method)
  Definition(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;

  // BRepGraph_TopoView_WireOps.Relations (method)
  Relations(theWire: BRepGraph_WireId): BRepGraphInc_WireRelations;

  // BRepGraph_TopoView_WireOps.delete (method)
  delete(): void;

  // BRepGraph_TopoView_WireOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Transform: declare class BRepGraph_Transform

  // BRepGraph_Transform.Perform (method)
  static Perform(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theTrsf: gp_Trsf, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy): boolean;

  // BRepGraph_Transform.TransformNode (method)
  static TransformNode(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theNodeId: BRepGraph_NodeId, theTrsf: gp_Trsf, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy): BRepGraph_NodeId;

  // BRepGraph_Transform.MoveRef (method)
  static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId, theTrsf: gp_Trsf): boolean;
  static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId, theTrsf: gp_Trsf): boolean;

  // BRepGraph_Transform.delete (method)
  delete(): void;

  // BRepGraph_Transform.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_UID: declare class BRepGraph_UID

  // BRepGraph_UID.constructor (constructor)
  constructor();
  constructor(theKind: BRepGraph_NodeId_Kind, theCounter: number);

  Kind: BRepGraph_NodeId_Kind

  Counter: number

  // BRepGraph_UID.Invalid (method)
  static Invalid(): BRepGraph_UID;

  // BRepGraph_UID.IsValid (method)
  IsValid(): boolean;

  // BRepGraph_UID.IsTopology (method)
  IsTopology(): boolean;

  // BRepGraph_UID.IsAssembly (method)
  IsAssembly(): boolean;

  // BRepGraph_UID.HashValue (method)
  HashValue(): number;

  // BRepGraph_UID.delete (method)
  delete(): void;

  // BRepGraph_UID.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_UIDsView: declare class BRepGraph_UIDsView

  // BRepGraph_UIDsView.Of (method)
  Of(theNode: BRepGraph_NodeId): BRepGraph_UID;
  Of(theRefId: BRepGraph_RefId): BRepGraph_RefUID;
  Of(theItem: BRepGraph_ItemId): BRepGraph_ItemUID;

  // BRepGraph_UIDsView.NodeIdFrom (method)
  NodeIdFrom(theUID: BRepGraph_UID): BRepGraph_NodeId;

  // BRepGraph_UIDsView.RefIdFrom (method)
  RefIdFrom(theUID: BRepGraph_RefUID): BRepGraph_RefId;

  // BRepGraph_UIDsView.ItemIdFrom (method)
  ItemIdFrom(theUID: BRepGraph_ItemUID): BRepGraph_ItemId;

  // BRepGraph_UIDsView.Has (method)
  Has(theUID: BRepGraph_UID): boolean;
  Has(theUID: BRepGraph_RefUID): boolean;
  Has(theUID: BRepGraph_ItemUID): boolean;

  // BRepGraph_UIDsView.Generation (method)
  Generation(): number;

  // BRepGraph_UIDsView.GraphGUID (method)
  GraphGUID(): Standard_GUID;

  // BRepGraph_UIDsView.StampOf (method)
  StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
  StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
  StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
  StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;

  // BRepGraph_UIDsView.IsStale (method)
  IsStale(theStamp: BRepGraph_VersionStamp): boolean;

  // BRepGraph_UIDsView.delete (method)
  delete(): void;

  // BRepGraph_UIDsView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_UsagePath: declare class BRepGraph_UsagePath

  // BRepGraph_UsagePath.constructor (constructor)
  constructor();
  constructor(theCapacity: number);

  // BRepGraph_UsagePath.Size (method)
  Size(): number;

  // BRepGraph_UsagePath.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepGraph_UsagePath.Value (method)
  Value(theIdx: number): BRepGraph_UsagePath_Step;

  // BRepGraph_UsagePath.First (method)
  First(): BRepGraph_UsagePath_Step;

  // BRepGraph_UsagePath.Last (method)
  Last(): BRepGraph_UsagePath_Step;

  // BRepGraph_UsagePath.Append (method)
  Append(theStep: BRepGraph_UsagePath_Step): void;

  // BRepGraph_UsagePath.InsertBefore (method)
  InsertBefore(theIdx: number, theStep: BRepGraph_UsagePath_Step): void;

  // BRepGraph_UsagePath.Clear (method)
  Clear(): void;

  // BRepGraph_UsagePath.IsEqual (method)
  IsEqual(theOther: BRepGraph_UsagePath): boolean;

  // BRepGraph_UsagePath.HashCode (method)
  HashCode(): number;

  // BRepGraph_UsagePath.delete (method)
  delete(): void;

  // BRepGraph_UsagePath.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_UsagePath_Step: declare class BRepGraph_UsagePath_Step

  // BRepGraph_UsagePath_Step.constructor (constructor)
  constructor();

  Node: BRepGraph_NodeId

  Ref: BRepGraph_RefId

  StepIndex: number

  // BRepGraph_UsagePath_Step.delete (method)
  delete(): void;

  // BRepGraph_UsagePath_Step.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Validate: declare class BRepGraph_Validate

  // BRepGraph_Validate.Perform (method)
  static Perform(theGraph: BRepGraph): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph, theMode: BRepGraph_Validate_Mode): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Validate_Options): BRepGraph_Validate_Result;

  // BRepGraph_Validate.delete (method)
  delete(): void;

  // BRepGraph_Validate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Validate_Severity: typeof BRepGraph_Validate_Severity[keyof typeof BRepGraph_Validate_Severity]

  readonly Warning: 'Warning'

  readonly Error: 'Error'

BRepGraph_Validate_Mode: typeof BRepGraph_Validate_Mode[keyof typeof BRepGraph_Validate_Mode]

  readonly Lightweight: 'Lightweight'

  readonly Audit: 'Audit'

BRepGraph_Validate_Options: declare class BRepGraph_Validate_Options

  // BRepGraph_Validate_Options.constructor (constructor)
  constructor();

  ValidationMode: BRepGraph_Validate_Mode

  // BRepGraph_Validate_Options.Lightweight (method)
  static Lightweight(): BRepGraph_Validate_Options;

  // BRepGraph_Validate_Options.Audit (method)
  static Audit(): BRepGraph_Validate_Options;

  // BRepGraph_Validate_Options.delete (method)
  delete(): void;

  // BRepGraph_Validate_Options.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Validate_Result: declare class BRepGraph_Validate_Result

  // BRepGraph_Validate_Result.constructor (constructor)
  constructor();

  Issues: BRepGraph_Validate_Issue[]

  // BRepGraph_Validate_Result.IsValid (method)
  IsValid(): boolean;

  // BRepGraph_Validate_Result.NbIssues (method)
  NbIssues(theSev: BRepGraph_Validate_Severity): number;

  // BRepGraph_Validate_Result.delete (method)
  delete(): void;

  // BRepGraph_Validate_Result.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_VersionStamp: declare class BRepGraph_VersionStamp

  // BRepGraph_VersionStamp.constructor (constructor)
  constructor();
  constructor(theUID: BRepGraph_UID, theMutationGen: number, theGeneration: number);
  constructor(theRefUID: BRepGraph_RefUID, theMutationGen: number, theGeneration: number);

  myNodeUID: BRepGraph_UID

  myRefUID: BRepGraph_RefUID

  myMutationGen: number

  myGeneration: number

  myDomain: BRepGraph_VersionStamp_Domain

  // BRepGraph_VersionStamp.IsValid (method)
  IsValid(): boolean;

  // BRepGraph_VersionStamp.IsNodeStamp (method)
  IsNodeStamp(): boolean;

  // BRepGraph_VersionStamp.IsRefStamp (method)
  IsRefStamp(): boolean;

  // BRepGraph_VersionStamp.ItemUID (method)
  ItemUID(): BRepGraph_ItemUID;

  // BRepGraph_VersionStamp.IsSameItem (method)
  IsSameItem(theOther: BRepGraph_VersionStamp): boolean;

  // BRepGraph_VersionStamp.ToGUID (method)
  ToGUID(theGraphGUID: Standard_GUID): Standard_GUID;

  // BRepGraph_VersionStamp.HashValue (method)
  HashValue(): number;

  // BRepGraph_VersionStamp.delete (method)
  delete(): void;

  // BRepGraph_VersionStamp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_VersionStamp_Domain: typeof BRepGraph_VersionStamp_Domain[keyof typeof BRepGraph_VersionStamp_Domain]

  readonly None: 'None'

  readonly Node: 'Node'

  readonly Reference: 'Reference'

BRepGraph_CoEdgeCurve2DRepId: declare class BRepGraph_CoEdgeCurve2DRepId

  // BRepGraph_CoEdgeCurve2DRepId.constructor (constructor)
  constructor();
  constructor(theIdx: number);

  Index: number

  // BRepGraph_CoEdgeCurve2DRepId.Start (method)
  static Start(): unknown;

  // BRepGraph_CoEdgeCurve2DRepId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_CoEdgeCurve2DRepId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_CoEdgeCurve2DRepId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_CoEdgeCurve2DRepId.delete (method)
  delete(): void;

  // BRepGraph_CoEdgeCurve2DRepId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CoEdgePolygon2DRepId: declare class BRepGraph_CoEdgePolygon2DRepId

  // BRepGraph_CoEdgePolygon2DRepId.constructor (constructor)
  constructor();
  constructor(theIdx: number);

  Index: number

  // BRepGraph_CoEdgePolygon2DRepId.Start (method)
  static Start(): unknown;

  // BRepGraph_CoEdgePolygon2DRepId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_CoEdgePolygon2DRepId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_CoEdgePolygon2DRepId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_CoEdgePolygon2DRepId.delete (method)
  delete(): void;

  // BRepGraph_CoEdgePolygon2DRepId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CoEdgePolygonOnTriRepId: declare class BRepGraph_CoEdgePolygonOnTriRepId

  // BRepGraph_CoEdgePolygonOnTriRepId.constructor (constructor)
  constructor();
  constructor(theIdx: number);

  Index: number

  // BRepGraph_CoEdgePolygonOnTriRepId.Start (method)
  static Start(): unknown;

  // BRepGraph_CoEdgePolygonOnTriRepId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_CoEdgePolygonOnTriRepId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_CoEdgePolygonOnTriRepId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_CoEdgePolygonOnTriRepId.delete (method)
  delete(): void;

  // BRepGraph_CoEdgePolygonOnTriRepId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_EdgeCurve3DRepId: declare class BRepGraph_EdgeCurve3DRepId

  // BRepGraph_EdgeCurve3DRepId.constructor (constructor)
  constructor();
  constructor(theIdx: number);

  Index: number

  // BRepGraph_EdgeCurve3DRepId.Start (method)
  static Start(): unknown;

  // BRepGraph_EdgeCurve3DRepId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_EdgeCurve3DRepId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_EdgeCurve3DRepId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_EdgeCurve3DRepId.delete (method)
  delete(): void;

  // BRepGraph_EdgeCurve3DRepId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_EdgePolygon3DRepId: declare class BRepGraph_EdgePolygon3DRepId

  // BRepGraph_EdgePolygon3DRepId.constructor (constructor)
  constructor();
  constructor(theIdx: number);

  Index: number

  // BRepGraph_EdgePolygon3DRepId.Start (method)
  static Start(): unknown;

  // BRepGraph_EdgePolygon3DRepId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_EdgePolygon3DRepId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_EdgePolygon3DRepId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_EdgePolygon3DRepId.delete (method)
  delete(): void;

  // BRepGraph_EdgePolygon3DRepId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FaceSurfaceRepId: declare class BRepGraph_FaceSurfaceRepId

  // BRepGraph_FaceSurfaceRepId.constructor (constructor)
  constructor();
  constructor(theIdx: number);

  Index: number

  // BRepGraph_FaceSurfaceRepId.Start (method)
  static Start(): unknown;

  // BRepGraph_FaceSurfaceRepId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_FaceSurfaceRepId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_FaceSurfaceRepId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_FaceSurfaceRepId.delete (method)
  delete(): void;

  // BRepGraph_FaceSurfaceRepId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FaceTriangulationRepId: declare class BRepGraph_FaceTriangulationRepId

  // BRepGraph_FaceTriangulationRepId.constructor (constructor)
  constructor();
  constructor(theIdx: number);

  Index: number

  // BRepGraph_FaceTriangulationRepId.Start (method)
  static Start(): unknown;

  // BRepGraph_FaceTriangulationRepId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_FaceTriangulationRepId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_FaceTriangulationRepId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_FaceTriangulationRepId.delete (method)
  delete(): void;

  // BRepGraph_FaceTriangulationRepId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RepId: declare class BRepGraph_RepId

  // BRepGraph_RepId.constructor (constructor)
  constructor();
  constructor(theKind: BRepGraph_RepId_Kind, theIdx: number);

  RepKind: BRepGraph_RepId_Kind

  Index: number

  // BRepGraph_RepId.IsValidKind (method)
  static IsValidKind(theKind: BRepGraph_RepId_Kind): boolean;

  // BRepGraph_RepId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_RepId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_RepId.delete (method)
  delete(): void;

  // BRepGraph_RepId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RepId_Kind: typeof BRepGraph_RepId_Kind[keyof typeof BRepGraph_RepId_Kind]

  readonly EdgeCurve3D: 'EdgeCurve3D'

  readonly EdgePolygon3D: 'EdgePolygon3D'

  readonly CoEdgeCurve2D: 'CoEdgeCurve2D'

  readonly CoEdgePolygon2D: 'CoEdgePolygon2D'

  readonly CoEdgePolygonOnTri: 'CoEdgePolygonOnTri'

  readonly FaceSurface: 'FaceSurface'

  readonly FaceTriangulation: 'FaceTriangulation'

BRepGraph_ChildExplorer_Config: interface BRepGraph_ChildExplorer_Config

  Mode: BRepGraph_ChildExplorer_TraversalMode

  TargetKind: BRepGraph_NodeId_Kind | null | undefined

  AvoidKind: BRepGraph_NodeId_Kind | null | undefined

  EmitAvoidKind: boolean

  AccumulateLocation: boolean

  AccumulateOrientation: boolean

  StartLoc: TopLoc_Location

  StartOri: TopAbs_Orientation

BRepGraph_Compact_Result: interface BRepGraph_Compact_Result

  NbRemovedVertices: number

  NbRemovedEdges: number

  NbRemovedWires: number

  NbRemovedFaces: number

  NbRemovedShells: number

  NbRemovedSolids: number

  NbRemovedCompounds: number

  NbRemovedCompSolids: number

  NbRemovedSurfaces: number

  NbRemovedCurves: number

  NbNodesBefore: number

  NbNodesAfter: number

  NbUnmappedActiveDefs: number

BRepGraph_Deduplicate_Options: interface BRepGraph_Deduplicate_Options

  AnalyzeOnly: boolean

  HistoryMode: boolean

  MergeEntitiesWhenSafe: boolean

  CompTolerance: number

  HashTolerance: number

BRepGraph_Deduplicate_Result: interface BRepGraph_Deduplicate_Result

  NbCanonicalSurfaces: number

  NbCanonicalCurves: number

  NbSurfaceRewrites: number

  NbCurveRewrites: number

  NbNullifiedSurfaces: number

  NbNullifiedCurves: number

  NbHistoryRecords: number

  IsEntityMergeApplied: boolean

  NbMergedVertices: number

  NbMergedEdges: number

  NbMergedWires: number

  NbMergedFaces: number

  NbReorderedWires: number

  NbToleranceOrderedWires: number

  NbPartialOrderedWires: number

  AffectedFaces: BRepGraph_FaceId[]

  AffectedEdges: BRepGraph_EdgeId[]

BRepGraph_EditorView_BoundaryIssue: interface BRepGraph_EditorView_BoundaryIssue

  NodeId: BRepGraph_NodeId

  Description: TCollection_AsciiString

BRepGraph_LayerHistory_Event: interface BRepGraph_LayerHistory_Event

  OperationName: TCollection_AsciiString

  SequenceNumber: number

  RecordKind: BRepGraph_LayerHistory_Kind

  Mapping: any

  UidMapping: any

  ItemUidMapping: any

  ExtraInfo: TCollection_AsciiString

BRepGraph_LayerParametric_AddResult: interface BRepGraph_LayerParametric_AddResult

  Instance: number

  Root: BRepGraph_NodeId

BRepGraph_LayerTopoSupplement_Entry: interface BRepGraph_LayerTopoSupplement_Entry

  BaseOwner: BRepGraph_NodeId

  LocalUid: number

  Kind: BRepGraph_LayerTopoSupplement_AttachmentKind

  Shape: TopoDS_Shape

BRepGraph_ParallelPolicy_Workload: interface BRepGraph_ParallelPolicy_Workload

  PrimaryItems: number

  AuxiliaryItems: number

  InteractionCount: number

BRepGraph_ParentExplorer_Config: interface BRepGraph_ParentExplorer_Config

  Mode: BRepGraph_ParentExplorer_TraversalMode

  TargetKind: BRepGraph_NodeId_Kind | null | undefined

  AvoidKind: BRepGraph_NodeId_Kind | null | undefined

  EmitAvoidKind: boolean

BRepGraph_ShapesView_Options: interface BRepGraph_ShapesView_Options

  Populate: BRepGraphInc_Populate_Options

  CreateAutoProduct: boolean

  Flatten: boolean

  Parallel: boolean

  TrackAddedNodes: boolean

BRepGraph_Validate_Issue: interface BRepGraph_Validate_Issue

  Sev: BRepGraph_Validate_Severity

  NodeId: BRepGraph_NodeId

  Description: TCollection_AsciiString
