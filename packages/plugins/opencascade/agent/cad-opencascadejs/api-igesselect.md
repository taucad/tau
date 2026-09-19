# libcascade — IGESSelect

46 top-level symbols. Signatures are verbatim typescript.

IGESSelect: declare class IGESSelect

  constructor

  static Run(): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_Activator: declare class IGESSelect_Activator extends IFSelect_Activator

  constructor

  Do(number_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

  Help(number_: number): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_AddFileComment: declare class IGESSelect_AddFileComment extends IGESSelect_FileModifier

  constructor

  Clear(): void;

  AddLine(line: string): void;

  AddLines(lines: NCollection_HSequence_handle_TCollection_HAsciiString): void;

  NbLines(): number;

  Line(num: number): string;

  Lines(): NCollection_HSequence_handle_TCollection_HAsciiString;

  Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_AddGroup: declare class IGESSelect_AddGroup extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_AutoCorrect: declare class IGESSelect_AutoCorrect extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_ChangeLevelList: declare class IGESSelect_ChangeLevelList extends IGESSelect_ModelModifier

  constructor

  HasOldNumber(): boolean;

  HasNewNumber(): boolean;

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_ChangeLevelNumber: declare class IGESSelect_ChangeLevelNumber extends IGESSelect_ModelModifier

  constructor

  HasOldNumber(): boolean;

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_ComputeStatus: declare class IGESSelect_ComputeStatus extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_CounterOfLevelNumber: declare class IGESSelect_CounterOfLevelNumber extends IFSelect_SignCounter

  constructor

  Clear(): void;

  AddSign(ent: Standard_Transient, model: Interface_InterfaceModel): void;

  AddLevel(ent: Standard_Transient, level: number): void;

  HighestLevel(): number;

  NbTimesLevel(level: number): number;

  Levels(): NCollection_HSequence_int;

  Sign(ent: Standard_Transient, model: Interface_InterfaceModel): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_DispPerDrawing: declare class IGESSelect_DispPerDrawing extends IFSelect_Dispatch

  constructor

  Label(): TCollection_AsciiString;

  CanHaveRemainder(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_DispPerSingleView: declare class IGESSelect_DispPerSingleView extends IFSelect_Dispatch

  constructor

  Label(): TCollection_AsciiString;

  CanHaveRemainder(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_Dumper: declare class IGESSelect_Dumper extends IFSelect_SessionDumper

  constructor

  WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

  ReadOwn(file: IFSelect_SessionFile, type_: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_EditDirPart: declare class IGESSelect_EditDirPart extends IFSelect_Editor

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_EditHeader: declare class IGESSelect_EditHeader extends IFSelect_Editor

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_FileModifier: declare class IGESSelect_FileModifier extends IFSelect_GeneralModifier

  Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_FloatFormat: declare class IGESSelect_FloatFormat extends IGESSelect_FileModifier

  constructor

  SetDefault(digits?: number): void;

  SetZeroSuppress(mode: boolean): void;

  SetFormat(format?: string): void;

  SetFormatForRange(format?: string, Rmin?: number, Rmax?: number): void;

  Format(zerosup: boolean, mainform: TCollection_AsciiString, hasrange: boolean, forminrange: TCollection_AsciiString, rangemin?: number, rangemax?: number): { zerosup: boolean; hasrange: boolean; rangemin: number; rangemax: number };

  Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_IGESName: declare class IGESSelect_IGESName extends IFSelect_Signature

  constructor

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_IGESTypeForm: declare class IGESSelect_IGESTypeForm extends IFSelect_Signature

  constructor

  SetForm(withform: boolean): void;

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_ModelModifier: declare class IGESSelect_ModelModifier extends IFSelect_Modifier

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_RebuildDrawings: declare class IGESSelect_RebuildDrawings extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_RebuildGroups: declare class IGESSelect_RebuildGroups extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_RemoveCurves: declare class IGESSelect_RemoveCurves extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectBypassGroup: declare class IGESSelect_SelectBypassGroup extends IFSelect_SelectExplore

  constructor

  ExploreLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectBypassSubfigure: declare class IGESSelect_SelectBypassSubfigure extends IFSelect_SelectExplore

  constructor

  ExploreLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectDrawingFrom: declare class IGESSelect_SelectDrawingFrom extends IFSelect_SelectDeduct

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectFaces: declare class IGESSelect_SelectFaces extends IFSelect_SelectExplore

  constructor

  ExploreLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectFromDrawing: declare class IGESSelect_SelectFromDrawing extends IFSelect_SelectDeduct

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectFromSingleView: declare class IGESSelect_SelectFromSingleView extends IFSelect_SelectDeduct

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectLevelNumber: declare class IGESSelect_SelectLevelNumber extends IFSelect_SelectExtract

  constructor

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectName: declare class IGESSelect_SelectName extends IFSelect_SelectExtract

  constructor

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  SetName(name: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectPCurves: declare class IGESSelect_SelectPCurves extends IFSelect_SelectExplore

  constructor

  ExploreLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectSingleViewFrom: declare class IGESSelect_SelectSingleViewFrom extends IFSelect_SelectDeduct

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectSubordinate: declare class IGESSelect_SelectSubordinate extends IFSelect_SelectExtract

  constructor

  Status(): number;

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SelectVisibleStatus: declare class IGESSelect_SelectVisibleStatus extends IFSelect_SelectExtract

  constructor

  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  ExtractLabel(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SetGlobalParameter: declare class IGESSelect_SetGlobalParameter extends IGESSelect_ModelModifier

  constructor

  GlobalNumber(): number;

  SetValue(text: TCollection_HAsciiString): void;

  Value(): TCollection_HAsciiString;

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SetLabel: declare class IGESSelect_SetLabel extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SetVersion5: declare class IGESSelect_SetVersion5 extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SignColor: declare class IGESSelect_SignColor extends IFSelect_Signature

  constructor

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SignLevelNumber: declare class IGESSelect_SignLevelNumber extends IFSelect_Signature

  constructor

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SignStatus: declare class IGESSelect_SignStatus extends IFSelect_Signature

  constructor

  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_SplineToBSpline: declare class IGESSelect_SplineToBSpline extends IFSelect_Transformer

  constructor

  OptionTryC2(): boolean;

  Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_UpdateCreationDate: declare class IGESSelect_UpdateCreationDate extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_UpdateFileName: declare class IGESSelect_UpdateFileName extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_UpdateLastChange: declare class IGESSelect_UpdateLastChange extends IGESSelect_ModelModifier

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_ViewSorter: declare class IGESSelect_ViewSorter extends Standard_Transient

  constructor

  SetModel(model: IGESData_IGESModel): void;

  Clear(): void;

  Add(ent: Standard_Transient): boolean;

  AddEntity(igesent: IGESData_IGESEntity): boolean;

  AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

  AddModel(model: Interface_InterfaceModel): void;

  NbEntities(): number;

  SortSingleViews(alsoframes: boolean): void;

  NbSets(final: boolean): number;

  SetItem(num: number, final: boolean): IGESData_IGESEntity;

  Sets(final: boolean): IFSelect_PacketList;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESSelect_WorkLibrary: declare class IGESSelect_WorkLibrary extends IFSelect_WorkLibrary

  constructor

  ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

  WriteFile(ctx: IFSelect_ContextWrite): boolean;

  static DefineProtocol(): IGESData_Protocol;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
