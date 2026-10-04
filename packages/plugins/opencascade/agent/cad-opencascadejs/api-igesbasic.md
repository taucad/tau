# libcascade — IGESBasic

46 top-level symbols. Signatures are verbatim typescript.

IGESBasic: declare class IGESBasic

  // IGESBasic.constructor (constructor)
  constructor();

  // IGESBasic.Init (method)
  static Init(): void;

  // IGESBasic.Protocol (method)
  static Protocol(): IGESBasic_Protocol;

  // IGESBasic.delete (method)
  delete(): void;

  // IGESBasic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_AssocGroupType: declare class IGESBasic_AssocGroupType extends IGESData_IGESEntity

  // IGESBasic_AssocGroupType.constructor (constructor)
  constructor();

  // IGESBasic_AssocGroupType.Init (method)
  Init(nbDataFields: number, aType: number, aName: TCollection_HAsciiString): void;

  // IGESBasic_AssocGroupType.NbData (method)
  NbData(): number;

  // IGESBasic_AssocGroupType.AssocType (method)
  AssocType(): number;

  // IGESBasic_AssocGroupType.Name (method)
  Name(): TCollection_HAsciiString;

  // IGESBasic_AssocGroupType.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_AssocGroupType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_AssocGroupType.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_AssocGroupType.delete (method)
  delete(): void;

  // IGESBasic_AssocGroupType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ExternalRefFile: declare class IGESBasic_ExternalRefFile extends IGESData_IGESEntity

  // IGESBasic_ExternalRefFile.constructor (constructor)
  constructor();

  // IGESBasic_ExternalRefFile.Init (method)
  Init(aFileIdent: TCollection_HAsciiString): void;

  // IGESBasic_ExternalRefFile.FileId (method)
  FileId(): TCollection_HAsciiString;

  // IGESBasic_ExternalRefFile.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_ExternalRefFile.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_ExternalRefFile.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_ExternalRefFile.delete (method)
  delete(): void;

  // IGESBasic_ExternalRefFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ExternalRefFileIndex: declare class IGESBasic_ExternalRefFileIndex extends IGESData_IGESEntity

  // IGESBasic_ExternalRefFileIndex.constructor (constructor)
  constructor();

  // IGESBasic_ExternalRefFileIndex.Init (method)
  Init(aNameArray: NCollection_HArray1_handle_TCollection_HAsciiString, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESBasic_ExternalRefFileIndex.NbEntries (method)
  NbEntries(): number;

  // IGESBasic_ExternalRefFileIndex.Name (method)
  Name(Index: number): TCollection_HAsciiString;

  // IGESBasic_ExternalRefFileIndex.Entity (method)
  Entity(Index: number): IGESData_IGESEntity;

  // IGESBasic_ExternalRefFileIndex.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_ExternalRefFileIndex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_ExternalRefFileIndex.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_ExternalRefFileIndex.delete (method)
  delete(): void;

  // IGESBasic_ExternalRefFileIndex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ExternalRefFileName: declare class IGESBasic_ExternalRefFileName extends IGESData_IGESEntity

  // IGESBasic_ExternalRefFileName.constructor (constructor)
  constructor();

  // IGESBasic_ExternalRefFileName.Init (method)
  Init(aFileIdent: TCollection_HAsciiString, anExtName: TCollection_HAsciiString): void;

  // IGESBasic_ExternalRefFileName.SetForEntity (method)
  SetForEntity(mode: boolean): void;

  // IGESBasic_ExternalRefFileName.FileId (method)
  FileId(): TCollection_HAsciiString;

  // IGESBasic_ExternalRefFileName.ReferenceName (method)
  ReferenceName(): TCollection_HAsciiString;

  // IGESBasic_ExternalRefFileName.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_ExternalRefFileName.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_ExternalRefFileName.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_ExternalRefFileName.delete (method)
  delete(): void;

  // IGESBasic_ExternalRefFileName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ExternalRefLibName: declare class IGESBasic_ExternalRefLibName extends IGESData_IGESEntity

  // IGESBasic_ExternalRefLibName.constructor (constructor)
  constructor();

  // IGESBasic_ExternalRefLibName.Init (method)
  Init(aLibName: TCollection_HAsciiString, anExtName: TCollection_HAsciiString): void;

  // IGESBasic_ExternalRefLibName.LibraryName (method)
  LibraryName(): TCollection_HAsciiString;

  // IGESBasic_ExternalRefLibName.ReferenceName (method)
  ReferenceName(): TCollection_HAsciiString;

  // IGESBasic_ExternalRefLibName.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_ExternalRefLibName.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_ExternalRefLibName.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_ExternalRefLibName.delete (method)
  delete(): void;

  // IGESBasic_ExternalRefLibName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ExternalRefName: declare class IGESBasic_ExternalRefName extends IGESData_IGESEntity

  // IGESBasic_ExternalRefName.constructor (constructor)
  constructor();

  // IGESBasic_ExternalRefName.Init (method)
  Init(anExtName: TCollection_HAsciiString): void;

  // IGESBasic_ExternalRefName.ReferenceName (method)
  ReferenceName(): TCollection_HAsciiString;

  // IGESBasic_ExternalRefName.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_ExternalRefName.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_ExternalRefName.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_ExternalRefName.delete (method)
  delete(): void;

  // IGESBasic_ExternalRefName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ExternalReferenceFile: declare class IGESBasic_ExternalReferenceFile extends IGESData_IGESEntity

  // IGESBasic_ExternalReferenceFile.constructor (constructor)
  constructor();

  // IGESBasic_ExternalReferenceFile.Init (method)
  Init(aNameArray: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // IGESBasic_ExternalReferenceFile.NbListEntries (method)
  NbListEntries(): number;

  // IGESBasic_ExternalReferenceFile.Name (method)
  Name(Index: number): TCollection_HAsciiString;

  // IGESBasic_ExternalReferenceFile.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_ExternalReferenceFile.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_ExternalReferenceFile.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_ExternalReferenceFile.delete (method)
  delete(): void;

  // IGESBasic_ExternalReferenceFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_GeneralModule: declare class IGESBasic_GeneralModule extends IGESData_GeneralModule

  // IGESBasic_GeneralModule.constructor (constructor)
  constructor();

  // IGESBasic_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESBasic_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESBasic_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESBasic_GeneralModule.CategoryNumber (method)
  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  // IGESBasic_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_GeneralModule.delete (method)
  delete(): void;

  // IGESBasic_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_Group: declare class IGESBasic_Group extends IGESData_IGESEntity

  // IGESBasic_Group.constructor (constructor)
  constructor();
  constructor(nb: number);

  // IGESBasic_Group.Init (method)
  Init(allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESBasic_Group.SetOrdered (method)
  SetOrdered(mode: boolean): void;

  // IGESBasic_Group.SetWithoutBackP (method)
  SetWithoutBackP(mode: boolean): void;

  // IGESBasic_Group.IsOrdered (method)
  IsOrdered(): boolean;

  // IGESBasic_Group.IsWithoutBackP (method)
  IsWithoutBackP(): boolean;

  // IGESBasic_Group.SetUser (method)
  SetUser(type_: number, form: number): void;

  // IGESBasic_Group.SetNb (method)
  SetNb(nb: number): void;

  // IGESBasic_Group.NbEntities (method)
  NbEntities(): number;

  // IGESBasic_Group.Entity (method)
  Entity(Index: number): IGESData_IGESEntity;

  // IGESBasic_Group.Value (method)
  Value(Index: number): Standard_Transient;

  // IGESBasic_Group.SetValue (method)
  SetValue(Index: number, ent: IGESData_IGESEntity): void;

  // IGESBasic_Group.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_Group.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_Group.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_Group.delete (method)
  delete(): void;

  // IGESBasic_Group.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_GroupWithoutBackP: declare class IGESBasic_GroupWithoutBackP extends IGESBasic_Group

  // IGESBasic_GroupWithoutBackP.constructor (constructor)
  constructor();

  // IGESBasic_GroupWithoutBackP.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_GroupWithoutBackP.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_GroupWithoutBackP.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_GroupWithoutBackP.delete (method)
  delete(): void;

  // IGESBasic_GroupWithoutBackP.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfIGESEntity: declare class IGESBasic_HArray1OfHArray1OfIGESEntity extends Standard_Transient

  // IGESBasic_HArray1OfHArray1OfIGESEntity.constructor (constructor)
  constructor(low: number, up: number);

  // IGESBasic_HArray1OfHArray1OfIGESEntity.Lower (method)
  Lower(): number;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.Upper (method)
  Upper(): number;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.Length (method)
  Length(): number;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.SetValue (method)
  SetValue(num: number, val: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.Value (method)
  Value(num: number): NCollection_HArray1_handle_IGESData_IGESEntity;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.delete (method)
  delete(): void;

  // IGESBasic_HArray1OfHArray1OfIGESEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfInteger: declare class IGESBasic_HArray1OfHArray1OfInteger extends Standard_Transient

  // IGESBasic_HArray1OfHArray1OfInteger.constructor (constructor)
  constructor(low: number, up: number);

  // IGESBasic_HArray1OfHArray1OfInteger.Lower (method)
  Lower(): number;

  // IGESBasic_HArray1OfHArray1OfInteger.Upper (method)
  Upper(): number;

  // IGESBasic_HArray1OfHArray1OfInteger.Length (method)
  Length(): number;

  // IGESBasic_HArray1OfHArray1OfInteger.SetValue (method)
  SetValue(num: number, val: NCollection_HArray1_int): void;

  // IGESBasic_HArray1OfHArray1OfInteger.Value (method)
  Value(num: number): NCollection_HArray1_int;

  // IGESBasic_HArray1OfHArray1OfInteger.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_HArray1OfHArray1OfInteger.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfInteger.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfInteger.delete (method)
  delete(): void;

  // IGESBasic_HArray1OfHArray1OfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfReal: declare class IGESBasic_HArray1OfHArray1OfReal extends Standard_Transient

  // IGESBasic_HArray1OfHArray1OfReal.constructor (constructor)
  constructor(low: number, up: number);

  // IGESBasic_HArray1OfHArray1OfReal.Lower (method)
  Lower(): number;

  // IGESBasic_HArray1OfHArray1OfReal.Upper (method)
  Upper(): number;

  // IGESBasic_HArray1OfHArray1OfReal.Length (method)
  Length(): number;

  // IGESBasic_HArray1OfHArray1OfReal.SetValue (method)
  SetValue(num: number, val: NCollection_HArray1_double): void;

  // IGESBasic_HArray1OfHArray1OfReal.Value (method)
  Value(num: number): NCollection_HArray1_double;

  // IGESBasic_HArray1OfHArray1OfReal.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_HArray1OfHArray1OfReal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfReal.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfReal.delete (method)
  delete(): void;

  // IGESBasic_HArray1OfHArray1OfReal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfXY: declare class IGESBasic_HArray1OfHArray1OfXY extends Standard_Transient

  // IGESBasic_HArray1OfHArray1OfXY.constructor (constructor)
  constructor(low: number, up: number);

  // IGESBasic_HArray1OfHArray1OfXY.Lower (method)
  Lower(): number;

  // IGESBasic_HArray1OfHArray1OfXY.Upper (method)
  Upper(): number;

  // IGESBasic_HArray1OfHArray1OfXY.Length (method)
  Length(): number;

  // IGESBasic_HArray1OfHArray1OfXY.SetValue (method)
  SetValue(num: number, val: NCollection_HArray1_gp_XY): void;

  // IGESBasic_HArray1OfHArray1OfXY.Value (method)
  Value(num: number): NCollection_HArray1_gp_XY;

  // IGESBasic_HArray1OfHArray1OfXY.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_HArray1OfHArray1OfXY.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfXY.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfXY.delete (method)
  delete(): void;

  // IGESBasic_HArray1OfHArray1OfXY.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_HArray1OfHArray1OfXYZ: declare class IGESBasic_HArray1OfHArray1OfXYZ extends Standard_Transient

  // IGESBasic_HArray1OfHArray1OfXYZ.constructor (constructor)
  constructor(low: number, up: number);

  // IGESBasic_HArray1OfHArray1OfXYZ.Lower (method)
  Lower(): number;

  // IGESBasic_HArray1OfHArray1OfXYZ.Upper (method)
  Upper(): number;

  // IGESBasic_HArray1OfHArray1OfXYZ.Length (method)
  Length(): number;

  // IGESBasic_HArray1OfHArray1OfXYZ.SetValue (method)
  SetValue(num: number, val: NCollection_HArray1_gp_XYZ): void;

  // IGESBasic_HArray1OfHArray1OfXYZ.Value (method)
  Value(num: number): NCollection_HArray1_gp_XYZ;

  // IGESBasic_HArray1OfHArray1OfXYZ.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_HArray1OfHArray1OfXYZ.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfXYZ.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_HArray1OfHArray1OfXYZ.delete (method)
  delete(): void;

  // IGESBasic_HArray1OfHArray1OfXYZ.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_Hierarchy: declare class IGESBasic_Hierarchy extends IGESData_IGESEntity

  // IGESBasic_Hierarchy.constructor (constructor)
  constructor();

  // IGESBasic_Hierarchy.Init (method)
  Init(nbPropVal: number, aLineFont: number, aView: number, anEntityLevel: number, aBlankStatus: number, aLineWt: number, aColorNum: number): void;

  // IGESBasic_Hierarchy.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESBasic_Hierarchy.NewLineFont (method)
  NewLineFont(): number;

  // IGESBasic_Hierarchy.NewView (method)
  NewView(): number;

  // IGESBasic_Hierarchy.NewEntityLevel (method)
  NewEntityLevel(): number;

  // IGESBasic_Hierarchy.NewBlankStatus (method)
  NewBlankStatus(): number;

  // IGESBasic_Hierarchy.NewLineWeight (method)
  NewLineWeight(): number;

  // IGESBasic_Hierarchy.NewColorNum (method)
  NewColorNum(): number;

  // IGESBasic_Hierarchy.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_Hierarchy.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_Hierarchy.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_Hierarchy.delete (method)
  delete(): void;

  // IGESBasic_Hierarchy.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_Name: declare class IGESBasic_Name extends IGESData_NameEntity

  // IGESBasic_Name.constructor (constructor)
  constructor();

  // IGESBasic_Name.Init (method)
  Init(nbPropVal: number, aName: TCollection_HAsciiString): void;

  // IGESBasic_Name.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESBasic_Name.Value (method)
  Value(): TCollection_HAsciiString;

  // IGESBasic_Name.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_Name.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_Name.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_Name.delete (method)
  delete(): void;

  // IGESBasic_Name.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_OrderedGroup: declare class IGESBasic_OrderedGroup extends IGESBasic_Group

  // IGESBasic_OrderedGroup.constructor (constructor)
  constructor();

  // IGESBasic_OrderedGroup.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_OrderedGroup.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_OrderedGroup.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_OrderedGroup.delete (method)
  delete(): void;

  // IGESBasic_OrderedGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_OrderedGroupWithoutBackP: declare class IGESBasic_OrderedGroupWithoutBackP extends IGESBasic_Group

  // IGESBasic_OrderedGroupWithoutBackP.constructor (constructor)
  constructor();

  // IGESBasic_OrderedGroupWithoutBackP.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_OrderedGroupWithoutBackP.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_OrderedGroupWithoutBackP.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_OrderedGroupWithoutBackP.delete (method)
  delete(): void;

  // IGESBasic_OrderedGroupWithoutBackP.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_Protocol: declare class IGESBasic_Protocol extends IGESData_Protocol

  // IGESBasic_Protocol.constructor (constructor)
  constructor();

  // IGESBasic_Protocol.NbResources (method)
  NbResources(): number;

  // IGESBasic_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESBasic_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESBasic_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_Protocol.delete (method)
  delete(): void;

  // IGESBasic_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ReadWriteModule: declare class IGESBasic_ReadWriteModule extends IGESData_ReadWriteModule

  // IGESBasic_ReadWriteModule.constructor (constructor)
  constructor();

  // IGESBasic_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESBasic_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESBasic_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_ReadWriteModule.delete (method)
  delete(): void;

  // IGESBasic_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_SingleParent: declare class IGESBasic_SingleParent extends IGESData_SingleParentEntity

  // IGESBasic_SingleParent.constructor (constructor)
  constructor();

  // IGESBasic_SingleParent.Init (method)
  Init(nbParentEntities: number, aParentEntity: IGESData_IGESEntity, allChildren: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESBasic_SingleParent.NbParentEntities (method)
  NbParentEntities(): number;

  // IGESBasic_SingleParent.SingleParent (method)
  SingleParent(): IGESData_IGESEntity;

  // IGESBasic_SingleParent.NbChildren (method)
  NbChildren(): number;

  // IGESBasic_SingleParent.Child (method)
  Child(num: number): IGESData_IGESEntity;

  // IGESBasic_SingleParent.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_SingleParent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_SingleParent.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_SingleParent.delete (method)
  delete(): void;

  // IGESBasic_SingleParent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_SingularSubfigure: declare class IGESBasic_SingularSubfigure extends IGESData_IGESEntity

  // IGESBasic_SingularSubfigure.constructor (constructor)
  constructor();

  // IGESBasic_SingularSubfigure.Init (method)
  Init(aSubfigureDef: IGESBasic_SubfigureDef, aTranslation: gp_XYZ, hasScale: boolean, aScale: number): void;

  // IGESBasic_SingularSubfigure.Subfigure (method)
  Subfigure(): IGESBasic_SubfigureDef;

  // IGESBasic_SingularSubfigure.Translation (method)
  Translation(): gp_XYZ;

  // IGESBasic_SingularSubfigure.ScaleFactor (method)
  ScaleFactor(): number;

  // IGESBasic_SingularSubfigure.HasScaleFactor (method)
  HasScaleFactor(): boolean;

  // IGESBasic_SingularSubfigure.TransformedTranslation (method)
  TransformedTranslation(): gp_XYZ;

  // IGESBasic_SingularSubfigure.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_SingularSubfigure.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_SingularSubfigure.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_SingularSubfigure.delete (method)
  delete(): void;

  // IGESBasic_SingularSubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_SpecificModule: declare class IGESBasic_SpecificModule extends IGESData_SpecificModule

  // IGESBasic_SpecificModule.constructor (constructor)
  constructor();

  // IGESBasic_SpecificModule.OwnCorrect (method)
  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  // IGESBasic_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_SpecificModule.delete (method)
  delete(): void;

  // IGESBasic_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_SubfigureDef: declare class IGESBasic_SubfigureDef extends IGESData_IGESEntity

  // IGESBasic_SubfigureDef.constructor (constructor)
  constructor();

  // IGESBasic_SubfigureDef.Init (method)
  Init(aDepth: number, aName: TCollection_HAsciiString, allAssocEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESBasic_SubfigureDef.Depth (method)
  Depth(): number;

  // IGESBasic_SubfigureDef.Name (method)
  Name(): TCollection_HAsciiString;

  // IGESBasic_SubfigureDef.NbEntities (method)
  NbEntities(): number;

  // IGESBasic_SubfigureDef.AssociatedEntity (method)
  AssociatedEntity(Index: number): IGESData_IGESEntity;

  // IGESBasic_SubfigureDef.Value (method)
  Value(Index: number): Standard_Transient;

  // IGESBasic_SubfigureDef.get_type_name (method)
  static get_type_name(): string;

  // IGESBasic_SubfigureDef.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESBasic_SubfigureDef.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESBasic_SubfigureDef.delete (method)
  delete(): void;

  // IGESBasic_SubfigureDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolAssocGroupType: declare class IGESBasic_ToolAssocGroupType

  // IGESBasic_ToolAssocGroupType.constructor (constructor)
  constructor();

  // IGESBasic_ToolAssocGroupType.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_AssocGroupType, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolAssocGroupType.OwnCorrect (method)
  OwnCorrect(ent: IGESBasic_AssocGroupType): boolean;

  // IGESBasic_ToolAssocGroupType.DirChecker (method)
  DirChecker(ent: IGESBasic_AssocGroupType): IGESData_DirChecker;

  // IGESBasic_ToolAssocGroupType.OwnCheck (method)
  OwnCheck(ent: IGESBasic_AssocGroupType, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolAssocGroupType.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_AssocGroupType, entto: IGESBasic_AssocGroupType, TC: Interface_CopyTool): void;

  // IGESBasic_ToolAssocGroupType.delete (method)
  delete(): void;

  // IGESBasic_ToolAssocGroupType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefFile: declare class IGESBasic_ToolExternalRefFile

  // IGESBasic_ToolExternalRefFile.constructor (constructor)
  constructor();

  // IGESBasic_ToolExternalRefFile.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_ExternalRefFile, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolExternalRefFile.DirChecker (method)
  DirChecker(ent: IGESBasic_ExternalRefFile): IGESData_DirChecker;

  // IGESBasic_ToolExternalRefFile.OwnCheck (method)
  OwnCheck(ent: IGESBasic_ExternalRefFile, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolExternalRefFile.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_ExternalRefFile, entto: IGESBasic_ExternalRefFile, TC: Interface_CopyTool): void;

  // IGESBasic_ToolExternalRefFile.delete (method)
  delete(): void;

  // IGESBasic_ToolExternalRefFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefFileIndex: declare class IGESBasic_ToolExternalRefFileIndex

  // IGESBasic_ToolExternalRefFileIndex.constructor (constructor)
  constructor();

  // IGESBasic_ToolExternalRefFileIndex.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_ExternalRefFileIndex, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolExternalRefFileIndex.DirChecker (method)
  DirChecker(ent: IGESBasic_ExternalRefFileIndex): IGESData_DirChecker;

  // IGESBasic_ToolExternalRefFileIndex.OwnCheck (method)
  OwnCheck(ent: IGESBasic_ExternalRefFileIndex, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolExternalRefFileIndex.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_ExternalRefFileIndex, entto: IGESBasic_ExternalRefFileIndex, TC: Interface_CopyTool): void;

  // IGESBasic_ToolExternalRefFileIndex.delete (method)
  delete(): void;

  // IGESBasic_ToolExternalRefFileIndex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefFileName: declare class IGESBasic_ToolExternalRefFileName

  // IGESBasic_ToolExternalRefFileName.constructor (constructor)
  constructor();

  // IGESBasic_ToolExternalRefFileName.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_ExternalRefFileName, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolExternalRefFileName.DirChecker (method)
  DirChecker(ent: IGESBasic_ExternalRefFileName): IGESData_DirChecker;

  // IGESBasic_ToolExternalRefFileName.OwnCheck (method)
  OwnCheck(ent: IGESBasic_ExternalRefFileName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolExternalRefFileName.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_ExternalRefFileName, entto: IGESBasic_ExternalRefFileName, TC: Interface_CopyTool): void;

  // IGESBasic_ToolExternalRefFileName.delete (method)
  delete(): void;

  // IGESBasic_ToolExternalRefFileName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefLibName: declare class IGESBasic_ToolExternalRefLibName

  // IGESBasic_ToolExternalRefLibName.constructor (constructor)
  constructor();

  // IGESBasic_ToolExternalRefLibName.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_ExternalRefLibName, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolExternalRefLibName.DirChecker (method)
  DirChecker(ent: IGESBasic_ExternalRefLibName): IGESData_DirChecker;

  // IGESBasic_ToolExternalRefLibName.OwnCheck (method)
  OwnCheck(ent: IGESBasic_ExternalRefLibName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolExternalRefLibName.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_ExternalRefLibName, entto: IGESBasic_ExternalRefLibName, TC: Interface_CopyTool): void;

  // IGESBasic_ToolExternalRefLibName.delete (method)
  delete(): void;

  // IGESBasic_ToolExternalRefLibName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolExternalRefName: declare class IGESBasic_ToolExternalRefName

  // IGESBasic_ToolExternalRefName.constructor (constructor)
  constructor();

  // IGESBasic_ToolExternalRefName.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_ExternalRefName, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolExternalRefName.DirChecker (method)
  DirChecker(ent: IGESBasic_ExternalRefName): IGESData_DirChecker;

  // IGESBasic_ToolExternalRefName.OwnCheck (method)
  OwnCheck(ent: IGESBasic_ExternalRefName, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolExternalRefName.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_ExternalRefName, entto: IGESBasic_ExternalRefName, TC: Interface_CopyTool): void;

  // IGESBasic_ToolExternalRefName.delete (method)
  delete(): void;

  // IGESBasic_ToolExternalRefName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolExternalReferenceFile: declare class IGESBasic_ToolExternalReferenceFile

  // IGESBasic_ToolExternalReferenceFile.constructor (constructor)
  constructor();

  // IGESBasic_ToolExternalReferenceFile.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_ExternalReferenceFile, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolExternalReferenceFile.DirChecker (method)
  DirChecker(ent: IGESBasic_ExternalReferenceFile): IGESData_DirChecker;

  // IGESBasic_ToolExternalReferenceFile.OwnCheck (method)
  OwnCheck(ent: IGESBasic_ExternalReferenceFile, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolExternalReferenceFile.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_ExternalReferenceFile, entto: IGESBasic_ExternalReferenceFile, TC: Interface_CopyTool): void;

  // IGESBasic_ToolExternalReferenceFile.delete (method)
  delete(): void;

  // IGESBasic_ToolExternalReferenceFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolGroup: declare class IGESBasic_ToolGroup

  // IGESBasic_ToolGroup.constructor (constructor)
  constructor();

  // IGESBasic_ToolGroup.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_Group, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolGroup.OwnCorrect (method)
  OwnCorrect(ent: IGESBasic_Group): boolean;

  // IGESBasic_ToolGroup.DirChecker (method)
  DirChecker(ent: IGESBasic_Group): IGESData_DirChecker;

  // IGESBasic_ToolGroup.OwnCheck (method)
  OwnCheck(ent: IGESBasic_Group, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolGroup.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_Group, entto: IGESBasic_Group, TC: Interface_CopyTool): void;

  // IGESBasic_ToolGroup.delete (method)
  delete(): void;

  // IGESBasic_ToolGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolGroupWithoutBackP: declare class IGESBasic_ToolGroupWithoutBackP

  // IGESBasic_ToolGroupWithoutBackP.constructor (constructor)
  constructor();

  // IGESBasic_ToolGroupWithoutBackP.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_GroupWithoutBackP, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolGroupWithoutBackP.OwnCorrect (method)
  OwnCorrect(ent: IGESBasic_GroupWithoutBackP): boolean;

  // IGESBasic_ToolGroupWithoutBackP.DirChecker (method)
  DirChecker(ent: IGESBasic_GroupWithoutBackP): IGESData_DirChecker;

  // IGESBasic_ToolGroupWithoutBackP.OwnCheck (method)
  OwnCheck(ent: IGESBasic_GroupWithoutBackP, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolGroupWithoutBackP.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_GroupWithoutBackP, entto: IGESBasic_GroupWithoutBackP, TC: Interface_CopyTool): void;

  // IGESBasic_ToolGroupWithoutBackP.delete (method)
  delete(): void;

  // IGESBasic_ToolGroupWithoutBackP.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolHierarchy: declare class IGESBasic_ToolHierarchy

  // IGESBasic_ToolHierarchy.constructor (constructor)
  constructor();

  // IGESBasic_ToolHierarchy.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_Hierarchy, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolHierarchy.OwnCorrect (method)
  OwnCorrect(ent: IGESBasic_Hierarchy): boolean;

  // IGESBasic_ToolHierarchy.DirChecker (method)
  DirChecker(ent: IGESBasic_Hierarchy): IGESData_DirChecker;

  // IGESBasic_ToolHierarchy.OwnCheck (method)
  OwnCheck(ent: IGESBasic_Hierarchy, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolHierarchy.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_Hierarchy, entto: IGESBasic_Hierarchy, TC: Interface_CopyTool): void;

  // IGESBasic_ToolHierarchy.delete (method)
  delete(): void;

  // IGESBasic_ToolHierarchy.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolName: declare class IGESBasic_ToolName

  // IGESBasic_ToolName.constructor (constructor)
  constructor();

  // IGESBasic_ToolName.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_Name, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolName.OwnCorrect (method)
  OwnCorrect(ent: IGESBasic_Name): boolean;

  // IGESBasic_ToolName.DirChecker (method)
  DirChecker(ent: IGESBasic_Name): IGESData_DirChecker;

  // IGESBasic_ToolName.OwnCheck (method)
  OwnCheck(ent: IGESBasic_Name, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolName.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_Name, entto: IGESBasic_Name, TC: Interface_CopyTool): void;

  // IGESBasic_ToolName.delete (method)
  delete(): void;

  // IGESBasic_ToolName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolOrderedGroup: declare class IGESBasic_ToolOrderedGroup

  // IGESBasic_ToolOrderedGroup.constructor (constructor)
  constructor();

  // IGESBasic_ToolOrderedGroup.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_OrderedGroup, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolOrderedGroup.OwnCorrect (method)
  OwnCorrect(ent: IGESBasic_OrderedGroup): boolean;

  // IGESBasic_ToolOrderedGroup.DirChecker (method)
  DirChecker(ent: IGESBasic_OrderedGroup): IGESData_DirChecker;

  // IGESBasic_ToolOrderedGroup.OwnCheck (method)
  OwnCheck(ent: IGESBasic_OrderedGroup, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolOrderedGroup.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_OrderedGroup, entto: IGESBasic_OrderedGroup, TC: Interface_CopyTool): void;

  // IGESBasic_ToolOrderedGroup.delete (method)
  delete(): void;

  // IGESBasic_ToolOrderedGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolOrderedGroupWithoutBackP: declare class IGESBasic_ToolOrderedGroupWithoutBackP

  // IGESBasic_ToolOrderedGroupWithoutBackP.constructor (constructor)
  constructor();

  // IGESBasic_ToolOrderedGroupWithoutBackP.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_OrderedGroupWithoutBackP, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolOrderedGroupWithoutBackP.OwnCorrect (method)
  OwnCorrect(ent: IGESBasic_OrderedGroupWithoutBackP): boolean;

  // IGESBasic_ToolOrderedGroupWithoutBackP.DirChecker (method)
  DirChecker(ent: IGESBasic_OrderedGroupWithoutBackP): IGESData_DirChecker;

  // IGESBasic_ToolOrderedGroupWithoutBackP.OwnCheck (method)
  OwnCheck(ent: IGESBasic_OrderedGroupWithoutBackP, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolOrderedGroupWithoutBackP.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_OrderedGroupWithoutBackP, entto: IGESBasic_OrderedGroupWithoutBackP, TC: Interface_CopyTool): void;

  // IGESBasic_ToolOrderedGroupWithoutBackP.delete (method)
  delete(): void;

  // IGESBasic_ToolOrderedGroupWithoutBackP.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolSingleParent: declare class IGESBasic_ToolSingleParent

  // IGESBasic_ToolSingleParent.constructor (constructor)
  constructor();

  // IGESBasic_ToolSingleParent.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_SingleParent, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolSingleParent.OwnCorrect (method)
  OwnCorrect(ent: IGESBasic_SingleParent): boolean;

  // IGESBasic_ToolSingleParent.DirChecker (method)
  DirChecker(ent: IGESBasic_SingleParent): IGESData_DirChecker;

  // IGESBasic_ToolSingleParent.OwnCheck (method)
  OwnCheck(ent: IGESBasic_SingleParent, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolSingleParent.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_SingleParent, entto: IGESBasic_SingleParent, TC: Interface_CopyTool): void;

  // IGESBasic_ToolSingleParent.delete (method)
  delete(): void;

  // IGESBasic_ToolSingleParent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolSingularSubfigure: declare class IGESBasic_ToolSingularSubfigure

  // IGESBasic_ToolSingularSubfigure.constructor (constructor)
  constructor();

  // IGESBasic_ToolSingularSubfigure.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_SingularSubfigure, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolSingularSubfigure.DirChecker (method)
  DirChecker(ent: IGESBasic_SingularSubfigure): IGESData_DirChecker;

  // IGESBasic_ToolSingularSubfigure.OwnCheck (method)
  OwnCheck(ent: IGESBasic_SingularSubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolSingularSubfigure.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_SingularSubfigure, entto: IGESBasic_SingularSubfigure, TC: Interface_CopyTool): void;

  // IGESBasic_ToolSingularSubfigure.delete (method)
  delete(): void;

  // IGESBasic_ToolSingularSubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_ToolSubfigureDef: declare class IGESBasic_ToolSubfigureDef

  // IGESBasic_ToolSubfigureDef.constructor (constructor)
  constructor();

  // IGESBasic_ToolSubfigureDef.WriteOwnParams (method)
  WriteOwnParams(ent: IGESBasic_SubfigureDef, IW: IGESData_IGESWriter): void;

  // IGESBasic_ToolSubfigureDef.DirChecker (method)
  DirChecker(ent: IGESBasic_SubfigureDef): IGESData_DirChecker;

  // IGESBasic_ToolSubfigureDef.OwnCheck (method)
  OwnCheck(ent: IGESBasic_SubfigureDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESBasic_ToolSubfigureDef.OwnCopy (method)
  OwnCopy(entfrom: IGESBasic_SubfigureDef, entto: IGESBasic_SubfigureDef, TC: Interface_CopyTool): void;

  // IGESBasic_ToolSubfigureDef.delete (method)
  delete(): void;

  // IGESBasic_ToolSubfigureDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESBasic_Array1OfLineFontEntity: NCollection_Array1_handle_IGESData_LineFontEntity

IGESBasic_Array2OfHArray1OfReal: NCollection_Array2_handle_NCollection_HArray1_double

IGESBasic_HArray1OfLineFontEntity: NCollection_HArray1_handle_IGESData_LineFontEntity

IGESBasic_HArray2OfHArray1OfReal: NCollection_HArray2_handle_NCollection_HArray1_double
