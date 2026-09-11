# libcascade — IGESData (2)

12 top-level symbols. Signatures are verbatim typescript.

IGESData_ReadWriteModule: declare class IGESData_ReadWriteModule extends Interface_ReaderModule

CaseIGES(typenum: number, formnum: number): number;

WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESData_SingleParentEntity: declare class IGESData_SingleParentEntity extends IGESData_IGESEntity

SingleParent(): IGESData_IGESEntity;

NbChildren(): number;

Child(num: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESData_SpecificLib: declare class IGESData_SpecificLib

constructor

static SetGlobal(amodule: IGESData_SpecificModule, aprotocol: IGESData_Protocol): void;

AddProtocol(aprotocol: Standard_Transient): void;

Clear(): void;

SetComplete(): void;

Select(obj: IGESData*IGESEntity, CN?: number): { returnValue: boolean; module*: IGESData_SpecificModule; CN: number; [Symbol.dispose](): void };

Start(): void;

More(): boolean;

Next(): void;

Module(): IGESData_SpecificModule;

Protocol(): IGESData_Protocol;

delete(): void;

[Symbol.dispose](): void;

IGESData_SpecificModule: declare class IGESData_SpecificModule extends Standard_Transient

OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESData_Status: typeof IGESData_Status[keyof typeof IGESData_Status]

IGESData_ToolLocation: declare class IGESData_ToolLocation extends Standard_Transient

constructor

Load(): void;

SetPrecision(prec: number): void;

SetReference(parent: IGESData_IGESEntity, child: IGESData_IGESEntity): void;

SetParentAssoc(parent: IGESData_IGESEntity, child: IGESData_IGESEntity): void;

ResetDependences(child: IGESData_IGESEntity): void;

SetOwnAsDependent(ent: IGESData_IGESEntity): void;

IsTransf(ent: IGESData_IGESEntity): boolean;

IsAssociativity(ent: IGESData_IGESEntity): boolean;

HasTransf(ent: IGESData_IGESEntity): boolean;

ExplicitLocation(ent: IGESData_IGESEntity): gp_GTrsf;

IsAmbiguous(ent: IGESData_IGESEntity): boolean;

HasParent(ent: IGESData_IGESEntity): boolean;

Parent(ent: IGESData_IGESEntity): IGESData_IGESEntity;

HasParentByAssociativity(ent: IGESData_IGESEntity): boolean;

ParentLocation(ent: IGESData_IGESEntity): gp_GTrsf;

EffectiveLocation(ent: IGESData_IGESEntity): gp_GTrsf;

AnalyseLocation(loc: gp_GTrsf, result: gp_Trsf): boolean;

static ConvertLocation(prec: number, loc: gp_GTrsf, result: gp_Trsf, uni: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESData_TransfEntity: declare class IGESData_TransfEntity extends IGESData_IGESEntity

Value(): gp_GTrsf;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESData_UndefinedEntity: declare class IGESData_UndefinedEntity extends IGESData_IGESEntity

constructor

IsOKDirPart(): boolean;

DirStatus(): number;

SetOKDirPart(): void;

DefLineFont(): IGESData_DefType;

DefLevel(): IGESData_DefList;

DefView(): IGESData_DefList;

DefColor(): IGESData_DefType;

HasSubScriptNumber(): boolean;

WriteOwnParams(IW: IGESData_IGESWriter): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESData_ViewKindEntity: declare class IGESData_ViewKindEntity extends IGESData_IGESEntity

IsSingle(): boolean;

NbViews(): number;

ViewItem(num: number): IGESData_ViewKindEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESData_WriterLib: declare class IGESData_WriterLib

constructor

static SetGlobal(amodule: IGESData_ReadWriteModule, aprotocol: IGESData_Protocol): void;

AddProtocol(aprotocol: Standard_Transient): void;

Clear(): void;

SetComplete(): void;

Select(obj: IGESData*IGESEntity, CN?: number): { returnValue: boolean; module*: IGESData_ReadWriteModule; CN: number; [Symbol.dispose](): void };

Start(): void;

More(): boolean;

Next(): void;

Module(): IGESData_ReadWriteModule;

Protocol(): IGESData_Protocol;

delete(): void;

[Symbol.dispose](): void;

IGESData_Array1OfIGESEntity: NCollection_Array1_handle_IGESData_IGESEntity

IGESData_HArray1OfIGESEntity: NCollection_HArray1_handle_IGESData_IGESEntity
