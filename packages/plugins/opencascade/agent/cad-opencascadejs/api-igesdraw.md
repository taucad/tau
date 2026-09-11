# libcascade — IGESDraw

31 top-level symbols. Signatures are verbatim typescript.

IGESDraw: declare class IGESDraw

constructor

static Init(): void;

static Protocol(): IGESDraw_Protocol;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_CircArraySubfigure: declare class IGESDraw_CircArraySubfigure extends IGESData_IGESEntity

constructor

Init(aBase: IGESData_IGESEntity, aNumLocs: number, aCenter: gp_XYZ, aRadius: number, aStAngle: number, aDelAngle: number, aFlag: number, allNumPos: NCollection_HArray1_int): void;

BaseEntity(): IGESData_IGESEntity;

NbLocations(): number;

CenterPoint(): gp_Pnt;

TransformedCenterPoint(): gp_Pnt;

CircleRadius(): number;

StartAngle(): number;

DeltaAngle(): number;

ListCount(): number;

DisplayFlag(): boolean;

DoDontFlag(): boolean;

PositionNum(Index: number): boolean;

ListPosition(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ConnectPoint: declare class IGESDraw_ConnectPoint extends IGESData_IGESEntity

constructor

Init(aPoint: gp_XYZ, aDisplaySymbol: IGESData_IGESEntity, aTypeFlag: number, aFunctionFlag: number, aFunctionIdentifier: TCollection_HAsciiString, anIdentifierTemplate: IGESGraph_TextDisplayTemplate, aFunctionName: TCollection_HAsciiString, aFunctionTemplate: IGESGraph_TextDisplayTemplate, aPointIdentifier: number, aFunctionCode: number, aSwapFlag: number, anOwnerSubfigure: IGESData_IGESEntity): void;

Point(): gp_Pnt;

TransformedPoint(): gp_Pnt;

HasDisplaySymbol(): boolean;

DisplaySymbol(): IGESData_IGESEntity;

TypeFlag(): number;

FunctionFlag(): number;

FunctionIdentifier(): TCollection_HAsciiString;

HasIdentifierTemplate(): boolean;

IdentifierTemplate(): IGESGraph_TextDisplayTemplate;

FunctionName(): TCollection_HAsciiString;

HasFunctionTemplate(): boolean;

FunctionTemplate(): IGESGraph_TextDisplayTemplate;

PointIdentifier(): number;

FunctionCode(): number;

SwapFlag(): boolean;

HasOwnerSubfigure(): boolean;

OwnerSubfigure(): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_Drawing: declare class IGESDraw_Drawing extends IGESData_IGESEntity

constructor

Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allViewOrigins: NCollection_HArray1_gp_XY, allAnnotations: NCollection_HArray1_handle_IGESData_IGESEntity): void;

NbViews(): number;

ViewItem(ViewIndex: number): IGESData_ViewKindEntity;

ViewOrigin(TViewIndex: number): gp_Pnt2d;

NbAnnotations(): number;

Annotation(AnnotationIndex: number): IGESData_IGESEntity;

ViewToDrawing(NumView: number, ViewCoords: gp_XYZ): gp_XY;

DrawingUnit(value?: number): { returnValue: boolean; value: number };

DrawingSize(X?: number, Y?: number): { returnValue: boolean; X: number; Y: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_DrawingWithRotation: declare class IGESDraw_DrawingWithRotation extends IGESData_IGESEntity

constructor

Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allViewOrigins: NCollection_HArray1_gp_XY, allOrientationAngles: NCollection_HArray1_double, allAnnotations: NCollection_HArray1_handle_IGESData_IGESEntity): void;

NbViews(): number;

ViewItem(Index: number): IGESData_ViewKindEntity;

ViewOrigin(Index: number): gp_Pnt2d;

OrientationAngle(Index: number): number;

NbAnnotations(): number;

Annotation(Index: number): IGESData_IGESEntity;

ViewToDrawing(NumView: number, ViewCoords: gp_XYZ): gp_XY;

DrawingUnit(value?: number): { returnValue: boolean; value: number };

DrawingSize(X?: number, Y?: number): { returnValue: boolean; X: number; Y: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_GeneralModule: declare class IGESDraw_GeneralModule extends IGESData_GeneralModule

constructor

DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

OwnRenewCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

OwnDeleteCase(CN: number, ent: IGESData_IGESEntity): void;

CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_LabelDisplay: declare class IGESDraw_LabelDisplay extends IGESData_LabelDisplayEntity

constructor

Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allTextLocations: NCollection_HArray1_gp_XYZ, allLeaderEntities: NCollection_HArray1_handle_IGESDimen_LeaderArrow, allLabelLevels: NCollection_HArray1_int, allDisplayedEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

NbLabels(): number;

ViewItem(ViewIndex: number): IGESData_ViewKindEntity;

TextLocation(ViewIndex: number): gp_Pnt;

LeaderEntity(ViewIndex: number): IGESDimen_LeaderArrow;

LabelLevel(ViewIndex: number): number;

DisplayedEntity(EntityIndex: number): IGESData_IGESEntity;

TransformedTextLocation(ViewIndex: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_NetworkSubfigure: declare class IGESDraw_NetworkSubfigure extends IGESData_IGESEntity

constructor

Init(aDefinition: IGESDraw_NetworkSubfigureDef, aTranslation: gp_XYZ, aScaleFactor: gp_XYZ, aTypeFlag: number, aDesignator: TCollection_HAsciiString, aTemplate: IGESGraph_TextDisplayTemplate, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint): void;

SubfigureDefinition(): IGESDraw_NetworkSubfigureDef;

Translation(): gp_XYZ;

TransformedTranslation(): gp_XYZ;

ScaleFactors(): gp_XYZ;

TypeFlag(): number;

ReferenceDesignator(): TCollection_HAsciiString;

HasDesignatorTemplate(): boolean;

DesignatorTemplate(): IGESGraph_TextDisplayTemplate;

NbConnectPoints(): number;

ConnectPoint(Index: number): IGESDraw_ConnectPoint;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_NetworkSubfigureDef: declare class IGESDraw_NetworkSubfigureDef extends IGESData_IGESEntity

constructor

Init(aDepth: number, aName: TCollection_HAsciiString, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity, aTypeFlag: number, aDesignator: TCollection_HAsciiString, aTemplate: IGESGraph_TextDisplayTemplate, allPointEntities: NCollection_HArray1_handle_IGESDraw_ConnectPoint): void;

Depth(): number;

Name(): TCollection_HAsciiString;

NbEntities(): number;

Entity(Index: number): IGESData_IGESEntity;

TypeFlag(): number;

Designator(): TCollection_HAsciiString;

HasDesignatorTemplate(): boolean;

DesignatorTemplate(): IGESGraph_TextDisplayTemplate;

NbPointEntities(): number;

HasPointEntity(Index: number): boolean;

PointEntity(Index: number): IGESDraw_ConnectPoint;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_PerspectiveView: declare class IGESDraw_PerspectiveView extends IGESData_ViewKindEntity

constructor

Init(aViewNumber: number, aScaleFactor: number, aViewNormalVector: gp_XYZ, aViewReferencePoint: gp_XYZ, aCenterOfProjection: gp_XYZ, aViewUpVector: gp_XYZ, aViewPlaneDistance: number, aTopLeft: gp_XY, aBottomRight: gp_XY, aDepthClip: number, aBackPlaneDistance: number, aFrontPlaneDistance: number): void;

IsSingle(): boolean;

NbViews(): number;

ViewItem(num: number): IGESData_ViewKindEntity;

ViewNumber(): number;

ScaleFactor(): number;

ViewNormalVector(): gp_Vec;

ViewReferencePoint(): gp_Pnt;

CenterOfProjection(): gp_Pnt;

ViewUpVector(): gp_Vec;

ViewPlaneDistance(): number;

TopLeft(): gp_Pnt2d;

BottomRight(): gp_Pnt2d;

DepthClip(): number;

BackPlaneDistance(): number;

FrontPlaneDistance(): number;

ViewMatrix(): IGESData_TransfEntity;

ModelToView(coords: gp_XYZ): gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_Planar: declare class IGESDraw_Planar extends IGESData_IGESEntity

constructor

Init(nbMats: number, aTransformationMatrix: IGESGeom_TransformationMatrix, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

NbMatrices(): number;

NbEntities(): number;

IsIdentityMatrix(): boolean;

TransformMatrix(): IGESGeom_TransformationMatrix;

Entity(EntityIndex: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_Protocol: declare class IGESDraw_Protocol extends IGESData_Protocol

constructor

NbResources(): number;

Resource(num: number): Interface_Protocol;

TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ReadWriteModule: declare class IGESDraw_ReadWriteModule extends IGESData_ReadWriteModule

constructor

CaseIGES(typenum: number, formnum: number): number;

WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_RectArraySubfigure: declare class IGESDraw_RectArraySubfigure extends IGESData_IGESEntity

constructor

Init(aBase: IGESData_IGESEntity, aScale: number, aCorner: gp_XYZ, nbCols: number, nbRows: number, hDisp: number, vtDisp: number, rotationAngle: number, doDont: number, allNumPos: NCollection_HArray1_int): void;

BaseEntity(): IGESData_IGESEntity;

ScaleFactor(): number;

LowerLeftCorner(): gp_Pnt;

TransformedLowerLeftCorner(): gp_Pnt;

NbColumns(): number;

NbRows(): number;

ColumnSeparation(): number;

RowSeparation(): number;

RotationAngle(): number;

DisplayFlag(): boolean;

ListCount(): number;

DoDontFlag(): boolean;

PositionNum(Index: number): boolean;

ListPosition(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_SegmentedViewsVisible: declare class IGESDraw_SegmentedViewsVisible extends IGESData_ViewKindEntity

constructor

Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allBreakpointParameters: NCollection_HArray1_double, allDisplayFlags: NCollection_HArray1_int, allColorValues: NCollection_HArray1_int, allColorDefinitions: NCollection_HArray1_handle_IGESGraph_Color, allLineFontValues: NCollection_HArray1_int, allLineFontDefinitions: NCollection_HArray1_handle_IGESData_LineFontEntity, allLineWeights: NCollection_HArray1_int): void;

IsSingle(): boolean;

NbViews(): number;

NbSegmentBlocks(): number;

ViewItem(num: number): IGESData_ViewKindEntity;

BreakpointParameter(BreakpointIndex: number): number;

DisplayFlag(FlagIndex: number): number;

IsColorDefinition(ColorIndex: number): boolean;

ColorValue(ColorIndex: number): number;

ColorDefinition(ColorIndex: number): IGESGraph_Color;

IsFontDefinition(FontIndex: number): boolean;

LineFontValue(FontIndex: number): number;

LineFontDefinition(FontIndex: number): IGESData_LineFontEntity;

LineWeightItem(WeightIndex: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_SpecificModule: declare class IGESDraw_SpecificModule extends IGESData_SpecificModule

constructor

OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolCircArraySubfigure: declare class IGESDraw_ToolCircArraySubfigure

constructor

WriteOwnParams(ent: IGESDraw_CircArraySubfigure, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_CircArraySubfigure): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_CircArraySubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_CircArraySubfigure, entto: IGESDraw_CircArraySubfigure, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolConnectPoint: declare class IGESDraw_ToolConnectPoint

constructor

WriteOwnParams(ent: IGESDraw_ConnectPoint, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_ConnectPoint): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_ConnectPoint, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_ConnectPoint, entto: IGESDraw_ConnectPoint, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolDrawing: declare class IGESDraw_ToolDrawing

constructor

WriteOwnParams(ent: IGESDraw_Drawing, IW: IGESData_IGESWriter): void;

OwnCorrect(ent: IGESDraw_Drawing): boolean;

DirChecker(ent: IGESDraw_Drawing): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_Drawing, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_Drawing, entto: IGESDraw_Drawing, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolDrawingWithRotation: declare class IGESDraw_ToolDrawingWithRotation

constructor

WriteOwnParams(ent: IGESDraw_DrawingWithRotation, IW: IGESData_IGESWriter): void;

OwnCorrect(ent: IGESDraw_DrawingWithRotation): boolean;

DirChecker(ent: IGESDraw_DrawingWithRotation): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_DrawingWithRotation, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_DrawingWithRotation, entto: IGESDraw_DrawingWithRotation, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolLabelDisplay: declare class IGESDraw_ToolLabelDisplay

constructor

WriteOwnParams(ent: IGESDraw_LabelDisplay, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_LabelDisplay): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_LabelDisplay, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_LabelDisplay, entto: IGESDraw_LabelDisplay, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolNetworkSubfigure: declare class IGESDraw_ToolNetworkSubfigure

constructor

WriteOwnParams(ent: IGESDraw_NetworkSubfigure, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_NetworkSubfigure): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_NetworkSubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_NetworkSubfigure, entto: IGESDraw_NetworkSubfigure, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolNetworkSubfigureDef: declare class IGESDraw_ToolNetworkSubfigureDef

constructor

WriteOwnParams(ent: IGESDraw_NetworkSubfigureDef, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_NetworkSubfigureDef): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_NetworkSubfigureDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_NetworkSubfigureDef, entto: IGESDraw_NetworkSubfigureDef, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolPerspectiveView: declare class IGESDraw_ToolPerspectiveView

constructor

WriteOwnParams(ent: IGESDraw_PerspectiveView, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_PerspectiveView): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_PerspectiveView, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_PerspectiveView, entto: IGESDraw_PerspectiveView, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolPlanar: declare class IGESDraw_ToolPlanar

constructor

WriteOwnParams(ent: IGESDraw_Planar, IW: IGESData_IGESWriter): void;

OwnCorrect(ent: IGESDraw_Planar): boolean;

DirChecker(ent: IGESDraw_Planar): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_Planar, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_Planar, entto: IGESDraw_Planar, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolRectArraySubfigure: declare class IGESDraw_ToolRectArraySubfigure

constructor

WriteOwnParams(ent: IGESDraw_RectArraySubfigure, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_RectArraySubfigure): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_RectArraySubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_RectArraySubfigure, entto: IGESDraw_RectArraySubfigure, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolSegmentedViewsVisible: declare class IGESDraw_ToolSegmentedViewsVisible

constructor

WriteOwnParams(ent: IGESDraw_SegmentedViewsVisible, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_SegmentedViewsVisible): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_SegmentedViewsVisible, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_SegmentedViewsVisible, entto: IGESDraw_SegmentedViewsVisible, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolView: declare class IGESDraw_ToolView

constructor

WriteOwnParams(ent: IGESDraw_View, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_View): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_View, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_View, entto: IGESDraw_View, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolViewsVisible: declare class IGESDraw_ToolViewsVisible

constructor

WriteOwnParams(ent: IGESDraw_ViewsVisible, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_ViewsVisible): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_ViewsVisible, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_ViewsVisible, entto: IGESDraw_ViewsVisible, TC: Interface_CopyTool): void;

OwnRenew(entfrom: IGESDraw_ViewsVisible, entto: IGESDraw_ViewsVisible, TC: Interface_CopyTool): void;

OwnWhenDelete(ent: IGESDraw_ViewsVisible): void;

OwnCorrect(ent: IGESDraw_ViewsVisible): boolean;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ToolViewsVisibleWithAttr: declare class IGESDraw_ToolViewsVisibleWithAttr

constructor

WriteOwnParams(ent: IGESDraw_ViewsVisibleWithAttr, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDraw_ViewsVisibleWithAttr): IGESData_DirChecker;

OwnCheck(ent: IGESDraw_ViewsVisibleWithAttr, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDraw_ViewsVisibleWithAttr, entto: IGESDraw_ViewsVisibleWithAttr, TC: Interface_CopyTool): void;

OwnRenew(entfrom: IGESDraw_ViewsVisibleWithAttr, entto: IGESDraw_ViewsVisibleWithAttr, TC: Interface_CopyTool): void;

OwnWhenDelete(ent: IGESDraw_ViewsVisibleWithAttr): void;

OwnCorrect(ent: IGESDraw_ViewsVisibleWithAttr): boolean;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_View: declare class IGESDraw_View extends IGESData_ViewKindEntity

constructor

Init(aViewNum: number, aScale: number, aLeftPlane: IGESGeom_Plane, aTopPlane: IGESGeom_Plane, aRightPlane: IGESGeom_Plane, aBottomPlane: IGESGeom_Plane, aBackPlane: IGESGeom_Plane, aFrontPlane: IGESGeom_Plane): void;

IsSingle(): boolean;

NbViews(): number;

ViewItem(num: number): IGESData_ViewKindEntity;

ViewNumber(): number;

ScaleFactor(): number;

HasLeftPlane(): boolean;

LeftPlane(): IGESGeom_Plane;

HasTopPlane(): boolean;

TopPlane(): IGESGeom_Plane;

HasRightPlane(): boolean;

RightPlane(): IGESGeom_Plane;

HasBottomPlane(): boolean;

BottomPlane(): IGESGeom_Plane;

HasBackPlane(): boolean;

BackPlane(): IGESGeom_Plane;

HasFrontPlane(): boolean;

FrontPlane(): IGESGeom_Plane;

ViewMatrix(): IGESData_TransfEntity;

ModelToView(coords: gp_XYZ): gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
