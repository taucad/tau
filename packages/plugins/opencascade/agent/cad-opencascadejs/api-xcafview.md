# libcascade — XCAFView

2 top-level symbols. Signatures are verbatim typescript.

// Access object for saved view
XCAFView_Object: declare class XCAFView_Object extends Standard_Transient

constructor

SetName(theName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetType(theType: XCAFView_ProjectionType): void;

Type(): XCAFView_ProjectionType;

SetProjectionPoint(thePoint: gp_Pnt): void;

ProjectionPoint(): gp_Pnt;

SetViewDirection(theDirection: gp_Dir): void;

ViewDirection(): gp_Dir;

SetUpDirection(theDirection: gp_Dir): void;

UpDirection(): gp_Dir;

SetZoomFactor(theZoomFactor: number): void;

ZoomFactor(): number;

SetWindowHorizontalSize(theSize: number): void;

WindowHorizontalSize(): number;

SetWindowVerticalSize(theSize: number): void;

WindowVerticalSize(): number;

SetClippingExpression(theExpression: TCollection_HAsciiString): void;

ClippingExpression(): TCollection_HAsciiString;

UnsetFrontPlaneClipping(): void;

HasFrontPlaneClipping(): boolean;

SetFrontPlaneDistance(theDistance: number): void;

FrontPlaneDistance(): number;

UnsetBackPlaneClipping(): void;

HasBackPlaneClipping(): boolean;

SetBackPlaneDistance(theDistance: number): void;

BackPlaneDistance(): number;

SetViewVolumeSidesClipping(theViewVolumeSidesClipping: boolean): void;

HasViewVolumeSidesClipping(): boolean;

CreateGDTPoints(theLenght: number): void;

HasGDTPoints(): boolean;

NbGDTPoints(): number;

SetGDTPoint(theIndex: number, thePoint: gp_Pnt): void;

GDTPoint(theIndex: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines projection types of view
XCAFView_ProjectionType: typeof XCAFView_ProjectionType[keyof typeof XCAFView_ProjectionType]
