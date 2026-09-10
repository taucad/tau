# libcascade — TransferBRep

7 top-level symbols. Signatures are verbatim typescript.

// Allows direct binding between a starting Object and the Result of its transfer when it is Unique
TransferBRep_BinderOfShape: declare class TransferBRep_BinderOfShape extends Transfer_Binder

constructor

// Returns the Type permitted for the Result, i.e
ResultType(): Standard_Type;

// Returns the Type Name computed for the Result (dynamic)
ResultTypeName(): string;

// Defines the Result
SetResult(res: TopoDS_Shape): void;

// Returns the defined Result, if there is one
Result(): TopoDS_Shape;

// Returns the defined Result, if there is one, and allows to change it (avoids Result + SetResult)
CResult(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class offers a simple, easy to call, way of transferring data from interface files to Shapes from CasCade It must be specialized according to each norm/protocol, by
TransferBRep_Reader: declare class TransferBRep_Reader

constructor

// Records the protocol to be used for read and transfer roots
SetProtocol(protocol: Interface_Protocol): void;

// Returns the recorded Protocol
Protocol(): Interface_Protocol;

// Records the actor to be used for transfers
SetActor(actor: Transfer_ActorOfTransientProcess): void;

// Returns the recorded Actor
Actor(): Transfer_ActorOfTransientProcess;

// Sets File Status to be interpreted as follows
SetFileStatus(status: number): void;

// Returns the File Status
FileStatus(): number;

// Returns True if FileStatus is for FileNotFound
FileNotFound(): boolean;

// Returns True if FileStatus is for Error during read (major error
SyntaxError(): boolean;

// Specifies a Model to work on Also clears the result and Done status
SetModel(model: Interface_InterfaceModel): void;

// Returns the Model to be worked on
Model(): Interface_InterfaceModel;

// clears the result and Done status
Clear(): void;

// Checks the Model
CheckStatusModel(withprint: boolean): boolean;

// Returns (by Reference, hence can be changed) the Mode for new Transfer
ModeNewTransfer(): boolean;

// Initializes the Reader for a Transfer (one,roots, or list) Also calls PrepareTransfer Returns True when done, False if could not be done
BeginTransfer(): boolean;

// Ebds a Transfer (one, roots or list) by recording its result
EndTransfer(): void;

// Prepares the Transfer
PrepareTransfer(): void;

// Transfers all Root Entities which are recognized as Geom-Topol The result will be a list of Shapes
TransferRoots(theProgress?: Message_ProgressRange): void;

// Transfers an Entity given its rank in the Model (Root or not) Returns True if it is recognized as Geom-Topol
Transfer(num: number, theProgress?: Message_ProgressRange): boolean;

// Transfers a list of Entities (only the ones also in the Model) Remark
TransferList(list: NCollection_HSequence_handle_Standard_Transient, theProgress?: Message_ProgressRange): void;

// Returns True if the LAST Transfer/TransferRoots was a success
IsDone(): boolean;

// Returns the count of produced Shapes (roots)
NbShapes(): number;

// Returns the complete list of produced Shapes
Shapes(): NCollection_HSequence_TopoDS_Shape;

// Returns a Shape given its rank, by default the first one
Shape(num?: number): TopoDS_Shape;

// Returns a Shape produced from a given entity (if it was individually transferred or if an intermediate result is known)
ShapeResult(ent: Standard_Transient): TopoDS_Shape;

// Returns a unique Shape for the result
OneShape(): TopoDS_Shape;

// Returns the count of produced Transient Results (roots)
NbTransients(): number;

// Returns the complete list of produced Transient Results
Transients(): NCollection_HSequence_handle_Standard_Transient;

// Returns a Transient Root Result, given its rank (by default the first one)
Transient(num?: number): Standard_Transient;

// Checks the Result of last Transfer (individual or roots, no cumulation on several transfers)
CheckStatusResult(withprints: boolean): boolean;

// Returns the TransientProcess
TransientProcess(): Transfer_TransientProcess;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A ShapeBinder is a BinderOfShape with some additional services to cast the Result under various kinds of Shapes
TransferBRep_ShapeBinder: declare class TransferBRep_ShapeBinder extends TransferBRep_BinderOfShape

constructor

// Returns the Type of the Shape Result (under {@link TopAbs `TopAbs`} form)
ShapeType(): TopAbs_ShapeEnum;

Vertex(): TopoDS_Vertex;

Edge(): TopoDS_Edge;

Wire(): TopoDS_Wire;

Face(): TopoDS_Face;

Shell(): TopoDS_Shell;

Solid(): TopoDS_Solid;

CompSolid(): TopoDS_CompSolid;

Compound(): TopoDS_Compound;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Gives information on an object, see template DataInfo This class is for Shape
TransferBRep_ShapeInfo: declare class TransferBRep_ShapeInfo

constructor

// Returns the Type attached to an object Here, TShape (Shape has no Dynamic Type)
static Type(ent: TopoDS_Shape): Standard_Type;

// Returns Type Name (string) Here, the true name of the Type of a Shape
static TypeName(ent: TopoDS_Shape): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This binder binds several (a list of) shapes with a starting entity, when this entity itself corresponds to a simple list of shapes
TransferBRep_ShapeListBinder: declare class TransferBRep_ShapeListBinder extends Transfer_Binder

constructor

// Returns True if a Binder has several results, either by itself or because it has next results Can be defined by sub-classes
IsMultiple(): boolean;

// Returns the Type which characterizes the Result (if known)
ResultType(): Standard_Type;

// Returns the Name of the Type which characterizes the Result Can be returned even if ResultType itself is unknown
ResultTypeName(): string;

// Adds an item to the result list
AddResult(res: TopoDS_Shape): void;
AddResult(next: Transfer_Binder): void;
AddResult(res: TopoDS_Shape): void;
AddResult(next: Transfer_Binder): void;

Result(): NCollection_HSequence_TopoDS_Shape;

// Changes an already defined sub-result
SetResult(num: number, res: TopoDS_Shape): void;

NbShapes(): number;

Shape(num: number): TopoDS_Shape;

ShapeType(num: number): TopAbs_ShapeEnum;

Vertex(num: number): TopoDS_Vertex;

Edge(num: number): TopoDS_Edge;

Wire(num: number): TopoDS_Wire;

Face(num: number): TopoDS_Face;

Shell(num: number): TopoDS_Shell;

Solid(num: number): TopoDS_Solid;

CompSolid(num: number): TopoDS_CompSolid;

Compound(num: number): TopoDS_Compound;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TransferBRep_ShapeMapper: declare class TransferBRep_ShapeMapper extends Transfer_Finder

constructor

// Returns the contained value
Value(): TopoDS_Shape;

// Specific test of equality
Equates(other: Transfer_Finder): boolean;

// Returns the Type of the Value
ValueType(): Standard_Type;

// Returns the name of the Type of the Value
ValueTypeName(): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Data structure for storing information on transfer result
TransferBRep_TransferResultInfo: declare class TransferBRep_TransferResultInfo extends Standard_Transient

constructor

// Resets all the fields
Clear(): void;

Result(): number;

ResultWarning(): number;

ResultFail(): number;

ResultWarningFail(): number;

NoResult(): number;

NoResultWarning(): number;

NoResultFail(): number;

NoResultWarningFail(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
