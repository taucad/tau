# libcascade — RWStl

2 top-level symbols. Signatures are verbatim typescript.

// This class provides methods to read and write triangulation from / to the STL files
RWStl: declare class RWStl

constructor

// Read specified STL file and returns its content as triangulation
static ReadFile(theFile: string, theProgress: Message_ProgressRange): Poly_Triangulation;
static ReadFile(theFile: string, theMergeAngle: number, theProgress: Message_ProgressRange): Poly_Triangulation;
static ReadFile(theFile: string, theMergeAngle: number, theTriangList: NCollection_Sequence_handle_Poly_Triangulation, theProgress: Message_ProgressRange): void;
static ReadFile(theFile: string, theProgress: Message_ProgressRange): Poly_Triangulation;
static ReadFile(theFile: string, theMergeAngle: number, theProgress: Message_ProgressRange): Poly_Triangulation;
static ReadFile(theFile: string, theMergeAngle: number, theTriangList: NCollection_Sequence_handle_Poly_Triangulation, theProgress: Message_ProgressRange): void;
static ReadFile(theFile: string, theProgress: Message_ProgressRange): Poly_Triangulation;
static ReadFile(theFile: string, theMergeAngle: number, theProgress: Message_ProgressRange): Poly_Triangulation;
static ReadFile(theFile: string, theMergeAngle: number, theTriangList: NCollection_Sequence_handle_Poly_Triangulation, theProgress: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An abstract class implementing procedure to read STL file
RWStl_Reader: declare class RWStl_Reader extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Reads data from STL file (either binary or Ascii)
Read(theFile: string, theProgress: Message_ProgressRange): boolean;

// Callback function to be implemented in descendant
AddNode(thePnt: gp_XYZ): number;

// Callback function to be implemented in descendant
AddTriangle(theN1: number, theN2: number, theN3: number): void;

// Callback function to be implemented in descendant
AddSolid(): void;

// Return merge tolerance
MergeAngle(): number;

// Set merge angle in radians
SetMergeAngle(theAngleRad: number): void;

// Return linear merge tolerance
MergeTolerance(): number;

// Set linear merge tolerance
SetMergeTolerance(theTolerance: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
