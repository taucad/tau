# libcascade — IGESBasic

30 top-level symbols. Signatures are verbatim typescript.

// This package represents basic entities from IGES
IGESBasic: declare class IGESBasic

constructor

// Prepares dynqmic data (Protocol, Modules) for this package
static Init(): void;

// Returns the Protocol for this Package
static Protocol(): IGESBasic_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines AssocGroupType, Type <406> Form <23> in package {@link IGESBasic`IGESBasic`} Used to assign an unambiguous identification to a Group Associativity
IGESBasic_AssocGroupType: declare class IGESBasic_AssocGroupType extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class AssocGroupType
Init(nbDataFields: number, aType: number, aName: TCollection_HAsciiString): void;

// returns the number of parameter data fields, always = 2
NbData(): number;

// returns the type of attached associativity
AssocType(): number;

// returns identifier of instance of specified associativity
Name(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ExternalRefFile, Type <416> Form <1> in package {@link IGESBasic`IGESBasic`} Used when entire reference file is to be instanced
IGESBasic_ExternalRefFile: declare class IGESBasic_ExternalRefFile extends IGESData_IGESEntity

constructor

// This method is used to set the field of the class ExternalRefFile
Init(aFileIdent: TCollection_HAsciiString): void;

// returns External Reference File Identifier
FileId(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ExternalRefFileIndex, Type <402> Form <12> in package {@link IGESBasic`IGESBasic`} Contains a list of the symbolic names used by the referencing files and the DE pointers to the corresponding definitions within the referenced file
IGESBasic_ExternalRefFileIndex: declare class IGESBasic_ExternalRefFileIndex extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ExternalRefFileIndex
Init(aNameArray: NCollection_HArray1_handle_TCollection_HAsciiString, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns number of index entries
NbEntries(): number;

// returns the External Reference Entity symbolic name raises exception if Index <= 0 or Index > `NbEntries()`
Name(Index: number): TCollection_HAsciiString;

// returns the internal entity raises exception if Index <= 0 or Index > `NbEntries()`
Entity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ExternalRefFileName, Type <416> Form <0-2> in package {@link IGESBasic`IGESBasic`} Used when single definition from the reference file is required or for external logical references where an entity in one file relates to an entity in another file
IGESBasic_ExternalRefFileName: declare class IGESBasic_ExternalRefFileName extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ExternalRefFileName
Init(aFileIdent: TCollection_HAsciiString, anExtName: TCollection_HAsciiString): void;

// Changes FormNumber to be 2 if <mode> is True (For Entity) or 0 if <mode> is False (For Definition)
SetForEntity(mode: boolean): void;

// returns External Reference File Identifier
FileId(): TCollection_HAsciiString;

// returns External Reference Entity Symbolic Name
ReferenceName(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ExternalRefLibName, Type <416> Form <4> in package {@link IGESBasic`IGESBasic`} Used when it is assumed that a copy of the subfigure exists in native form in a library on the receiving system
IGESBasic_ExternalRefLibName: declare class IGESBasic_ExternalRefLibName extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ExternalRefLibName
Init(aLibName: TCollection_HAsciiString, anExtName: TCollection_HAsciiString): void;

// returns name of library in which External Reference Entity Symbolic Name resides
LibraryName(): TCollection_HAsciiString;

// returns External Reference Entity Symbolic Name
ReferenceName(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ExternalRefName, Type <416> Form <3> in package {@link IGESBasic`IGESBasic`} Used when it is assumed that a copy of the subfigure exists in native form on the receiving system
IGESBasic_ExternalRefName: declare class IGESBasic_ExternalRefName extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ExternalRefName
Init(anExtName: TCollection_HAsciiString): void;

// returns External Reference Entity Symbolic Name
ReferenceName(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ExternalReferenceFile, Type <406> Form <12> in package {@link IGESBasic`IGESBasic`} References definitions residing in another file
IGESBasic_ExternalReferenceFile: declare class IGESBasic_ExternalReferenceFile extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ExternalReferenceFile
Init(aNameArray: NCollection_HArray1_handle_TCollection_HAsciiString): void;

// returns number of External Reference File Names
NbListEntries(): number;

// returns External Reference File Name raises exception if Index <= 0 or Index > `NbListEntries()`
Name(Index: number): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services for {@link IGESBasic`IGESBasic`} (specific part) This Services comprise
IGESBasic_GeneralModule: declare class IGESBasic_GeneralModule extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Returns a category number which characterizes an entity Structure for Groups, Figures & Co Description for External Refs Auxiliary for other
CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Group, Type <402> Form <1> in package {@link IGESBasic`IGESBasic`} The Group Associativity allows a collection of a set of entities to be maintained as a single, logical entity
IGESBasic_Group: declare class IGESBasic_Group extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Group
Init(allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// Sets a Group to be, or not to be Ordered (according mode)
SetOrdered(mode: boolean): void;

// Sets a Group to be, or not to be WithoutBackP
SetWithoutBackP(mode: boolean): void;

// Returns True if <me> is Ordered
IsOrdered(): boolean;

// Returns True if <me> is WithoutBackP
IsWithoutBackP(): boolean;

// Enforce a new value for the type and form
SetUser(type\_: number, form: number): void;

// Changes the count of item If greater, new items are null If lower, old items are lost
SetNb(nb: number): void;

// returns the number of IGESEntities in the Group
NbEntities(): number;

// returns the specific entity from the Group
Entity(Index: number): IGESData_IGESEntity;

// returns the specific entity from the Group
Value(Index: number): Standard_Transient;

// Sets a new value for item <Index>
SetValue(Index: number, ent: IGESData_IGESEntity): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines GroupWithoutBackP, Type <402> Form <7> in package {@link IGESBasic`IGESBasic`} this class defines a Group without back pointers
IGESBasic_GroupWithoutBackP: declare class IGESBasic_GroupWithoutBackP extends IGESBasic_Group

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfIGESEntity: declare class IGESBasic_HArray1OfHArray1OfIGESEntity extends Standard_Transient

constructor

Lower(): number;

Upper(): number;

Length(): number;

SetValue(num: number, val: NCollection_HArray1_handle_IGESData_IGESEntity): void;

Value(num: number): NCollection_HArray1_handle_IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfInteger: declare class IGESBasic_HArray1OfHArray1OfInteger extends Standard_Transient

constructor

Lower(): number;

Upper(): number;

Length(): number;

SetValue(num: number, val: NCollection_HArray1_int): void;

Value(num: number): NCollection_HArray1_int;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfReal: declare class IGESBasic_HArray1OfHArray1OfReal extends Standard_Transient

constructor

Lower(): number;

Upper(): number;

Length(): number;

SetValue(num: number, val: NCollection_HArray1_double): void;

Value(num: number): NCollection_HArray1_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfXY: declare class IGESBasic_HArray1OfHArray1OfXY extends Standard_Transient

constructor

Lower(): number;

Upper(): number;

Length(): number;

SetValue(num: number, val: NCollection_HArray1_gp_XY): void;

Value(num: number): NCollection_HArray1_gp_XY;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfXYZ: declare class IGESBasic_HArray1OfHArray1OfXYZ extends Standard_Transient

constructor

Lower(): number;

Upper(): number;

Length(): number;

SetValue(num: number, val: NCollection_HArray1_gp_XYZ): void;

Value(num: number): NCollection_HArray1_gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Hierarchy, Type <406> Form <10> in package {@link IGESBasic`IGESBasic`} Provides ability to control the hierarchy of each directory entry attribute
IGESBasic_Hierarchy: declare class IGESBasic_Hierarchy extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Hierarchy
Init(nbPropVal: number, aLineFont: number, aView: number, anEntityLevel: number, aBlankStatus: number, aLineWt: number, aColorNum: number): void;

// returns the number of property values, which should be 6
NbPropertyValues(): number;

// returns the line font
NewLineFont(): number;

// returns the view
NewView(): number;

// returns the entity level
NewEntityLevel(): number;

// returns the blank status
NewBlankStatus(): number;

// returns the line weight
NewLineWeight(): number;

// returns the color number
NewColorNum(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Name, Type <406> Form <15> in package {@link IGESBasic`IGESBasic`} Used to specify a user defined name
IGESBasic_Name: declare class IGESBasic_Name extends IGESData_NameEntity

constructor

// This method is used to set the fields of the class Name
Init(nbPropVal: number, aName: TCollection_HAsciiString): void;

// returns the number of property values, which should be 1
NbPropertyValues(): number;

// returns the user defined Name
Value(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines OrderedGroup, Type <402> Form <14> in package {@link IGESBasic`IGESBasic`} this class defines an Ordered Group with back pointers Allows a collection of a set of entities to be maintained as a single entity, but the group is ordered
IGESBasic_OrderedGroup: declare class IGESBasic_OrderedGroup extends IGESBasic_Group

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines OrderedGroupWithoutBackP, Type <402> Form <15> in package {@link IGESBasic`IGESBasic`} Allows a collection of a set of entities to be maintained as a single entity, but the group is ordered and there are no back pointers
IGESBasic_OrderedGroupWithoutBackP: declare class IGESBasic_OrderedGroupWithoutBackP extends IGESBasic_Group

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Protocol for {@link IGESBasic`IGESBasic`}
IGESBasic_Protocol: declare class IGESBasic_Protocol extends IGESData_Protocol

constructor

// Gives the count of Resource Protocol
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type This Case Number is then used in Libraries
TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines basic File Access Module for {@link IGESBasic`IGESBasic`} (specific parts) Specific actions concern
IGESBasic_ReadWriteModule: declare class IGESBasic_ReadWriteModule extends IGESData_ReadWriteModule

constructor

// Defines Case Numbers for Entities of {@link IGESBasic`IGESBasic`}
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

// defines SingleParent, Type <402> Form <9> in package {@link IGESBasic`IGESBasic`} It defines a logical structure of one independent (parent) entity and one or more subordinate (children) entities
IGESBasic_SingleParent: declare class IGESBasic_SingleParent extends IGESData_SingleParentEntity

constructor

// This method is used to set the fields of the class SingleParent
Init(nbParentEntities: number, aParentEntity: IGESData_IGESEntity, allChildren: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns the number of Parent Entities, which should be 1
NbParentEntities(): number;

// Returns the Parent Entity (inherited method)
SingleParent(): IGESData_IGESEntity;

// returns the number of children of the Parent
NbChildren(): number;

// returns the specific child as indicated by Index raises exception if Index <= 0 or Index > `NbChildren()`
Child(num: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines SingularSubfigure, Type <408> Form <0> in package {@link IGESBasic`IGESBasic`} Defines the occurrence of a single instance of the defined Subfigure
IGESBasic_SingularSubfigure: declare class IGESBasic_SingularSubfigure extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SingularSubfigure
Init(aSubfigureDef: IGESBasic_SubfigureDef, aTranslation: gp_XYZ, hasScale: boolean, aScale: number): void;

// returns the subfigure definition entity
Subfigure(): IGESBasic_SubfigureDef;

// returns the X, Y, Z coordinates
Translation(): gp_XYZ;

// returns the scale factor if hasScaleFactor is False, returns 1.0 (default)
ScaleFactor(): number;

// returns a boolean indicating whether scale factor is present or not
HasScaleFactor(): boolean;

// returns the Translation after transformation
TransformedTranslation(): gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Services attached to IGES Entities
IGESBasic_SpecificModule: declare class IGESBasic_SpecificModule extends IGESData_SpecificModule

constructor

// Performs non-ambiguous Corrections on Entities which support them (AssocGroupType,Hierarchy,Name,SingleParent)
OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines SubfigureDef, Type <308> Form <0> in package {@link IGESBasic`IGESBasic`} This Entity permits a single definition of a detail to be utilized in multiple instances in the creation of the whole picture
IGESBasic_SubfigureDef: declare class IGESBasic_SubfigureDef extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class SubfigureDef
Init(aDepth: number, aName: TCollection_HAsciiString, allAssocEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns depth of the Subfigure if theDepth = 0 - No reference to any subfigure instance
Depth(): number;

// returns the name of Subfigure
Name(): TCollection_HAsciiString;

// returns number of entities
NbEntities(): number;

// returns the specific entity as indicated by Index raises exception if Index <= 0 or Index > `NbEntities()`
AssociatedEntity(Index: number): IGESData_IGESEntity;

// returns the specific entity as indicated by Index raises exception if Index <= 0 or Index > `NbEntities()`
Value(Index: number): Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a AssocGroupType
IGESBasic_ToolAssocGroupType: declare class IGESBasic_ToolAssocGroupType

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_AssocGroupType, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a AssocGroupType (NbData forced to 2)
OwnCorrect(ent: IGESBasic_AssocGroupType): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESBasic_AssocGroupType): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_AssocGroupType, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_AssocGroupType, entto: IGESBasic_AssocGroupType, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ExternalRefFile
IGESBasic_ToolExternalRefFile: declare class IGESBasic_ToolExternalRefFile

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_ExternalRefFile, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESBasic_ExternalRefFile): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_ExternalRefFile, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_ExternalRefFile, entto: IGESBasic_ExternalRefFile, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ExternalRefFileIndex
IGESBasic_ToolExternalRefFileIndex: declare class IGESBasic_ToolExternalRefFileIndex

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_ExternalRefFileIndex, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESBasic_ExternalRefFileIndex): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_ExternalRefFileIndex, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_ExternalRefFileIndex, entto: IGESBasic_ExternalRefFileIndex, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ExternalRefFileName
IGESBasic_ToolExternalRefFileName: declare class IGESBasic_ToolExternalRefFileName

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_ExternalRefFileName, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESBasic_ExternalRefFileName): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_ExternalRefFileName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_ExternalRefFileName, entto: IGESBasic_ExternalRefFileName, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
