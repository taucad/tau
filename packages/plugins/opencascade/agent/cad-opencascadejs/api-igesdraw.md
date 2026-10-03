# libcascade — IGESDraw

31 top-level symbols. Signatures are verbatim typescript.

IGESDraw: declare class IGESDraw

  // IGESDraw.constructor (constructor)
  constructor();

  // IGESDraw.Init (method)
  static Init(): void;

  // IGESDraw.Protocol (method)
  static Protocol(): IGESDraw_Protocol;

  // IGESDraw.delete (method)
  delete(): void;

  // IGESDraw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_CircArraySubfigure: declare class IGESDraw_CircArraySubfigure extends IGESData_IGESEntity

  // IGESDraw_CircArraySubfigure.constructor (constructor)
  constructor();

  // IGESDraw_CircArraySubfigure.Init (method)
  Init(aBase: IGESData_IGESEntity, aNumLocs: number, aCenter: gp_XYZ, aRadius: number, aStAngle: number, aDelAngle: number, aFlag: number, allNumPos: NCollection_HArray1_int): void;

  // IGESDraw_CircArraySubfigure.BaseEntity (method)
  BaseEntity(): IGESData_IGESEntity;

  // IGESDraw_CircArraySubfigure.NbLocations (method)
  NbLocations(): number;

  // IGESDraw_CircArraySubfigure.CenterPoint (method)
  CenterPoint(): gp_Pnt;

  // IGESDraw_CircArraySubfigure.TransformedCenterPoint (method)
  TransformedCenterPoint(): gp_Pnt;

  // IGESDraw_CircArraySubfigure.CircleRadius (method)
  CircleRadius(): number;

  // IGESDraw_CircArraySubfigure.StartAngle (method)
  StartAngle(): number;

  // IGESDraw_CircArraySubfigure.DeltaAngle (method)
  DeltaAngle(): number;

  // IGESDraw_CircArraySubfigure.ListCount (method)
  ListCount(): number;

  // IGESDraw_CircArraySubfigure.DisplayFlag (method)
  DisplayFlag(): boolean;

  // IGESDraw_CircArraySubfigure.DoDontFlag (method)
  DoDontFlag(): boolean;

  // IGESDraw_CircArraySubfigure.PositionNum (method)
  PositionNum(Index: number): boolean;

  // IGESDraw_CircArraySubfigure.ListPosition (method)
  ListPosition(Index: number): number;

  // IGESDraw_CircArraySubfigure.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_CircArraySubfigure.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_CircArraySubfigure.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_CircArraySubfigure.delete (method)
  delete(): void;

  // IGESDraw_CircArraySubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ConnectPoint: declare class IGESDraw_ConnectPoint extends IGESData_IGESEntity

  // IGESDraw_ConnectPoint.constructor (constructor)
  constructor();

  // IGESDraw_ConnectPoint.Init (method)
  Init(aPoint: gp_XYZ, aDisplaySymbol: IGESData_IGESEntity, aTypeFlag: number, aFunctionFlag: number, aFunctionIdentifier: TCollection_HAsciiString, anIdentifierTemplate: IGESGraph_TextDisplayTemplate, aFunctionName: TCollection_HAsciiString, aFunctionTemplate: IGESGraph_TextDisplayTemplate, aPointIdentifier: number, aFunctionCode: number, aSwapFlag: number, anOwnerSubfigure: IGESData_IGESEntity): void;

  // IGESDraw_ConnectPoint.Point (method)
  Point(): gp_Pnt;

  // IGESDraw_ConnectPoint.TransformedPoint (method)
  TransformedPoint(): gp_Pnt;

  // IGESDraw_ConnectPoint.HasDisplaySymbol (method)
  HasDisplaySymbol(): boolean;

  // IGESDraw_ConnectPoint.DisplaySymbol (method)
  DisplaySymbol(): IGESData_IGESEntity;

  // IGESDraw_ConnectPoint.TypeFlag (method)
  TypeFlag(): number;

  // IGESDraw_ConnectPoint.FunctionFlag (method)
  FunctionFlag(): number;

  // IGESDraw_ConnectPoint.FunctionIdentifier (method)
  FunctionIdentifier(): TCollection_HAsciiString;

  // IGESDraw_ConnectPoint.HasIdentifierTemplate (method)
  HasIdentifierTemplate(): boolean;

  // IGESDraw_ConnectPoint.IdentifierTemplate (method)
  IdentifierTemplate(): IGESGraph_TextDisplayTemplate;

  // IGESDraw_ConnectPoint.FunctionName (method)
  FunctionName(): TCollection_HAsciiString;

  // IGESDraw_ConnectPoint.HasFunctionTemplate (method)
  HasFunctionTemplate(): boolean;

  // IGESDraw_ConnectPoint.FunctionTemplate (method)
  FunctionTemplate(): IGESGraph_TextDisplayTemplate;

  // IGESDraw_ConnectPoint.PointIdentifier (method)
  PointIdentifier(): number;

  // IGESDraw_ConnectPoint.FunctionCode (method)
  FunctionCode(): number;

  // IGESDraw_ConnectPoint.SwapFlag (method)
  SwapFlag(): boolean;

  // IGESDraw_ConnectPoint.HasOwnerSubfigure (method)
  HasOwnerSubfigure(): boolean;

  // IGESDraw_ConnectPoint.OwnerSubfigure (method)
  OwnerSubfigure(): IGESData_IGESEntity;

  // IGESDraw_ConnectPoint.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_ConnectPoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_ConnectPoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_ConnectPoint.delete (method)
  delete(): void;

  // IGESDraw_ConnectPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_Drawing: declare class IGESDraw_Drawing extends IGESData_IGESEntity

  // IGESDraw_Drawing.constructor (constructor)
  constructor();

  // IGESDraw_Drawing.Init (method)
  Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allViewOrigins: NCollection_HArray1_gp_XY, allAnnotations: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDraw_Drawing.NbViews (method)
  NbViews(): number;

  // IGESDraw_Drawing.ViewItem (method)
  ViewItem(ViewIndex: number): IGESData_ViewKindEntity;

  // IGESDraw_Drawing.ViewOrigin (method)
  ViewOrigin(TViewIndex: number): gp_Pnt2d;

  // IGESDraw_Drawing.NbAnnotations (method)
  NbAnnotations(): number;

  // IGESDraw_Drawing.Annotation (method)
  Annotation(AnnotationIndex: number): IGESData_IGESEntity;

  // IGESDraw_Drawing.ViewToDrawing (method)
  ViewToDrawing(NumView: number, ViewCoords: gp_XYZ): gp_XY;

  // IGESDraw_Drawing.DrawingUnit (method)
  DrawingUnit(value?: number): { returnValue: boolean; value: number };

  // IGESDraw_Drawing.DrawingSize (method)
  DrawingSize(X?: number, Y?: number): { returnValue: boolean; X: number; Y: number };

  // IGESDraw_Drawing.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_Drawing.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_Drawing.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_Drawing.delete (method)
  delete(): void;

  // IGESDraw_Drawing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_DrawingWithRotation: declare class IGESDraw_DrawingWithRotation extends IGESData_IGESEntity

  // IGESDraw_DrawingWithRotation.constructor (constructor)
  constructor();

  // IGESDraw_DrawingWithRotation.Init (method)
  Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allViewOrigins: NCollection_HArray1_gp_XY, allOrientationAngles: NCollection_HArray1_double, allAnnotations: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDraw_DrawingWithRotation.NbViews (method)
  NbViews(): number;

  // IGESDraw_DrawingWithRotation.ViewItem (method)
  ViewItem(Index: number): IGESData_ViewKindEntity;

  // IGESDraw_DrawingWithRotation.ViewOrigin (method)
  ViewOrigin(Index: number): gp_Pnt2d;

  // IGESDraw_DrawingWithRotation.OrientationAngle (method)
  OrientationAngle(Index: number): number;

  // IGESDraw_DrawingWithRotation.NbAnnotations (method)
  NbAnnotations(): number;

  // IGESDraw_DrawingWithRotation.Annotation (method)
  Annotation(Index: number): IGESData_IGESEntity;

  // IGESDraw_DrawingWithRotation.ViewToDrawing (method)
  ViewToDrawing(NumView: number, ViewCoords: gp_XYZ): gp_XY;

  // IGESDraw_DrawingWithRotation.DrawingUnit (method)
  DrawingUnit(value?: number): { returnValue: boolean; value: number };

  // IGESDraw_DrawingWithRotation.DrawingSize (method)
  DrawingSize(X?: number, Y?: number): { returnValue: boolean; X: number; Y: number };

  // IGESDraw_DrawingWithRotation.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_DrawingWithRotation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_DrawingWithRotation.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_DrawingWithRotation.delete (method)
  delete(): void;

  // IGESDraw_DrawingWithRotation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_GeneralModule: declare class IGESDraw_GeneralModule extends IGESData_GeneralModule

  // IGESDraw_GeneralModule.constructor (constructor)
  constructor();

  // IGESDraw_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESDraw_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESDraw_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESDraw_GeneralModule.OwnRenewCase (method)
  OwnRenewCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESDraw_GeneralModule.OwnDeleteCase (method)
  OwnDeleteCase(CN: number, ent: IGESData_IGESEntity): void;

  // IGESDraw_GeneralModule.CategoryNumber (method)
  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  // IGESDraw_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_GeneralModule.delete (method)
  delete(): void;

  // IGESDraw_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_LabelDisplay: declare class IGESDraw_LabelDisplay extends IGESData_LabelDisplayEntity

  // IGESDraw_LabelDisplay.constructor (constructor)
  constructor();

  // IGESDraw_LabelDisplay.Init (method)
  Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allTextLocations: NCollection_HArray1_gp_XYZ, allLeaderEntities: NCollection_HArray1_handle_IGESDimen_LeaderArrow, allLabelLevels: NCollection_HArray1_int, allDisplayedEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDraw_LabelDisplay.NbLabels (method)
  NbLabels(): number;

  // IGESDraw_LabelDisplay.ViewItem (method)
  ViewItem(ViewIndex: number): IGESData_ViewKindEntity;

  // IGESDraw_LabelDisplay.TextLocation (method)
  TextLocation(ViewIndex: number): gp_Pnt;

  // IGESDraw_LabelDisplay.LeaderEntity (method)
  LeaderEntity(ViewIndex: number): IGESDimen_LeaderArrow;

  // IGESDraw_LabelDisplay.LabelLevel (method)
  LabelLevel(ViewIndex: number): number;

  // IGESDraw_LabelDisplay.DisplayedEntity (method)
  DisplayedEntity(EntityIndex: number): IGESData_IGESEntity;

  // IGESDraw_LabelDisplay.TransformedTextLocation (method)
  TransformedTextLocation(ViewIndex: number): gp_Pnt;

  // IGESDraw_LabelDisplay.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_LabelDisplay.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_LabelDisplay.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_LabelDisplay.delete (method)
  delete(): void;

  // IGESDraw_LabelDisplay.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_NetworkSubfigure: declare class IGESDraw_NetworkSubfigure extends IGESData_IGESEntity

  // IGESDraw_NetworkSubfigure.constructor (constructor)
  constructor();

  // IGESDraw_NetworkSubfigure.Init (method)
  Init(aDefinition: IGESDraw_NetworkSubfigureDef, aTranslation: gp_XYZ, aScaleFactor: gp_XYZ, aTypeFlag: number, aDesignator: TCollection_HAsciiString, aTemplate: IGESGraph_TextDisplayTemplate, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint): void;

  // IGESDraw_NetworkSubfigure.SubfigureDefinition (method)
  SubfigureDefinition(): IGESDraw_NetworkSubfigureDef;

  // IGESDraw_NetworkSubfigure.Translation (method)
  Translation(): gp_XYZ;

  // IGESDraw_NetworkSubfigure.TransformedTranslation (method)
  TransformedTranslation(): gp_XYZ;

  // IGESDraw_NetworkSubfigure.ScaleFactors (method)
  ScaleFactors(): gp_XYZ;

  // IGESDraw_NetworkSubfigure.TypeFlag (method)
  TypeFlag(): number;

  // IGESDraw_NetworkSubfigure.ReferenceDesignator (method)
  ReferenceDesignator(): TCollection_HAsciiString;

  // IGESDraw_NetworkSubfigure.HasDesignatorTemplate (method)
  HasDesignatorTemplate(): boolean;

  // IGESDraw_NetworkSubfigure.DesignatorTemplate (method)
  DesignatorTemplate(): IGESGraph_TextDisplayTemplate;

  // IGESDraw_NetworkSubfigure.NbConnectPoints (method)
  NbConnectPoints(): number;

  // IGESDraw_NetworkSubfigure.ConnectPoint (method)
  ConnectPoint(Index: number): IGESDraw_ConnectPoint;

  // IGESDraw_NetworkSubfigure.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_NetworkSubfigure.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_NetworkSubfigure.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_NetworkSubfigure.delete (method)
  delete(): void;

  // IGESDraw_NetworkSubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_NetworkSubfigureDef: declare class IGESDraw_NetworkSubfigureDef extends IGESData_IGESEntity

  // IGESDraw_NetworkSubfigureDef.constructor (constructor)
  constructor();

  // IGESDraw_NetworkSubfigureDef.Init (method)
  Init(aDepth: number, aName: TCollection_HAsciiString, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity, aTypeFlag: number, aDesignator: TCollection_HAsciiString, aTemplate: IGESGraph_TextDisplayTemplate, allPointEntities: NCollection_HArray1_handle_IGESDraw_ConnectPoint): void;

  // IGESDraw_NetworkSubfigureDef.Depth (method)
  Depth(): number;

  // IGESDraw_NetworkSubfigureDef.Name (method)
  Name(): TCollection_HAsciiString;

  // IGESDraw_NetworkSubfigureDef.NbEntities (method)
  NbEntities(): number;

  // IGESDraw_NetworkSubfigureDef.Entity (method)
  Entity(Index: number): IGESData_IGESEntity;

  // IGESDraw_NetworkSubfigureDef.TypeFlag (method)
  TypeFlag(): number;

  // IGESDraw_NetworkSubfigureDef.Designator (method)
  Designator(): TCollection_HAsciiString;

  // IGESDraw_NetworkSubfigureDef.HasDesignatorTemplate (method)
  HasDesignatorTemplate(): boolean;

  // IGESDraw_NetworkSubfigureDef.DesignatorTemplate (method)
  DesignatorTemplate(): IGESGraph_TextDisplayTemplate;

  // IGESDraw_NetworkSubfigureDef.NbPointEntities (method)
  NbPointEntities(): number;

  // IGESDraw_NetworkSubfigureDef.HasPointEntity (method)
  HasPointEntity(Index: number): boolean;

  // IGESDraw_NetworkSubfigureDef.PointEntity (method)
  PointEntity(Index: number): IGESDraw_ConnectPoint;

  // IGESDraw_NetworkSubfigureDef.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_NetworkSubfigureDef.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_NetworkSubfigureDef.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_NetworkSubfigureDef.delete (method)
  delete(): void;

  // IGESDraw_NetworkSubfigureDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_PerspectiveView: declare class IGESDraw_PerspectiveView extends IGESData_ViewKindEntity

  // IGESDraw_PerspectiveView.constructor (constructor)
  constructor();

  // IGESDraw_PerspectiveView.Init (method)
  Init(aViewNumber: number, aScaleFactor: number, aViewNormalVector: gp_XYZ, aViewReferencePoint: gp_XYZ, aCenterOfProjection: gp_XYZ, aViewUpVector: gp_XYZ, aViewPlaneDistance: number, aTopLeft: gp_XY, aBottomRight: gp_XY, aDepthClip: number, aBackPlaneDistance: number, aFrontPlaneDistance: number): void;

  // IGESDraw_PerspectiveView.IsSingle (method)
  IsSingle(): boolean;

  // IGESDraw_PerspectiveView.NbViews (method)
  NbViews(): number;

  // IGESDraw_PerspectiveView.ViewItem (method)
  ViewItem(num: number): IGESData_ViewKindEntity;

  // IGESDraw_PerspectiveView.ViewNumber (method)
  ViewNumber(): number;

  // IGESDraw_PerspectiveView.ScaleFactor (method)
  ScaleFactor(): number;

  // IGESDraw_PerspectiveView.ViewNormalVector (method)
  ViewNormalVector(): gp_Vec;

  // IGESDraw_PerspectiveView.ViewReferencePoint (method)
  ViewReferencePoint(): gp_Pnt;

  // IGESDraw_PerspectiveView.CenterOfProjection (method)
  CenterOfProjection(): gp_Pnt;

  // IGESDraw_PerspectiveView.ViewUpVector (method)
  ViewUpVector(): gp_Vec;

  // IGESDraw_PerspectiveView.ViewPlaneDistance (method)
  ViewPlaneDistance(): number;

  // IGESDraw_PerspectiveView.TopLeft (method)
  TopLeft(): gp_Pnt2d;

  // IGESDraw_PerspectiveView.BottomRight (method)
  BottomRight(): gp_Pnt2d;

  // IGESDraw_PerspectiveView.DepthClip (method)
  DepthClip(): number;

  // IGESDraw_PerspectiveView.BackPlaneDistance (method)
  BackPlaneDistance(): number;

  // IGESDraw_PerspectiveView.FrontPlaneDistance (method)
  FrontPlaneDistance(): number;

  // IGESDraw_PerspectiveView.ViewMatrix (method)
  ViewMatrix(): IGESData_TransfEntity;

  // IGESDraw_PerspectiveView.ModelToView (method)
  ModelToView(coords: gp_XYZ): gp_XYZ;

  // IGESDraw_PerspectiveView.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_PerspectiveView.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_PerspectiveView.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_PerspectiveView.delete (method)
  delete(): void;

  // IGESDraw_PerspectiveView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_Planar: declare class IGESDraw_Planar extends IGESData_IGESEntity

  // IGESDraw_Planar.constructor (constructor)
  constructor();

  // IGESDraw_Planar.Init (method)
  Init(nbMats: number, aTransformationMatrix: IGESGeom_TransformationMatrix, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDraw_Planar.NbMatrices (method)
  NbMatrices(): number;

  // IGESDraw_Planar.NbEntities (method)
  NbEntities(): number;

  // IGESDraw_Planar.IsIdentityMatrix (method)
  IsIdentityMatrix(): boolean;

  // IGESDraw_Planar.TransformMatrix (method)
  TransformMatrix(): IGESGeom_TransformationMatrix;

  // IGESDraw_Planar.Entity (method)
  Entity(EntityIndex: number): IGESData_IGESEntity;

  // IGESDraw_Planar.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_Planar.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_Planar.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_Planar.delete (method)
  delete(): void;

  // IGESDraw_Planar.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_Protocol: declare class IGESDraw_Protocol extends IGESData_Protocol

  // IGESDraw_Protocol.constructor (constructor)
  constructor();

  // IGESDraw_Protocol.NbResources (method)
  NbResources(): number;

  // IGESDraw_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESDraw_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESDraw_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_Protocol.delete (method)
  delete(): void;

  // IGESDraw_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ReadWriteModule: declare class IGESDraw_ReadWriteModule extends IGESData_ReadWriteModule

  // IGESDraw_ReadWriteModule.constructor (constructor)
  constructor();

  // IGESDraw_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESDraw_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESDraw_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_ReadWriteModule.delete (method)
  delete(): void;

  // IGESDraw_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_RectArraySubfigure: declare class IGESDraw_RectArraySubfigure extends IGESData_IGESEntity

  // IGESDraw_RectArraySubfigure.constructor (constructor)
  constructor();

  // IGESDraw_RectArraySubfigure.Init (method)
  Init(aBase: IGESData_IGESEntity, aScale: number, aCorner: gp_XYZ, nbCols: number, nbRows: number, hDisp: number, vtDisp: number, rotationAngle: number, doDont: number, allNumPos: NCollection_HArray1_int): void;

  // IGESDraw_RectArraySubfigure.BaseEntity (method)
  BaseEntity(): IGESData_IGESEntity;

  // IGESDraw_RectArraySubfigure.ScaleFactor (method)
  ScaleFactor(): number;

  // IGESDraw_RectArraySubfigure.LowerLeftCorner (method)
  LowerLeftCorner(): gp_Pnt;

  // IGESDraw_RectArraySubfigure.TransformedLowerLeftCorner (method)
  TransformedLowerLeftCorner(): gp_Pnt;

  // IGESDraw_RectArraySubfigure.NbColumns (method)
  NbColumns(): number;

  // IGESDraw_RectArraySubfigure.NbRows (method)
  NbRows(): number;

  // IGESDraw_RectArraySubfigure.ColumnSeparation (method)
  ColumnSeparation(): number;

  // IGESDraw_RectArraySubfigure.RowSeparation (method)
  RowSeparation(): number;

  // IGESDraw_RectArraySubfigure.RotationAngle (method)
  RotationAngle(): number;

  // IGESDraw_RectArraySubfigure.DisplayFlag (method)
  DisplayFlag(): boolean;

  // IGESDraw_RectArraySubfigure.ListCount (method)
  ListCount(): number;

  // IGESDraw_RectArraySubfigure.DoDontFlag (method)
  DoDontFlag(): boolean;

  // IGESDraw_RectArraySubfigure.PositionNum (method)
  PositionNum(Index: number): boolean;

  // IGESDraw_RectArraySubfigure.ListPosition (method)
  ListPosition(Index: number): number;

  // IGESDraw_RectArraySubfigure.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_RectArraySubfigure.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_RectArraySubfigure.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_RectArraySubfigure.delete (method)
  delete(): void;

  // IGESDraw_RectArraySubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_SegmentedViewsVisible: declare class IGESDraw_SegmentedViewsVisible extends IGESData_ViewKindEntity

  // IGESDraw_SegmentedViewsVisible.constructor (constructor)
  constructor();

  // IGESDraw_SegmentedViewsVisible.Init (method)
  Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allBreakpointParameters: NCollection_HArray1_double, allDisplayFlags: NCollection_HArray1_int, allColorValues: NCollection_HArray1_int, allColorDefinitions: NCollection_HArray1_handle_IGESGraph_Color, allLineFontValues: NCollection_HArray1_int, allLineFontDefinitions: NCollection_HArray1_handle_IGESData_LineFontEntity, allLineWeights: NCollection_HArray1_int): void;

  // IGESDraw_SegmentedViewsVisible.IsSingle (method)
  IsSingle(): boolean;

  // IGESDraw_SegmentedViewsVisible.NbViews (method)
  NbViews(): number;

  // IGESDraw_SegmentedViewsVisible.NbSegmentBlocks (method)
  NbSegmentBlocks(): number;

  // IGESDraw_SegmentedViewsVisible.ViewItem (method)
  ViewItem(num: number): IGESData_ViewKindEntity;

  // IGESDraw_SegmentedViewsVisible.BreakpointParameter (method)
  BreakpointParameter(BreakpointIndex: number): number;

  // IGESDraw_SegmentedViewsVisible.DisplayFlag (method)
  DisplayFlag(FlagIndex: number): number;

  // IGESDraw_SegmentedViewsVisible.IsColorDefinition (method)
  IsColorDefinition(ColorIndex: number): boolean;

  // IGESDraw_SegmentedViewsVisible.ColorValue (method)
  ColorValue(ColorIndex: number): number;

  // IGESDraw_SegmentedViewsVisible.ColorDefinition (method)
  ColorDefinition(ColorIndex: number): IGESGraph_Color;

  // IGESDraw_SegmentedViewsVisible.IsFontDefinition (method)
  IsFontDefinition(FontIndex: number): boolean;

  // IGESDraw_SegmentedViewsVisible.LineFontValue (method)
  LineFontValue(FontIndex: number): number;

  // IGESDraw_SegmentedViewsVisible.LineFontDefinition (method)
  LineFontDefinition(FontIndex: number): IGESData_LineFontEntity;

  // IGESDraw_SegmentedViewsVisible.LineWeightItem (method)
  LineWeightItem(WeightIndex: number): number;

  // IGESDraw_SegmentedViewsVisible.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_SegmentedViewsVisible.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_SegmentedViewsVisible.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_SegmentedViewsVisible.delete (method)
  delete(): void;

  // IGESDraw_SegmentedViewsVisible.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_SpecificModule: declare class IGESDraw_SpecificModule extends IGESData_SpecificModule

  // IGESDraw_SpecificModule.constructor (constructor)
  constructor();

  // IGESDraw_SpecificModule.OwnCorrect (method)
  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  // IGESDraw_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_SpecificModule.delete (method)
  delete(): void;

  // IGESDraw_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolCircArraySubfigure: declare class IGESDraw_ToolCircArraySubfigure

  // IGESDraw_ToolCircArraySubfigure.constructor (constructor)
  constructor();

  // IGESDraw_ToolCircArraySubfigure.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_CircArraySubfigure, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolCircArraySubfigure.DirChecker (method)
  DirChecker(ent: IGESDraw_CircArraySubfigure): IGESData_DirChecker;

  // IGESDraw_ToolCircArraySubfigure.OwnCheck (method)
  OwnCheck(ent: IGESDraw_CircArraySubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolCircArraySubfigure.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_CircArraySubfigure, entto: IGESDraw_CircArraySubfigure, TC: Interface_CopyTool): void;

  // IGESDraw_ToolCircArraySubfigure.delete (method)
  delete(): void;

  // IGESDraw_ToolCircArraySubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolConnectPoint: declare class IGESDraw_ToolConnectPoint

  // IGESDraw_ToolConnectPoint.constructor (constructor)
  constructor();

  // IGESDraw_ToolConnectPoint.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_ConnectPoint, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolConnectPoint.DirChecker (method)
  DirChecker(ent: IGESDraw_ConnectPoint): IGESData_DirChecker;

  // IGESDraw_ToolConnectPoint.OwnCheck (method)
  OwnCheck(ent: IGESDraw_ConnectPoint, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolConnectPoint.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_ConnectPoint, entto: IGESDraw_ConnectPoint, TC: Interface_CopyTool): void;

  // IGESDraw_ToolConnectPoint.delete (method)
  delete(): void;

  // IGESDraw_ToolConnectPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolDrawing: declare class IGESDraw_ToolDrawing

  // IGESDraw_ToolDrawing.constructor (constructor)
  constructor();

  // IGESDraw_ToolDrawing.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_Drawing, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolDrawing.OwnCorrect (method)
  OwnCorrect(ent: IGESDraw_Drawing): boolean;

  // IGESDraw_ToolDrawing.DirChecker (method)
  DirChecker(ent: IGESDraw_Drawing): IGESData_DirChecker;

  // IGESDraw_ToolDrawing.OwnCheck (method)
  OwnCheck(ent: IGESDraw_Drawing, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolDrawing.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_Drawing, entto: IGESDraw_Drawing, TC: Interface_CopyTool): void;

  // IGESDraw_ToolDrawing.delete (method)
  delete(): void;

  // IGESDraw_ToolDrawing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolDrawingWithRotation: declare class IGESDraw_ToolDrawingWithRotation

  // IGESDraw_ToolDrawingWithRotation.constructor (constructor)
  constructor();

  // IGESDraw_ToolDrawingWithRotation.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_DrawingWithRotation, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolDrawingWithRotation.OwnCorrect (method)
  OwnCorrect(ent: IGESDraw_DrawingWithRotation): boolean;

  // IGESDraw_ToolDrawingWithRotation.DirChecker (method)
  DirChecker(ent: IGESDraw_DrawingWithRotation): IGESData_DirChecker;

  // IGESDraw_ToolDrawingWithRotation.OwnCheck (method)
  OwnCheck(ent: IGESDraw_DrawingWithRotation, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolDrawingWithRotation.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_DrawingWithRotation, entto: IGESDraw_DrawingWithRotation, TC: Interface_CopyTool): void;

  // IGESDraw_ToolDrawingWithRotation.delete (method)
  delete(): void;

  // IGESDraw_ToolDrawingWithRotation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolLabelDisplay: declare class IGESDraw_ToolLabelDisplay

  // IGESDraw_ToolLabelDisplay.constructor (constructor)
  constructor();

  // IGESDraw_ToolLabelDisplay.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_LabelDisplay, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolLabelDisplay.DirChecker (method)
  DirChecker(ent: IGESDraw_LabelDisplay): IGESData_DirChecker;

  // IGESDraw_ToolLabelDisplay.OwnCheck (method)
  OwnCheck(ent: IGESDraw_LabelDisplay, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolLabelDisplay.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_LabelDisplay, entto: IGESDraw_LabelDisplay, TC: Interface_CopyTool): void;

  // IGESDraw_ToolLabelDisplay.delete (method)
  delete(): void;

  // IGESDraw_ToolLabelDisplay.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolNetworkSubfigure: declare class IGESDraw_ToolNetworkSubfigure

  // IGESDraw_ToolNetworkSubfigure.constructor (constructor)
  constructor();

  // IGESDraw_ToolNetworkSubfigure.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_NetworkSubfigure, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolNetworkSubfigure.DirChecker (method)
  DirChecker(ent: IGESDraw_NetworkSubfigure): IGESData_DirChecker;

  // IGESDraw_ToolNetworkSubfigure.OwnCheck (method)
  OwnCheck(ent: IGESDraw_NetworkSubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolNetworkSubfigure.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_NetworkSubfigure, entto: IGESDraw_NetworkSubfigure, TC: Interface_CopyTool): void;

  // IGESDraw_ToolNetworkSubfigure.delete (method)
  delete(): void;

  // IGESDraw_ToolNetworkSubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolNetworkSubfigureDef: declare class IGESDraw_ToolNetworkSubfigureDef

  // IGESDraw_ToolNetworkSubfigureDef.constructor (constructor)
  constructor();

  // IGESDraw_ToolNetworkSubfigureDef.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_NetworkSubfigureDef, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolNetworkSubfigureDef.DirChecker (method)
  DirChecker(ent: IGESDraw_NetworkSubfigureDef): IGESData_DirChecker;

  // IGESDraw_ToolNetworkSubfigureDef.OwnCheck (method)
  OwnCheck(ent: IGESDraw_NetworkSubfigureDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolNetworkSubfigureDef.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_NetworkSubfigureDef, entto: IGESDraw_NetworkSubfigureDef, TC: Interface_CopyTool): void;

  // IGESDraw_ToolNetworkSubfigureDef.delete (method)
  delete(): void;

  // IGESDraw_ToolNetworkSubfigureDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolPerspectiveView: declare class IGESDraw_ToolPerspectiveView

  // IGESDraw_ToolPerspectiveView.constructor (constructor)
  constructor();

  // IGESDraw_ToolPerspectiveView.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_PerspectiveView, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolPerspectiveView.DirChecker (method)
  DirChecker(ent: IGESDraw_PerspectiveView): IGESData_DirChecker;

  // IGESDraw_ToolPerspectiveView.OwnCheck (method)
  OwnCheck(ent: IGESDraw_PerspectiveView, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolPerspectiveView.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_PerspectiveView, entto: IGESDraw_PerspectiveView, TC: Interface_CopyTool): void;

  // IGESDraw_ToolPerspectiveView.delete (method)
  delete(): void;

  // IGESDraw_ToolPerspectiveView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolPlanar: declare class IGESDraw_ToolPlanar

  // IGESDraw_ToolPlanar.constructor (constructor)
  constructor();

  // IGESDraw_ToolPlanar.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_Planar, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolPlanar.OwnCorrect (method)
  OwnCorrect(ent: IGESDraw_Planar): boolean;

  // IGESDraw_ToolPlanar.DirChecker (method)
  DirChecker(ent: IGESDraw_Planar): IGESData_DirChecker;

  // IGESDraw_ToolPlanar.OwnCheck (method)
  OwnCheck(ent: IGESDraw_Planar, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolPlanar.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_Planar, entto: IGESDraw_Planar, TC: Interface_CopyTool): void;

  // IGESDraw_ToolPlanar.delete (method)
  delete(): void;

  // IGESDraw_ToolPlanar.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolRectArraySubfigure: declare class IGESDraw_ToolRectArraySubfigure

  // IGESDraw_ToolRectArraySubfigure.constructor (constructor)
  constructor();

  // IGESDraw_ToolRectArraySubfigure.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_RectArraySubfigure, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolRectArraySubfigure.DirChecker (method)
  DirChecker(ent: IGESDraw_RectArraySubfigure): IGESData_DirChecker;

  // IGESDraw_ToolRectArraySubfigure.OwnCheck (method)
  OwnCheck(ent: IGESDraw_RectArraySubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolRectArraySubfigure.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_RectArraySubfigure, entto: IGESDraw_RectArraySubfigure, TC: Interface_CopyTool): void;

  // IGESDraw_ToolRectArraySubfigure.delete (method)
  delete(): void;

  // IGESDraw_ToolRectArraySubfigure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolSegmentedViewsVisible: declare class IGESDraw_ToolSegmentedViewsVisible

  // IGESDraw_ToolSegmentedViewsVisible.constructor (constructor)
  constructor();

  // IGESDraw_ToolSegmentedViewsVisible.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_SegmentedViewsVisible, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolSegmentedViewsVisible.DirChecker (method)
  DirChecker(ent: IGESDraw_SegmentedViewsVisible): IGESData_DirChecker;

  // IGESDraw_ToolSegmentedViewsVisible.OwnCheck (method)
  OwnCheck(ent: IGESDraw_SegmentedViewsVisible, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolSegmentedViewsVisible.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_SegmentedViewsVisible, entto: IGESDraw_SegmentedViewsVisible, TC: Interface_CopyTool): void;

  // IGESDraw_ToolSegmentedViewsVisible.delete (method)
  delete(): void;

  // IGESDraw_ToolSegmentedViewsVisible.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolView: declare class IGESDraw_ToolView

  // IGESDraw_ToolView.constructor (constructor)
  constructor();

  // IGESDraw_ToolView.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_View, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolView.DirChecker (method)
  DirChecker(ent: IGESDraw_View): IGESData_DirChecker;

  // IGESDraw_ToolView.OwnCheck (method)
  OwnCheck(ent: IGESDraw_View, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolView.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_View, entto: IGESDraw_View, TC: Interface_CopyTool): void;

  // IGESDraw_ToolView.delete (method)
  delete(): void;

  // IGESDraw_ToolView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolViewsVisible: declare class IGESDraw_ToolViewsVisible

  // IGESDraw_ToolViewsVisible.constructor (constructor)
  constructor();

  // IGESDraw_ToolViewsVisible.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_ViewsVisible, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolViewsVisible.DirChecker (method)
  DirChecker(ent: IGESDraw_ViewsVisible): IGESData_DirChecker;

  // IGESDraw_ToolViewsVisible.OwnCheck (method)
  OwnCheck(ent: IGESDraw_ViewsVisible, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolViewsVisible.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_ViewsVisible, entto: IGESDraw_ViewsVisible, TC: Interface_CopyTool): void;

  // IGESDraw_ToolViewsVisible.OwnRenew (method)
  OwnRenew(entfrom: IGESDraw_ViewsVisible, entto: IGESDraw_ViewsVisible, TC: Interface_CopyTool): void;

  // IGESDraw_ToolViewsVisible.OwnWhenDelete (method)
  OwnWhenDelete(ent: IGESDraw_ViewsVisible): void;

  // IGESDraw_ToolViewsVisible.OwnCorrect (method)
  OwnCorrect(ent: IGESDraw_ViewsVisible): boolean;

  // IGESDraw_ToolViewsVisible.delete (method)
  delete(): void;

  // IGESDraw_ToolViewsVisible.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_ToolViewsVisibleWithAttr: declare class IGESDraw_ToolViewsVisibleWithAttr

  // IGESDraw_ToolViewsVisibleWithAttr.constructor (constructor)
  constructor();

  // IGESDraw_ToolViewsVisibleWithAttr.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDraw_ViewsVisibleWithAttr, IW: IGESData_IGESWriter): void;

  // IGESDraw_ToolViewsVisibleWithAttr.DirChecker (method)
  DirChecker(ent: IGESDraw_ViewsVisibleWithAttr): IGESData_DirChecker;

  // IGESDraw_ToolViewsVisibleWithAttr.OwnCheck (method)
  OwnCheck(ent: IGESDraw_ViewsVisibleWithAttr, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDraw_ToolViewsVisibleWithAttr.OwnCopy (method)
  OwnCopy(entfrom: IGESDraw_ViewsVisibleWithAttr, entto: IGESDraw_ViewsVisibleWithAttr, TC: Interface_CopyTool): void;

  // IGESDraw_ToolViewsVisibleWithAttr.OwnRenew (method)
  OwnRenew(entfrom: IGESDraw_ViewsVisibleWithAttr, entto: IGESDraw_ViewsVisibleWithAttr, TC: Interface_CopyTool): void;

  // IGESDraw_ToolViewsVisibleWithAttr.OwnWhenDelete (method)
  OwnWhenDelete(ent: IGESDraw_ViewsVisibleWithAttr): void;

  // IGESDraw_ToolViewsVisibleWithAttr.OwnCorrect (method)
  OwnCorrect(ent: IGESDraw_ViewsVisibleWithAttr): boolean;

  // IGESDraw_ToolViewsVisibleWithAttr.delete (method)
  delete(): void;

  // IGESDraw_ToolViewsVisibleWithAttr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDraw_View: declare class IGESDraw_View extends IGESData_ViewKindEntity

  // IGESDraw_View.constructor (constructor)
  constructor();

  // IGESDraw_View.Init (method)
  Init(aViewNum: number, aScale: number, aLeftPlane: IGESGeom_Plane, aTopPlane: IGESGeom_Plane, aRightPlane: IGESGeom_Plane, aBottomPlane: IGESGeom_Plane, aBackPlane: IGESGeom_Plane, aFrontPlane: IGESGeom_Plane): void;

  // IGESDraw_View.IsSingle (method)
  IsSingle(): boolean;

  // IGESDraw_View.NbViews (method)
  NbViews(): number;

  // IGESDraw_View.ViewItem (method)
  ViewItem(num: number): IGESData_ViewKindEntity;

  // IGESDraw_View.ViewNumber (method)
  ViewNumber(): number;

  // IGESDraw_View.ScaleFactor (method)
  ScaleFactor(): number;

  // IGESDraw_View.HasLeftPlane (method)
  HasLeftPlane(): boolean;

  // IGESDraw_View.LeftPlane (method)
  LeftPlane(): IGESGeom_Plane;

  // IGESDraw_View.HasTopPlane (method)
  HasTopPlane(): boolean;

  // IGESDraw_View.TopPlane (method)
  TopPlane(): IGESGeom_Plane;

  // IGESDraw_View.HasRightPlane (method)
  HasRightPlane(): boolean;

  // IGESDraw_View.RightPlane (method)
  RightPlane(): IGESGeom_Plane;

  // IGESDraw_View.HasBottomPlane (method)
  HasBottomPlane(): boolean;

  // IGESDraw_View.BottomPlane (method)
  BottomPlane(): IGESGeom_Plane;

  // IGESDraw_View.HasBackPlane (method)
  HasBackPlane(): boolean;

  // IGESDraw_View.BackPlane (method)
  BackPlane(): IGESGeom_Plane;

  // IGESDraw_View.HasFrontPlane (method)
  HasFrontPlane(): boolean;

  // IGESDraw_View.FrontPlane (method)
  FrontPlane(): IGESGeom_Plane;

  // IGESDraw_View.ViewMatrix (method)
  ViewMatrix(): IGESData_TransfEntity;

  // IGESDraw_View.ModelToView (method)
  ModelToView(coords: gp_XYZ): gp_XYZ;

  // IGESDraw_View.get_type_name (method)
  static get_type_name(): string;

  // IGESDraw_View.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDraw_View.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDraw_View.delete (method)
  delete(): void;

  // IGESDraw_View.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
