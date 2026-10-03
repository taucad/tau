# libcascade — BVH

32 top-level symbols. Signatures are verbatim typescript.

BVH_BuildQueue: declare class BVH_BuildQueue

  // BVH_BuildQueue.constructor (constructor)
  constructor();

  // BVH_BuildQueue.Size (method)
  Size(): number;

  // BVH_BuildQueue.Enqueue (method)
  Enqueue(theWorkItem: number): void;

  // BVH_BuildQueue.Fetch (method)
  Fetch(wasBusy?: boolean): { returnValue: number; wasBusy: boolean };

  // BVH_BuildQueue.HasBusyThreads (method)
  HasBusyThreads(): boolean;

  // BVH_BuildQueue.delete (method)
  delete(): void;

  // BVH_BuildQueue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_BuildThread: declare class BVH_BuildThread extends Standard_Transient

  // BVH_BuildThread.constructor (constructor)
  constructor(theBuildTool: BVH_BuildTool, theBuildQueue: BVH_BuildQueue);

  // BVH_BuildThread.Run (method)
  Run(): void;

  // BVH_BuildThread.Wait (method)
  Wait(): void;

  // BVH_BuildThread.get_type_name (method)
  static get_type_name(): string;

  // BVH_BuildThread.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BVH_BuildThread.DynamicType (method)
  DynamicType(): Standard_Type;

  // BVH_BuildThread.delete (method)
  delete(): void;

  // BVH_BuildThread.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_BuildTool: declare class BVH_BuildTool

  // BVH_BuildTool.Perform (method)
  Perform(theNode: number): void;

  // BVH_BuildTool.delete (method)
  delete(): void;

  // BVH_BuildTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_BuilderTransient: declare class BVH_BuilderTransient extends Standard_Transient

  // BVH_BuilderTransient.get_type_name (method)
  static get_type_name(): string;

  // BVH_BuilderTransient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BVH_BuilderTransient.DynamicType (method)
  DynamicType(): Standard_Type;

  // BVH_BuilderTransient.MaxTreeDepth (method)
  MaxTreeDepth(): number;

  // BVH_BuilderTransient.LeafNodeSize (method)
  LeafNodeSize(): number;

  // BVH_BuilderTransient.IsParallel (method)
  IsParallel(): boolean;

  // BVH_BuilderTransient.SetParallel (method)
  SetParallel(isParallel: boolean): void;

  // BVH_BuilderTransient.delete (method)
  delete(): void;

  // BVH_BuilderTransient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_ObjectTransient: declare class BVH_ObjectTransient extends Standard_Transient

  // BVH_ObjectTransient.get_type_name (method)
  static get_type_name(): string;

  // BVH_ObjectTransient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BVH_ObjectTransient.DynamicType (method)
  DynamicType(): Standard_Type;

  // BVH_ObjectTransient.Properties (method)
  Properties(): BVH_Properties;

  // BVH_ObjectTransient.SetProperties (method)
  SetProperties(theProperties: BVH_Properties): void;

  // BVH_ObjectTransient.IsDirty (method)
  IsDirty(): boolean;

  // BVH_ObjectTransient.MarkDirty (method)
  MarkDirty(): void;

  // BVH_ObjectTransient.delete (method)
  delete(): void;

  // BVH_ObjectTransient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Properties: declare class BVH_Properties extends Standard_Transient

  // BVH_Properties.get_type_name (method)
  static get_type_name(): string;

  // BVH_Properties.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BVH_Properties.DynamicType (method)
  DynamicType(): Standard_Type;

  // BVH_Properties.delete (method)
  delete(): void;

  // BVH_Properties.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_BitComparator: declare class BVH_BitComparator

  // BVH_BitComparator.constructor (constructor)
  constructor(theDigit: number);

  myBit: number

  // BVH_BitComparator.delete (method)
  delete(): void;

  // BVH_BitComparator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_BitPredicate: declare class BVH_BitPredicate

  // BVH_BitPredicate.constructor (constructor)
  constructor(theDigit: number);

  myBit: number

  // BVH_BitPredicate.delete (method)
  delete(): void;

  // BVH_BitPredicate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_RadixSorter: declare class BVH_RadixSorter

  // BVH_RadixSorter.constructor (constructor)
  constructor();

  // BVH_RadixSorter.delete (method)
  delete(): void;

  // BVH_RadixSorter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_BinaryTree: declare class BVH_BinaryTree

  // BVH_BinaryTree.constructor (constructor)
  constructor();

  // BVH_BinaryTree.delete (method)
  delete(): void;

  // BVH_BinaryTree.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_QuadTree: declare class BVH_QuadTree

  // BVH_QuadTree.constructor (constructor)
  constructor();

  // BVH_QuadTree.delete (method)
  delete(): void;

  // BVH_QuadTree.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_TreeBaseTransient: declare class BVH_TreeBaseTransient extends Standard_Transient

  // BVH_TreeBaseTransient.get_type_name (method)
  static get_type_name(): string;

  // BVH_TreeBaseTransient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BVH_TreeBaseTransient.DynamicType (method)
  DynamicType(): Standard_Type;

  // BVH_TreeBaseTransient.delete (method)
  delete(): void;

  // BVH_TreeBaseTransient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array2d: declare class BVH_Array2d

  // BVH_Array2d.constructor (constructor)
  constructor();

  // BVH_Array2d.delete (method)
  delete(): void;

  // BVH_Array2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array2f: declare class BVH_Array2f

  // BVH_Array2f.constructor (constructor)
  constructor();

  // BVH_Array2f.delete (method)
  delete(): void;

  // BVH_Array2f.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array2i: declare class BVH_Array2i

  // BVH_Array2i.constructor (constructor)
  constructor();

  // BVH_Array2i.delete (method)
  delete(): void;

  // BVH_Array2i.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array3d: declare class BVH_Array3d

  // BVH_Array3d.constructor (constructor)
  constructor();

  // BVH_Array3d.delete (method)
  delete(): void;

  // BVH_Array3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array3f: declare class BVH_Array3f

  // BVH_Array3f.constructor (constructor)
  constructor();

  // BVH_Array3f.delete (method)
  delete(): void;

  // BVH_Array3f.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array3i: declare class BVH_Array3i

  // BVH_Array3i.constructor (constructor)
  constructor();

  // BVH_Array3i.delete (method)
  delete(): void;

  // BVH_Array3i.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array4d: declare class BVH_Array4d

  // BVH_Array4d.constructor (constructor)
  constructor();

  // BVH_Array4d.delete (method)
  delete(): void;

  // BVH_Array4d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array4f: declare class BVH_Array4f

  // BVH_Array4f.constructor (constructor)
  constructor();

  // BVH_Array4f.delete (method)
  delete(): void;

  // BVH_Array4f.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Array4i: declare class BVH_Array4i

  // BVH_Array4i.constructor (constructor)
  constructor();

  // BVH_Array4i.delete (method)
  delete(): void;

  // BVH_Array4i.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Mat4d: declare class BVH_Mat4d

  // BVH_Mat4d.constructor (constructor)
  constructor();

  // BVH_Mat4d.delete (method)
  delete(): void;

  // BVH_Mat4d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Mat4f: declare class BVH_Mat4f

  // BVH_Mat4f.constructor (constructor)
  constructor();

  // BVH_Mat4f.delete (method)
  delete(): void;

  // BVH_Mat4f.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec2d: declare class BVH_Vec2d

  // BVH_Vec2d.constructor (constructor)
  constructor();

  // BVH_Vec2d.delete (method)
  delete(): void;

  // BVH_Vec2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec2f: declare class BVH_Vec2f

  // BVH_Vec2f.constructor (constructor)
  constructor();

  // BVH_Vec2f.delete (method)
  delete(): void;

  // BVH_Vec2f.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec2i: declare class BVH_Vec2i

  // BVH_Vec2i.constructor (constructor)
  constructor();

  // BVH_Vec2i.delete (method)
  delete(): void;

  // BVH_Vec2i.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec3d: declare class BVH_Vec3d

  // BVH_Vec3d.constructor (constructor)
  constructor();

  // BVH_Vec3d.delete (method)
  delete(): void;

  // BVH_Vec3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec3f: declare class BVH_Vec3f

  // BVH_Vec3f.constructor (constructor)
  constructor();

  // BVH_Vec3f.delete (method)
  delete(): void;

  // BVH_Vec3f.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec3i: declare class BVH_Vec3i

  // BVH_Vec3i.constructor (constructor)
  constructor();

  // BVH_Vec3i.delete (method)
  delete(): void;

  // BVH_Vec3i.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec4d: declare class BVH_Vec4d

  // BVH_Vec4d.constructor (constructor)
  constructor();

  // BVH_Vec4d.delete (method)
  delete(): void;

  // BVH_Vec4d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec4f: declare class BVH_Vec4f

  // BVH_Vec4f.constructor (constructor)
  constructor();

  // BVH_Vec4f.delete (method)
  delete(): void;

  // BVH_Vec4f.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BVH_Vec4i: declare class BVH_Vec4i

  // BVH_Vec4i.constructor (constructor)
  constructor();

  // BVH_Vec4i.delete (method)
  delete(): void;

  // BVH_Vec4i.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
