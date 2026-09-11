# libcascade — BRepAlgoAPI

10 top-level symbols. Signatures are verbatim typescript.

BRepAlgoAPI_Algo: declare class BRepAlgoAPI_Algo extends BRepBuilderAPI_MakeShape

Shape(): TopoDS_Shape;

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

delete(): void;

[Symbol.dispose](): void;

BRepAlgoAPI_BooleanOperation: declare class BRepAlgoAPI_BooleanOperation extends BRepAlgoAPI_BuilderAlgo

constructor

Shape1(): TopoDS_Shape;

Shape2(): TopoDS_Shape;

SetTools(theLS: NCollection_List_TopoDS_Shape): void;

Tools(): NCollection_List_TopoDS_Shape;

SetOperation(theBOP: BOPAlgo_Operation): void;

Operation(): BOPAlgo_Operation;

Build(theRange?: Message_ProgressRange): void;

delete(): void;

[Symbol.dispose](): void;

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

Build(theRange?: Message_ProgressRange): void;

SimplifyResult(theUnifyEdges?: boolean, theUnifyFaces?: boolean, theAngularTol?: number): void;

Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

IsDeleted(S: TopoDS_Shape): boolean;

HasModified(): boolean;

HasGenerated(): boolean;

HasDeleted(): boolean;

SetToFillHistory(theHistFlag: boolean): void;

HasHistory(): boolean;

SectionEdges(): NCollection_List_TopoDS_Shape;

Builder(): BOPAlgo_Builder;

History(): BRepTools_History;

delete(): void;

[Symbol.dispose](): void;

BRepAlgoAPI_Check: declare class BRepAlgoAPI_Check extends BOPAlgo_Options

constructor

SetData(theS: TopoDS_Shape, bTestSE: boolean, bTestSI: boolean): void;
SetData(theS1: TopoDS_Shape, theS2: TopoDS_Shape, theOp: BOPAlgo_Operation, bTestSE: boolean, bTestSI: boolean): void;
SetData(theS: TopoDS_Shape, bTestSE: boolean, bTestSI: boolean): void;
SetData(theS1: TopoDS_Shape, theS2: TopoDS_Shape, theOp: BOPAlgo_Operation, bTestSE: boolean, bTestSI: boolean): void;

Perform(theRange?: Message_ProgressRange): void;

IsValid(): boolean;

Result(): NCollection_List_BOPAlgo_CheckResult;

delete(): void;

[Symbol.dispose](): void;

BRepAlgoAPI_Common: declare class BRepAlgoAPI_Common extends BRepAlgoAPI_BooleanOperation

constructor

delete(): void;

[Symbol.dispose](): void;

BRepAlgoAPI_Cut: declare class BRepAlgoAPI_Cut extends BRepAlgoAPI_BooleanOperation

constructor

delete(): void;

[Symbol.dispose](): void;

BRepAlgoAPI_Defeaturing: declare class BRepAlgoAPI_Defeaturing extends BRepAlgoAPI_Algo

constructor

SetShape(theShape: TopoDS_Shape): void;

InputShape(): TopoDS_Shape;

AddFaceToRemove(theFace: TopoDS_Shape): void;

AddFacesToRemove(theFaces: NCollection_List_TopoDS_Shape): void;

FacesToRemove(): NCollection_List_TopoDS_Shape;

Build(theRange?: Message_ProgressRange): void;

SetToFillHistory(theFlag: boolean): void;

HasHistory(): boolean;

Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

IsDeleted(S: TopoDS_Shape): boolean;

HasModified(): boolean;

HasGenerated(): boolean;

HasDeleted(): boolean;

History(): BRepTools_History;

delete(): void;

[Symbol.dispose](): void;

BRepAlgoAPI_Fuse: declare class BRepAlgoAPI_Fuse extends BRepAlgoAPI_BooleanOperation

constructor

delete(): void;

[Symbol.dispose](): void;

BRepAlgoAPI_Section: declare class BRepAlgoAPI_Section extends BRepAlgoAPI_BooleanOperation

constructor

Init1(S1: TopoDS_Shape): void;
Init1(Pl: gp_Pln): void;
Init1(Sf: Geom_Surface): void;
Init1(S1: TopoDS_Shape): void;
Init1(Pl: gp_Pln): void;
Init1(Sf: Geom_Surface): void;
Init1(S1: TopoDS_Shape): void;
Init1(Pl: gp_Pln): void;
Init1(Sf: Geom_Surface): void;

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

ComputePCurveOn1(B: boolean): void;

ComputePCurveOn2(B: boolean): void;

Build(theRange?: Message_ProgressRange): void;

HasAncestorFaceOn1(E: TopoDS_Shape, F: TopoDS_Shape): boolean;

HasAncestorFaceOn2(E: TopoDS_Shape, F: TopoDS_Shape): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepAlgoAPI_Splitter: declare class BRepAlgoAPI_Splitter extends BRepAlgoAPI_BuilderAlgo

constructor

SetTools(theLS: NCollection_List_TopoDS_Shape): void;

Tools(): NCollection_List_TopoDS_Shape;

Build(theRange?: Message_ProgressRange): void;

delete(): void;

[Symbol.dispose](): void;
