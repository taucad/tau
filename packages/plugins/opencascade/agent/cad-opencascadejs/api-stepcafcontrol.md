# libcascade — STEPCAFControl

5 top-level symbols. Signatures are verbatim typescript.

STEPCAFControl_ActorWrite: declare class STEPCAFControl_ActorWrite extends STEPControl_ActorWrite

  // STEPCAFControl_ActorWrite.constructor (constructor)
  constructor();

  // STEPCAFControl_ActorWrite.IsAssembly (method)
  IsAssembly(theModel: StepData_StepModel, S: TopoDS_Shape): boolean;

  // STEPCAFControl_ActorWrite.SetStdMode (method)
  SetStdMode(stdmode?: boolean): void;

  // STEPCAFControl_ActorWrite.ClearMap (method)
  ClearMap(): void;

  // STEPCAFControl_ActorWrite.RegisterAssembly (method)
  RegisterAssembly(S: TopoDS_Shape): void;

  // STEPCAFControl_ActorWrite.get_type_name (method)
  static get_type_name(): string;

  // STEPCAFControl_ActorWrite.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPCAFControl_ActorWrite.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPCAFControl_ActorWrite.delete (method)
  delete(): void;

  // STEPCAFControl_ActorWrite.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPCAFControl_Controller: declare class STEPCAFControl_Controller extends STEPControl_Controller

  // STEPCAFControl_Controller.constructor (constructor)
  constructor();

  // STEPCAFControl_Controller.Init (method)
  static Init(): boolean;

  // STEPCAFControl_Controller.get_type_name (method)
  static get_type_name(): string;

  // STEPCAFControl_Controller.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPCAFControl_Controller.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPCAFControl_Controller.delete (method)
  delete(): void;

  // STEPCAFControl_Controller.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPCAFControl_ExternFile: declare class STEPCAFControl_ExternFile extends Standard_Transient

  // STEPCAFControl_ExternFile.constructor (constructor)
  constructor();

  // STEPCAFControl_ExternFile.SetWS (method)
  SetWS(WS: XSControl_WorkSession): void;

  // STEPCAFControl_ExternFile.GetWS (method)
  GetWS(): XSControl_WorkSession;

  // STEPCAFControl_ExternFile.SetLoadStatus (method)
  SetLoadStatus(stat: IFSelect_ReturnStatus): void;

  // STEPCAFControl_ExternFile.GetLoadStatus (method)
  GetLoadStatus(): IFSelect_ReturnStatus;

  // STEPCAFControl_ExternFile.SetTransferStatus (method)
  SetTransferStatus(isok: boolean): void;

  // STEPCAFControl_ExternFile.GetTransferStatus (method)
  GetTransferStatus(): boolean;

  // STEPCAFControl_ExternFile.SetWriteStatus (method)
  SetWriteStatus(stat: IFSelect_ReturnStatus): void;

  // STEPCAFControl_ExternFile.GetWriteStatus (method)
  GetWriteStatus(): IFSelect_ReturnStatus;

  // STEPCAFControl_ExternFile.SetName (method)
  SetName(name: TCollection_HAsciiString): void;

  // STEPCAFControl_ExternFile.GetName (method)
  GetName(): TCollection_HAsciiString;

  // STEPCAFControl_ExternFile.SetLabel (method)
  SetLabel(L: TDF_Label): void;

  // STEPCAFControl_ExternFile.GetLabel (method)
  GetLabel(): TDF_Label;

  // STEPCAFControl_ExternFile.get_type_name (method)
  static get_type_name(): string;

  // STEPCAFControl_ExternFile.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPCAFControl_ExternFile.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPCAFControl_ExternFile.delete (method)
  delete(): void;

  // STEPCAFControl_ExternFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPCAFControl_Reader: declare class STEPCAFControl_Reader

  // STEPCAFControl_Reader.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession, scratch?: boolean);

  // STEPCAFControl_Reader.Init (method)
  Init(WS: XSControl_WorkSession, scratch?: boolean): void;

  // STEPCAFControl_Reader.ReadFile (method)
  ReadFile(theFileName: string): IFSelect_ReturnStatus;

  // STEPCAFControl_Reader.NbRootsForTransfer (method)
  NbRootsForTransfer(): number;

  // STEPCAFControl_Reader.TransferOneRoot (method)
  TransferOneRoot(num: number, doc: TDocStd_Document, theProgress?: Message_ProgressRange): boolean;

  // STEPCAFControl_Reader.Transfer (method)
  Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

  // STEPCAFControl_Reader.Perform (method)
  Perform(filename: TCollection_AsciiString, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
  Perform(filename: string, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

  // STEPCAFControl_Reader.ExternFiles (method)
  ExternFiles(): NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile;

  // STEPCAFControl_Reader.ExternFile (method)
  ExternFile(name: string): { returnValue: boolean; ef: STEPCAFControl_ExternFile; [Symbol.dispose](): void };

  // STEPCAFControl_Reader.ChangeReader (method)
  ChangeReader(): STEPControl_Reader;

  // STEPCAFControl_Reader.Reader (method)
  Reader(): STEPControl_Reader;

  // STEPCAFControl_Reader.FindInstance (method)
  static FindInstance(NAUO: StepRepr_NextAssemblyUsageOccurrence, STool: XCAFDoc_ShapeTool, Tool: STEPConstruct_Tool, ShapeLabelMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher): TDF_Label;

  // STEPCAFControl_Reader.SetColorMode (method)
  SetColorMode(colormode: boolean): void;

  // STEPCAFControl_Reader.GetColorMode (method)
  GetColorMode(): boolean;

  // STEPCAFControl_Reader.SetNameMode (method)
  SetNameMode(namemode: boolean): void;

  // STEPCAFControl_Reader.GetNameMode (method)
  GetNameMode(): boolean;

  // STEPCAFControl_Reader.SetLayerMode (method)
  SetLayerMode(layermode: boolean): void;

  // STEPCAFControl_Reader.GetLayerMode (method)
  GetLayerMode(): boolean;

  // STEPCAFControl_Reader.SetPropsMode (method)
  SetPropsMode(propsmode: boolean): void;

  // STEPCAFControl_Reader.GetPropsMode (method)
  GetPropsMode(): boolean;

  // STEPCAFControl_Reader.SetMetaMode (method)
  SetMetaMode(theMetaMode: boolean): void;

  // STEPCAFControl_Reader.GetMetaMode (method)
  GetMetaMode(): boolean;

  // STEPCAFControl_Reader.SetProductMetaMode (method)
  SetProductMetaMode(theProductMetaMode: boolean): void;

  // STEPCAFControl_Reader.GetProductMetaMode (method)
  GetProductMetaMode(): boolean;

  // STEPCAFControl_Reader.SetSHUOMode (method)
  SetSHUOMode(shuomode: boolean): void;

  // STEPCAFControl_Reader.GetSHUOMode (method)
  GetSHUOMode(): boolean;

  // STEPCAFControl_Reader.SetGDTMode (method)
  SetGDTMode(gdtmode: boolean): void;

  // STEPCAFControl_Reader.GetGDTMode (method)
  GetGDTMode(): boolean;

  // STEPCAFControl_Reader.SetMatMode (method)
  SetMatMode(matmode: boolean): void;

  // STEPCAFControl_Reader.GetMatMode (method)
  GetMatMode(): boolean;

  // STEPCAFControl_Reader.SetViewMode (method)
  SetViewMode(viewmode: boolean): void;

  // STEPCAFControl_Reader.GetViewMode (method)
  GetViewMode(): boolean;

  // STEPCAFControl_Reader.GetShapeLabelMap (method)
  GetShapeLabelMap(): NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher;

  // STEPCAFControl_Reader.SetShapeFixParameters (method)
  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // STEPCAFControl_Reader.GetShapeFixParameters (method)
  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // STEPCAFControl_Reader.SetShapeProcessFlags (method)
  SetShapeProcessFlags(theFlags: any): void;

  // STEPCAFControl_Reader.GetShapeProcessFlags (method)
  GetShapeProcessFlags(): [any, boolean];

  // STEPCAFControl_Reader.delete (method)
  delete(): void;

  // STEPCAFControl_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPCAFControl_Writer: declare class STEPCAFControl_Writer

  // STEPCAFControl_Writer.constructor (constructor)
  constructor();
  constructor(theWS: XSControl_WorkSession, theScratch?: boolean);

  // STEPCAFControl_Writer.Init (method)
  Init(theWS: XSControl_WorkSession, theScratch?: boolean): void;

  // STEPCAFControl_Writer.Write (method)
  Write(theFileName: string): IFSelect_ReturnStatus;

  // STEPCAFControl_Writer.Transfer (method)
  Transfer(theDoc: TDocStd_Document, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
  Transfer(theLabel: TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
  Transfer(theLabelSeq: NCollection_Sequence_TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;

  // STEPCAFControl_Writer.Perform (method)
  Perform(theDoc: TDocStd_Document, theFileName: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
  Perform(theDoc: TDocStd_Document, theFileName: string, theProgress: Message_ProgressRange): boolean;

  // STEPCAFControl_Writer.ExternFiles (method)
  ExternFiles(): NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile;

  // STEPCAFControl_Writer.ExternFile (method)
  ExternFile(theLabel: TDF_Label): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };
  ExternFile(theName: string): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };

  // STEPCAFControl_Writer.ChangeWriter (method)
  ChangeWriter(): STEPControl_Writer;

  // STEPCAFControl_Writer.Writer (method)
  Writer(): STEPControl_Writer;

  // STEPCAFControl_Writer.SetColorMode (method)
  SetColorMode(theColorMode: boolean): void;

  // STEPCAFControl_Writer.GetColorMode (method)
  GetColorMode(): boolean;

  // STEPCAFControl_Writer.SetNameMode (method)
  SetNameMode(theNameMode: boolean): void;

  // STEPCAFControl_Writer.GetNameMode (method)
  GetNameMode(): boolean;

  // STEPCAFControl_Writer.SetLayerMode (method)
  SetLayerMode(theLayerMode: boolean): void;

  // STEPCAFControl_Writer.GetLayerMode (method)
  GetLayerMode(): boolean;

  // STEPCAFControl_Writer.SetPropsMode (method)
  SetPropsMode(thePropsMode: boolean): void;

  // STEPCAFControl_Writer.GetPropsMode (method)
  GetPropsMode(): boolean;

  // STEPCAFControl_Writer.SetMetadataMode (method)
  SetMetadataMode(theMetadataMode: boolean): void;

  // STEPCAFControl_Writer.GetMetadataMode (method)
  GetMetadataMode(): boolean;

  // STEPCAFControl_Writer.SetSHUOMode (method)
  SetSHUOMode(theSHUOMode: boolean): void;

  // STEPCAFControl_Writer.GetSHUOMode (method)
  GetSHUOMode(): boolean;

  // STEPCAFControl_Writer.SetDimTolMode (method)
  SetDimTolMode(theDimTolMode: boolean): void;

  // STEPCAFControl_Writer.GetDimTolMode (method)
  GetDimTolMode(): boolean;

  // STEPCAFControl_Writer.SetMaterialMode (method)
  SetMaterialMode(theMaterialMode: boolean): void;

  // STEPCAFControl_Writer.GetMaterialMode (method)
  GetMaterialMode(): boolean;

  // STEPCAFControl_Writer.SetVisualMaterialMode (method)
  SetVisualMaterialMode(theVisualMaterialMode: boolean): void;

  // STEPCAFControl_Writer.GetVisualMaterialMode (method)
  GetVisualMaterialMode(): boolean;

  // STEPCAFControl_Writer.SetCleanDuplicates (method)
  SetCleanDuplicates(theCleanDuplicates: boolean): void;

  // STEPCAFControl_Writer.GetCleanDuplicates (method)
  GetCleanDuplicates(): boolean;

  // STEPCAFControl_Writer.SetShapeFixParameters (method)
  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // STEPCAFControl_Writer.GetShapeFixParameters (method)
  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // STEPCAFControl_Writer.SetShapeProcessFlags (method)
  SetShapeProcessFlags(theFlags: any): void;

  // STEPCAFControl_Writer.GetShapeProcessFlags (method)
  GetShapeProcessFlags(): [any, boolean];

  // STEPCAFControl_Writer.delete (method)
  delete(): void;

  // STEPCAFControl_Writer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
