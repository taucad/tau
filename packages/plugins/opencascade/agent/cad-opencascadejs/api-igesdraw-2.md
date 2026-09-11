# libcascade — IGESDraw (2)

6 top-level symbols. Signatures are verbatim typescript.

IGESDraw_ViewsVisible: declare class IGESDraw_ViewsVisible extends IGESData_ViewKindEntity

constructor

Init(allViewEntities: NCollection_HArray1_handle_IGESData_ViewKindEntity, allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

InitImplied(allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

IsSingle(): boolean;

NbViews(): number;

NbDisplayedEntities(): number;

ViewItem(num: number): IGESData_ViewKindEntity;

DisplayedEntity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_ViewsVisibleWithAttr: declare class IGESDraw_ViewsVisibleWithAttr extends IGESData_ViewKindEntity

constructor

Init(allViewEntities: NCollection_HArray1_handle_IGESData_ViewKindEntity, allLineFonts: NCollection_HArray1_int, allLineDefinitions: NCollection_HArray1_handle_IGESData_LineFontEntity, allColorValues: NCollection_HArray1_int, allColorDefinitions: NCollection_HArray1_handle_IGESGraph_Color, allLineWeights: NCollection_HArray1_int, allDisplayEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

InitImplied(allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

IsSingle(): boolean;

NbViews(): number;

NbDisplayedEntities(): number;

ViewItem(num: number): IGESData_ViewKindEntity;

LineFontValue(Index: number): number;

IsFontDefinition(Index: number): boolean;

FontDefinition(Index: number): IGESData_LineFontEntity;

ColorValue(Index: number): number;

IsColorDefinition(Index: number): boolean;

ColorDefinition(Index: number): IGESGraph_Color;

LineWeightItem(Index: number): number;

DisplayedEntity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDraw_Array1OfConnectPoint: NCollection_Array1_handle_IGESDraw_ConnectPoint

IGESDraw_Array1OfViewKindEntity: NCollection_Array1_handle_IGESData_ViewKindEntity

IGESDraw_HArray1OfConnectPoint: NCollection_HArray1_handle_IGESDraw_ConnectPoint

IGESDraw_HArray1OfViewKindEntity: NCollection_HArray1_handle_IGESData_ViewKindEntity
