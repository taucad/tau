# libcascade — XSAlgo

2 top-level symbols. Signatures are verbatim typescript.

XSAlgo: declare class XSAlgo

  // XSAlgo.constructor (constructor)
  constructor();

  // XSAlgo.Init (method)
  static Init(): void;

  // XSAlgo.SetAlgoContainer (method)
  static SetAlgoContainer(aContainer: XSAlgo_AlgoContainer): void;

  // XSAlgo.AlgoContainer (method)
  static AlgoContainer(): XSAlgo_AlgoContainer;

  // XSAlgo.delete (method)
  delete(): void;

  // XSAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSAlgo_AlgoContainer: declare class XSAlgo_AlgoContainer extends Standard_Transient

  // XSAlgo_AlgoContainer.constructor (constructor)
  constructor();

  // XSAlgo_AlgoContainer.PrepareForTransfer (method)
  PrepareForTransfer(): void;

  // XSAlgo_AlgoContainer.ProcessShape (method)
  ProcessShape(theShape: TopoDS_Shape, thePrec: number, theMaxTol: number, thePrscfile: string, thePseq: string, theProgress: Message_ProgressRange, theNonManifold: boolean, theDetailingLevel: TopAbs_ShapeEnum): { returnValue: TopoDS_Shape; theInfo: Standard_Transient; [Symbol.dispose](): void };

  // XSAlgo_AlgoContainer.CheckPCurve (method)
  CheckPCurve(theEdge: TopoDS_Edge, theFace: TopoDS_Face, thePrecision: number, theIsSeam: boolean): boolean;

  // XSAlgo_AlgoContainer.MergeTransferInfo (method)
  MergeTransferInfo(TP: Transfer_TransientProcess, info: Standard_Transient, startTPitem: number): void;
  MergeTransferInfo(FP: Transfer_FinderProcess, info: Standard_Transient): void;

  // XSAlgo_AlgoContainer.get_type_name (method)
  static get_type_name(): string;

  // XSAlgo_AlgoContainer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XSAlgo_AlgoContainer.DynamicType (method)
  DynamicType(): Standard_Type;

  // XSAlgo_AlgoContainer.delete (method)
  delete(): void;

  // XSAlgo_AlgoContainer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
