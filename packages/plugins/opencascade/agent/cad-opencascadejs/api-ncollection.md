# libcascade — NCollection

32 top-level symbols. Signatures are verbatim typescript.

NCollection_AccAllocator: declare class NCollection_AccAllocator extends NCollection_BaseAllocator

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NCollection_AlignedAllocator: declare class NCollection_AlignedAllocator extends NCollection_BaseAllocator

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NCollection_BaseAllocator: declare class NCollection_BaseAllocator extends Standard_Transient

static CommonBaseAllocator(): NCollection_BaseAllocator;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NCollection_BaseList: declare class NCollection_BaseList

Extent(): number;

Length(): number;

Size(): number;

IsEmpty(): boolean;

Allocator(): NCollection_BaseAllocator;

delete(): void;

[Symbol.dispose](): void;

NCollection_BaseList_Iterator: declare class NCollection_BaseList_Iterator

constructor

Init(theList: NCollection_BaseList): void;

Initialize(theList: NCollection_BaseList): void;

More(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_BaseMap: declare class NCollection_BaseMap

NbBuckets(): number;

Extent(): number;

Length(): number;

Size(): number;

IsEmpty(): boolean;

Allocator(): NCollection_BaseAllocator;

delete(): void;

[Symbol.dispose](): void;

NCollection_BaseMap_Iterator: declare class NCollection_BaseMap_Iterator

Initialize(theMap: NCollection_BaseMap): void;

Reset(): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_BaseSequence: declare class NCollection_BaseSequence

IsEmpty(): boolean;

Length(): number;

Size(): number;

Allocator(): NCollection_BaseAllocator;

delete(): void;

[Symbol.dispose](): void;

NCollection_BaseSequence_Iterator: declare class NCollection_BaseSequence_Iterator

constructor

Init(theSeq: NCollection_BaseSequence, isStart?: boolean): void;

Previous(): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_Buffer: declare class NCollection_Buffer extends Standard_Transient

constructor

Data(): number;

ChangeData(): number;

IsEmpty(): boolean;

Size(): number;

Allocator(): NCollection_BaseAllocator;

SetAllocator(theAlloc: NCollection_BaseAllocator): void;

Allocate(theSize: number): boolean;

Free(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NCollection_CellFilter_Action: typeof NCollection_CellFilter_Action[keyof typeof NCollection_CellFilter_Action]

NCollection_ForwardRangeSentinel: declare class NCollection_ForwardRangeSentinel

constructor

delete(): void;

[Symbol.dispose](): void;

NCollection_HeapAllocator: declare class NCollection_HeapAllocator extends NCollection_BaseAllocator

static GlobalHeapAllocator(): NCollection_HeapAllocator;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NCollection_IncAllocator: declare class NCollection_IncAllocator extends NCollection_BaseAllocator

constructor

SetThreadSafe(theIsThreadSafe?: boolean): void;

Reset(theReleaseMemory?: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NCollection_IncAllocator_IBlock: interface NCollection_IncAllocator_IBlock

CurPointer: any

AvailableSize: any

NextBlock: NCollection_IncAllocator_IBlock

NextOrderedBlock: NCollection_IncAllocator_IBlock

CurPointer: any

AvailableSize: any

delete(): void;

[Symbol.dispose](): void;

NCollection_IncAllocator_IBlockSizeLevel: typeof NCollection_IncAllocator_IBlockSizeLevel[keyof typeof NCollection_IncAllocator_IBlockSizeLevel]

NCollection_SparseArrayBase: declare class NCollection_SparseArrayBase

Size(): number;

HasValue(theIndex: number): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_SparseArrayBase_Iterator: declare class NCollection_SparseArrayBase_Iterator

Restart(): void;

More(): boolean;

Next(): void;

Index(): number;

delete(): void;

[Symbol.dispose](): void;

NCollection_String: declare class NCollection_String

constructor

Size(): number;

Length(): number;

GetChar(theCharIndex: number): string;

GetCharBuffer(theCharIndex: number): string;

FromLocale(theString: string, theLength?: number): void;

IsEqual(theCompare: NCollection_String): boolean;

SubString(theStart: number, theEnd: number): NCollection_String;

ToCString(): string;

ToUtf8(): string;

ToUtf16(): string;

ToUtf32(): string;

ToUtfWide(): string;

ToLocale(theBuffer: string, theSizeBytes: number): boolean;

IsEmpty(): boolean;

Clear(): void;

Assign(theOther: NCollection_String): NCollection_String;

Swap(theOther: NCollection_String): void;

delete(): void;

[Symbol.dispose](): void;

NCollection_UtfStringTool: declare class NCollection_UtfStringTool

constructor

FromLocale(theString: string): string;

static ToLocale(theWideString: string, theBuffer: string, theSizeBytes: number): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_WinHeapAllocator: declare class NCollection_WinHeapAllocator extends NCollection_BaseAllocator

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_AppParCurves_ConstraintCouple: declare class NCollection_Array1_AppParCurves_ConstraintCouple

constructor

Init(theValue: AppParCurves_ConstraintCouple): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;

CopyValues(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;

Move(theOther: NCollection_Array1_AppParCurves_ConstraintCouple): NCollection_Array1_AppParCurves_ConstraintCouple;

First(): AppParCurves_ConstraintCouple;

ChangeFirst(): AppParCurves_ConstraintCouple;

Last(): AppParCurves_ConstraintCouple;

ChangeLast(): AppParCurves_ConstraintCouple;

Value(theIndex: number): AppParCurves_ConstraintCouple;

ChangeValue(theIndex: number): AppParCurves_ConstraintCouple;

At(theIndex: number): AppParCurves_ConstraintCouple;

ChangeAt(theIndex: number): AppParCurves_ConstraintCouple;

SetValue(theIndex: number, theItem: AppParCurves_ConstraintCouple): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_AppParCurves_MultiPoint: declare class NCollection_Array1_AppParCurves_MultiPoint

constructor

Init(theValue: AppParCurves_MultiPoint): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: unknown): unknown;

CopyValues(theOther: unknown): unknown;

Move(theOther: unknown): unknown;

First(): AppParCurves_MultiPoint;

ChangeFirst(): AppParCurves_MultiPoint;

Last(): AppParCurves_MultiPoint;

ChangeLast(): AppParCurves_MultiPoint;

Value(theIndex: number): AppParCurves_MultiPoint;

ChangeValue(theIndex: number): AppParCurves_MultiPoint;

At(theIndex: number): AppParCurves_MultiPoint;

ChangeAt(theIndex: number): AppParCurves_MultiPoint;

SetValue(theIndex: number, theItem: AppParCurves_MultiPoint): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_ChildRefId: declare class NCollection_Array1_BRepGraph_ChildRefId

constructor

Init(theValue: BRepGraph_ChildRefId): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;

CopyValues(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;

Move(theOther: NCollection_Array1_BRepGraph_ChildRefId): NCollection_Array1_BRepGraph_ChildRefId;

First(): BRepGraph_ChildRefId;

ChangeFirst(): BRepGraph_ChildRefId;

Last(): BRepGraph_ChildRefId;

ChangeLast(): BRepGraph_ChildRefId;

Value(theIndex: number): BRepGraph_ChildRefId;

ChangeValue(theIndex: number): BRepGraph_ChildRefId;

At(theIndex: number): BRepGraph_ChildRefId;

ChangeAt(theIndex: number): BRepGraph_ChildRefId;

SetValue(theIndex: number, theItem: BRepGraph_ChildRefId): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_CoEdgeId: declare class NCollection_Array1_BRepGraph_CoEdgeId

constructor

Init(theValue: BRepGraph_CoEdgeId): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;

CopyValues(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;

Move(theOther: NCollection_Array1_BRepGraph_CoEdgeId): NCollection_Array1_BRepGraph_CoEdgeId;

First(): BRepGraph_CoEdgeId;

ChangeFirst(): BRepGraph_CoEdgeId;

Last(): BRepGraph_CoEdgeId;

ChangeLast(): BRepGraph_CoEdgeId;

Value(theIndex: number): BRepGraph_CoEdgeId;

ChangeValue(theIndex: number): BRepGraph_CoEdgeId;

At(theIndex: number): BRepGraph_CoEdgeId;

ChangeAt(theIndex: number): BRepGraph_CoEdgeId;

SetValue(theIndex: number, theItem: BRepGraph_CoEdgeId): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_FaceRefId: declare class NCollection_Array1_BRepGraph_FaceRefId

constructor

Init(theValue: BRepGraph_FaceRefId): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;

CopyValues(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;

Move(theOther: NCollection_Array1_BRepGraph_FaceRefId): NCollection_Array1_BRepGraph_FaceRefId;

First(): BRepGraph_FaceRefId;

ChangeFirst(): BRepGraph_FaceRefId;

Last(): BRepGraph_FaceRefId;

ChangeLast(): BRepGraph_FaceRefId;

Value(theIndex: number): BRepGraph_FaceRefId;

ChangeValue(theIndex: number): BRepGraph_FaceRefId;

At(theIndex: number): BRepGraph_FaceRefId;

ChangeAt(theIndex: number): BRepGraph_FaceRefId;

SetValue(theIndex: number, theItem: BRepGraph_FaceRefId): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_ItemUID: declare class NCollection_Array1_BRepGraph_ItemUID

constructor

Init(theValue: BRepGraph_ItemUID): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;

CopyValues(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;

Move(theOther: NCollection_Array1_BRepGraph_ItemUID): NCollection_Array1_BRepGraph_ItemUID;

First(): BRepGraph_ItemUID;

ChangeFirst(): BRepGraph_ItemUID;

Last(): BRepGraph_ItemUID;

ChangeLast(): BRepGraph_ItemUID;

Value(theIndex: number): BRepGraph_ItemUID;

ChangeValue(theIndex: number): BRepGraph_ItemUID;

At(theIndex: number): BRepGraph_ItemUID;

ChangeAt(theIndex: number): BRepGraph_ItemUID;

SetValue(theIndex: number, theItem: BRepGraph_ItemUID): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_NodeId: declare class NCollection_Array1_BRepGraph_NodeId

constructor

Init(theValue: BRepGraph_NodeId): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;

CopyValues(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;

Move(theOther: NCollection_Array1_BRepGraph_NodeId): NCollection_Array1_BRepGraph_NodeId;

First(): BRepGraph_NodeId;

ChangeFirst(): BRepGraph_NodeId;

Last(): BRepGraph_NodeId;

ChangeLast(): BRepGraph_NodeId;

Value(theIndex: number): BRepGraph_NodeId;

ChangeValue(theIndex: number): BRepGraph_NodeId;

At(theIndex: number): BRepGraph_NodeId;

ChangeAt(theIndex: number): BRepGraph_NodeId;

SetValue(theIndex: number, theItem: BRepGraph_NodeId): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_OccurrenceRefId: declare class NCollection_Array1_BRepGraph_OccurrenceRefId

constructor

Init(theValue: BRepGraph_OccurrenceRefId): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;

CopyValues(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;

Move(theOther: NCollection_Array1_BRepGraph_OccurrenceRefId): NCollection_Array1_BRepGraph_OccurrenceRefId;

First(): BRepGraph_OccurrenceRefId;

ChangeFirst(): BRepGraph_OccurrenceRefId;

Last(): BRepGraph_OccurrenceRefId;

ChangeLast(): BRepGraph_OccurrenceRefId;

Value(theIndex: number): BRepGraph_OccurrenceRefId;

ChangeValue(theIndex: number): BRepGraph_OccurrenceRefId;

At(theIndex: number): BRepGraph_OccurrenceRefId;

ChangeAt(theIndex: number): BRepGraph_OccurrenceRefId;

SetValue(theIndex: number, theItem: BRepGraph_OccurrenceRefId): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_RefId: declare class NCollection_Array1_BRepGraph_RefId

constructor

Init(theValue: BRepGraph_RefId): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;

CopyValues(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;

Move(theOther: NCollection_Array1_BRepGraph_RefId): NCollection_Array1_BRepGraph_RefId;

First(): BRepGraph_RefId;

ChangeFirst(): BRepGraph_RefId;

Last(): BRepGraph_RefId;

ChangeLast(): BRepGraph_RefId;

Value(theIndex: number): BRepGraph_RefId;

ChangeValue(theIndex: number): BRepGraph_RefId;

At(theIndex: number): BRepGraph_RefId;

ChangeAt(theIndex: number): BRepGraph_RefId;

SetValue(theIndex: number, theItem: BRepGraph_RefId): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_ShellRefId: declare class NCollection_Array1_BRepGraph_ShellRefId

constructor

Init(theValue: BRepGraph_ShellRefId): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;

CopyValues(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;

Move(theOther: NCollection_Array1_BRepGraph_ShellRefId): NCollection_Array1_BRepGraph_ShellRefId;

First(): BRepGraph_ShellRefId;

ChangeFirst(): BRepGraph_ShellRefId;

Last(): BRepGraph_ShellRefId;

ChangeLast(): BRepGraph_ShellRefId;

Value(theIndex: number): BRepGraph_ShellRefId;

ChangeValue(theIndex: number): BRepGraph_ShellRefId;

At(theIndex: number): BRepGraph_ShellRefId;

ChangeAt(theIndex: number): BRepGraph_ShellRefId;

SetValue(theIndex: number, theItem: BRepGraph_ShellRefId): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;

NCollection_Array1_BRepGraph_SolidRefId: declare class NCollection_Array1_BRepGraph_SolidRefId

constructor

Init(theValue: BRepGraph_SolidRefId): void;

Size(): number;

Length(): number;

IsEmpty(): boolean;

Lower(): number;

Upper(): number;

Assign(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;

CopyValues(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;

Move(theOther: NCollection_Array1_BRepGraph_SolidRefId): NCollection_Array1_BRepGraph_SolidRefId;

First(): BRepGraph_SolidRefId;

ChangeFirst(): BRepGraph_SolidRefId;

Last(): BRepGraph_SolidRefId;

ChangeLast(): BRepGraph_SolidRefId;

Value(theIndex: number): BRepGraph_SolidRefId;

ChangeValue(theIndex: number): BRepGraph_SolidRefId;

At(theIndex: number): BRepGraph_SolidRefId;

ChangeAt(theIndex: number): BRepGraph_SolidRefId;

SetValue(theIndex: number, theItem: BRepGraph_SolidRefId): void;

UpdateLowerBound(theLower: number): void;

UpdateUpperBound(theUpper: number): void;

Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;

IsDeletable(): boolean;

delete(): void;

[Symbol.dispose](): void;
