# libcascade — BVH

32 top-level symbols. Signatures are verbatim typescript.

BVH_BuildQueue: declare class BVH_BuildQueue

constructor

Size(): number;

Enqueue(theWorkItem: number): void;

Fetch(wasBusy?: boolean): { returnValue: number; wasBusy: boolean };

HasBusyThreads(): boolean;

delete(): void;

[Symbol.dispose](): void;

BVH_BuildThread: declare class BVH_BuildThread extends Standard_Transient

constructor

Run(): void;

Wait(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BVH_BuildTool: declare class BVH_BuildTool

Perform(theNode: number): void;

delete(): void;

[Symbol.dispose](): void;

BVH_BuilderTransient: declare class BVH_BuilderTransient extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

MaxTreeDepth(): number;

LeafNodeSize(): number;

IsParallel(): boolean;

SetParallel(isParallel: boolean): void;

delete(): void;

[Symbol.dispose](): void;

BVH_ObjectTransient: declare class BVH_ObjectTransient extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Properties(): BVH_Properties;

SetProperties(theProperties: BVH_Properties): void;

IsDirty(): boolean;

MarkDirty(): void;

delete(): void;

[Symbol.dispose](): void;

BVH_Properties: declare class BVH_Properties extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BVH_BitComparator: declare class BVH_BitComparator

constructor

myBit: number

delete(): void;

[Symbol.dispose](): void;

BVH_BitPredicate: declare class BVH_BitPredicate

constructor

myBit: number

delete(): void;

[Symbol.dispose](): void;

BVH_RadixSorter: declare class BVH_RadixSorter

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_BinaryTree: declare class BVH_BinaryTree

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_QuadTree: declare class BVH_QuadTree

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_TreeBaseTransient: declare class BVH_TreeBaseTransient extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BVH_Array2d: declare class BVH_Array2d

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Array2f: declare class BVH_Array2f

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Array2i: declare class BVH_Array2i

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Array3d: declare class BVH_Array3d

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Array3f: declare class BVH_Array3f

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Array3i: declare class BVH_Array3i

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Array4d: declare class BVH_Array4d

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Array4f: declare class BVH_Array4f

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Array4i: declare class BVH_Array4i

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Mat4d: declare class BVH_Mat4d

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Mat4f: declare class BVH_Mat4f

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec2d: declare class BVH_Vec2d

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec2f: declare class BVH_Vec2f

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec2i: declare class BVH_Vec2i

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec3d: declare class BVH_Vec3d

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec3f: declare class BVH_Vec3f

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec3i: declare class BVH_Vec3i

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec4d: declare class BVH_Vec4d

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec4f: declare class BVH_Vec4f

constructor

delete(): void;

[Symbol.dispose](): void;

BVH_Vec4i: declare class BVH_Vec4i

constructor

delete(): void;

[Symbol.dispose](): void;
