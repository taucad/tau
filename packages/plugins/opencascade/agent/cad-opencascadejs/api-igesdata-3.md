# libcascade — IGESData (3)

14 top-level symbols. Signatures are verbatim typescript.

// Description of basic Protocol for IGES This comprises treatment of IGESModel and Recognition of Undefined-FreeFormat-Entity
IGESData_Protocol: declare class IGESData_Protocol extends Interface_Protocol

constructor

// Gives the count of Resource Protocol
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type Here, Undefined and Free Format Entities have the Number 1
TypeNumber(atype: Standard_Type): number;

// Creates an empty Model for IGES Norm
NewModel(): Interface_InterfaceModel;

// Returns True if <model> is a Model of IGES Norm
IsSuitableModel(model: Interface_InterfaceModel): boolean;

// Creates a new Unknown Entity for IGES (UndefinedEntity)
UnknownEntity(): Standard_Transient;

// Returns True if <ent> is an Unknown Entity for the Norm, i.e
IsUnknownEntity(ent: Standard_Transient): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// gives successive stages of reading an entity (see ParamReader)
IGESData_ReadStage: typeof IGESData_ReadStage[keyof typeof IGESData_ReadStage]

// Defines basic File Access Module, under the control of IGESReaderTool for Reading and IGESWriter for Writing
IGESData_ReadWriteModule: declare class IGESData_ReadWriteModule extends Interface_ReaderModule

// Defines Case Numbers corresponding to the Entity Types taken into account by a sub-class of ReadWriteModule (hence, each sub-class of ReadWriteModule has to redefine this method) Called by CaseNum
CaseIGES(typenum: number, formnum: number): number;

// Writes own parameters to IGESWriter
WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// a SingleParentEntity is a kind of IGESEntity which can refer to a (Single) Parent, from Associativities list of an Entity a effective SingleParent definition entity must inherit it
IGESData_SingleParentEntity: declare class IGESData_SingleParentEntity extends IGESData_IGESEntity

// Returns the parent designated by the Entity, if only one !
SingleParent(): IGESData_IGESEntity;

// Returns the count of Entities designated as children
NbChildren(): number;

// Returns a Child given its rank
Child(num: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_SpecificLib: declare class IGESData_SpecificLib

constructor

// Adds a couple (Module-Protocol) into the global definition set for this class of Library
static SetGlobal(amodule: IGESData_SpecificModule, aprotocol: IGESData_Protocol): void;

// Adds a couple (Module-Protocol) to the Library, given the class of a Protocol
AddProtocol(aprotocol: Standard_Transient): void;

// Clears the list of Modules of a library (can be used to redefine the order of Modules before action
Clear(): void;

// Sets a library to be defined with the complete Global list (all the couples Protocol/Modules recorded in it)
SetComplete(): void;

// Selects a Module from the Library, given an Object
Select(obj: IGESData*IGESEntity, CN?: number): { returnValue: boolean; module*: IGESData_SpecificModule; CN: number; [Symbol.dispose](): void };

// Starts Iteration on the Modules (sets it on the first one)
Start(): void;

// Returns True if there are more Modules to iterate on
More(): boolean;

// Iterates by getting the next Module in the list If there is none, the exception will be raised by Value
Next(): void;

// Returns the current Module in the Iteration
Module(): IGESData_SpecificModule;

// Returns the current Protocol in the Iteration
Protocol(): IGESData_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines some Services which are specifically attached to IGES Entities
IGESData_SpecificModule: declare class IGESData_SpecificModule extends Standard_Transient

// Specific Automatic Correction on own Parameters of an Entity
OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_Status: typeof IGESData_Status[keyof typeof IGESData_Status]

// This Tool determines and gives access to effective Locations of IGES Entities as defined by the IGES Norm
IGESData_ToolLocation: declare class IGESData_ToolLocation extends Standard_Transient

constructor

// Does the effective work of determining Locations of Entities
Load(): void;

// Sets a precision for the Analysis of Locations (default by constructor is 1.E-05)
SetPrecision(prec: number): void;

// Sets the "Reference" information for <child> as being <parent> Sets an Error Status if already set (see method IsAmbiguous)
SetReference(parent: IGESData_IGESEntity, child: IGESData_IGESEntity): void;

// Sets the "Associativity" information for <child> as being <parent> (it must be the Parent itself, not the Associativity)
SetParentAssoc(parent: IGESData_IGESEntity, child: IGESData_IGESEntity): void;

// Resets all information about dependences for <child>
ResetDependences(child: IGESData_IGESEntity): void;

// Unitary action which defines Entities referenced by <ent> (except those in Directory Part and Associativities List) as Dependent (their Locations are related to that of <ent>)
SetOwnAsDependent(ent: IGESData_IGESEntity): void;

// Returns True if <ent> is kind of TransfEntity
IsTransf(ent: IGESData_IGESEntity): boolean;

// Returns True if <ent> is an Associativity (IGES Type 402)
IsAssociativity(ent: IGESData_IGESEntity): boolean;

// Returns True if <ent> has a Transformation Matrix in proper (referenced from its Directory Part)
HasTransf(ent: IGESData_IGESEntity): boolean;

// Returns the Explicit Location defined by the Transformation Matrix of <ent>
ExplicitLocation(ent: IGESData_IGESEntity): gp_GTrsf;

// Returns True if more than one Parent has been determined for <ent>, by adding direct References and Associativities
IsAmbiguous(ent: IGESData_IGESEntity): boolean;

// Returns True if <ent> is dependent from one and only one other Entity, either by Reference or by Associativity
HasParent(ent: IGESData_IGESEntity): boolean;

// Returns the unique Parent recorded for <ent>
Parent(ent: IGESData_IGESEntity): IGESData_IGESEntity;

// Returns True if the Parent, if there is one, is defined by a SingleParentEntity Associativity Else, if HasParent is True, it is by Reference
HasParentByAssociativity(ent: IGESData_IGESEntity): boolean;

// Returns the effective Location of the Parent of <ent>, if there is one
ParentLocation(ent: IGESData_IGESEntity): gp_GTrsf;

// Returns the effective Location of an Entity, i.e
EffectiveLocation(ent: IGESData_IGESEntity): gp_GTrsf;

// Analysis a Location given as a GTrsf, by trying to convert it to a Trsf (i.e
AnalyseLocation(loc: gp_GTrsf, result: gp_Trsf): boolean;
// result: Mutated in place

// Conversion of a Location, from GTrsf form to Trsf form Works with a precision given as argument
static ConvertLocation(prec: number, loc: gp_GTrsf, result: gp_Trsf, uni: number): boolean;
// result: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines required type for Transf in directory part an effective Transf entity must inherits it
IGESData_TransfEntity: declare class IGESData_TransfEntity extends IGESData_IGESEntity

// gives value of the transformation, as a GTrsf To be defined by an effective class of Transformation Entity Warning
Value(): gp_GTrsf;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// undefined (unknown or error) entity specific of IGES DirPart can be correct or not
IGESData_UndefinedEntity: declare class IGESData_UndefinedEntity extends IGESData_IGESEntity

constructor

// says if DirPart is OK or not (if not, it is erroneous) Note that if it is not, Def\* methods can return Error status
IsOKDirPart(): boolean;

// returns Directory Error Status (used for Copy)
DirStatus(): number;

// Erases the Directory Error Status Warning
SetOKDirPart(): void;

// returns Error status if necessary, else calls original method
DefLineFont(): IGESData_DefType;

// returns Error status if necessary, else calls original method
DefLevel(): IGESData_DefList;

// returns Error status if necessary, else calls original method
DefView(): IGESData_DefList;

// returns Error status if necessary, else calls original method
DefColor(): IGESData_DefType;

// returns Error status if necessary, else calls original method (that is, if SubScript field is not blank or positive integer)
HasSubScriptNumber(): boolean;

// writes parameters to IGESWriter, taken from UndefinedContent
WriteOwnParams(IW: IGESData_IGESWriter): void;
// IW: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines required type for ViewKind in directory part that is, Single view or Multiple view An effective ViewKind entity must inherit it and define IsSingle (True for Single, False for List of Views), NbViews and ViewItem (especially for a List)
IGESData_ViewKindEntity: declare class IGESData_ViewKindEntity extends IGESData_IGESEntity

// says if "me" is a Single View (True) or a List of Views (False)
IsSingle(): boolean;

// Returns the count of Views for a List of Views
NbViews(): number;

// Returns the View n0
ViewItem(num: number): IGESData_ViewKindEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_WriterLib: declare class IGESData_WriterLib

constructor

// Adds a couple (Module-Protocol) into the global definition set for this class of Library
static SetGlobal(amodule: IGESData_ReadWriteModule, aprotocol: IGESData_Protocol): void;

// Adds a couple (Module-Protocol) to the Library, given the class of a Protocol
AddProtocol(aprotocol: Standard_Transient): void;

// Clears the list of Modules of a library (can be used to redefine the order of Modules before action
Clear(): void;

// Sets a library to be defined with the complete Global list (all the couples Protocol/Modules recorded in it)
SetComplete(): void;

// Selects a Module from the Library, given an Object
Select(obj: IGESData*IGESEntity, CN?: number): { returnValue: boolean; module*: IGESData_ReadWriteModule; CN: number; [Symbol.dispose](): void };

// Starts Iteration on the Modules (sets it on the first one)
Start(): void;

// Returns True if there are more Modules to iterate on
More(): boolean;

// Iterates by getting the next Module in the list If there is none, the exception will be raised by Value
Next(): void;

// Returns the current Module in the Iteration
Module(): IGESData_ReadWriteModule;

// Returns the current Protocol in the Iteration
Protocol(): IGESData_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_Array1OfIGESEntity: NCollection_Array1_handle_IGESData_IGESEntity

IGESData_HArray1OfIGESEntity: NCollection_HArray1_handle_IGESData_IGESEntity
