# libcascade — NCollection (19)

32 top-level symbols. Signatures are verbatim typescript.

NCollection_DynamicArray_handle_Standard_Transient: declare class NCollection_DynamicArray_handle_Standard_Transient

  // NCollection_DynamicArray_handle_Standard_Transient.constructor (constructor)
  constructor(theIncrement?: number);
  constructor(theOther: NCollection_DynamicArray_handle_Standard_Transient);
  constructor(theIncrement: number, theAllocator: NCollection_BaseAllocator);

  // NCollection_DynamicArray_handle_Standard_Transient.Size (method)
  Size(): number;

  // NCollection_DynamicArray_handle_Standard_Transient.Length (method)
  Length(): number;

  // NCollection_DynamicArray_handle_Standard_Transient.Lower (method)
  Lower(): number;

  // NCollection_DynamicArray_handle_Standard_Transient.Upper (method)
  Upper(): number;

  // NCollection_DynamicArray_handle_Standard_Transient.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_DynamicArray_handle_Standard_Transient.Assign (method)
  Assign(theOther: NCollection_DynamicArray_handle_Standard_Transient, theOwnAllocator: boolean): NCollection_DynamicArray_handle_Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.Append (method)
  Append(theValue: Standard_Transient): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.InsertAfter (method)
  InsertAfter(theIndex: number, theValue: Standard_Transient): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.InsertBefore (method)
  InsertBefore(theIndex: number, theValue: Standard_Transient): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.EraseLast (method)
  EraseLast(): void;

  // NCollection_DynamicArray_handle_Standard_Transient.Appended (method)
  Appended(): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.Value (method)
  Value(theIndex: number): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.First (method)
  First(): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.ChangeFirst (method)
  ChangeFirst(): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.Last (method)
  Last(): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.ChangeLast (method)
  ChangeLast(): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.ChangeValue (method)
  ChangeValue(theIndex: number): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.SetValue (method)
  SetValue(theIndex: number, theValue: Standard_Transient): Standard_Transient;

  // NCollection_DynamicArray_handle_Standard_Transient.Clear (method)
  Clear(theReleaseMemory?: boolean): void;

  // NCollection_DynamicArray_handle_Standard_Transient.SetIncrement (method)
  SetIncrement(theIncrement: number): void;

  // NCollection_DynamicArray_handle_Standard_Transient.delete (method)
  delete(): void;

  // NCollection_DynamicArray_handle_Standard_Transient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_DynamicArray_int: declare class NCollection_DynamicArray_int

  // NCollection_DynamicArray_int.constructor (constructor)
  constructor(theIncrement?: number);
  constructor(theOther: NCollection_DynamicArray_int);
  constructor(theIncrement: number, theAllocator: NCollection_BaseAllocator);

  // NCollection_DynamicArray_int.Size (method)
  Size(): number;

  // NCollection_DynamicArray_int.Length (method)
  Length(): number;

  // NCollection_DynamicArray_int.Lower (method)
  Lower(): number;

  // NCollection_DynamicArray_int.Upper (method)
  Upper(): number;

  // NCollection_DynamicArray_int.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_DynamicArray_int.Assign (method)
  Assign(theOther: NCollection_DynamicArray_int, theOwnAllocator: boolean): NCollection_DynamicArray_int;

  // NCollection_DynamicArray_int.Append (method)
  Append(theValue: number): number;

  // NCollection_DynamicArray_int.InsertAfter (method)
  InsertAfter(theIndex: number, theValue: number): number;

  // NCollection_DynamicArray_int.InsertBefore (method)
  InsertBefore(theIndex: number, theValue: number): number;

  // NCollection_DynamicArray_int.EraseLast (method)
  EraseLast(): void;

  // NCollection_DynamicArray_int.Appended (method)
  Appended(): number;

  // NCollection_DynamicArray_int.Value (method)
  Value(theIndex: number): number;

  // NCollection_DynamicArray_int.First (method)
  First(): number;

  // NCollection_DynamicArray_int.ChangeFirst (method)
  ChangeFirst(): number;

  // NCollection_DynamicArray_int.Last (method)
  Last(): number;

  // NCollection_DynamicArray_int.ChangeLast (method)
  ChangeLast(): number;

  // NCollection_DynamicArray_int.ChangeValue (method)
  ChangeValue(theIndex: number): number;

  // NCollection_DynamicArray_int.SetValue (method)
  SetValue(theIndex: number, theValue: number): number;

  // NCollection_DynamicArray_int.Clear (method)
  Clear(theReleaseMemory?: boolean): void;

  // NCollection_DynamicArray_int.SetIncrement (method)
  SetIncrement(theIncrement: number): void;

  // NCollection_DynamicArray_int.delete (method)
  delete(): void;

  // NCollection_DynamicArray_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId: declare class NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.constructor (constructor)
  constructor();
  constructor(theNbBuckets: number);
  constructor(theOther: NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId);
  constructor(theHasher: unknown, theNbBuckets?: number);

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Size (method)
  Size(): number;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Extent (method)
  Extent(): number;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Capacity (method)
  Capacity(): number;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.IsBound (method)
  IsBound(theKey: BRepGraph_ItemId): boolean;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Seek (method)
  Seek(theKey: BRepGraph_ItemId): BRepGraph_ItemId;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.ChangeSeek (method)
  ChangeSeek(theKey: BRepGraph_ItemId): BRepGraph_ItemId;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Find (method)
  Find(theKey: BRepGraph_ItemId): BRepGraph_ItemId;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.ChangeFind (method)
  ChangeFind(theKey: BRepGraph_ItemId): BRepGraph_ItemId;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Bind (method)
  Bind(theKey: BRepGraph_ItemId, theItem: BRepGraph_ItemId): boolean;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.TryBind (method)
  TryBind(theKey: BRepGraph_ItemId, theItem: BRepGraph_ItemId): boolean;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Bound (method)
  Bound(theKey: BRepGraph_ItemId, theItem: BRepGraph_ItemId): BRepGraph_ItemId;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.TryBound (method)
  TryBound(theKey: BRepGraph_ItemId, theItem: BRepGraph_ItemId): BRepGraph_ItemId;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.UnBind (method)
  UnBind(theKey: BRepGraph_ItemId): boolean;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Clear (method)
  Clear(doReleaseMemory?: boolean): void;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Exchange (method)
  Exchange(theOther: NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId): void;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.GetHasher (method)
  GetHasher(): unknown;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.reserve (method)
  reserve(theN: number): void;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.Reserve (method)
  Reserve(theN: number): void;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.delete (method)
  delete(): void;

  // NCollection_FlatDataMap_BRepGraph_ItemId_BRepGraph_ItemId_NCollection_DefaultHasher_BRepGraph_ItemId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_AppParCurves_ConstraintCouple: declare class NCollection_HArray1_AppParCurves_ConstraintCouple

  // NCollection_HArray1_AppParCurves_ConstraintCouple.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_AppParCurves_ConstraintCouple);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: AppParCurves_ConstraintCouple);
  constructor(theBegin: AppParCurves_ConstraintCouple, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_AppParCurves_ConstraintCouple.Array1 (method)
  Array1(): NCollection_Array1_AppParCurves_ConstraintCouple;

  // NCollection_HArray1_AppParCurves_ConstraintCouple.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_AppParCurves_ConstraintCouple;

  // NCollection_HArray1_AppParCurves_ConstraintCouple.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_AppParCurves_ConstraintCouple.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_AppParCurves_ConstraintCouple.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_AppParCurves_ConstraintCouple.delete (method)
  delete(): void;

  // NCollection_HArray1_AppParCurves_ConstraintCouple.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_Bnd_Box: declare class NCollection_HArray1_Bnd_Box

  // NCollection_HArray1_Bnd_Box.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_Bnd_Box);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: Bnd_Box);
  constructor(theBegin: Bnd_Box, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_Bnd_Box.Array1 (method)
  Array1(): NCollection_Array1_Bnd_Box;

  // NCollection_HArray1_Bnd_Box.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_Bnd_Box;

  // NCollection_HArray1_Bnd_Box.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_Bnd_Box.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_Bnd_Box.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_Bnd_Box.delete (method)
  delete(): void;

  // NCollection_HArray1_Bnd_Box.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_ChFiDS_CircSection: declare class NCollection_HArray1_ChFiDS_CircSection

  // NCollection_HArray1_ChFiDS_CircSection.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_ChFiDS_CircSection);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: ChFiDS_CircSection);
  constructor(theBegin: ChFiDS_CircSection, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_ChFiDS_CircSection.Array1 (method)
  Array1(): NCollection_Array1_ChFiDS_CircSection;

  // NCollection_HArray1_ChFiDS_CircSection.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_ChFiDS_CircSection;

  // NCollection_HArray1_ChFiDS_CircSection.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_ChFiDS_CircSection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_ChFiDS_CircSection.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_ChFiDS_CircSection.delete (method)
  delete(): void;

  // NCollection_HArray1_ChFiDS_CircSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_HLRAlgo_PolyHidingData: declare class NCollection_HArray1_HLRAlgo_PolyHidingData

  // NCollection_HArray1_HLRAlgo_PolyHidingData.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_HLRAlgo_PolyHidingData);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: HLRAlgo_PolyHidingData);
  constructor(theBegin: HLRAlgo_PolyHidingData, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_HLRAlgo_PolyHidingData.Array1 (method)
  Array1(): NCollection_Array1_HLRAlgo_PolyHidingData;

  // NCollection_HArray1_HLRAlgo_PolyHidingData.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_HLRAlgo_PolyHidingData;

  // NCollection_HArray1_HLRAlgo_PolyHidingData.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_HLRAlgo_PolyHidingData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_HLRAlgo_PolyHidingData.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_HLRAlgo_PolyHidingData.delete (method)
  delete(): void;

  // NCollection_HArray1_HLRAlgo_PolyHidingData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_HLRAlgo_TriangleData: declare class NCollection_HArray1_HLRAlgo_TriangleData

  // NCollection_HArray1_HLRAlgo_TriangleData.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_HLRAlgo_TriangleData);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: HLRAlgo_TriangleData);
  constructor(theBegin: HLRAlgo_TriangleData, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_HLRAlgo_TriangleData.Array1 (method)
  Array1(): NCollection_Array1_HLRAlgo_TriangleData;

  // NCollection_HArray1_HLRAlgo_TriangleData.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_HLRAlgo_TriangleData;

  // NCollection_HArray1_HLRAlgo_TriangleData.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_HLRAlgo_TriangleData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_HLRAlgo_TriangleData.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_HLRAlgo_TriangleData.delete (method)
  delete(): void;

  // NCollection_HArray1_HLRAlgo_TriangleData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_Poly_Triangle: declare class NCollection_HArray1_Poly_Triangle

  // NCollection_HArray1_Poly_Triangle.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_Poly_Triangle);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: Poly_Triangle);
  constructor(theBegin: Poly_Triangle, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_Poly_Triangle.Array1 (method)
  Array1(): NCollection_Array1_Poly_Triangle;

  // NCollection_HArray1_Poly_Triangle.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_Poly_Triangle;

  // NCollection_HArray1_Poly_Triangle.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_Poly_Triangle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_Poly_Triangle.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_Poly_Triangle.delete (method)
  delete(): void;

  // NCollection_HArray1_Poly_Triangle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_ApprovedItem: declare class NCollection_HArray1_StepAP203_ApprovedItem

  // NCollection_HArray1_StepAP203_ApprovedItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_ApprovedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_ApprovedItem);
  constructor(theBegin: StepAP203_ApprovedItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_ApprovedItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_ApprovedItem;

  // NCollection_HArray1_StepAP203_ApprovedItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_ApprovedItem;

  // NCollection_HArray1_StepAP203_ApprovedItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_ApprovedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_ApprovedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_ApprovedItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_ApprovedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_CertifiedItem: declare class NCollection_HArray1_StepAP203_CertifiedItem

  // NCollection_HArray1_StepAP203_CertifiedItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_CertifiedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_CertifiedItem);
  constructor(theBegin: StepAP203_CertifiedItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_CertifiedItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_CertifiedItem;

  // NCollection_HArray1_StepAP203_CertifiedItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_CertifiedItem;

  // NCollection_HArray1_StepAP203_CertifiedItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_CertifiedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_CertifiedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_CertifiedItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_CertifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_ChangeRequestItem: declare class NCollection_HArray1_StepAP203_ChangeRequestItem

  // NCollection_HArray1_StepAP203_ChangeRequestItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_ChangeRequestItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_ChangeRequestItem);
  constructor(theBegin: StepAP203_ChangeRequestItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_ChangeRequestItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_ChangeRequestItem;

  // NCollection_HArray1_StepAP203_ChangeRequestItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_ChangeRequestItem;

  // NCollection_HArray1_StepAP203_ChangeRequestItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_ChangeRequestItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_ChangeRequestItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_ChangeRequestItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_ChangeRequestItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_ClassifiedItem: declare class NCollection_HArray1_StepAP203_ClassifiedItem

  // NCollection_HArray1_StepAP203_ClassifiedItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_ClassifiedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_ClassifiedItem);
  constructor(theBegin: StepAP203_ClassifiedItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_ClassifiedItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_ClassifiedItem;

  // NCollection_HArray1_StepAP203_ClassifiedItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_ClassifiedItem;

  // NCollection_HArray1_StepAP203_ClassifiedItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_ClassifiedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_ClassifiedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_ClassifiedItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_ClassifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_ContractedItem: declare class NCollection_HArray1_StepAP203_ContractedItem

  // NCollection_HArray1_StepAP203_ContractedItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_ContractedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_ContractedItem);
  constructor(theBegin: StepAP203_ContractedItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_ContractedItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_ContractedItem;

  // NCollection_HArray1_StepAP203_ContractedItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_ContractedItem;

  // NCollection_HArray1_StepAP203_ContractedItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_ContractedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_ContractedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_ContractedItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_ContractedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_DateTimeItem: declare class NCollection_HArray1_StepAP203_DateTimeItem

  // NCollection_HArray1_StepAP203_DateTimeItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_DateTimeItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_DateTimeItem);
  constructor(theBegin: StepAP203_DateTimeItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_DateTimeItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_DateTimeItem;

  // NCollection_HArray1_StepAP203_DateTimeItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_DateTimeItem;

  // NCollection_HArray1_StepAP203_DateTimeItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_DateTimeItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_DateTimeItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_DateTimeItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_DateTimeItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_PersonOrganizationItem: declare class NCollection_HArray1_StepAP203_PersonOrganizationItem

  // NCollection_HArray1_StepAP203_PersonOrganizationItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_PersonOrganizationItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_PersonOrganizationItem);
  constructor(theBegin: StepAP203_PersonOrganizationItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_PersonOrganizationItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_PersonOrganizationItem;

  // NCollection_HArray1_StepAP203_PersonOrganizationItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_PersonOrganizationItem;

  // NCollection_HArray1_StepAP203_PersonOrganizationItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_PersonOrganizationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_PersonOrganizationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_PersonOrganizationItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_PersonOrganizationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_SpecifiedItem: declare class NCollection_HArray1_StepAP203_SpecifiedItem

  // NCollection_HArray1_StepAP203_SpecifiedItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_SpecifiedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_SpecifiedItem);
  constructor(theBegin: StepAP203_SpecifiedItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_SpecifiedItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_SpecifiedItem;

  // NCollection_HArray1_StepAP203_SpecifiedItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_SpecifiedItem;

  // NCollection_HArray1_StepAP203_SpecifiedItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_SpecifiedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_SpecifiedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_SpecifiedItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_SpecifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_StartRequestItem: declare class NCollection_HArray1_StepAP203_StartRequestItem

  // NCollection_HArray1_StepAP203_StartRequestItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_StartRequestItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_StartRequestItem);
  constructor(theBegin: StepAP203_StartRequestItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_StartRequestItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_StartRequestItem;

  // NCollection_HArray1_StepAP203_StartRequestItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_StartRequestItem;

  // NCollection_HArray1_StepAP203_StartRequestItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_StartRequestItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_StartRequestItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_StartRequestItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_StartRequestItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP203_WorkItem: declare class NCollection_HArray1_StepAP203_WorkItem

  // NCollection_HArray1_StepAP203_WorkItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP203_WorkItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP203_WorkItem);
  constructor(theBegin: StepAP203_WorkItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP203_WorkItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP203_WorkItem;

  // NCollection_HArray1_StepAP203_WorkItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP203_WorkItem;

  // NCollection_HArray1_StepAP203_WorkItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP203_WorkItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP203_WorkItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP203_WorkItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP203_WorkItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_ApprovalItem: declare class NCollection_HArray1_StepAP214_ApprovalItem

  // NCollection_HArray1_StepAP214_ApprovalItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_ApprovalItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_ApprovalItem);
  constructor(theBegin: StepAP214_ApprovalItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_ApprovalItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_ApprovalItem;

  // NCollection_HArray1_StepAP214_ApprovalItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_ApprovalItem;

  // NCollection_HArray1_StepAP214_ApprovalItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_ApprovalItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_ApprovalItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_ApprovalItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_ApprovalItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem: declare class NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem

  // NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_AutoDesignDateAndPersonItem);
  constructor(theBegin: StepAP214_AutoDesignDateAndPersonItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem: declare class NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem

  // NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_AutoDesignDateAndTimeItem);
  constructor(theBegin: StepAP214_AutoDesignDateAndTimeItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_AutoDesignDatedItem: declare class NCollection_HArray1_StepAP214_AutoDesignDatedItem

  // NCollection_HArray1_StepAP214_AutoDesignDatedItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignDatedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_AutoDesignDatedItem);
  constructor(theBegin: StepAP214_AutoDesignDatedItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_AutoDesignDatedItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_AutoDesignDatedItem;

  // NCollection_HArray1_StepAP214_AutoDesignDatedItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_AutoDesignDatedItem;

  // NCollection_HArray1_StepAP214_AutoDesignDatedItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_AutoDesignDatedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignDatedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignDatedItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_AutoDesignDatedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem: declare class NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem

  // NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_AutoDesignGeneralOrgItem);
  constructor(theBegin: StepAP214_AutoDesignGeneralOrgItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem;

  // NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_AutoDesignGroupedItem: declare class NCollection_HArray1_StepAP214_AutoDesignGroupedItem

  // NCollection_HArray1_StepAP214_AutoDesignGroupedItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignGroupedItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_AutoDesignGroupedItem);
  constructor(theBegin: StepAP214_AutoDesignGroupedItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_AutoDesignGroupedItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_AutoDesignGroupedItem;

  // NCollection_HArray1_StepAP214_AutoDesignGroupedItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_AutoDesignGroupedItem;

  // NCollection_HArray1_StepAP214_AutoDesignGroupedItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_AutoDesignGroupedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignGroupedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignGroupedItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_AutoDesignGroupedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect: declare class NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect

  // NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_AutoDesignPresentedItemSelect);
  constructor(theBegin: StepAP214_AutoDesignPresentedItemSelect, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect;

  // NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect;

  // NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_AutoDesignReferencingItem: declare class NCollection_HArray1_StepAP214_AutoDesignReferencingItem

  // NCollection_HArray1_StepAP214_AutoDesignReferencingItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_AutoDesignReferencingItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_AutoDesignReferencingItem);
  constructor(theBegin: StepAP214_AutoDesignReferencingItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_AutoDesignReferencingItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_AutoDesignReferencingItem;

  // NCollection_HArray1_StepAP214_AutoDesignReferencingItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_AutoDesignReferencingItem;

  // NCollection_HArray1_StepAP214_AutoDesignReferencingItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_AutoDesignReferencingItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignReferencingItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_AutoDesignReferencingItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_AutoDesignReferencingItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_DateAndTimeItem: declare class NCollection_HArray1_StepAP214_DateAndTimeItem

  // NCollection_HArray1_StepAP214_DateAndTimeItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_DateAndTimeItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_DateAndTimeItem);
  constructor(theBegin: StepAP214_DateAndTimeItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_DateAndTimeItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_DateAndTimeItem;

  // NCollection_HArray1_StepAP214_DateAndTimeItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_DateAndTimeItem;

  // NCollection_HArray1_StepAP214_DateAndTimeItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_DateAndTimeItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_DateAndTimeItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_DateAndTimeItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_DateAndTimeItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_DateItem: declare class NCollection_HArray1_StepAP214_DateItem

  // NCollection_HArray1_StepAP214_DateItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_DateItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_DateItem);
  constructor(theBegin: StepAP214_DateItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_DateItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_DateItem;

  // NCollection_HArray1_StepAP214_DateItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_DateItem;

  // NCollection_HArray1_StepAP214_DateItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_DateItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_DateItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_DateItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_DateItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_DocumentReferenceItem: declare class NCollection_HArray1_StepAP214_DocumentReferenceItem

  // NCollection_HArray1_StepAP214_DocumentReferenceItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_DocumentReferenceItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_DocumentReferenceItem);
  constructor(theBegin: StepAP214_DocumentReferenceItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_DocumentReferenceItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_DocumentReferenceItem;

  // NCollection_HArray1_StepAP214_DocumentReferenceItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_DocumentReferenceItem;

  // NCollection_HArray1_StepAP214_DocumentReferenceItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_DocumentReferenceItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_DocumentReferenceItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_DocumentReferenceItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_DocumentReferenceItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_ExternalIdentificationItem: declare class NCollection_HArray1_StepAP214_ExternalIdentificationItem

  // NCollection_HArray1_StepAP214_ExternalIdentificationItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_ExternalIdentificationItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_ExternalIdentificationItem);
  constructor(theBegin: StepAP214_ExternalIdentificationItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_ExternalIdentificationItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_ExternalIdentificationItem;

  // NCollection_HArray1_StepAP214_ExternalIdentificationItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_ExternalIdentificationItem;

  // NCollection_HArray1_StepAP214_ExternalIdentificationItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_ExternalIdentificationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_ExternalIdentificationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_ExternalIdentificationItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_ExternalIdentificationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_HArray1_StepAP214_GroupItem: declare class NCollection_HArray1_StepAP214_GroupItem

  // NCollection_HArray1_StepAP214_GroupItem.constructor (constructor)
  constructor();
  constructor(theOther: NCollection_Array1_StepAP214_GroupItem);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theValue: StepAP214_GroupItem);
  constructor(theBegin: StepAP214_GroupItem, theLower: number, theUpper: number, theUseBuffer: boolean);

  // NCollection_HArray1_StepAP214_GroupItem.Array1 (method)
  Array1(): NCollection_Array1_StepAP214_GroupItem;

  // NCollection_HArray1_StepAP214_GroupItem.ChangeArray1 (method)
  ChangeArray1(): NCollection_Array1_StepAP214_GroupItem;

  // NCollection_HArray1_StepAP214_GroupItem.get_type_name (method)
  static get_type_name(): string;

  // NCollection_HArray1_StepAP214_GroupItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NCollection_HArray1_StepAP214_GroupItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // NCollection_HArray1_StepAP214_GroupItem.delete (method)
  delete(): void;

  // NCollection_HArray1_StepAP214_GroupItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
