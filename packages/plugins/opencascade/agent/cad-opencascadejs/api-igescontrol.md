# libcascade — IGESControl

7 top-level symbols. Signatures are verbatim typescript.

// Actor to write Shape to IGES
IGESControl_ActorWrite: declare class IGESControl_ActorWrite extends Transfer_ActorOfFinderProcess

constructor

// Recognizes a ShapeMapper
Recognize(start: Transfer_Finder): boolean;

// Transfers Shape to IGES Entities
Transfer(start: Transfer_Finder, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESControl_AlgoContainer: declare class IGESControl_AlgoContainer extends IGESToBRep_AlgoContainer

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Controller for IGES-5.1
IGESControl_Controller: declare class IGESControl_Controller extends XSControl_Controller

constructor

// Creates a new empty Model ready to receive data of the Norm
NewModel(): Interface_InterfaceModel;

// Returns the Actor for Read attached to the pair (norm,appli) It is an Actor from {@link IGESToBRep `IGESToBRep`}, adapted from an IGESModel
ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

// Takes one Shape and transfers it to the InterfaceModel (already created by NewModel for instance) <modetrans> is to be interpreted by each kind of XstepAdaptor Returns a status
TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

// {@link Standard `Standard`} Initialisation
static Init(): boolean;

// Customises a WorkSession, by adding to it the recorded items (by AddSessionItem)
Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Translates IGES boundary entity (types 141, 142 and 508) in Advanced Data Exchange
IGESControl_IGESBoundary: declare class IGESControl_IGESBoundary extends IGESToBRep_IGESBoundary

constructor

// Checks result of translation of IGES boundary entities (types 141, 142 or 508)
Check(result: boolean, checkclosure: boolean, okCurve3d: boolean, okCurve2d: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Reads IGES files, checks them and translates their contents into Open CASCADE models
IGESControl_Reader: declare class IGESControl_Reader extends XSControl_Reader

constructor

// Set the transion of ALL Roots (if theReadOnlyVisible is False) or of Visible Roots (if theReadOnlyVisible is True)
SetReadVisible(ReadRoot: boolean): void;

GetReadVisible(): boolean;

// Returns the model as a IGESModel
IGESModel(): IGESData_IGESModel;

// Determines the list of root entities from Model which are candidate for a transfer to a Shape (type of entities is PRODUCT) <theReadOnlyVisible> is taken into account to define roots
NbRootsForTransfer(): number;

// Prints Statistics and check list for Transfer
PrintTransferInfo(failwarn: IFSelect_PrintFail, mode: IFSelect_PrintCount): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESControl_ToolContainer: declare class IGESControl_ToolContainer extends IGESToBRep_ToolContainer

constructor

// Returns {@link IGESControl_IGESBoundary`IGESControl_IGESBoundary`}
IGESBoundary(): IGESToBRep_IGESBoundary;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class creates and writes IGES files from CAS.CADE models
IGESControl_Writer: declare class IGESControl_Writer

constructor

// Returns the IGES model to be written in output
Model(): IGESData_IGESModel;

TransferProcess(): Transfer_FinderProcess;

// Returns/Sets the TransferProcess
SetTransferProcess(TP: Transfer_FinderProcess): void;

// Translates a Shape to IGES Entities and adds them to the model Returns True if done, False if Shape not suitable for IGES or null
AddShape(sh: TopoDS_Shape, theProgress?: Message_ProgressRange): boolean;

// Translates a Geometry (Surface or Curve) to IGES Entities and adds them to the model Returns True if done, False if geom is neither a Surface or a Curve suitable for IGES or is null
AddGeom(geom: Standard_Transient): boolean;

// Adds an IGES entity (and the ones it references) to the model
AddEntity(ent: IGESData_IGESEntity): boolean;

// Computes the entities found in the model, which is ready to be written
ComputeModel(): void;

// Computes then writes the model to an OStream Returns True when done, false in case of error
Write(file: string, fnes: boolean): boolean;

// Sets parameters for shape processing
SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;
// theParameters: the parameters for shape processing

// Returns parameters for shape processing that was set by SetParameters() method
GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

// Sets flags defining operations to be performed on shapes
SetShapeProcessFlags(theFlags: any): void;
// theFlags: The flags defining operations to be performed on shapes

// Returns flags defining operations to be performed on shapes
GetShapeProcessFlags(): any;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
