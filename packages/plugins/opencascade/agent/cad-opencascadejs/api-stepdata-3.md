# libcascade — StepData (3)

2 top-level symbols. Signatures are verbatim typescript.

// manages atomic file writing, under control of StepModel (for general organisation of file) and each class of Transient (for its own parameters)
StepData_StepWriter: declare class StepData_StepWriter

constructor

// ModeLabel controls how to display entity ids
LabelMode(): number;

// TypeMode controls the type form to use
TypeMode(): number;

// Returns the embedded FloatWriter, which controls sending Reals Use this method to access FloatWriter in order to consult or change its options (MainFormat, FormatForRange,ZeroSuppress), because it is returned as the address of its field
FloatWriter(): Interface_FloatWriter;

// Declares the Entity Number <numscope> to correspond to a Scope which contains the Entity Number <numin>
SetScope(numscope: number, numin: number): void;

// Returns True if an Entity identified by its Number is in a Scope
IsInScope(num: number): boolean;

// Sends the complete Model, included HEADER and DATA Sections Works with a WriterLib defined through a Protocol If <headeronly> is given True, only the HEADER Section is sent (used to Dump the Header of a StepModel)
SendModel(protocol: StepData_Protocol, headeronly?: boolean): void;

// Begins model header
SendHeader(): void;

// Begins data section
SendData(): void;

// Send an Entity of the Data Section
SendEntity(nument: number, lib: StepData_WriterLib): void;

// sets end of section
EndSec(): void;

// sets end of file
EndFile(): void;

// flushes current line
NewLine(evenempty: boolean): void;

// joins current line to last one, only if new length is 72 max if newline is True, a new current line begins
JoinLast(newline: boolean): void;

// asks that further indentations will begin at position of entity first opening bracket
Indent(onent: boolean): void;

// begins an entity with an ident plus '=' (at beginning of line) entity ident is its Number given by the containing Model Warning
SendIdent(ident: number): void;

// sets a begin of Scope (ends this line)
SendScope(): void;

// sets an end of Scope (on a separate line)
SendEndscope(): void;

// sets a comment mark
Comment(mode: boolean): void;

// sends a comment
SendComment(text: TCollection_HAsciiString): void;
SendComment(text: string): void;
SendComment(text: TCollection_HAsciiString): void;
SendComment(text: string): void;

// sets entity's StepType, opens brackets, starts param no to 0 params are separated by comma Remark
StartEntity(atype: TCollection_AsciiString): void;

// sends the start of a complex entity, which is a simple open bracket (without increasing bracket level) It must be called JUST AFTER SendEntity and BEFORE sending components, each one begins by StartEntity
StartComplex(): void;

// sends the end of a complex entity
EndComplex(): void;

// Sends the content of a field, controlled by its descriptor If the descriptor is not defined, follows the description detained by the field itself
SendField(fild: StepData_Field, descr: StepData_PDescr): void;

// Sends a SelectMember, which cab be named or not
SendSelect(sm: StepData_SelectMember, descr: StepData_PDescr): void;

// Send the content of an entity as being a FieldList controlled by its descriptor
SendList(list: StepData_FieldList, descr: StepData_ESDescr): void;

// open a sublist by a '('
OpenSub(): void;

// open a sublist with its type then a '('
OpenTypedSub(subtype: string): void;

// closes a sublist by a ')'
CloseSub(): void;

// prepares adding a parameter (that is, adds ',' except for first one)
AddParam(): void;

// sends an integer parameter sends a real parameter (works with FloatWriter) sends a text given as string (it will be set between '...') sends a reference to an entity (its identifier with '#') REMARK 1
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_AsciiString): void;
Send(val: Standard_Transient): void;
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_AsciiString): void;
Send(val: Standard_Transient): void;
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_AsciiString): void;
Send(val: Standard_Transient): void;
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_AsciiString): void;
Send(val: Standard_Transient): void;

// sends a Boolean as .T
SendBoolean(val: boolean): void;

// sends a Logical as .T
SendLogical(val: StepData_Logical): void;

// sends a string exactly as it is given
SendString(val: TCollection_AsciiString): void;
SendString(val: string): void;
SendString(val: TCollection_AsciiString): void;
SendString(val: string): void;

// sends an enum given by String (literal expression) adds '.' around it if not done Remark
SendEnum(val: TCollection_AsciiString): void;
SendEnum(val: string): void;
SendEnum(val: TCollection_AsciiString): void;
SendEnum(val: string): void;

// sends an array of real
SendArrReal(anArr: NCollection_HArray1_double): void;

// sends an undefined (optional absent) parameter (by '$')
SendUndef(): void;

// sends a "Derived" parameter (by '\*')
SendDerived(): void;

// sends end of entity (closing bracket plus ';') Error if count of opened-closed brackets is not null
EndEntity(): void;

// Returns count of Lines
NbLines(): number;

// Returns a Line given its rank in the File
Line(num: number): TCollection_HAsciiString;

static CleanTextForSend(theText: TCollection_AsciiString): TCollection_AsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepData_WriterLib: declare class StepData_WriterLib

constructor

// Adds a couple (Module-Protocol) into the global definition set for this class of Library
static SetGlobal(amodule: StepData_ReadWriteModule, aprotocol: StepData_Protocol): void;

// Adds a couple (Module-Protocol) to the Library, given the class of a Protocol
AddProtocol(aprotocol: Standard_Transient): void;

// Clears the list of Modules of a library (can be used to redefine the order of Modules before action
Clear(): void;

// Sets a library to be defined with the complete Global list (all the couples Protocol/Modules recorded in it)
SetComplete(): void;

// Selects a Module from the Library, given an Object
Select(obj: Standard*Transient, CN?: number): { returnValue: boolean; module*: StepData_ReadWriteModule; CN: number; [Symbol.dispose](): void };

// Starts Iteration on the Modules (sets it on the first one)
Start(): void;

// Returns True if there are more Modules to iterate on
More(): boolean;

// Iterates by getting the next Module in the list If there is none, the exception will be raised by Value
Next(): void;

// Returns the current Module in the Iteration
Module(): StepData_ReadWriteModule;

// Returns the current Protocol in the Iteration
Protocol(): StepData_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
