# libcascade — IGESData (2)

12 top-level symbols. Signatures are verbatim typescript.

// defines root of IGES Entity definition, including Directory Part, lists of (optional) Properties and Associativities
IGESData_IGESEntity: declare class IGESData_IGESEntity extends Standard_Transient

// gives IGES typing info (includes "Type" and "Form" data)
IGESType(): IGESData_IGESType;

// gives IGES Type Number (often coupled with Form Number)
TypeNumber(): number;

// Returns the form number for that type of an IGES entity
FormNumber(): number;

// Returns the Entity which has been recorded for a given Field Number, i.e
DirFieldEntity(fieldnum: number): IGESData_IGESEntity;

// returns True if an IGESEntity is defined with a Structure (it is normally reserved for certain classes, such as Macros)
HasStructure(): boolean;

// Returns Structure (used by some types of IGES Entities only) Returns a Null Handle if Structure is not defined
Structure(): IGESData_IGESEntity;

// Returns the definition status of LineFont
DefLineFont(): IGESData_DefType;

// Returns LineFont definition as an Integer (if defined as Rank) If LineFont is defined as an Entity, returns a negative value
RankLineFont(): number;

// Returns LineFont as an Entity (if defined as Reference) Returns a Null Handle if DefLineFont is not "DefReference"
LineFont(): IGESData_LineFontEntity;

// Returns the definition status of Level
DefLevel(): IGESData_DefList;

// Returns the level the entity belongs to
Level(): number;

// Returns LevelList if Level is defined as a list
LevelList(): IGESData_LevelListEntity;

// Returns the definition status of the view
DefView(): IGESData_DefList;

// Returns the view of this IGES entity
View(): IGESData_ViewKindEntity;

// Returns the view as a single view if it was defined as such and not as a list of views
SingleView(): IGESData_ViewKindEntity;

// Returns the view of this IGES entity as a list
ViewList(): IGESData_ViewKindEntity;

// Returns True if a Transformation Matrix is defined
HasTransf(): boolean;

// Returns the Transformation Matrix (under IGES definition) Returns a Null Handle if there is none for a more complete use, see Location & CompoundLocation
Transf(): IGESData_TransfEntity;

// Returns True if a LabelDisplay mode is defined for this entity
HasLabelDisplay(): boolean;

// Returns the Label Display Associativity Entity if there is one
LabelDisplay(): IGESData_LabelDisplayEntity;

// gives Blank Status (0 visible, 1 blanked)
BlankStatus(): number;

// gives Subordinate Switch (0-1-2-3)
SubordinateStatus(): number;

// gives Entity's Use Flag (0 to 5)
UseFlag(): number;

// gives Hierarchy status (0-1-2)
HierarchyStatus(): number;

// Returns the LineWeight Number (0 not defined), see also LineWeight
LineWeightNumber(): number;

// Returns the true Line Weight, computed from LineWeightNumber and Global Parameter in the Model by call to SetLineWeight
LineWeight(): number;

// Returns the definition status of Color
DefColor(): IGESData_DefType;

// Returns the color definition as an integer value if the color was defined as a rank
RankColor(): number;

// Returns the IGES entity which describes the color of the entity
Color(): IGESData_ColorEntity;

// returns "reserved" alphanumeric values res1 and res2 res1 and res2 have to be reserved as Character[9 at least] (remark
CResValues(res1: string, res2: string): boolean;

// Returns true if a short label is defined
HasShortLabel(): boolean;

// Returns the label value for this IGES entity as a string
ShortLabel(): TCollection_HAsciiString;

// Returns true if a subscript number is defined
HasSubScriptNumber(): boolean;

// Returns the integer subscript number used to identify this IGES entity
SubScriptNumber(): number;

// Initializes a directory field as an Entity of any kind See DirFieldEntity for more details
InitDirFieldEntity(fieldnum: number, ent: IGESData_IGESEntity): void;

// Initializes Transf, or erases it if <ent> is given Null
InitTransf(ent: IGESData_TransfEntity): void;

// Initializes View, or erases it if <ent> is given Null
InitView(ent: IGESData_ViewKindEntity): void;

// Initializes LineFont
InitLineFont(ent: IGESData_LineFontEntity, rank?: number): void;

// Initializes Level
InitLevel(ent: IGESData_LevelListEntity, val?: number): void;

// Initializes Color data
InitColor(ent: IGESData_ColorEntity, rank?: number): void;

// Initializes the Status of Directory Part
InitStatus(blank: number, subordinate: number, useflag: number, hierarchy: number): void;

// Sets a new Label to an IGES Entity If is given, it sets value of SubScriptNumber else, SubScriptNumber is erased
SetLabel(label: TCollection_HAsciiString, sub?: number): void;

// Initializes various data (those not yet seen above), or erases them if they are given as Null (Zero for <weightnum>)
InitMisc(str: IGESData_IGESEntity, lab: IGESData_LabelDisplayEntity, weightnum: number): void;

// Returns True if an entity has one and only one parent, defined by a SingleParentEntity Type Associativity (explicit sharing)
HasOneParent(): boolean;

// Returns the Unique Parent (in the sense given by HasOneParent) Error if there is none or several
UniqueParent(): IGESData_IGESEntity;

// Returns Location given by Transf in Directory Part (see above) It must be considered for local definition
Location(): gp_GTrsf;

// Returns Location considered for Vectors, i.e
VectorLocation(): gp_GTrsf;

// Returns Location by taking in account a Parent which has its own Location
CompoundLocation(): gp_GTrsf;

// says if a Name is defined, as Short Label or as Name Property (Property is looked first, else ShortLabel is considered)
HasName(): boolean;

// returns Name value as a String (Property Name or ShortLabel) if SubNumber is defined, it is concatenated after ShortLabel as follows label(number)
NameValue(): TCollection_HAsciiString;

// Returns True if the Entity is defined with an Associativity list, even empty (that is, file contains its length 0) Else, the file contained NO idencation at all about this list
ArePresentAssociativities(): boolean;

// gives number of recorded associativities (0 no list defined)
NbAssociativities(): number;

// gives how many Associativities have a given type
NbTypedAssociativities(atype: Standard_Type): number;

// returns the Associativity of a given Type (if only one exists) Error if none or more than one
TypedAssociativity(atype: Standard_Type): IGESData_IGESEntity;

// Sets "me" in the Associativity list of another Entity
Associate(ent: IGESData_IGESEntity): void;

// Resets "me" from the Associativity list of another Entity
Dissociate(ent: IGESData_IGESEntity): void;

// Returns True if the Entity is defined with a Property list, even empty (that is, file contains its length 0) Else, the file contained NO idencation at all about this list
ArePresentProperties(): boolean;

// Gives number of recorded properties (0 no list defined)
NbProperties(): number;

// gives how many Properties have a given type
NbTypedProperties(atype: Standard_Type): number;

// returns the Property of a given Type Error if none or more than one
TypedProperty(atype: Standard_Type, anum?: number): IGESData_IGESEntity;

// Adds a Property in the list
AddProperty(ent: IGESData_IGESEntity): void;

// Removes a Property from the list
RemoveProperty(ent: IGESData_IGESEntity): void;

// computes and sets "true" line weight according IGES rules from global data MaxLineWeight (maxv) and LineWeightGrad (gradw), or sets it to defw (Default) if LineWeightNumber is null
SetLineWeight(defw: number, maxw: number, gradw: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the file header and entities for IGES files
IGESData_IGESModel: declare class IGESData_IGESModel extends Interface_InterfaceModel

constructor

// Erases all data specific to IGES file Header (Start + Global)
ClearHeader(): void;

// Returns Model's Start Section (list of comment lines)
StartSection(): NCollection_HSequence_handle_TCollection_HAsciiString;

// Returns the count of recorded Start Lines
NbStartLines(): number;

// Returns a line from the IGES file Start section by specifying its number
StartLine(num: number): string;

// Clears the IGES file Start Section
ClearStartSection(): void;

// Sets a new Start section from a list of strings
SetStartSection(list: NCollection_HSequence_handle_TCollection_HAsciiString, copy?: boolean): void;

// Adds a new string to the existing Start section at the end if atnum is 0 or not given, or before atnumth line
AddStartLine(line: string, atnum?: number): void;

// Returns the Global section of the IGES file
GlobalSection(): IGESData_GlobalSection;

// Returns the Global section of the IGES file
ChangeGlobalSection(): IGESData_GlobalSection;

// Sets the Global section of the IGES file
SetGlobalSection(header: IGESData_GlobalSection): void;

// Sets some of the Global section parameters with the values defined by the translation parameters
ApplyStatic(param?: string): boolean;

// Returns an IGES entity given by its rank number
Entity(num: number): IGESData_IGESEntity;

// Returns the equivalent DE Number for an Entity, i.e
DNum(ent: IGESData_IGESEntity): number;

// gets Header (GlobalSection) from another Model
GetFromAnother(other: Interface_InterfaceModel): void;

// Returns a New Empty Model, same type as <me> i.e
NewEmptyModel(): Interface_InterfaceModel;

// Checks that the IGES file Global section contains valid data that conforms to the IGES specifications
VerifyCheck(): { ach: Interface_Check; [Symbol.dispose](): void };

// Sets LineWeights of contained Entities according header data (MaxLineWeight and LineWeightGrad) or to a default value for undefined weights
SetLineWeights(defw: number): void;

// erases specific labels, i.e
ClearLabels(): void;

// Returns a string with the label attached to a given entity, i.e
StringLabel(ent: Standard_Transient): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// specific FileReaderTool for IGES Parameters are accessed through specific objects, ParamReaders
IGESData_IGESReaderTool: declare class IGESData_IGESReaderTool extends Interface_FileReaderTool

// binds empty entities to records, works with the Protocol (from {@link IGESData`IGESData`}) stored and later used RQ
Prepare(reco: IGESData_FileRecognizer): void;

// recognizes records by asking Protocol (on data of DirType)
Recognize(num: number): { returnValue: boolean; ach: Interface_Check; ent: Standard_Transient; [Symbol.dispose](): void };

// fills model's header, that is, its GlobalSection
BeginRead(amodel: Interface_InterfaceModel): void;

// fills an entity, given record no
AnalyseRecord(num: number, anent: Standard_Transient): { returnValue: boolean; acheck: Interface_Check; [Symbol.dispose](): void };

// after reading entities, true line weights can be computed
EndRead(amodel: Interface_InterfaceModel): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// taken from directory part of an entity (from file or model), gives "type" and "form" data, used to recognize entity's type
IGESData_IGESType: declare class IGESData_IGESType

constructor

// returns "type" data
Type(): number;

// returns "form" data
Form(): number;

// compares two IGESTypes, avoiding comparing their fields
IsEqual(another: IGESData_IGESType): boolean;

// resets fields (useful when an IGESType is stored as mask)
Nullify(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// manages atomic file writing, under control of IGESModel
IGESData_IGESWriter: declare class IGESData_IGESWriter

constructor

// Returns the embedded FloatWriter, which controls sending Reals Use this method to access FloatWriter in order to consult or change its options (MainFormat, FormatForRange,ZeroSuppress), because it is returned as the address of its field
FloatWriter(): Interface_FloatWriter;

// Returns the write mode, in order to be read and/or changed Write Mode controls the way final print works 0 (D)
WriteMode(): number;

// Sends an additional Starting Line
SendStartLine(startline: string): void;

// Sends the complete IGESModel (Global Section, Entities as Directory Entries & Parameter Lists, etc...) i.e
SendModel(protocol: IGESData_Protocol): void;

// declares sending of S section (only a declaration) error if state is not initial
SectionS(): void;

// prepares sending of header, from a GlobalSection (stores it) error if SectionS was not called just before takes in account special characters (Separator, EndMark)
SectionG(header: IGESData_GlobalSection): void;

// prepares sending of list of entities, as Sections D (directory list) and P (Parameters lists, one per entity) Entities will be then processed, one after the other error if SectionG has not be called just before
SectionsDP(): void;

// declares sending of T section (only a declaration) error if does not follow Entities sending
SectionT(): void;

// translates directory part of an Entity into a literal DirPart Some infos are computed after sending parameters Error if not in sections DP or Stage not "Dir"
DirPart(anent: IGESData_IGESEntity): void;

// sends own parameters of the entity, by sending firstly its type, then calling specific method WriteOwnParams Error if not in sections DP or Stage not "Own"
OwnParams(anent: IGESData_IGESEntity): void;

// sends associativity list, as complement of parameters list error if not in sections DP or Stage not "Associativity"
Associativities(anent: IGESData_IGESEntity): void;

// sends property list, as complement of parameters list error if not in sections DP or Stage not "Property"
Properties(anent: IGESData_IGESEntity): void;

// declares end of sending an entity (ends param list by ';')
EndEntity(): void;

// sends a void parameter, that is null text
SendVoid(): void;

// sends an Integer parameter sends a Real parameter
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_HAsciiString): void;
Send(val: gp_XY): void;
Send(val: gp_XYZ): void;
Send(val: IGESData_IGESEntity, negative: boolean): void;
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_HAsciiString): void;
Send(val: gp_XY): void;
Send(val: gp_XYZ): void;
Send(val: IGESData_IGESEntity, negative: boolean): void;
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_HAsciiString): void;
Send(val: gp_XY): void;
Send(val: gp_XYZ): void;
Send(val: IGESData_IGESEntity, negative: boolean): void;
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_HAsciiString): void;
Send(val: gp_XY): void;
Send(val: gp_XYZ): void;
Send(val: IGESData_IGESEntity, negative: boolean): void;
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_HAsciiString): void;
Send(val: gp_XY): void;
Send(val: gp_XYZ): void;
Send(val: IGESData_IGESEntity, negative: boolean): void;
Send(val: number): void;
Send(val: number): void;
Send(val: TCollection_HAsciiString): void;
Send(val: gp_XY): void;
Send(val: gp_XYZ): void;
Send(val: IGESData_IGESEntity, negative: boolean): void;

// sends a Boolean parameter as an Integer value 0(False)/1(True)
SendBoolean(val: boolean): void;

// sends a parameter under its exact form given as a string
SendString(val: TCollection_HAsciiString): void;

// Returns the list of strings for a section given its rank 1
SectionStrings(numsec: number): NCollection_HSequence_handle_TCollection_HAsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines required type for LabelDisplay in directory part an effective LabelDisplay entity must inherits it
IGESData_LabelDisplayEntity: declare class IGESData_LabelDisplayEntity extends IGESData_IGESEntity

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines required type for LevelList in directory part an effective LevelList entity must inherits it
IGESData_LevelListEntity: declare class IGESData_LevelListEntity extends IGESData_IGESEntity

// Must return the count of levels
NbLevelNumbers(): number;

// returns the Level Number of <me>, indicated by <num> raises an exception if num is out of range
LevelNumber(num: number): number;

// returns True if <level> is in the list
HasLevelNumber(level: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines required type for LineFont in directory part an effective LineFont entity must inherits it
IGESData_LineFontEntity: declare class IGESData_LineFontEntity extends IGESData_IGESEntity

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// a NameEntity is a kind of IGESEntity which can provide a Name under alphanumeric (String) form, from Properties list an effective Name entity must inherit it
IGESData_NameEntity: declare class IGESData_NameEntity extends IGESData_IGESEntity

// Retyrns the alphanumeric value of the Name, to be defined
Value(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_NodeOfSpecificLib: declare class IGESData_NodeOfSpecificLib extends Standard_Transient

constructor

// Adds a couple (Module,Protocol), that is, stores it into itself if not yet done, else creates a Next Node to do it
AddNode(anode: IGESData_GlobalNodeOfSpecificLib): void;

// Returns the Module designated by a precise Node
Module(): IGESData_SpecificModule;

// Returns the Protocol designated by a precise Node
Protocol(): IGESData_Protocol;

// Returns the Next Node
Next(): IGESData_NodeOfSpecificLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESData_NodeOfWriterLib: declare class IGESData_NodeOfWriterLib extends Standard_Transient

constructor

// Adds a couple (Module,Protocol), that is, stores it into itself if not yet done, else creates a Next Node to do it
AddNode(anode: IGESData_GlobalNodeOfWriterLib): void;

// Returns the Module designated by a precise Node
Module(): IGESData_ReadWriteModule;

// Returns the Protocol designated by a precise Node
Protocol(): IGESData_Protocol;

// Returns the Next Node
Next(): IGESData_NodeOfWriterLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class for ParamReader
IGESData_ParamCursor: declare class IGESData_ParamCursor

constructor

// Defines the size of a term to read in the item
SetTerm(size: number, autoadv?: boolean): void;

// Defines a term of one Parameter (very current case)
SetOne(autoadv?: boolean): void;

// Defines a term of two Parameters for a XY (current case)
SetXY(autoadv?: boolean): void;

// Defines a term of three Parameters for XYZ (current case)
SetXYZ(autoadv?: boolean): void;

// Changes command to advance current cursor after reading parameters
SetAdvance(advance: boolean): void;

// Returns (included) starting number for reading parameters
Start(): number;

// Returns (excluded) upper limit number for reading parameters
Limit(): number;

// Returns required count of items to be read
Count(): number;

// Returns length of item (count of parameters per item)
ItemSize(): number;

// Returns length of current term (count of parameters) in item
TermSize(): number;

// Returns offset from which current term must be read in item
Offset(): number;

// Returns True if Advance command has been set
Advance(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
