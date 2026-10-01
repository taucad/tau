# libcascade — ShapeProcessAPI

1 top-level symbols. Signatures are verbatim typescript.

ShapeProcessAPI_ApplySequence: declare class ShapeProcessAPI_ApplySequence

  // ShapeProcessAPI_ApplySequence.constructor (constructor)
  constructor(rscName: string, seqName?: string);

  // ShapeProcessAPI_ApplySequence.Context (method)
  Context(): ShapeProcess_ShapeContext;

  // ShapeProcessAPI_ApplySequence.PrepareShape (method)
  PrepareShape(shape: TopoDS_Shape, fillmap?: boolean, until?: TopAbs_ShapeEnum, theProgress?: Message_ProgressRange): TopoDS_Shape;

  // ShapeProcessAPI_ApplySequence.ClearMap (method)
  ClearMap(): void;

  // ShapeProcessAPI_ApplySequence.Map (method)
  Map(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

  // ShapeProcessAPI_ApplySequence.PrintPreparationResult (method)
  PrintPreparationResult(): void;

  // ShapeProcessAPI_ApplySequence.delete (method)
  delete(): void;

  // ShapeProcessAPI_ApplySequence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
