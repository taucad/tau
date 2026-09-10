# libcascade — MoniTool

12 top-level symbols. Signatures are verbatim typescript.

// a AttrList allows to record a list of attributes as Transients which can be edited, changed ..
MoniTool_AttrList: declare class MoniTool_AttrList

constructor

// Adds an attribute with a given name (replaces the former one with the same name if already exists)
SetAttribute(name: string, val: Standard_Transient): void;

// Removes an attribute Returns True when done, False if this attribute did not exist
RemoveAttribute(name: string): boolean;

// Returns an attribute from its name, filtered by a type If no attribute has this name, or if it is not kind of this type, <val> is Null and returned value is False Else, it is True
GetAttribute(name: string, type\_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

// Returns an attribute from its name
Attribute(name: string): Standard_Transient;

// Returns the type of an attribute
AttributeType(name: string): MoniTool_ValueType;

// Adds an integer value for an attribute
SetIntegerAttribute(name: string, val: number): void;

// Returns an attribute from its name, as integer If no attribute has this name, or not an integer, <val> is 0 and returned value is False Else, it is True
GetIntegerAttribute(name: string, val?: number): { returnValue: boolean; val: number };

// Returns an integer attribute from its name
IntegerAttribute(name: string): number;

// Adds a real value for an attribute
SetRealAttribute(name: string, val: number): void;

// Returns an attribute from its name, as real If no attribute has this name, or not a real <val> is 0.0 and returned value is False Else, it is True
GetRealAttribute(name: string, val?: number): { returnValue: boolean; val: number };

// Returns a real attribute from its name
RealAttribute(name: string): number;

// Adds a String value for an attribute
SetStringAttribute(name: string, val: string): void;

// Returns a String attribute from its name
StringAttribute(name: string): string;

// Returns the exhaustive list of attributes
AttrList(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

// Gets the list of attributes from <other>, as such, i.e
SameAttributes(other: MoniTool_AttrList): void;

// Gets the list of attributes from <other>, by copying it By default, considers all the attributes from <other> If <fromname> is given, considers only the attributes with name beginning by <fromname>
GetAttributes(other: MoniTool_AttrList, fromname?: string, copied?: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to record data attached to a case to be exploited
MoniTool_CaseData: declare class MoniTool_CaseData extends Standard_Transient

constructor

// Sets a CaseId
SetCaseId(caseid: string): void;

// Sets a Name
SetName(name: string): void;

// Returns the CaseId
CaseId(): string;

// Returns the Name
Name(): string;
Name(nd: number): TCollection_AsciiString;
Name(): string;
Name(nd: number): TCollection_AsciiString;

// Tells if <me> is Check (Warning or Fail), else it is Info
IsCheck(): boolean;

// Tells if <me> is Warning
IsWarning(): boolean;

// Tells if <me> is Fail
IsFail(): boolean;

// Resets Check Status, i.e
ResetCheck(): void;

// Sets <me> as Warning
SetWarning(): void;

// Sets <me> as Fail
SetFail(): void;

// Sets the next Add..
SetChange(): void;

// Sets the next Add..
SetReplace(num: number): void;

// Unitary adding a data
AddData(val: Standard_Transient, kind: number, name?: string): void;

// Adds the currently caught exception
AddRaised(theException: Standard_Failure, name?: string): void;

// Adds a Shape (recorded as a HShape)
AddShape(sh: TopoDS_Shape, name?: string): void;

// Adds a XYZ
AddXYZ(aXYZ: gp_XYZ, name?: string): void;

// Adds a XY
AddXY(aXY: gp_XY, name?: string): void;

// Adds a Real
AddReal(val: number, name?: string): void;

// Adds two reals (for instance, two parameters)
AddReals(v1: number, v2: number, name?: string): void;

// Adds the CPU time between lastCPU and now if <curCPU> is given, the CPU amount is curCPU-lastCPU else it is currently measured CPU - lastCPU lastCPU has been read by call to GetCPU See GetCPU to get amount, and LargeCPU to test large amount
AddCPU(lastCPU: number, curCPU?: number, name?: string): void;

// Returns the current amount of CPU This allows to laterly test and record CPU amount Its value has to be given to LargeCPU and AddCPU
GetCPU(): number;

// Tells if a CPU time amount is large <maxCPU> gives the amount over which an amount is large <lastCPU> gives the start CPU amount if <curCPU> is given, the tested CPU amount is curCPU-lastCPU else it is currently measured CPU - lastCPU
LargeCPU(maxCPU: number, lastCPU: number, curCPU?: number): boolean;

// Adds a Geometric as a Transient (Curve, Surface ...)
AddGeom(geom: Standard_Transient, name?: string): void;

// Adds a Transient, as an Entity from an InterfaceModel for instance
AddEntity(ent: Standard_Transient, name?: string): void;

// Adds a Text (as HAsciiString)
AddText(text: string, name?: string): void;

// Adds an Integer
AddInteger(val: number, name?: string): void;

// Adds a Transient, with no more meaning
AddAny(val: Standard_Transient, name?: string): void;

// Removes a Data from its rank
RemoveData(num: number): void;

// Returns the count of data recorded to a set
NbData(): number;

// Returns a data item (n0 <nd> in the set <num>)
Data(nd: number): Standard_Transient;

// Returns a data item, under control of a Type If the data item is kind of this type, it is returned in <val> and the returned value is True Else, <val> is unchanged and the returned value is False
GetData(nd: number, type\_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

// Returns the kind of a data
Kind(nd: number): number;

// Returns the first suitable data rank for a given name Exact matching (exact case, no completion) is required Firstly checks the recorded names If not found, considers the name as follows
NameNum(name: string): number;

// Returns a data as a shape, Null if not a shape
Shape(nd: number): TopoDS_Shape;

// Returns a data as a XYZ (i.e
XYZ(nd: number, val: gp_XYZ): boolean;
// val: Mutated in place

// Returns a data as a XY (i.e
XY(nd: number, val: gp_XY): boolean;
// val: Mutated in place

// Returns a couple of reals (stored in {@link Geom2d_CartesianPoint `Geom2d_CartesianPoint`})
Reals(nd: number, v1?: number, v2?: number): { returnValue: boolean; v1: number; v2: number };

// Returns a real or CPU amount (stored in {@link Geom2d_CartesianPoint `Geom2d_CartesianPoint`}) (allows an Integer converted to a Real)
Real(nd: number, val?: number): { returnValue: boolean; val: number };

// Returns an Integer
Integer(nd: number, val?: number): { returnValue: boolean; val: number };

// Returns a Msg from a CaseData
Msg(): Message_Msg;

// Sets a Code to give a Warning
static SetDefWarning(acode: string): void;

// Sets a Code to give a Fail
static SetDefFail(acode: string): void;

// Returns Check Status for a Code
static DefCheck(acode: string): number;

// Attaches a message definition to a case code This definition includes the message code plus designation of items of the CaseData to be added to the message (this part not yet implemented)
static SetDefMsg(casecode: string, mesdef: string): void;

// Returns the message definition for a case code Empty if no message attached
static DefMsg(casecode: string): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Gives information on an object Used as template to instantiate Elem, etc This class is for Transient
MoniTool_DataInfo: declare class MoniTool_DataInfo

constructor

// Returns the Type attached to an object Here, the Dynamic Type of a Transient
static Type(ent: Standard_Transient): Standard_Type;

// Returns Type Name (string) Allows to name type of non-handled objects
static TypeName(ent: Standard_Transient): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// a Element allows to map any kind of object as a Key for a Map
MoniTool_Element: declare class MoniTool_Element extends Standard_Transient

// Returns the HashCode which has been stored by SetHashCode (remark that HashCode could be deferred then be defined by sub-classes, the result is the same)
GetHashCode(): number;

// Specific testof equality
Equates(other: MoniTool_Element): boolean;

// Returns the Type of the Value
ValueType(): Standard_Type;

// Returns the name of the Type of the Value
ValueTypeName(): string;

// Returns (readonly) the Attribute List
ListAttr(): MoniTool_AttrList;

// Returns (modifiable) the Attribute List
ChangeAttr(): MoniTool_AttrList;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An Integer through a Handle (i.e
MoniTool_IntVal: declare class MoniTool_IntVal extends Standard_Transient

constructor

Value(): number;

CValue(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Real through a Handle (i.e
MoniTool_RealVal: declare class MoniTool_RealVal extends Standard_Transient

constructor

Value(): number;

CValue(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Signs HShape according to its real content (type of Shape) Context is not used
MoniTool_SignShape: declare class MoniTool_SignShape extends MoniTool_SignText

constructor

// Returns "SHAPE"
Name(): string;

// Returns for a HShape, the string of its ShapeEnum The Model is absolutely useless (may be null)
Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides the basic service to get a text which identifies an object in a context It can be used for other classes (general signatures ...) It can also be used to build a message in which an object is to be identified
MoniTool_SignText: declare class MoniTool_SignText extends Standard_Transient

// Returns an identification of the Signature (a word), given at initialization time
Name(): string;

// Gives a text as a signature for a transient object alone, i.e
TextAlone(ent: Standard_Transient): TCollection_AsciiString;

// Gives a text as a signature for a transient object in a context If the context is senseless, it can be given as Null Handle empty result if nothing to give (at least the DynamicType could be sent ?)
Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class manages Statistics to be queried asynchronously
MoniTool_Stat: declare class MoniTool_Stat

constructor

static Current(): MoniTool_Stat;

// Opens a new counter with a starting count of items
Open(nb?: number): number;

// Adds more items to be counted by Add..
OpenMore(id: number, nb: number): void;

// Directly adds items
Add(nb?: number): void;

// Declares a count of items to be added later
AddSub(nb?: number): void;

// Ends the AddSub and cumulates the sub-count to current level
AddEnd(): void;

Close(id: number): void;

Level(): number;

Percent(fromlev?: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides convenient service on global timers accessed by string name, mostly aimed for debugging purposes
MoniTool_Timer: declare class MoniTool_Timer extends Standard_Transient

constructor

Start(): void;
static Start(name: string): void;

Stop(): void;
static Stop(name: string): void;

// Start, Stop and reset the timer In addition to doing that to embedded `OSD_Timer`, manage also counter of hits
Reset(): void;

// Return value of hits counter (count of Start/Stop pairs)
Count(): number;

// Returns value of nesting counter
IsRunning(): number;

// Return value of CPU time minus accumulated amendment
CPU(): number;

// Return value of accumulated amendment on CPU time
Amend(): number;

// Returns a timer from a dictionary by its name If timer not existed, creates a new one
static Timer(name: string): MoniTool_Timer;

// Returns map of timers
static Dictionary(): any;

// Clears map of timers
static ClearTimers(): void;

// Computes and remembers amendments for times to access, start, and stop of timer, and estimates second-order error measured by 10 nested timers
static ComputeAmendments(): void;

// The computed amendmens are returned (for information only)
static GetAmendments(Access?: number, Internal?: number, External?: number, Error10?: number): { Access: number; Internal: number; External: number; Error10: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A tool to facilitate using {@link MoniTool_Timer`MoniTool_Timer`} functionality by automatically ensuring consistency of start/stop actions
MoniTool_TimerSentry: declare class MoniTool_TimerSentry

constructor

Timer(): MoniTool_Timer;

// Manually stops the timer
Stop(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// an TransientElem defines an Element for a specific input class its definition includes the value of the Key to be mapped, and the HashCoder associated to the class of the Key
MoniTool_TransientElem: declare class MoniTool_TransientElem extends MoniTool_Element

constructor

// Returns the contained value
Value(): Standard_Transient;

// Specific testof equality
Equates(other: MoniTool_Element): boolean;

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
