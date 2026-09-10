# libcascade — XSControl

9 top-level symbols. Signatures are verbatim typescript.

// This package provides complements to {@link IFSelect `IFSelect`} & Co for control of a session
XSControl: declare class XSControl

constructor

// Returns the WorkSession of a SessionPilot, but casts it as from {@link XSControl`XSControl`}
static Session(pilot: IFSelect_SessionPilot): XSControl_WorkSession;

// Returns the Vars of a SessionPilot, it is brought by Session it provides access to external variables
static Vars(pilot: IFSelect_SessionPilot): XSControl_Vars;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// From a {@link TopoDS_Shape`TopoDS_Shape`}, or from the entity which has produced it, searches for the shapes, and the entities which have produced them in last transfer, which are adjacent to it by VERTICES
XSControl_ConnectedShapes: declare class XSControl_ConnectedShapes extends IFSelect_SelectExplore

constructor

// Sets a TransferReader to sort entities
SetReader(TR: XSControl_TransferReader): void;

// Returns a text defining the criterium
ExploreLabel(): TCollection_AsciiString;

// This functions considers a shape from a transfer and performs the search function explained above
static AdjacentEntities(ashape: TopoDS*Shape, TP: Transfer_TransientProcess, type*: TopAbs_ShapeEnum): NCollection_HSequence_handle_Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows a general X-STEP engine to run generic functions on any interface norm, in the same way
XSControl_Controller: declare class XSControl_Controller extends Standard_Transient

// Changes names if a name is empty, the formerly set one remains Remark
SetNames(theLongName: string, theShortName: string): void;

// Records <me> is a general dictionary under Short and Long Names (see method Name)
AutoRecord(): void;

// Records <me> in a general dictionary under a name Error if <name> already used for another one
Record(name: string): void;

// Returns the Controller attached to a given name Returns a Null Handle if <name> is unknown
static Recorded(name: string): XSControl_Controller;

// Returns a name, as given when initializing
Name(rsc: boolean): string;

// Returns the Protocol attached to the Norm (from field)
Protocol(): Interface_Protocol;

// Returns the SignType attached to the norm (from field)
WorkLibrary(): IFSelect_WorkLibrary;

// Creates a new empty Model ready to receive data of the Norm Used to write data from Imagine to an interface file
NewModel(): Interface_InterfaceModel;

// Returns the Actor for Read attached to the pair (norm,appli) It can be adapted for data of the input Model, as required Can be read from field then adapted with Model as required
ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

// Returns the Actor for Write attached to the pair (norm,appli) Read from field
ActorWrite(): Transfer_ActorOfFinderProcess;

// Sets minimum and maximum values for modetrans (write) Erases formerly recorded bounds and values Actually only for shape Then, for each value a little help can be attached
SetModeWrite(modemin: number, modemax: number, shape?: boolean): void;

// Attaches a short line of help to a value of modetrans (write)
SetModeWriteHelp(modetrans: number, help: string, shape?: boolean): void;

// Returns recorded min and max values for modetrans (write) Actually only for shapes Returns True if bounds are set, False else (then, free value)
ModeWriteBounds(modemin: number, modemax: number, shape: boolean): { returnValue: boolean; modemin: number; modemax: number };

// Tells if a value of <modetrans> is a good value(within bounds) Actually only for shapes
IsModeWrite(modetrans: number, shape?: boolean): boolean;

// Returns the help line recorded for a value of modetrans empty if help not defined or not within bounds or if values are free
ModeWriteHelp(modetrans: number, shape: boolean): string;

// Tells if <obj> (an application object) is a valid candidate for a transfer to a Model
RecognizeWriteTransient(obj: Standard_Transient, modetrans?: number): boolean;

// Takes one Transient Object and transfers it to an InterfaceModel (already created, e.g
TransferWriteTransient(obj: Standard_Transient, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

// Tells if a shape is valid for a transfer to a model Asks the ActorWrite (through a ShapeMapper)
RecognizeWriteShape(shape: TopoDS_Shape, modetrans?: number): boolean;

// Takes one Shape and transfers it to an InterfaceModel (already created, e.g
TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

// Records a Session Item, to be added for customisation of the Work Session
AddSessionItem(theItem: Standard_Transient, theName: string, toApply?: boolean): void;

// Returns an item given its name to record in a Session If <name> is unknown, returns a Null Handle
SessionItem(theName: string): Standard_Transient;

// Customises a WorkSession, by adding to it the recorded items (by AddSessionItem)
Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

AdaptorSession(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines additional commands for {@link XSControl`XSControl`} to
XSControl_FuncShape: declare class XSControl_FuncShape

constructor

// Defines and loads all functions which work on shapes for {@link XSControl`XSControl`} (as ActFunc)
static Init(): void;

// Analyses a name as designating Shapes from a Vars or from XSTEP transfer (last Transfer on Reading)
static MoreShapes(session: XSControl_WorkSession, name: string): { returnValue: number; list: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

// Analyses given file name and variable name, with a default name for variables
static FileAndVar(session: XSControl*WorkSession, file: string, var*: string, def: string, resfile: TCollection_AsciiString, resvar: TCollection_AsciiString): boolean;
// resfile: Mutated in place
// resvar: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Functions from {@link XSControl`XSControl`} gives access to actions which can be commanded with the resources provided by {@link XSControl`XSControl`}
XSControl_Functions: declare class XSControl_Functions

constructor

// Defines and loads all functions for {@link XSControl`XSControl`} (as ActFunc)
static Init(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A groundwork to convert a shape to data which complies with a particular norm
XSControl_Reader: declare class XSControl_Reader

constructor

// Sets a specific norm to <me> Returns True if done, False if <norm> is not available
SetNorm(norm: string): boolean;

// Sets a specific session to <me>
SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

// Returns the session used in <me>
WS(): XSControl_WorkSession;

// Loads a file and returns the read status Zero for a Model which complies with the Controller
ReadFile(filename: string): IFSelect_ReturnStatus;

// Returns the model
Model(): Interface_InterfaceModel;

// Returns a list of entities from the IGES or STEP file according to the following rules
GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;
GiveList(first: string, ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;
GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;
GiveList(first: string, ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

// Determines the list of root entities which are candidate for a transfer to a Shape, and returns the number of entities in the list
NbRootsForTransfer(): number;

// Returns an IGES or STEP root entity for translation
RootForTransfer(num?: number): Standard_Transient;

// Translates a root identified by the rank num in the model
TransferOneRoot(num?: number, theProgress?: Message_ProgressRange): boolean;

// Translates an IGES or STEP entity identified by the rank num in the model
TransferOne(num: number, theProgress?: Message_ProgressRange): boolean;

// Translates an IGES or STEP entity in the model
TransferEntity(start: Standard_Transient, theProgress?: Message_ProgressRange): boolean;

// Translates a list of entities
TransferList(list: NCollection_HSequence_handle_Standard_Transient, theProgress?: Message_ProgressRange): number;

// Translates all translatable roots and returns the number of successful translations
TransferRoots(theProgress?: Message_ProgressRange): number;

// Clears the list of shapes that may have accumulated in calls to TransferOne or TransferRoot.C
ClearShapes(): void;

// Returns the number of shapes produced by translation
NbShapes(): number;

// Returns the shape resulting from a translation and identified by the rank num
Shape(num?: number): TopoDS_Shape;

// Returns all of the results in a single shape which is
OneShape(): TopoDS_Shape;

// Prints the check list attached to loaded data, on the {@link Standard `Standard`} Trace File (starts at std::cout) All messages or fails only, according to <failsonly> mode = 0
PrintCheckLoad(failsonly: boolean, mode: IFSelect_PrintCount): void;

// Displays check results for the last translation of IGES or STEP entities to Open CASCADE entities
PrintCheckTransfer(failsonly: boolean, mode: IFSelect_PrintCount): void;

// Displays the statistics for the last translation
PrintStatsTransfer(what: number, mode: number): void;

// Gives statistics about Transfer
GetStatsTransfer(list: NCollection_HSequence_handle_Standard_Transient, nbMapped?: number, nbWithResult?: number, nbWithFail?: number): { nbMapped: number; nbWithResult: number; nbWithFail: number };

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

// This selection selects the entities which are recognised for transfer by an Actor for Read
XSControl_SelectForTransfer: declare class XSControl_SelectForTransfer extends IFSelect_SelectExtract

constructor

// Sets a TransferReader to sort entities
SetReader(TR: XSControl_TransferReader): void;

// Sets a precise actor to sort entities This definition oversedes the creation with a TransferReader
SetActor(act: Transfer_ActorOfTransientProcess): void;

// Returns the Actor used as precised one
Actor(): Transfer_ActorOfTransientProcess;

// Returns the Reader (if created with a Reader) Returns a Null Handle if not created with a Reader
Reader(): XSControl_TransferReader;

// Returns True for an Entity which is recognized by the Actor, either the precised one, or the one defined by TransferReader
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This Signatures gives the Transfer Status of an entity, as recorded in a TransferProcess
XSControl_SignTransferStatus: declare class XSControl_SignTransferStatus extends IFSelect_Signature

constructor

// Sets a TransferReader to work
SetReader(TR: XSControl_TransferReader): void;

// Sets a precise map to sign entities This definition oversedes the creation with a TransferReader
SetMap(TP: Transfer_TransientProcess): void;

// Returns the TransientProcess used as precised one Returns a Null Handle for a creation from a TransferReader without any further setting
Map(): Transfer_TransientProcess;

// Returns the Reader (if created with a Reader) Returns a Null Handle if not created with a Reader
Reader(): XSControl_TransferReader;

// Returns the Signature for a Transient object, as its transfer status
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A TransferReader performs, manages, handles results of, transfers done when reading a file (i.e
XSControl_TransferReader: declare class XSControl_TransferReader extends Standard_Transient

constructor

// Sets a Controller
SetController(theControl: XSControl_Controller): void;

// Sets the Actor directly
SetActor(theActor: Transfer_ActorOfTransientProcess): void;

// Returns the Actor, determined by the Controller, or if this one is unknown, directly set
Actor(): Transfer_ActorOfTransientProcess;

// Sets an InterfaceModel
SetModel(theModel: Interface_InterfaceModel): void;

// Returns the currently set InterfaceModel
Model(): Interface_InterfaceModel;

// Sets a Context
SetContext(theName: string, theCtx: Standard_Transient): void;

// Returns the Context attached to a name, if set and if it is Kind of the type, else a Null Handle Returns True if OK, False if no Context
GetContext(theName: string, theType: Standard_Type): { returnValue: boolean; theCtx: Standard_Transient; [Symbol.dispose](): void };

// Returns (modifiable) the whole definition of Context Rather for internal use (ex.
Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

// Sets a new value for (loaded) file name
SetFileName(theName: string): void;

// Returns actual value of file name
FileName(): string;

// Clears data, according mode
Clear(theMode: number): void;

// Returns the currently used TransientProcess It is computed from the model by TransferReadRoots, or by BeginTransferRead
TransientProcess(): Transfer_TransientProcess;

// Forces the TransientProcess Remark
SetTransientProcess(theTP: Transfer_TransientProcess): void;

// Records a final result of transferring an entity This result is recorded as a ResultFromModel, taken from the TransientProcess Returns True if a result is available, False else
RecordResult(theEnt: Standard_Transient): boolean;

// Returns True if a final result is recorded for an entity Remark that it can bring no effective result if transfer has completely failed (FinalResult brings only fail messages ...)
IsRecorded(theEnt: Standard_Transient): boolean;

// Returns True if a final result is recorded AND BRINGS AN EFFECTIVE RESULT (else, it brings only fail messages)
HasResult(theEnt: Standard_Transient): boolean;

// Returns the list of entities to which a final result is attached (i.e
RecordedList(): NCollection_HSequence_handle_Standard_Transient;

// Note that an entity has been required for transfer but no result at all is available (typically
Skip(theEnt: Standard_Transient): boolean;

// Returns True if an entity is noted as skipped
IsSkipped(theEnt: Standard_Transient): boolean;

// Returns True if an entity has been asked for transfert, hence it is marked, as
IsMarked(theEnt: Standard_Transient): boolean;

// Returns the final result recorded for an entity, as such
FinalResult(theEnt: Standard_Transient): Transfer_ResultFromModel;

// Returns the label attached to an entity recorded for final, or an empty string if not recorded
FinalEntityLabel(theEnt: Standard_Transient): string;

// Returns the number attached to the entity recorded for final, or zero if not recorded (looks in the ResultFromModel)
FinalEntityNumber(theEnt: Standard_Transient): number;

// Returns the final result recorded for a NUMBER of entity (internal use)
ResultFromNumber(theNum: number): Transfer_ResultFromModel;

// Returns the resulting object as a Transient Null Handle if no result or result not transient
TransientResult(theEnt: Standard_Transient): Standard_Transient;

// Returns the resulting object as a Shape Null Shape if no result or result not a shape
ShapeResult(theEnt: Standard_Transient): TopoDS_Shape;

// Clears recorded result for an entity, according mode <mode> = -1
ClearResult(theEnt: Standard_Transient, theMode: number): boolean;

// Returns an entity from which a given result was produced
EntityFromResult(theRes: Standard_Transient, theMode?: number): Standard_Transient;

// Returns an entity from which a given shape result was produced Returns a Null Handle if <res> not recorded or not a Shape
EntityFromShapeResult(theRes: TopoDS_Shape, theMode?: number): Standard_Transient;

// Returns the list of entities from which some shapes were produced
EntitiesFromShapeList(theRes: NCollection_HSequence_TopoDS_Shape, theMode?: number): NCollection_HSequence_handle_Standard_Transient;

// Returns True if an entity (with a final result) has checks
HasChecks(theEnt: Standard_Transient, FailsOnly: boolean): boolean;

// Returns the list of starting entities to which a given check status is attached, IN FINAL RESULTS <ent> can be an entity, or the model to query all entities Below, "entities" are, either <ent> plus its sub-transferred, or all the entities of the model
CheckedList(theEnt: Standard_Transient, WithCheck?: Interface_CheckStatus, theResult?: boolean): NCollection_HSequence_handle_Standard_Transient;

// Defines a new TransferProcess for reading transfer Returns True if done, False if data are not properly defined (the Model, the Actor for Read)
BeginTransfer(): boolean;

// Tells if an entity is recognized as a valid candidate for Transfer
Recognize(theEnt: Standard_Transient): boolean;

// Commands the transfer on reading for an entity to data for Imagine, using the selected Actor for Read Returns count of transferred entities, ok or with fails (0/1) If <rec> is True (D), the result is recorded by RecordResult
TransferOne(theEnt: Standard_Transient, theRec?: boolean, theProgress?: Message_ProgressRange): number;

// Commands the transfer on reading for a list of entities to data for Imagine, using the selected Actor for Read Returns count of transferred entities, ok or with fails (0/1) If <rec> is True (D), the results are recorded by RecordResult
TransferList(theList: NCollection_HSequence_handle_Standard_Transient, theRec?: boolean, theProgress?: Message_ProgressRange): number;

// Clears the results attached to an entity if <ents> equates the starting model, clears all results
TransferClear(theEnt: Standard_Transient, theLevel?: number): void;

// Returns the list of entities recorded as lastly transferred i.e
LastTransferList(theRoots: boolean): NCollection_HSequence_handle_Standard_Transient;

// Returns a list of result Shapes If <rec> is True , sees RecordedList If <rec> is False, sees LastTransferList (last ROOT transfers) For each one, if it is a Shape, it is cumulated to the list If no Shape is found, returns an empty Sequence
ShapeResultList(theRec: boolean): NCollection_HSequence_TopoDS_Shape;

// This routines prints statistics about a TransientProcess It can be called, by a TransferReader, or isolately Prints are done on the default trace file <what> defines what kind of statistics are to be printed
static PrintStatsProcess(theTP: Transfer_TransientProcess, theWhat: number, theMode?: number): void;

// Works as PrintStatsProcess, but displays data only on the entities which are in filter)
static PrintStatsOnList(theTP: Transfer_TransientProcess, theList: NCollection_HSequence_handle_Standard_Transient, theWhat: number, theMode?: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
