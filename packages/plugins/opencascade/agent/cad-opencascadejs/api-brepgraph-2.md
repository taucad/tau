# libcascade — BRepGraph (2)

40 top-level symbols. Signatures are verbatim typescript.

BRepGraph_Layer: declare class BRepGraph_Layer extends Standard_Transient

  // BRepGraph_Layer.ID (method)
  ID(): Standard_GUID;

  // BRepGraph_Layer.Name (method)
  Name(): TCollection_AsciiString;

  // BRepGraph_Layer.OnNodeRemoved (method)
  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  // BRepGraph_Layer.OnItemRemoved (method)
  OnItemRemoved(theItem: BRepGraph_ItemId): void;

  // BRepGraph_Layer.OnNodeReplaced (method)
  OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  // BRepGraph_Layer.CopyTo (method)
  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  // BRepGraph_Layer.InvalidateAll (method)
  InvalidateAll(): void;

  // BRepGraph_Layer.Clear (method)
  Clear(): void;

  // BRepGraph_Layer.SubscribedKinds (method)
  SubscribedKinds(): number;

  // BRepGraph_Layer.OnNodeModified (method)
  OnNodeModified(theNode: BRepGraph_NodeId): void;

  // BRepGraph_Layer.OnItemModified (method)
  OnItemModified(theItem: BRepGraph_ItemId): void;

  // BRepGraph_Layer.OnNodesModified (method)
  OnNodesModified(theModifiedNodes: NCollection_Array1_BRepGraph_NodeId): void;

  // BRepGraph_Layer.KindBit (method)
  static KindBit(theKind: BRepGraph_NodeId_Kind): number;

  // BRepGraph_Layer.SubscribedRefKinds (method)
  SubscribedRefKinds(): number;

  // BRepGraph_Layer.OnRefRemoved (method)
  OnRefRemoved(theRef: BRepGraph_RefId): void;

  // BRepGraph_Layer.OnRefModified (method)
  OnRefModified(theRef: BRepGraph_RefId): void;

  // BRepGraph_Layer.OnRefsModified (method)
  OnRefsModified(theModifiedRefs: NCollection_Array1_BRepGraph_RefId): void;

  // BRepGraph_Layer.RefKindBit (method)
  static RefKindBit(theKind: BRepGraph_RefId_Kind): number;

  // BRepGraph_Layer.Revision (method)
  Revision(): number;

  // BRepGraph_Layer.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_Layer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_Layer.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_Layer.delete (method)
  delete(): void;

  // BRepGraph_Layer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerDeferred: declare class BRepGraph_LayerDeferred extends BRepGraph_Layer

  // BRepGraph_LayerDeferred.constructor (constructor)
  constructor();

  // BRepGraph_LayerDeferred.GetID (method)
  static GetID(): Standard_GUID;

  // BRepGraph_LayerDeferred.ID (method)
  ID(): Standard_GUID;

  // BRepGraph_LayerDeferred.FindDeferred (method)
  FindDeferred(theItem: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theNode: BRepGraph_NodeId): BRepGraph_LayerDeferred_Entry;
  FindDeferred(theRef: BRepGraph_RefId): BRepGraph_LayerDeferred_Entry;

  // BRepGraph_LayerDeferred.HasDeferred (method)
  HasDeferred(theItem: BRepGraph_ItemId): boolean;
  HasDeferred(theNode: BRepGraph_NodeId): boolean;
  HasDeferred(theRef: BRepGraph_RefId): boolean;

  // BRepGraph_LayerDeferred.RegisterDeferred (method)
  RegisterDeferred(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theNode: BRepGraph_NodeId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
  RegisterDeferred(theRef: BRepGraph_RefId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;

  // BRepGraph_LayerDeferred.RegisterDeferredRepresentations (method)
  RegisterDeferredRepresentations(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentations: BRepGraph_LayerDeferred_Representation, theNbRepresentations: number): void;

  // BRepGraph_LayerDeferred.RegisterDeferredRepresentationsDirect (method)
  RegisterDeferredRepresentationsDirect(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentations: BRepGraph_LayerDeferred_Representation, theNbRepresentations: number): void;

  // BRepGraph_LayerDeferred.UnregisterDeferred (method)
  UnregisterDeferred(theItem: BRepGraph_ItemId): void;
  UnregisterDeferred(theNode: BRepGraph_NodeId): void;
  UnregisterDeferred(theRef: BRepGraph_RefId): void;

  // BRepGraph_LayerDeferred.HasDeferredItems (method)
  HasDeferredItems(): boolean;

  // BRepGraph_LayerDeferred.FindFirstDeferred (method)
  FindFirstDeferred(theKind: BRepGraph_LayerDeferred_RepresentationKind, theItem?: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;

  // BRepGraph_LayerDeferred.ReserveDeferredItems (method)
  ReserveDeferredItems(theNbItems: number): void;

  // BRepGraph_LayerDeferred.BeginBulkRegistration (method)
  BeginBulkRegistration(): void;

  // BRepGraph_LayerDeferred.EndBulkRegistration (method)
  EndBulkRegistration(): void;

  // BRepGraph_LayerDeferred.Name (method)
  Name(): TCollection_AsciiString;

  // BRepGraph_LayerDeferred.OnNodeRemoved (method)
  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerDeferred.OnNodeReplaced (method)
  OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerDeferred.CopyTo (method)
  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  // BRepGraph_LayerDeferred.OnRefRemoved (method)
  OnRefRemoved(theRef: BRepGraph_RefId): void;

  // BRepGraph_LayerDeferred.InvalidateAll (method)
  InvalidateAll(): void;

  // BRepGraph_LayerDeferred.Clear (method)
  Clear(): void;

  // BRepGraph_LayerDeferred.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_LayerDeferred.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_LayerDeferred.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_LayerDeferred.delete (method)
  delete(): void;

  // BRepGraph_LayerDeferred.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerDeferred_RepresentationKind: typeof BRepGraph_LayerDeferred_RepresentationKind[keyof typeof BRepGraph_LayerDeferred_RepresentationKind]

  readonly Unknown: 'Unknown'

  readonly Geometry: 'Geometry'

  readonly Mesh: 'Mesh'

  readonly Topology: 'Topology'

  readonly Assembly: 'Assembly'

  readonly Parametric: 'Parametric'

BRepGraph_LayerDeferred_Entry: declare class BRepGraph_LayerDeferred_Entry

  // BRepGraph_LayerDeferred_Entry.constructor (constructor)
  constructor();

  Provider: TCollection_AsciiString

  SourceKey: TCollection_AsciiString

  Representations: BRepGraph_LayerDeferred_Entry_RepresentationStorage

  // BRepGraph_LayerDeferred_Entry.delete (method)
  delete(): void;

  // BRepGraph_LayerDeferred_Entry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerDeferred_Entry_RepresentationStorage: declare class BRepGraph_LayerDeferred_Entry_RepresentationStorage

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.constructor (constructor)
  constructor();
  constructor(theOther: BRepGraph_LayerDeferred_Entry_RepresentationStorage);

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.Size (method)
  Size(): number;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.ContainsKind (method)
  ContainsKind(theKind: BRepGraph_LayerDeferred_RepresentationKind): boolean;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.Value (method)
  Value(theIndex: number): BRepGraph_LayerDeferred_Representation;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.ChangeValue (method)
  ChangeValue(theIndex: number): BRepGraph_LayerDeferred_Representation;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.First (method)
  First(): BRepGraph_LayerDeferred_Representation;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.Append (method)
  Append(theRepresentation: BRepGraph_LayerDeferred_Representation): void;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.Clear (method)
  Clear(): void;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.delete (method)
  delete(): void;

  // BRepGraph_LayerDeferred_Entry_RepresentationStorage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerDeferred_Representation: declare class BRepGraph_LayerDeferred_Representation

  // BRepGraph_LayerDeferred_Representation.constructor (constructor)
  constructor();

  Kind: BRepGraph_LayerDeferred_RepresentationKind

  Role: number

  Name: TCollection_AsciiString

  SourceIndex: number

  // BRepGraph_LayerDeferred_Representation.delete (method)
  delete(): void;

  // BRepGraph_LayerDeferred_Representation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerHistory: declare class BRepGraph_LayerHistory extends BRepGraph_Layer

  // BRepGraph_LayerHistory.constructor (constructor)
  constructor();

  // BRepGraph_LayerHistory.GetID (method)
  static GetID(): Standard_GUID;

  // BRepGraph_LayerHistory.ID (method)
  ID(): Standard_GUID;

  // BRepGraph_LayerHistory.Name (method)
  Name(): TCollection_AsciiString;

  // BRepGraph_LayerHistory.Record (method)
  Record(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theKind: BRepGraph_LayerHistory_Kind): void;
  Record(theRecordIdx: number): BRepGraph_LayerHistory_Event;

  // BRepGraph_LayerHistory.RecordBatch (method)
  RecordBatch(theOpLabel: TCollection_AsciiString, theOriginals: NCollection_Array1_BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theExtraInfo?: TCollection_AsciiString, theKind?: BRepGraph_LayerHistory_Kind): void;

  // BRepGraph_LayerHistory.RecordDeleted (method)
  RecordDeleted(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_NodeId): void;

  // BRepGraph_LayerHistory.RecordReplaced (method)
  RecordReplaced(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_NodeId, theReplacement: BRepGraph_NodeId): void;

  // BRepGraph_LayerHistory.RecordReplacedBatch (method)
  RecordReplacedBatch(theOpLabel: TCollection_AsciiString, theOriginals: NCollection_Array1_BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theExtraInfo?: TCollection_AsciiString): void;

  // BRepGraph_LayerHistory.RecordUid (method)
  RecordUid(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_UID, theReplacements: NCollection_Array1_BRepGraph_UID, theKind?: BRepGraph_LayerHistory_Kind): void;

  // BRepGraph_LayerHistory.RecordDeletedUid (method)
  RecordDeletedUid(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_UID): void;

  // BRepGraph_LayerHistory.RecordItemUid (method)
  RecordItemUid(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_ItemUID, theReplacements: NCollection_Array1_BRepGraph_ItemUID, theKind?: BRepGraph_LayerHistory_Kind): void;

  // BRepGraph_LayerHistory.RecordDeletedItemUid (method)
  RecordDeletedItemUid(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_ItemUID): void;

  // BRepGraph_LayerHistory.Absorb (method)
  Absorb(theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;
  Absorb(theInputGraph: BRepGraph, theOutputGraph: BRepGraph, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;

  // BRepGraph_LayerHistory.FindOriginal (method)
  FindOriginal(theModified: BRepGraph_NodeId): BRepGraph_NodeId;

  // BRepGraph_LayerHistory.FindDerived (method)
  FindDerived(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];

  // BRepGraph_LayerHistory.FindModified (method)
  FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];

  // BRepGraph_LayerHistory.FindGenerated (method)
  FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
  FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
  FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
  FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];

  // BRepGraph_LayerHistory.IsDeleted (method)
  IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
  IsDeleted(theUID: BRepGraph_UID): boolean;
  IsDeleted(theUID: BRepGraph_ItemUID): boolean;
  IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;

  // BRepGraph_LayerHistory.DeletedNodes (method)
  DeletedNodes(): any;

  // BRepGraph_LayerHistory.FindOriginals (method)
  FindOriginals(theDerived: BRepGraph_NodeId): BRepGraph_NodeId[];

  // BRepGraph_LayerHistory.DeletedUids (method)
  DeletedUids(): any;
  DeletedUids(theGraph: BRepGraph): BRepGraph_UID[];

  // BRepGraph_LayerHistory.HasKnownInput (method)
  HasKnownInput(theUID: BRepGraph_UID): boolean;
  HasKnownInput(theUID: BRepGraph_ItemUID): boolean;

  // BRepGraph_LayerHistory.DeletedItemUids (method)
  DeletedItemUids(): any;

  // BRepGraph_LayerHistory.NbRecords (method)
  NbRecords(): number;

  // BRepGraph_LayerHistory.SetEnabled (method)
  SetEnabled(theVal: boolean): void;

  // BRepGraph_LayerHistory.IsEnabled (method)
  IsEnabled(): boolean;

  // BRepGraph_LayerHistory.Clear (method)
  Clear(): void;

  // BRepGraph_LayerHistory.OnNodeRemoved (method)
  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerHistory.CopyTo (method)
  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  // BRepGraph_LayerHistory.InvalidateAll (method)
  InvalidateAll(): void;

  // BRepGraph_LayerHistory.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_LayerHistory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_LayerHistory.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_LayerHistory.delete (method)
  delete(): void;

  // BRepGraph_LayerHistory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerHistory_Kind: typeof BRepGraph_LayerHistory_Kind[keyof typeof BRepGraph_LayerHistory_Kind]

  readonly Modified: 'Modified'

  readonly Generated: 'Generated'

  readonly Deleted: 'Deleted'

  readonly Replaced: 'Replaced'

BRepGraph_LayerIterator: declare class BRepGraph_LayerIterator

  // BRepGraph_LayerIterator.constructor (constructor)
  constructor(theRegistry: BRepGraph_LayerRegistry);

  // BRepGraph_LayerIterator.More (method)
  More(): boolean;

  // BRepGraph_LayerIterator.Next (method)
  Next(): void;

  // BRepGraph_LayerIterator.Value (method)
  Value(): BRepGraph_Layer;

  // BRepGraph_LayerIterator.Slot (method)
  Slot(): number;

  // BRepGraph_LayerIterator.NbLayers (method)
  NbLayers(): number;

  // BRepGraph_LayerIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_LayerIterator.delete (method)
  delete(): void;

  // BRepGraph_LayerIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerLock: declare class BRepGraph_LayerLock extends BRepGraph_Layer

  // BRepGraph_LayerLock.constructor (constructor)
  constructor();

  // BRepGraph_LayerLock.GetID (method)
  static GetID(): Standard_GUID;

  // BRepGraph_LayerLock.ID (method)
  ID(): Standard_GUID;

  // BRepGraph_LayerLock.FindOwnerId (method)
  FindOwnerId(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): boolean;
  FindOwnerId(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): boolean;

  // BRepGraph_LayerLock.HasOwner (method)
  HasOwner(theItem: BRepGraph_ItemId): boolean;
  HasOwner(theNode: BRepGraph_NodeId): boolean;
  HasOwner(theRef: BRepGraph_RefId): boolean;

  // BRepGraph_LayerLock.SetOwner (method)
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
  SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
  SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
  SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;

  // BRepGraph_LayerLock.UnsetOwner (method)
  UnsetOwner(theItem: BRepGraph_ItemId): void;
  UnsetOwner(theNode: BRepGraph_NodeId): void;
  UnsetOwner(theRef: BRepGraph_RefId): void;
  UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;

  // BRepGraph_LayerLock.HasOwners (method)
  HasOwners(): boolean;

  // BRepGraph_LayerLock.ReserveOwners (method)
  ReserveOwners(theNbOwners: number): void;

  // BRepGraph_LayerLock.TouchOwners (method)
  TouchOwners(): void;

  // BRepGraph_LayerLock.Name (method)
  Name(): TCollection_AsciiString;

  // BRepGraph_LayerLock.OnNodeRemoved (method)
  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerLock.OnNodeReplaced (method)
  OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerLock.CopyTo (method)
  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  // BRepGraph_LayerLock.OnRefRemoved (method)
  OnRefRemoved(theRef: BRepGraph_RefId): void;

  // BRepGraph_LayerLock.InvalidateAll (method)
  InvalidateAll(): void;

  // BRepGraph_LayerLock.Clear (method)
  Clear(): void;

  // BRepGraph_LayerLock.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_LayerLock.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_LayerLock.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_LayerLock.delete (method)
  delete(): void;

  // BRepGraph_LayerLock.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerLock_ScopedOwnerEdit: declare class BRepGraph_LayerLock_ScopedOwnerEdit

  // BRepGraph_LayerLock_ScopedOwnerEdit.constructor (constructor)
  constructor(theLayer: BRepGraph_LayerLock, theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID);

  // BRepGraph_LayerLock_ScopedOwnerEdit.delete (method)
  delete(): void;

  // BRepGraph_LayerLock_ScopedOwnerEdit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerParametric: declare class BRepGraph_LayerParametric extends BRepGraph_Layer

  // BRepGraph_LayerParametric.GenerationMask (method)
  static GenerationMask(theFlag: BRepGraph_LayerParametric_GenerationFlag): number;

  // BRepGraph_LayerParametric.HasGenerationFlag (method)
  static HasGenerationFlag(theFlags: number, theFlag: BRepGraph_LayerParametric_GenerationFlag): boolean;

  // BRepGraph_LayerParametric.MeshQualityValue (method)
  static MeshQualityValue(theQuality: BRepGraph_LayerParametric_MeshQuality, theVeryCoarse: number, theCoarse: number, theMedium: number, theFine: number, theVeryFine: number): number;

  // BRepGraph_LayerParametric.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_LayerParametric.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_LayerParametric.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_LayerParametric.delete (method)
  delete(): void;

  // BRepGraph_LayerParametric.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerParametric_GenerationFlag: typeof BRepGraph_LayerParametric_GenerationFlag[keyof typeof BRepGraph_LayerParametric_GenerationFlag]

  readonly Topology: 'Topology'

  readonly Geometry: 'Geometry'

  readonly Mesh: 'Mesh'

BRepGraph_LayerParametric_MeshQuality: typeof BRepGraph_LayerParametric_MeshQuality[keyof typeof BRepGraph_LayerParametric_MeshQuality]

  readonly VeryCoarse: 'VeryCoarse'

  readonly Coarse: 'Coarse'

  readonly Medium: 'Medium'

  readonly Fine: 'Fine'

  readonly VeryFine: 'VeryFine'

BRepGraph_LayerRegistry: declare class BRepGraph_LayerRegistry

  // BRepGraph_LayerRegistry.constructor (constructor)
  constructor();

  // BRepGraph_LayerRegistry.RegisterLayer (method)
  RegisterLayer(theLayer: BRepGraph_Layer): number;

  // BRepGraph_LayerRegistry.UnregisterLayer (method)
  UnregisterLayer(theGUID: Standard_GUID): void;

  // BRepGraph_LayerRegistry.FindLayer (method)
  FindLayer(theGUID: Standard_GUID): BRepGraph_Layer;

  // BRepGraph_LayerRegistry.FindSlot (method)
  FindSlot(theGUID: Standard_GUID, theSlot?: number): { returnValue: boolean; theSlot: number };

  // BRepGraph_LayerRegistry.Layer (method)
  Layer(theSlot: number): BRepGraph_Layer;

  // BRepGraph_LayerRegistry.NbLayers (method)
  NbLayers(): number;

  // BRepGraph_LayerRegistry.HasModificationSubscribers (method)
  HasModificationSubscribers(): boolean;

  // BRepGraph_LayerRegistry.SubscribedKindsMask (method)
  SubscribedKindsMask(): number;

  // BRepGraph_LayerRegistry.DispatchOnNodeRemoved (method)
  DispatchOnNodeRemoved(theNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerRegistry.DispatchOnItemRemoved (method)
  DispatchOnItemRemoved(theItem: BRepGraph_ItemId): void;

  // BRepGraph_LayerRegistry.DispatchOnNodeReplaced (method)
  DispatchOnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerRegistry.DispatchNodeModified (method)
  DispatchNodeModified(theNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerRegistry.DispatchItemModified (method)
  DispatchItemModified(theItem: BRepGraph_ItemId): void;

  // BRepGraph_LayerRegistry.DispatchNodesModified (method)
  DispatchNodesModified(theModifiedNodes: NCollection_Array1_BRepGraph_NodeId, theModifiedKindsMask: number): void;

  // BRepGraph_LayerRegistry.CopyLayersTo (method)
  CopyLayersTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
  CopyLayersTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;

  // BRepGraph_LayerRegistry.HasRefModificationSubscribers (method)
  HasRefModificationSubscribers(): boolean;

  // BRepGraph_LayerRegistry.SubscribedRefKindsMask (method)
  SubscribedRefKindsMask(): number;

  // BRepGraph_LayerRegistry.DispatchOnRefRemoved (method)
  DispatchOnRefRemoved(theRef: BRepGraph_RefId): void;

  // BRepGraph_LayerRegistry.DispatchRefModified (method)
  DispatchRefModified(theRef: BRepGraph_RefId): void;

  // BRepGraph_LayerRegistry.DispatchRefsModified (method)
  DispatchRefsModified(theModifiedRefs: NCollection_Array1_BRepGraph_RefId, theModifiedRefKindsMask: number): void;

  // BRepGraph_LayerRegistry.ClearAll (method)
  ClearAll(): void;

  // BRepGraph_LayerRegistry.InvalidateAll (method)
  InvalidateAll(): void;

  // BRepGraph_LayerRegistry.delete (method)
  delete(): void;

  // BRepGraph_LayerRegistry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerTopoSupplement: declare class BRepGraph_LayerTopoSupplement extends BRepGraph_Layer

  // BRepGraph_LayerTopoSupplement.constructor (constructor)
  constructor();

  // BRepGraph_LayerTopoSupplement.GetID (method)
  static GetID(): Standard_GUID;

  // BRepGraph_LayerTopoSupplement.ID (method)
  ID(): Standard_GUID;

  // BRepGraph_LayerTopoSupplement.Name (method)
  Name(): TCollection_AsciiString;

  // BRepGraph_LayerTopoSupplement.FindByUid (method)
  FindByUid(theUid: number): BRepGraph_LayerTopoSupplement_Entry;

  // BRepGraph_LayerTopoSupplement.AttachedTo (method)
  AttachedTo(theOwner: BRepGraph_NodeId): number[];

  // BRepGraph_LayerTopoSupplement.AddAttachment (method)
  AddAttachment(theOwner: BRepGraph_NodeId, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): number;

  // BRepGraph_LayerTopoSupplement.AddAttachmentWithUid (method)
  AddAttachmentWithUid(theOwner: BRepGraph_NodeId, theUid: number, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): boolean;

  // BRepGraph_LayerTopoSupplement.RemoveAttachment (method)
  RemoveAttachment(theUid: number): boolean;

  // BRepGraph_LayerTopoSupplement.Validate (method)
  Validate(): void;

  // BRepGraph_LayerTopoSupplement.OnNodeRemoved (method)
  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerTopoSupplement.OnNodeReplaced (method)
  OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  // BRepGraph_LayerTopoSupplement.CopyTo (method)
  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  // BRepGraph_LayerTopoSupplement.InvalidateAll (method)
  InvalidateAll(): void;

  // BRepGraph_LayerTopoSupplement.Clear (method)
  Clear(): void;

  // BRepGraph_LayerTopoSupplement.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_LayerTopoSupplement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_LayerTopoSupplement.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_LayerTopoSupplement.delete (method)
  delete(): void;

  // BRepGraph_LayerTopoSupplement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_LayerTopoSupplement_AttachmentKind: typeof BRepGraph_LayerTopoSupplement_AttachmentKind[keyof typeof BRepGraph_LayerTopoSupplement_AttachmentKind]

  readonly VertexSupplementShape: 'VertexSupplementShape'

  readonly EdgeInternalVertex: 'EdgeInternalVertex'

  readonly FaceDirectVertex: 'FaceDirectVertex'

  readonly SolidAuxShape: 'SolidAuxShape'

  readonly ShellAuxShape: 'ShellAuxShape'

  readonly CompSolidAuxShape: 'CompSolidAuxShape'

  readonly CompoundAuxShape: 'CompoundAuxShape'

  readonly GenericSupplementShape: 'GenericSupplementShape'

BRepGraph_MeshView: declare class BRepGraph_MeshView

  // BRepGraph_MeshView.Cache (method)
  Cache(): BRepGraph_MeshView_CacheView;

  // BRepGraph_MeshView.Persistent (method)
  Persistent(): BRepGraph_MeshView_PersistentView;

  // BRepGraph_MeshView.Effective (method)
  Effective(): BRepGraph_MeshView_EffectiveView;

  // BRepGraph_MeshView.Editor (method)
  Editor(): BRepGraph_MeshView_EditorView;

  // BRepGraph_MeshView.Poly (method)
  Poly(): BRepGraph_MeshView_PolyOps;

  // BRepGraph_MeshView.delete (method)
  delete(): void;

  // BRepGraph_MeshView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_CacheView: declare class BRepGraph_MeshView_CacheView

  // BRepGraph_MeshView_CacheView.Faces (method)
  Faces(): BRepGraph_MeshView_CacheView_FaceOps;

  // BRepGraph_MeshView_CacheView.Edges (method)
  Edges(): BRepGraph_MeshView_CacheView_EdgeOps;

  // BRepGraph_MeshView_CacheView.CoEdges (method)
  CoEdges(): BRepGraph_MeshView_CacheView_CoEdgeOps;

  // BRepGraph_MeshView_CacheView.delete (method)
  delete(): void;

  // BRepGraph_MeshView_CacheView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_CoEdgeOps: declare class BRepGraph_MeshView_CacheView_CoEdgeOps

  // BRepGraph_MeshView_CacheView_CoEdgeOps.Has (method)
  Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_MeshView_CacheView_CoEdgeOps.FindPolygon2D (method)
  FindPolygon2D(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

  // BRepGraph_MeshView_CacheView_CoEdgeOps.FindPolygonOnTri (method)
  FindPolygonOnTri(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

  // BRepGraph_MeshView_CacheView_CoEdgeOps.FindRaw (method)
  FindRaw(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

  // BRepGraph_MeshView_CacheView_CoEdgeOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_CacheView_CoEdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_EdgeOps: declare class BRepGraph_MeshView_CacheView_EdgeOps

  // BRepGraph_MeshView_CacheView_EdgeOps.Has (method)
  Has(theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_MeshView_CacheView_EdgeOps.Polygon3D (method)
  Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

  // BRepGraph_MeshView_CacheView_EdgeOps.Entry (method)
  Entry(theEdge: BRepGraph_EdgeId): BRepGraph_CacheMesh_EdgeMeshEntry;

  // BRepGraph_MeshView_CacheView_EdgeOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_CacheView_EdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_FaceOps: declare class BRepGraph_MeshView_CacheView_FaceOps

  // BRepGraph_MeshView_CacheView_FaceOps.Has (method)
  Has(theFace: BRepGraph_FaceId): boolean;

  // BRepGraph_MeshView_CacheView_FaceOps.Triangulation (method)
  Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

  // BRepGraph_MeshView_CacheView_FaceOps.Entry (method)
  Entry(theFace: BRepGraph_FaceId): BRepGraph_CacheMesh_FaceMeshEntry;

  // BRepGraph_MeshView_CacheView_FaceOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_CacheView_FaceOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_EditorView: declare class BRepGraph_MeshView_EditorView

  // BRepGraph_MeshView_EditorView.Faces (method)
  Faces(): BRepGraph_MeshView_EditorView_FaceOps;

  // BRepGraph_MeshView_EditorView.Edges (method)
  Edges(): BRepGraph_MeshView_EditorView_EdgeOps;

  // BRepGraph_MeshView_EditorView.CoEdges (method)
  CoEdges(): BRepGraph_MeshView_EditorView_CoEdgeOps;

  // BRepGraph_MeshView_EditorView.PromoteToPersistent (method)
  PromoteToPersistent(): void;

  // BRepGraph_MeshView_EditorView.delete (method)
  delete(): void;

  // BRepGraph_MeshView_EditorView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_CoEdgeOps: declare class BRepGraph_MeshView_EditorView_CoEdgeOps

  // BRepGraph_MeshView_EditorView_CoEdgeOps.AppendCachedPolygonOnTri (method)
  AppendCachedPolygonOnTri(theCoEdge: BRepGraph_CoEdgeId, thePolygonOnTri: Poly_PolygonOnTriangulation): void;

  // BRepGraph_MeshView_EditorView_CoEdgeOps.SetCachedPolygon2D (method)
  SetCachedPolygon2D(theCoEdge: BRepGraph_CoEdgeId, thePolygon2D: Poly_Polygon2D): void;

  // BRepGraph_MeshView_EditorView_CoEdgeOps.Clear (method)
  Clear(theCoEdge: BRepGraph_CoEdgeId): void;

  // BRepGraph_MeshView_EditorView_CoEdgeOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_EditorView_CoEdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_EdgeOps: declare class BRepGraph_MeshView_EditorView_EdgeOps

  // BRepGraph_MeshView_EditorView_EdgeOps.SetCachedPolygon3D (method)
  SetCachedPolygon3D(theEdge: BRepGraph_EdgeId, thePolygon3D: Poly_Polygon3D): void;

  // BRepGraph_MeshView_EditorView_EdgeOps.Clear (method)
  Clear(theEdge: BRepGraph_EdgeId): void;

  // BRepGraph_MeshView_EditorView_EdgeOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_EditorView_EdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_FaceOps: declare class BRepGraph_MeshView_EditorView_FaceOps

  // BRepGraph_MeshView_EditorView_FaceOps.SetCachedTriangulation (method)
  SetCachedTriangulation(theFace: BRepGraph_FaceId, theTriangulation: Poly_Triangulation): void;

  // BRepGraph_MeshView_EditorView_FaceOps.Clear (method)
  Clear(theFace: BRepGraph_FaceId): void;

  // BRepGraph_MeshView_EditorView_FaceOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_EditorView_FaceOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView: declare class BRepGraph_MeshView_EffectiveView

  // BRepGraph_MeshView_EffectiveView.Faces (method)
  Faces(): BRepGraph_MeshView_EffectiveView_FaceOps;

  // BRepGraph_MeshView_EffectiveView.Edges (method)
  Edges(): BRepGraph_MeshView_EffectiveView_EdgeOps;

  // BRepGraph_MeshView_EffectiveView.CoEdges (method)
  CoEdges(): BRepGraph_MeshView_EffectiveView_CoEdgeOps;

  // BRepGraph_MeshView_EffectiveView.delete (method)
  delete(): void;

  // BRepGraph_MeshView_EffectiveView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_CoEdgeOps: declare class BRepGraph_MeshView_EffectiveView_CoEdgeOps

  // BRepGraph_MeshView_EffectiveView_CoEdgeOps.Has (method)
  Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_MeshView_EffectiveView_CoEdgeOps.HasPolygonOnSurface (method)
  HasPolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_MeshView_EffectiveView_CoEdgeOps.PolygonOnSurface (method)
  PolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): Poly_Polygon2D;

  // BRepGraph_MeshView_EffectiveView_CoEdgeOps.HasPolygonOnTriangulation (method)
  HasPolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_MeshView_EffectiveView_CoEdgeOps.PolygonOnTriangulation (method)
  PolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): Poly_PolygonOnTriangulation;

  // BRepGraph_MeshView_EffectiveView_CoEdgeOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_EffectiveView_CoEdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_EdgeOps: declare class BRepGraph_MeshView_EffectiveView_EdgeOps

  // BRepGraph_MeshView_EffectiveView_EdgeOps.Has (method)
  Has(theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_MeshView_EffectiveView_EdgeOps.Polygon3D (method)
  Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

  // BRepGraph_MeshView_EffectiveView_EdgeOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_EffectiveView_EdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_FaceOps: declare class BRepGraph_MeshView_EffectiveView_FaceOps

  // BRepGraph_MeshView_EffectiveView_FaceOps.Has (method)
  Has(theFace: BRepGraph_FaceId): boolean;

  // BRepGraph_MeshView_EffectiveView_FaceOps.Triangulation (method)
  Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

  // BRepGraph_MeshView_EffectiveView_FaceOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_EffectiveView_FaceOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView: declare class BRepGraph_MeshView_PersistentView

  // BRepGraph_MeshView_PersistentView.Faces (method)
  Faces(): BRepGraph_MeshView_PersistentView_FaceOps;

  // BRepGraph_MeshView_PersistentView.Edges (method)
  Edges(): BRepGraph_MeshView_PersistentView_EdgeOps;

  // BRepGraph_MeshView_PersistentView.CoEdges (method)
  CoEdges(): BRepGraph_MeshView_PersistentView_CoEdgeOps;

  // BRepGraph_MeshView_PersistentView.delete (method)
  delete(): void;

  // BRepGraph_MeshView_PersistentView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView_CoEdgeOps: declare class BRepGraph_MeshView_PersistentView_CoEdgeOps

  // BRepGraph_MeshView_PersistentView_CoEdgeOps.Has (method)
  Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_MeshView_PersistentView_CoEdgeOps.PolygonOnSurface (method)
  PolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): Poly_Polygon2D;

  // BRepGraph_MeshView_PersistentView_CoEdgeOps.HasPolygonOnTriangulation (method)
  HasPolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_MeshView_PersistentView_CoEdgeOps.PolygonOnTriangulation (method)
  PolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): Poly_PolygonOnTriangulation;

  // BRepGraph_MeshView_PersistentView_CoEdgeOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_PersistentView_CoEdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView_EdgeOps: declare class BRepGraph_MeshView_PersistentView_EdgeOps

  // BRepGraph_MeshView_PersistentView_EdgeOps.Has (method)
  Has(theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_MeshView_PersistentView_EdgeOps.Polygon3D (method)
  Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

  // BRepGraph_MeshView_PersistentView_EdgeOps.HasPolygonOnTriangulation (method)
  HasPolygonOnTriangulation(theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): boolean;

  // BRepGraph_MeshView_PersistentView_EdgeOps.PolygonOnTriangulation (method)
  PolygonOnTriangulation(theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): Poly_PolygonOnTriangulation;

  // BRepGraph_MeshView_PersistentView_EdgeOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_PersistentView_EdgeOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView_FaceOps: declare class BRepGraph_MeshView_PersistentView_FaceOps

  // BRepGraph_MeshView_PersistentView_FaceOps.Has (method)
  Has(theFace: BRepGraph_FaceId): boolean;

  // BRepGraph_MeshView_PersistentView_FaceOps.Triangulation (method)
  Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

  // BRepGraph_MeshView_PersistentView_FaceOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_PersistentView_FaceOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_MeshView_PolyOps: declare class BRepGraph_MeshView_PolyOps

  // BRepGraph_MeshView_PolyOps.NbFaceTriangulations (method)
  NbFaceTriangulations(): number;

  // BRepGraph_MeshView_PolyOps.NbEdgePolygons3D (method)
  NbEdgePolygons3D(): number;

  // BRepGraph_MeshView_PolyOps.NbCoEdgePolygons2D (method)
  NbCoEdgePolygons2D(): number;

  // BRepGraph_MeshView_PolyOps.NbCoEdgePolygonsOnTri (method)
  NbCoEdgePolygonsOnTri(): number;

  // BRepGraph_MeshView_PolyOps.NbActiveTriangulations (method)
  NbActiveTriangulations(): number;

  // BRepGraph_MeshView_PolyOps.NbActivePolygons3D (method)
  NbActivePolygons3D(): number;

  // BRepGraph_MeshView_PolyOps.NbActivePolygons2D (method)
  NbActivePolygons2D(): number;

  // BRepGraph_MeshView_PolyOps.NbActivePolygonsOnTri (method)
  NbActivePolygonsOnTri(): number;

  // BRepGraph_MeshView_PolyOps.delete (method)
  delete(): void;

  // BRepGraph_MeshView_PolyOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CoEdgeId: declare class BRepGraph_CoEdgeId

  // BRepGraph_CoEdgeId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_CoEdgeId.Start (method)
  static Start(): unknown;

  // BRepGraph_CoEdgeId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_CoEdgeId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_CoEdgeId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_CoEdgeId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_CoEdgeId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_CoEdgeId.delete (method)
  delete(): void;

  // BRepGraph_CoEdgeId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CompSolidId: declare class BRepGraph_CompSolidId

  // BRepGraph_CompSolidId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_CompSolidId.Start (method)
  static Start(): unknown;

  // BRepGraph_CompSolidId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_CompSolidId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_CompSolidId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_CompSolidId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_CompSolidId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_CompSolidId.delete (method)
  delete(): void;

  // BRepGraph_CompSolidId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CompoundId: declare class BRepGraph_CompoundId

  // BRepGraph_CompoundId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_CompoundId.Start (method)
  static Start(): unknown;

  // BRepGraph_CompoundId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_CompoundId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_CompoundId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_CompoundId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_CompoundId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_CompoundId.delete (method)
  delete(): void;

  // BRepGraph_CompoundId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_EdgeId: declare class BRepGraph_EdgeId

  // BRepGraph_EdgeId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_EdgeId.Start (method)
  static Start(): unknown;

  // BRepGraph_EdgeId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_EdgeId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_EdgeId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_EdgeId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_EdgeId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_EdgeId.delete (method)
  delete(): void;

  // BRepGraph_EdgeId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FaceId: declare class BRepGraph_FaceId

  // BRepGraph_FaceId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_FaceId.Start (method)
  static Start(): unknown;

  // BRepGraph_FaceId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_FaceId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_FaceId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_FaceId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_FaceId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_FaceId.delete (method)
  delete(): void;

  // BRepGraph_FaceId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
