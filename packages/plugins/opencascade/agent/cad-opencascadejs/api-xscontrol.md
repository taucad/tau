# libcascade — XSControl

15 top-level symbols. Signatures are verbatim typescript.

XSControl: declare class XSControl

  constructor

  static Session(pilot: IFSelect_SessionPilot): XSControl_WorkSession;

  static Vars(pilot: IFSelect_SessionPilot): XSControl_Vars;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_ConnectedShapes: declare class XSControl_ConnectedShapes extends IFSelect_SelectExplore

  constructor

  SetReader(TR: XSControl_TransferReader): void;

  ExploreLabel(): TCollection_AsciiString;

  static AdjacentEntities(ashape: TopoDS_Shape, TP: Transfer_TransientProcess, type_: TopAbs_ShapeEnum): NCollection_HSequence_handle_Standard_Transient;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_Controller: declare class XSControl_Controller extends Standard_Transient

  SetNames(theLongName: string, theShortName: string): void;

  AutoRecord(): void;

  Record(name: string): void;

  static Recorded(name: string): XSControl_Controller;

  Name(rsc: boolean): string;

  Protocol(): Interface_Protocol;

  WorkLibrary(): IFSelect_WorkLibrary;

  NewModel(): Interface_InterfaceModel;

  ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

  ActorWrite(): Transfer_ActorOfFinderProcess;

  SetModeWrite(modemin: number, modemax: number, shape?: boolean): void;

  SetModeWriteHelp(modetrans: number, help: string, shape?: boolean): void;

  ModeWriteBounds(modemin: number, modemax: number, shape: boolean): { returnValue: boolean; modemin: number; modemax: number };

  IsModeWrite(modetrans: number, shape?: boolean): boolean;

  ModeWriteHelp(modetrans: number, shape: boolean): string;

  RecognizeWriteTransient(obj: Standard_Transient, modetrans?: number): boolean;

  TransferWriteTransient(obj: Standard_Transient, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  RecognizeWriteShape(shape: TopoDS_Shape, modetrans?: number): boolean;

  TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  AddSessionItem(theItem: Standard_Transient, theName: string, toApply?: boolean): void;

  SessionItem(theName: string): Standard_Transient;

  Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

  AdaptorSession(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_FuncShape: declare class XSControl_FuncShape

  constructor

  static Init(): void;

  static MoreShapes(session: XSControl_WorkSession, name: string): { returnValue: number; list: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

  static FileAndVar(session: XSControl_WorkSession, file: string, var_: string, def: string, resfile: TCollection_AsciiString, resvar: TCollection_AsciiString): boolean;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_Functions: declare class XSControl_Functions

  constructor

  static Init(): void;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_Reader: declare class XSControl_Reader

  constructor

  SetNorm(norm: string): boolean;

  SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

  WS(): XSControl_WorkSession;

  ReadFile(filename: string): IFSelect_ReturnStatus;

  Model(): Interface_InterfaceModel;

  GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;
  GiveList(first: string, ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;
  GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;
  GiveList(first: string, ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

  NbRootsForTransfer(): number;

  RootForTransfer(num?: number): Standard_Transient;

  TransferOneRoot(num?: number, theProgress?: Message_ProgressRange): boolean;

  TransferOne(num: number, theProgress?: Message_ProgressRange): boolean;

  TransferEntity(start: Standard_Transient, theProgress?: Message_ProgressRange): boolean;

  TransferList(list: NCollection_HSequence_handle_Standard_Transient, theProgress?: Message_ProgressRange): number;

  TransferRoots(theProgress?: Message_ProgressRange): number;

  ClearShapes(): void;

  NbShapes(): number;

  Shape(num?: number): TopoDS_Shape;

  OneShape(): TopoDS_Shape;

  PrintCheckLoad(failsonly: boolean, mode: IFSelect_PrintCount): void;

  PrintCheckTransfer(failsonly: boolean, mode: IFSelect_PrintCount): void;

  PrintStatsTransfer(what: number, mode: number): void;

  GetStatsTransfer(list: NCollection_HSequence_handle_Standard_Transient, nbMapped?: number, nbWithResult?: number, nbWithFail?: number): { nbMapped: number; nbWithResult: number; nbWithFail: number };

  SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

  GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  SetShapeProcessFlags(theFlags: any): void;

  GetShapeProcessFlags(): [any, boolean];

  delete(): void;

  [Symbol.dispose](): void;

XSControl_SelectForTransfer: declare class XSControl_SelectForTransfer extends IFSelect_SelectExtract

  constructor

  SetReader(TR: XSControl_TransferReader): void;

  SetActor(act: Transfer_ActorOfTransientProcess): void;

  Actor(): Transfer_ActorOfTransientProcess;

  Reader(): XSControl_TransferReader;

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_SignTransferStatus: declare class XSControl_SignTransferStatus extends IFSelect_Signature

  constructor

  SetReader(TR: XSControl_TransferReader): void;

  SetMap(TP: Transfer_TransientProcess): void;

  Map(): Transfer_TransientProcess;

  Reader(): XSControl_TransferReader;

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_TransferReader: declare class XSControl_TransferReader extends Standard_Transient

  constructor

  SetController(theControl: XSControl_Controller): void;

  SetActor(theActor: Transfer_ActorOfTransientProcess): void;

  Actor(): Transfer_ActorOfTransientProcess;

  SetModel(theModel: Interface_InterfaceModel): void;

  Model(): Interface_InterfaceModel;

  SetContext(theName: string, theCtx: Standard_Transient): void;

  GetContext(theName: string, theType: Standard_Type): { returnValue: boolean; theCtx: Standard_Transient; [Symbol.dispose](): void };

  Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  SetFileName(theName: string): void;

  FileName(): string;

  Clear(theMode: number): void;

  TransientProcess(): Transfer_TransientProcess;

  SetTransientProcess(theTP: Transfer_TransientProcess): void;

  RecordResult(theEnt: Standard_Transient): boolean;

  IsRecorded(theEnt: Standard_Transient): boolean;

  HasResult(theEnt: Standard_Transient): boolean;

  RecordedList(): NCollection_HSequence_handle_Standard_Transient;

  Skip(theEnt: Standard_Transient): boolean;

  IsSkipped(theEnt: Standard_Transient): boolean;

  IsMarked(theEnt: Standard_Transient): boolean;

  FinalResult(theEnt: Standard_Transient): Transfer_ResultFromModel;

  FinalEntityLabel(theEnt: Standard_Transient): string;

  FinalEntityNumber(theEnt: Standard_Transient): number;

  ResultFromNumber(theNum: number): Transfer_ResultFromModel;

  TransientResult(theEnt: Standard_Transient): Standard_Transient;

  ShapeResult(theEnt: Standard_Transient): TopoDS_Shape;

  ClearResult(theEnt: Standard_Transient, theMode: number): boolean;

  EntityFromResult(theRes: Standard_Transient, theMode?: number): Standard_Transient;

  EntityFromShapeResult(theRes: TopoDS_Shape, theMode?: number): Standard_Transient;

  EntitiesFromShapeList(theRes: NCollection_HSequence_TopoDS_Shape, theMode?: number): NCollection_HSequence_handle_Standard_Transient;

  HasChecks(theEnt: Standard_Transient, FailsOnly: boolean): boolean;

  CheckedList(theEnt: Standard_Transient, WithCheck?: Interface_CheckStatus, theResult?: boolean): NCollection_HSequence_handle_Standard_Transient;

  BeginTransfer(): boolean;

  Recognize(theEnt: Standard_Transient): boolean;

  TransferOne(theEnt: Standard_Transient, theRec?: boolean, theProgress?: Message_ProgressRange): number;

  TransferList(theList: NCollection_HSequence_handle_Standard_Transient, theRec?: boolean, theProgress?: Message_ProgressRange): number;

  TransferClear(theEnt: Standard_Transient, theLevel?: number): void;

  LastTransferList(theRoots: boolean): NCollection_HSequence_handle_Standard_Transient;

  ShapeResultList(theRec: boolean): NCollection_HSequence_TopoDS_Shape;

  static PrintStatsProcess(theTP: Transfer_TransientProcess, theWhat: number, theMode?: number): void;

  static PrintStatsOnList(theTP: Transfer_TransientProcess, theList: NCollection_HSequence_handle_Standard_Transient, theWhat: number, theMode?: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_TransferWriter: declare class XSControl_TransferWriter extends Standard_Transient

  constructor

  FinderProcess(): Transfer_FinderProcess;

  SetFinderProcess(theFP: Transfer_FinderProcess): void;

  Controller(): XSControl_Controller;

  SetController(theCtl: XSControl_Controller): void;

  Clear(theMode: number): void;

  TransferMode(): number;

  SetTransferMode(theMode: number): void;

  PrintStats(theWhat: number, theMode?: number): void;

  RecognizeTransient(theObj: Standard_Transient): boolean;

  TransferWriteTransient(theModel: Interface_InterfaceModel, theObj: Standard_Transient, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  RecognizeShape(theShape: TopoDS_Shape): boolean;

  TransferWriteShape(theModel: Interface_InterfaceModel, theShape: TopoDS_Shape, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_Utils: declare class XSControl_Utils

  constructor

  TraceLine(line: string): void;

  TraceLines(lines: Standard_Transient): void;

  IsKind(item: Standard_Transient, what: Standard_Type): boolean;

  TypeName(item: Standard_Transient, nopk: boolean): string;

  TraValue(list: Standard_Transient, num: number): Standard_Transient;

  NewSeqTra(): NCollection_HSequence_handle_Standard_Transient;

  AppendTra(seqval: NCollection_HSequence_handle_Standard_Transient, traval: Standard_Transient): void;

  DateString(yy: number, mm: number, dd: number, hh: number, mn: number, ss: number): string;

  DateValues(text: string, yy?: number, mm?: number, dd?: number, hh?: number, mn?: number, ss?: number): { yy: number; mm: number; dd: number; hh: number; mn: number; ss: number };

  ToCString(strval: TCollection_HAsciiString): string;
  ToCString(strval: TCollection_AsciiString): string;
  ToCString(strval: TCollection_HAsciiString): string;
  ToCString(strval: TCollection_AsciiString): string;

  ToHString(strcon: string): TCollection_HAsciiString;

  ToHString_2(strcon: string): TCollection_HExtendedString;

  ToAString(strcon: string): TCollection_AsciiString;

  ToEString(strval: TCollection_HExtendedString): string;
  ToEString(strval: TCollection_ExtendedString): string;
  ToEString(strval: TCollection_HExtendedString): string;
  ToEString(strval: TCollection_ExtendedString): string;

  ToXString(strcon: string): TCollection_ExtendedString;

  AsciiToExtended(str: string): string;

  IsAscii(str: string): boolean;

  ExtendedToAscii(str: string): string;

  CStrValue(list: Standard_Transient, num: number): string;

  EStrValue(list: Standard_Transient, num: number): string;

  NewSeqCStr(): NCollection_HSequence_handle_TCollection_HAsciiString;

  AppendCStr(seqval: NCollection_HSequence_handle_TCollection_HAsciiString, strval: string): void;

  NewSeqEStr(): NCollection_HSequence_handle_TCollection_HExtendedString;

  AppendEStr(seqval: NCollection_HSequence_handle_TCollection_HExtendedString, strval: string): void;

  CompoundFromSeq(seqval: NCollection_HSequence_TopoDS_Shape): TopoDS_Shape;

  ShapeType(shape: TopoDS_Shape, compound: boolean): TopAbs_ShapeEnum;

  SortedCompound(shape: TopoDS_Shape, type_: TopAbs_ShapeEnum, explore: boolean, compound: boolean): TopoDS_Shape;

  ShapeValue(seqv: NCollection_HSequence_TopoDS_Shape, num: number): TopoDS_Shape;

  NewSeqShape(): NCollection_HSequence_TopoDS_Shape;

  AppendShape(seqv: NCollection_HSequence_TopoDS_Shape, shape: TopoDS_Shape): void;

  ShapeBinder(shape: TopoDS_Shape, hs?: boolean): Standard_Transient;

  BinderShape(tr: Standard_Transient): TopoDS_Shape;

  SeqLength(list: Standard_Transient): number;

  SeqToArr(seq: Standard_Transient, first?: number): Standard_Transient;

  ArrToSeq(arr: Standard_Transient): Standard_Transient;

  SeqIntValue(list: NCollection_HSequence_int, num: number): number;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_Vars: declare class XSControl_Vars extends Standard_Transient

  delete(): void;

  [Symbol.dispose](): void;

XSControl_WorkSession: declare class XSControl_WorkSession extends IFSelect_WorkSession

  constructor

  ClearData(mode: number): void;

  SelectNorm(theNormName: string): boolean;

  SetController(theCtl: XSControl_Controller): void;

  SelectedNorm(theRsc: boolean): string;

  NormAdaptor(): XSControl_Controller;

  Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

  SetAllContext(theContext: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient): void;

  ClearContext(): void;

  InitTransferReader(theMode: number): void;

  SetTransferReader(theTR: XSControl_TransferReader): void;

  TransferReader(): XSControl_TransferReader;

  MapReader(): Transfer_TransientProcess;

  SetMapReader(theTP: Transfer_TransientProcess): boolean;

  Result(theEnt: Standard_Transient, theMode: number): Standard_Transient;

  TransferReadOne(theEnts: Standard_Transient, theProgress?: Message_ProgressRange): number;

  TransferReadRoots(theProgress?: Message_ProgressRange): number;

  NewModel(): Interface_InterfaceModel;

  TransferWriter(): XSControl_TransferWriter;

  SetMapWriter(theFP: Transfer_FinderProcess): boolean;

  TransferWriteShape(theShape: TopoDS_Shape, theCompGraph?: boolean, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  Vars(): XSControl_Vars;

  SetVars(theVars: XSControl_Vars): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_Writer: declare class XSControl_Writer

  constructor

  SetNorm(norm: string): boolean;

  SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

  WS(): XSControl_WorkSession;

  Model(newone?: boolean): Interface_InterfaceModel;

  TransferShape(sh: TopoDS_Shape, mode?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

  WriteFile(filename: string): IFSelect_ReturnStatus;

  PrintStatsTransfer(what: number, mode?: number): void;

  delete(): void;

  [Symbol.dispose](): void;

XSControl_WorkSessionMap: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient
