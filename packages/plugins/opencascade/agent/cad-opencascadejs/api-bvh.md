# libcascade — BVH

32 top-level symbols. Signatures are verbatim typescript.

// Command-queue for parallel building of `BVH` nodes
BVH_BuildQueue: declare class BVH_BuildQueue

constructor

// Returns current size of `BVH` build queue
Size(): number;

// Enqueues new work-item onto `BVH` build queue
Enqueue(theWorkItem: number): void;

// Fetches first work-item from `BVH` build queue
Fetch(wasBusy?: boolean): { returnValue: number; wasBusy: boolean };

// Checks if there are active build threads
HasBusyThreads(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Wrapper for `BVH` build thread
BVH_BuildThread: declare class BVH_BuildThread extends Standard_Transient

constructor

// Starts execution of `BVH` build thread
Run(): void;

// Waits till the thread finishes execution
Wait(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool object to call `BVH` builder subroutines
BVH_BuildTool: declare class BVH_BuildTool

// Performs splitting of the given `BVH` node
Perform(theNode: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A non-template class for using as base for `BVH_Builder` (just to have a named base class)
BVH_BuilderTransient: declare class BVH_BuilderTransient extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns the maximum depth of constructed `BVH`
MaxTreeDepth(): number;

// Returns the maximum number of sub-elements in the leaf
LeafNodeSize(): number;

// Returns parallel flag
IsParallel(): boolean;

// Set parallel flag controlling possibility of parallel execution
SetParallel(isParallel: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A non-template class for using as base for `BVH_Object` (just to have a named base class)
BVH_ObjectTransient: declare class BVH_ObjectTransient extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns properties of the geometric object
Properties(): BVH_Properties;

// Sets properties of the geometric object
SetProperties(theProperties: BVH_Properties): void;

// Returns TRUE if object state should be updated
IsDirty(): boolean;

// Marks object state as outdated (needs `BVH` rebuilding)
MarkDirty(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Abstract properties of geometric object
BVH_Properties: declare class BVH_Properties extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_BitComparator: declare class BVH_BitComparator

constructor

myBit: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_BitPredicate: declare class BVH_BitPredicate

constructor

myBit: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Performs radix sort of a `BVH` primitive set using 10-bit Morton codes (or 1024 x 1024 x 1024 grid)
BVH_RadixSorter: declare class BVH_RadixSorter

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Type corresponding to binary `BVH`
BVH_BinaryTree: declare class BVH_BinaryTree

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Type corresponding to quad `BVH`
BVH_QuadTree: declare class BVH_QuadTree

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A non-template class for using as base for `BVH_TreeBase` (just to have a named base class)
BVH_TreeBaseTransient: declare class BVH_TreeBaseTransient extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array2d: declare class BVH_Array2d

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array2f: declare class BVH_Array2f

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array2i: declare class BVH_Array2i

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array3d: declare class BVH_Array3d

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array3f: declare class BVH_Array3f

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array3i: declare class BVH_Array3i

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array4d: declare class BVH_Array4d

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array4f: declare class BVH_Array4f

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Array4i: declare class BVH_Array4i

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Mat4d: declare class BVH_Mat4d

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Mat4f: declare class BVH_Mat4f

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec2d: declare class BVH_Vec2d

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec2f: declare class BVH_Vec2f

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec2i: declare class BVH_Vec2i

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec3d: declare class BVH_Vec3d

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec3f: declare class BVH_Vec3f

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec3i: declare class BVH_Vec3i

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec4d: declare class BVH_Vec4d

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec4f: declare class BVH_Vec4f

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BVH_Vec4i: declare class BVH_Vec4i

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
