# libcascade — IGESSelect

46 top-level symbols. Signatures are verbatim typescript.

IGESSelect: declare class IGESSelect

  // IGESSelect.constructor (constructor)
  constructor();

  // IGESSelect.Run (method)
  static Run(): void;

  // IGESSelect.delete (method)
  delete(): void;

  // IGESSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_Activator: declare class IGESSelect_Activator extends IFSelect_Activator

  // IGESSelect_Activator.constructor (constructor)
  constructor();

  // IGESSelect_Activator.Do (method)
  Do(number_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

  // IGESSelect_Activator.Help (method)
  Help(number_: number): string;

  // IGESSelect_Activator.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_Activator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_Activator.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_Activator.delete (method)
  delete(): void;

  // IGESSelect_Activator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_AddFileComment: declare class IGESSelect_AddFileComment extends IGESSelect_FileModifier

  // IGESSelect_AddFileComment.constructor (constructor)
  constructor();

  // IGESSelect_AddFileComment.Clear (method)
  Clear(): void;

  // IGESSelect_AddFileComment.AddLine (method)
  AddLine(line: string): void;

  // IGESSelect_AddFileComment.AddLines (method)
  AddLines(lines: NCollection_HSequence_handle_TCollection_HAsciiString): void;

  // IGESSelect_AddFileComment.NbLines (method)
  NbLines(): number;

  // IGESSelect_AddFileComment.Line (method)
  Line(num: number): string;

  // IGESSelect_AddFileComment.Lines (method)
  Lines(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // IGESSelect_AddFileComment.Perform (method)
  Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;

  // IGESSelect_AddFileComment.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_AddFileComment.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_AddFileComment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_AddFileComment.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_AddFileComment.delete (method)
  delete(): void;

  // IGESSelect_AddFileComment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_AddGroup: declare class IGESSelect_AddGroup extends IGESSelect_ModelModifier

  // IGESSelect_AddGroup.constructor (constructor)
  constructor();

  // IGESSelect_AddGroup.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_AddGroup.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_AddGroup.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_AddGroup.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_AddGroup.delete (method)
  delete(): void;

  // IGESSelect_AddGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_AutoCorrect: declare class IGESSelect_AutoCorrect extends IGESSelect_ModelModifier

  // IGESSelect_AutoCorrect.constructor (constructor)
  constructor();

  // IGESSelect_AutoCorrect.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_AutoCorrect.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_AutoCorrect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_AutoCorrect.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_AutoCorrect.delete (method)
  delete(): void;

  // IGESSelect_AutoCorrect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_ChangeLevelList: declare class IGESSelect_ChangeLevelList extends IGESSelect_ModelModifier

  // IGESSelect_ChangeLevelList.constructor (constructor)
  constructor();

  // IGESSelect_ChangeLevelList.HasOldNumber (method)
  HasOldNumber(): boolean;

  // IGESSelect_ChangeLevelList.HasNewNumber (method)
  HasNewNumber(): boolean;

  // IGESSelect_ChangeLevelList.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_ChangeLevelList.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_ChangeLevelList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_ChangeLevelList.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_ChangeLevelList.delete (method)
  delete(): void;

  // IGESSelect_ChangeLevelList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_ChangeLevelNumber: declare class IGESSelect_ChangeLevelNumber extends IGESSelect_ModelModifier

  // IGESSelect_ChangeLevelNumber.constructor (constructor)
  constructor();

  // IGESSelect_ChangeLevelNumber.HasOldNumber (method)
  HasOldNumber(): boolean;

  // IGESSelect_ChangeLevelNumber.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_ChangeLevelNumber.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_ChangeLevelNumber.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_ChangeLevelNumber.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_ChangeLevelNumber.delete (method)
  delete(): void;

  // IGESSelect_ChangeLevelNumber.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_ComputeStatus: declare class IGESSelect_ComputeStatus extends IGESSelect_ModelModifier

  // IGESSelect_ComputeStatus.constructor (constructor)
  constructor();

  // IGESSelect_ComputeStatus.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_ComputeStatus.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_ComputeStatus.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_ComputeStatus.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_ComputeStatus.delete (method)
  delete(): void;

  // IGESSelect_ComputeStatus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_CounterOfLevelNumber: declare class IGESSelect_CounterOfLevelNumber extends IFSelect_SignCounter

  // IGESSelect_CounterOfLevelNumber.constructor (constructor)
  constructor(withmap?: boolean, withlist?: boolean);

  // IGESSelect_CounterOfLevelNumber.Clear (method)
  Clear(): void;

  // IGESSelect_CounterOfLevelNumber.AddSign (method)
  AddSign(ent: Standard_Transient, model: Interface_InterfaceModel): void;

  // IGESSelect_CounterOfLevelNumber.AddLevel (method)
  AddLevel(ent: Standard_Transient, level: number): void;

  // IGESSelect_CounterOfLevelNumber.HighestLevel (method)
  HighestLevel(): number;

  // IGESSelect_CounterOfLevelNumber.NbTimesLevel (method)
  NbTimesLevel(level: number): number;

  // IGESSelect_CounterOfLevelNumber.Levels (method)
  Levels(): NCollection_HSequence_int;

  // IGESSelect_CounterOfLevelNumber.Sign (method)
  Sign(ent: Standard_Transient, model: Interface_InterfaceModel): TCollection_HAsciiString;

  // IGESSelect_CounterOfLevelNumber.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_CounterOfLevelNumber.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_CounterOfLevelNumber.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_CounterOfLevelNumber.delete (method)
  delete(): void;

  // IGESSelect_CounterOfLevelNumber.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_DispPerDrawing: declare class IGESSelect_DispPerDrawing extends IFSelect_Dispatch

  // IGESSelect_DispPerDrawing.constructor (constructor)
  constructor();

  // IGESSelect_DispPerDrawing.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_DispPerDrawing.CanHaveRemainder (method)
  CanHaveRemainder(): boolean;

  // IGESSelect_DispPerDrawing.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_DispPerDrawing.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_DispPerDrawing.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_DispPerDrawing.delete (method)
  delete(): void;

  // IGESSelect_DispPerDrawing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_DispPerSingleView: declare class IGESSelect_DispPerSingleView extends IFSelect_Dispatch

  // IGESSelect_DispPerSingleView.constructor (constructor)
  constructor();

  // IGESSelect_DispPerSingleView.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_DispPerSingleView.CanHaveRemainder (method)
  CanHaveRemainder(): boolean;

  // IGESSelect_DispPerSingleView.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_DispPerSingleView.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_DispPerSingleView.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_DispPerSingleView.delete (method)
  delete(): void;

  // IGESSelect_DispPerSingleView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_Dumper: declare class IGESSelect_Dumper extends IFSelect_SessionDumper

  // IGESSelect_Dumper.constructor (constructor)
  constructor();

  // IGESSelect_Dumper.WriteOwn (method)
  WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

  // IGESSelect_Dumper.ReadOwn (method)
  ReadOwn(file: IFSelect_SessionFile, type_: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

  // IGESSelect_Dumper.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_Dumper.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_Dumper.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_Dumper.delete (method)
  delete(): void;

  // IGESSelect_Dumper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_EditDirPart: declare class IGESSelect_EditDirPart extends IFSelect_Editor

  // IGESSelect_EditDirPart.constructor (constructor)
  constructor();

  // IGESSelect_EditDirPart.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_EditDirPart.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_EditDirPart.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_EditDirPart.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_EditDirPart.delete (method)
  delete(): void;

  // IGESSelect_EditDirPart.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_EditHeader: declare class IGESSelect_EditHeader extends IFSelect_Editor

  // IGESSelect_EditHeader.constructor (constructor)
  constructor();

  // IGESSelect_EditHeader.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_EditHeader.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_EditHeader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_EditHeader.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_EditHeader.delete (method)
  delete(): void;

  // IGESSelect_EditHeader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_FileModifier: declare class IGESSelect_FileModifier extends IFSelect_GeneralModifier

  // IGESSelect_FileModifier.Perform (method)
  Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;

  // IGESSelect_FileModifier.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_FileModifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_FileModifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_FileModifier.delete (method)
  delete(): void;

  // IGESSelect_FileModifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_FloatFormat: declare class IGESSelect_FloatFormat extends IGESSelect_FileModifier

  // IGESSelect_FloatFormat.constructor (constructor)
  constructor();

  // IGESSelect_FloatFormat.SetDefault (method)
  SetDefault(digits?: number): void;

  // IGESSelect_FloatFormat.SetZeroSuppress (method)
  SetZeroSuppress(mode: boolean): void;

  // IGESSelect_FloatFormat.SetFormat (method)
  SetFormat(format?: string): void;

  // IGESSelect_FloatFormat.SetFormatForRange (method)
  SetFormatForRange(format?: string, Rmin?: number, Rmax?: number): void;

  // IGESSelect_FloatFormat.Format (method)
  Format(zerosup: boolean, mainform: TCollection_AsciiString, hasrange: boolean, forminrange: TCollection_AsciiString, rangemin?: number, rangemax?: number): { zerosup: boolean; hasrange: boolean; rangemin: number; rangemax: number };

  // IGESSelect_FloatFormat.Perform (method)
  Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;

  // IGESSelect_FloatFormat.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_FloatFormat.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_FloatFormat.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_FloatFormat.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_FloatFormat.delete (method)
  delete(): void;

  // IGESSelect_FloatFormat.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_IGESName: declare class IGESSelect_IGESName extends IFSelect_Signature

  // IGESSelect_IGESName.constructor (constructor)
  constructor();

  // IGESSelect_IGESName.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IGESSelect_IGESName.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_IGESName.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_IGESName.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_IGESName.delete (method)
  delete(): void;

  // IGESSelect_IGESName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_IGESTypeForm: declare class IGESSelect_IGESTypeForm extends IFSelect_Signature

  // IGESSelect_IGESTypeForm.constructor (constructor)
  constructor(withform?: boolean);

  // IGESSelect_IGESTypeForm.SetForm (method)
  SetForm(withform: boolean): void;

  // IGESSelect_IGESTypeForm.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IGESSelect_IGESTypeForm.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_IGESTypeForm.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_IGESTypeForm.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_IGESTypeForm.delete (method)
  delete(): void;

  // IGESSelect_IGESTypeForm.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_ModelModifier: declare class IGESSelect_ModelModifier extends IFSelect_Modifier

  // IGESSelect_ModelModifier.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_ModelModifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_ModelModifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_ModelModifier.delete (method)
  delete(): void;

  // IGESSelect_ModelModifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_RebuildDrawings: declare class IGESSelect_RebuildDrawings extends IGESSelect_ModelModifier

  // IGESSelect_RebuildDrawings.constructor (constructor)
  constructor();

  // IGESSelect_RebuildDrawings.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_RebuildDrawings.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_RebuildDrawings.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_RebuildDrawings.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_RebuildDrawings.delete (method)
  delete(): void;

  // IGESSelect_RebuildDrawings.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_RebuildGroups: declare class IGESSelect_RebuildGroups extends IGESSelect_ModelModifier

  // IGESSelect_RebuildGroups.constructor (constructor)
  constructor();

  // IGESSelect_RebuildGroups.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_RebuildGroups.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_RebuildGroups.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_RebuildGroups.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_RebuildGroups.delete (method)
  delete(): void;

  // IGESSelect_RebuildGroups.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_RemoveCurves: declare class IGESSelect_RemoveCurves extends IGESSelect_ModelModifier

  // IGESSelect_RemoveCurves.constructor (constructor)
  constructor(UV: boolean);

  // IGESSelect_RemoveCurves.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_RemoveCurves.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_RemoveCurves.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_RemoveCurves.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_RemoveCurves.delete (method)
  delete(): void;

  // IGESSelect_RemoveCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectBypassGroup: declare class IGESSelect_SelectBypassGroup extends IFSelect_SelectExplore

  // IGESSelect_SelectBypassGroup.constructor (constructor)
  constructor(level?: number);

  // IGESSelect_SelectBypassGroup.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // IGESSelect_SelectBypassGroup.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectBypassGroup.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectBypassGroup.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectBypassGroup.delete (method)
  delete(): void;

  // IGESSelect_SelectBypassGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectBypassSubfigure: declare class IGESSelect_SelectBypassSubfigure extends IFSelect_SelectExplore

  // IGESSelect_SelectBypassSubfigure.constructor (constructor)
  constructor(level?: number);

  // IGESSelect_SelectBypassSubfigure.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // IGESSelect_SelectBypassSubfigure.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectBypassSubfigure.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectBypassSubfigure.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectBypassSubfigure.delete (method)
  delete(): void;

  // IGESSelect_SelectBypassSubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectDrawingFrom: declare class IGESSelect_SelectDrawingFrom extends IFSelect_SelectDeduct

  // IGESSelect_SelectDrawingFrom.constructor (constructor)
  constructor();

  // IGESSelect_SelectDrawingFrom.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_SelectDrawingFrom.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectDrawingFrom.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectDrawingFrom.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectDrawingFrom.delete (method)
  delete(): void;

  // IGESSelect_SelectDrawingFrom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectFaces: declare class IGESSelect_SelectFaces extends IFSelect_SelectExplore

  // IGESSelect_SelectFaces.constructor (constructor)
  constructor();

  // IGESSelect_SelectFaces.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // IGESSelect_SelectFaces.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectFaces.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectFaces.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectFaces.delete (method)
  delete(): void;

  // IGESSelect_SelectFaces.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectFromDrawing: declare class IGESSelect_SelectFromDrawing extends IFSelect_SelectDeduct

  // IGESSelect_SelectFromDrawing.constructor (constructor)
  constructor();

  // IGESSelect_SelectFromDrawing.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_SelectFromDrawing.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectFromDrawing.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectFromDrawing.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectFromDrawing.delete (method)
  delete(): void;

  // IGESSelect_SelectFromDrawing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectFromSingleView: declare class IGESSelect_SelectFromSingleView extends IFSelect_SelectDeduct

  // IGESSelect_SelectFromSingleView.constructor (constructor)
  constructor();

  // IGESSelect_SelectFromSingleView.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_SelectFromSingleView.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectFromSingleView.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectFromSingleView.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectFromSingleView.delete (method)
  delete(): void;

  // IGESSelect_SelectFromSingleView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectLevelNumber: declare class IGESSelect_SelectLevelNumber extends IFSelect_SelectExtract

  // IGESSelect_SelectLevelNumber.constructor (constructor)
  constructor();

  // IGESSelect_SelectLevelNumber.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IGESSelect_SelectLevelNumber.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IGESSelect_SelectLevelNumber.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectLevelNumber.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectLevelNumber.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectLevelNumber.delete (method)
  delete(): void;

  // IGESSelect_SelectLevelNumber.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectName: declare class IGESSelect_SelectName extends IFSelect_SelectExtract

  // IGESSelect_SelectName.constructor (constructor)
  constructor();

  // IGESSelect_SelectName.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IGESSelect_SelectName.SetName (method)
  SetName(name: TCollection_HAsciiString): void;

  // IGESSelect_SelectName.Name (method)
  Name(): TCollection_HAsciiString;

  // IGESSelect_SelectName.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IGESSelect_SelectName.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectName.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectName.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectName.delete (method)
  delete(): void;

  // IGESSelect_SelectName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectPCurves: declare class IGESSelect_SelectPCurves extends IFSelect_SelectExplore

  // IGESSelect_SelectPCurves.constructor (constructor)
  constructor(basic: boolean);

  // IGESSelect_SelectPCurves.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // IGESSelect_SelectPCurves.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectPCurves.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectPCurves.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectPCurves.delete (method)
  delete(): void;

  // IGESSelect_SelectPCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectSingleViewFrom: declare class IGESSelect_SelectSingleViewFrom extends IFSelect_SelectDeduct

  // IGESSelect_SelectSingleViewFrom.constructor (constructor)
  constructor();

  // IGESSelect_SelectSingleViewFrom.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_SelectSingleViewFrom.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectSingleViewFrom.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectSingleViewFrom.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectSingleViewFrom.delete (method)
  delete(): void;

  // IGESSelect_SelectSingleViewFrom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectSubordinate: declare class IGESSelect_SelectSubordinate extends IFSelect_SelectExtract

  // IGESSelect_SelectSubordinate.constructor (constructor)
  constructor(status: number);

  // IGESSelect_SelectSubordinate.Status (method)
  Status(): number;

  // IGESSelect_SelectSubordinate.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IGESSelect_SelectSubordinate.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IGESSelect_SelectSubordinate.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectSubordinate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectSubordinate.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectSubordinate.delete (method)
  delete(): void;

  // IGESSelect_SelectSubordinate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SelectVisibleStatus: declare class IGESSelect_SelectVisibleStatus extends IFSelect_SelectExtract

  // IGESSelect_SelectVisibleStatus.constructor (constructor)
  constructor();

  // IGESSelect_SelectVisibleStatus.Sort (method)
  Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

  // IGESSelect_SelectVisibleStatus.ExtractLabel (method)
  ExtractLabel(): TCollection_AsciiString;

  // IGESSelect_SelectVisibleStatus.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SelectVisibleStatus.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SelectVisibleStatus.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SelectVisibleStatus.delete (method)
  delete(): void;

  // IGESSelect_SelectVisibleStatus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SetGlobalParameter: declare class IGESSelect_SetGlobalParameter extends IGESSelect_ModelModifier

  // IGESSelect_SetGlobalParameter.constructor (constructor)
  constructor(numpar: number);

  // IGESSelect_SetGlobalParameter.GlobalNumber (method)
  GlobalNumber(): number;

  // IGESSelect_SetGlobalParameter.SetValue (method)
  SetValue(text: TCollection_HAsciiString): void;

  // IGESSelect_SetGlobalParameter.Value (method)
  Value(): TCollection_HAsciiString;

  // IGESSelect_SetGlobalParameter.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_SetGlobalParameter.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SetGlobalParameter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SetGlobalParameter.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SetGlobalParameter.delete (method)
  delete(): void;

  // IGESSelect_SetGlobalParameter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SetLabel: declare class IGESSelect_SetLabel extends IGESSelect_ModelModifier

  // IGESSelect_SetLabel.constructor (constructor)
  constructor(mode: number, enforce: boolean);

  // IGESSelect_SetLabel.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_SetLabel.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SetLabel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SetLabel.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SetLabel.delete (method)
  delete(): void;

  // IGESSelect_SetLabel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SetVersion5: declare class IGESSelect_SetVersion5 extends IGESSelect_ModelModifier

  // IGESSelect_SetVersion5.constructor (constructor)
  constructor();

  // IGESSelect_SetVersion5.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_SetVersion5.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SetVersion5.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SetVersion5.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SetVersion5.delete (method)
  delete(): void;

  // IGESSelect_SetVersion5.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SignColor: declare class IGESSelect_SignColor extends IFSelect_Signature

  // IGESSelect_SignColor.constructor (constructor)
  constructor(mode: number);

  // IGESSelect_SignColor.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IGESSelect_SignColor.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SignColor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SignColor.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SignColor.delete (method)
  delete(): void;

  // IGESSelect_SignColor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SignLevelNumber: declare class IGESSelect_SignLevelNumber extends IFSelect_Signature

  // IGESSelect_SignLevelNumber.constructor (constructor)
  constructor(countmode: boolean);

  // IGESSelect_SignLevelNumber.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IGESSelect_SignLevelNumber.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SignLevelNumber.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SignLevelNumber.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SignLevelNumber.delete (method)
  delete(): void;

  // IGESSelect_SignLevelNumber.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SignStatus: declare class IGESSelect_SignStatus extends IFSelect_Signature

  // IGESSelect_SignStatus.constructor (constructor)
  constructor();

  // IGESSelect_SignStatus.Value (method)
  Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

  // IGESSelect_SignStatus.Matches (method)
  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  // IGESSelect_SignStatus.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SignStatus.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SignStatus.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SignStatus.delete (method)
  delete(): void;

  // IGESSelect_SignStatus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_SplineToBSpline: declare class IGESSelect_SplineToBSpline extends IFSelect_Transformer

  // IGESSelect_SplineToBSpline.constructor (constructor)
  constructor(tryC2: boolean);

  // IGESSelect_SplineToBSpline.OptionTryC2 (method)
  OptionTryC2(): boolean;

  // IGESSelect_SplineToBSpline.Updated (method)
  Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESSelect_SplineToBSpline.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_SplineToBSpline.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_SplineToBSpline.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_SplineToBSpline.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_SplineToBSpline.delete (method)
  delete(): void;

  // IGESSelect_SplineToBSpline.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_UpdateCreationDate: declare class IGESSelect_UpdateCreationDate extends IGESSelect_ModelModifier

  // IGESSelect_UpdateCreationDate.constructor (constructor)
  constructor();

  // IGESSelect_UpdateCreationDate.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_UpdateCreationDate.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_UpdateCreationDate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_UpdateCreationDate.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_UpdateCreationDate.delete (method)
  delete(): void;

  // IGESSelect_UpdateCreationDate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_UpdateFileName: declare class IGESSelect_UpdateFileName extends IGESSelect_ModelModifier

  // IGESSelect_UpdateFileName.constructor (constructor)
  constructor();

  // IGESSelect_UpdateFileName.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_UpdateFileName.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_UpdateFileName.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_UpdateFileName.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_UpdateFileName.delete (method)
  delete(): void;

  // IGESSelect_UpdateFileName.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_UpdateLastChange: declare class IGESSelect_UpdateLastChange extends IGESSelect_ModelModifier

  // IGESSelect_UpdateLastChange.constructor (constructor)
  constructor();

  // IGESSelect_UpdateLastChange.Label (method)
  Label(): TCollection_AsciiString;

  // IGESSelect_UpdateLastChange.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_UpdateLastChange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_UpdateLastChange.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_UpdateLastChange.delete (method)
  delete(): void;

  // IGESSelect_UpdateLastChange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_ViewSorter: declare class IGESSelect_ViewSorter extends Standard_Transient

  // IGESSelect_ViewSorter.constructor (constructor)
  constructor();

  // IGESSelect_ViewSorter.SetModel (method)
  SetModel(model: IGESData_IGESModel): void;

  // IGESSelect_ViewSorter.Clear (method)
  Clear(): void;

  // IGESSelect_ViewSorter.Add (method)
  Add(ent: Standard_Transient): boolean;

  // IGESSelect_ViewSorter.AddEntity (method)
  AddEntity(igesent: IGESData_IGESEntity): boolean;

  // IGESSelect_ViewSorter.AddList (method)
  AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

  // IGESSelect_ViewSorter.AddModel (method)
  AddModel(model: Interface_InterfaceModel): void;

  // IGESSelect_ViewSorter.NbEntities (method)
  NbEntities(): number;

  // IGESSelect_ViewSorter.SortSingleViews (method)
  SortSingleViews(alsoframes: boolean): void;

  // IGESSelect_ViewSorter.NbSets (method)
  NbSets(final: boolean): number;

  // IGESSelect_ViewSorter.SetItem (method)
  SetItem(num: number, final: boolean): IGESData_IGESEntity;

  // IGESSelect_ViewSorter.Sets (method)
  Sets(final: boolean): IFSelect_PacketList;

  // IGESSelect_ViewSorter.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_ViewSorter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_ViewSorter.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_ViewSorter.delete (method)
  delete(): void;

  // IGESSelect_ViewSorter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESSelect_WorkLibrary: declare class IGESSelect_WorkLibrary extends IFSelect_WorkLibrary

  // IGESSelect_WorkLibrary.constructor (constructor)
  constructor(modefnes?: boolean);

  // IGESSelect_WorkLibrary.ReadFile (method)
  ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

  // IGESSelect_WorkLibrary.WriteFile (method)
  WriteFile(ctx: IFSelect_ContextWrite): boolean;

  // IGESSelect_WorkLibrary.DefineProtocol (method)
  static DefineProtocol(): IGESData_Protocol;

  // IGESSelect_WorkLibrary.get_type_name (method)
  static get_type_name(): string;

  // IGESSelect_WorkLibrary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESSelect_WorkLibrary.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESSelect_WorkLibrary.delete (method)
  delete(): void;

  // IGESSelect_WorkLibrary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
