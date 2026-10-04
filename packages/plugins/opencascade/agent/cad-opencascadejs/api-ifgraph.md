# libcascade — IFGraph

11 top-level symbols. Signatures are verbatim typescript.

IFGraph_AllConnected: declare class IFGraph_AllConnected extends Interface_GraphContent

  // IFGraph_AllConnected.GetFromEntity (method)
  GetFromEntity(ent: Standard_Transient): void;

  // IFGraph_AllConnected.ResetData (method)
  ResetData(): void;

  // IFGraph_AllConnected.Evaluate (method)
  Evaluate(): void;

  // IFGraph_AllConnected.delete (method)
  delete(): void;

  // IFGraph_AllConnected.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_AllShared: declare class IFGraph_AllShared extends Interface_GraphContent

  // IFGraph_AllShared.GetFromEntity (method)
  GetFromEntity(ent: Standard_Transient): void;

  // IFGraph_AllShared.ResetData (method)
  ResetData(): void;

  // IFGraph_AllShared.Evaluate (method)
  Evaluate(): void;

  // IFGraph_AllShared.delete (method)
  delete(): void;

  // IFGraph_AllShared.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_Articulations: declare class IFGraph_Articulations extends Interface_GraphContent

  // IFGraph_Articulations.GetFromEntity (method)
  GetFromEntity(ent: Standard_Transient): void;

  // IFGraph_Articulations.ResetData (method)
  ResetData(): void;

  // IFGraph_Articulations.Evaluate (method)
  Evaluate(): void;

  // IFGraph_Articulations.delete (method)
  delete(): void;

  // IFGraph_Articulations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_Compare: declare class IFGraph_Compare extends Interface_GraphContent

  // IFGraph_Compare.GetFromEntity (method)
  GetFromEntity(ent: Standard_Transient, first: boolean): void;

  // IFGraph_Compare.Merge (method)
  Merge(): void;

  // IFGraph_Compare.RemoveSecond (method)
  RemoveSecond(): void;

  // IFGraph_Compare.KeepCommon (method)
  KeepCommon(): void;

  // IFGraph_Compare.ResetData (method)
  ResetData(): void;

  // IFGraph_Compare.Evaluate (method)
  Evaluate(): void;

  // IFGraph_Compare.delete (method)
  delete(): void;

  // IFGraph_Compare.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_ConnectedComponants: declare class IFGraph_ConnectedComponants extends IFGraph_SubPartsIterator

  // IFGraph_ConnectedComponants.Evaluate (method)
  Evaluate(): void;

  // IFGraph_ConnectedComponants.delete (method)
  delete(): void;

  // IFGraph_ConnectedComponants.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_Cumulate: declare class IFGraph_Cumulate extends Interface_GraphContent

  // IFGraph_Cumulate.GetFromEntity (method)
  GetFromEntity(ent: Standard_Transient): void;

  // IFGraph_Cumulate.ResetData (method)
  ResetData(): void;

  // IFGraph_Cumulate.Evaluate (method)
  Evaluate(): void;

  // IFGraph_Cumulate.NbTimes (method)
  NbTimes(ent: Standard_Transient): number;

  // IFGraph_Cumulate.HighestNbTimes (method)
  HighestNbTimes(): number;

  // IFGraph_Cumulate.delete (method)
  delete(): void;

  // IFGraph_Cumulate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_Cycles: declare class IFGraph_Cycles extends IFGraph_SubPartsIterator

  // IFGraph_Cycles.constructor (constructor)
  constructor(subparts: IFGraph_StrongComponants);

  // IFGraph_Cycles.Evaluate (method)
  Evaluate(): void;

  // IFGraph_Cycles.delete (method)
  delete(): void;

  // IFGraph_Cycles.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_ExternalSources: declare class IFGraph_ExternalSources extends Interface_GraphContent

  // IFGraph_ExternalSources.GetFromEntity (method)
  GetFromEntity(ent: Standard_Transient): void;

  // IFGraph_ExternalSources.ResetData (method)
  ResetData(): void;

  // IFGraph_ExternalSources.Evaluate (method)
  Evaluate(): void;

  // IFGraph_ExternalSources.IsEmpty (method)
  IsEmpty(): boolean;

  // IFGraph_ExternalSources.delete (method)
  delete(): void;

  // IFGraph_ExternalSources.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_SCRoots: declare class IFGraph_SCRoots extends IFGraph_StrongComponants

  // IFGraph_SCRoots.constructor (constructor)
  constructor(subparts: IFGraph_StrongComponants);

  // IFGraph_SCRoots.Evaluate (method)
  Evaluate(): void;

  // IFGraph_SCRoots.delete (method)
  delete(): void;

  // IFGraph_SCRoots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_StrongComponants: declare class IFGraph_StrongComponants extends IFGraph_SubPartsIterator

  // IFGraph_StrongComponants.Evaluate (method)
  Evaluate(): void;

  // IFGraph_StrongComponants.delete (method)
  delete(): void;

  // IFGraph_StrongComponants.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFGraph_SubPartsIterator: declare class IFGraph_SubPartsIterator

  // IFGraph_SubPartsIterator.Model (method)
  Model(): Interface_InterfaceModel;

  // IFGraph_SubPartsIterator.AddPart (method)
  AddPart(): void;

  // IFGraph_SubPartsIterator.NbParts (method)
  NbParts(): number;

  // IFGraph_SubPartsIterator.PartNum (method)
  PartNum(): number;

  // IFGraph_SubPartsIterator.SetLoad (method)
  SetLoad(): void;

  // IFGraph_SubPartsIterator.SetPartNum (method)
  SetPartNum(num: number): void;

  // IFGraph_SubPartsIterator.GetFromEntity (method)
  GetFromEntity(ent: Standard_Transient, shared: boolean): void;

  // IFGraph_SubPartsIterator.Reset (method)
  Reset(): void;

  // IFGraph_SubPartsIterator.Evaluate (method)
  Evaluate(): void;

  // IFGraph_SubPartsIterator.Loaded (method)
  Loaded(): Interface_GraphContent;

  // IFGraph_SubPartsIterator.IsLoaded (method)
  IsLoaded(ent: Standard_Transient): boolean;

  // IFGraph_SubPartsIterator.IsInPart (method)
  IsInPart(ent: Standard_Transient): boolean;

  // IFGraph_SubPartsIterator.EntityPartNum (method)
  EntityPartNum(ent: Standard_Transient): number;

  // IFGraph_SubPartsIterator.Start (method)
  Start(): void;

  // IFGraph_SubPartsIterator.More (method)
  More(): boolean;

  // IFGraph_SubPartsIterator.Next (method)
  Next(): void;

  // IFGraph_SubPartsIterator.IsSingle (method)
  IsSingle(): boolean;

  // IFGraph_SubPartsIterator.FirstEntity (method)
  FirstEntity(): Standard_Transient;

  // IFGraph_SubPartsIterator.delete (method)
  delete(): void;

  // IFGraph_SubPartsIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
