# libcascade — IGESDraw (2)

6 top-level symbols. Signatures are verbatim typescript.

IGESDraw_ViewsVisible: declare class IGESDraw_ViewsVisible extends IGESData_ViewKindEntity

  // IGESDraw_ViewsVisible.constructor (constructor)
  constructor();

  // IGESDraw_ViewsVisible.Init (method)
  Init(allViewEntities: NCollection_HArray1_handle_IGESData_ViewKindEntity, allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDraw_ViewsVisible.InitImplied (method)
  InitImplied(allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDraw_ViewsVisible.IsSingle (method)
  IsSingle(): boolean;

  // IGESDraw_ViewsVisible.NbViews (method)
  NbViews(): number;

  // IGESDraw_ViewsVisible.NbDisplayedEntities (method)
  NbDisplayedEntities(): number;

  // IGESDraw_ViewsVisible.ViewItem (method)
  ViewItem(num: number): IGESData_ViewKindEntity;

  // IGESDraw_ViewsVisible.DisplayedEntity (method)
  DisplayedEntity(Index: number): IGESData_IGESEntity;

  // IGESDraw_ViewsVisible.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_ViewsVisible.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_ViewsVisible.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_ViewsVisible.delete (method)
  delete(): void;

  // IGESDraw_ViewsVisible.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ViewsVisibleWithAttr: declare class IGESDraw_ViewsVisibleWithAttr extends IGESData_ViewKindEntity

  // IGESDraw_ViewsVisibleWithAttr.constructor (constructor)
  constructor();

  // IGESDraw_ViewsVisibleWithAttr.Init (method)
  Init(allViewEntities: NCollection_HArray1_handle_IGESData_ViewKindEntity, allLineFonts: NCollection_HArray1_int, allLineDefinitions: NCollection_HArray1_handle_IGESData_LineFontEntity, allColorValues: NCollection_HArray1_int, allColorDefinitions: NCollection_HArray1_handle_IGESGraph_Color, allLineWeights: NCollection_HArray1_int, allDisplayEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDraw_ViewsVisibleWithAttr.InitImplied (method)
  InitImplied(allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDraw_ViewsVisibleWithAttr.IsSingle (method)
  IsSingle(): boolean;

  // IGESDraw_ViewsVisibleWithAttr.NbViews (method)
  NbViews(): number;

  // IGESDraw_ViewsVisibleWithAttr.NbDisplayedEntities (method)
  NbDisplayedEntities(): number;

  // IGESDraw_ViewsVisibleWithAttr.ViewItem (method)
  ViewItem(num: number): IGESData_ViewKindEntity;

  // IGESDraw_ViewsVisibleWithAttr.LineFontValue (method)
  LineFontValue(Index: number): number;

  // IGESDraw_ViewsVisibleWithAttr.IsFontDefinition (method)
  IsFontDefinition(Index: number): boolean;

  // IGESDraw_ViewsVisibleWithAttr.FontDefinition (method)
  FontDefinition(Index: number): IGESData_LineFontEntity;

  // IGESDraw_ViewsVisibleWithAttr.ColorValue (method)
  ColorValue(Index: number): number;

  // IGESDraw_ViewsVisibleWithAttr.IsColorDefinition (method)
  IsColorDefinition(Index: number): boolean;

  // IGESDraw_ViewsVisibleWithAttr.ColorDefinition (method)
  ColorDefinition(Index: number): IGESGraph_Color;

  // IGESDraw_ViewsVisibleWithAttr.LineWeightItem (method)
  LineWeightItem(Index: number): number;

  // IGESDraw_ViewsVisibleWithAttr.DisplayedEntity (method)
  DisplayedEntity(Index: number): IGESData_IGESEntity;

  // IGESDraw_ViewsVisibleWithAttr.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_ViewsVisibleWithAttr.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_ViewsVisibleWithAttr.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_ViewsVisibleWithAttr.delete (method)
  delete(): void;

  // IGESDraw_ViewsVisibleWithAttr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_Array1OfConnectPoint: NCollection_Array1_handle_IGESDraw_ConnectPoint

IGESDraw_Array1OfViewKindEntity: NCollection_Array1_handle_IGESData_ViewKindEntity

IGESDraw_HArray1OfConnectPoint: NCollection_HArray1_handle_IGESDraw_ConnectPoint

IGESDraw_HArray1OfViewKindEntity: NCollection_HArray1_handle_IGESData_ViewKindEntity
