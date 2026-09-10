# libcascade — BRepPreviewAPI

1 top-level symbols. Signatures are verbatim typescript.

// Builds a valid box, if points fulfill the conditions of a valid box
BRepPreviewAPI_MakeBox: declare class BRepPreviewAPI_MakeBox extends BRepPrimAPI_MakeBox

constructor

// Creates a preview depending on point values
Build(theRange?: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
