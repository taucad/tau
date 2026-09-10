# libcascade — STEPCAFControl

5 top-level symbols. Signatures are verbatim typescript.

// Extends ActorWrite from STEPControl by analysis of whether shape is assembly (based on information from DECAF)
STEPCAFControl_ActorWrite: declare class STEPCAFControl_ActorWrite extends STEPControl_ActorWrite

constructor

// Check whether shape S is assembly Returns True if shape is registered in assemblies map
IsAssembly(theModel: StepData_StepModel, S: TopoDS_Shape): boolean;
// S: Mutated in place

// Set standard mode of work In standard mode Actor (default) behaves exactly as its ancestor, also map is cleared
SetStdMode(stdmode?: boolean): void;

// Clears map of shapes registered as assemblies
ClearMap(): void;

// Registers shape to be written as assembly The shape should be {@link TopoDS_Compound `TopoDS_Compound`} (else does nothing)
RegisterAssembly(S: TopoDS_Shape): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)
STEPCAFControl_Controller: declare class STEPCAFControl_Controller extends STEPControl_Controller

constructor

// {@link Standard `Standard`} Initialisation
static Init(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class serving as container for data resulting from translation of external file
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a tool to read STEP file and put it into DECAF document
STEPCAFControl_Reader: declare class STEPCAFControl_Reader

constructor

// Clears the internal data structures and attaches to a new session Clears the session if it was not yet set for STEP
Init(WS: XSControl_WorkSession, scratch?: boolean): void;

// Loads a file and returns the read status Provided for use like single-file reader
ReadFile(theFileName: string): IFSelect_ReturnStatus;
// theFileName: file to open

// Returns number of roots recognized for transfer Shortcut for `Reader()`.`NbRootsForTransfer()`
NbRootsForTransfer(): number;

// Translates currently loaded STEP file into the document Returns True if succeeded, and False in case of fail Provided for use like single-file reader
TransferOneRoot(num: number, doc: TDocStd_Document, theProgress?: Message_ProgressRange): boolean;

// Translates currently loaded STEP file into the document Returns True if succeeded, and False in case of fail Provided for use like single-file reader
Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

// Translate STEP file given by filename into the document Return True if succeeded, and False in case of fail
Perform(filename: TCollection_AsciiString, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(filename: string, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(filename: TCollection_AsciiString, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(filename: string, doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

// Returns data on external files Returns Null handle if no external files are read
ExternFiles(): NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile;

// Returns data on external file by its name Returns False if no external file with given name is read
ExternFile(name: string): { returnValue: boolean; ef: STEPCAFControl_ExternFile; [Symbol.dispose](): void };

// Returns basic reader
ChangeReader(): STEPControl_Reader;

// Returns basic reader as const
Reader(): STEPControl_Reader;

// Returns label of instance of an assembly component corresponding to a given NAUO
static FindInstance(NAUO: StepRepr_NextAssemblyUsageOccurrence, STool: XCAFDoc_ShapeTool, Tool: STEPConstruct_Tool, ShapeLabelMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher): TDF_Label;

// Set ColorMode for indicate read Colors or not
SetColorMode(colormode: boolean): void;

GetColorMode(): boolean;

// Set NameMode for indicate read Name or not
SetNameMode(namemode: boolean): void;

GetNameMode(): boolean;

// Set LayerMode for indicate read Layers or not
SetLayerMode(layermode: boolean): void;

GetLayerMode(): boolean;

// PropsMode for indicate read Validation properties or not
SetPropsMode(propsmode: boolean): void;

GetPropsMode(): boolean;

// MetaMode for indicate read Metadata or not
SetMetaMode(theMetaMode: boolean): void;

GetMetaMode(): boolean;

// MetaMode for indicate whether to read Product Metadata or not
SetProductMetaMode(theProductMetaMode: boolean): void;

GetProductMetaMode(): boolean;

// Set SHUO mode for indicate write SHUO or not
SetSHUOMode(shuomode: boolean): void;

GetSHUOMode(): boolean;

// Set GDT mode for indicate write GDT or not
SetGDTMode(gdtmode: boolean): void;

GetGDTMode(): boolean;

// Set Material mode
SetMatMode(matmode: boolean): void;

GetMatMode(): boolean;

// Set View mode
SetViewMode(viewmode: boolean): void;

// Get View mode
GetViewMode(): boolean;

GetShapeLabelMap(): NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher;

// Sets parameters for shape processing
SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;
// theParameters: the parameters for shape processing

// Returns parameters for shape processing that was set by SetParameters() method
GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

// Sets flags defining operations to be performed on shapes
SetShapeProcessFlags(theFlags: any): void;
// theFlags: The flags defining operations to be performed on shapes

// Returns flags defining operations to be performed on shapes
GetShapeProcessFlags(): [any, boolean];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a tool to write DECAF document to the STEP file
STEPCAFControl_Writer: declare class STEPCAFControl_Writer

constructor

// Clears the internal data structures and attaches to a new session Clears the session if it was not yet set for STEP
Init(theWS: XSControl_WorkSession, theScratch?: boolean): void;

// Writes all the produced models into file In case of multimodel with extern references, filename will be a name of root file, all other files have names of corresponding parts Provided for use like single-file writer
Write(theFileName: string): IFSelect_ReturnStatus;

// Transfers a document (or single label) to a STEP model The mode of translation of shape is AsIs If multi is not null pointer, it switches to multifile mode (with external refs), and string pointed by <multi> gives prefix for names of extern files (can be empty string) Returns True if translation is OK
Transfer(theDoc: TDocStd_Document, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabel: TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabelSeq: NCollection_Sequence_TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theDoc: TDocStd_Document, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabel: TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabelSeq: NCollection_Sequence_TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theDoc: TDocStd_Document, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabel: TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;
Transfer(theLabelSeq: NCollection_Sequence_TDF_Label, theMode: STEPControl_StepModelType, theIsMulti: string, theProgress: Message_ProgressRange): boolean;

// Transfers a document and writes it to a STEP file Returns True if translation is OK
Perform(theDoc: TDocStd_Document, theFileName: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
Perform(theDoc: TDocStd_Document, theFileName: string, theProgress: Message_ProgressRange): boolean;
Perform(theDoc: TDocStd_Document, theFileName: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
Perform(theDoc: TDocStd_Document, theFileName: string, theProgress: Message_ProgressRange): boolean;

// Returns data on external files Returns Null handle if no external files are read
ExternFiles(): NCollection_DataMap_TCollection_AsciiString_handle_STEPCAFControl_ExternFile;

// Returns data on external file by its original label Returns False if no external file with given name is read
ExternFile(theLabel: TDF_Label): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };
ExternFile(theName: string): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };
ExternFile(theLabel: TDF_Label): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };
ExternFile(theName: string): { returnValue: boolean; theExtFile: STEPCAFControl_ExternFile; [Symbol.dispose](): void };

// Returns basic reader for root file
ChangeWriter(): STEPControl_Writer;

// Returns basic reader as const
Writer(): STEPControl_Writer;

// Set ColorMode for indicate write Colors or not
SetColorMode(theColorMode: boolean): void;

GetColorMode(): boolean;

// Set NameMode for indicate write Name or not
SetNameMode(theNameMode: boolean): void;

GetNameMode(): boolean;

// Set LayerMode for indicate write Layers or not
SetLayerMode(theLayerMode: boolean): void;

GetLayerMode(): boolean;

// PropsMode for indicate write Validation properties or not
SetPropsMode(thePropsMode: boolean): void;

GetPropsMode(): boolean;

// Set MetadataMode for indicate write metadata or not
SetMetadataMode(theMetadataMode: boolean): void;

GetMetadataMode(): boolean;

// Set SHUO mode for indicate write SHUO or not
SetSHUOMode(theSHUOMode: boolean): void;

GetSHUOMode(): boolean;

// Set dimtolmode for indicate write D&GTs or not
SetDimTolMode(theDimTolMode: boolean): void;

GetDimTolMode(): boolean;

// Set flag for indicate write material or not
SetMaterialMode(theMaterialMode: boolean): void;

GetMaterialMode(): boolean;

// Set flag for indicate write visual material or not
SetVisualMaterialMode(theVisualMaterialMode: boolean): void;

GetVisualMaterialMode(): boolean;

// Set clean duplicates flag
SetCleanDuplicates(theCleanDuplicates: boolean): void;
// theCleanDuplicates: the flag to set

// Returns the flag indicating whether duplicates should be removed from the model
GetCleanDuplicates(): boolean;

// Sets parameters for shape processing
SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;
// theParameters: the parameters for shape processing

// Returns parameters for shape processing that was set by SetParameters() method
GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

// Sets flags defining operations to be performed on shapes
SetShapeProcessFlags(theFlags: any): void;
// theFlags: The flags defining operations to be performed on shapes

// Returns flags defining operations to be performed on shapes
GetShapeProcessFlags(): [any, boolean];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
