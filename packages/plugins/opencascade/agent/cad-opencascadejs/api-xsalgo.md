# libcascade — XSAlgo

2 top-level symbols. Signatures are verbatim typescript.

XSAlgo: declare class XSAlgo

constructor

static Init(): void;

static SetAlgoContainer(aContainer: XSAlgo_AlgoContainer): void;

static AlgoContainer(): XSAlgo_AlgoContainer;

delete(): void;

[Symbol.dispose](): void;

XSAlgo_AlgoContainer: declare class XSAlgo_AlgoContainer extends Standard_Transient

constructor

PrepareForTransfer(): void;

ProcessShape(theShape: TopoDS_Shape, thePrec: number, theMaxTol: number, thePrscfile: string, thePseq: string, theProgress: Message_ProgressRange, theNonManifold: boolean, theDetailingLevel: TopAbs_ShapeEnum): { returnValue: TopoDS_Shape; theInfo: Standard_Transient; [Symbol.dispose](): void };

CheckPCurve(theEdge: TopoDS_Edge, theFace: TopoDS_Face, thePrecision: number, theIsSeam: boolean): boolean;

MergeTransferInfo(TP: Transfer_TransientProcess, info: Standard_Transient, startTPitem: number): void;
MergeTransferInfo(FP: Transfer_FinderProcess, info: Standard_Transient): void;
MergeTransferInfo(TP: Transfer_TransientProcess, info: Standard_Transient, startTPitem: number): void;
MergeTransferInfo(FP: Transfer_FinderProcess, info: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
