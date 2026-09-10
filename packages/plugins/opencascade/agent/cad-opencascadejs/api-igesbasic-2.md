# libcascade — IGESBasic (2)

16 top-level symbols. Signatures are verbatim typescript.

// Tool to work on a ExternalRefLibName
IGESBasic_ToolExternalRefLibName: declare class IGESBasic_ToolExternalRefLibName

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_ExternalRefLibName, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESBasic_ExternalRefLibName): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_ExternalRefLibName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_ExternalRefLibName, entto: IGESBasic_ExternalRefLibName, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ExternalRefName
IGESBasic_ToolExternalRefName: declare class IGESBasic_ToolExternalRefName

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_ExternalRefName, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESBasic_ExternalRefName): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_ExternalRefName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_ExternalRefName, entto: IGESBasic_ExternalRefName, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ExternalReferenceFile
IGESBasic_ToolExternalReferenceFile: declare class IGESBasic_ToolExternalReferenceFile

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_ExternalReferenceFile, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESBasic_ExternalReferenceFile): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_ExternalReferenceFile, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_ExternalReferenceFile, entto: IGESBasic_ExternalReferenceFile, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Group
IGESBasic_ToolGroup: declare class IGESBasic_ToolGroup

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_Group, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Group (Null Elements are removed from list)
OwnCorrect(ent: IGESBasic_Group): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESBasic_Group): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_Group, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_Group, entto: IGESBasic_Group, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a GroupWithoutBackP
IGESBasic_ToolGroupWithoutBackP: declare class IGESBasic_ToolGroupWithoutBackP

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_GroupWithoutBackP, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a GroupWithoutBackP (Null Elements are removed from list)
OwnCorrect(ent: IGESBasic_GroupWithoutBackP): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESBasic_GroupWithoutBackP): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_GroupWithoutBackP, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_GroupWithoutBackP, entto: IGESBasic_GroupWithoutBackP, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Hierarchy
IGESBasic_ToolHierarchy: declare class IGESBasic_ToolHierarchy

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_Hierarchy, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Hierarchy (NbPropertyValues forced to 6)
OwnCorrect(ent: IGESBasic_Hierarchy): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESBasic_Hierarchy): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_Hierarchy, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_Hierarchy, entto: IGESBasic_Hierarchy, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Name
IGESBasic_ToolName: declare class IGESBasic_ToolName

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_Name, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Name (NbPropertyValues forced to 1)
OwnCorrect(ent: IGESBasic_Name): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESBasic_Name): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_Name, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_Name, entto: IGESBasic_Name, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a OrderedGroup
IGESBasic_ToolOrderedGroup: declare class IGESBasic_ToolOrderedGroup

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_OrderedGroup, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on an OrderedGroup (Null Elements are removed from list)
OwnCorrect(ent: IGESBasic_OrderedGroup): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESBasic_OrderedGroup): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_OrderedGroup, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_OrderedGroup, entto: IGESBasic_OrderedGroup, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a OrderedGroupWithoutBackP
IGESBasic_ToolOrderedGroupWithoutBackP: declare class IGESBasic_ToolOrderedGroupWithoutBackP

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_OrderedGroupWithoutBackP, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on an OrderedGroupWithoutBackP (Null Elements are removed from list)
OwnCorrect(ent: IGESBasic_OrderedGroupWithoutBackP): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESBasic_OrderedGroupWithoutBackP): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_OrderedGroupWithoutBackP, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_OrderedGroupWithoutBackP, entto: IGESBasic_OrderedGroupWithoutBackP, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SingleParent
IGESBasic_ToolSingleParent: declare class IGESBasic_ToolSingleParent

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_SingleParent, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a SingleParent (NbParents forced to 1)
OwnCorrect(ent: IGESBasic_SingleParent): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESBasic_SingleParent): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_SingleParent, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_SingleParent, entto: IGESBasic_SingleParent, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SingularSubfigure
IGESBasic_ToolSingularSubfigure: declare class IGESBasic_ToolSingularSubfigure

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_SingularSubfigure, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESBasic_SingularSubfigure): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_SingularSubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_SingularSubfigure, entto: IGESBasic_SingularSubfigure, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SubfigureDef
IGESBasic_ToolSubfigureDef: declare class IGESBasic_ToolSubfigureDef

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESBasic_SubfigureDef, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESBasic_SubfigureDef): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESBasic_SubfigureDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESBasic_SubfigureDef, entto: IGESBasic_SubfigureDef, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESBasic_Array1OfLineFontEntity: NCollection_Array1_handle_IGESData_LineFontEntity

IGESBasic_Array2OfHArray1OfReal: NCollection_Array2_handle_NCollection_HArray1_double

IGESBasic_HArray1OfLineFontEntity: NCollection_HArray1_handle_IGESData_LineFontEntity

IGESBasic_HArray2OfHArray1OfReal: NCollection_HArray2_handle_NCollection_HArray1_double
