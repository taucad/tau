# libcascade — IGESSelect (2)

13 top-level symbols. Signatures are verbatim typescript.

// This selection looks at Blank Status of IGES Entities Direct selection keeps Visible Entities (Blank = 0), Reverse selection keeps Blanked Entities (Blank = 1)
IGESSelect_SelectVisibleStatus: declare class IGESSelect_SelectVisibleStatus extends IFSelect_SelectExtract

constructor

// Returns True if <ent> is an IGES Entity with Blank Status = 0
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns the Selection criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Sets a Global (Header) Parameter to a new value, directly given Controls the form of the parameter (Integer, Real, String with such or such form), but not the consistence of the new value regarding the rest of the file
IGESSelect_SetGlobalParameter: declare class IGESSelect_SetGlobalParameter extends IGESSelect_ModelModifier

constructor

// Returns the global parameter number to which this modifiers applies
GlobalNumber(): number;

// Sets a Text Parameter for the new value
SetValue(text: TCollection_HAsciiString): void;

// Returns the value to set to the global parameter (Text Param)
Value(): TCollection_HAsciiString;

// Returns a text which is "Sets Global Parameter <numpar> to <new value>"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Sets/Clears Short Label of Entities, those designated by the Selection
IGESSelect_SetLabel: declare class IGESSelect_SetLabel extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Clear Short Label" or "Set Label to DE" With possible additional information " (enforced)"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Sets IGES Version (coded in global parameter 23) to be at least IGES 5.1
IGESSelect_SetVersion5: declare class IGESSelect_SetVersion5 extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Update IGES Version to 5.1"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Gives Color attached to an entity Several forms are possible, according to <mode> 1
IGESSelect_SignColor: declare class IGESSelect_SignColor extends IFSelect_Signature

constructor

// Returns the value (see above)
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Gives D.E
IGESSelect_SignLevelNumber: declare class IGESSelect_SignLevelNumber extends IFSelect_Signature

constructor

// Returns the value (see above)
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Gives D.E
IGESSelect_SignStatus: declare class IGESSelect_SignStatus extends IFSelect_Signature

constructor

// Returns the value (see above)
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

// Performs the match rule (see above)
Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This type of Transformer allows to convert Spline Curves (IGES type 112) and Surfaces (IGES Type 126) to BSpline Curves (IGES type 114) and Surfac (IGES Type 128)
IGESSelect_SplineToBSpline: declare class IGESSelect_SplineToBSpline extends IFSelect_Transformer

constructor

// Returns the option TryC2 given at creation time
OptionTryC2(): boolean;

// Returns the transformed entities
Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Returns a text which defines the way a Transformer works
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Allows to Change the Creation Date indication in the Header (Global Section) of IGES File
IGESSelect_UpdateCreationDate: declare class IGESSelect_UpdateCreationDate extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Update IGES Header Creation Date"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Sets the File Name in Header to be the actual name of the file If new file name is unknown, the former one is kept Remark
IGESSelect_UpdateFileName: declare class IGESSelect_UpdateFileName extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Updates IGES File Name to new current one"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Allows to Change the Last Change Date indication in the Header (Global Section) of IGES File
IGESSelect_UpdateLastChange: declare class IGESSelect_UpdateLastChange extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Update IGES Header Last Change Date"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Sorts IGES Entities on the views and drawings
IGESSelect_ViewSorter: declare class IGESSelect_ViewSorter extends Standard_Transient

constructor

// Sets the Model (for PacketList)
SetModel(model: IGESData_IGESModel): void;

// Clears recorded data
Clear(): void;

// Adds an item according its type
Add(ent: Standard_Transient): boolean;

// Adds an IGES entity
AddEntity(igesent: IGESData_IGESEntity): boolean;

// Adds a list of entities by adding each of the items
AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

// Adds all the entities contained in a Model
AddModel(model: Interface_InterfaceModel): void;

// Returns the count of already recorded
NbEntities(): number;

// Prepares the result to keep only sets attached to Single Views If <alsoframes> is given True, it keeps also the Drawings as specific sets, in order to get their frames
SortSingleViews(alsoframes: boolean): void;

// Returns the count of sets recorded, one per distinct item
NbSets(final: boolean): number;

// Returns the Item which is attached to a set of entities For <final> and definition of sets, see method NbSets
SetItem(num: number, final: boolean): IGESData_IGESEntity;

// Returns the complete content of the determined Sets, which include Duplicated and Remaining (duplication 0) lists For <final> and definition of sets, see method NbSets
Sets(final: boolean): IFSelect_PacketList;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Performs Read and Write an IGES File with an IGES Model
IGESSelect_WorkLibrary: declare class IGESSelect_WorkLibrary extends IFSelect_WorkLibrary

constructor

// Reads a IGES File and returns a IGES Model (into <mod>), or lets <mod> "Null" in case of Error Returns 0 if OK, 1 if Read Error, -1 if File not opened
ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

// Writes a File from a IGES Model (brought by <ctx>) Returns False (and writes no file) if <ctx> is not for IGES
WriteFile(ctx: IFSelect_ContextWrite): boolean;

// Defines a protocol to be adequate for IGES (encompasses ALL the IGES norm including {@link IGESSolid `IGESSolid`}, {@link IGESAppli `IGESAppli`})
static DefineProtocol(): IGESData_Protocol;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
