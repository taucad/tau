# libcascade — BRepGraph (4)

41 top-level symbols. Signatures are verbatim typescript.

BRepGraph_RefsView_GenOps: declare class BRepGraph_RefsView_GenOps

  Nb(theKind: BRepGraph_RefId_Kind): number;

  IsValid(theRef: BRepGraph_RefId): boolean;

  IsActive(theRef: BRepGraph_RefId): boolean;

  IsRemoved(theRef: BRepGraph_RefId): boolean;

  RefAtStep(theParent: BRepGraph_NodeId, theStep: number): BRepGraph_RefId;

  ChildNode(theRef: BRepGraph_RefId): BRepGraph_NodeId;

  LocalLocation(theRef: BRepGraph_RefId): TopLoc_Location;

  Orientation(theRef: BRepGraph_RefId): TopAbs_Orientation;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsView_OccurrenceOps: declare class BRepGraph_RefsView_OccurrenceOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_OccurrenceRefId;

  EndId(): BRepGraph_OccurrenceRefId;

  Entry(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  IdsOf(theProduct: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

  IdsReferencing(theChild: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsView_ShellOps: declare class BRepGraph_RefsView_ShellOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_ShellRefId;

  EndId(): BRepGraph_ShellRefId;

  Entry(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  IdsOf(theSolid: BRepGraph_SolidId): BRepGraph_ShellRefId[];

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsView_SolidOps: declare class BRepGraph_RefsView_SolidOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_SolidRefId;

  EndId(): BRepGraph_SolidRefId;

  Entry(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  IdsOf(theCompSolid: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsView_VertexOps: declare class BRepGraph_RefsView_VertexOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_VertexRefId;

  EndId(): BRepGraph_VertexRefId;

  Entry(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsView_WireOps: declare class BRepGraph_RefsView_WireOps

  Nb(): number;

  NbActive(): number;

  StartId(): BRepGraph_WireRefId;

  EndId(): BRepGraph_WireRefId;

  Entry(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  IdsOf(theFace: BRepGraph_FaceId): BRepGraph_WireRefId[];

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RelatedIterator: declare class BRepGraph_RelatedIterator

  constructor

  More(): boolean;

  Next(): void;

  Current(): BRepGraph_NodeId;

  CurrentRelation(): BRepGraph_RelatedIterator_RelationKind;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RelatedIterator_RelationKind: typeof BRepGraph_RelatedIterator_RelationKind[keyof typeof BRepGraph_RelatedIterator_RelationKind]

BRepGraph_RelatedIterator_Stage: typeof BRepGraph_RelatedIterator_Stage[keyof typeof BRepGraph_RelatedIterator_Stage]

BRepGraph_CoEdgesOfEdge: declare class BRepGraph_CoEdgesOfEdge

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_CoEdgeId;

  Current(): BRepGraph_CoEdgeId;

  Definition(): BRepGraphInc_CoEdgeDef;

  Index(): number;

  Size(): number;

  Value(theIndex: number): BRepGraph_CoEdgeId;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CompSolidsOfSolid: declare class BRepGraph_CompSolidsOfSolid

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_CompSolidId;

  CurrentParentId(): BRepGraph_CompSolidId;

  CurrentRefId(): BRepGraph_SolidRefId;

  Current(): BRepGraph_CompSolidId;

  Definition(): BRepGraphInc_CompSolidDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CompoundsOfChild: declare class BRepGraph_CompoundsOfChild

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_CompoundId;

  CurrentParentId(): BRepGraph_CompoundId;

  CurrentRefId(): BRepGraph_ChildRefId;

  Current(): BRepGraph_CompoundId;

  Definition(): BRepGraphInc_CompoundDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_EdgesOfVertex: declare class BRepGraph_EdgesOfVertex

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_EdgeId;

  Current(): BRepGraph_EdgeId;

  Definition(): BRepGraphInc_EdgeDef;

  Index(): number;

  Size(): number;

  Value(theIndex: number): BRepGraph_EdgeId;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_FacesOfEdge: declare class BRepGraph_FacesOfEdge

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_FaceId;

  Current(): BRepGraph_FaceId;

  Definition(): BRepGraphInc_FaceDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_FacesOfWire: declare class BRepGraph_FacesOfWire

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_FaceId;

  CurrentParentId(): BRepGraph_FaceId;

  CurrentRefId(): BRepGraph_WireRefId;

  Current(): BRepGraph_FaceId;

  Definition(): BRepGraphInc_FaceDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_OccurrencesOfChild: declare class BRepGraph_OccurrencesOfChild

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_OccurrenceId;

  CurrentParentId(): BRepGraph_OccurrenceId;

  CurrentRefId(): BRepGraph_OccurrenceRefId;

  Current(): BRepGraph_OccurrenceId;

  Definition(): BRepGraphInc_OccurrenceDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ProductsOfOccurrence: declare class BRepGraph_ProductsOfOccurrence

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_ProductId;

  CurrentParentId(): BRepGraph_ProductId;

  CurrentRefId(): BRepGraph_OccurrenceRefId;

  Current(): BRepGraph_ProductId;

  Definition(): BRepGraphInc_ProductDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsEdgesOfVertex: declare class BRepGraph_RefsEdgesOfVertex

  constructor

  More(): boolean;

  Next(): void;

  Current(): any;

  CurrentParentId(): BRepGraph_EdgeId;

  CurrentRefId(): BRepGraph_VertexRefId;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsShellsOfFace: declare class BRepGraph_RefsShellsOfFace

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_ShellId;

  CurrentParentId(): BRepGraph_ShellId;

  CurrentRefId(): BRepGraph_FaceRefId;

  Current(): BRepGraph_ShellId;

  Definition(): BRepGraphInc_ShellDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsSolidsOfShell: declare class BRepGraph_RefsSolidsOfShell

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_SolidId;

  CurrentParentId(): BRepGraph_SolidId;

  CurrentRefId(): BRepGraph_ShellRefId;

  Current(): BRepGraph_SolidId;

  Definition(): BRepGraphInc_SolidDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_RefsWiresOfCoEdge: declare class BRepGraph_RefsWiresOfCoEdge

  constructor

  More(): boolean;

  Next(): void;

  Current(): any;

  CurrentParentId(): BRepGraph_WireId;

  CurrentRefId(): BRepGraph_CoEdgeId;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits: declare class BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits

  constructor

  static Id(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraph_CompSolidId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_CompoundFromChildRefTraits: declare class BRepGraph_ReverseIterator_CompoundFromChildRefTraits

  constructor

  static Id(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraph_CompoundId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_EdgeOfVertexRefTraits: declare class BRepGraph_ReverseIterator_EdgeOfVertexRefTraits

  constructor

  static FindRef(theGraph: BRepGraph, theParent: BRepGraph_EdgeId, theChild: BRepGraph_VertexId): BRepGraph_VertexRefId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits: declare class BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits

  constructor

  static ParentIdOf(theCoEdge: BRepGraphInc_CoEdgeDef): BRepGraph_FaceId;

  static NbParents(theGraph: BRepGraph): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_FaceFromWireRefTraits: declare class BRepGraph_ReverseIterator_FaceFromWireRefTraits

  constructor

  static Id(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraph_FaceId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits: declare class BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits

  constructor

  static Id(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraph_OccurrenceId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits: declare class BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits

  constructor

  static Id(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraph_ProductId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_ShellFromFaceRefTraits: declare class BRepGraph_ReverseIterator_ShellFromFaceRefTraits

  constructor

  static Id(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraph_ShellId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_SolidFromShellRefTraits: declare class BRepGraph_ReverseIterator_SolidFromShellRefTraits

  constructor

  static Id(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraph_SolidId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits: declare class BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits

  constructor

  static ParentIdOf(theCoEdge: BRepGraphInc_CoEdgeDef): BRepGraph_WireId;

  static NbParents(theGraph: BRepGraph): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits: declare class BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits

  constructor

  static FindRef(theGraph: BRepGraph, theParent: BRepGraph_WireId, theChild: BRepGraph_CoEdgeId): BRepGraph_CoEdgeId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_WiresOfEdge: declare class BRepGraph_WiresOfEdge

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_WireId;

  Current(): BRepGraph_WireId;

  Definition(): BRepGraphInc_WireDef;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ShapesView: declare class BRepGraph_ShapesView

  Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;

  CollectHistoryInputs(theRoots: NCollection_Array1_BRepGraph_NodeId, theOutInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher): void;

  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;

  Shape(theNode: BRepGraph_NodeId): TopoDS_Shape;

  HasOriginal(theNode: BRepGraph_NodeId): boolean;

  Original(theNode: BRepGraph_NodeId): TopoDS_Shape;

  Reconstruct(theRoot: BRepGraph_NodeId): TopoDS_Shape;

  ClearCached(theNode: BRepGraph_NodeId): void;
  ClearCached(theRef: BRepGraph_RefId): void;
  ClearCached(theNode: BRepGraph_NodeId): void;
  ClearCached(theRef: BRepGraph_RefId): void;

  FindNode(theShape: TopoDS_Shape): BRepGraph_NodeId;

  HasNode(theShape: TopoDS_Shape): boolean;

  RemoveShape(theShape: TopoDS_Shape): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ShapesView_AddStatus: typeof BRepGraph_ShapesView_AddStatus[keyof typeof BRepGraph_ShapesView_AddStatus]

BRepGraph_ShapesView_Result: declare class BRepGraph_ShapesView_Result

  constructor

  TopologyRoot: BRepGraph_NodeId

  Product: BRepGraph_ProductId

  Occurrence: BRepGraph_OccurrenceId

  InsertedRef: BRepGraph_RefId

  Status: BRepGraph_ShapesView_AddStatus

  AddedNodes: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher

  IsOk(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_SupplementEditor: declare class BRepGraph_SupplementEditor

  constructor

  Attach(theOwner: BRepGraph_NodeId, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): number;

  AttachToVertex(theVertex: BRepGraph_VertexId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  AttachToEdge(theEdge: BRepGraph_EdgeId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  AttachToFace(theFace: BRepGraph_FaceId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  AttachToSolid(theSolid: BRepGraph_SolidId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  AttachToCompSolid(theCompSolid: BRepGraph_CompSolidId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  AttachToShell(theShell: BRepGraph_ShellId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  AttachToCompound(theCompound: BRepGraph_CompoundId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  RemoveAttachment(theUid: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_SupplementIterator: declare class BRepGraph_SupplementIterator

  constructor

  More(): boolean;

  Next(): void;

  Uid(): number;

  Value(): BRepGraph_LayerTopoSupplement_Entry;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Tool: declare class BRepGraph_Tool

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Tool_CoEdge: declare class BRepGraph_Tool_CoEdge

  constructor

  static Orientation(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): TopAbs_Orientation;

  static IsReversed(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  static EdgeOf(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_EdgeId;

  static FaceOf(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_FaceId;

  static SeamPair(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CoEdgeId;

  static IsSeam(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  static HasPCurve(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  static SameParameter(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  static SameRange(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  static PCurve(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): Geom2d_Curve;

  static PCurveAdaptor(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): Geom2dAdaptor_Curve;
  static PCurveAdaptor(theGraph: BRepGraph, theRef: any): Geom2dAdaptor_Curve;
  static PCurveAdaptor(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): Geom2dAdaptor_Curve;
  static PCurveAdaptor(theGraph: BRepGraph, theRef: any): Geom2dAdaptor_Curve;

  static UVPoints(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): [gp_Pnt2d, gp_Pnt2d];

  static Range(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): [number, number];

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Tool_Edge: declare class BRepGraph_Tool_Edge

  constructor

  static Tolerance(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): number;

  static Degenerated(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  static IsClosed(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  static Range(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): [number, number];

  static StartVertexId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): BRepGraph_VertexRefId;

  static EndVertexId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): BRepGraph_VertexRefId;

  static HasCurve(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  static Curve(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): Geom_Curve;
  static Curve(theGraph: BRepGraph, theRef: any): Geom_Curve;
  static Curve(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): Geom_Curve;
  static Curve(theGraph: BRepGraph, theRef: any): Geom_Curve;

  static CurveAdaptor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): GeomAdaptor_TransformedCurve;
  static CurveAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedCurve;
  static CurveAdaptor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): GeomAdaptor_TransformedCurve;
  static CurveAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedCurve;

  static FindByVertices(theGraph: BRepGraph, theStartVertex: BRepGraph_VertexId, theEndVertex: BRepGraph_VertexId, theToIgnoreOrientation?: boolean): BRepGraph_EdgeId;

  static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
  static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;
  static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
  static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;

  static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
  static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;
  static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
  static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;

  static NbFaces(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): number;

  static IsManifold(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  static IsBoundary(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  static IsSeamOnFace(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): boolean;

  static CurveOnSurface(theGraph: BRepGraph, theRef: any, theFace: BRepGraph_FaceId): Adaptor3d_CurveOnSurface;

  delete(): void;

  [Symbol.dispose](): void;
