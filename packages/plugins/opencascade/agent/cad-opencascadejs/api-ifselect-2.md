# libcascade — IFSelect (2)

32 top-level symbols. Signatures are verbatim typescript.

IFSelect_SelectPointed: declare class IFSelect_SelectPointed extends IFSelect_SelectBase

  // IFSelect_SelectPointed.constructor (constructor)
  constructor();

  // IFSelect_SelectPointed.Clear (method)
  Clear(): void;

  // IFSelect_SelectPointed.IsSet (method)
  IsSet(): boolean;

  // IFSelect_SelectPointed.SetEntity (method)
  SetEntity(item: Standard_Transient): void;

  // IFSelect_SelectPointed.SetList (method)
  SetList(list: NCollection_HSequence_handle_Standard_Transient): void;

  // IFSelect_SelectPointed.Add (method)
  Add(item: Standard_Transient): boolean;

  // IFSelect_SelectPointed.Remove (method)
  Remove(item: Standard_Transient): boolean;

  // IFSelect_SelectPointed.Toggle (method)
  Toggle(item: Standard_Transient): boolean;

  // IFSelect_SelectPointed.AddList (method)
  AddList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

  // IFSelect_SelectPointed.RemoveList (method)
  RemoveList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

  // IFSelect_SelectPointed.ToggleList (method)
  ToggleList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

  // IFSelect_SelectPointed.Rank (method)
  Rank(item: Standard_Transient): number;

  // IFSelect_SelectPointed.NbItems (method)
  NbItems(): number;

  // IFSelect_SelectPointed.Item (method)
  Item(num: number): Standard_Transient;

  // IFSelect_SelectPointed.Update (method)
  Update(control: Interface_CopyControl): void;
  Update(trf: IFSelect_Transformer): void;

  // IFSelect_SelectPointed.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectPointed.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectPointed.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectPointed.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectPointed.delete (method)
  delete(): void;

  // IFSelect_SelectPointed.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectRange: declare class IFSelect_SelectRange extends IFSelect_SelectExtract

  // IFSelect_SelectRange.constructor (constructor)
  constructor();

  // IFSelect_SelectRange.HasLower (method)
  HasLower(): boolean;

  // IFSelect_SelectRange.LowerValue (method)
  LowerValue(): number;

  // IFSelect_SelectRange.HasUpper (method)
  HasUpper(): boolean;

  // IFSelect_SelectRange.UpperValue (method)
  UpperValue(): number;

  // IFSelect_SelectRange.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectRange.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectRange.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectRange.delete (method)
  delete(): void;

  // IFSelect_SelectRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectRootComps: declare class IFSelect_SelectRootComps extends IFSelect_SelectExtract

  // IFSelect_SelectRootComps.constructor (constructor)
  constructor();

  // IFSelect_SelectRootComps.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectRootComps.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectRootComps.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectRootComps.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectRootComps.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectRootComps.delete (method)
  delete(): void;

  // IFSelect_SelectRootComps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectRoots: declare class IFSelect_SelectRoots extends IFSelect_SelectExtract

  // IFSelect_SelectRoots.constructor (constructor)
  constructor();

  // IFSelect_SelectRoots.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectRoots.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectRoots.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectRoots.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectRoots.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectRoots.delete (method)
  delete(): void;

  // IFSelect_SelectRoots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectSent: declare class IFSelect_SelectSent extends IFSelect_SelectExtract

  // IFSelect_SelectSent.constructor (constructor)
  constructor(sentcount?: number, atleast?: boolean);

  // IFSelect_SelectSent.SentCount (method)
  SentCount(): number;

  // IFSelect_SelectSent.AtLeast (method)
  AtLeast(): boolean;

  // IFSelect_SelectSent.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectSent.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectSent.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectSent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectSent.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectSent.delete (method)
  delete(): void;

  // IFSelect_SelectSent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectShared: declare class IFSelect_SelectShared extends IFSelect_SelectDeduct

  // IFSelect_SelectShared.constructor (constructor)
  constructor();

  // IFSelect_SelectShared.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectShared.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectShared.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectShared.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectShared.delete (method)
  delete(): void;

  // IFSelect_SelectShared.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectSharing: declare class IFSelect_SelectSharing extends IFSelect_SelectDeduct

  // IFSelect_SelectSharing.constructor (constructor)
  constructor();

  // IFSelect_SelectSharing.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectSharing.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectSharing.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectSharing.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectSharing.delete (method)
  delete(): void;

  // IFSelect_SelectSharing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectSignature: declare class IFSelect_SelectSignature extends IFSelect_SelectExtract

  // IFSelect_SelectSignature.constructor (constructor)
  constructor(matcher: IFSelect_Signature, signtext: string, exact?: boolean);
  constructor(matcher: IFSelect_Signature, signtext: TCollection_AsciiString, exact?: boolean);
  constructor(matcher: IFSelect_SignCounter, signtext: string, exact?: boolean);

  // IFSelect_SelectSignature.Signature (method)
  Signature(): IFSelect_Signature;

  // IFSelect_SelectSignature.Counter (method)
  Counter(): IFSelect_SignCounter;

  // IFSelect_SelectSignature.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectSignature.SignatureText (method)
  SignatureText(): TCollection_AsciiString;

  // IFSelect_SelectSignature.IsExact (method)
  IsExact(): boolean;

  // IFSelect_SelectSignature.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectSignature.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectSignature.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectSignature.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectSignature.delete (method)
  delete(): void;

  // IFSelect_SelectSignature.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectSignedShared: declare class IFSelect_SelectSignedShared extends IFSelect_SelectExplore

  // IFSelect_SelectSignedShared.constructor (constructor)
  constructor(matcher: IFSelect_Signature, signtext: string, exact?: boolean, level?: number);

  // IFSelect_SelectSignedShared.Signature (method)
  Signature(): IFSelect_Signature;

  // IFSelect_SelectSignedShared.SignatureText (method)
  SignatureText(): TCollection_AsciiString;

  // IFSelect_SelectSignedShared.IsExact (method)
  IsExact(): boolean;

  // IFSelect_SelectSignedShared.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // IFSelect_SelectSignedShared.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectSignedShared.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectSignedShared.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectSignedShared.delete (method)
  delete(): void;

  // IFSelect_SelectSignedShared.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectSignedSharing: declare class IFSelect_SelectSignedSharing extends IFSelect_SelectExplore

  // IFSelect_SelectSignedSharing.constructor (constructor)
  constructor(matcher: IFSelect_Signature, signtext: string, exact?: boolean, level?: number);

  // IFSelect_SelectSignedSharing.Signature (method)
  Signature(): IFSelect_Signature;

  // IFSelect_SelectSignedSharing.SignatureText (method)
  SignatureText(): TCollection_AsciiString;

  // IFSelect_SelectSignedSharing.IsExact (method)
  IsExact(): boolean;

  // IFSelect_SelectSignedSharing.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // IFSelect_SelectSignedSharing.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectSignedSharing.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectSignedSharing.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectSignedSharing.delete (method)
  delete(): void;

  // IFSelect_SelectSignedSharing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectSuite: declare class IFSelect_SelectSuite extends IFSelect_SelectDeduct

  // IFSelect_SelectSuite.constructor (constructor)
  constructor();

  // IFSelect_SelectSuite.AddInput (method)
  AddInput(item: IFSelect_Selection): boolean;

  // IFSelect_SelectSuite.AddPrevious (method)
  AddPrevious(item: IFSelect_SelectDeduct): void;

  // IFSelect_SelectSuite.AddNext (method)
  AddNext(item: IFSelect_SelectDeduct): void;

  // IFSelect_SelectSuite.NbItems (method)
  NbItems(): number;

  // IFSelect_SelectSuite.Item (method)
  Item(num: number): IFSelect_SelectDeduct;

  // IFSelect_SelectSuite.SetLabel (method)
  SetLabel(lab: string): void;

  // IFSelect_SelectSuite.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectSuite.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectSuite.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectSuite.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectSuite.delete (method)
  delete(): void;

  // IFSelect_SelectSuite.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectType: declare class IFSelect_SelectType extends IFSelect_SelectAnyType

  // IFSelect_SelectType.constructor (constructor)
  constructor();
  constructor(atype: Standard_Type);

  // IFSelect_SelectType.SetType (method)
  SetType(atype: Standard_Type): void;

  // IFSelect_SelectType.TypeForMatch (method)
  TypeForMatch(): Standard_Type;

  // IFSelect_SelectType.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectType.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectType.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectType.delete (method)
  delete(): void;

  // IFSelect_SelectType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectUnion: declare class IFSelect_SelectUnion extends IFSelect_SelectCombine

  // IFSelect_SelectUnion.constructor (constructor)
  constructor();

  // IFSelect_SelectUnion.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_SelectUnion.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectUnion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectUnion.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectUnion.delete (method)
  delete(): void;

  // IFSelect_SelectUnion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectUnknownEntities: declare class IFSelect_SelectUnknownEntities extends IFSelect_SelectExtract

  // IFSelect_SelectUnknownEntities.constructor (constructor)
  constructor();

  // IFSelect_SelectUnknownEntities.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SelectUnknownEntities.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IFSelect_SelectUnknownEntities.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SelectUnknownEntities.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SelectUnknownEntities.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SelectUnknownEntities.delete (method)
  delete(): void;

  // IFSelect_SelectUnknownEntities.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_Selection: declare class IFSelect_Selection extends Standard_Transient

  // IFSelect_Selection.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_Selection.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_Selection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_Selection.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_Selection.delete (method)
  delete(): void;

  // IFSelect_Selection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SelectionIterator: declare class IFSelect_SelectionIterator

  // IFSelect_SelectionIterator.constructor (constructor)
  constructor();
  constructor(sel: IFSelect_Selection);

  // IFSelect_SelectionIterator.AddItem (method)
  AddItem(sel: IFSelect_Selection): void;

  // IFSelect_SelectionIterator.AddList (method)
  AddList(list: NCollection_Sequence_handle_IFSelect_Selection): void;

  // IFSelect_SelectionIterator.More (method)
  More(): boolean;

  // IFSelect_SelectionIterator.Next (method)
  Next(): void;

  // IFSelect_SelectionIterator.Value (method)
  Value(): IFSelect_Selection;

  // IFSelect_SelectionIterator.delete (method)
  delete(): void;

  // IFSelect_SelectionIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SessionDumper: declare class IFSelect_SessionDumper extends Standard_Transient

  // IFSelect_SessionDumper.First (method)
  static First(): IFSelect_SessionDumper;

  // IFSelect_SessionDumper.Next (method)
  Next(): IFSelect_SessionDumper;

  // IFSelect_SessionDumper.WriteOwn (method)
  WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

  // IFSelect_SessionDumper.ReadOwn (method)
  ReadOwn(file: IFSelect_SessionFile, type_: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

  // IFSelect_SessionDumper.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SessionDumper.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SessionDumper.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SessionDumper.delete (method)
  delete(): void;

  // IFSelect_SessionDumper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SessionFile: declare class IFSelect_SessionFile

  // IFSelect_SessionFile.constructor (constructor)
  constructor(WS: IFSelect_WorkSession);
  constructor(WS: IFSelect_WorkSession, filename: string);

  // IFSelect_SessionFile.ClearLines (method)
  ClearLines(): void;

  // IFSelect_SessionFile.NbLines (method)
  NbLines(): number;

  // IFSelect_SessionFile.Line (method)
  Line(num: number): TCollection_AsciiString;

  // IFSelect_SessionFile.AddLine (method)
  AddLine(line: string): void;

  // IFSelect_SessionFile.RemoveLastLine (method)
  RemoveLastLine(): void;

  // IFSelect_SessionFile.WriteFile (method)
  WriteFile(name: string): boolean;

  // IFSelect_SessionFile.ReadFile (method)
  ReadFile(name: string): boolean;

  // IFSelect_SessionFile.RecognizeFile (method)
  RecognizeFile(headerline: string): boolean;

  // IFSelect_SessionFile.Write (method)
  Write(filename: string): number;

  // IFSelect_SessionFile.Read (method)
  Read(filename: string): number;

  // IFSelect_SessionFile.WriteSession (method)
  WriteSession(): number;

  // IFSelect_SessionFile.WriteEnd (method)
  WriteEnd(): number;

  // IFSelect_SessionFile.WriteLine (method)
  WriteLine(line: string, follow?: string): void;

  // IFSelect_SessionFile.WriteOwn (method)
  WriteOwn(item: Standard_Transient): boolean;

  // IFSelect_SessionFile.ReadSession (method)
  ReadSession(): number;

  // IFSelect_SessionFile.ReadEnd (method)
  ReadEnd(): number;

  // IFSelect_SessionFile.ReadLine (method)
  ReadLine(): boolean;

  // IFSelect_SessionFile.SplitLine (method)
  SplitLine(line: string): void;

  // IFSelect_SessionFile.ReadOwn (method)
  ReadOwn(): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

  // IFSelect_SessionFile.AddItem (method)
  AddItem(item: Standard_Transient, active?: boolean): void;

  // IFSelect_SessionFile.IsDone (method)
  IsDone(): boolean;

  // IFSelect_SessionFile.WorkSession (method)
  WorkSession(): IFSelect_WorkSession;

  // IFSelect_SessionFile.NewItem (method)
  NewItem(ident: number, par: Standard_Transient): void;

  // IFSelect_SessionFile.SetOwn (method)
  SetOwn(mode: boolean): void;

  // IFSelect_SessionFile.SendVoid (method)
  SendVoid(): void;

  // IFSelect_SessionFile.SendItem (method)
  SendItem(par: Standard_Transient): void;

  // IFSelect_SessionFile.SendText (method)
  SendText(text: string): void;

  // IFSelect_SessionFile.SetLastGeneral (method)
  SetLastGeneral(lastgen: number): void;

  // IFSelect_SessionFile.NbParams (method)
  NbParams(): number;

  // IFSelect_SessionFile.IsVoid (method)
  IsVoid(num: number): boolean;

  // IFSelect_SessionFile.IsText (method)
  IsText(num: number): boolean;

  // IFSelect_SessionFile.ParamValue (method)
  ParamValue(num: number): TCollection_AsciiString;

  // IFSelect_SessionFile.TextValue (method)
  TextValue(num: number): TCollection_AsciiString;

  // IFSelect_SessionFile.ItemValue (method)
  ItemValue(num: number): Standard_Transient;

  // IFSelect_SessionFile.Destroy (method)
  Destroy(): void;

  // IFSelect_SessionFile.delete (method)
  delete(): void;

  // IFSelect_SessionFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SessionPilot: declare class IFSelect_SessionPilot extends IFSelect_Activator

  // IFSelect_SessionPilot.constructor (constructor)
  constructor(prompt?: string);

  // IFSelect_SessionPilot.Session (method)
  Session(): IFSelect_WorkSession;

  // IFSelect_SessionPilot.Library (method)
  Library(): IFSelect_WorkLibrary;

  // IFSelect_SessionPilot.RecordMode (method)
  RecordMode(): boolean;

  // IFSelect_SessionPilot.SetSession (method)
  SetSession(WS: IFSelect_WorkSession): void;

  // IFSelect_SessionPilot.SetLibrary (method)
  SetLibrary(WL: IFSelect_WorkLibrary): void;

  // IFSelect_SessionPilot.SetRecordMode (method)
  SetRecordMode(mode: boolean): void;

  // IFSelect_SessionPilot.SetCommandLine (method)
  SetCommandLine(command: TCollection_AsciiString): void;

  // IFSelect_SessionPilot.CommandLine (method)
  CommandLine(): TCollection_AsciiString;

  // IFSelect_SessionPilot.CommandPart (method)
  CommandPart(numarg: number): string;

  // IFSelect_SessionPilot.NbWords (method)
  NbWords(): number;

  // IFSelect_SessionPilot.Word (method)
  Word(num: number): TCollection_AsciiString;

  // IFSelect_SessionPilot.Arg (method)
  Arg(num: number): string;

  // IFSelect_SessionPilot.RemoveWord (method)
  RemoveWord(num: number): boolean;

  // IFSelect_SessionPilot.NbCommands (method)
  NbCommands(): number;

  // IFSelect_SessionPilot.Command (method)
  Command(num: number): TCollection_AsciiString;

  // IFSelect_SessionPilot.RecordItem (method)
  RecordItem(item: Standard_Transient): IFSelect_ReturnStatus;

  // IFSelect_SessionPilot.RecordedItem (method)
  RecordedItem(): Standard_Transient;

  // IFSelect_SessionPilot.Clear (method)
  Clear(): void;

  // IFSelect_SessionPilot.ReadScript (method)
  ReadScript(file?: string): IFSelect_ReturnStatus;

  // IFSelect_SessionPilot.Perform (method)
  Perform(): IFSelect_ReturnStatus;

  // IFSelect_SessionPilot.ExecuteAlias (method)
  ExecuteAlias(aliasname: TCollection_AsciiString): IFSelect_ReturnStatus;

  // IFSelect_SessionPilot.Execute (method)
  Execute(command: TCollection_AsciiString): IFSelect_ReturnStatus;

  // IFSelect_SessionPilot.ExecuteCounter (method)
  ExecuteCounter(counter: IFSelect_SignCounter, numword: number, mode?: IFSelect_PrintCount): IFSelect_ReturnStatus;

  // IFSelect_SessionPilot.Number (method)
  Number(val: string): number;

  // IFSelect_SessionPilot.Do (method)
  Do(number_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

  // IFSelect_SessionPilot.Help (method)
  Help(number_: number): string;

  // IFSelect_SessionPilot.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SessionPilot.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SessionPilot.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SessionPilot.delete (method)
  delete(): void;

  // IFSelect_SessionPilot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_ShareOut: declare class IFSelect_ShareOut extends Standard_Transient

  // IFSelect_ShareOut.constructor (constructor)
  constructor();

  // IFSelect_ShareOut.Clear (method)
  Clear(onlydisp: boolean): void;

  // IFSelect_ShareOut.ClearResult (method)
  ClearResult(alsoname: boolean): void;

  // IFSelect_ShareOut.RemoveItem (method)
  RemoveItem(item: Standard_Transient): boolean;

  // IFSelect_ShareOut.LastRun (method)
  LastRun(): number;

  // IFSelect_ShareOut.SetLastRun (method)
  SetLastRun(last: number): void;

  // IFSelect_ShareOut.NbDispatches (method)
  NbDispatches(): number;

  // IFSelect_ShareOut.DispatchRank (method)
  DispatchRank(disp: IFSelect_Dispatch): number;

  // IFSelect_ShareOut.Dispatch (method)
  Dispatch(num: number): IFSelect_Dispatch;

  // IFSelect_ShareOut.AddDispatch (method)
  AddDispatch(disp: IFSelect_Dispatch): void;

  // IFSelect_ShareOut.RemoveDispatch (method)
  RemoveDispatch(rank: number): boolean;

  // IFSelect_ShareOut.AddModifier (method)
  AddModifier(modifier: IFSelect_GeneralModifier, atnum: number): void;
  AddModifier(modifier: IFSelect_GeneralModifier, dispnum: number, atnum: number): void;

  // IFSelect_ShareOut.AddModif (method)
  AddModif(modifier: IFSelect_GeneralModifier, formodel: boolean, atnum?: number): void;

  // IFSelect_ShareOut.NbModifiers (method)
  NbModifiers(formodel: boolean): number;

  // IFSelect_ShareOut.GeneralModifier (method)
  GeneralModifier(formodel: boolean, num: number): IFSelect_GeneralModifier;

  // IFSelect_ShareOut.ModelModifier (method)
  ModelModifier(num: number): IFSelect_Modifier;

  // IFSelect_ShareOut.ModifierRank (method)
  ModifierRank(modifier: IFSelect_GeneralModifier): number;

  // IFSelect_ShareOut.RemoveModifier (method)
  RemoveModifier(formodel: boolean, num: number): boolean;

  // IFSelect_ShareOut.ChangeModifierRank (method)
  ChangeModifierRank(formodel: boolean, befor: number, after: number): boolean;

  // IFSelect_ShareOut.SetRootName (method)
  SetRootName(num: number, name: TCollection_HAsciiString): boolean;

  // IFSelect_ShareOut.HasRootName (method)
  HasRootName(num: number): boolean;

  // IFSelect_ShareOut.RootName (method)
  RootName(num: number): TCollection_HAsciiString;

  // IFSelect_ShareOut.RootNumber (method)
  RootNumber(name: TCollection_HAsciiString): number;

  // IFSelect_ShareOut.SetPrefix (method)
  SetPrefix(pref: TCollection_HAsciiString): void;

  // IFSelect_ShareOut.SetDefaultRootName (method)
  SetDefaultRootName(defrt: TCollection_HAsciiString): boolean;

  // IFSelect_ShareOut.SetExtension (method)
  SetExtension(ext: TCollection_HAsciiString): void;

  // IFSelect_ShareOut.Prefix (method)
  Prefix(): TCollection_HAsciiString;

  // IFSelect_ShareOut.DefaultRootName (method)
  DefaultRootName(): TCollection_HAsciiString;

  // IFSelect_ShareOut.Extension (method)
  Extension(): TCollection_HAsciiString;

  // IFSelect_ShareOut.FileName (method)
  FileName(dnum: number, pnum: number, nbpack?: number): TCollection_AsciiString;

  // IFSelect_ShareOut.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_ShareOut.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_ShareOut.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_ShareOut.delete (method)
  delete(): void;

  // IFSelect_ShareOut.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_ShareOutResult: declare class IFSelect_ShareOutResult

  // IFSelect_ShareOutResult.constructor (constructor)
  constructor(sho: IFSelect_ShareOut, mod: Interface_InterfaceModel);
  constructor(disp: IFSelect_Dispatch, mod: Interface_InterfaceModel);

  // IFSelect_ShareOutResult.ShareOut (method)
  ShareOut(): IFSelect_ShareOut;

  // IFSelect_ShareOutResult.Reset (method)
  Reset(): void;

  // IFSelect_ShareOutResult.Evaluate (method)
  Evaluate(): void;

  // IFSelect_ShareOutResult.Packets (method)
  Packets(complete?: boolean): IFSelect_PacketList;

  // IFSelect_ShareOutResult.NbPackets (method)
  NbPackets(): number;

  // IFSelect_ShareOutResult.Prepare (method)
  Prepare(): void;

  // IFSelect_ShareOutResult.More (method)
  More(): boolean;

  // IFSelect_ShareOutResult.Next (method)
  Next(): void;

  // IFSelect_ShareOutResult.NextDispatch (method)
  NextDispatch(): void;

  // IFSelect_ShareOutResult.Dispatch (method)
  Dispatch(): IFSelect_Dispatch;

  // IFSelect_ShareOutResult.DispatchRank (method)
  DispatchRank(): number;

  // IFSelect_ShareOutResult.PacketsInDispatch (method)
  PacketsInDispatch(numpack?: number, nbpacks?: number): { numpack: number; nbpacks: number };

  // IFSelect_ShareOutResult.FileName (method)
  FileName(): TCollection_AsciiString;

  // IFSelect_ShareOutResult.delete (method)
  delete(): void;

  // IFSelect_ShareOutResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SignAncestor: declare class IFSelect_SignAncestor extends IFSelect_SignType

  // IFSelect_SignAncestor.constructor (constructor)
  constructor(nopk?: boolean);

  // IFSelect_SignAncestor.Matches (method)
  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  // IFSelect_SignAncestor.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SignAncestor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SignAncestor.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SignAncestor.delete (method)
  delete(): void;

  // IFSelect_SignAncestor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SignCategory: declare class IFSelect_SignCategory extends IFSelect_Signature

  // IFSelect_SignCategory.constructor (constructor)
  constructor();

  // IFSelect_SignCategory.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IFSelect_SignCategory.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SignCategory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SignCategory.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SignCategory.delete (method)
  delete(): void;

  // IFSelect_SignCategory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SignCounter: declare class IFSelect_SignCounter extends IFSelect_SignatureList

  // IFSelect_SignCounter.constructor (constructor)
  constructor(withmap?: boolean, withlist?: boolean);
  constructor(matcher: IFSelect_Signature, withmap?: boolean, withlist?: boolean);

  // IFSelect_SignCounter.Signature (method)
  Signature(): IFSelect_Signature;

  // IFSelect_SignCounter.SetMap (method)
  SetMap(withmap: boolean): void;

  // IFSelect_SignCounter.AddEntity (method)
  AddEntity(ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IFSelect_SignCounter.AddSign (method)
  AddSign(ent: Standard_Transient, model: Interface_InterfaceModel): void;

  // IFSelect_SignCounter.AddList (method)
  AddList(list: NCollection_HSequence_handle_Standard_Transient, model: Interface_InterfaceModel): void;

  // IFSelect_SignCounter.AddModel (method)
  AddModel(model: Interface_InterfaceModel): void;

  // IFSelect_SignCounter.SetSelection (method)
  SetSelection(sel: IFSelect_Selection): void;

  // IFSelect_SignCounter.Selection (method)
  Selection(): IFSelect_Selection;

  // IFSelect_SignCounter.SetSelMode (method)
  SetSelMode(selmode: number): void;

  // IFSelect_SignCounter.SelMode (method)
  SelMode(): number;

  // IFSelect_SignCounter.Sign (method)
  Sign(ent: Standard_Transient, model: Interface_InterfaceModel): TCollection_HAsciiString;

  // IFSelect_SignCounter.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SignCounter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SignCounter.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SignCounter.delete (method)
  delete(): void;

  // IFSelect_SignCounter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SignMultiple: declare class IFSelect_SignMultiple extends IFSelect_Signature

  // IFSelect_SignMultiple.constructor (constructor)
  constructor(name: string);

  // IFSelect_SignMultiple.Add (method)
  Add(subsign: IFSelect_Signature, width?: number, maxi?: boolean): void;

  // IFSelect_SignMultiple.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IFSelect_SignMultiple.Matches (method)
  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  // IFSelect_SignMultiple.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SignMultiple.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SignMultiple.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SignMultiple.delete (method)
  delete(): void;

  // IFSelect_SignMultiple.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SignType: declare class IFSelect_SignType extends IFSelect_Signature

  // IFSelect_SignType.constructor (constructor)
  constructor(nopk?: boolean);

  // IFSelect_SignType.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IFSelect_SignType.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SignType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SignType.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SignType.delete (method)
  delete(): void;

  // IFSelect_SignType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SignValidity: declare class IFSelect_SignValidity extends IFSelect_Signature

  // IFSelect_SignValidity.constructor (constructor)
  constructor();

  // IFSelect_SignValidity.CVal (method)
  static CVal(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IFSelect_SignValidity.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IFSelect_SignValidity.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SignValidity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SignValidity.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SignValidity.delete (method)
  delete(): void;

  // IFSelect_SignValidity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_Signature: declare class IFSelect_Signature extends Interface_SignType

  // IFSelect_Signature.SetIntCase (method)
  SetIntCase(hasmin: boolean, valmin: number, hasmax: boolean, valmax: number): void;

  // IFSelect_Signature.IsIntCase (method)
  IsIntCase(hasmin?: boolean, valmin?: number, hasmax?: boolean, valmax?: number): { returnValue: boolean; hasmin: boolean; valmin: number; hasmax: boolean; valmax: number };

  // IFSelect_Signature.AddCase (method)
  AddCase(acase: string): void;

  // IFSelect_Signature.CaseList (method)
  CaseList(): NCollection_HSequence_TCollection_AsciiString;

  // IFSelect_Signature.Name (method)
  Name(): string;

  // IFSelect_Signature.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_Signature.Matches (method)
  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  // IFSelect_Signature.MatchValue (method)
  static MatchValue(val: string, text: TCollection_AsciiString, exact: boolean): boolean;

  // IFSelect_Signature.IntValue (method)
  static IntValue(val: number): string;

  // IFSelect_Signature.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_Signature.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_Signature.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_Signature.delete (method)
  delete(): void;

  // IFSelect_Signature.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_SignatureList: declare class IFSelect_SignatureList extends Standard_Transient

  // IFSelect_SignatureList.constructor (constructor)
  constructor(withlist?: boolean);

  // IFSelect_SignatureList.SetList (method)
  SetList(withlist: boolean): void;

  // IFSelect_SignatureList.ModeSignOnly (method)
  ModeSignOnly(): boolean;

  // IFSelect_SignatureList.Clear (method)
  Clear(): void;

  // IFSelect_SignatureList.Add (method)
  Add(ent: Standard_Transient, sign: string): void;

  // IFSelect_SignatureList.LastValue (method)
  LastValue(): string;

  // IFSelect_SignatureList.Init (method)
  Init(name: string, count: NCollection_IndexedDataMap_TCollection_AsciiString_int, list: NCollection_IndexedDataMap_TCollection_AsciiString_handle_Standard_Transient, nbnuls: number): void;

  // IFSelect_SignatureList.List (method)
  List(root?: string): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IFSelect_SignatureList.HasEntities (method)
  HasEntities(): boolean;

  // IFSelect_SignatureList.NbNulls (method)
  NbNulls(): number;

  // IFSelect_SignatureList.NbTimes (method)
  NbTimes(sign: string): number;

  // IFSelect_SignatureList.Entities (method)
  Entities(sign: string): NCollection_HSequence_handle_Standard_Transient;

  // IFSelect_SignatureList.SetName (method)
  SetName(name: string): void;

  // IFSelect_SignatureList.Name (method)
  Name(): string;

  // IFSelect_SignatureList.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_SignatureList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_SignatureList.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_SignatureList.delete (method)
  delete(): void;

  // IFSelect_SignatureList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_TransformStandard: declare class IFSelect_TransformStandard extends IFSelect_Transformer

  // IFSelect_TransformStandard.constructor (constructor)
  constructor();

  // IFSelect_TransformStandard.SetCopyOption (method)
  SetCopyOption(option: boolean): void;

  // IFSelect_TransformStandard.CopyOption (method)
  CopyOption(): boolean;

  // IFSelect_TransformStandard.SetSelection (method)
  SetSelection(sel: IFSelect_Selection): void;

  // IFSelect_TransformStandard.Selection (method)
  Selection(): IFSelect_Selection;

  // IFSelect_TransformStandard.NbModifiers (method)
  NbModifiers(): number;

  // IFSelect_TransformStandard.Modifier (method)
  Modifier(num: number): IFSelect_Modifier;

  // IFSelect_TransformStandard.ModifierRank (method)
  ModifierRank(modif: IFSelect_Modifier): number;

  // IFSelect_TransformStandard.AddModifier (method)
  AddModifier(modif: IFSelect_Modifier, atnum?: number): boolean;

  // IFSelect_TransformStandard.RemoveModifier (method)
  RemoveModifier(modif: IFSelect_Modifier): boolean;
  RemoveModifier(num: number): boolean;

  // IFSelect_TransformStandard.Updated (method)
  Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IFSelect_TransformStandard.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_TransformStandard.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_TransformStandard.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_TransformStandard.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_TransformStandard.delete (method)
  delete(): void;

  // IFSelect_TransformStandard.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_Transformer: declare class IFSelect_Transformer extends Standard_Transient

  // IFSelect_Transformer.ChangeProtocol (method)
  ChangeProtocol(): { returnValue: boolean; newproto: Interface_Protocol; [Symbol.dispose](): void };

  // IFSelect_Transformer.Updated (method)
  Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IFSelect_Transformer.Label (method)
  Label(): TCollection_AsciiString;

  // IFSelect_Transformer.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_Transformer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_Transformer.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_Transformer.delete (method)
  delete(): void;

  // IFSelect_Transformer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IFSelect_WorkLibrary: declare class IFSelect_WorkLibrary extends Standard_Transient

  // IFSelect_WorkLibrary.ReadFile (method)
  ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

  // IFSelect_WorkLibrary.WriteFile (method)
  WriteFile(ctx: IFSelect_ContextWrite): boolean;

  // IFSelect_WorkLibrary.SetDumpLevels (method)
  SetDumpLevels(def: number, max: number): void;

  // IFSelect_WorkLibrary.DumpLevels (method)
  DumpLevels(def?: number, max?: number): { def: number; max: number };

  // IFSelect_WorkLibrary.SetDumpHelp (method)
  SetDumpHelp(level: number, help: string): void;

  // IFSelect_WorkLibrary.DumpHelp (method)
  DumpHelp(level: number): string;

  // IFSelect_WorkLibrary.get_type_name (method)
  static get_type_name(): string;

  // IFSelect_WorkLibrary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IFSelect_WorkLibrary.DynamicType (method)
  DynamicType(): Standard_Type;

  // IFSelect_WorkLibrary.delete (method)
  delete(): void;

  // IFSelect_WorkLibrary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
