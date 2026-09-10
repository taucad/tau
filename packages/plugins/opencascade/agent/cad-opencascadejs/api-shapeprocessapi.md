# libcascade — ShapeProcessAPI

1 top-level symbols. Signatures are verbatim typescript.

// Applies one of the sequence read from resource file
ShapeProcessAPI_ApplySequence: declare class ShapeProcessAPI_ApplySequence

constructor

// Returns object for managing resource file and sequence of operators
Context(): ShapeProcess_ShapeContext;

// Performs sequence of operators stored in myRsc
PrepareShape(shape: TopoDS_Shape, fillmap?: boolean, until?: TopAbs_ShapeEnum, theProgress?: Message_ProgressRange): TopoDS_Shape;

// Clears myMap with accumulated history
ClearMap(): void;

// Returns myMap with accumulated history
Map(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

// Prints result of preparation onto the messenger of the context
PrintPreparationResult(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
