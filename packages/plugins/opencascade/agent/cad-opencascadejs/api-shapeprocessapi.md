# libcascade — ShapeProcessAPI

1 top-level symbols. Signatures are verbatim typescript.

ShapeProcessAPI_ApplySequence: declare class ShapeProcessAPI_ApplySequence

constructor

Context(): ShapeProcess_ShapeContext;

PrepareShape(shape: TopoDS_Shape, fillmap?: boolean, until?: TopAbs_ShapeEnum, theProgress?: Message_ProgressRange): TopoDS_Shape;

ClearMap(): void;

Map(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

PrintPreparationResult(): void;

delete(): void;

[Symbol.dispose](): void;
