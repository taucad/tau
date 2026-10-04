# libcascade — IFSelect (3)

2 top-level symbols. Signatures are verbatim typescript.

IFSelect_WorkSession: declare class IFSelect_WorkSession extends Standard_Transient

  // IFSelect_WorkSession.constructor (constructor)
  constructor();

  // IFSelect_WorkSession.SetErrorHandle (method)
  SetErrorHandle(toHandle: boolean): void;

  // IFSelect_WorkSession.ErrorHandle (method)
  ErrorHandle(): boolean;

  // IFSelect_WorkSession.ShareOut (method)
  ShareOut(): IFSelect_ShareOut;

  // IFSelect_WorkSession.SetShareOut (method)
  SetShareOut(shareout: IFSelect_ShareOut): void;

  // IFSelect_WorkSession.SetModeStat (method)
  SetModeStat(theMode: boolean): void;

  // IFSelect_WorkSession.GetModeStat (method)
  GetModeStat(): boolean;

  // IFSelect_WorkSession.SetLibrary (method)
  SetLibrary(theLib: IFSelect_WorkLibrary): void;

  // IFSelect_WorkSession.WorkLibrary (method)
  WorkLibrary(): IFSelect_WorkLibrary;

  // IFSelect_WorkSession.SetProtocol (method)
  SetProtocol(protocol: Interface_Protocol): void;

  // IFSelect_WorkSession.Protocol (method)
  Protocol(): Interface_Protocol;

  // IFSelect_WorkSession.SetSignType (method)
  SetSignType(signtype: IFSelect_Signature): void;

  // IFSelect_WorkSession.SignType (method)
  SignType(): IFSelect_Signature;

  // IFSelect_WorkSession.HasModel (method)
  HasModel(): boolean;

  // IFSelect_WorkSession.SetModel (method)
  SetModel(model: Interface_InterfaceModel, clearpointed?: boolean): void;

  // IFSelect_WorkSession.Model (method)
  Model(): Interface_InterfaceModel;

  // IFSelect_WorkSession.SetLoadedFile (method)
  SetLoadedFile(theFileName: string): void;

  // IFSelect_WorkSession.LoadedFile (method)
  LoadedFile(): string;

  // IFSelect_WorkSession.ReadFile (method)
  ReadFile(filename: string): IFSelect_ReturnStatus;

  // IFSelect_WorkSession.NbStartingEntities (method)
  NbStartingEntities(): number;

  // IFSelect_WorkSession.StartingEntity (method)
  StartingEntity(num: number): Standard_Transient;

  // IFSelect_WorkSession.StartingNumber (method)
  StartingNumber(ent: Standard_Transient): number;

  // IFSelect_WorkSession.NumberFromLabel (method)
  NumberFromLabel(val: string, afternum?: number): number;

  // IFSelect_WorkSession.EntityLabel (method)
  EntityLabel(ent: Standard_Transient): TCollection_HAsciiString;

  // IFSelect_WorkSession.EntityName (method)
  EntityName(ent: Standard_Transient): TCollection_HAsciiString;

  // IFSelect_WorkSession.CategoryNumber (method)
  CategoryNumber(ent: Standard_Transient): number;

  // IFSelect_WorkSession.CategoryName (method)
  CategoryName(ent: Standard_Transient): string;

  // IFSelect_WorkSession.ValidityName (method)
  ValidityName(ent: Standard_Transient): string;

  // IFSelect_WorkSession.ClearData (method)
  ClearData(mode: number): void;

  // IFSelect_WorkSession.ComputeGraph (method)
  ComputeGraph(enforce?: boolean): boolean;

  // IFSelect_WorkSession.Shareds (method)
  Shareds(ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_WorkSession.Sharings (method)
  Sharings(ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_WorkSession.IsLoaded (method)
  IsLoaded(): boolean;

  // IFSelect_WorkSession.ComputeCheck (method)
  ComputeCheck(enforce?: boolean): boolean;

  // IFSelect_WorkSession.MaxIdent (method)
  MaxIdent(): number;

  // IFSelect_WorkSession.Item (method)
  Item(id: number): Standard_Transient;

  // IFSelect_WorkSession.ItemIdent (method)
  ItemIdent(item: Standard_Transient): number;

  // IFSelect_WorkSession.NamedItem (method)
  NamedItem(name: string): Standard_Transient;
  NamedItem(name: TCollection_HAsciiString): Standard_Transient;

  // IFSelect_WorkSession.NameIdent (method)
  NameIdent(name: string): number;

  // IFSelect_WorkSession.HasName (method)
  HasName(item: Standard_Transient): boolean;

  // IFSelect_WorkSession.Name (method)
  Name(item: Standard_Transient): TCollection_HAsciiString;

  // IFSelect_WorkSession.AddItem (method)
  AddItem(item: Standard_Transient, active?: boolean): number;

  // IFSelect_WorkSession.AddNamedItem (method)
  AddNamedItem(name: string, item: Standard_Transient, active?: boolean): number;

  // IFSelect_WorkSession.SetActive (method)
  SetActive(item: Standard_Transient, mode: boolean): boolean;

  // IFSelect_WorkSession.RemoveNamedItem (method)
  RemoveNamedItem(name: string): boolean;

  // IFSelect_WorkSession.RemoveName (method)
  RemoveName(name: string): boolean;

  // IFSelect_WorkSession.RemoveItem (method)
  RemoveItem(item: Standard_Transient): boolean;

  // IFSelect_WorkSession.ClearItems (method)
  ClearItems(): void;

  // IFSelect_WorkSession.ItemLabel (method)
  ItemLabel(id: number): TCollection_HAsciiString;

  // IFSelect_WorkSession.ItemIdents (method)
  ItemIdents(type_: Standard_Type): NCollection_HSequence_int;

  // IFSelect_WorkSession.ItemNames (method)
  ItemNames(type_: Standard_Type): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IFSelect_WorkSession.ItemNamesForLabel (method)
  ItemNamesForLabel(label: string): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IFSelect_WorkSession.NextIdentForLabel (method)
  NextIdentForLabel(label: string, id: number, mode?: number): number;

  // IFSelect_WorkSession.NewParamFromStatic (method)
  NewParamFromStatic(statname: string, name?: string): Standard_Transient;

  // IFSelect_WorkSession.TextParam (method)
  TextParam(id: number): TCollection_HAsciiString;

  // IFSelect_WorkSession.TextValue (method)
  TextValue(par: TCollection_HAsciiString): TCollection_AsciiString;

  // IFSelect_WorkSession.NewTextParam (method)
  NewTextParam(name?: string): TCollection_HAsciiString;

  // IFSelect_WorkSession.SetTextValue (method)
  SetTextValue(par: TCollection_HAsciiString, val: string): boolean;

  // IFSelect_WorkSession.Signature (method)
  Signature(id: number): IFSelect_Signature;

  // IFSelect_WorkSession.SignValue (method)
  SignValue(sign: IFSelect_Signature, ent: Standard_Transient): string;

  // IFSelect_WorkSession.Selection (method)
  Selection(id: number): IFSelect_Selection;

  // IFSelect_WorkSession.SelectionResult (method)
  SelectionResult(sel: IFSelect_Selection): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_WorkSession.SelectionResultFromList (method)
  SelectionResultFromList(sel: IFSelect_Selection, list: NCollection_HSequence_handle_Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_WorkSession.SetItemSelection (method)
  SetItemSelection(item: Standard_Transient, sel: IFSelect_Selection): boolean;

  // IFSelect_WorkSession.ResetItemSelection (method)
  ResetItemSelection(item: Standard_Transient): boolean;

  // IFSelect_WorkSession.ItemSelection (method)
  ItemSelection(item: Standard_Transient): IFSelect_Selection;

  // IFSelect_WorkSession.SignCounter (method)
  SignCounter(id: number): IFSelect_SignCounter;

  // IFSelect_WorkSession.ComputeCounter (method)
  ComputeCounter(counter: IFSelect_SignCounter, forced?: boolean): boolean;

  // IFSelect_WorkSession.ComputeCounterFromList (method)
  ComputeCounterFromList(counter: IFSelect_SignCounter, list: NCollection_HSequence_handle_Standard_Transient, clear?: boolean): boolean;

  // IFSelect_WorkSession.AppliedDispatches (method)
  AppliedDispatches(): NCollection_HSequence_int;

  // IFSelect_WorkSession.ClearShareOut (method)
  ClearShareOut(onlydisp: boolean): void;

  // IFSelect_WorkSession.Dispatch (method)
  Dispatch(id: number): IFSelect_Dispatch;

  // IFSelect_WorkSession.DispatchRank (method)
  DispatchRank(disp: IFSelect_Dispatch): number;

  // IFSelect_WorkSession.ModelCopier (method)
  ModelCopier(): IFSelect_ModelCopier;

  // IFSelect_WorkSession.SetModelCopier (method)
  SetModelCopier(copier: IFSelect_ModelCopier): void;

  // IFSelect_WorkSession.NbFinalModifiers (method)
  NbFinalModifiers(formodel: boolean): number;

  // IFSelect_WorkSession.FinalModifierIdents (method)
  FinalModifierIdents(formodel: boolean): NCollection_HSequence_int;

  // IFSelect_WorkSession.GeneralModifier (method)
  GeneralModifier(id: number): IFSelect_GeneralModifier;

  // IFSelect_WorkSession.ModelModifier (method)
  ModelModifier(id: number): IFSelect_Modifier;

  // IFSelect_WorkSession.ModifierRank (method)
  ModifierRank(item: IFSelect_GeneralModifier): number;

  // IFSelect_WorkSession.ChangeModifierRank (method)
  ChangeModifierRank(formodel: boolean, before: number, after: number): boolean;

  // IFSelect_WorkSession.ClearFinalModifiers (method)
  ClearFinalModifiers(): void;

  // IFSelect_WorkSession.SetAppliedModifier (method)
  SetAppliedModifier(modif: IFSelect_GeneralModifier, item: Standard_Transient): boolean;

  // IFSelect_WorkSession.ResetAppliedModifier (method)
  ResetAppliedModifier(modif: IFSelect_GeneralModifier): boolean;

  // IFSelect_WorkSession.UsesAppliedModifier (method)
  UsesAppliedModifier(modif: IFSelect_GeneralModifier): Standard_Transient;

  // IFSelect_WorkSession.Transformer (method)
  Transformer(id: number): IFSelect_Transformer;

  // IFSelect_WorkSession.RunTransformer (method)
  RunTransformer(transf: IFSelect_Transformer): number;

  // IFSelect_WorkSession.RunModifier (method)
  RunModifier(modif: IFSelect_Modifier, copy: boolean): number;

  // IFSelect_WorkSession.RunModifierSelected (method)
  RunModifierSelected(modif: IFSelect_Modifier, sel: IFSelect_Selection, copy: boolean): number;

  // IFSelect_WorkSession.NewTransformStandard (method)
  NewTransformStandard(copy: boolean, name?: string): IFSelect_Transformer;

  // IFSelect_WorkSession.SetModelContent (method)
  SetModelContent(sel: IFSelect_Selection, keep: boolean): boolean;

  // IFSelect_WorkSession.FilePrefix (method)
  FilePrefix(): TCollection_HAsciiString;

  // IFSelect_WorkSession.DefaultFileRoot (method)
  DefaultFileRoot(): TCollection_HAsciiString;

  // IFSelect_WorkSession.FileExtension (method)
  FileExtension(): TCollection_HAsciiString;

  // IFSelect_WorkSession.FileRoot (method)
  FileRoot(disp: IFSelect_Dispatch): TCollection_HAsciiString;

  // IFSelect_WorkSession.SetFilePrefix (method)
  SetFilePrefix(name: string): void;

  // IFSelect_WorkSession.SetDefaultFileRoot (method)
  SetDefaultFileRoot(name: string): boolean;

  // IFSelect_WorkSession.SetFileExtension (method)
  SetFileExtension(name: string): void;

  // IFSelect_WorkSession.SetFileRoot (method)
  SetFileRoot(disp: IFSelect_Dispatch, name: string): boolean;

  // IFSelect_WorkSession.GiveFileRoot (method)
  GiveFileRoot(file: string): string;

  // IFSelect_WorkSession.GiveFileComplete (method)
  GiveFileComplete(file: string): string;

  // IFSelect_WorkSession.ClearFile (method)
  ClearFile(): void;

  // IFSelect_WorkSession.EvaluateFile (method)
  EvaluateFile(): void;

  // IFSelect_WorkSession.NbFiles (method)
  NbFiles(): number;

  // IFSelect_WorkSession.FileModel (method)
  FileModel(num: number): Interface_InterfaceModel;

  // IFSelect_WorkSession.FileName (method)
  FileName(num: number): TCollection_AsciiString;

  // IFSelect_WorkSession.BeginSentFiles (method)
  BeginSentFiles(record: boolean): void;

  // IFSelect_WorkSession.SentFiles (method)
  SentFiles(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IFSelect_WorkSession.SendSplit (method)
  SendSplit(): boolean;

  // IFSelect_WorkSession.EvalSplit (method)
  EvalSplit(): IFSelect_PacketList;

  // IFSelect_WorkSession.MaxSendingCount (method)
  MaxSendingCount(): number;

  // IFSelect_WorkSession.SetRemaining (method)
  SetRemaining(mode: IFSelect_RemainMode): boolean;

  // IFSelect_WorkSession.SendAll (method)
  SendAll(filename: string, computegraph?: boolean): IFSelect_ReturnStatus;

  // IFSelect_WorkSession.SendSelected (method)
  SendSelected(filename: string, sel: IFSelect_Selection, computegraph?: boolean): IFSelect_ReturnStatus;

  // IFSelect_WorkSession.WriteFile (method)
  WriteFile(filename: string): IFSelect_ReturnStatus;
  WriteFile(filename: string, sel: IFSelect_Selection): IFSelect_ReturnStatus;

  // IFSelect_WorkSession.NbSources (method)
  NbSources(sel: IFSelect_Selection): number;

  // IFSelect_WorkSession.Source (method)
  Source(sel: IFSelect_Selection, num?: number): IFSelect_Selection;

  // IFSelect_WorkSession.IsReversedSelectExtract (method)
  IsReversedSelectExtract(sel: IFSelect_Selection): boolean;

  // IFSelect_WorkSession.ToggleSelectExtract (method)
  ToggleSelectExtract(sel: IFSelect_Selection): boolean;

  // IFSelect_WorkSession.SetInputSelection (method)
  SetInputSelection(sel: IFSelect_Selection, input: IFSelect_Selection): boolean;

  // IFSelect_WorkSession.SetControl (method)
  SetControl(sel: IFSelect_Selection, sc: IFSelect_Selection, formain?: boolean): boolean;

  // IFSelect_WorkSession.CombineAdd (method)
  CombineAdd(selcomb: IFSelect_Selection, seladd: IFSelect_Selection, atnum?: number): number;

  // IFSelect_WorkSession.CombineRemove (method)
  CombineRemove(selcomb: IFSelect_Selection, selrem: IFSelect_Selection): boolean;

  // IFSelect_WorkSession.NewSelectPointed (method)
  NewSelectPointed(list: NCollection_HSequence_handle_Standard_Transient, name: string): IFSelect_Selection;

  // IFSelect_WorkSession.SetSelectPointed (method)
  SetSelectPointed(sel: IFSelect_Selection, list: NCollection_HSequence_handle_Standard_Transient, mode: number): boolean;

  // IFSelect_WorkSession.GiveSelection (method)
  GiveSelection(selname: string): IFSelect_Selection;

  // IFSelect_WorkSession.GiveList (method)
  GiveList(obj: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;
  GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_WorkSession.GiveListFromList (method)
  GiveListFromList(selname: string, ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_WorkSession.GiveListCombined (method)
  GiveListCombined(l1: NCollection_HSequence_handle_Standard_Transient, l2: NCollection_HSequence_handle_Standard_Transient, mode: number): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_WorkSession.QueryCheckStatus (method)
  QueryCheckStatus(ent: Standard_Transient): number;

  // IFSelect_WorkSession.QueryParent (method)
  QueryParent(entdad: Standard_Transient, entson: Standard_Transient): number;

  // IFSelect_WorkSession.SetParams (method)
  SetParams(params: NCollection_DynamicArray_handle_Standard_Transient, uselist: NCollection_DynamicArray_int): void;

  // IFSelect_WorkSession.TraceStatics (method)
  TraceStatics(use: number, mode?: number): void;

  // IFSelect_WorkSession.DumpShare (method)
  DumpShare(): void;

  // IFSelect_WorkSession.ListItems (method)
  ListItems(label?: string): void;

  // IFSelect_WorkSession.ListFinalModifiers (method)
  ListFinalModifiers(formodel: boolean): void;

  // IFSelect_WorkSession.DumpSelection (method)
  DumpSelection(sel: IFSelect_Selection): void;

  // IFSelect_WorkSession.TraceDumpModel (method)
  TraceDumpModel(mode: number): void;

  // IFSelect_WorkSession.TraceDumpEntity (method)
  TraceDumpEntity(ent: Standard_Transient, level: number): void;

  // IFSelect_WorkSession.EvaluateSelection (method)
  EvaluateSelection(sel: IFSelect_Selection): void;

  // IFSelect_WorkSession.EvaluateDispatch (method)
  EvaluateDispatch(disp: IFSelect_Dispatch, mode?: number): void;

  // IFSelect_WorkSession.EvaluateComplete (method)
  EvaluateComplete(mode?: number): void;

  // IFSelect_WorkSession.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_WorkSession.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_WorkSession.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_WorkSession.delete (method)
  delete(): void;

  // IFSelect_WorkSession.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_TSeqOfSelection: NCollection_Sequence_handle_IFSelect_Selection
