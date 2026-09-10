# libcascade — IGESAppli

18 top-level symbols. Signatures are verbatim typescript.

// This package represents collection of miscellaneous entities from IGES
IGESAppli: declare class IGESAppli

constructor

// Prepares dynamic data (Protocol, Modules) for this package
static Init(): void;

// Returns the Protocol for this Package
static Protocol(): IGESAppli_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines DrilledHole, Type <406> Form <6> in package {@link IGESAppli`IGESAppli`} Identifies an entity representing a drilled hole through a printed circuit board
IGESAppli_DrilledHole: declare class IGESAppli_DrilledHole extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class DrilledHole
Init(nbPropVal: number, aSize: number, anotherSize: number, aPlating: number, aLayer: number, anotherLayer: number): void;

// is always 5
NbPropertyValues(): number;

// returns the drill diameter size
DrillDiaSize(): number;

// returns the finish diameter size
FinishDiaSize(): number;

// Returns Plating Status
IsPlating(): boolean;

// returns the lower numbered layer
NbLowerLayer(): number;

// returns the higher numbered layer
NbHigherLayer(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines ElementResults, Type <148> in package {@link IGESAppli`IGESAppli`} Used to find the results of FEM analysis
IGESAppli_ElementResults: declare class IGESAppli_ElementResults extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ElementResults
Init(aNote: IGESDimen_GeneralNote, aSubCase: number, aTime: number, nbResults: number, aResRepFlag: number, allElementIdents: NCollection_HArray1_int, allFiniteElems: NCollection_HArray1_handle_IGESAppli_FiniteElement, allTopTypes: NCollection_HArray1_int, nbLayers: NCollection_HArray1_int, allDataLayerFlags: NCollection_HArray1_int, allnbResDataLocs: NCollection_HArray1_int, allResDataLocs: IGESBasic_HArray1OfHArray1OfInteger, allResults: IGESBasic_HArray1OfHArray1OfReal): void;

// Changes the FormNumber (which indicates Type of Result) Error if not in range [0-34]
SetFormNumber(form: number): void;

// returns General Note Entity describing analysis case
Note(): IGESDimen_GeneralNote;

// returns analysis Subcase number
SubCaseNumber(): number;

// returns analysis time value
Time(): number;

// returns number of result values per FEM
NbResultValues(): number;

// returns Results Reporting Flag
ResultReportFlag(): number;

// returns number of FEM elements
NbElements(): number;

// returns FEM element number for elements
ElementIdentifier(Index: number): number;

// returns FEM element
Element(Index: number): IGESAppli_FiniteElement;

// returns element Topology Types
ElementTopologyType(Index: number): number;

// returns number of layers per result data location
NbLayers(Index: number): number;

// returns Data Layer Flags
DataLayerFlag(Index: number): number;

// returns number of result data report locations
NbResultDataLocs(Index: number): number;

// returns Result Data Report Locations UNFINISHED
ResultDataLoc(NElem: number, NLoc: number): number;

// returns total number of results
NbResults(Index: number): number;

// returns Result data value for an Element, given its order between 1 and <NbResults(NElem)> (direct access) For a more comprehensive access, see below returns Result data values of FEM analysis, according this definition
ResultData(NElem: number, num: number): number;
ResultData(NElem: number, NVal: number, NLay: number, NLoc: number): number;
ResultData(NElem: number, num: number): number;
ResultData(NElem: number, NVal: number, NLay: number, NLoc: number): number;

// Computes, for a given Element <NElem>, the rank of a individual Result Data, given <NVal>,<NLay>,<NLoc>
ResultRank(NElem: number, NVal: number, NLay: number, NLoc: number): number;

// Returns in once the entire list of data for an Element, addressed as by ResultRank (See above)
ResultList(NElem: number): NCollection_HArray1_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines FiniteElement, Type <136> Form <0> in package {@link IGESAppli`IGESAppli`} Used to define a finite element with the help of an element topology
IGESAppli_FiniteElement: declare class IGESAppli_FiniteElement extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class FiniteElement
Init(aType: number, allNodes: NCollection_HArray1_handle_IGESAppli_Node, aName: TCollection_HAsciiString): void;

// returns Topology type
Topology(): number;

// returns the number of nodes defining the element
NbNodes(): number;

// returns Node defining element entity raises exception if Index <= 0 or Index > `NbNodes()`
Node(Index: number): IGESAppli_Node;

// returns Element Type Name
Name(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Flow, Type <402> Form <18> in package {@link IGESAppli`IGESAppli`} Represents a single signal or a single fluid flow path starting from a starting Connect Point Entity and including additional intermediate connect points
IGESAppli_Flow: declare class IGESAppli_Flow extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Flow
Init(nbContextFlags: number, aFlowType: number, aFuncFlag: number, allFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint, allJoins: NCollection_HArray1_handle_IGESData_IGESEntity, allFlowNames: NCollection_HArray1_handle_TCollection_HAsciiString, allTextDisps: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate, allContFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// forces NbContextFalgs to 2, returns True if changed
OwnCorrect(): boolean;

// returns number of Count of Context Flags, always = 2
NbContextFlags(): number;

// returns number of Flow Associativity Entities
NbFlowAssociativities(): number;

// returns number of Connect Point Entities
NbConnectPoints(): number;

// returns number of Join Entities
NbJoins(): number;

// returns number of Flow Names
NbFlowNames(): number;

// returns number of Text Display Template Entities
NbTextDisplayTemplates(): number;

// returns number of Continuation Flow Associativity Entities
NbContFlowAssociativities(): number;

// returns Type of Flow = 0
TypeOfFlow(): number;

// returns Function Flag = 0
FunctionFlag(): number;

// returns Flow Associativity Entity raises exception if Index <= 0 or Index > `NbFlowAssociativities()`
FlowAssociativity(Index: number): IGESData_IGESEntity;

// returns Connect Point Entity raises exception if Index <= 0 or Index > `NbConnectPoints()`
ConnectPoint(Index: number): IGESDraw_ConnectPoint;

// returns Join Entity raises exception if Index <= 0 or Index > `NbJoins()`
Join(Index: number): IGESData_IGESEntity;

// returns Flow Name raises exception if Index <= 0 or Index > `NbFlowNames()`
FlowName(Index: number): TCollection_HAsciiString;

// returns Text Display Template Entity raises exception if Index <= 0 or Index > `NbTextDisplayTemplates()`
TextDisplayTemplate(Index: number): IGESGraph_TextDisplayTemplate;

// returns Continuation Flow Associativity Entity raises exception if Index <= 0 or Index > `NbContFlowAssociativities()`
ContFlowAssociativity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines FlowLineSpec, Type <406> Form <14> in package {@link IGESAppli`IGESAppli`} Attaches one or more text strings to entities being used to represent a flow line
IGESAppli_FlowLineSpec: declare class IGESAppli_FlowLineSpec extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class FlowLineSpec
Init(allProperties: NCollection_HArray1_handle_TCollection_HAsciiString): void;

// returns the number of property values
NbPropertyValues(): number;

// returns primary flow line specification name
FlowLineName(): TCollection_HAsciiString;

// returns specified modifier element raises exception if Index <= 1 or Index > NbPropertyValues
Modifier(Index: number): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services for {@link IGESAppli`IGESAppli`} (specific part) This Services comprise
IGESAppli_GeneralModule: declare class IGESAppli_GeneralModule extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Returns a category number which characterizes an entity FEA for
CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines LevelFunction, Type <406> Form <3> in package {@link IGESAppli`IGESAppli`} Used to transfer the meaning or intended use of a level in the sending system
IGESAppli_LevelFunction: declare class IGESAppli_LevelFunction extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class LevelFunction
Init(nbPropVal: number, aCode: number, aFuncDescrip: TCollection_HAsciiString): void;

// is always 2
NbPropertyValues(): number;

// returns the function description code
FuncDescriptionCode(): number;

// returns the function description Default = null string
FuncDescription(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines LevelToPWBLayerMap, Type <406> Form <24> in package {@link IGESAppli`IGESAppli`} Used to correlate an exchange file level number with its corresponding native level identifier, physical PWB layer number and predefined functional level identification
IGESAppli_LevelToPWBLayerMap: declare class IGESAppli_LevelToPWBLayerMap extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class LevelToPWBLayerMap
Init(nbPropVal: number, allExchLevels: NCollection_HArray1_int, allNativeLevels: NCollection_HArray1_handle_TCollection_HAsciiString, allPhysLevels: NCollection_HArray1_int, allExchIdents: NCollection_HArray1_handle_TCollection_HAsciiString): void;

// returns number of property values
NbPropertyValues(): number;

// returns number of level to layer definitions
NbLevelToLayerDefs(): number;

// returns Exchange File Level Number raises exception if Index <= 0 or Index > NbLevelToLayerDefs
ExchangeFileLevelNumber(Index: number): number;

// returns Native Level Identification raises exception if Index <= 0 or Index > NbLevelToLayerDefs
NativeLevel(Index: number): TCollection_HAsciiString;

// returns Physical Layer Number raises exception if Index <= 0 or Index > NbLevelToLayerDefs
PhysicalLayerNumber(Index: number): number;

ExchangeFileLevelIdent(Index: number): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines LineWidening, Type <406> Form <5> in package {@link IGESAppli`IGESAppli`} Defines the characteristics of entities when they are used to define locations of items
IGESAppli_LineWidening: declare class IGESAppli_LineWidening extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class LineWidening
Init(nbPropVal: number, aWidth: number, aCornering: number, aExtnFlag: number, aJustifFlag: number, aExtnVal: number): void;

// returns the number of property values is always 5
NbPropertyValues(): number;

// returns the width of metallization
WidthOfMetalization(): number;

// returns the cornering code 0 = Rounded / 1 = Squared
CorneringCode(): number;

// returns the extension flag 0 = No extension 1 = One-half width extension 2 = Extension set by theExtnVal
ExtensionFlag(): number;

// returns the justification flag 0 = Centre justified 1 = Left justified 2 = Right justified
JustificationFlag(): number;

// returns the Extension Value Present only if theExtnFlag = 2
ExtensionValue(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines NodalConstraint, Type <418> Form <0> in package {@link IGESAppli`IGESAppli`} Relates loads and/or constraints to specific nodes in the Finite Element Model by creating a relation between Node entities and Tabular Data Property that contains the load or constraint data
IGESAppli_NodalConstraint: declare class IGESAppli_NodalConstraint extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class NodalConstraint
Init(aType: number, aNode: IGESAppli_Node, allTabData: NCollection_HArray1_handle_IGESDefs_TabularData): void;

// returns total number of cases
NbCases(): number;

// returns whether Loads (1) or Constraints (2)
Type(): number;

// returns the Node
NodeEntity(): IGESAppli_Node;

// returns Tabular Data Property carrying load or constraint vector raises exception if Index <= 0 or Index > NbCases
TabularData(Index: number): IGESDefs_TabularData;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines NodalDisplAndRot, Type <138> Form <0> in package {@link IGESAppli`IGESAppli`} Used to communicate finite element post processing data
IGESAppli_NodalDisplAndRot: declare class IGESAppli_NodalDisplAndRot extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class NodalDisplAndRot
Init(allNotes: NCollection_HArray1_handle_IGESDimen_GeneralNote, allIdentifiers: NCollection_HArray1_int, allNodes: NCollection_HArray1_handle_IGESAppli_Node, allRotParams: IGESBasic_HArray1OfHArray1OfXYZ, allTransParams: IGESBasic_HArray1OfHArray1OfXYZ): void;

// returns the number of analysis cases
NbCases(): number;

// returns the number of nodes
NbNodes(): number;

// returns the General Note that describes the Index analysis case raises exception if Index <= 0 or Index > NbCases
Note(Index: number): IGESDimen_GeneralNote;

// returns the node identifier as specified by the Index raises exception if Index <= 0 or Index > NbNodes
NodeIdentifier(Index: number): number;

// returns the node as specified by the Index raises exception if Index <= 0 or Index > NbNodes
Node(Index: number): IGESAppli_Node;

// returns the Translational Parameters for the particular Index Exception raised if NodeNum <= 0 or NodeNum > `NbNodes()` or CaseNum <= 0 or CaseNum > `NbCases()`
TranslationParameter(NodeNum: number, CaseNum: number): gp_XYZ;

// returns the Rotational Parameters for Index Exception raised if NodeNum <= 0 or NodeNum > `NbNodes()` or CaseNum <= 0 or CaseNum > `NbCases()`
RotationalParameter(NodeNum: number, CaseNum: number): gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines NodalResults, Type <146> in package {@link IGESAppli`IGESAppli`} Used to store the Analysis Data results per FEM Node
IGESAppli_NodalResults: declare class IGESAppli_NodalResults extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class NodalResults
Init(aNote: IGESDimen_GeneralNote, aNumber: number, aTime: number, allNodeIdentifiers: NCollection_HArray1_int, allNodes: NCollection_HArray1_handle_IGESAppli_Node, allData: NCollection_HArray2_double): void;

// Changes the FormNumber (which indicates Type of Result) Error if not in range [0-34]
SetFormNumber(form: number): void;

// returns the General Note Entity that describes the analysis case
Note(): IGESDimen_GeneralNote;

// returns zero if there is no subcase
SubCaseNumber(): number;

// returns the Analysis time value for this subcase
Time(): number;

// returns number of real values in array V for a FEM node
NbData(): number;

// returns number of FEM nodes for which data is to be read
NbNodes(): number;

// returns FEM node number identifier for the (Index)th node raises exception if Index <= 0 or Index > NbNodes
NodeIdentifier(Index: number): number;

// returns the node as specified by the Index raises exception if Index <= 0 or Index > NbNodes
Node(Index: number): IGESAppli_Node;

// returns the finite element analysis result value raises exception if (NodeNum <= 0 or NodeNum > `NbNodes()`) or if (DataNum <=0 or DataNum > `NbData()`)
Data(NodeNum: number, DataNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Node, Type <134> Form <0> in package {@link IGESAppli`IGESAppli`} Geometric point used in the definition of a finite element
IGESAppli_Node: declare class IGESAppli_Node extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Node
Init(aCoord: gp_XYZ, aCoordSystem: IGESGeom_TransformationMatrix): void;

// returns the nodal coordinates
Coord(): gp_Pnt;

// returns TransfEntity if a Nodal Displacement Coordinate System Entity is defined else (for Global Cartesien) returns Null Handle
System(): IGESData_TransfEntity;

// Computes & returns the Type of Coordinate System
SystemType(): number;

// returns the Nodal coordinates after transformation
TransformedNodalCoord(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines PWBArtworkStackup, Type <406> Form <25> in package {@link IGESAppli`IGESAppli`} Used to communicate which exchange file levels are to be combined in order to create the artwork for a printed wire board (PWB)
IGESAppli_PWBArtworkStackup: declare class IGESAppli_PWBArtworkStackup extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class PWBArtworkStackup
Init(nbPropVal: number, anArtIdent: TCollection_HAsciiString, allLevelNums: NCollection_HArray1_int): void;

// returns number of property values
NbPropertyValues(): number;

// returns Artwork Stackup Identification
Identification(): TCollection_HAsciiString;

// returns total number of Level Numbers
NbLevelNumbers(): number;

// returns Level Number raises exception if Index <= 0 or Index > NbLevelNumbers
LevelNumber(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines PWBDrilledHole, Type <406> Form <26> in package {@link IGESAppli`IGESAppli`} Used to identify an entity that locates a drilled hole and to specify the characteristics of the drilled hole
IGESAppli_PWBDrilledHole: declare class IGESAppli_PWBDrilledHole extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class PWBDrilledHole
Init(nbPropVal: number, aDrillDia: number, aFinishDia: number, aCode: number): void;

// returns number of property values, always = 3
NbPropertyValues(): number;

// returns Drill diameter size
DrillDiameterSize(): number;

// returns Finish diameter size
FinishDiameterSize(): number;

// returns Function code for drilled hole is 0, 1, 2, 3, 4, 5 or 5001-9999
FunctionCode(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines PartNumber, Type <406> Form <9> in package {@link IGESAppli`IGESAppli`} Attaches a set of text strings that define the common part numbers to an entity being used to represent a physical component
IGESAppli_PartNumber: declare class IGESAppli_PartNumber extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class PartNumber
Init(nbPropVal: number, aGenName: TCollection_HAsciiString, aMilName: TCollection_HAsciiString, aVendName: TCollection_HAsciiString, anIntName: TCollection_HAsciiString): void;

// returns number of property values, always = 4
NbPropertyValues(): number;

// returns Generic part number or name
GenericNumber(): TCollection_HAsciiString;

// returns Military {@link Standard `Standard`} (MIL-STD) part number
MilitaryNumber(): TCollection_HAsciiString;

// returns Vendor part number or name
VendorNumber(): TCollection_HAsciiString;

// returns Internal part number
InternalNumber(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines PinNumber, Type <406> Form <8> in package {@link IGESAppli`IGESAppli`} Used to attach a text string representing a component pin number to an entity being used to represent an electrical component's pin
IGESAppli_PinNumber: declare class IGESAppli_PinNumber extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class PinNumber
Init(nbPropVal: number, aValue: TCollection_HAsciiString): void;

// returns the number of property values is always 1
NbPropertyValues(): number;

// returns the pin number value
PinNumberVal(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
