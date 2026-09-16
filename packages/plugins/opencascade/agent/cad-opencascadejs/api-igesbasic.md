# libcascade — IGESBasic

46 top-level symbols. Signatures are verbatim typescript.

IGESBasic: declare class IGESBasic

  constructor

  static Init(): void;

  static Protocol(): IGESBasic_Protocol;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_AssocGroupType: declare class IGESBasic_AssocGroupType extends IGESData_IGESEntity

  constructor

  Init(nbDataFields: number, aType: number, aName: TCollection_HAsciiString): void;

  NbData(): number;

  AssocType(): number;

  Name(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ExternalRefFile: declare class IGESBasic_ExternalRefFile extends IGESData_IGESEntity

  constructor

  Init(aFileIdent: TCollection_HAsciiString): void;

  FileId(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ExternalRefFileIndex: declare class IGESBasic_ExternalRefFileIndex extends IGESData_IGESEntity

  constructor

  Init(aNameArray: NCollection_HArray1_handle_TCollection_HAsciiString, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  NbEntries(): number;

  Name(Index: number): TCollection_HAsciiString;

  Entity(Index: number): IGESData_IGESEntity;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ExternalRefFileName: declare class IGESBasic_ExternalRefFileName extends IGESData_IGESEntity

  constructor

  Init(aFileIdent: TCollection_HAsciiString, anExtName: TCollection_HAsciiString): void;

  SetForEntity(mode: boolean): void;

  FileId(): TCollection_HAsciiString;

  ReferenceName(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ExternalRefLibName: declare class IGESBasic_ExternalRefLibName extends IGESData_IGESEntity

  constructor

  Init(aLibName: TCollection_HAsciiString, anExtName: TCollection_HAsciiString): void;

  LibraryName(): TCollection_HAsciiString;

  ReferenceName(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ExternalRefName: declare class IGESBasic_ExternalRefName extends IGESData_IGESEntity

  constructor

  Init(anExtName: TCollection_HAsciiString): void;

  ReferenceName(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ExternalReferenceFile: declare class IGESBasic_ExternalReferenceFile extends IGESData_IGESEntity

  constructor

  Init(aNameArray: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  NbListEntries(): number;

  Name(Index: number): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_GeneralModule: declare class IGESBasic_GeneralModule extends IGESData_GeneralModule

  constructor

  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_Group: declare class IGESBasic_Group extends IGESData_IGESEntity

  constructor

  Init(allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  SetOrdered(mode: boolean): void;

  SetWithoutBackP(mode: boolean): void;

  IsOrdered(): boolean;

  IsWithoutBackP(): boolean;

  SetUser(type_: number, form: number): void;

  SetNb(nb: number): void;

  NbEntities(): number;

  Entity(Index: number): IGESData_IGESEntity;

  Value(Index: number): Standard_Transient;

  SetValue(Index: number, ent: IGESData_IGESEntity): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_GroupWithoutBackP: declare class IGESBasic_GroupWithoutBackP extends IGESBasic_Group

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_Hierarchy: declare class IGESBasic_Hierarchy extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aLineFont: number, aView: number, anEntityLevel: number, aBlankStatus: number, aLineWt: number, aColorNum: number): void;

  NbPropertyValues(): number;

  NewLineFont(): number;

  NewView(): number;

  NewEntityLevel(): number;

  NewBlankStatus(): number;

  NewLineWeight(): number;

  NewColorNum(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_Name: declare class IGESBasic_Name extends IGESData_NameEntity

  constructor

  Init(nbPropVal: number, aName: TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  Value(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_OrderedGroup: declare class IGESBasic_OrderedGroup extends IGESBasic_Group

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_OrderedGroupWithoutBackP: declare class IGESBasic_OrderedGroupWithoutBackP extends IGESBasic_Group

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_Protocol: declare class IGESBasic_Protocol extends IGESData_Protocol

  constructor

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  TypeNumber(atype: Standard_Type): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ReadWriteModule: declare class IGESBasic_ReadWriteModule extends IGESData_ReadWriteModule

  constructor

  CaseIGES(typenum: number, formnum: number): number;

  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_SingleParent: declare class IGESBasic_SingleParent extends IGESData_SingleParentEntity

  constructor

  Init(nbParentEntities: number, aParentEntity: IGESData_IGESEntity, allChildren: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  NbParentEntities(): number;

  SingleParent(): IGESData_IGESEntity;

  NbChildren(): number;

  Child(num: number): IGESData_IGESEntity;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_SingularSubfigure: declare class IGESBasic_SingularSubfigure extends IGESData_IGESEntity

  constructor

  Init(aSubfigureDef: IGESBasic_SubfigureDef, aTranslation: gp_XYZ, hasScale: boolean, aScale: number): void;

  Subfigure(): IGESBasic_SubfigureDef;

  Translation(): gp_XYZ;

  ScaleFactor(): number;

  HasScaleFactor(): boolean;

  TransformedTranslation(): gp_XYZ;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_SpecificModule: declare class IGESBasic_SpecificModule extends IGESData_SpecificModule

  constructor

  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_SubfigureDef: declare class IGESBasic_SubfigureDef extends IGESData_IGESEntity

  constructor

  Init(aDepth: number, aName: TCollection_HAsciiString, allAssocEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  Depth(): number;

  Name(): TCollection_HAsciiString;

  NbEntities(): number;

  AssociatedEntity(Index: number): IGESData_IGESEntity;

  Value(Index: number): Standard_Transient;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolAssocGroupType: declare class IGESBasic_ToolAssocGroupType

  constructor

  WriteOwnParams(ent: IGESBasic_AssocGroupType, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESBasic_AssocGroupType): boolean;

  DirChecker(ent: IGESBasic_AssocGroupType): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_AssocGroupType, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_AssocGroupType, entto: IGESBasic_AssocGroupType, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefFile: declare class IGESBasic_ToolExternalRefFile

  constructor

  WriteOwnParams(ent: IGESBasic_ExternalRefFile, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESBasic_ExternalRefFile): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_ExternalRefFile, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_ExternalRefFile, entto: IGESBasic_ExternalRefFile, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefFileIndex: declare class IGESBasic_ToolExternalRefFileIndex

  constructor

  WriteOwnParams(ent: IGESBasic_ExternalRefFileIndex, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESBasic_ExternalRefFileIndex): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_ExternalRefFileIndex, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_ExternalRefFileIndex, entto: IGESBasic_ExternalRefFileIndex, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefFileName: declare class IGESBasic_ToolExternalRefFileName

  constructor

  WriteOwnParams(ent: IGESBasic_ExternalRefFileName, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESBasic_ExternalRefFileName): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_ExternalRefFileName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_ExternalRefFileName, entto: IGESBasic_ExternalRefFileName, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefLibName: declare class IGESBasic_ToolExternalRefLibName

  constructor

  WriteOwnParams(ent: IGESBasic_ExternalRefLibName, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESBasic_ExternalRefLibName): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_ExternalRefLibName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_ExternalRefLibName, entto: IGESBasic_ExternalRefLibName, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefName: declare class IGESBasic_ToolExternalRefName

  constructor

  WriteOwnParams(ent: IGESBasic_ExternalRefName, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESBasic_ExternalRefName): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_ExternalRefName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_ExternalRefName, entto: IGESBasic_ExternalRefName, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolExternalReferenceFile: declare class IGESBasic_ToolExternalReferenceFile

  constructor

  WriteOwnParams(ent: IGESBasic_ExternalReferenceFile, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESBasic_ExternalReferenceFile): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_ExternalReferenceFile, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_ExternalReferenceFile, entto: IGESBasic_ExternalReferenceFile, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolGroup: declare class IGESBasic_ToolGroup

  constructor

  WriteOwnParams(ent: IGESBasic_Group, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESBasic_Group): boolean;

  DirChecker(ent: IGESBasic_Group): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_Group, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_Group, entto: IGESBasic_Group, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolGroupWithoutBackP: declare class IGESBasic_ToolGroupWithoutBackP

  constructor

  WriteOwnParams(ent: IGESBasic_GroupWithoutBackP, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESBasic_GroupWithoutBackP): boolean;

  DirChecker(ent: IGESBasic_GroupWithoutBackP): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_GroupWithoutBackP, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_GroupWithoutBackP, entto: IGESBasic_GroupWithoutBackP, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolHierarchy: declare class IGESBasic_ToolHierarchy

  constructor

  WriteOwnParams(ent: IGESBasic_Hierarchy, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESBasic_Hierarchy): boolean;

  DirChecker(ent: IGESBasic_Hierarchy): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_Hierarchy, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_Hierarchy, entto: IGESBasic_Hierarchy, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolName: declare class IGESBasic_ToolName

  constructor

  WriteOwnParams(ent: IGESBasic_Name, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESBasic_Name): boolean;

  DirChecker(ent: IGESBasic_Name): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_Name, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_Name, entto: IGESBasic_Name, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolOrderedGroup: declare class IGESBasic_ToolOrderedGroup

  constructor

  WriteOwnParams(ent: IGESBasic_OrderedGroup, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESBasic_OrderedGroup): boolean;

  DirChecker(ent: IGESBasic_OrderedGroup): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_OrderedGroup, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_OrderedGroup, entto: IGESBasic_OrderedGroup, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolOrderedGroupWithoutBackP: declare class IGESBasic_ToolOrderedGroupWithoutBackP

  constructor

  WriteOwnParams(ent: IGESBasic_OrderedGroupWithoutBackP, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESBasic_OrderedGroupWithoutBackP): boolean;

  DirChecker(ent: IGESBasic_OrderedGroupWithoutBackP): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_OrderedGroupWithoutBackP, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_OrderedGroupWithoutBackP, entto: IGESBasic_OrderedGroupWithoutBackP, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolSingleParent: declare class IGESBasic_ToolSingleParent

  constructor

  WriteOwnParams(ent: IGESBasic_SingleParent, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESBasic_SingleParent): boolean;

  DirChecker(ent: IGESBasic_SingleParent): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_SingleParent, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_SingleParent, entto: IGESBasic_SingleParent, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolSingularSubfigure: declare class IGESBasic_ToolSingularSubfigure

  constructor

  WriteOwnParams(ent: IGESBasic_SingularSubfigure, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESBasic_SingularSubfigure): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_SingularSubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_SingularSubfigure, entto: IGESBasic_SingularSubfigure, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_ToolSubfigureDef: declare class IGESBasic_ToolSubfigureDef

  constructor

  WriteOwnParams(ent: IGESBasic_SubfigureDef, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESBasic_SubfigureDef): IGESData_DirChecker;

  OwnCheck(ent: IGESBasic_SubfigureDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESBasic_SubfigureDef, entto: IGESBasic_SubfigureDef, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESBasic_Array1OfLineFontEntity: NCollection_Array1_handle_IGESData_LineFontEntity

IGESBasic_Array2OfHArray1OfReal: NCollection_Array2_handle_NCollection_HArray1_double

IGESBasic_HArray1OfLineFontEntity: NCollection_HArray1_handle_IGESData_LineFontEntity

IGESBasic_HArray2OfHArray1OfReal: NCollection_HArray2_handle_NCollection_HArray1_double
