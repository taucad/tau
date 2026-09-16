# libcascade — STEPControl

6 top-level symbols. Signatures are verbatim typescript.

STEPControl_ActorRead: declare class STEPControl_ActorRead extends Transfer_ActorOfTransientProcess

  constructor

  Recognize(start: Standard_Transient): boolean;

  Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  TransferShape(start: Standard_Transient, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors, isManifold?: boolean, theUseTrsf?: boolean, theProgress?: Message_ProgressRange): Transfer_Binder;

  PrepareUnits(rep: StepRepr_Representation, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;

  ResetUnits(theModel: StepData_StepModel, theLocalFactors: StepData_Factors): void;

  SetModel(theModel: Interface_InterfaceModel): void;

  ComputeTransformation(Origin: StepGeom_Axis2Placement3d, Target: StepGeom_Axis2Placement3d, OrigContext: StepRepr_Representation, TargContext: StepRepr_Representation, TP: Transfer_TransientProcess, Trsf: gp_Trsf, theLocalFactors: StepData_Factors): boolean;

  ComputeSRRWT(SRR: StepRepr_RepresentationRelationship, TP: Transfer_TransientProcess, Trsf: gp_Trsf, theLocalFactors: StepData_Factors): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

STEPControl_ActorWrite: declare class STEPControl_ActorWrite extends Transfer_ActorOfFinderProcess

  constructor

  Recognize(start: Transfer_Finder): boolean;

  Transfer(start: Transfer_Finder, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  TransferSubShape(start: Transfer_Finder, SDR: StepShape_ShapeDefinitionRepresentation, FP: Transfer_FinderProcess, theLocalFactors: StepData_Factors, shapeGroup: NCollection_HSequence_TopoDS_Shape, isManifold: boolean, theProgress: Message_ProgressRange): { returnValue: Transfer_Binder; AX1: StepGeom_GeometricRepresentationItem; [Symbol.dispose](): void };

  TransferShape(start: Transfer_Finder, SDR: StepShape_ShapeDefinitionRepresentation, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, shapeGroup?: NCollection_HSequence_TopoDS_Shape, isManifold?: boolean, theProgress?: Message_ProgressRange): Transfer_Binder;

  TransferCompound(start: Transfer_Finder, SDR: StepShape_ShapeDefinitionRepresentation, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange): Transfer_Binder;

  SetMode(M: STEPControl_StepModelType): void;

  Mode(): STEPControl_StepModelType;

  SetGroupMode(mode: number): void;

  GroupMode(): number;

  SetTolerance(Tol: number): void;

  IsAssembly(theModel: StepData_StepModel, S: TopoDS_Shape): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

STEPControl_Controller: declare class STEPControl_Controller extends XSControl_Controller

  constructor

  NewModel(): Interface_InterfaceModel;

  ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

  Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

  TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  static Init(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

STEPControl_Reader: declare class STEPControl_Reader extends XSControl_Reader

  constructor

  StepModel(): StepData_StepModel;

  ReadFile(filename: string): IFSelect_ReturnStatus;

  TransferRoot(num?: number, theProgress?: Message_ProgressRange): boolean;

  NbRootsForTransfer(): number;

  FileUnits(theUnitLengthNames: NCollection_Sequence_TCollection_AsciiString, theUnitAngleNames: NCollection_Sequence_TCollection_AsciiString, theUnitSolidAngleNames: NCollection_Sequence_TCollection_AsciiString): void;

  SetSystemLengthUnit(theLengthUnit: number): void;

  SystemLengthUnit(): number;

  delete(): void;

  [Symbol.dispose](): void;

STEPControl_StepModelType: typeof STEPControl_StepModelType[keyof typeof STEPControl_StepModelType]

STEPControl_Writer: declare class STEPControl_Writer

  constructor

  SetTolerance(Tol: number): void;

  UnsetTolerance(): void;

  SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

  WS(): XSControl_WorkSession;

  Model(newone?: boolean): StepData_StepModel;

  Transfer(sh: TopoDS_Shape, mode: STEPControl_StepModelType, compgraph: boolean, theProgress: Message_ProgressRange): IFSelect_ReturnStatus;

  Write(theFileName: string): IFSelect_ReturnStatus;

  PrintStatsTransfer(what: number, mode?: number): void;

  CleanDuplicateEntities(): void;

  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  SetShapeProcessFlags(theFlags: any): void;

  GetShapeProcessFlags(): [any, boolean];

  delete(): void;

  [Symbol.dispose](): void;
