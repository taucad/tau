# libcascade — Sweep

3 top-level symbols. Signatures are verbatim typescript.

// Gives a simple indexed representation of a Directing Edge topology
Sweep_NumShape: declare class Sweep_NumShape

constructor

// Reinitialize a simple indexed edge
Init(Index: number, Type: TopAbs_ShapeEnum, Closed?: boolean, BegInf?: boolean, EndInf?: boolean): void;

Index(): number;

Type(): TopAbs_ShapeEnum;

Closed(): boolean;

BegInfinite(): boolean;

EndInfinite(): boolean;

Orientation(): TopAbs_Orientation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides iteration services required by the Swept Primitives for a Directing NumShape Line
Sweep_NumShapeIterator: declare class Sweep_NumShapeIterator

constructor

// Reset the NumShapeIterator on sub-shapes of <aShape>
Init(aShape: Sweep_NumShape): void;

// Returns True if there is a current sub-shape
More(): boolean;

// Moves to the next sub-shape
Next(): void;

// Returns the current sub-shape
Value(): Sweep_NumShape;

// Returns the orientation of the current sub-shape
Orientation(): TopAbs_Orientation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides the indexation and type analysis services required by the NumShape Directing Shapes of Swept Primitives
Sweep_NumShapeTool: declare class Sweep_NumShapeTool

constructor

// Returns the number of subshapes in the shape
NbShapes(): number;

// Returns the index of <aShape>
Index(aShape: Sweep_NumShape): number;

// Returns the Shape at index anIndex
Shape(anIndex: number): Sweep_NumShape;

// Returns the type of <aShape>
Type(aShape: Sweep_NumShape): TopAbs_ShapeEnum;

// Returns the orientation of <aShape>
Orientation(aShape: Sweep_NumShape): TopAbs_Orientation;

// Returns true if there is a First Vertex in the Shape
HasFirstVertex(): boolean;

// Returns true if there is a Last Vertex in the Shape
HasLastVertex(): boolean;

// Returns the first vertex
FirstVertex(): Sweep_NumShape;

// Returns the last vertex
LastVertex(): Sweep_NumShape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
