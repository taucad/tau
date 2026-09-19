# libcascade — BRepGraph (5)

31 top-level symbols. Signatures are verbatim typescript.

BRepGraph_Tool_Face: declare class BRepGraph_Tool_Face

  constructor

  static Usage(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): any;

  static Tolerance(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
  static Tolerance(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;
  static Tolerance(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
  static Tolerance(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;

  static HasSurface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): boolean;
  static HasSurface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): boolean;
  static HasSurface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): boolean;
  static HasSurface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): boolean;

  static OuterWire(theGraph: BRepGraph, theFace: BRepGraph_FaceId): BRepGraph_WireId;
  static OuterWire(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): BRepGraph_WireId;
  static OuterWire(theGraph: BRepGraph, theFace: BRepGraph_FaceId): BRepGraph_WireId;
  static OuterWire(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): BRepGraph_WireId;

  static Surface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): Geom_Surface;
  static Surface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): Geom_Surface;
  static Surface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): Geom_Surface;
  static Surface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): Geom_Surface;

  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;

  static NbWires(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
  static NbWires(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;
  static NbWires(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
  static NbWires(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;

  static Bounds(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };
  static Bounds(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };
  static Bounds(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };
  static Bounds(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Tool_Shell: declare class BRepGraph_Tool_Shell

  constructor

  static Usage(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): any;

  static IsClosed(theGraph: BRepGraph, theShell: BRepGraph_ShellId): boolean;
  static IsClosed(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): boolean;
  static IsClosed(theGraph: BRepGraph, theShell: BRepGraph_ShellId): boolean;
  static IsClosed(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): boolean;

  static NbFaces(theGraph: BRepGraph, theShell: BRepGraph_ShellId): number;
  static NbFaces(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): number;
  static NbFaces(theGraph: BRepGraph, theShell: BRepGraph_ShellId): number;
  static NbFaces(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Tool_Vertex: declare class BRepGraph_Tool_Vertex

  constructor

  static Usage(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): any;

  static Pnt(theGraph: BRepGraph, theRef: any): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theRef: any): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theRef: any): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): gp_Pnt;

  static Tolerance(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): number;
  static Tolerance(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): number;
  static Tolerance(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): number;
  static Tolerance(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): number;

  static NbEdges(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Tool_Wire: declare class BRepGraph_Tool_Wire

  constructor

  static Usage(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): any;

  static IsClosed(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
  static IsClosed(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;
  static IsClosed(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
  static IsClosed(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;

  static NbCoEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
  static NbCoEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;
  static NbCoEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
  static NbCoEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;

  static NbDistinctEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
  static NbDistinctEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;
  static NbDistinctEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
  static NbDistinctEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;

  static FaceOf(theGraph: BRepGraph, theWire: BRepGraph_WireId): BRepGraph_FaceId;
  static FaceOf(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): BRepGraph_FaceId;
  static FaceOf(theGraph: BRepGraph, theWire: BRepGraph_WireId): BRepGraph_FaceId;
  static FaceOf(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): BRepGraph_FaceId;

  static IsOuter(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
  static IsOuter(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;
  static IsOuter(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
  static IsOuter(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView: declare class BRepGraph_TopoView

  Faces(): BRepGraph_TopoView_FaceOps;

  Edges(): BRepGraph_TopoView_EdgeOps;

  Vertices(): BRepGraph_TopoView_VertexOps;

  Wires(): BRepGraph_TopoView_WireOps;

  Shells(): BRepGraph_TopoView_ShellOps;

  Solids(): BRepGraph_TopoView_SolidOps;

  CoEdges(): BRepGraph_TopoView_CoEdgeOps;

  Compounds(): BRepGraph_TopoView_CompoundOps;

  CompSolids(): BRepGraph_TopoView_CompSolidOps;

  Products(): BRepGraph_TopoView_ProductOps;

  Occurrences(): BRepGraph_TopoView_OccurrenceOps;

  Gen(): BRepGraph_TopoView_GenOps;

  Geometry(): BRepGraph_TopoView_GeometryOps;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_CoEdgeOps: declare class BRepGraph_TopoView_CoEdgeOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_CoEdgeId;

  EndId(): BRepGraph_CoEdgeId;

  Definition(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  Edge(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_EdgeId;

  Face(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_FaceId;

  Wire(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_WireId;

  Curve2D(theCoEdge: BRepGraph_CoEdgeId): Geom2d_Curve;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_CompSolidOps: declare class BRepGraph_TopoView_CompSolidOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_CompSolidId;

  EndId(): BRepGraph_CompSolidId;

  Definition(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;

  Relations(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidRelations;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_CompoundOps: declare class BRepGraph_TopoView_CompoundOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_CompoundId;

  EndId(): BRepGraph_CompoundId;

  Definition(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;

  Relations(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundRelations;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_EdgeOps: declare class BRepGraph_TopoView_EdgeOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_EdgeId;

  EndId(): BRepGraph_EdgeId;

  Definition(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;

  Relations(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeRelations;

  NbFaces(theEdge: BRepGraph_EdgeId): number;

  WiresOf(theEdge: BRepGraph_EdgeId): BRepGraph_WiresOfEdge;
  WiresOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_WiresOfEdge;
  WiresOf(theEdge: BRepGraph_EdgeId): BRepGraph_WiresOfEdge;
  WiresOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_WiresOfEdge;

  FacesOf(theEdge: BRepGraph_EdgeId): BRepGraph_FacesOfEdge;
  FacesOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_FacesOfEdge;
  FacesOf(theEdge: BRepGraph_EdgeId): BRepGraph_FacesOfEdge;
  FacesOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_FacesOfEdge;

  CoEdges(theEdge: BRepGraph_EdgeId): BRepGraph_CoEdgeId[];

  Curve3D(theEdge: BRepGraph_EdgeId): Geom_Curve;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_FaceOps: declare class BRepGraph_TopoView_FaceOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_FaceId;

  EndId(): BRepGraph_FaceId;

  Definition(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;

  Relations(theFace: BRepGraph_FaceId): BRepGraphInc_FaceRelations;

  Surface(theFace: BRepGraph_FaceId): Geom_Surface;

  ActiveTriangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_GenOps: declare class BRepGraph_TopoView_GenOps

  TopoEntity(theId: BRepGraph_NodeId): BRepGraphInc_BaseDef;

  CompoundRefIds(theChild: BRepGraph_NodeId): BRepGraph_ChildRefId[];

  OccurrenceRefIds(theChild: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];

  HasCompoundParents(theNode: BRepGraph_NodeId): boolean;

  HasOccurrenceParents(theNode: BRepGraph_NodeId): boolean;

  NbNodes(): number;

  Nb(theKind: BRepGraph_NodeId_Kind): number;

  IsValid(theNode: BRepGraph_NodeId): boolean;

  IsActive(theNode: BRepGraph_NodeId): boolean;

  IsRemoved(theNode: BRepGraph_NodeId): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_GeometryOps: declare class BRepGraph_TopoView_GeometryOps

  NbFaceSurfaces(): number;

  NbEdgeCurves3D(): number;

  NbCoEdgeCurves2D(): number;

  NbActiveFaceSurfaces(): number;

  NbActiveEdgeCurves3D(): number;

  NbActiveCoEdgeCurves2D(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_OccurrenceOps: declare class BRepGraph_TopoView_OccurrenceOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_OccurrenceId;

  EndId(): BRepGraph_OccurrenceId;

  Definition(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;

  Relations(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceRelations;

  Product(theOccurrence: BRepGraph_OccurrenceId): BRepGraph_ProductId;

  ParentProduct(theOccurrence: BRepGraph_OccurrenceId): BRepGraph_ProductId;

  OccurrenceLocation(theOccurrence: BRepGraph_OccurrenceId): TopLoc_Location;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_ProductOps: declare class BRepGraph_TopoView_ProductOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_ProductId;

  EndId(): BRepGraph_ProductId;

  Definition(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;

  Relations(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductRelations;

  ShapeRoot(theProduct: BRepGraph_ProductId): BRepGraph_NodeId;

  IsAssembly(theProduct: BRepGraph_ProductId): boolean;

  IsPart(theProduct: BRepGraph_ProductId): boolean;

  ShapeRootNode(theProduct: BRepGraph_ProductId): BRepGraph_NodeId;

  NbComponents(theProduct: BRepGraph_ProductId): number;

  Component(theProduct: BRepGraph_ProductId, theComponentIdx: number): BRepGraph_OccurrenceId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_ShellOps: declare class BRepGraph_TopoView_ShellOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_ShellId;

  EndId(): BRepGraph_ShellId;

  Definition(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;

  Relations(theShell: BRepGraph_ShellId): BRepGraphInc_ShellRelations;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_SolidOps: declare class BRepGraph_TopoView_SolidOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_SolidId;

  EndId(): BRepGraph_SolidId;

  Definition(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;

  Relations(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidRelations;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_VertexOps: declare class BRepGraph_TopoView_VertexOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_VertexId;

  EndId(): BRepGraph_VertexId;

  Definition(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;

  Relations(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexRelations;

  Edges(theVertex: BRepGraph_VertexId): BRepGraph_EdgeId[];

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_TopoView_WireOps: declare class BRepGraph_TopoView_WireOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_WireId;

  EndId(): BRepGraph_WireId;

  Definition(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;

  Relations(theWire: BRepGraph_WireId): BRepGraphInc_WireRelations;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Transform: declare class BRepGraph_Transform

  static Perform(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theTrsf: gp_Trsf, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy): boolean;

  static TransformNode(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theNodeId: BRepGraph_NodeId, theTrsf: gp_Trsf, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy): BRepGraph_NodeId;

  static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId, theTrsf: gp_Trsf): boolean;
  static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId, theTrsf: gp_Trsf): boolean;
  static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId, theTrsf: gp_Trsf): boolean;
  static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId, theTrsf: gp_Trsf): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_UID: declare class BRepGraph_UID

  constructor

  Kind: BRepGraph_NodeId_Kind

  Counter: number

  static Invalid(): BRepGraph_UID;

  IsValid(): boolean;

  IsTopology(): boolean;

  IsAssembly(): boolean;

  HashValue(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_UIDsView: declare class BRepGraph_UIDsView

  Of(theNode: BRepGraph_NodeId): BRepGraph_UID;
  Of(theRefId: BRepGraph_RefId): BRepGraph_RefUID;
  Of(theItem: BRepGraph_ItemId): BRepGraph_ItemUID;
  Of(theNode: BRepGraph_NodeId): BRepGraph_UID;
  Of(theRefId: BRepGraph_RefId): BRepGraph_RefUID;
  Of(theItem: BRepGraph_ItemId): BRepGraph_ItemUID;
  Of(theNode: BRepGraph_NodeId): BRepGraph_UID;
  Of(theRefId: BRepGraph_RefId): BRepGraph_RefUID;
  Of(theItem: BRepGraph_ItemId): BRepGraph_ItemUID;

  NodeIdFrom(theUID: BRepGraph_UID): BRepGraph_NodeId;

  RefIdFrom(theUID: BRepGraph_RefUID): BRepGraph_RefId;

  ItemIdFrom(theUID: BRepGraph_ItemUID): BRepGraph_ItemId;

  Has(theUID: BRepGraph_UID): boolean;
  Has(theUID: BRepGraph_RefUID): boolean;
  Has(theUID: BRepGraph_ItemUID): boolean;
  Has(theUID: BRepGraph_UID): boolean;
  Has(theUID: BRepGraph_RefUID): boolean;
  Has(theUID: BRepGraph_ItemUID): boolean;
  Has(theUID: BRepGraph_UID): boolean;
  Has(theUID: BRepGraph_RefUID): boolean;
  Has(theUID: BRepGraph_ItemUID): boolean;

  Generation(): number;

  GraphGUID(): Standard_GUID;

  StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
  StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
  StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
  StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;
  StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
  StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
  StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
  StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;
  StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
  StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
  StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
  StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;
  StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
  StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
  StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
  StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;

  IsStale(theStamp: BRepGraph_VersionStamp): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_UsagePath: declare class BRepGraph_UsagePath

  constructor

  Size(): number;

  IsEmpty(): boolean;

  Value(theIdx: number): BRepGraph_UsagePath_Step;

  First(): BRepGraph_UsagePath_Step;

  Last(): BRepGraph_UsagePath_Step;

  Append(theStep: BRepGraph_UsagePath_Step): void;

  InsertBefore(theIdx: number, theStep: BRepGraph_UsagePath_Step): void;

  Clear(): void;

  IsEqual(theOther: BRepGraph_UsagePath): boolean;

  HashCode(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_UsagePath_Step: declare class BRepGraph_UsagePath_Step

  constructor

  Node: BRepGraph_NodeId

  Ref: BRepGraph_RefId

  StepIndex: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Validate: declare class BRepGraph_Validate

  static Perform(theGraph: BRepGraph): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph, theMode: BRepGraph_Validate_Mode): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Validate_Options): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph, theMode: BRepGraph_Validate_Mode): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Validate_Options): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph, theMode: BRepGraph_Validate_Mode): BRepGraph_Validate_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Validate_Options): BRepGraph_Validate_Result;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Validate_Severity: typeof BRepGraph_Validate_Severity[keyof typeof BRepGraph_Validate_Severity]

BRepGraph_Validate_Mode: typeof BRepGraph_Validate_Mode[keyof typeof BRepGraph_Validate_Mode]

BRepGraph_Validate_Options: declare class BRepGraph_Validate_Options

  constructor

  ValidationMode: BRepGraph_Validate_Mode

  static Lightweight(): BRepGraph_Validate_Options;

  static Audit(): BRepGraph_Validate_Options;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Validate_Result: declare class BRepGraph_Validate_Result

  constructor

  Issues: BRepGraph_Validate_Issue[]

  IsValid(): boolean;

  NbIssues(theSev: BRepGraph_Validate_Severity): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_VersionStamp: declare class BRepGraph_VersionStamp

  constructor

  myNodeUID: BRepGraph_UID

  myRefUID: BRepGraph_RefUID

  myMutationGen: number

  myGeneration: number

  myDomain: BRepGraph_VersionStamp_Domain

  IsValid(): boolean;

  IsNodeStamp(): boolean;

  IsRefStamp(): boolean;

  ItemUID(): BRepGraph_ItemUID;

  IsSameItem(theOther: BRepGraph_VersionStamp): boolean;

  ToGUID(theGraphGUID: Standard_GUID): Standard_GUID;

  HashValue(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_VersionStamp_Domain: typeof BRepGraph_VersionStamp_Domain[keyof typeof BRepGraph_VersionStamp_Domain]

BRepGraph_CoEdgeCurve2DRepId: declare class BRepGraph_CoEdgeCurve2DRepId

  constructor

  Index: number

  static Start(): unknown;

  static Invalid(): unknown;

  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  IsRemoved(theGraph: BRepGraph): boolean;

  delete(): void;

  [Symbol.dispose](): void;
