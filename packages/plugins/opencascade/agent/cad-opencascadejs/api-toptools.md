# libcascade — TopTools

21 top-level symbols. Signatures are verbatim typescript.

// The {@link TopTools`TopTools`} package provides utilities for the topological data structure
TopTools: declare class TopTools

constructor

// This is to bypass an extraction bug
static Dummy(I: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defined {@link TopTools`TopTools`} format version
TopTools_FormatVersion: typeof TopTools_FormatVersion[keyof typeof TopTools_FormatVersion]

// The class LocationSet stores a set of location in a relocatable state
TopTools_LocationSet: declare class TopTools_LocationSet

constructor

// Clears the content of the set
Clear(): void;

// Incorporate a new Location in the set and returns its index
Add(L: TopLoc_Location): number;

// Returns the location of index _._
Location(I: number): TopLoc_Location;

// Returns the index of <L>
Index(L: TopLoc_Location): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Hash tool, used for generating maps of shapes in topology
TopTools_ShapeMapHasher: declare class TopTools_ShapeMapHasher

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A ShapeSets contains a Shape and all its sub-shapes and locations
TopTools_ShapeSet: declare class TopTools_ShapeSet

constructor

// Sets the TopTools_FormatVersion
SetFormatNb(theFormatNb: number): void;

// Returns the TopTools_FormatVersion
FormatNb(): number;

// Clears the content of the set
Clear(): void;

// Stores and its sub-shape
Add(S: TopoDS_Shape): number;

// Returns the sub-shape of index _._
Shape(I: number): TopoDS_Shape;

// Returns the index of
Index(S: TopoDS_Shape): number;

Locations(): TopTools_LocationSet;

ChangeLocations(): TopTools_LocationSet;

// Dumps the number of objects in me on the stream <OS>
DumpExtent(S: TCollection_AsciiString): void;
// S: Mutated in place

// Stores the geometry of
AddGeometry(S: TopoDS_Shape): void;

// Inserts the shape <S2> in the shape <S1>
AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;
// S1: Mutated in place

// This method is called after each new completed shape
Check(T: TopAbs_ShapeEnum, S: TopoDS_Shape): void;
// S: Mutated in place

// Returns number of shapes read from file
NbShapes(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TopTools_Array1OfShape: NCollection_Array1_TopoDS_Shape

TopTools_Array2OfShape: NCollection_Array2_TopoDS_Shape

TopTools_DataMapOfShapeBox: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher

TopTools_DataMapOfShapeListOfShape: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_DataMapOfShapeReal: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher

TopTools_DataMapOfShapeShape: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_HArray1OfShape: NCollection_HArray1_TopoDS_Shape

TopTools_HArray2OfShape: NCollection_HArray2_TopoDS_Shape

TopTools_HSequenceOfShape: NCollection_HSequence_TopoDS_Shape

TopTools_IndexedDataMapOfShapeListOfShape: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_IndexedDataMapOfShapeReal: NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher

TopTools_IndexedMapOfShape: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_ListOfListOfShape: NCollection_List_NCollection_List_TopoDS_Shape

TopTools_ListOfShape: NCollection_List_TopoDS_Shape

TopTools_MapOfShape: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher

TopTools_SequenceOfShape: NCollection_Sequence_TopoDS_Shape
