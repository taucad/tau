# libcascade — BRepProj

1 top-level symbols. Signatures are verbatim typescript.

// The Projection class provides conical and cylindrical projections of Edge or Wire on a Shape from `TopoDS`
BRepProj_Projection: declare class BRepProj_Projection

constructor

// returns False if the section failed
IsDone(): boolean;

// Resets the iterator by resulting wires
Init(): void;

// Returns True if there is a current result wire
More(): boolean;

// Move to the next result wire
Next(): void;

// Returns the current result wire
Current(): TopoDS_Wire;

// Returns the complete result as compound of wires
Shape(): TopoDS_Compound;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
