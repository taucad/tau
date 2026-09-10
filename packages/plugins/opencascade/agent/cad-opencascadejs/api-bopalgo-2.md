# libcascade — BOPAlgo (2)

22 top-level symbols. Signatures are verbatim typescript.

// The algorithm is based on the General Fuse algorithm (GFA)
BOPAlgo_CellsBuilder: declare class BOPAlgo_CellsBuilder extends BOPAlgo_Builder

constructor

// Redefined method Clear - clears the contents
Clear(): void;

// Adding the parts to result
AddToResult(theLSToTake: NCollection_List_TopoDS_Shape, theLSToAvoid: NCollection_List_TopoDS_Shape, theMaterial?: number, theUpdate?: boolean): void;

// Add all split parts to result
AddAllToResult(theMaterial?: number, theUpdate?: boolean): void;

// Removing the parts from result
RemoveFromResult(theLSToTake: NCollection_List_TopoDS_Shape, theLSToAvoid: NCollection_List_TopoDS_Shape): void;

// Remove all parts from result
RemoveAllFromResult(): void;

// Removes internal boundaries between cells with the same material
RemoveInternalBoundaries(): void;

// Get all split parts
GetAllParts(): TopoDS_Shape;

// Makes the Containers of proper type from the parts added to result
MakeContainers(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// contains information about faulty shapes and faulty types can't be processed by Boolean Operations
BOPAlgo_CheckResult: declare class BOPAlgo_CheckResult

constructor

// sets ancestor shape (object) for faulty sub-shapes
SetShape1(TheShape: TopoDS_Shape): void;

// adds faulty sub-shapes from object to a list
AddFaultyShape1(TheShape: TopoDS_Shape): void;

// sets ancestor shape (tool) for faulty sub-shapes
SetShape2(TheShape: TopoDS_Shape): void;

// adds faulty sub-shapes from tool to a list
AddFaultyShape2(TheShape: TopoDS_Shape): void;

// returns ancestor shape (object) for faulties
GetShape1(): TopoDS_Shape;

// returns ancestor shape (tool) for faulties
GetShape2(): TopoDS_Shape;

// returns list of faulty shapes for object
GetFaultyShapes1(): NCollection_List_TopoDS_Shape;

// returns list of faulty shapes for tool
GetFaultyShapes2(): NCollection_List_TopoDS_Shape;

// set status of faulty
SetCheckStatus(TheStatus: BOPAlgo_CheckStatus): void;

// gets status of faulty
GetCheckStatus(): BOPAlgo_CheckStatus;

// Sets max distance for the first shape
SetMaxDistance1(theDist: number): void;

// Sets max distance for the second shape
SetMaxDistance2(theDist: number): void;

// Sets the parameter for the first shape
SetMaxParameter1(thePar: number): void;

// Sets the parameter for the second shape
SetMaxParameter2(thePar: number): void;

// Returns the distance for the first shape
GetMaxDistance1(): number;

// Returns the distance for the second shape
GetMaxDistance2(): number;

// Returns the parameter for the fircst shape
GetMaxParameter1(): number;

// Returns the parameter for the second shape
GetMaxParameter2(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPAlgo_CheckStatus: typeof BOPAlgo_CheckStatus[keyof typeof BOPAlgo_CheckStatus]

// Checks the shape on self-interference
BOPAlgo_CheckerSI: declare class BOPAlgo_CheckerSI extends BOPAlgo_Algo

constructor

// The main method to implement the operation Providing the range allows to enable Progress indicator User break functionalities
Perform(theRange?: Message_ProgressRange): void;

// Sets the level of checking shape on self-interference
SetLevelOfCheck(theLevel: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The Enumeration describes an additional option for the algorithms in the Boolean Component such as General Fuse, Boolean operations, Section, Maker Volume, Splitter and Cells Builder algorithms
BOPAlgo_GlueEnum: typeof BOPAlgo_GlueEnum[keyof typeof BOPAlgo_GlueEnum]

// {@link BOPAlgo_MakeConnected`BOPAlgo_MakeConnected`} is the algorithm for making the touching shapes connected or glued, i.e
BOPAlgo_MakeConnected: declare class BOPAlgo_MakeConnected extends BOPAlgo_Options

constructor

SetArguments(theArgs: NCollection_List_TopoDS_Shape): void;

AddArgument(theS: TopoDS_Shape): void;

Arguments(): NCollection_List_TopoDS_Shape;

Perform(): void;

MakePeriodic(theParams: BOPAlgo_MakePeriodic_PeriodicityParams): void;

RepeatShape(theDirectionID: number, theTimes: number): void;

ClearRepetitions(): void;

PeriodicityTool(): BOPAlgo_MakePeriodic;

MaterialsOnPositiveSide(theS: TopoDS_Shape): NCollection_List_TopoDS_Shape;

MaterialsOnNegativeSide(theS: TopoDS_Shape): NCollection_List_TopoDS_Shape;

History(): BRepTools_History;

GetModified(theS: TopoDS_Shape): NCollection_List_TopoDS_Shape;

GetOrigins(theS: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Shape(): TopoDS_Shape;

PeriodicShape(): TopoDS_Shape;

// Clears all warnings and errors, and any data cached by the algorithm
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link BOPAlgo_MakePeriodic`BOPAlgo_MakePeriodic`} is the tool for making an arbitrary shape periodic in 3D space in specified directions
BOPAlgo_MakePeriodic: declare class BOPAlgo_MakePeriodic extends BOPAlgo_Options

constructor

SetShape(theShape: TopoDS_Shape): void;

SetPeriodicityParameters(theParams: BOPAlgo_MakePeriodic_PeriodicityParams): void;

PeriodicityParameters(): BOPAlgo_MakePeriodic_PeriodicityParams;

MakePeriodic(theDirectionID: number, theIsPeriodic: boolean, thePeriod?: number): void;

IsPeriodic(theDirectionID: number): boolean;

Period(theDirectionID: number): number;

MakeXPeriodic(theIsPeriodic: boolean, thePeriod?: number): void;

IsXPeriodic(): boolean;

XPeriod(): number;

MakeYPeriodic(theIsPeriodic: boolean, thePeriod?: number): void;

IsYPeriodic(): boolean;

YPeriod(): number;

MakeZPeriodic(theIsPeriodic: boolean, thePeriod?: number): void;

IsZPeriodic(): boolean;

ZPeriod(): number;

SetTrimmed(theDirectionID: number, theIsTrimmed: boolean, theFirst?: number): void;

IsInputTrimmed(theDirectionID: number): boolean;

PeriodFirst(theDirectionID: number): number;

SetXTrimmed(theIsTrimmed: boolean, theFirst?: boolean): void;

IsInputXTrimmed(): boolean;

XPeriodFirst(): number;

SetYTrimmed(theIsTrimmed: boolean, theFirst?: boolean): void;

IsInputYTrimmed(): boolean;

YPeriodFirst(): number;

SetZTrimmed(theIsTrimmed: boolean, theFirst?: boolean): void;

IsInputZTrimmed(): boolean;

ZPeriodFirst(): number;

Perform(): void;

RepeatShape(theDirectionID: number, theTimes: number): TopoDS_Shape;

XRepeat(theTimes: number): TopoDS_Shape;

YRepeat(theTimes: number): TopoDS_Shape;

ZRepeat(theTimes: number): TopoDS_Shape;

RepeatedShape(): TopoDS_Shape;

ClearRepetitions(): void;

Shape(): TopoDS_Shape;

GetTwins(theS: TopoDS_Shape): NCollection_List_TopoDS_Shape;

History(): BRepTools_History;

// Clears all warnings and errors, and any data cached by the algorithm
Clear(): void;

static ToDirectionID(theDirectionID: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPAlgo_MakePeriodic_PeriodicityParams: declare class BOPAlgo_MakePeriodic_PeriodicityParams

constructor

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The algorithm is to build solids from set of shapes
BOPAlgo_MakerVolume: declare class BOPAlgo_MakerVolume extends BOPAlgo_Builder

constructor

// Clears the data
Clear(): void;

// Sets the flag myIntersect
SetIntersect(bIntersect: boolean): void;

// Returns the flag <myIntersect>
IsIntersect(): boolean;

// Returns the solid box <mySBox>
Box(): TopoDS_Solid;

// Returns the processed faces <myFaces>
Faces(): NCollection_List_TopoDS_Shape;

// Defines the preventing of addition of internal for solid parts into the result
SetAvoidInternalShapes(theAvoidInternal: boolean): void;

// Returns the AvoidInternalShapes flag
IsAvoidInternalShapes(): boolean;

// Performs the operation
Perform(theRange?: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPAlgo_Operation: typeof BOPAlgo_Operation[keyof typeof BOPAlgo_Operation]

// The class provides the following options for the algorithms in Boolean Component
BOPAlgo_Options: declare class BOPAlgo_Options

constructor

// Returns allocator
Allocator(): NCollection_BaseAllocator;

// Clears all warnings and errors, and any data cached by the algorithm
Clear(): void;

AddError(theAlert: Message_Alert): void;

AddWarning(theAlert: Message_Alert): void;

HasErrors(): boolean;

HasError(theType: Standard_Type): boolean;

HasWarnings(): boolean;

HasWarning(theType: Standard_Type): boolean;

GetReport(): Message_Report;

ClearWarnings(): void;

static GetParallelMode(): boolean;

static SetParallelMode(theNewMode: boolean): void;

SetRunParallel(theFlag: boolean): void;

RunParallel(): boolean;

SetFuzzyValue(theFuzz: number): void;

FuzzyValue(): number;

SetUseOBB(theUseOBB: boolean): void;

UseOBB(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The RemoveFeatures algorithm is intended for reconstruction of the shape by removal of the unwanted parts from it
BOPAlgo_RemoveFeatures: declare class BOPAlgo_RemoveFeatures extends BOPAlgo_BuilderShape

constructor

SetShape(theShape: TopoDS_Shape): void;

InputShape(): TopoDS_Shape;

AddFaceToRemove(theFace: TopoDS_Shape): void;

AddFacesToRemove(theFaces: NCollection_List_TopoDS_Shape): void;

FacesToRemove(): NCollection_List_TopoDS_Shape;

// The main method to implement the operation Providing the range allows to enable Progress indicator User break functionalities
Perform(theRange?: Message_ProgressRange): void;

// Clears all warnings and errors, and any data cached by the algorithm
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The algorithm to build a Section between the arguments
BOPAlgo_Section: declare class BOPAlgo_Section extends BOPAlgo_Builder

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class is a container of the flags used by intersection algorithm
BOPAlgo_SectionAttribute: declare class BOPAlgo_SectionAttribute

constructor

// Sets the Approximation flag
Approximation(theApprox: boolean): void;
Approximation(): boolean;
Approximation(theApprox: boolean): void;
Approximation(): boolean;

// Sets the PCurveOnS1 flag
PCurveOnS1(thePCurveOnS1: boolean): void;
PCurveOnS1(): boolean;
PCurveOnS1(thePCurveOnS1: boolean): void;
PCurveOnS1(): boolean;

// Sets the PCurveOnS2 flag
PCurveOnS2(thePCurveOnS2: boolean): void;
PCurveOnS2(): boolean;
PCurveOnS2(thePCurveOnS2: boolean): void;
PCurveOnS2(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class provides the splitting of the set of connected faces on separate loops
BOPAlgo_ShellSplitter: declare class BOPAlgo_ShellSplitter extends BOPAlgo_Algo

constructor

// adds a face <theS> to process
AddStartElement(theS: TopoDS_Shape): void;

// return the faces to process
StartElements(): NCollection_List_TopoDS_Shape;

// performs the algorithm
Perform(theRange?: Message_ProgressRange): void;

// returns the loops
Shells(): NCollection_List_TopoDS_Shape;

static SplitBlock(theCB: BOPTools_ConnexityBlock): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The **Splitter algorithm** is the algorithm for splitting a group of arbitrary shapes by the other group of arbitrary shapes
BOPAlgo_Splitter: declare class BOPAlgo_Splitter extends BOPAlgo_ToolsProvider

constructor

// Performs the operation
Perform(theRange?: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides tools used in the intersection part of Boolean operations
BOPAlgo_Tools: declare class BOPAlgo_Tools

constructor

// Fills the map with the connected entities
static FillMap(thePB1: BOPDS_PaveBlock, theF: number, theMILI: NCollection_IndexedDataMap_handle_BOPDS_PaveBlock_NCollection_List_int, theAllocator: NCollection_BaseAllocator): void;
// theMILI: Mutated in place

static ComputeToleranceOfCB(theCB: BOPDS_CommonBlock, theDS: BOPDS_DS, theContext: IntTools_Context): number;

// Creates planar wires from the given edges
static EdgesToWires(theEdges: TopoDS_Shape, theWires: TopoDS_Shape, theShared: boolean, theAngTol: number): number;
// theWires: Mutated in place

// Creates planar faces from given planar wires
static WiresToFaces(theWires: TopoDS_Shape, theFaces: TopoDS_Shape, theAngTol: number): boolean;
// theFaces: Mutated in place

// Finds chains of intersecting vertices
static IntersectVertices(theVertices: NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher, theFuzzyValue: number, theChains: NCollection_List_NCollection_List_TopoDS_Shape): void;
// theChains: Mutated in place

// Classifies the faces <theFaces> relatively solids <theSolids>
static ClassifyFaces(theFaces: NCollection_List_TopoDS_Shape, theSolids: NCollection_List_TopoDS_Shape, theRunParallel: boolean, theInParts: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theShapeBoxMap: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher, theSolidsIF: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): { theContext: IntTools_Context; [Symbol.dispose](): void };
// theInParts: Mutated in place

// Classifies the given parts relatively the given solids and fills the solids with the parts classified as INTERNAL
static FillInternals(theSolids: NCollection_List_TopoDS_Shape, theParts: NCollection_List_TopoDS_Shape, theImages: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theContext: IntTools_Context): void;
// theSolids: The solids to put internals to
// theParts: The parts to classify relatively solids
// theImages: Possible images of the parts that has to be classified
// theContext: cached geometrical tools to speed-up classifications

// Computes the transformation needed to move the objects to the given point to increase the quality of computations
static TrsfToPoint(theBox1: Bnd_Box, theBox2: Bnd_Box, theTrsf: gp_Trsf, thePoint: gp_Pnt, theCriteria: number): boolean;
// theBox1: the AABB of the first object
// theBox2: the AABB of the second object
// theTrsf: the computed transformation Mutated in place
// thePoint: the Point to compute transformation to
// theCriteria: the Criteria to check whether thranformation is required

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class providing API to operate tool arguments
BOPAlgo_ToolsProvider: declare class BOPAlgo_ToolsProvider extends BOPAlgo_Builder

constructor

// Clears internal fields and arguments
Clear(): void;

// Adds Tool argument of the operation
AddTool(theShape: TopoDS_Shape): void;

// Adds the Tool arguments of the operation
SetTools(theShapes: NCollection_List_TopoDS_Shape): void;

// Returns the Tool arguments of the operation
Tools(): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPAlgo_WireEdgeSet: declare class BOPAlgo_WireEdgeSet

constructor

Clear(): void;

SetFace(aF: TopoDS_Face): void;

Face(): TopoDS_Face;

AddStartElement(sS: TopoDS_Shape): void;

StartElements(): NCollection_List_TopoDS_Shape;

AddShape(sS: TopoDS_Shape): void;

Shapes(): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class is to build loops from the given set of edges
BOPAlgo_WireSplitter: declare class BOPAlgo_WireSplitter extends BOPAlgo_Algo

constructor

SetWES(theWES: BOPAlgo_WireEdgeSet): void;

WES(): BOPAlgo_WireEdgeSet;

// Sets the context for the algorithm
SetContext(theContext: IntTools_Context): void;

// Returns the context
Context(): IntTools_Context;

// The main method to implement the operation Providing the range allows to enable Progress indicator User break functionalities
Perform(theRange?: Message_ProgressRange): void;

static MakeWire(theLE: NCollection_List_TopoDS_Shape, theW: TopoDS_Wire): void;

static SplitBlock(theF: TopoDS_Face, theCB: BOPTools_ConnexityBlock, theContext: IntTools_Context): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPAlgo_EdgeInfo: declare class BOPAlgo_EdgeInfo

constructor

SetEdge(theE: TopoDS_Edge): void;

Edge(): TopoDS_Edge;

SetPassed(theFlag: boolean): void;

Passed(): boolean;

SetInFlag(theFlag: boolean): void;

IsIn(): boolean;

SetAngle(theAngle: number): void;

Angle(): number;

IsInside(): boolean;

SetIsInside(theIsInside: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPAlgo_ListOfCheckResult: NCollection_List_BOPAlgo_CheckResult
