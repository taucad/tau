# libcascade — BinTools

13 top-level symbols. Signatures are verbatim typescript.

// Tool to keep shapes in binary format
BinTools: declare class BinTools

constructor

// Writes the shape to the file in binary format BinTools_FormatVersion_CURRENT
static Write(theShape: TopoDS_Shape, theFile: string, theRange: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: BinTools_FormatVersion, theRange: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theRange: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: BinTools_FormatVersion, theRange: Message_ProgressRange): boolean;
// theShape: the shape to write
// theFile: the path to file to output shape into
// theRange: the range of progress indicator to fill in

// Reads a shape from <theStream> and returns it in <theShape>
static Read(theShape: TopoDS_Shape, theFile: string, theRange: Message_ProgressRange): boolean;
// theShape: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores a set of Curves from Geom2d in binary format
BinTools_Curve2dSet: declare class BinTools_Curve2dSet

constructor

// Clears the content of the set
Clear(): void;

// Incorporate a new Curve in the set and returns its index
Add(C: Geom2d_Curve): number;

// Returns the Curve of index _._
Curve2d(I: number): Geom2d_Curve;

// Returns the index of <L>
Index(C: Geom2d_Curve): number;

// Dumps the curve on the binary stream, that can be read back
static WriteCurve2d(C: Geom2d_Curve, OS: BinTools_OStream): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores a set of Curves from Geom in binary format
BinTools_CurveSet: declare class BinTools_CurveSet

constructor

// Clears the content of the set
Clear(): void;

// Incorporate a new Curve in the set and returns its index
Add(C: Geom_Curve): number;

// Returns the Curve of index _._
Curve(I: number): Geom_Curve;

// Returns the index of <L>
Index(C: Geom_Curve): number;

// Dumps the curve on the stream in binary format that can be read back
static WriteCurve(C: Geom_Curve, OS: BinTools_OStream): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defined {@link BinTools`BinTools`} format version
BinTools_FormatVersion: typeof BinTools_FormatVersion[keyof typeof BinTools_FormatVersion]

// Substitution of IStream for shape reader for fast management of position in the file (get and go) and operation on all reading types
BinTools_IStream: declare class BinTools_IStream

// Reads and returns the type
ReadType(): BinTools_ObjectType;

// Returns the last read type
LastType(): BinTools_ObjectType;

// Returns the shape type by the last retrieved type
ShapeType(): TopAbs_ShapeEnum;

// Returns the shape orientation by the last retrieved type
ShapeOrientation(): TopAbs_Orientation;

// Returns the current position in the stream
Position(): number;

// Moves the current stream position to the given one
GoTo(thePosition: number): void;

// Returns true if the last restored type is one of a reference
IsReference(): boolean;

// Reads a reference IStream using the last restored type
ReadReference(): number;

// Makes up to date the myPosition because myStream was used outside and position is changed
UpdatePosition(): void;

// Reads real value from the stream
ReadReal(): number;

// Reads integer value from the stream
ReadInteger(): number;

// Reads point coordinates value from the stream
ReadPnt(): gp_Pnt;

// Reads byte value from the stream
ReadByte(): number;

// Reads boolean value from the stream (stored as one byte)
ReadBool(): boolean;

// Reads short real value from the stream
ReadShortReal(): number;

// Reads 3 boolean values from one byte
ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean };
ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean, theBool4?: boolean, theBool5?: boolean, theBool6?: boolean, theBool7?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean; theBool4: boolean; theBool5: boolean; theBool6: boolean; theBool7: boolean };
ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean };
ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean, theBool4?: boolean, theBool5?: boolean, theBool6?: boolean, theBool7?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean; theBool4: boolean; theBool5: boolean; theBool6: boolean; theBool7: boolean };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class LocationSet stores a set of location in a relocatable state
BinTools_LocationSet: declare class BinTools_LocationSet

constructor

// Clears the content of the set
Clear(): void;

// Incorporate a new Location in the set and returns its index
Add(L: TopLoc_Location): number;

// Returns the location of index _._
Location(I: number): TopLoc_Location;

// Returns the index of <L>
Index(L: TopLoc_Location): number;

// Returns number of locations
NbLocations(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Substitution of OStream for shape writer for fast management of position in the file and operation on all writing types
BinTools_OStream: declare class BinTools_OStream

// Returns the current position of the stream
Position(): number;

// Writes the reference to the given position (an offset between the current and the given one)
WriteReference(thePosition: number): void;

// Writes an identifier of shape type and orientation into the stream
WriteShape(theType: TopAbs_ShapeEnum, theOrientation: TopAbs_Orientation): void;

// Writes 3 booleans as one byte to the stream
PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean): void;
PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean, theValue4: boolean, theValue5: boolean, theValue6: boolean, theValue7: boolean): void;
PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean): void;
PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean, theValue4: boolean, theValue5: boolean, theValue6: boolean, theValue7: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumeration defining objects identifiers in the shape read/write format
BinTools_ObjectType: typeof BinTools_ObjectType[keyof typeof BinTools_ObjectType]

// Reads topology from IStream in binary format without grouping of objects by types and using relative positions in a file as references
BinTools_ShapeReader: declare class BinTools_ShapeReader extends BinTools_ShapeSetBase

constructor

// Clears the content of the set
Clear(): void;

// Reads location from the stream
ReadLocation(theStream: BinTools_IStream): TopLoc_Location;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Writes topology in OStream in binary format
BinTools_ShapeSet: declare class BinTools_ShapeSet extends BinTools_ShapeSetBase

constructor

// Clears the content of the set
Clear(): void;

// Stores and its sub-shape
Add(S: TopoDS_Shape): number;

// Returns the sub-shape of index _._
Shape(I: number): TopoDS_Shape;

// Returns the index of
Index(S: TopoDS_Shape): number;

Locations(): BinTools_LocationSet;

ChangeLocations(): BinTools_LocationSet;

// Returns number of shapes read from file
NbShapes(): number;

// Stores the shape
AddShape(S: TopoDS_Shape): void;

// Inserts the shape <S2> in the shape <S1>
AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;
// S1: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A base class for all readers/writers of {@link TopoDS_Shape`TopoDS_Shape`} into/from stream
BinTools_ShapeSetBase: declare class BinTools_ShapeSetBase

constructor

// Return true if shape should be stored with triangles
IsWithTriangles(): boolean;

// Return true if shape should be stored triangulation with normals
IsWithNormals(): boolean;

// Define if shape will be stored with triangles
SetWithTriangles(theWithTriangles: boolean): void;

// Define if shape will be stored triangulation with normals
SetWithNormals(theWithNormals: boolean): void;

// Sets the BinTools_FormatVersion
SetFormatNb(theFormatNb: number): void;

// Returns the BinTools_FormatVersion
FormatNb(): number;

// Clears the content of the set
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Writes topology in OStream in binary format without grouping of objects by types and using relative positions in a file as references
BinTools_ShapeWriter: declare class BinTools_ShapeWriter extends BinTools_ShapeSetBase

constructor

// Clears the content of the set
Clear(): void;

// Writes location to the stream (all the needed sub-information or reference if it is already used)
WriteLocation(theStream: BinTools_OStream, theLocation: TopLoc_Location): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores a set of Surfaces from Geom in binary format
BinTools_SurfaceSet: declare class BinTools_SurfaceSet

constructor

// Clears the content of the set
Clear(): void;

// Incorporate a new Surface in the set and returns its index
Add(S: Geom_Surface): number;

// Returns the Surface of index _._
Surface(I: number): Geom_Surface;

// Returns the index of <L>
Index(S: Geom_Surface): number;

// Dumps the surface on the stream in binary format that can be read back
static WriteSurface(S: Geom_Surface, OS: BinTools_OStream): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
