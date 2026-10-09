# libcascade — IGESData (2)

12 top-level symbols. Signatures are verbatim typescript.

IGESData_ReadWriteModule: declare class IGESData_ReadWriteModule extends Interface_ReaderModule

  // IGESData_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESData_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESData_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESData_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_ReadWriteModule.delete (method)
  delete(): void;

  // IGESData_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_SingleParentEntity: declare class IGESData_SingleParentEntity extends IGESData_IGESEntity

  // IGESData_SingleParentEntity.SingleParent (method)
  SingleParent(): IGESData_IGESEntity;

  // IGESData_SingleParentEntity.NbChildren (method)
  NbChildren(): number;

  // IGESData_SingleParentEntity.Child (method)
  Child(num: number): IGESData_IGESEntity;

  // IGESData_SingleParentEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_SingleParentEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_SingleParentEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_SingleParentEntity.delete (method)
  delete(): void;

  // IGESData_SingleParentEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_SpecificLib: declare class IGESData_SpecificLib

  // IGESData_SpecificLib.constructor (constructor)
  constructor();
  constructor(aprotocol: IGESData_Protocol);

  // IGESData_SpecificLib.SetGlobal (method)
  static SetGlobal(amodule: IGESData_SpecificModule, aprotocol: IGESData_Protocol): void;

  // IGESData_SpecificLib.AddProtocol (method)
  AddProtocol(aprotocol: Standard_Transient): void;

  // IGESData_SpecificLib.Clear (method)
  Clear(): void;

  // IGESData_SpecificLib.SetComplete (method)
  SetComplete(): void;

  // IGESData_SpecificLib.Select (method)
  Select(obj: IGESData_IGESEntity, CN?: number): { returnValue: boolean; module_: IGESData_SpecificModule; CN: number; [Symbol.dispose](): void };

  // IGESData_SpecificLib.Start (method)
  Start(): void;

  // IGESData_SpecificLib.More (method)
  More(): boolean;

  // IGESData_SpecificLib.Next (method)
  Next(): void;

  // IGESData_SpecificLib.Module (method)
  Module(): IGESData_SpecificModule;

  // IGESData_SpecificLib.Protocol (method)
  Protocol(): IGESData_Protocol;

  // IGESData_SpecificLib.delete (method)
  delete(): void;

  // IGESData_SpecificLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_SpecificModule: declare class IGESData_SpecificModule extends Standard_Transient

  // IGESData_SpecificModule.OwnCorrect (method)
  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  // IGESData_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESData_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_SpecificModule.delete (method)
  delete(): void;

  // IGESData_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_Status: typeof IGESData_Status[keyof typeof IGESData_Status]

  readonly IGESData_EntityOK: 'IGESData_EntityOK'

  readonly IGESData_EntityError: 'IGESData_EntityError'

  readonly IGESData_ReferenceError: 'IGESData_ReferenceError'

  readonly IGESData_TypeError: 'IGESData_TypeError'

IGESData_ToolLocation: declare class IGESData_ToolLocation extends Standard_Transient

  // IGESData_ToolLocation.constructor (constructor)
  constructor(amodel: IGESData_IGESModel, protocol: IGESData_Protocol);

  // IGESData_ToolLocation.Load (method)
  Load(): void;

  // IGESData_ToolLocation.SetPrecision (method)
  SetPrecision(prec: number): void;

  // IGESData_ToolLocation.SetReference (method)
  SetReference(parent: IGESData_IGESEntity, child: IGESData_IGESEntity): void;

  // IGESData_ToolLocation.SetParentAssoc (method)
  SetParentAssoc(parent: IGESData_IGESEntity, child: IGESData_IGESEntity): void;

  // IGESData_ToolLocation.ResetDependences (method)
  ResetDependences(child: IGESData_IGESEntity): void;

  // IGESData_ToolLocation.SetOwnAsDependent (method)
  SetOwnAsDependent(ent: IGESData_IGESEntity): void;

  // IGESData_ToolLocation.IsTransf (method)
  IsTransf(ent: IGESData_IGESEntity): boolean;

  // IGESData_ToolLocation.IsAssociativity (method)
  IsAssociativity(ent: IGESData_IGESEntity): boolean;

  // IGESData_ToolLocation.HasTransf (method)
  HasTransf(ent: IGESData_IGESEntity): boolean;

  // IGESData_ToolLocation.ExplicitLocation (method)
  ExplicitLocation(ent: IGESData_IGESEntity): gp_GTrsf;

  // IGESData_ToolLocation.IsAmbiguous (method)
  IsAmbiguous(ent: IGESData_IGESEntity): boolean;

  // IGESData_ToolLocation.HasParent (method)
  HasParent(ent: IGESData_IGESEntity): boolean;

  // IGESData_ToolLocation.Parent (method)
  Parent(ent: IGESData_IGESEntity): IGESData_IGESEntity;

  // IGESData_ToolLocation.HasParentByAssociativity (method)
  HasParentByAssociativity(ent: IGESData_IGESEntity): boolean;

  // IGESData_ToolLocation.ParentLocation (method)
  ParentLocation(ent: IGESData_IGESEntity): gp_GTrsf;

  // IGESData_ToolLocation.EffectiveLocation (method)
  EffectiveLocation(ent: IGESData_IGESEntity): gp_GTrsf;

  // IGESData_ToolLocation.AnalyseLocation (method)
  AnalyseLocation(loc: gp_GTrsf, result: gp_Trsf): boolean;

  // IGESData_ToolLocation.ConvertLocation (method)
  static ConvertLocation(prec: number, loc: gp_GTrsf, result: gp_Trsf, uni: number): boolean;

  // IGESData_ToolLocation.get_type_name (method)
  static get_type_name(): string;

  // IGESData_ToolLocation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_ToolLocation.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_ToolLocation.delete (method)
  delete(): void;

  // IGESData_ToolLocation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_TransfEntity: declare class IGESData_TransfEntity extends IGESData_IGESEntity

  // IGESData_TransfEntity.Value (method)
  Value(): gp_GTrsf;

  // IGESData_TransfEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_TransfEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_TransfEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_TransfEntity.delete (method)
  delete(): void;

  // IGESData_TransfEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_UndefinedEntity: declare class IGESData_UndefinedEntity extends IGESData_IGESEntity

  // IGESData_UndefinedEntity.constructor (constructor)
  constructor();

  // IGESData_UndefinedEntity.IsOKDirPart (method)
  IsOKDirPart(): boolean;

  // IGESData_UndefinedEntity.DirStatus (method)
  DirStatus(): number;

  // IGESData_UndefinedEntity.SetOKDirPart (method)
  SetOKDirPart(): void;

  // IGESData_UndefinedEntity.DefLineFont (method)
  DefLineFont(): IGESData_DefType;

  // IGESData_UndefinedEntity.DefLevel (method)
  DefLevel(): IGESData_DefList;

  // IGESData_UndefinedEntity.DefView (method)
  DefView(): IGESData_DefList;

  // IGESData_UndefinedEntity.DefColor (method)
  DefColor(): IGESData_DefType;

  // IGESData_UndefinedEntity.HasSubScriptNumber (method)
  HasSubScriptNumber(): boolean;

  // IGESData_UndefinedEntity.WriteOwnParams (method)
  WriteOwnParams(IW: IGESData_IGESWriter): void;

  // IGESData_UndefinedEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_UndefinedEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_UndefinedEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_UndefinedEntity.delete (method)
  delete(): void;

  // IGESData_UndefinedEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_ViewKindEntity: declare class IGESData_ViewKindEntity extends IGESData_IGESEntity

  // IGESData_ViewKindEntity.IsSingle (method)
  IsSingle(): boolean;

  // IGESData_ViewKindEntity.NbViews (method)
  NbViews(): number;

  // IGESData_ViewKindEntity.ViewItem (method)
  ViewItem(num: number): IGESData_ViewKindEntity;

  // IGESData_ViewKindEntity.get_type_name (method)
  static get_type_name(): string;

  // IGESData_ViewKindEntity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESData_ViewKindEntity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESData_ViewKindEntity.delete (method)
  delete(): void;

  // IGESData_ViewKindEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_WriterLib: declare class IGESData_WriterLib

  // IGESData_WriterLib.constructor (constructor)
  constructor();
  constructor(aprotocol: IGESData_Protocol);

  // IGESData_WriterLib.SetGlobal (method)
  static SetGlobal(amodule: IGESData_ReadWriteModule, aprotocol: IGESData_Protocol): void;

  // IGESData_WriterLib.AddProtocol (method)
  AddProtocol(aprotocol: Standard_Transient): void;

  // IGESData_WriterLib.Clear (method)
  Clear(): void;

  // IGESData_WriterLib.SetComplete (method)
  SetComplete(): void;

  // IGESData_WriterLib.Select (method)
  Select(obj: IGESData_IGESEntity, CN?: number): { returnValue: boolean; module_: IGESData_ReadWriteModule; CN: number; [Symbol.dispose](): void };

  // IGESData_WriterLib.Start (method)
  Start(): void;

  // IGESData_WriterLib.More (method)
  More(): boolean;

  // IGESData_WriterLib.Next (method)
  Next(): void;

  // IGESData_WriterLib.Module (method)
  Module(): IGESData_ReadWriteModule;

  // IGESData_WriterLib.Protocol (method)
  Protocol(): IGESData_Protocol;

  // IGESData_WriterLib.delete (method)
  delete(): void;

  // IGESData_WriterLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESData_Array1OfIGESEntity: NCollection_Array1_handle_IGESData_IGESEntity

IGESData_HArray1OfIGESEntity: NCollection_HArray1_handle_IGESData_IGESEntity
