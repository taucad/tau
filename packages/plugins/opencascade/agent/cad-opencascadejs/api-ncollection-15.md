# libcascade — NCollection (15)

17 top-level symbols. Signatures are verbatim typescript.

NCollection_Array2_handle_StepGeom_CartesianPoint: declare class NCollection_Array2_handle_StepGeom_CartesianPoint

  // NCollection_Array2_handle_StepGeom_CartesianPoint.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: StepGeom_CartesianPoint, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_handle_StepGeom_CartesianPoint.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.Size (method)
  Size(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.Length (method)
  Length(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.CopyValues (method)
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.Move (method)
  Move(theOther: unknown): unknown;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: StepGeom_CartesianPoint): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.delete (method)
  delete(): void;

  // NCollection_Array2_handle_StepGeom_CartesianPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_handle_StepGeom_SurfacePatch: declare class NCollection_Array2_handle_StepGeom_SurfacePatch

  // NCollection_Array2_handle_StepGeom_SurfacePatch.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: StepGeom_SurfacePatch, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_handle_StepGeom_SurfacePatch.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.Size (method)
  Size(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.Length (method)
  Length(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.Assign (method)
  Assign(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.Move (method)
  Move(theOther: NCollection_Array2_handle_StepGeom_SurfacePatch): NCollection_Array2_handle_StepGeom_SurfacePatch;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: StepGeom_SurfacePatch): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.delete (method)
  delete(): void;

  // NCollection_Array2_handle_StepGeom_SurfacePatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array2_int: declare class NCollection_Array2_int

  // NCollection_Array2_int.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array2_int);
  constructor(theNbRows: number, theNbCols: number);
  constructor(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);
  constructor(theBegin: number, theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number);

  // NCollection_Array2_int.BeginPosition (method)
  static BeginPosition(theRowLower: number, argNo1: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_int.LastPosition (method)
  static LastPosition(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number): number;

  // NCollection_Array2_int.Size (method)
  Size(): number;

  // NCollection_Array2_int.Length (method)
  Length(): number;

  // NCollection_Array2_int.NbRows (method)
  NbRows(): number;

  // NCollection_Array2_int.NbColumns (method)
  NbColumns(): number;

  // NCollection_Array2_int.RowLength (method)
  RowLength(): number;

  // NCollection_Array2_int.ColLength (method)
  ColLength(): number;

  // NCollection_Array2_int.LowerRow (method)
  LowerRow(): number;

  // NCollection_Array2_int.UpperRow (method)
  UpperRow(): number;

  // NCollection_Array2_int.LowerCol (method)
  LowerCol(): number;

  // NCollection_Array2_int.UpperCol (method)
  UpperCol(): number;

  // NCollection_Array2_int.UpdateLowerRow (method)
  UpdateLowerRow(theLowerRow: number): void;

  // NCollection_Array2_int.UpdateLowerCol (method)
  UpdateLowerCol(theLowerCol: number): void;

  // NCollection_Array2_int.UpdateUpperRow (method)
  UpdateUpperRow(theUpperRow: number): void;

  // NCollection_Array2_int.UpdateUpperCol (method)
  UpdateUpperCol(theUpperCol: number): void;

  // NCollection_Array2_int.Assign (method)
  Assign(theOther: NCollection_Array2_int): NCollection_Array2_int;
  Assign(theOther: unknown): unknown;

  // NCollection_Array2_int.CopyValues (method)
  CopyValues(theOther: NCollection_Array2_int): NCollection_Array2_int;
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array2_int.Move (method)
  Move(theOther: NCollection_Array2_int): NCollection_Array2_int;
  Move(theOther: unknown): unknown;

  // NCollection_Array2_int.SetValue (method)
  SetValue(theRow: number, theCol: number, theItem: number): void;
  SetValue(theIndex: number, theItem: unknown): void;

  // NCollection_Array2_int.Resize (method)
  Resize(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  Resize(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array2_int.ResizeWithTrim (method)
  ResizeWithTrim(theRowLower: number, theRowUpper: number, theColLower: number, theColUpper: number, theToCopyData: boolean): void;
  ResizeWithTrim(theNbRows: number, theNbCols: number, theToCopyData: boolean): void;

  // NCollection_Array2_int.delete (method)
  delete(): void;

  // NCollection_Array2_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_RWObj_Material: declare class NCollection_DataMap_TCollection_AsciiString_RWObj_Material extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.Bind (method)
  Bind(theKey: TCollection_AsciiString, theItem: RWObj_Material): boolean;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.Bound (method)
  Bound(theKey: TCollection_AsciiString, theItem: RWObj_Material): RWObj_Material;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.TryBind (method)
  TryBind(theKey: TCollection_AsciiString, theItem: RWObj_Material): boolean;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.TryBound (method)
  TryBound(theKey: TCollection_AsciiString, theItem: RWObj_Material): RWObj_Material;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.IsBound (method)
  IsBound(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.UnBind (method)
  UnBind(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.Seek (method)
  Seek(theKey: TCollection_AsciiString): RWObj_Material;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_AsciiString): RWObj_Material;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.ChangeFind (method)
  ChangeFind(theKey: TCollection_AsciiString): RWObj_Material;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_AsciiString_RWObj_Material.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString: declare class NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.Bind (method)
  Bind(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.Bound (method)
  Bound(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): TCollection_AsciiString;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.TryBind (method)
  TryBind(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.TryBound (method)
  TryBound(theKey: TCollection_AsciiString, theItem: TCollection_AsciiString): TCollection_AsciiString;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.IsBound (method)
  IsBound(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.UnBind (method)
  UnBind(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.Seek (method)
  Seek(theKey: TCollection_AsciiString): TCollection_AsciiString;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_AsciiString): TCollection_AsciiString;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.ChangeFind (method)
  ChangeFind(theKey: TCollection_AsciiString): TCollection_AsciiString;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape: declare class NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.Bind (method)
  Bind(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): boolean;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.Bound (method)
  Bound(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): TopoDS_Shape;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.TryBind (method)
  TryBind(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): boolean;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.TryBound (method)
  TryBound(theKey: TCollection_AsciiString, theItem: TopoDS_Shape): TopoDS_Shape;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.IsBound (method)
  IsBound(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.UnBind (method)
  UnBind(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.Seek (method)
  Seek(theKey: TCollection_AsciiString): TopoDS_Shape;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_AsciiString): TopoDS_Shape;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.ChangeFind (method)
  ChangeFind(theKey: TCollection_AsciiString): TopoDS_Shape;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile: declare class NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.Bind (method)
  Bind(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): boolean;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.Bound (method)
  Bound(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): STEPCAFControl_ExternFile;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.TryBind (method)
  TryBind(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): boolean;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.TryBound (method)
  TryBound(theKey: TCollection_AsciiString, theItem: STEPCAFControl_ExternFile): STEPCAFControl_ExternFile;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.IsBound (method)
  IsBound(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.UnBind (method)
  UnBind(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.Seek (method)
  Seek(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.ChangeFind (method)
  ChangeFind(theKey: TCollection_AsciiString): STEPCAFControl_ExternFile;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient: declare class NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.Bind (method)
  Bind(theKey: TCollection_AsciiString, theItem: Standard_Transient): boolean;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.Bound (method)
  Bound(theKey: TCollection_AsciiString, theItem: Standard_Transient): Standard_Transient;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.TryBind (method)
  TryBind(theKey: TCollection_AsciiString, theItem: Standard_Transient): boolean;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.TryBound (method)
  TryBound(theKey: TCollection_AsciiString, theItem: Standard_Transient): Standard_Transient;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.IsBound (method)
  IsBound(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.UnBind (method)
  UnBind(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.Seek (method)
  Seek(theKey: TCollection_AsciiString): Standard_Transient;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_AsciiString): Standard_Transient;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.ChangeFind (method)
  ChangeFind(theKey: TCollection_AsciiString): Standard_Transient;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_AsciiString_int: declare class NCollection_DataMap_TCollection_AsciiString_int extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_AsciiString_int.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_AsciiString_int.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_AsciiString_int.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_AsciiString_int.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_AsciiString_int.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_AsciiString_int.Bind (method)
  Bind(theKey: TCollection_AsciiString, theItem: number): boolean;

  // NCollection_DataMap_TCollection_AsciiString_int.Bound (method)
  Bound(theKey: TCollection_AsciiString, theItem: number): number;

  // NCollection_DataMap_TCollection_AsciiString_int.TryBind (method)
  TryBind(theKey: TCollection_AsciiString, theItem: number): boolean;

  // NCollection_DataMap_TCollection_AsciiString_int.TryBound (method)
  TryBound(theKey: TCollection_AsciiString, theItem: number): number;

  // NCollection_DataMap_TCollection_AsciiString_int.IsBound (method)
  IsBound(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_int.UnBind (method)
  UnBind(theKey: TCollection_AsciiString): boolean;

  // NCollection_DataMap_TCollection_AsciiString_int.Seek (method)
  Seek(theKey: TCollection_AsciiString): number;

  // NCollection_DataMap_TCollection_AsciiString_int.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_AsciiString): number;

  // NCollection_DataMap_TCollection_AsciiString_int.ChangeFind (method)
  ChangeFind(theKey: TCollection_AsciiString): number;

  // NCollection_DataMap_TCollection_AsciiString_int.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_AsciiString_int.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_AsciiString_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString: declare class NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.Bind (method)
  Bind(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.Bound (method)
  Bound(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): TCollection_ExtendedString;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.TryBind (method)
  TryBind(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.TryBound (method)
  TryBound(theKey: TCollection_ExtendedString, theItem: TCollection_ExtendedString): TCollection_ExtendedString;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.IsBound (method)
  IsBound(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.UnBind (method)
  UnBind(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.Seek (method)
  Seek(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.ChangeFind (method)
  ChangeFind(theKey: TCollection_ExtendedString): TCollection_ExtendedString;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_ExtendedString_TCollection_ExtendedString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_double: declare class NCollection_DataMap_TCollection_ExtendedString_double extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_ExtendedString_double.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_ExtendedString_double.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_ExtendedString_double.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_double.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_double.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_ExtendedString_double.Bind (method)
  Bind(theKey: TCollection_ExtendedString, theItem: number): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_double.Bound (method)
  Bound(theKey: TCollection_ExtendedString, theItem: number): number;

  // NCollection_DataMap_TCollection_ExtendedString_double.TryBind (method)
  TryBind(theKey: TCollection_ExtendedString, theItem: number): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_double.TryBound (method)
  TryBound(theKey: TCollection_ExtendedString, theItem: number): number;

  // NCollection_DataMap_TCollection_ExtendedString_double.IsBound (method)
  IsBound(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_double.UnBind (method)
  UnBind(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_double.Seek (method)
  Seek(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_double.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_double.ChangeFind (method)
  ChangeFind(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_double.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_ExtendedString_double.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_ExtendedString_double.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData: declare class NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.Bind (method)
  Bind(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.Bound (method)
  Bound(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): CDM_MetaData;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.TryBind (method)
  TryBind(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.TryBound (method)
  TryBound(theKey: TCollection_ExtendedString, theItem: CDM_MetaData): CDM_MetaData;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.IsBound (method)
  IsBound(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.UnBind (method)
  UnBind(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.Seek (method)
  Seek(theKey: TCollection_ExtendedString): CDM_MetaData;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_ExtendedString): CDM_MetaData;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.ChangeFind (method)
  ChangeFind(theKey: TCollection_ExtendedString): CDM_MetaData;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double: declare class NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.Bind (method)
  Bind(theKey: TCollection_ExtendedString, theItem: unknown): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.Bound (method)
  Bound(theKey: TCollection_ExtendedString, theItem: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.TryBind (method)
  TryBind(theKey: TCollection_ExtendedString, theItem: unknown): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.TryBound (method)
  TryBound(theKey: TCollection_ExtendedString, theItem: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.IsBound (method)
  IsBound(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.UnBind (method)
  UnBind(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.Seek (method)
  Seek(theKey: TCollection_ExtendedString): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_ExtendedString): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.ChangeFind (method)
  ChangeFind(theKey: TCollection_ExtendedString): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_double.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int: declare class NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.Bind (method)
  Bind(theKey: TCollection_ExtendedString, theItem: unknown): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.Bound (method)
  Bound(theKey: TCollection_ExtendedString, theItem: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.TryBind (method)
  TryBind(theKey: TCollection_ExtendedString, theItem: unknown): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.TryBound (method)
  TryBound(theKey: TCollection_ExtendedString, theItem: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.IsBound (method)
  IsBound(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.UnBind (method)
  UnBind(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.Seek (method)
  Seek(theKey: TCollection_ExtendedString): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_ExtendedString): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.ChangeFind (method)
  ChangeFind(theKey: TCollection_ExtendedString): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_ExtendedString_handle_NCollection_HArray1_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_int: declare class NCollection_DataMap_TCollection_ExtendedString_int extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_ExtendedString_int.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_ExtendedString_int.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_ExtendedString_int.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_int.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_int.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_ExtendedString_int.Bind (method)
  Bind(theKey: TCollection_ExtendedString, theItem: number): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_int.Bound (method)
  Bound(theKey: TCollection_ExtendedString, theItem: number): number;

  // NCollection_DataMap_TCollection_ExtendedString_int.TryBind (method)
  TryBind(theKey: TCollection_ExtendedString, theItem: number): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_int.TryBound (method)
  TryBound(theKey: TCollection_ExtendedString, theItem: number): number;

  // NCollection_DataMap_TCollection_ExtendedString_int.IsBound (method)
  IsBound(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_int.UnBind (method)
  UnBind(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_int.Seek (method)
  Seek(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_int.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_int.ChangeFind (method)
  ChangeFind(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_int.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_ExtendedString_int.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_ExtendedString_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TCollection_ExtendedString_uint8_t: declare class NCollection_DataMap_TCollection_ExtendedString_uint8_t extends NCollection_BaseMap

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.Bind (method)
  Bind(theKey: TCollection_ExtendedString, theItem: number): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.Bound (method)
  Bound(theKey: TCollection_ExtendedString, theItem: number): number;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.TryBind (method)
  TryBind(theKey: TCollection_ExtendedString, theItem: number): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.TryBound (method)
  TryBound(theKey: TCollection_ExtendedString, theItem: number): number;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.IsBound (method)
  IsBound(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.UnBind (method)
  UnBind(theKey: TCollection_ExtendedString): boolean;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.Seek (method)
  Seek(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.ChangeSeek (method)
  ChangeSeek(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.ChangeFind (method)
  ChangeFind(theKey: TCollection_ExtendedString): number;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.delete (method)
  delete(): void;

  // NCollection_DataMap_TCollection_ExtendedString_uint8_t.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DataMap_TDF_Label_TDF_Label: declare class NCollection_DataMap_TDF_Label_TDF_Label extends NCollection_BaseMap

  // NCollection_DataMap_TDF_Label_TDF_Label.constructor (constructor)
  constructor();
  constructor(theOther: unknown);
  constructor(theNbBuckets: number, theAllocator?: NCollection_BaseAllocator);
  constructor(theHasher: unknown, theNbBuckets?: number, theAllocator?: NCollection_BaseAllocator);

  // NCollection_DataMap_TDF_Label_TDF_Label.Exchange (method)
  Exchange(theOther: unknown): void;

  // NCollection_DataMap_TDF_Label_TDF_Label.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_DataMap_TDF_Label_TDF_Label.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_DataMap_TDF_Label_TDF_Label.ReSize (method)
  ReSize(N: number): void;

  // NCollection_DataMap_TDF_Label_TDF_Label.Bind (method)
  Bind(theKey: TDF_Label, theItem: TDF_Label): boolean;

  // NCollection_DataMap_TDF_Label_TDF_Label.Bound (method)
  Bound(theKey: TDF_Label, theItem: TDF_Label): TDF_Label;

  // NCollection_DataMap_TDF_Label_TDF_Label.TryBind (method)
  TryBind(theKey: TDF_Label, theItem: TDF_Label): boolean;

  // NCollection_DataMap_TDF_Label_TDF_Label.TryBound (method)
  TryBound(theKey: TDF_Label, theItem: TDF_Label): TDF_Label;

  // NCollection_DataMap_TDF_Label_TDF_Label.IsBound (method)
  IsBound(theKey: TDF_Label): boolean;

  // NCollection_DataMap_TDF_Label_TDF_Label.UnBind (method)
  UnBind(theKey: TDF_Label): boolean;

  // NCollection_DataMap_TDF_Label_TDF_Label.Seek (method)
  Seek(theKey: TDF_Label): TDF_Label;

  // NCollection_DataMap_TDF_Label_TDF_Label.ChangeSeek (method)
  ChangeSeek(theKey: TDF_Label): TDF_Label;

  // NCollection_DataMap_TDF_Label_TDF_Label.ChangeFind (method)
  ChangeFind(theKey: TDF_Label): TDF_Label;

  // NCollection_DataMap_TDF_Label_TDF_Label.Clear (method)
  Clear(doReleaseMemory: boolean): void;
  Clear(theAllocator: NCollection_BaseAllocator): void;

  // NCollection_DataMap_TDF_Label_TDF_Label.delete (method)
  delete(): void;

  // NCollection_DataMap_TDF_Label_TDF_Label.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
