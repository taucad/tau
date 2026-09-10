# libcascade — StlAPI

3 top-level symbols. Signatures are verbatim typescript.

// Offers the API for STL data manipulation
StlAPI: declare class StlAPI

constructor

// Convert and write shape to STL format
static Write(theShape: TopoDS_Shape, theFile: string, theAsciiMode?: boolean): boolean;

// Legacy interface
// DEPRECATED
static Read(theShape: TopoDS_Shape, aFile: string): boolean;
// theShape: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Reading from stereolithography format
StlAPI_Reader: declare class StlAPI_Reader

constructor

// Reads STL data from stream to the {@link TopoDS_Shape`TopoDS_Shape`} (each triangle is converted to the face)
Read(theShape: TopoDS_Shape, theFileName: string): boolean;
// theShape: result shape Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class creates and writes STL files from Open CASCADE shapes
StlAPI_Writer: declare class StlAPI_Writer

constructor

// Returns the address to the flag defining the mode for writing the file
ASCIIMode(): boolean;

// Converts a given shape to STL format and writes it to file with a given filename
Write(theShape: TopoDS_Shape, theFileName: string, theProgress: Message_ProgressRange): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
