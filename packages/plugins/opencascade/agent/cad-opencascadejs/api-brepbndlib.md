# libcascade — BRepBndLib

1 top-level symbols. Signatures are verbatim typescript.

// This package provides the bounding boxes for curves and surfaces from BRepAdaptor
BRepBndLib: declare class BRepBndLib

constructor

// Adds the shape S to the bounding box B
static Add(S: TopoDS_Shape, B: Bnd_Box, useTriangulation: boolean): void;
// B: Mutated in place

// Adds the shape S to the bounding box B
static AddClose(S: TopoDS_Shape, B: Bnd_Box): void;
// B: Mutated in place

// Adds the shape S to the bounding box B
static AddOptimal(S: TopoDS_Shape, B: Bnd_Box, useTriangulation: boolean, useShapeTolerance: boolean): void;
// B: Mutated in place

// Computes the Oriented Bounding box for the shape <theS>
static AddOBB(theS: TopoDS_Shape, theOBB: Bnd_OBB, theIsTriangulationUsed: boolean, theIsOptimal: boolean, theIsShapeToleranceUsed: boolean): void;
// theOBB: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
