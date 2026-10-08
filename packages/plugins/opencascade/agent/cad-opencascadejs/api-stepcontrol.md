# libcascade — STEPControl

6 top-level symbols. Signatures are verbatim typescript.

STEPControl_ActorRead: declare class STEPControl_ActorRead extends Transfer_ActorOfTransientProcess

  // STEPControl_ActorRead.constructor (constructor)
  constructor(theModel: Interface_InterfaceModel);

  // STEPControl_ActorRead.Recognize (method)
  Recognize(start: Standard_Transient): boolean;

  // STEPControl_ActorRead.Transfer (method)
  Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  // STEPControl_ActorRead.TransferShape (method)
  TransferShape(start: Standard_Transient, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors, isManifold?: boolean, theUseTrsf?: boolean, theProgress?: Message_ProgressRange): Transfer_Binder;

  // STEPControl_ActorRead.PrepareUnits (method)
  PrepareUnits(rep: StepRepr_Representation, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;

  // STEPControl_ActorRead.ResetUnits (method)
  ResetUnits(theModel: StepData_StepModel, theLocalFactors: StepData_Factors): void;

  // STEPControl_ActorRead.SetModel (method)
  SetModel(theModel: Interface_InterfaceModel): void;

  // STEPControl_ActorRead.ComputeTransformation (method)
  ComputeTransformation(Origin: StepGeom_Axis2Placement3d, Target: StepGeom_Axis2Placement3d, OrigContext: StepRepr_Representation, TargContext: StepRepr_Representation, TP: Transfer_TransientProcess, Trsf: gp_Trsf, theLocalFactors: StepData_Factors): boolean;

  // STEPControl_ActorRead.ComputeSRRWT (method)
  ComputeSRRWT(SRR: StepRepr_RepresentationRelationship, TP: Transfer_TransientProcess, Trsf: gp_Trsf, theLocalFactors: StepData_Factors): boolean;

  // STEPControl_ActorRead.get_type_name (method)
  static get_type_name(): string;

  // STEPControl_ActorRead.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPControl_ActorRead.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPControl_ActorRead.delete (method)
  delete(): void;

  // STEPControl_ActorRead.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPControl_ActorWrite: declare class STEPControl_ActorWrite extends Transfer_ActorOfFinderProcess

  // STEPControl_ActorWrite.constructor (constructor)
  constructor();

  // STEPControl_ActorWrite.Recognize (method)
  Recognize(start: Transfer_Finder): boolean;

  // STEPControl_ActorWrite.Transfer (method)
  Transfer(start: Transfer_Finder, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

  // STEPControl_ActorWrite.TransferSubShape (method)
  TransferSubShape(start: Transfer_Finder, SDR: StepShape_ShapeDefinitionRepresentation, FP: Transfer_FinderProcess, theLocalFactors: StepData_Factors, shapeGroup: NCollection_HSequence_TopoDS_Shape, isManifold: boolean, theProgress: Message_ProgressRange): { returnValue: Transfer_Binder; AX1: StepGeom_GeometricRepresentationItem; [Symbol.dispose](): void };

  // STEPControl_ActorWrite.TransferShape (method)
  TransferShape(start: Transfer_Finder, SDR: StepShape_ShapeDefinitionRepresentation, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, shapeGroup?: NCollection_HSequence_TopoDS_Shape, isManifold?: boolean, theProgress?: Message_ProgressRange): Transfer_Binder;

  // STEPControl_ActorWrite.TransferCompound (method)
  TransferCompound(start: Transfer_Finder, SDR: StepShape_ShapeDefinitionRepresentation, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange): Transfer_Binder;

  // STEPControl_ActorWrite.SetMode (method)
  SetMode(M: STEPControl_StepModelType): void;

  // STEPControl_ActorWrite.Mode (method)
  Mode(): STEPControl_StepModelType;

  // STEPControl_ActorWrite.SetGroupMode (method)
  SetGroupMode(mode: number): void;

  // STEPControl_ActorWrite.GroupMode (method)
  GroupMode(): number;

  // STEPControl_ActorWrite.SetTolerance (method)
  SetTolerance(Tol: number): void;

  // STEPControl_ActorWrite.IsAssembly (method)
  IsAssembly(theModel: StepData_StepModel, S: TopoDS_Shape): boolean;

  // STEPControl_ActorWrite.get_type_name (method)
  static get_type_name(): string;

  // STEPControl_ActorWrite.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPControl_ActorWrite.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPControl_ActorWrite.delete (method)
  delete(): void;

  // STEPControl_ActorWrite.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPControl_Controller: declare class STEPControl_Controller extends XSControl_Controller

  // STEPControl_Controller.constructor (constructor)
  constructor();

  // STEPControl_Controller.NewModel (method)
  NewModel(): Interface_InterfaceModel;

  // STEPControl_Controller.ActorRead (method)
  ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

  // STEPControl_Controller.Customise (method)
  Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

  // STEPControl_Controller.TransferWriteShape (method)
  TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  // STEPControl_Controller.Init (method)
  static Init(): boolean;

  // STEPControl_Controller.get_type_name (method)
  static get_type_name(): string;

  // STEPControl_Controller.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPControl_Controller.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPControl_Controller.delete (method)
  delete(): void;

  // STEPControl_Controller.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPControl_Reader: declare class STEPControl_Reader extends XSControl_Reader

  // STEPControl_Reader.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession, scratch?: boolean);

  // STEPControl_Reader.StepModel (method)
  StepModel(): StepData_StepModel;

  // STEPControl_Reader.ReadFile (method)
  ReadFile(filename: string): IFSelect_ReturnStatus;

  // STEPControl_Reader.TransferRoot (method)
  TransferRoot(num?: number, theProgress?: Message_ProgressRange): boolean;

  // STEPControl_Reader.NbRootsForTransfer (method)
  NbRootsForTransfer(): number;

  // STEPControl_Reader.FileUnits (method)
  FileUnits(theUnitLengthNames: NCollection_Sequence_TCollection_AsciiString, theUnitAngleNames: NCollection_Sequence_TCollection_AsciiString, theUnitSolidAngleNames: NCollection_Sequence_TCollection_AsciiString): void;

  // STEPControl_Reader.SetSystemLengthUnit (method)
  SetSystemLengthUnit(theLengthUnit: number): void;

  // STEPControl_Reader.SystemLengthUnit (method)
  SystemLengthUnit(): number;

  // STEPControl_Reader.delete (method)
  delete(): void;

  // STEPControl_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPControl_StepModelType: typeof STEPControl_StepModelType[keyof typeof STEPControl_StepModelType]

  readonly STEPControl_AsIs: 'STEPControl_AsIs'

  readonly STEPControl_ManifoldSolidBrep: 'STEPControl_ManifoldSolidBrep'

  readonly STEPControl_BrepWithVoids: 'STEPControl_BrepWithVoids'

  readonly STEPControl_FacetedBrep: 'STEPControl_FacetedBrep'

  readonly STEPControl_FacetedBrepAndBrepWithVoids: 'STEPControl_FacetedBrepAndBrepWithVoids'

  readonly STEPControl_ShellBasedSurfaceModel: 'STEPControl_ShellBasedSurfaceModel'

  readonly STEPControl_GeometricCurveSet: 'STEPControl_GeometricCurveSet'

  readonly STEPControl_Hybrid: 'STEPControl_Hybrid'

STEPControl_Writer: declare class STEPControl_Writer

  // STEPControl_Writer.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession, scratch?: boolean);

  // STEPControl_Writer.SetTolerance (method)
  SetTolerance(Tol: number): void;

  // STEPControl_Writer.UnsetTolerance (method)
  UnsetTolerance(): void;

  // STEPControl_Writer.SetWS (method)
  SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

  // STEPControl_Writer.WS (method)
  WS(): XSControl_WorkSession;

  // STEPControl_Writer.Model (method)
  Model(newone?: boolean): StepData_StepModel;

  // STEPControl_Writer.Transfer (method)
  Transfer(sh: TopoDS_Shape, mode: STEPControl_StepModelType, compgraph: boolean, theProgress: Message_ProgressRange): IFSelect_ReturnStatus;

  // STEPControl_Writer.Write (method)
  Write(theFileName: string): IFSelect_ReturnStatus;

  // STEPControl_Writer.PrintStatsTransfer (method)
  PrintStatsTransfer(what: number, mode?: number): void;

  // STEPControl_Writer.CleanDuplicateEntities (method)
  CleanDuplicateEntities(): void;

  // STEPControl_Writer.SetShapeFixParameters (method)
  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // STEPControl_Writer.GetShapeFixParameters (method)
  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // STEPControl_Writer.SetShapeProcessFlags (method)
  SetShapeProcessFlags(theFlags: any): void;

  // STEPControl_Writer.GetShapeProcessFlags (method)
  GetShapeProcessFlags(): [any, boolean];

  // STEPControl_Writer.delete (method)
  delete(): void;

  // STEPControl_Writer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
