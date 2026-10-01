# libcascade — XSControl

15 top-level symbols. Signatures are verbatim typescript.

XSControl: declare class XSControl

  // XSControl.constructor (constructor)
  constructor();

  // XSControl.Session (method)
  static Session(pilot: IFSelect_SessionPilot): XSControl_WorkSession;

  // XSControl.Vars (method)
  static Vars(pilot: IFSelect_SessionPilot): XSControl_Vars;

  // XSControl.delete (method)
  delete(): void;

  // XSControl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_ConnectedShapes: declare class XSControl_ConnectedShapes extends IFSelect_SelectExplore

  // XSControl_ConnectedShapes.constructor (constructor)
  constructor();
  constructor(TR: XSControl_TransferReader);

  // XSControl_ConnectedShapes.SetReader (method)
  SetReader(TR: XSControl_TransferReader): void;

  // XSControl_ConnectedShapes.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // XSControl_ConnectedShapes.AdjacentEntities (method)
  static AdjacentEntities(ashape: TopoDS_Shape, TP: Transfer_TransientProcess, type_: TopAbs_ShapeEnum): NCollection_HSequence_handle_Standard_Transient;

  // XSControl_ConnectedShapes.get_type_name (method)
  static get_type_name(): string;

  // XSControl_ConnectedShapes.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XSControl_ConnectedShapes.DynamicType (method)
  DynamicType(): Standard_Type;

  // XSControl_ConnectedShapes.delete (method)
  delete(): void;

  // XSControl_ConnectedShapes.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_Controller: declare class XSControl_Controller extends Standard_Transient

  // XSControl_Controller.SetNames (method)
  SetNames(theLongName: string, theShortName: string): void;

  // XSControl_Controller.AutoRecord (method)
  AutoRecord(): void;

  // XSControl_Controller.Record (method)
  Record(name: string): void;

  // XSControl_Controller.Recorded (method)
  static Recorded(name: string): XSControl_Controller;

  // XSControl_Controller.Name (method)
  Name(rsc: boolean): string;

  // XSControl_Controller.Protocol (method)
  Protocol(): Interface_Protocol;

  // XSControl_Controller.WorkLibrary (method)
  WorkLibrary(): IFSelect_WorkLibrary;

  // XSControl_Controller.NewModel (method)
  NewModel(): Interface_InterfaceModel;

  // XSControl_Controller.ActorRead (method)
  ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

  // XSControl_Controller.ActorWrite (method)
  ActorWrite(): Transfer_ActorOfFinderProcess;

  // XSControl_Controller.SetModeWrite (method)
  SetModeWrite(modemin: number, modemax: number, shape?: boolean): void;

  // XSControl_Controller.SetModeWriteHelp (method)
  SetModeWriteHelp(modetrans: number, help: string, shape?: boolean): void;

  // XSControl_Controller.ModeWriteBounds (method)
  ModeWriteBounds(modemin: number, modemax: number, shape: boolean): { returnValue: boolean; modemin: number; modemax: number };

  // XSControl_Controller.IsModeWrite (method)
  IsModeWrite(modetrans: number, shape?: boolean): boolean;

  // XSControl_Controller.ModeWriteHelp (method)
  ModeWriteHelp(modetrans: number, shape: boolean): string;

  // XSControl_Controller.RecognizeWriteTransient (method)
  RecognizeWriteTransient(obj: Standard_Transient, modetrans?: number): boolean;

  // XSControl_Controller.TransferWriteTransient (method)
  TransferWriteTransient(obj: Standard_Transient, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  // XSControl_Controller.RecognizeWriteShape (method)
  RecognizeWriteShape(shape: TopoDS_Shape, modetrans?: number): boolean;

  // XSControl_Controller.TransferWriteShape (method)
  TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  // XSControl_Controller.AddSessionItem (method)
  AddSessionItem(theItem: Standard_Transient, theName: string, toApply?: boolean): void;

  // XSControl_Controller.SessionItem (method)
  SessionItem(theName: string): Standard_Transient;

  // XSControl_Controller.Customise (method)
  Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

  // XSControl_Controller.AdaptorSession (method)
  AdaptorSession(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  // XSControl_Controller.get_type_name (method)
  static get_type_name(): string;

  // XSControl_Controller.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XSControl_Controller.DynamicType (method)
  DynamicType(): Standard_Type;

  // XSControl_Controller.delete (method)
  delete(): void;

  // XSControl_Controller.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_FuncShape: declare class XSControl_FuncShape

  // XSControl_FuncShape.constructor (constructor)
  constructor();

  // XSControl_FuncShape.Init (method)
  static Init(): void;

  // XSControl_FuncShape.MoreShapes (method)
  static MoreShapes(session: XSControl_WorkSession, name: string): { returnValue: number; list: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

  // XSControl_FuncShape.FileAndVar (method)
  static FileAndVar(session: XSControl_WorkSession, file: string, var_: string, def: string, resfile: TCollection_AsciiString, resvar: TCollection_AsciiString): boolean;

  // XSControl_FuncShape.delete (method)
  delete(): void;

  // XSControl_FuncShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_Functions: declare class XSControl_Functions

  // XSControl_Functions.constructor (constructor)
  constructor();

  // XSControl_Functions.Init (method)
  static Init(): void;

  // XSControl_Functions.delete (method)
  delete(): void;

  // XSControl_Functions.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_Reader: declare class XSControl_Reader

  // XSControl_Reader.constructor (constructor)
  constructor();
  constructor(norm: string);
  constructor(WS: XSControl_WorkSession, scratch?: boolean);

  // XSControl_Reader.SetNorm (method)
  SetNorm(norm: string): boolean;

  // XSControl_Reader.SetWS (method)
  SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

  // XSControl_Reader.WS (method)
  WS(): XSControl_WorkSession;

  // XSControl_Reader.ReadFile (method)
  ReadFile(filename: string): IFSelect_ReturnStatus;

  // XSControl_Reader.Model (method)
  Model(): Interface_InterfaceModel;

  // XSControl_Reader.GiveList (method)
  GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;
  GiveList(first: string, ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

  // XSControl_Reader.NbRootsForTransfer (method)
  NbRootsForTransfer(): number;

  // XSControl_Reader.RootForTransfer (method)
  RootForTransfer(num?: number): Standard_Transient;

  // XSControl_Reader.TransferOneRoot (method)
  TransferOneRoot(num?: number, theProgress?: Message_ProgressRange): boolean;

  // XSControl_Reader.TransferOne (method)
  TransferOne(num: number, theProgress?: Message_ProgressRange): boolean;

  // XSControl_Reader.TransferEntity (method)
  TransferEntity(start: Standard_Transient, theProgress?: Message_ProgressRange): boolean;

  // XSControl_Reader.TransferList (method)
  TransferList(list: NCollection_HSequence_handle_Standard_Transient, theProgress?: Message_ProgressRange): number;

  // XSControl_Reader.TransferRoots (method)
  TransferRoots(theProgress?: Message_ProgressRange): number;

  // XSControl_Reader.ClearShapes (method)
  ClearShapes(): void;

  // XSControl_Reader.NbShapes (method)
  NbShapes(): number;

  // XSControl_Reader.Shape (method)
  Shape(num?: number): TopoDS_Shape;

  // XSControl_Reader.OneShape (method)
  OneShape(): TopoDS_Shape;

  // XSControl_Reader.PrintCheckLoad (method)
  PrintCheckLoad(failsonly: boolean, mode: IFSelect_PrintCount): void;

  // XSControl_Reader.PrintCheckTransfer (method)
  PrintCheckTransfer(failsonly: boolean, mode: IFSelect_PrintCount): void;

  // XSControl_Reader.PrintStatsTransfer (method)
  PrintStatsTransfer(what: number, mode: number): void;

  // XSControl_Reader.GetStatsTransfer (method)
  GetStatsTransfer(list: NCollection_HSequence_handle_Standard_Transient, nbMapped?: number, nbWithResult?: number, nbWithFail?: number): { nbMapped: number; nbWithResult: number; nbWithFail: number };

  // XSControl_Reader.SetShapeFixParameters (method)
  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  // XSControl_Reader.GetShapeFixParameters (method)
  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // XSControl_Reader.SetShapeProcessFlags (method)
  SetShapeProcessFlags(theFlags: any): void;

  // XSControl_Reader.GetShapeProcessFlags (method)
  GetShapeProcessFlags(): [any, boolean];

  // XSControl_Reader.delete (method)
  delete(): void;

  // XSControl_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_SelectForTransfer: declare class XSControl_SelectForTransfer extends IFSelect_SelectExtract

  // XSControl_SelectForTransfer.constructor (constructor)
  constructor();
  constructor(TR: XSControl_TransferReader);

  // XSControl_SelectForTransfer.SetReader (method)
  SetReader(TR: XSControl_TransferReader): void;

  // XSControl_SelectForTransfer.SetActor (method)
  SetActor(act: Transfer_ActorOfTransientProcess): void;

  // XSControl_SelectForTransfer.Actor (method)
  Actor(): Transfer_ActorOfTransientProcess;

  // XSControl_SelectForTransfer.Reader (method)
  Reader(): XSControl_TransferReader;

  // XSControl_SelectForTransfer.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // XSControl_SelectForTransfer.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // XSControl_SelectForTransfer.get_type_name (method)
  static get_type_name(): string;

  // XSControl_SelectForTransfer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XSControl_SelectForTransfer.DynamicType (method)
  DynamicType(): Standard_Type;

  // XSControl_SelectForTransfer.delete (method)
  delete(): void;

  // XSControl_SelectForTransfer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_SignTransferStatus: declare class XSControl_SignTransferStatus extends IFSelect_Signature

  // XSControl_SignTransferStatus.constructor (constructor)
  constructor();
  constructor(TR: XSControl_TransferReader);

  // XSControl_SignTransferStatus.SetReader (method)
  SetReader(TR: XSControl_TransferReader): void;

  // XSControl_SignTransferStatus.SetMap (method)
  SetMap(TP: Transfer_TransientProcess): void;

  // XSControl_SignTransferStatus.Map (method)
  Map(): Transfer_TransientProcess;

  // XSControl_SignTransferStatus.Reader (method)
  Reader(): XSControl_TransferReader;

  // XSControl_SignTransferStatus.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // XSControl_SignTransferStatus.get_type_name (method)
  static get_type_name(): string;

  // XSControl_SignTransferStatus.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XSControl_SignTransferStatus.DynamicType (method)
  DynamicType(): Standard_Type;

  // XSControl_SignTransferStatus.delete (method)
  delete(): void;

  // XSControl_SignTransferStatus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_TransferReader: declare class XSControl_TransferReader extends Standard_Transient

  // XSControl_TransferReader.constructor (constructor)
  constructor();

  // XSControl_TransferReader.SetController (method)
  SetController(theControl: XSControl_Controller): void;

  // XSControl_TransferReader.SetActor (method)
  SetActor(theActor: Transfer_ActorOfTransientProcess): void;

  // XSControl_TransferReader.Actor (method)
  Actor(): Transfer_ActorOfTransientProcess;

  // XSControl_TransferReader.SetModel (method)
  SetModel(theModel: Interface_InterfaceModel): void;

  // XSControl_TransferReader.Model (method)
  Model(): Interface_InterfaceModel;

  // XSControl_TransferReader.SetContext (method)
  SetContext(theName: string, theCtx: Standard_Transient): void;

  // XSControl_TransferReader.GetContext (method)
  GetContext(theName: string, theType: Standard_Type): { returnValue: boolean; theCtx: Standard_Transient; [Symbol.dispose](): void };

  // XSControl_TransferReader.Context (method)
  Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  // XSControl_TransferReader.SetFileName (method)
  SetFileName(theName: string): void;

  // XSControl_TransferReader.FileName (method)
  FileName(): string;

  // XSControl_TransferReader.Clear (method)
  Clear(theMode: number): void;

  // XSControl_TransferReader.TransientProcess (method)
  TransientProcess(): Transfer_TransientProcess;

  // XSControl_TransferReader.SetTransientProcess (method)
  SetTransientProcess(theTP: Transfer_TransientProcess): void;

  // XSControl_TransferReader.RecordResult (method)
  RecordResult(theEnt: Standard_Transient): boolean;

  // XSControl_TransferReader.IsRecorded (method)
  IsRecorded(theEnt: Standard_Transient): boolean;

  // XSControl_TransferReader.HasResult (method)
  HasResult(theEnt: Standard_Transient): boolean;

  // XSControl_TransferReader.RecordedList (method)
  RecordedList(): NCollection_HSequence_handle_Standard_Transient;

  // XSControl_TransferReader.Skip (method)
  Skip(theEnt: Standard_Transient): boolean;

  // XSControl_TransferReader.IsSkipped (method)
  IsSkipped(theEnt: Standard_Transient): boolean;

  // XSControl_TransferReader.IsMarked (method)
  IsMarked(theEnt: Standard_Transient): boolean;

  // XSControl_TransferReader.FinalResult (method)
  FinalResult(theEnt: Standard_Transient): Transfer_ResultFromModel;

  // XSControl_TransferReader.FinalEntityLabel (method)
  FinalEntityLabel(theEnt: Standard_Transient): string;

  // XSControl_TransferReader.FinalEntityNumber (method)
  FinalEntityNumber(theEnt: Standard_Transient): number;

  // XSControl_TransferReader.ResultFromNumber (method)
  ResultFromNumber(theNum: number): Transfer_ResultFromModel;

  // XSControl_TransferReader.TransientResult (method)
  TransientResult(theEnt: Standard_Transient): Standard_Transient;

  // XSControl_TransferReader.ShapeResult (method)
  ShapeResult(theEnt: Standard_Transient): TopoDS_Shape;

  // XSControl_TransferReader.ClearResult (method)
  ClearResult(theEnt: Standard_Transient, theMode: number): boolean;

  // XSControl_TransferReader.EntityFromResult (method)
  EntityFromResult(theRes: Standard_Transient, theMode?: number): Standard_Transient;

  // XSControl_TransferReader.EntityFromShapeResult (method)
  EntityFromShapeResult(theRes: TopoDS_Shape, theMode?: number): Standard_Transient;

  // XSControl_TransferReader.EntitiesFromShapeList (method)
  EntitiesFromShapeList(theRes: NCollection_HSequence_TopoDS_Shape, theMode?: number): NCollection_HSequence_handle_Standard_Transient;

  // XSControl_TransferReader.HasChecks (method)
  HasChecks(theEnt: Standard_Transient, FailsOnly: boolean): boolean;

  // XSControl_TransferReader.CheckedList (method)
  CheckedList(theEnt: Standard_Transient, WithCheck?: Interface_CheckStatus, theResult?: boolean): NCollection_HSequence_handle_Standard_Transient;

  // XSControl_TransferReader.BeginTransfer (method)
  BeginTransfer(): boolean;

  // XSControl_TransferReader.Recognize (method)
  Recognize(theEnt: Standard_Transient): boolean;

  // XSControl_TransferReader.TransferOne (method)
  TransferOne(theEnt: Standard_Transient, theRec?: boolean, theProgress?: Message_ProgressRange): number;

  // XSControl_TransferReader.TransferList (method)
  TransferList(theList: NCollection_HSequence_handle_Standard_Transient, theRec?: boolean, theProgress?: Message_ProgressRange): number;

  // XSControl_TransferReader.TransferClear (method)
  TransferClear(theEnt: Standard_Transient, theLevel?: number): void;

  // XSControl_TransferReader.LastTransferList (method)
  LastTransferList(theRoots: boolean): NCollection_HSequence_handle_Standard_Transient;

  // XSControl_TransferReader.ShapeResultList (method)
  ShapeResultList(theRec: boolean): NCollection_HSequence_TopoDS_Shape;

  // XSControl_TransferReader.PrintStatsProcess (method)
  static PrintStatsProcess(theTP: Transfer_TransientProcess, theWhat: number, theMode?: number): void;

  // XSControl_TransferReader.PrintStatsOnList (method)
  static PrintStatsOnList(theTP: Transfer_TransientProcess, theList: NCollection_HSequence_handle_Standard_Transient, theWhat: number, theMode?: number): void;

  // XSControl_TransferReader.get_type_name (method)
  static get_type_name(): string;

  // XSControl_TransferReader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XSControl_TransferReader.DynamicType (method)
  DynamicType(): Standard_Type;

  // XSControl_TransferReader.delete (method)
  delete(): void;

  // XSControl_TransferReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_TransferWriter: declare class XSControl_TransferWriter extends Standard_Transient

  // XSControl_TransferWriter.constructor (constructor)
  constructor();

  // XSControl_TransferWriter.FinderProcess (method)
  FinderProcess(): Transfer_FinderProcess;

  // XSControl_TransferWriter.SetFinderProcess (method)
  SetFinderProcess(theFP: Transfer_FinderProcess): void;

  // XSControl_TransferWriter.Controller (method)
  Controller(): XSControl_Controller;

  // XSControl_TransferWriter.SetController (method)
  SetController(theCtl: XSControl_Controller): void;

  // XSControl_TransferWriter.Clear (method)
  Clear(theMode: number): void;

  // XSControl_TransferWriter.TransferMode (method)
  TransferMode(): number;

  // XSControl_TransferWriter.SetTransferMode (method)
  SetTransferMode(theMode: number): void;

  // XSControl_TransferWriter.PrintStats (method)
  PrintStats(theWhat: number, theMode?: number): void;

  // XSControl_TransferWriter.RecognizeTransient (method)
  RecognizeTransient(theObj: Standard_Transient): boolean;

  // XSControl_TransferWriter.TransferWriteTransient (method)
  TransferWriteTransient(theModel: Interface_InterfaceModel, theObj: Standard_Transient, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  // XSControl_TransferWriter.RecognizeShape (method)
  RecognizeShape(theShape: TopoDS_Shape): boolean;

  // XSControl_TransferWriter.TransferWriteShape (method)
  TransferWriteShape(theModel: Interface_InterfaceModel, theShape: TopoDS_Shape, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  // XSControl_TransferWriter.get_type_name (method)
  static get_type_name(): string;

  // XSControl_TransferWriter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XSControl_TransferWriter.DynamicType (method)
  DynamicType(): Standard_Type;

  // XSControl_TransferWriter.delete (method)
  delete(): void;

  // XSControl_TransferWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_Utils: declare class XSControl_Utils

  // XSControl_Utils.constructor (constructor)
  constructor();

  // XSControl_Utils.TraceLine (method)
  TraceLine(line: string): void;

  // XSControl_Utils.TraceLines (method)
  TraceLines(lines: Standard_Transient): void;

  // XSControl_Utils.IsKind (method)
  IsKind(item: Standard_Transient, what: Standard_Type): boolean;

  // XSControl_Utils.TypeName (method)
  TypeName(item: Standard_Transient, nopk: boolean): string;

  // XSControl_Utils.TraValue (method)
  TraValue(list: Standard_Transient, num: number): Standard_Transient;

  // XSControl_Utils.NewSeqTra (method)
  NewSeqTra(): NCollection_HSequence_handle_Standard_Transient;

  // XSControl_Utils.AppendTra (method)
  AppendTra(seqval: NCollection_HSequence_handle_Standard_Transient, traval: Standard_Transient): void;

  // XSControl_Utils.DateString (method)
  DateString(yy: number, mm: number, dd: number, hh: number, mn: number, ss: number): string;

  // XSControl_Utils.DateValues (method)
  DateValues(text: string, yy?: number, mm?: number, dd?: number, hh?: number, mn?: number, ss?: number): { yy: number; mm: number; dd: number; hh: number; mn: number; ss: number };

  // XSControl_Utils.ToCString (method)
  ToCString(strval: TCollection_HAsciiString): string;
  ToCString(strval: TCollection_AsciiString): string;

  // XSControl_Utils.ToHString (method)
  ToHString(strcon: string): TCollection_HAsciiString;

  // XSControl_Utils.ToHString_2 (method)
  ToHString_2(strcon: string): TCollection_HExtendedString;

  // XSControl_Utils.ToAString (method)
  ToAString(strcon: string): TCollection_AsciiString;

  // XSControl_Utils.ToEString (method)
  ToEString(strval: TCollection_HExtendedString): string;
  ToEString(strval: TCollection_ExtendedString): string;

  // XSControl_Utils.ToXString (method)
  ToXString(strcon: string): TCollection_ExtendedString;

  // XSControl_Utils.AsciiToExtended (method)
  AsciiToExtended(str: string): string;

  // XSControl_Utils.IsAscii (method)
  IsAscii(str: string): boolean;

  // XSControl_Utils.ExtendedToAscii (method)
  ExtendedToAscii(str: string): string;

  // XSControl_Utils.CStrValue (method)
  CStrValue(list: Standard_Transient, num: number): string;

  // XSControl_Utils.EStrValue (method)
  EStrValue(list: Standard_Transient, num: number): string;

  // XSControl_Utils.NewSeqCStr (method)
  NewSeqCStr(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // XSControl_Utils.AppendCStr (method)
  AppendCStr(seqval: NCollection_HSequence_handle_TCollection_HAsciiString, strval: string): void;

  // XSControl_Utils.NewSeqEStr (method)
  NewSeqEStr(): NCollection_HSequence_handle_TCollection_HExtendedString;

  // XSControl_Utils.AppendEStr (method)
  AppendEStr(seqval: NCollection_HSequence_handle_TCollection_HExtendedString, strval: string): void;

  // XSControl_Utils.CompoundFromSeq (method)
  CompoundFromSeq(seqval: NCollection_HSequence_TopoDS_Shape): TopoDS_Shape;

  // XSControl_Utils.ShapeType (method)
  ShapeType(shape: TopoDS_Shape, compound: boolean): TopAbs_ShapeEnum;

  // XSControl_Utils.SortedCompound (method)
  SortedCompound(shape: TopoDS_Shape, type_: TopAbs_ShapeEnum, explore: boolean, compound: boolean): TopoDS_Shape;

  // XSControl_Utils.ShapeValue (method)
  ShapeValue(seqv: NCollection_HSequence_TopoDS_Shape, num: number): TopoDS_Shape;

  // XSControl_Utils.NewSeqShape (method)
  NewSeqShape(): NCollection_HSequence_TopoDS_Shape;

  // XSControl_Utils.AppendShape (method)
  AppendShape(seqv: NCollection_HSequence_TopoDS_Shape, shape: TopoDS_Shape): void;

  // XSControl_Utils.ShapeBinder (method)
  ShapeBinder(shape: TopoDS_Shape, hs?: boolean): Standard_Transient;

  // XSControl_Utils.BinderShape (method)
  BinderShape(tr: Standard_Transient): TopoDS_Shape;

  // XSControl_Utils.SeqLength (method)
  SeqLength(list: Standard_Transient): number;

  // XSControl_Utils.SeqToArr (method)
  SeqToArr(seq: Standard_Transient, first?: number): Standard_Transient;

  // XSControl_Utils.ArrToSeq (method)
  ArrToSeq(arr: Standard_Transient): Standard_Transient;

  // XSControl_Utils.SeqIntValue (method)
  SeqIntValue(list: NCollection_HSequence_int, num: number): number;

  // XSControl_Utils.delete (method)
  delete(): void;

  // XSControl_Utils.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_Vars: declare class XSControl_Vars extends Standard_Transient

  // XSControl_Vars.delete (method)
  delete(): void;

  // XSControl_Vars.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_WorkSession: declare class XSControl_WorkSession extends IFSelect_WorkSession

  // XSControl_WorkSession.constructor (constructor)
  constructor();

  // XSControl_WorkSession.ClearData (method)
  ClearData(mode: number): void;

  // XSControl_WorkSession.SelectNorm (method)
  SelectNorm(theNormName: string): boolean;

  // XSControl_WorkSession.SetController (method)
  SetController(theCtl: XSControl_Controller): void;

  // XSControl_WorkSession.SelectedNorm (method)
  SelectedNorm(theRsc: boolean): string;

  // XSControl_WorkSession.NormAdaptor (method)
  NormAdaptor(): XSControl_Controller;

  // XSControl_WorkSession.Context (method)
  Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  // XSControl_WorkSession.SetAllContext (method)
  SetAllContext(theContext: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient): void;

  // XSControl_WorkSession.ClearContext (method)
  ClearContext(): void;

  // XSControl_WorkSession.InitTransferReader (method)
  InitTransferReader(theMode: number): void;

  // XSControl_WorkSession.SetTransferReader (method)
  SetTransferReader(theTR: XSControl_TransferReader): void;

  // XSControl_WorkSession.TransferReader (method)
  TransferReader(): XSControl_TransferReader;

  // XSControl_WorkSession.MapReader (method)
  MapReader(): Transfer_TransientProcess;

  // XSControl_WorkSession.SetMapReader (method)
  SetMapReader(theTP: Transfer_TransientProcess): boolean;

  // XSControl_WorkSession.Result (method)
  Result(theEnt: Standard_Transient, theMode: number): Standard_Transient;

  // XSControl_WorkSession.TransferReadOne (method)
  TransferReadOne(theEnts: Standard_Transient, theProgress?: Message_ProgressRange): number;

  // XSControl_WorkSession.TransferReadRoots (method)
  TransferReadRoots(theProgress?: Message_ProgressRange): number;

  // XSControl_WorkSession.NewModel (method)
  NewModel(): Interface_InterfaceModel;

  // XSControl_WorkSession.TransferWriter (method)
  TransferWriter(): XSControl_TransferWriter;

  // XSControl_WorkSession.SetMapWriter (method)
  SetMapWriter(theFP: Transfer_FinderProcess): boolean;

  // XSControl_WorkSession.TransferWriteShape (method)
  TransferWriteShape(theShape: TopoDS_Shape, theCompGraph?: boolean, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  // XSControl_WorkSession.Vars (method)
  Vars(): XSControl_Vars;

  // XSControl_WorkSession.SetVars (method)
  SetVars(theVars: XSControl_Vars): void;

  // XSControl_WorkSession.get_type_name (method)
  static get_type_name(): string;

  // XSControl_WorkSession.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XSControl_WorkSession.DynamicType (method)
  DynamicType(): Standard_Type;

  // XSControl_WorkSession.delete (method)
  delete(): void;

  // XSControl_WorkSession.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_Writer: declare class XSControl_Writer

  // XSControl_Writer.constructor (constructor)
  constructor();
  constructor(norm: string);
  constructor(WS: XSControl_WorkSession, scratch?: boolean);

  // XSControl_Writer.SetNorm (method)
  SetNorm(norm: string): boolean;

  // XSControl_Writer.SetWS (method)
  SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

  // XSControl_Writer.WS (method)
  WS(): XSControl_WorkSession;

  // XSControl_Writer.Model (method)
  Model(newone?: boolean): Interface_InterfaceModel;

  // XSControl_Writer.TransferShape (method)
  TransferShape(sh: TopoDS_Shape, mode?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  // XSControl_Writer.WriteFile (method)
  WriteFile(filename: string): IFSelect_ReturnStatus;

  // XSControl_Writer.PrintStatsTransfer (method)
  PrintStatsTransfer(what: number, mode?: number): void;

  // XSControl_Writer.delete (method)
  delete(): void;

  // XSControl_Writer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XSControl_WorkSessionMap: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient
