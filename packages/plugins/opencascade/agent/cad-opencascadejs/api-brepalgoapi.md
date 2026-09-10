# libcascade — BRepAlgoAPI

10 top-level symbols. Signatures are verbatim typescript.

// Provides the root interface for the API algorithms
BRepAlgoAPI_Algo: declare class BRepAlgoAPI_Algo extends BRepBuilderAPI_MakeShape

// Returns a shape built by the shape construction algorithm
Shape(): TopoDS_Shape;

// Clears all warnings and errors, and any data cached by the algorithm
Clear(): void;

ClearWarnings(): void;

FuzzyValue(): number;

GetReport(): Message_Report;

HasError(theType: Standard_Type): boolean;

HasErrors(): boolean;

HasWarning(theType: Standard_Type): boolean;

HasWarnings(): boolean;

RunParallel(): boolean;

SetFuzzyValue(theFuzz: number): void;

SetRunParallel(theFlag: boolean): void;

SetUseOBB(theUseOBB: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The root API class for performing Boolean Operations on arbitrary shapes
BRepAlgoAPI_BooleanOperation: declare class BRepAlgoAPI_BooleanOperation extends BRepAlgoAPI_BuilderAlgo

constructor

Shape1(): TopoDS_Shape;

Shape2(): TopoDS_Shape;

SetTools(theLS: NCollection_List_TopoDS_Shape): void;

Tools(): NCollection_List_TopoDS_Shape;

SetOperation(theBOP: BOPAlgo_Operation): void;

Operation(): BOPAlgo_Operation;

// This is called by `Shape()`
Build(theRange?: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class contains API level of the General Fuse algorithm
BRepAlgoAPI_BuilderAlgo: declare class BRepAlgoAPI_BuilderAlgo extends BRepAlgoAPI_Algo

constructor

SetArguments(theLS: NCollection_List_TopoDS_Shape): void;

Arguments(): NCollection_List_TopoDS_Shape;

SetNonDestructive(theFlag: boolean): void;

NonDestructive(): boolean;

SetGlue(theGlue: BOPAlgo_GlueEnum): void;

Glue(): BOPAlgo_GlueEnum;

SetCheckInverted(theCheck: boolean): void;

CheckInverted(): boolean;

// This is called by `Shape()`
Build(theRange?: Message_ProgressRange): void;

SimplifyResult(theUnifyEdges?: boolean, theUnifyFaces?: boolean, theAngularTol?: number): void;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns true if the shape S has been deleted
IsDeleted(S: TopoDS_Shape): boolean;

HasModified(): boolean;

HasGenerated(): boolean;

HasDeleted(): boolean;

SetToFillHistory(theHistFlag: boolean): void;

HasHistory(): boolean;

SectionEdges(): NCollection_List_TopoDS_Shape;

Builder(): BOPAlgo_Builder;

History(): BRepTools_History;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class Check provides a diagnostic tool for checking the validity of the single shape or couple of shapes
BRepAlgoAPI_Check: declare class BRepAlgoAPI_Check extends BOPAlgo_Options

constructor

SetData(theS: TopoDS_Shape, bTestSE: boolean, bTestSI: boolean): void;
SetData(theS1: TopoDS_Shape, theS2: TopoDS_Shape, theOp: BOPAlgo_Operation, bTestSE: boolean, bTestSI: boolean): void;
SetData(theS: TopoDS_Shape, bTestSE: boolean, bTestSI: boolean): void;
SetData(theS1: TopoDS_Shape, theS2: TopoDS_Shape, theOp: BOPAlgo_Operation, bTestSE: boolean, bTestSI: boolean): void;

Perform(theRange?: Message_ProgressRange): void;

IsValid(): boolean;

Result(): NCollection_List_BOPAlgo_CheckResult;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class provides Boolean common operation between arguments and tools (Boolean Intersection)
BRepAlgoAPI_Common: declare class BRepAlgoAPI_Common extends BRepAlgoAPI_BooleanOperation

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class Cut provides Boolean cut operation between arguments and tools (Boolean Subtraction)
BRepAlgoAPI_Cut: declare class BRepAlgoAPI_Cut extends BRepAlgoAPI_BooleanOperation

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The {@link BRepAlgoAPI_Defeaturing`BRepAlgoAPI_Defeaturing`} algorithm is the API algorithm intended for removal of the unwanted parts from the shape
BRepAlgoAPI_Defeaturing: declare class BRepAlgoAPI_Defeaturing extends BRepAlgoAPI_Algo

constructor

SetShape(theShape: TopoDS_Shape): void;

InputShape(): TopoDS_Shape;

AddFaceToRemove(theFace: TopoDS_Shape): void;

AddFacesToRemove(theFaces: NCollection_List_TopoDS_Shape): void;

FacesToRemove(): NCollection_List_TopoDS_Shape;

// This is called by `Shape()`
Build(theRange?: Message_ProgressRange): void;

SetToFillHistory(theFlag: boolean): void;

HasHistory(): boolean;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns the list of shapes generated from the shape
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns true if the shape S has been deleted
IsDeleted(S: TopoDS_Shape): boolean;

HasModified(): boolean;

HasGenerated(): boolean;

HasDeleted(): boolean;

History(): BRepTools_History;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class provides Boolean fusion operation between arguments and tools (Boolean Union)
BRepAlgoAPI_Fuse: declare class BRepAlgoAPI_Fuse extends BRepAlgoAPI_BooleanOperation

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The algorithm is to build a Section operation between arguments and tools
BRepAlgoAPI_Section: declare class BRepAlgoAPI_Section extends BRepAlgoAPI_BooleanOperation

constructor

// initialize the argument <S1> - argument Obsolete initialize the argument <Pl> - argument Obsolete initialize the argument <Sf> - argument Obsolete
Init1(S1: TopoDS_Shape): void;
Init1(Pl: gp_Pln): void;
Init1(Sf: Geom_Surface): void;
Init1(S1: TopoDS_Shape): void;
Init1(Pl: gp_Pln): void;
Init1(Sf: Geom_Surface): void;
Init1(S1: TopoDS_Shape): void;
Init1(Pl: gp_Pln): void;
Init1(Sf: Geom_Surface): void;

// initialize the tool <S2> - tool Obsolete initialize the tool <Pl> - tool Obsolete initialize the tool <Sf> - tool Obsolete
Init2(S2: TopoDS_Shape): void;
Init2(Pl: gp_Pln): void;
Init2(Sf: Geom_Surface): void;
Init2(S2: TopoDS_Shape): void;
Init2(Pl: gp_Pln): void;
Init2(Sf: Geom_Surface): void;
Init2(S2: TopoDS_Shape): void;
Init2(Pl: gp_Pln): void;
Init2(Sf: Geom_Surface): void;

Approximation(B: boolean): void;

// Indicates whether the P-Curve should be (or not) performed on the argument
ComputePCurveOn1(B: boolean): void;

// Indicates whether the P-Curve should be (or not) performed on the tool
ComputePCurveOn2(B: boolean): void;

// Performs the algorithm Filling interference Data Structure (if it is necessary) Building the result of the operation
Build(theRange?: Message_ProgressRange): void;

// get the face of the first part giving section edge <E>
HasAncestorFaceOn1(E: TopoDS_Shape, F: TopoDS_Shape): boolean;
// F: Mutated in place

// Identifies the ancestor faces of the intersection edge E resulting from the last computation performed in this framework, that is, the faces of the two original shapes on which the edge E lies
HasAncestorFaceOn2(E: TopoDS_Shape, F: TopoDS_Shape): boolean;
// F: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class contains API level of the **Splitter** algorithm, which allows splitting a group of arbitrary shapes by the other group of arbitrary shapes
BRepAlgoAPI_Splitter: declare class BRepAlgoAPI_Splitter extends BRepAlgoAPI_BuilderAlgo

constructor

SetTools(theLS: NCollection_List_TopoDS_Shape): void;

Tools(): NCollection_List_TopoDS_Shape;

// This is called by `Shape()`
Build(theRange?: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
