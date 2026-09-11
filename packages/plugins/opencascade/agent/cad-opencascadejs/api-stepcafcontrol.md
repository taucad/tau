# libcascade — STEPCAFControl

5 top-level symbols. Signatures are verbatim typescript.

STEPCAFControl_ActorWrite: declare class STEPCAFControl_ActorWrite extends STEPControl_ActorWrite

constructor

IsAssembly(theModel: StepData_StepModel, S: TopoDS_Shape): boolean;

SetStdMode(stdmode?: boolean): void;

ClearMap(): void;

RegisterAssembly(S: TopoDS_Shape): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPCAFControl_Controller: declare class STEPCAFControl_Controller extends STEPControl_Controller

constructor

static Init(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPCAFControl_ExternFile: declare class STEPCAFControl_ExternFile extends Standard_Transient

constructor

SetWS(WS: XSControl_WorkSession): void;

GetWS(): XSControl_WorkSession;

SetLoadStatus(stat: IFSelect_ReturnStatus): void;

GetLoadStatus(): IFSelect_ReturnStatus;

SetTransferStatus(isok: boolean): void;

GetTransferStatus(): boolean;

SetWriteStatus(stat: IFSelect_ReturnStatus): void;

GetWriteStatus(): IFSelect_ReturnStatus;

SetName(name: TCollection_HAsciiString): void;

GetName(): TCollection_HAsciiString;

SetLabel(L: TDF_Label): void;

GetLabel(): TDF_Label;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPCAFControl_Reader: declare class STEPCAFControl_Reader

constructor

Init(WS: XSControl_WorkSession, scratch?: boolean): void;

ReadFile(theFileName: string): IFSelect_ReturnStatus;

NbRootsForTransfer(): number;

TransferOneRoot(num: number, doc: TDocStd_Document, theProgress?: Message_ProgressRange): boolean;

Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

Perform(filename: TCollection_AsciiString, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(filename: string, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(filename: TCollection_AsciiString, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(filename: string, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

ExternFiles(): NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile;

ExternFile(name: string): { returnValue: boolean; ef: STEPCAFControl_ExternFile; [Symbol.dispose](): void };

ChangeReader(): STEPControl_Reader;

Reader(): STEPControl_Reader;

static FindInstance(NAUO: StepRepr_NextAssemblyUsageOccurrence, STool: XCAFDoc_ShapeTool, Tool: STEPConstruct_Tool, ShapeLabelMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher): TDF_Label;

SetColorMode(colormode: boolean): void;

GetColorMode(): boolean;

SetNameMode(namemode: boolean): void;

GetNameMode(): boolean;

SetLayerMode(layermode: boolean): void;

GetLayerMode(): boolean;

SetPropsMode(propsmode: boolean): void;

GetPropsMode(): boolean;

SetMetaMode(theMetaMode: boolean): void;

GetMetaMode(): boolean;

SetProductMetaMode(theProductMetaMode: boolean): void;

GetProductMetaMode(): boolean;

SetSHUOMode(shuomode: boolean): void;

GetSHUOMode(): boolean;

SetGDTMode(gdtmode: boolean): void;

GetGDTMode(): boolean;

SetMatMode(matmode: boolean): void;

GetMatMode(): boolean;

SetViewMode(viewmode: boolean): void;

GetViewMode(): boolean;

GetShapeLabelMap(): NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher;

SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

SetShapeProcessFlags(theFlags: any): void;

GetShapeProcessFlags(): [any, boolean];

delete(): void;

[Symbol.dispose](): void;

STEPCAFControl_Writer: declare class STEPCAFControl_Writer

constructor

Init(theWS: XSControl_WorkSession, theScratch?: boolean): void;

Write(theFileName: string): IFSelect_ReturnStatus;

Transfer(theDoc: TDocStd_Document, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabel: TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabelSeq: NCollection_Sequence_TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theDoc: TDocStd_Document, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabel: TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabelSeq: NCollection_Sequence_TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theDoc: TDocStd_Document, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabel: TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabelSeq: NCollection_Sequence_TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;

Perform(theDoc: TDocStd_Document, theFileName: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
Perform(theDoc: TDocStd_Document, theFileName: string, theProgress: Message_ProgressRange): boolean;
Perform(theDoc: TDocStd_Document, theFileName: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
Perform(theDoc: TDocStd_Document, theFileName: string, theProgress: Message_ProgressRange): boolean;

ExternFiles(): NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile;

ExternFile(theLabel: TDF_Label): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };
ExternFile(theName: string): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };
ExternFile(theLabel: TDF_Label): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };
ExternFile(theName: string): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };

ChangeWriter(): STEPControl_Writer;

Writer(): STEPControl_Writer;

SetColorMode(theColorMode: boolean): void;

GetColorMode(): boolean;

SetNameMode(theNameMode: boolean): void;

GetNameMode(): boolean;

SetLayerMode(theLayerMode: boolean): void;

GetLayerMode(): boolean;

SetPropsMode(thePropsMode: boolean): void;

GetPropsMode(): boolean;

SetMetadataMode(theMetadataMode: boolean): void;

GetMetadataMode(): boolean;

SetSHUOMode(theSHUOMode: boolean): void;

GetSHUOMode(): boolean;

SetDimTolMode(theDimTolMode: boolean): void;

GetDimTolMode(): boolean;

SetMaterialMode(theMaterialMode: boolean): void;

GetMaterialMode(): boolean;

SetVisualMaterialMode(theVisualMaterialMode: boolean): void;

GetVisualMaterialMode(): boolean;

SetCleanDuplicates(theCleanDuplicates: boolean): void;

GetCleanDuplicates(): boolean;

SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

SetShapeProcessFlags(theFlags: any): void;

GetShapeProcessFlags(): [any, boolean];

delete(): void;

[Symbol.dispose](): void;
