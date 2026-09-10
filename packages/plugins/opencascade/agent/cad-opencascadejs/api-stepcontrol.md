# libcascade — STEPControl

6 top-level symbols. Signatures are verbatim typescript.

// This class performs the transfer of an Entity from AP214 and AP203, either Geometric or Topologic
STEPControl_ActorRead: declare class STEPControl_ActorRead extends Transfer_ActorOfTransientProcess

constructor

// Prerequisite for Transfer
Recognize(start: Standard_Transient): boolean;

Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

// theUseTrsf - special flag for using Axis2Placement from ShapeRepresentation for transform root shape
TransferShape(start: Standard_Transient, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors, isManifold?: boolean, theUseTrsf?: boolean, theProgress?: Message_ProgressRange): Transfer_Binder;

// set units and tolerances context by given ShapeRepresentation
PrepareUnits(rep: StepRepr_Representation, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
// theLocalFactors: Mutated in place

// reset units and tolerances context to default (mm, radians, read.precision.val, etc.)
ResetUnits(theModel: StepData_StepModel, theLocalFactors: StepData_Factors): void;
// theLocalFactors: Mutated in place

// Set model
SetModel(theModel: Interface_InterfaceModel): void;

// Computes transformation defined by two axis placements (in MAPPED_ITEM or ITEM_DEFINED_TRANSFORMATION) taking into account their representation contexts (i.e
ComputeTransformation(Origin: StepGeom_Axis2Placement3d, Target: StepGeom_Axis2Placement3d, OrigContext: StepRepr_Representation, TargContext: StepRepr_Representation, TP: Transfer_TransientProcess, Trsf: gp_Trsf, theLocalFactors: StepData_Factors): boolean;
// Trsf: Mutated in place

// Computes transformation defined by given REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION
ComputeSRRWT(SRR: StepRepr_RepresentationRelationship, TP: Transfer_TransientProcess, Trsf: gp_Trsf, theLocalFactors: StepData_Factors): boolean;
// Trsf: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class performs the transfer of a Shape from `TopoDS` to AP203 or AP214 (CD2 or DIS)
STEPControl_ActorWrite: declare class STEPControl_ActorWrite extends Transfer_ActorOfFinderProcess

constructor

// Prerequisite for Transfer
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

// Customizable method to check whether shape S should be written as assembly or not Default implementation uses flag GroupMode and analyses the shape itself NOTE
IsAssembly(theModel: StepData_StepModel, S: TopoDS_Shape): boolean;
// S: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines basic controller for STEP processor
STEPControl_Controller: declare class STEPControl_Controller extends XSControl_Controller

constructor

// Creates a new empty Model ready to receive data of the Norm
NewModel(): Interface_InterfaceModel;

// Returns the Actor for Read attached to the pair (norm,appli)
ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

// Customises a WorkSession, by adding to it the recorded items (by AddSessionItem)
Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

// Takes one Shape and transfers it to the InterfaceModel (already created by NewModel for instance) <modeshape> is to be interpreted by each kind of XstepAdaptor Returns a status
TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

// {@link Standard `Standard`} Initialisation
static Init(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Reads STEP files, checks them and translates their contents into Open CASCADE models
STEPControl_Reader: declare class STEPControl_Reader extends XSControl_Reader

constructor

// Returns the model as a StepModel
StepModel(): StepData_StepModel;

// Loads a file and returns the read status Zero for a Model which compies with the Controller
ReadFile(filename: string): IFSelect_ReturnStatus;

// Transfers a root given its rank in the list of candidate roots Default is the first one Returns True if a shape has resulted, false else Same as inherited TransferOneRoot, kept for compatibility
TransferRoot(num?: number, theProgress?: Message_ProgressRange): boolean;

// Determines the list of root entities from Model which are candidate for a transfer to a Shape (type of entities is PRODUCT)
NbRootsForTransfer(): number;

// Returns sequence of all unit names for shape representations found in file
FileUnits(theUnitLengthNames: NCollection_Sequence_TCollection_AsciiString, theUnitAngleNames: NCollection_Sequence_TCollection_AsciiString, theUnitSolidAngleNames: NCollection_Sequence_TCollection_AsciiString): void;
// theUnitLengthNames: Mutated in place
// theUnitAngleNames: Mutated in place
// theUnitSolidAngleNames: Mutated in place

// Sets system length unit used by transfer process
SetSystemLengthUnit(theLengthUnit: number): void;

// Returns system length unit used by transfer process
SystemLengthUnit(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Gives you the choice of translation mode for an Open CASCADE shape that is being translated to STEP
STEPControl_StepModelType: typeof STEPControl_StepModelType[keyof typeof STEPControl_StepModelType]

// This class creates and writes STEP files from Open CASCADE models
STEPControl_Writer: declare class STEPControl_Writer

constructor

// Sets a length-measure value that will be written to uncertainty-measure-with-unit when the next shape is translated
SetTolerance(Tol: number): void;

// Unsets the tolerance formerly forced by SetTolerance
UnsetTolerance(): void;

// Sets a specific session to <me>
SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

// Returns the session used in <me>
WS(): XSControl_WorkSession;

// Returns the produced model
Model(newone?: boolean): StepData_StepModel;

// Translates shape sh to a STEP entity
Transfer(sh: TopoDS_Shape, mode: STEPControl_StepModelType, compgraph: boolean, theProgress: Message_ProgressRange): IFSelect_ReturnStatus;

// Writes a STEP model in the file identified by filename
Write(theFileName: string): IFSelect_ReturnStatus;

// Displays the statistics for the last translation
PrintStatsTransfer(what: number, mode?: number): void;

CleanDuplicateEntities(): void;

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
