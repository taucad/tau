# libcascade — NCollection (16)

17 top-level symbols. Signatures are verbatim typescript.

NCollection_DataMap_TDF_Label_int: declare class NCollection_DataMap_TDF_Label_int extends NCollection_BaseMap

  // NCollection_DataMap_TDF_Label_int.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TDF_Label_int.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TDF_Label_int.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TDF_Label_int.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TDF_Label_int.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TDF_Label_int.Bind (method)
  Bind(theKey: TDF_Label, theItem: number): boolean;

  // NCollection_DataMap_TDF_Label_int.Bound (method)
  Bound(theKey: TDF_Label, theItem: number): number;

  // NCollection_DataMap_TDF_Label_int.TryBind (method)
  TryBind(theKey: TDF_Label, theItem: number): boolean;

  // NCollection_DataMap_TDF_Label_int.TryBound (method)
  TryBound(theKey: TDF_Label, theItem: number): number;

  // NCollection_DataMap_TDF_Label_int.IsBound (method)
  IsBound(theKey: TDF_Label): boolean;

  // NCollection_DataMap_TDF_Label_int.UnBind (method)
  UnBind(theKey: TDF_Label): boolean;

  // NCollection_DataMap_TDF_Label_int.Seek (method)
  Seek(theKey: TDF_Label): number;

  // NCollection_DataMap_TDF_Label_int.ChangeSeek (method)
  ChangeSeek(theKey: TDF_Label): number;

  // NCollection_DataMap_TDF_Label_int.ChangeFind (method)
  ChangeFind(theKey: TDF_Label): number;

  // NCollection_DataMap_TDF_Label_int.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TDF_Label_int.delete (method)
  delete(): void;

  // NCollection_DataMap_TDF_Label_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: BRepGraph_NodeId): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: BRepGraph_NodeId): BRepGraph_NodeId;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: BRepGraph_NodeId): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: BRepGraph_NodeId): BRepGraph_NodeId;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): BRepGraph_NodeId;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): BRepGraph_NodeId;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): BRepGraph_NodeId;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: BRepOffset_Offset): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: BRepOffset_Offset): BRepOffset_Offset;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: BRepOffset_Offset): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: BRepOffset_Offset): BRepOffset_Offset;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): BRepOffset_Offset;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): BRepOffset_Offset;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): BRepOffset_Offset;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: BRepTopAdaptor_Tool): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: BRepTopAdaptor_Tool): BRepTopAdaptor_Tool;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: BRepTopAdaptor_Tool): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: BRepTopAdaptor_Tool): BRepTopAdaptor_Tool;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): BRepTopAdaptor_Tool;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): BRepTopAdaptor_Tool;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): BRepTopAdaptor_Tool;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: Bnd_Box): boolean;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: Bnd_Box): Bnd_Box;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: Bnd_Box): boolean;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: Bnd_Box): Bnd_Box;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): Bnd_Box;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): Bnd_Box;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): Bnd_Box;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: NCollection_List_Message_Msg): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: NCollection_List_Message_Msg): NCollection_List_Message_Msg;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: NCollection_List_Message_Msg): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: NCollection_List_Message_Msg): NCollection_List_Message_Msg;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): NCollection_List_Message_Msg;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): NCollection_List_Message_Msg;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): NCollection_List_Message_Msg;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: NCollection_List_TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: NCollection_List_TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: NCollection_List_TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: NCollection_List_double): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: NCollection_List_double): NCollection_List_double;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: NCollection_List_double): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: NCollection_List_double): NCollection_List_double;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): NCollection_List_double;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): NCollection_List_double;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): NCollection_List_double;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: RWMesh_NodeAttributes): boolean;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: RWMesh_NodeAttributes): RWMesh_NodeAttributes;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: RWMesh_NodeAttributes): boolean;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: RWMesh_NodeAttributes): RWMesh_NodeAttributes;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): RWMesh_NodeAttributes;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): RWMesh_NodeAttributes;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): RWMesh_NodeAttributes;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: TDF_Label): boolean;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: TDF_Label): TDF_Label;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: TDF_Label): boolean;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: TDF_Label): TDF_Label;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): TDF_Label;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): TDF_Label;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): TDF_Label;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: TopoDS_Shape): TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: TopoDS_Shape): TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): TopoDS_Shape;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: number): boolean;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: number): number;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: number): boolean;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: number): number;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): number;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): number;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): number;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: gp_XYZ): boolean;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: gp_XYZ): gp_XYZ;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: gp_XYZ): boolean;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: gp_XYZ): gp_XYZ;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): gp_XYZ;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): gp_XYZ;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): gp_XYZ;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: unknown): boolean;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: unknown): unknown;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: unknown): boolean;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: unknown): unknown;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): unknown;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): unknown;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): unknown;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher: declare class NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher extends NCollection_BaseMap

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: TopTools_ShapeMapHasher, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.Exchange (method)
  Exchange(theOther: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher): void;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.GetHasher (method)
  GetHasher(): TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.Assign (method)
  Assign(theOther: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher): NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.Bind (method)
  Bind(theKey: TopoDS_Shape, theItem: Standard_Transient): boolean;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.Bound (method)
  Bound(theKey: TopoDS_Shape, theItem: Standard_Transient): Standard_Transient;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.TryBind (method)
  TryBind(theKey: TopoDS_Shape, theItem: Standard_Transient): boolean;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.TryBound (method)
  TryBound(theKey: TopoDS_Shape, theItem: Standard_Transient): Standard_Transient;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.IsBound (method)
  IsBound(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.UnBind (method)
  UnBind(theKey: TopoDS_Shape): boolean;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.Seek (method)
  Seek(theKey: TopoDS_Shape): Standard_Transient;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.ChangeSeek (method)
  ChangeSeek(theKey: TopoDS_Shape): Standard_Transient;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.ChangeFind (method)
  ChangeFind(theKey: TopoDS_Shape): Standard_Transient;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.delete (method)
  delete(): void;

  // NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_gp_Pnt_handle_Standard_Transient: declare class NCollection_DataMap_gp_Pnt_handle_Standard_Transient extends NCollection_BaseMap

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.Bind (method)
  Bind(theKey: gp_Pnt, theItem: Standard_Transient): boolean;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.Bound (method)
  Bound(theKey: gp_Pnt, theItem: Standard_Transient): Standard_Transient;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.TryBind (method)
  TryBind(theKey: gp_Pnt, theItem: Standard_Transient): boolean;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.TryBound (method)
  TryBound(theKey: gp_Pnt, theItem: Standard_Transient): Standard_Transient;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.IsBound (method)
  IsBound(theKey: gp_Pnt): boolean;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.UnBind (method)
  UnBind(theKey: gp_Pnt): boolean;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.Seek (method)
  Seek(theKey: gp_Pnt): Standard_Transient;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.ChangeSeek (method)
  ChangeSeek(theKey: gp_Pnt): Standard_Transient;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.ChangeFind (method)
  ChangeFind(theKey: gp_Pnt): Standard_Transient;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.delete (method)
  delete(): void;

  // NCollection_DataMap_gp_Pnt_handle_Standard_Transient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg: declare class NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg extends NCollection_BaseMap

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.Bind (method)
  Bind(theKey: Standard_Transient, theItem: NCollection_List_Message_Msg): boolean;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.Bound (method)
  Bound(theKey: Standard_Transient, theItem: NCollection_List_Message_Msg): NCollection_List_Message_Msg;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.TryBind (method)
  TryBind(theKey: Standard_Transient, theItem: NCollection_List_Message_Msg): boolean;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.TryBound (method)
  TryBound(theKey: Standard_Transient, theItem: NCollection_List_Message_Msg): NCollection_List_Message_Msg;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.IsBound (method)
  IsBound(theKey: Standard_Transient): boolean;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.UnBind (method)
  UnBind(theKey: Standard_Transient): boolean;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.Seek (method)
  Seek(theKey: Standard_Transient): NCollection_List_Message_Msg;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.ChangeSeek (method)
  ChangeSeek(theKey: Standard_Transient): NCollection_List_Message_Msg;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.ChangeFind (method)
  ChangeFind(theKey: Standard_Transient): NCollection_List_Message_Msg;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.delete (method)
  delete(): void;

  // NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
