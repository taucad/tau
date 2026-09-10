# libcascade — ShapeProcess

7 top-level symbols. Signatures are verbatim typescript.

// Shape Processing module allows to define and apply general Shape Processing as a customizable sequence of Shape Healing operators
ShapeProcess: declare class ShapeProcess

constructor

// Registers operator to make it visible for Performer
static RegisterOperator(name: string, op: ShapeProcess_Operator): boolean;

// Finds operator by its name
static FindOperator(name: string): { returnValue: boolean; op: ShapeProcess_Operator; [Symbol.dispose](): void };

// Performs a specified sequence of operators on `theContext`
static Perform(context: ShapeProcess_Context, seq: string, theProgress: Message_ProgressRange): boolean;
static Perform(theContext: ShapeProcess_Context, theOperations: any, theProgress: Message_ProgressRange): boolean;
static Perform(context: ShapeProcess_Context, seq: string, theProgress: Message_ProgressRange): boolean;
static Perform(theContext: ShapeProcess_Context, theOperations: any, theProgress: Message_ProgressRange): boolean;
// theProgress: Progress indicator

// Converts operation name to operation flag
static ToOperationFlag(theName: string): [ShapeProcess_Operation, boolean];
// theName: Operation name

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes all available operations
ShapeProcess_Operation: typeof ShapeProcess_Operation[keyof typeof ShapeProcess_Operation]

// Provides convenient interface to resource file Allows to load resource file and get values of attributes starting from some scope, for example if scope is defined as "ToV4" and requested parameter is "exec.op", value of "ToV4.exec.op" parameter from the resource file will be returned
ShapeProcess_Context: declare class ShapeProcess_Context extends Standard_Transient

constructor

// Initialises a tool by loading resource file and (if specified) sets starting scope Returns False if resource file not found
Init(file: string, scope?: string): boolean;

// Loading {@link Resource_Manager`Resource_Manager`} object if this object not equal internal static {@link Resource_Manager`Resource_Manager`} object or internal static {@link Resource_Manager`Resource_Manager`} object is null
LoadResourceManager(file: string): Resource_Manager;

// Returns internal {@link Resource_Manager`Resource_Manager`} object
ResourceManager(): Resource_Manager;

// Set a new (sub)scope
SetScope(scope: string): void;

// Go out of current scope
UnSetScope(): void;

// Returns True if parameter is defined in the resource file
IsParamSet(param: string): boolean;

GetReal(param: string, val?: number): { returnValue: boolean; val: number };

GetInteger(param: string, val?: number): { returnValue: boolean; val: number };

GetBoolean(param: string, val?: boolean): { returnValue: boolean; val: boolean };

// Get value of parameter as being of specific type Returns False if parameter is not defined or has a wrong type
GetString(param: string, val: TCollection_AsciiString): boolean;
// val: Mutated in place

RealVal(param: string, def: number): number;

IntegerVal(param: string, def: number): number;

BooleanVal(param: string, def: boolean): boolean;

// Get value of parameter as being of specific type If parameter is not defined or does not have expected type, returns default value as specified
StringVal(param: string, def: string): string;

// Sets trace level used for outputting messages
SetTraceLevel(tracelev: number): void;

// Returns trace level used for outputting messages
TraceLevel(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a set of following operators
ShapeProcess_OperLibrary: declare class ShapeProcess_OperLibrary

constructor

// Registers all the operators
static Init(): void;

// Applies {@link BRepTools_Modification`BRepTools_Modification`} to a shape, taking into account sharing of components of compounds
static ApplyModifier(S: TopoDS_Shape, context: ShapeProcess_ShapeContext, M: BRepTools_Modification, map: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator, theMutableInput: boolean): TopoDS_Shape;
// map: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Abstract Operator class providing a tool to perform an operation on Context
ShapeProcess_Operator: declare class ShapeProcess_Operator extends Standard_Transient

// Performs operation and eventually records changes in the context
Perform(context: ShapeProcess_Context, theProgress?: Message_ProgressRange): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extends Context to handle shapes Contains map of shape-shape, and messages attached to shapes
ShapeProcess_ShapeContext: declare class ShapeProcess_ShapeContext extends ShapeProcess_Context

constructor

// Initializes tool by a new shape and clears all results
Init(S: TopoDS_Shape): void;
Init(file: string, scope: string): boolean;
Init(S: TopoDS_Shape): void;
Init(file: string, scope: string): boolean;

// Returns shape being processed
Shape(): TopoDS_Shape;

// Returns current result
Result(): TopoDS_Shape;

// Returns map of replacements shape -> shape This map is not recursive
Map(): NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher;

Messages(): ShapeExtend_MsgRegistrator;

SetDetalisation(level: TopAbs_ShapeEnum): void;

// Set and get value for detalisation level Only shapes of types from TopoDS_COMPOUND and until specified detalisation level will be recorded in maps To cancel mapping, use TopAbs_SHAPE To force full mapping, use TopAbs_VERTEX The default level is TopAbs_FACE
GetDetalisation(): TopAbs_ShapeEnum;

// Sets a new result shape NOTE
SetResult(S: TopoDS_Shape): void;

// Records modifications and resets result accordingly NOTE
RecordModification(repl: ShapeBuild_ReShape): void;
RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(repl: ShapeBuild_ReShape): void;
RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(repl: ShapeBuild_ReShape): void;
RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(repl: ShapeBuild_ReShape): void;
RecordModification(repl: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(repl: ShapeBuild_ReShape, msg: ShapeExtend_MsgRegistrator): void;
RecordModification(sh: TopoDS_Shape, repl: BRepTools_Modifier, msg: ShapeExtend_MsgRegistrator): void;

// Record a message for shape S Shape S should be one of subshapes of original shape (or whole one), but not one of intermediate shapes Records only if `Message()` is not Null
AddMessage(S: TopoDS_Shape, msg: Message_Msg, gravity?: Message_Gravity): void;

// Get value of parameter as being of the type GeomAbs_Shape Returns False if parameter is not defined or has a wrong type
GetContinuity(param: string, val?: GeomAbs_Shape): { returnValue: boolean; val: GeomAbs_Shape };

// Get value of parameter as being of the type GeomAbs_Shape If parameter is not defined or does not have expected type, returns default value as specified
ContinuityVal(param: string, def: GeomAbs_Shape): GeomAbs_Shape;

// Prints statistics on Shape Processing onto the current Messenger
PrintStatistics(): void;

// Set NonManifold flag
SetNonManifold(theNonManifold: boolean): void;

// Get NonManifold flag
IsNonManifold(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines operator as container for static function OperFunc
ShapeProcess_UOperator: declare class ShapeProcess_UOperator extends ShapeProcess_Operator

constructor

// Performs operation and records changes in the context
Perform(context: ShapeProcess_Context, theProgress?: Message_ProgressRange): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
