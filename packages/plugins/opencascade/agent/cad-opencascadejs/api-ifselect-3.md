# libcascade — IFSelect (3)

18 top-level symbols. Signatures are verbatim typescript.

// This type of Selection is intended to describe a direct selection without an explicit criterium, for instance the result of picking viewed entities on a graphic screen
IFSelect_SelectPointed: declare class IFSelect_SelectPointed extends IFSelect_SelectBase

constructor

// Clears the list of selected items Also says the list is unset All Add\* methods and SetList say the list is set
Clear(): void;

// Tells if the list has been set
IsSet(): boolean;

// As SetList but with only one entity If <ent> is Null, the list is said as being set but is empty
SetEntity(item: Standard_Transient): void;

// Sets a given list to define the list of selected items be empty or null
SetList(list: NCollection_HSequence_handle_Standard_Transient): void;

// Adds an item
Add(item: Standard_Transient): boolean;

// Removes an item
Remove(item: Standard_Transient): boolean;

// Toggles status of an item
Toggle(item: Standard_Transient): boolean;

// Adds all the items defined in a list
AddList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

// Removes all the items defined in a list
RemoveList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

// Toggles status of all the items defined in a list
ToggleList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

// Returns the rank of an item in the selected list, or 0
Rank(item: Standard_Transient): number;

// Returns the count of selected items
NbItems(): number;

// Returns an item given its rank, or a Null Handle
Item(num: number): Standard_Transient;

// Rebuilds the selected list
Update(control: Interface_CopyControl): void;
Update(trf: IFSelect_Transformer): void;
Update(control: Interface_CopyControl): void;
Update(trf: IFSelect_Transformer): void;

// Returns a text which identifies the type of selection made
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectRange keeps or rejects a sub-set of the input set, that is the Entities of which rank in the iteration list is in a given range (for instance form 2nd to 6th, etc...)
IFSelect_SelectRange: declare class IFSelect_SelectRange extends IFSelect_SelectExtract

constructor

// Returns True if a Lower limit is defined
HasLower(): boolean;

// Returns Value of Lower Limit (0 if none is defined)
LowerValue(): number;

// Returns True if a Lower limit is defined
HasUpper(): boolean;

// Returns Value of Upper Limit (0 if none is defined)
UpperValue(): number;

// Returns True for an Entity of which occurrence number in the iteration is inside the selected Range (considers <rank>)
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectRootComps sorts the Entities which are part of Strong Components, local roots of a set of Entities
IFSelect_SelectRootComps: declare class IFSelect_SelectRootComps extends IFSelect_SelectExtract

constructor

// Returns always True, because RootResult has done work
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectRoots sorts the Entities which are local roots of a set of Entities (not shared by other Entities inside this set, even if they are shared by other Entities outside it)
IFSelect_SelectRoots: declare class IFSelect_SelectRoots extends IFSelect_SelectExtract

constructor

// Returns always True, because RootResult has done work
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class returns entities according sending to a file Once a model has been loaded, further sendings are recorded as status in the graph (for each value, a count of sendings)
IFSelect_SelectSent: declare class IFSelect_SelectSent extends IFSelect_SelectExtract

constructor

// Returns the queried count of sending
SentCount(): number;

// Returns the <atleast> status, True for sending at least the sending count, False for sending exactly the sending count Remark
AtLeast(): boolean;

// Returns always False because RootResult has done the work
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectShared selects Entities which are directly Shared by the Entities of the Input list
IFSelect_SelectShared: declare class IFSelect_SelectShared extends IFSelect_SelectDeduct

constructor

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectSharing selects Entities which directly Share (Level One) the Entities of the Input list Remark
IFSelect_SelectSharing: declare class IFSelect_SelectSharing extends IFSelect_SelectDeduct

constructor

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectSignature sorts the Entities on a Signature Matching
IFSelect_SelectSignature: declare class IFSelect_SelectSignature extends IFSelect_SelectExtract

constructor

// Returns the used Signature, then it is possible to access it, modify it as required
Signature(): IFSelect_Signature;

// Returns the used SignCounter
Counter(): IFSelect_SignCounter;

// Not called, defined only to remove a deferred method here
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns Text used to Sort Entity on its Signature or SignCounter
SignatureText(): TCollection_AsciiString;

// Returns True if match must be exact
IsExact(): boolean;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// In the graph, explore the Shareds of the input entities, until it encounters some which match a given Signature (for a limited level, filters the returned list) By default, fitted for any level
IFSelect_SelectSignedShared: declare class IFSelect_SelectSignedShared extends IFSelect_SelectExplore

constructor

// Returns the used Signature, then it is possible to access it, modify it as required
Signature(): IFSelect_Signature;

// Returns Text used to Sort Entity on its Signature
SignatureText(): TCollection_AsciiString;

// Returns True if match must be exact
IsExact(): boolean;

// Returns a text defining the criterium
ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// In the graph, explore the sharings of the input entities, until it encounters some which match a given Signature (for a limited level, filters the returned list) By default, fitted for any level
IFSelect_SelectSignedSharing: declare class IFSelect_SelectSignedSharing extends IFSelect_SelectExplore

constructor

// Returns the used Signature, then it is possible to access it, modify it as required
Signature(): IFSelect_Signature;

// Returns Text used to Sort Entity on its Signature
SignatureText(): TCollection_AsciiString;

// Returns True if match must be exact
IsExact(): boolean;

// Returns a text defining the criterium
ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectSuite can describe a suite of SelectDeduct as a unique one
IFSelect_SelectSuite: declare class IFSelect_SelectSuite extends IFSelect_SelectDeduct

constructor

// Adds an input selection
AddInput(item: IFSelect_Selection): boolean;

// Adds a new first item (prepends to the list)
AddPrevious(item: IFSelect_SelectDeduct): void;

// Adds a new last item (prepends to the list) If is null, does nothing
AddNext(item: IFSelect_SelectDeduct): void;

// Returns the count of Items
NbItems(): number;

// Returns an item from its rank in the list (the Input is always apart)
Item(num: number): IFSelect_SelectDeduct;

// Sets a value for the Label
SetLabel(lab: string): void;

// Returns the Label Either it has been defined by SetLabel, or it will give "Suite of nn Selections"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectType keeps or rejects Entities of which the Type is Kind of a given Cdl Type
IFSelect_SelectType: declare class IFSelect_SelectType extends IFSelect_SelectAnyType

constructor

// Sets a TYpe for filter
SetType(atype: Standard_Type): void;

// Returns the Type to be matched for select
TypeForMatch(): Standard_Type;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectUnion cumulates the Entities issued from several other Selections (union of results
IFSelect_SelectUnion: declare class IFSelect_SelectUnion extends IFSelect_SelectCombine

constructor

// Returns a text defining the criterium
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SelectUnknownEntities sorts the Entities which are qualified as "Unknown" (their Type has not been recognized)
IFSelect_SelectUnknownEntities: declare class IFSelect_SelectUnknownEntities extends IFSelect_SelectExtract

constructor

// Returns True for an Entity which is qualified as "Unknown", i.e
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns a text defining the criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Selection allows to define a set of Interface Entities
IFSelect_Selection: declare class IFSelect_Selection extends Standard_Transient

// Returns a text which defines the criterium applied by a Selection (can be used to be printed, displayed ...) Specific to each class
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an Iterator on a list of Selections
IFSelect_SelectionIterator: declare class IFSelect_SelectionIterator

constructor

// Adds a Selection to an iterator (if not yet noted)
AddItem(sel: IFSelect_Selection): void;

// Adds a list of Selections to an iterator (this list comes from the description of a Selection or a Dispatch, etc...)
AddList(list: NCollection_Sequence_handle_IFSelect_Selection): void;

// Returns True if there are more Selections to get
More(): boolean;

// Sets iterator to the next item
Next(): void;

// Returns the current Selection being iterated Error if count of Selection has been passed
Value(): IFSelect_Selection;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SessionDumper is called by SessionFile
IFSelect_SessionDumper: declare class IFSelect_SessionDumper extends Standard_Transient

// Returns the First item of the Library of Dumper
static First(): IFSelect_SessionDumper;

// Returns the Next SesionDumper in the Library
Next(): IFSelect_SessionDumper;

// Writes the Own Parameters of a given Item, if it forecast to manage its Type
WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

// Recognizes a Type (given as <type>) then Creates an Item of this Type with the Own Parameter, as required
ReadOwn(file: IFSelect*SessionFile, type*: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SessionFile is intended to manage access between a WorkSession and an Ascii Form, to be considered as a Dump
IFSelect_SessionFile: declare class IFSelect_SessionFile

constructor

// Clears the lines recorded whatever for writing or for reading
ClearLines(): void;

// Returns the count of recorded lines
NbLines(): number;

// Returns a line given its rank in the list of recorded lines
Line(num: number): TCollection_AsciiString;

// Adds a line to the list of recorded lines
AddLine(line: string): void;

// Removes the last line
RemoveLastLine(): void;

// Writes the recorded lines to a file named <name> then clears the list of lines
WriteFile(name: string): boolean;

// Reads the recorded lines from a file named <name>, after having cleared the list (stops if RecognizeFile fails) Returns False (with no clearing) if the file could not be read
ReadFile(name: string): boolean;

// Recognizes the header line
RecognizeFile(headerline: string): boolean;

// Performs a Write Operation from a WorkSession to a File i.e
Write(filename: string): number;

// Performs a Read Operation from a file to a WorkSession i.e
Read(filename: string): number;

// Prepares the Write operation from a WorkSession ({@link IFSelect`IFSelect`}) to a File, i.e
WriteSession(): number;

// Writes the trailing line
WriteEnd(): number;

// Writes a line to the File
WriteLine(line: string, follow?: string): void;

// Writes the Parameters own to each type of Item
WriteOwn(item: Standard_Transient): boolean;

// Performs a Read Operation from a File to a WorkSession, i.e
ReadSession(): number;

// Reads the end of a file (its last line)
ReadEnd(): number;

// Reads a Line and splits it into a set of alphanumeric items, which can then be queried by NbParams/ParamValue ..
ReadLine(): boolean;

// Internal routine which processes a line into words and prepares its exploration
SplitLine(line: string): void;

// Tries to Read an Item, by calling the Library of Dumpers Sets the list of parameters of the line to be read from the first own one
ReadOwn(): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

// Adds an Item to the WorkSession, taken as Name the first item of the read Line
AddItem(item: Standard_Transient, active?: boolean): void;

// Returns True if the last Read or Write operation has been correctly performed
IsDone(): boolean;

// Returns the WorkSession on which a SessionFile works
WorkSession(): IFSelect_WorkSession;

// At beginning of writing an Item, writes its basics
NewItem(ident: number, par: Standard_Transient): void;

// Sets Parameters to be sent as Own if <mode> is True (their Name or Number or Void Mark or Text Value is preceded by a Column sign ':') else they are sent normally Hence, the Own Parameter are clearly identified in the File
SetOwn(mode: boolean): void;

// During a Write action, commands to send a Void Parameter i.e
SendVoid(): void;

// During a Write action, commands to send the identification of a Parameter
SendItem(par: Standard_Transient): void;

// During a Write action, commands to send a Text without interpretation
SendText(text: string): void;

// Sets the rank of Last General Parameter to a new value
SetLastGeneral(lastgen: number): void;

// During a Read operation, SessionFile processes sequentially the Items to read
NbParams(): number;

// Returns True if a Parameter, given its rank in the Own List (see NbOwnParams), is Void
IsVoid(num: number): boolean;

// Returns True if a Parameter, in the Own List (see NbOwnParams) is a Text (between "...")
IsText(num: number): boolean;

// Returns a Parameter (alphanumeric item of a line) as it has been read
ParamValue(num: number): TCollection_AsciiString;

// Returns the content of a Text Parameter (without the quotes)
TextValue(num: number): TCollection_AsciiString;

// Returns a Parameter as an Item
ItemValue(num: number): Standard_Transient;

// Specific Destructor (closes the File if not yet done)
Destroy(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
