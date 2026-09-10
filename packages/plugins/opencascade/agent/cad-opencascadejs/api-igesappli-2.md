# libcascade — IGESAppli (2)

29 top-level symbols. Signatures are verbatim typescript.

// defines PipingFlow, Type <402> Form <20> in package {@link IGESAppli`IGESAppli`} Represents a single fluid flow path
IGESAppli_PipingFlow: declare class IGESAppli_PipingFlow extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class PipingFlow
Init(nbContextFlags: number, aFlowType: number, allFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint, allJoins: NCollection_HArray1_handle_IGESData_IGESEntity, allFlowNames: NCollection_HArray1_handle_TCollection_HAsciiString, allTextDisps: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate, allContFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// forces NbContextFalgs to 1, returns True if changed
OwnCorrect(): boolean;

// returns number of Count of Context Flags, always = 1
NbContextFlags(): number;

// returns number of Piping Flow Associativity Entities
NbFlowAssociativities(): number;

// returns number of Connect Point Entities
NbConnectPoints(): number;

// returns number of Join Entities
NbJoins(): number;

// returns number of Flow Names
NbFlowNames(): number;

// returns number of Text Display Template Entities
NbTextDisplayTemplates(): number;

// returns number of Continuation Piping Flow Associativities
NbContFlowAssociativities(): number;

// returns Type of Flow = 0
TypeOfFlow(): number;

// returns Piping Flow Associativity Entity raises exception if Index <= 0 or Index > `NbFlowAssociativities()`
FlowAssociativity(Index: number): IGESData_IGESEntity;

// returns Connect Point Entity raises exception if Index <= 0 or Index > `NbConnectPoints()`
ConnectPoint(Index: number): IGESDraw_ConnectPoint;

// returns Join Entity raises exception if Index <= 0 or Index > `NbJoins()`
Join(Index: number): IGESData_IGESEntity;

// returns Flow Name raises exception if Index <= 0 or Index > `NbFlowNames()`
FlowName(Index: number): TCollection_HAsciiString;

// returns Text Display Template Entity raises exception if Index <= 0 or Index > `NbTextDisplayTemplates()`
TextDisplayTemplate(Index: number): IGESGraph_TextDisplayTemplate;

// returns Continuation Piping Flow Associativity Entity raises exception if Index <= 0 or Index > `NbContFlowAssociativities()`
ContFlowAssociativity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Protocol for {@link IGESAppli`IGESAppli`}
IGESAppli_Protocol: declare class IGESAppli_Protocol extends IGESData_Protocol

constructor

// Gives the count of direct Resource Protocol
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

// Defines basic File Access Module for {@link IGESAppli`IGESAppli`} (specific parts) Specific actions concern
IGESAppli_ReadWriteModule: declare class IGESAppli_ReadWriteModule extends IGESData_ReadWriteModule

constructor

// Defines Case Numbers for Entities of {@link IGESAppli`IGESAppli`}
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

// defines ReferenceDesignator, Type <406> Form <7> in package {@link IGESAppli`IGESAppli`} Used to attach a text string containing the value of a component reference designator to an entity being used to represent a component
IGESAppli_ReferenceDesignator: declare class IGESAppli_ReferenceDesignator extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ReferenceDesignator
Init(nbPropVal: number, aText: TCollection_HAsciiString): void;

// returns the number of property values is always 1
NbPropertyValues(): number;

// returns the Reference designator text
RefDesignatorText(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines RegionRestriction, Type <406> Form <2> in package {@link IGESAppli`IGESAppli`} Defines regions to set an application's restriction over a region
IGESAppli_RegionRestriction: declare class IGESAppli_RegionRestriction extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class RegionRestriction
Init(nbPropVal: number, aViasRest: number, aCompoRest: number, aCktRest: number): void;

// is always 3
NbPropertyValues(): number;

// returns the Electrical vias restriction is 0, 1 or 2
ElectricalViasRestriction(): number;

// returns the Electrical components restriction is 0, 1 or 2
ElectricalComponentRestriction(): number;

// returns the Electrical circuitry restriction is 0, 1 or 2
ElectricalCktRestriction(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Services attached to IGES Entities
IGESAppli_SpecificModule: declare class IGESAppli_SpecificModule extends IGESData_SpecificModule

constructor

// --Purpose
OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DrilledHole
IGESAppli_ToolDrilledHole: declare class IGESAppli_ToolDrilledHole

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_DrilledHole, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a DrilledHole (NbPropertyValues forced to 5, Level cleared if Subordinate != 0)
OwnCorrect(ent: IGESAppli_DrilledHole): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_DrilledHole): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_DrilledHole, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_DrilledHole, entto: IGESAppli_DrilledHole, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ElementResults
IGESAppli_ToolElementResults: declare class IGESAppli_ToolElementResults

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_ElementResults, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_ElementResults): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_ElementResults, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_ElementResults, entto: IGESAppli_ElementResults, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a FiniteElement
IGESAppli_ToolFiniteElement: declare class IGESAppli_ToolFiniteElement

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_FiniteElement, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_FiniteElement): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_FiniteElement, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_FiniteElement, entto: IGESAppli_FiniteElement, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Flow
IGESAppli_ToolFlow: declare class IGESAppli_ToolFlow

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_Flow, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Flow (NbContextFlags forced to 2)
OwnCorrect(ent: IGESAppli_Flow): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_Flow): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_Flow, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_Flow, entto: IGESAppli_Flow, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a FlowLineSpec
IGESAppli_ToolFlowLineSpec: declare class IGESAppli_ToolFlowLineSpec

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_FlowLineSpec, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_FlowLineSpec): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_FlowLineSpec, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_FlowLineSpec, entto: IGESAppli_FlowLineSpec, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a LevelFunction
IGESAppli_ToolLevelFunction: declare class IGESAppli_ToolLevelFunction

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_LevelFunction, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a LevelFunction (NbPropertyValues forced to 2)
OwnCorrect(ent: IGESAppli_LevelFunction): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_LevelFunction): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_LevelFunction, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_LevelFunction, entto: IGESAppli_LevelFunction, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a LevelToPWBLayerMap
IGESAppli_ToolLevelToPWBLayerMap: declare class IGESAppli_ToolLevelToPWBLayerMap

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_LevelToPWBLayerMap, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_LevelToPWBLayerMap): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_LevelToPWBLayerMap, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_LevelToPWBLayerMap, entto: IGESAppli_LevelToPWBLayerMap, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a LineWidening
IGESAppli_ToolLineWidening: declare class IGESAppli_ToolLineWidening

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_LineWidening, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a LineWidening (NbPropertyValues forced to 5, Level cleared if Subordinate != 0)
OwnCorrect(ent: IGESAppli_LineWidening): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_LineWidening): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_LineWidening, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_LineWidening, entto: IGESAppli_LineWidening, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a NodalConstraint
IGESAppli_ToolNodalConstraint: declare class IGESAppli_ToolNodalConstraint

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_NodalConstraint, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_NodalConstraint): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_NodalConstraint, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_NodalConstraint, entto: IGESAppli_NodalConstraint, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a NodalDisplAndRot
IGESAppli_ToolNodalDisplAndRot: declare class IGESAppli_ToolNodalDisplAndRot

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_NodalDisplAndRot, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_NodalDisplAndRot): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_NodalDisplAndRot, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_NodalDisplAndRot, entto: IGESAppli_NodalDisplAndRot, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a NodalResults
IGESAppli_ToolNodalResults: declare class IGESAppli_ToolNodalResults

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_NodalResults, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_NodalResults): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_NodalResults, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_NodalResults, entto: IGESAppli_NodalResults, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Node
IGESAppli_ToolNode: declare class IGESAppli_ToolNode

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_Node, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_Node): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_Node, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_Node, entto: IGESAppli_Node, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a PWBArtworkStackup
IGESAppli_ToolPWBArtworkStackup: declare class IGESAppli_ToolPWBArtworkStackup

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_PWBArtworkStackup, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESAppli_PWBArtworkStackup): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_PWBArtworkStackup, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_PWBArtworkStackup, entto: IGESAppli_PWBArtworkStackup, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a PWBDrilledHole
IGESAppli_ToolPWBDrilledHole: declare class IGESAppli_ToolPWBDrilledHole

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_PWBDrilledHole, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a PWBDrilledHole (NbPropertyValues forced to 3)
OwnCorrect(ent: IGESAppli_PWBDrilledHole): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_PWBDrilledHole): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_PWBDrilledHole, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_PWBDrilledHole, entto: IGESAppli_PWBDrilledHole, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a PartNumber
IGESAppli_ToolPartNumber: declare class IGESAppli_ToolPartNumber

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_PartNumber, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a PartNumber (NbPropertyValues forced to 4)
OwnCorrect(ent: IGESAppli_PartNumber): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_PartNumber): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_PartNumber, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_PartNumber, entto: IGESAppli_PartNumber, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a PinNumber
IGESAppli_ToolPinNumber: declare class IGESAppli_ToolPinNumber

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_PinNumber, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a PinNumber (Level cleared in D.E
OwnCorrect(ent: IGESAppli_PinNumber): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_PinNumber): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_PinNumber, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_PinNumber, entto: IGESAppli_PinNumber, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a PipingFlow
IGESAppli_ToolPipingFlow: declare class IGESAppli_ToolPipingFlow

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_PipingFlow, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a PipingFlow (NbContextFlags forced to 1)
OwnCorrect(ent: IGESAppli_PipingFlow): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_PipingFlow): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_PipingFlow, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_PipingFlow, entto: IGESAppli_PipingFlow, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ReferenceDesignator
IGESAppli_ToolReferenceDesignator: declare class IGESAppli_ToolReferenceDesignator

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_ReferenceDesignator, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a ReferenceDesignator (NbPropertyValues forced to 1, Level cleared if Subordinate != 0)
OwnCorrect(ent: IGESAppli_ReferenceDesignator): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_ReferenceDesignator): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_ReferenceDesignator, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_ReferenceDesignator, entto: IGESAppli_ReferenceDesignator, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a RegionRestriction
IGESAppli_ToolRegionRestriction: declare class IGESAppli_ToolRegionRestriction

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESAppli_RegionRestriction, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a RegionRestriction (NbPropertyValues forced to 3, Level cleared if Subordinate != 0)
OwnCorrect(ent: IGESAppli_RegionRestriction): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESAppli_RegionRestriction): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESAppli_RegionRestriction, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESAppli_RegionRestriction, entto: IGESAppli_RegionRestriction, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESAppli_Array1OfFiniteElement: NCollection_Array1_handle_IGESAppli_FiniteElement

IGESAppli_Array1OfNode: NCollection_Array1_handle_IGESAppli_Node

IGESAppli_HArray1OfFiniteElement: NCollection_HArray1_handle_IGESAppli_FiniteElement

IGESAppli_HArray1OfNode: NCollection_HArray1_handle_IGESAppli_Node
