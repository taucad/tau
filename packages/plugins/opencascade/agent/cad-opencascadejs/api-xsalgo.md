# libcascade — XSAlgo

2 top-level symbols. Signatures are verbatim typescript.

XSAlgo: declare class XSAlgo

constructor

// Provides initerface to the algorithms from Shape Healing and others for XSTEP processors
static Init(): void;

// Sets default AlgoContainer
static SetAlgoContainer(aContainer: XSAlgo_AlgoContainer): void;

// Returns default AlgoContainer
static AlgoContainer(): XSAlgo_AlgoContainer;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

XSAlgo_AlgoContainer: declare class XSAlgo_AlgoContainer extends Standard_Transient

constructor

// Performs actions necessary for preparing environment for transfer
PrepareForTransfer(): void;

// Does shape processing with specified tolerances
ProcessShape(theShape: TopoDS_Shape, thePrec: number, theMaxTol: number, thePrscfile: string, thePseq: string, theProgress: Message_ProgressRange, theNonManifold: boolean, theDetailingLevel: TopAbs_ShapeEnum): { returnValue: TopoDS_Shape; theInfo: Standard_Transient; [Symbol.dispose](): void };
// theShape: shape to process
// thePrec: basic precision and tolerance
// theMaxTol: maximum allowed tolerance
// thePrscfile: name of the resource file
// thePseq: name of the sequence of operators defined in the resource file for Shape Processing
// theProgress: progress indicator
// theNonManifold: flag to proceed with non-manifold topology
// theDetailingLevel: the lowest shape type to be processed, lower shapes are ignored

// Checks quality of pcurve of the edge on the given face, and corrects it if necessary
CheckPCurve(theEdge: TopoDS_Edge, theFace: TopoDS_Face, thePrecision: number, theIsSeam: boolean): boolean;

// Updates translation map (TP or FP) with information resulting from ShapeProcessing Parameter startTPitem can be used for optimisation, to restrict modifications to entities stored in TP starting from item startTPitem
MergeTransferInfo(TP: Transfer_TransientProcess, info: Standard_Transient, startTPitem: number): void;
MergeTransferInfo(FP: Transfer_FinderProcess, info: Standard_Transient): void;
MergeTransferInfo(TP: Transfer_TransientProcess, info: Standard_Transient, startTPitem: number): void;
MergeTransferInfo(FP: Transfer_FinderProcess, info: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
