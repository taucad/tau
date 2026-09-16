# libcascade — BRepGraph (2)

30 top-level symbols. Signatures are verbatim typescript.

BRepGraph_LayerDeferred: declare class BRepGraph_LayerDeferred extends BRepGraph_Layer

  constructor

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  FindDeferred(theItem: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theNode: BRepGraph_NodeId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theRef: BRepGraph_RefId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theItem: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theNode: BRepGraph_NodeId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theRef: BRepGraph_RefId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theItem: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theNode: BRepGraph_NodeId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theRef: BRepGraph_RefId): BRepGraph_LayerDeferred_Entry;

  HasDeferred(theItem: BRepGraph_ItemId): boolean;
  HasDeferred(theNode: BRepGraph_NodeId): boolean;
  HasDeferred(theRef: BRepGraph_RefId): boolean;
  HasDeferred(theItem: BRepGraph_ItemId): boolean;
  HasDeferred(theNode: BRepGraph_NodeId): boolean;
  HasDeferred(theRef: BRepGraph_RefId): boolean;
  HasDeferred(theItem: BRepGraph_ItemId): boolean;
  HasDeferred(theNode: BRepGraph_NodeId): boolean;
  HasDeferred(theRef: BRepGraph_RefId): boolean;

  RegisterDeferred(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theNode: BRepGraph_NodeId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theRef: BRepGraph_RefId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theNode: BRepGraph_NodeId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theRef: BRepGraph_RefId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theNode: BRepGraph_NodeId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theRef: BRepGraph_RefId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;

  RegisterDeferredRepresentations(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentations: BRepGraph_LayerDeferred_Representation, theNbRepresentations: number): void;

  RegisterDeferredRepresentationsDirect(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentations: BRepGraph_LayerDeferred_Representation, theNbRepresentations: number): void;

  UnregisterDeferred(theItem: BRepGraph_ItemId): void;
  UnregisterDeferred(theNode: BRepGraph_NodeId): void;
  UnregisterDeferred(theRef: BRepGraph_RefId): void;
  UnregisterDeferred(theItem: BRepGraph_ItemId): void;
  UnregisterDeferred(theNode: BRepGraph_NodeId): void;
  UnregisterDeferred(theRef: BRepGraph_RefId): void;
  UnregisterDeferred(theItem: BRepGraph_ItemId): void;
  UnregisterDeferred(theNode: BRepGraph_NodeId): void;
  UnregisterDeferred(theRef: BRepGraph_RefId): void;

  HasDeferredItems(): boolean;

  FindFirstDeferred(theKind: BRepGraph_LayerDeferred_RepresentationKind, theItem?: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;

  ReserveDeferredItems(theNbItems: number): void;

  BeginBulkRegistration(): void;

  EndBulkRegistration(): void;

  Name(): TCollection_AsciiString;

  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  OnRefRemoved(theRef: BRepGraph_RefId): void;

  InvalidateAll(): void;

  Clear(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerDeferred_RepresentationKind: typeof BRepGraph_LayerDeferred_RepresentationKind[keyof typeof BRepGraph_LayerDeferred_RepresentationKind]

BRepGraph_LayerDeferred_Entry: declare class BRepGraph_LayerDeferred_Entry

  constructor

  Provider: TCollection_AsciiString

  SourceKey: TCollection_AsciiString

  Representations: BRepGraph_LayerDeferred_Entry_RepresentationStorage

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerDeferred_Entry_RepresentationStorage: declare class BRepGraph_LayerDeferred_Entry_RepresentationStorage

  constructor

  Size(): number;

  IsEmpty(): boolean;

  ContainsKind(theKind: BRepGraph_LayerDeferred_RepresentationKind): boolean;

  Value(theIndex: number): BRepGraph_LayerDeferred_Representation;

  ChangeValue(theIndex: number): BRepGraph_LayerDeferred_Representation;

  First(): BRepGraph_LayerDeferred_Representation;

  Append(theRepresentation: BRepGraph_LayerDeferred_Representation): void;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerDeferred_Representation: declare class BRepGraph_LayerDeferred_Representation

  constructor

  Kind: BRepGraph_LayerDeferred_RepresentationKind

  Role: number

  Name: TCollection_AsciiString

  SourceIndex: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerHistory: declare class BRepGraph_LayerHistory extends BRepGraph_Layer

  constructor

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  Name(): TCollection_AsciiString;

  Record(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theKind: BRepGraph_LayerHistory_Kind): void;
  Record(theRecordIdx: number): BRepGraph_LayerHistory_Event;
  Record(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theKind: BRepGraph_LayerHistory_Kind): void;
  Record(theRecordIdx: number): BRepGraph_LayerHistory_Event;

  RecordBatch(theOpLabel: TCollection_AsciiString, theOriginals: NCollection_Array1_BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theExtraInfo?: TCollection_AsciiString, theKind?: BRepGraph_LayerHistory_Kind): void;

  RecordDeleted(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_NodeId): void;

  RecordReplaced(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_NodeId, theReplacement: BRepGraph_NodeId): void;

  RecordReplacedBatch(theOpLabel: TCollection_AsciiString, theOriginals: NCollection_Array1_BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theExtraInfo?: TCollection_AsciiString): void;

  RecordUid(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_UID, theReplacements: NCollection_Array1_BRepGraph_UID, theKind?: BRepGraph_LayerHistory_Kind): void;

  RecordDeletedUid(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_UID): void;

  RecordItemUid(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_ItemUID, theReplacements: NCollection_Array1_BRepGraph_ItemUID, theKind?: BRepGraph_LayerHistory_Kind): void;

  RecordDeletedItemUid(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_ItemUID): void;

  Absorb(theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;
  Absorb(theInputGraph: BRepGraph, theOutputGraph: BRepGraph, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;
  Absorb(theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;
  Absorb(theInputGraph: BRepGraph, theOutputGraph: BRepGraph, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;

  FindOriginal(theModified: BRepGraph_NodeId): BRepGraph_NodeId;

  FindDerived(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];

  FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
  FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
  FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
  FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];

  FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
  FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
  FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
  FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];

  IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
  IsDeleted(theUID: BRepGraph_UID): boolean;
  IsDeleted(theUID: BRepGraph_ItemUID): boolean;
  IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;
  IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
  IsDeleted(theUID: BRepGraph_UID): boolean;
  IsDeleted(theUID: BRepGraph_ItemUID): boolean;
  IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;
  IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
  IsDeleted(theUID: BRepGraph_UID): boolean;
  IsDeleted(theUID: BRepGraph_ItemUID): boolean;
  IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;
  IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
  IsDeleted(theUID: BRepGraph_UID): boolean;
  IsDeleted(theUID: BRepGraph_ItemUID): boolean;
  IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;

  DeletedNodes(): any;

  FindOriginals(theDerived: BRepGraph_NodeId): BRepGraph_NodeId[];

  DeletedUids(): any;
  DeletedUids(theGraph: BRepGraph): BRepGraph_UID[];
  DeletedUids(): any;
  DeletedUids(theGraph: BRepGraph): BRepGraph_UID[];

  HasKnownInput(theUID: BRepGraph_UID): boolean;
  HasKnownInput(theUID: BRepGraph_ItemUID): boolean;
  HasKnownInput(theUID: BRepGraph_UID): boolean;
  HasKnownInput(theUID: BRepGraph_ItemUID): boolean;

  DeletedItemUids(): any;

  NbRecords(): number;

  SetEnabled(theVal: boolean): void;

  IsEnabled(): boolean;

  Clear(): void;

  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  InvalidateAll(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerHistory_Kind: typeof BRepGraph_LayerHistory_Kind[keyof typeof BRepGraph_LayerHistory_Kind]

BRepGraph_LayerIterator: declare class BRepGraph_LayerIterator

  constructor

  More(): boolean;

  Next(): void;

  Value(): BRepGraph_Layer;

  Slot(): number;

  NbLayers(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerLock: declare class BRepGraph_LayerLock extends BRepGraph_Layer

  constructor

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  FindOwnerId(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): boolean;

  HasOwner(theItem: BRepGraph_ItemId): boolean;
  HasOwner(theNode: BRepGraph_NodeId): boolean;
  HasOwner(theRef: BRepGraph_RefId): boolean;
  HasOwner(theItem: BRepGraph_ItemId): boolean;
  HasOwner(theNode: BRepGraph_NodeId): boolean;
  HasOwner(theRef: BRepGraph_RefId): boolean;
  HasOwner(theItem: BRepGraph_ItemId): boolean;
  HasOwner(theNode: BRepGraph_NodeId): boolean;
  HasOwner(theRef: BRepGraph_RefId): boolean;

  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
  SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
  SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
  SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
  SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
  SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
  SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
  SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
  SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;

  UnsetOwner(theItem: BRepGraph_ItemId): void;
  UnsetOwner(theNode: BRepGraph_NodeId): void;
  UnsetOwner(theRef: BRepGraph_RefId): void;
  UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
  UnsetOwner(theItem: BRepGraph_ItemId): void;
  UnsetOwner(theNode: BRepGraph_NodeId): void;
  UnsetOwner(theRef: BRepGraph_RefId): void;
  UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
  UnsetOwner(theItem: BRepGraph_ItemId): void;
  UnsetOwner(theNode: BRepGraph_NodeId): void;
  UnsetOwner(theRef: BRepGraph_RefId): void;
  UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
  UnsetOwner(theItem: BRepGraph_ItemId): void;
  UnsetOwner(theNode: BRepGraph_NodeId): void;
  UnsetOwner(theRef: BRepGraph_RefId): void;
  UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;

  HasOwners(): boolean;

  ReserveOwners(theNbOwners: number): void;

  TouchOwners(): void;

  Name(): TCollection_AsciiString;

  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  OnRefRemoved(theRef: BRepGraph_RefId): void;

  InvalidateAll(): void;

  Clear(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerLock_ScopedOwnerEdit: declare class BRepGraph_LayerLock_ScopedOwnerEdit

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerParametric: declare class BRepGraph_LayerParametric extends BRepGraph_Layer

  static GenerationMask(theFlag: BRepGraph_LayerParametric_GenerationFlag): number;

  static HasGenerationFlag(theFlags: number, theFlag: BRepGraph_LayerParametric_GenerationFlag): boolean;

  static MeshQualityValue(theQuality: BRepGraph_LayerParametric_MeshQuality, theVeryCoarse: number, theCoarse: number, theMedium: number, theFine: number, theVeryFine: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerParametric_GenerationFlag: typeof BRepGraph_LayerParametric_GenerationFlag[keyof typeof BRepGraph_LayerParametric_GenerationFlag]

BRepGraph_LayerParametric_MeshQuality: typeof BRepGraph_LayerParametric_MeshQuality[keyof typeof BRepGraph_LayerParametric_MeshQuality]

BRepGraph_LayerRegistry: declare class BRepGraph_LayerRegistry

  constructor

  RegisterLayer(theLayer: BRepGraph_Layer): number;

  UnregisterLayer(theGUID: Standard_GUID): void;

  FindLayer(theGUID: Standard_GUID): BRepGraph_Layer;

  FindSlot(theGUID: Standard_GUID, theSlot?: number): { returnValue: boolean; theSlot: number };

  Layer(theSlot: number): BRepGraph_Layer;

  NbLayers(): number;

  HasModificationSubscribers(): boolean;

  SubscribedKindsMask(): number;

  DispatchOnNodeRemoved(theNode: BRepGraph_NodeId): void;

  DispatchOnItemRemoved(theItem: BRepGraph_ItemId): void;

  DispatchOnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  DispatchNodeModified(theNode: BRepGraph_NodeId): void;

  DispatchItemModified(theItem: BRepGraph_ItemId): void;

  DispatchNodesModified(theModifiedNodes: NCollection_Array1_BRepGraph_NodeId, theModifiedKindsMask: number): void;

  CopyLayersTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
  CopyLayersTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;
  CopyLayersTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
  CopyLayersTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;

  HasRefModificationSubscribers(): boolean;

  SubscribedRefKindsMask(): number;

  DispatchOnRefRemoved(theRef: BRepGraph_RefId): void;

  DispatchRefModified(theRef: BRepGraph_RefId): void;

  DispatchRefsModified(theModifiedRefs: NCollection_Array1_BRepGraph_RefId, theModifiedRefKindsMask: number): void;

  ClearAll(): void;

  InvalidateAll(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerTopoSupplement: declare class BRepGraph_LayerTopoSupplement extends BRepGraph_Layer

  constructor

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  Name(): TCollection_AsciiString;

  FindByUid(theUid: number): BRepGraph_LayerTopoSupplement_Entry;

  AttachedTo(theOwner: BRepGraph_NodeId): number[];

  AddAttachment(theOwner: BRepGraph_NodeId, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): number;

  AddAttachmentWithUid(theOwner: BRepGraph_NodeId, theUid: number, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): boolean;

  RemoveAttachment(theUid: number): boolean;

  Validate(): void;

  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  InvalidateAll(): void;

  Clear(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_LayerTopoSupplement_AttachmentKind: typeof BRepGraph_LayerTopoSupplement_AttachmentKind[keyof typeof BRepGraph_LayerTopoSupplement_AttachmentKind]

BRepGraph_MeshView: declare class BRepGraph_MeshView

  Cache(): BRepGraph_MeshView_CacheView;

  Persistent(): BRepGraph_MeshView_PersistentView;

  Effective(): BRepGraph_MeshView_EffectiveView;

  Editor(): BRepGraph_MeshView_EditorView;

  Poly(): BRepGraph_MeshView_PolyOps;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_CacheView: declare class BRepGraph_MeshView_CacheView

  Faces(): BRepGraph_MeshView_CacheView_FaceOps;

  Edges(): BRepGraph_MeshView_CacheView_EdgeOps;

  CoEdges(): BRepGraph_MeshView_CacheView_CoEdgeOps;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_CoEdgeOps: declare class BRepGraph_MeshView_CacheView_CoEdgeOps

  Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

  FindPolygon2D(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

  FindPolygonOnTri(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

  FindRaw(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_EdgeOps: declare class BRepGraph_MeshView_CacheView_EdgeOps

  Has(theEdge: BRepGraph_EdgeId): boolean;

  Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

  Entry(theEdge: BRepGraph_EdgeId): BRepGraph_CacheMesh_EdgeMeshEntry;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_FaceOps: declare class BRepGraph_MeshView_CacheView_FaceOps

  Has(theFace: BRepGraph_FaceId): boolean;

  Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

  Entry(theFace: BRepGraph_FaceId): BRepGraph_CacheMesh_FaceMeshEntry;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_EditorView: declare class BRepGraph_MeshView_EditorView

  Faces(): BRepGraph_MeshView_EditorView_FaceOps;

  Edges(): BRepGraph_MeshView_EditorView_EdgeOps;

  CoEdges(): BRepGraph_MeshView_EditorView_CoEdgeOps;

  PromoteToPersistent(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_CoEdgeOps: declare class BRepGraph_MeshView_EditorView_CoEdgeOps

  AppendCachedPolygonOnTri(theCoEdge: BRepGraph_CoEdgeId, thePolygonOnTri: Poly_PolygonOnTriangulation): void;

  SetCachedPolygon2D(theCoEdge: BRepGraph_CoEdgeId, thePolygon2D: Poly_Polygon2D): void;

  Clear(theCoEdge: BRepGraph_CoEdgeId): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_EdgeOps: declare class BRepGraph_MeshView_EditorView_EdgeOps

  SetCachedPolygon3D(theEdge: BRepGraph_EdgeId, thePolygon3D: Poly_Polygon3D): void;

  Clear(theEdge: BRepGraph_EdgeId): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_FaceOps: declare class BRepGraph_MeshView_EditorView_FaceOps

  SetCachedTriangulation(theFace: BRepGraph_FaceId, theTriangulation: Poly_Triangulation): void;

  Clear(theFace: BRepGraph_FaceId): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView: declare class BRepGraph_MeshView_EffectiveView

  Faces(): BRepGraph_MeshView_EffectiveView_FaceOps;

  Edges(): BRepGraph_MeshView_EffectiveView_EdgeOps;

  CoEdges(): BRepGraph_MeshView_EffectiveView_CoEdgeOps;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_CoEdgeOps: declare class BRepGraph_MeshView_EffectiveView_CoEdgeOps

  Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

  HasPolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): boolean;

  PolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): Poly_Polygon2D;

  HasPolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): boolean;

  PolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): Poly_PolygonOnTriangulation;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_EdgeOps: declare class BRepGraph_MeshView_EffectiveView_EdgeOps

  Has(theEdge: BRepGraph_EdgeId): boolean;

  Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_FaceOps: declare class BRepGraph_MeshView_EffectiveView_FaceOps

  Has(theFace: BRepGraph_FaceId): boolean;

  Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView: declare class BRepGraph_MeshView_PersistentView

  Faces(): BRepGraph_MeshView_PersistentView_FaceOps;

  Edges(): BRepGraph_MeshView_PersistentView_EdgeOps;

  CoEdges(): BRepGraph_MeshView_PersistentView_CoEdgeOps;

  delete(): void;

  [Symbol.dispose](): void;
