# libcascade — IFGraph

11 top-level symbols. Signatures are verbatim typescript.

IFGraph_AllConnected: declare class IFGraph_AllConnected extends Interface_GraphContent

GetFromEntity(ent: Standard_Transient): void;

ResetData(): void;

Evaluate(): void;

delete(): void;

[Symbol.dispose](): void;

IFGraph_AllShared: declare class IFGraph_AllShared extends Interface_GraphContent

GetFromEntity(ent: Standard_Transient): void;

ResetData(): void;

Evaluate(): void;

delete(): void;

[Symbol.dispose](): void;

IFGraph_Articulations: declare class IFGraph_Articulations extends Interface_GraphContent

GetFromEntity(ent: Standard_Transient): void;

ResetData(): void;

Evaluate(): void;

delete(): void;

[Symbol.dispose](): void;

IFGraph_Compare: declare class IFGraph_Compare extends Interface_GraphContent

GetFromEntity(ent: Standard_Transient, first: boolean): void;

Merge(): void;

RemoveSecond(): void;

KeepCommon(): void;

ResetData(): void;

Evaluate(): void;

delete(): void;

[Symbol.dispose](): void;

IFGraph_ConnectedComponants: declare class IFGraph_ConnectedComponants extends IFGraph_SubPartsIterator

Evaluate(): void;

delete(): void;

[Symbol.dispose](): void;

IFGraph_Cumulate: declare class IFGraph_Cumulate extends Interface_GraphContent

GetFromEntity(ent: Standard_Transient): void;

ResetData(): void;

Evaluate(): void;

NbTimes(ent: Standard_Transient): number;

HighestNbTimes(): number;

delete(): void;

[Symbol.dispose](): void;

IFGraph_Cycles: declare class IFGraph_Cycles extends IFGraph_SubPartsIterator

constructor

Evaluate(): void;

delete(): void;

[Symbol.dispose](): void;

IFGraph_ExternalSources: declare class IFGraph_ExternalSources extends Interface_GraphContent

GetFromEntity(ent: Standard_Transient): void;

ResetData(): void;

Evaluate(): void;

IsEmpty(): boolean;

delete(): void;

[Symbol.dispose](): void;

IFGraph_SCRoots: declare class IFGraph_SCRoots extends IFGraph_StrongComponants

constructor

Evaluate(): void;

delete(): void;

[Symbol.dispose](): void;

IFGraph_StrongComponants: declare class IFGraph_StrongComponants extends IFGraph_SubPartsIterator

Evaluate(): void;

delete(): void;

[Symbol.dispose](): void;

IFGraph_SubPartsIterator: declare class IFGraph_SubPartsIterator

Model(): Interface_InterfaceModel;

AddPart(): void;

NbParts(): number;

PartNum(): number;

SetLoad(): void;

SetPartNum(num: number): void;

GetFromEntity(ent: Standard_Transient, shared: boolean): void;

Reset(): void;

Evaluate(): void;

Loaded(): Interface_GraphContent;

IsLoaded(ent: Standard_Transient): boolean;

IsInPart(ent: Standard_Transient): boolean;

EntityPartNum(ent: Standard_Transient): number;

Start(): void;

More(): boolean;

Next(): void;

IsSingle(): boolean;

FirstEntity(): Standard_Transient;

delete(): void;

[Symbol.dispose](): void;
