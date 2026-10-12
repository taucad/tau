# libcascade — XCAFView

2 top-level symbols. Signatures are verbatim typescript.

XCAFView_Object: declare class XCAFView_Object extends Standard_Transient

  // XCAFView_Object.constructor (constructor)
  constructor();
  constructor(theObj: XCAFView_Object);

  // XCAFView_Object.SetName (method)
  SetName(theName: TCollection_HAsciiString): void;

  // XCAFView_Object.Name (method)
  Name(): TCollection_HAsciiString;

  // XCAFView_Object.SetType (method)
  SetType(theType: XCAFView_ProjectionType): void;

  // XCAFView_Object.Type (method)
  Type(): XCAFView_ProjectionType;

  // XCAFView_Object.SetProjectionPoint (method)
  SetProjectionPoint(thePoint: gp_Pnt): void;

  // XCAFView_Object.ProjectionPoint (method)
  ProjectionPoint(): gp_Pnt;

  // XCAFView_Object.SetViewDirection (method)
  SetViewDirection(theDirection: gp_Dir): void;

  // XCAFView_Object.ViewDirection (method)
  ViewDirection(): gp_Dir;

  // XCAFView_Object.SetUpDirection (method)
  SetUpDirection(theDirection: gp_Dir): void;

  // XCAFView_Object.UpDirection (method)
  UpDirection(): gp_Dir;

  // XCAFView_Object.SetZoomFactor (method)
  SetZoomFactor(theZoomFactor: number): void;

  // XCAFView_Object.ZoomFactor (method)
  ZoomFactor(): number;

  // XCAFView_Object.SetWindowHorizontalSize (method)
  SetWindowHorizontalSize(theSize: number): void;

  // XCAFView_Object.WindowHorizontalSize (method)
  WindowHorizontalSize(): number;

  // XCAFView_Object.SetWindowVerticalSize (method)
  SetWindowVerticalSize(theSize: number): void;

  // XCAFView_Object.WindowVerticalSize (method)
  WindowVerticalSize(): number;

  // XCAFView_Object.SetClippingExpression (method)
  SetClippingExpression(theExpression: TCollection_HAsciiString): void;

  // XCAFView_Object.ClippingExpression (method)
  ClippingExpression(): TCollection_HAsciiString;

  // XCAFView_Object.UnsetFrontPlaneClipping (method)
  UnsetFrontPlaneClipping(): void;

  // XCAFView_Object.HasFrontPlaneClipping (method)
  HasFrontPlaneClipping(): boolean;

  // XCAFView_Object.SetFrontPlaneDistance (method)
  SetFrontPlaneDistance(theDistance: number): void;

  // XCAFView_Object.FrontPlaneDistance (method)
  FrontPlaneDistance(): number;

  // XCAFView_Object.UnsetBackPlaneClipping (method)
  UnsetBackPlaneClipping(): void;

  // XCAFView_Object.HasBackPlaneClipping (method)
  HasBackPlaneClipping(): boolean;

  // XCAFView_Object.SetBackPlaneDistance (method)
  SetBackPlaneDistance(theDistance: number): void;

  // XCAFView_Object.BackPlaneDistance (method)
  BackPlaneDistance(): number;

  // XCAFView_Object.SetViewVolumeSidesClipping (method)
  SetViewVolumeSidesClipping(theViewVolumeSidesClipping: boolean): void;

  // XCAFView_Object.HasViewVolumeSidesClipping (method)
  HasViewVolumeSidesClipping(): boolean;

  // XCAFView_Object.CreateGDTPoints (method)
  CreateGDTPoints(theLenght: number): void;

  // XCAFView_Object.HasGDTPoints (method)
  HasGDTPoints(): boolean;

  // XCAFView_Object.NbGDTPoints (method)
  NbGDTPoints(): number;

  // XCAFView_Object.SetGDTPoint (method)
  SetGDTPoint(theIndex: number, thePoint: gp_Pnt): void;

  // XCAFView_Object.GDTPoint (method)
  GDTPoint(theIndex: number): gp_Pnt;

  // XCAFView_Object.get_type_name (method)
  static get_type_name(): string;

  // XCAFView_Object.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFView_Object.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFView_Object.delete (method)
  delete(): void;

  // XCAFView_Object.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFView_ProjectionType: typeof XCAFView_ProjectionType[keyof typeof XCAFView_ProjectionType]

  readonly XCAFView_ProjectionType_NoCamera: 'XCAFView_ProjectionType_NoCamera'

  readonly XCAFView_ProjectionType_Parallel: 'XCAFView_ProjectionType_Parallel'

  readonly XCAFView_ProjectionType_Central: 'XCAFView_ProjectionType_Central'
