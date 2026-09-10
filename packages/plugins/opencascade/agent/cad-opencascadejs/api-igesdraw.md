# libcascade — IGESDraw

14 top-level symbols. Signatures are verbatim typescript.

// This package contains the group of classes necessary for Structure Entities implied in Drawings and Structured Graphics (Sets for drawing, Drawings and Views)
IGESDraw: declare class IGESDraw

constructor

// Prepares dynamic data (Protocol, Modules) for this package
static Init(): void;

// Returns the Protocol for this Package
static Protocol(): IGESDraw_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGES Circular Array Subfigure Instance Entity, Type <414> Form Number <0> in package {@link IGESDraw`IGESDraw`}
IGESDraw_CircArraySubfigure: declare class IGESDraw_CircArraySubfigure extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class CircArraySubfigure
Init(aBase: IGESData_IGESEntity, aNumLocs: number, aCenter: gp_XYZ, aRadius: number, aStAngle: number, aDelAngle: number, aFlag: number, allNumPos: NCollection_HArray1_int): void;

// returns the base entity, copies of which are produced
BaseEntity(): IGESData_IGESEntity;

// returns total number of possible instance locations
NbLocations(): number;

// returns the center of the imaginary circle
CenterPoint(): gp_Pnt;

// returns the Transformed center of the imaginary circle
TransformedCenterPoint(): gp_Pnt;

// returns the radius of the imaginary circle
CircleRadius(): number;

// returns the start angle in radians
StartAngle(): number;

// returns the delta angle in radians
DeltaAngle(): number;

// returns 0 if all elements to be displayed
ListCount(): number;

// returns True if (ListCount = 0) all elements are to be displayed
DisplayFlag(): boolean;

// returns 0 if half or fewer of the elements of the array are defined returns 1 if half or more of the elements are defined
DoDontFlag(): boolean;

// returns whether Index is to be processed (DO) or not to be processed(DON'T) if (ListCount = 0) return theDoDontFlag raises exception if Index <= 0 or Index > `ListCount()`
PositionNum(Index: number): boolean;

// returns the Index'th value position raises exception if Index <= 0 or Index > `ListCount()`
ListPosition(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESConnectPoint, Type <132> Form Number <0> in package {@link IGESDraw`IGESDraw`}
IGESDraw_ConnectPoint: declare class IGESDraw_ConnectPoint extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class ConnectPoint
Init(aPoint: gp_XYZ, aDisplaySymbol: IGESData_IGESEntity, aTypeFlag: number, aFunctionFlag: number, aFunctionIdentifier: TCollection_HAsciiString, anIdentifierTemplate: IGESGraph_TextDisplayTemplate, aFunctionName: TCollection_HAsciiString, aFunctionTemplate: IGESGraph_TextDisplayTemplate, aPointIdentifier: number, aFunctionCode: number, aSwapFlag: number, anOwnerSubfigure: IGESData_IGESEntity): void;

// returns the coordinate of the connection point
Point(): gp_Pnt;

// returns the Transformed coordinate of the connection point
TransformedPoint(): gp_Pnt;

// returns True if Display symbol is specified else returns False
HasDisplaySymbol(): boolean;

// if display symbol specified returns display symbol geometric entity else returns NULL Handle
DisplaySymbol(): IGESData_IGESEntity;

// return value specifies a particular type of connection
TypeFlag(): number;

// returns Function Code that specifies a particular function for the ECO576 connection
FunctionFlag(): number;

// return HAsciiString identifying Pin Number or Nozzle Label etc
FunctionIdentifier(): TCollection_HAsciiString;

// returns True if Text Display Template is specified for Identifier else returns False
HasIdentifierTemplate(): boolean;

// if Text Display Template for the Function Identifier is defined, returns TestDisplayTemplate else returns NULL Handle
IdentifierTemplate(): IGESGraph_TextDisplayTemplate;

// returns Connection Point Function Name
FunctionName(): TCollection_HAsciiString;

// returns True if Text Display Template is specified for Function Name else returns False
HasFunctionTemplate(): boolean;

// if Text Display Template for the Function Name is defined, returns TestDisplayTemplate else returns NULL Handle
FunctionTemplate(): IGESGraph_TextDisplayTemplate;

// returns the Unique Connect Point Identifier
PointIdentifier(): number;

// returns the Connect Point Function Code
FunctionCode(): number;

// return value = 0
SwapFlag(): boolean;

// returns True if Network Subfigure Instance/Definition Entity is specified else returns False
HasOwnerSubfigure(): boolean;

// returns "owner" Network Subfigure Instance Entity, or Network Subfigure Definition Entity, or NULL Handle
OwnerSubfigure(): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESDrawing, Type <404> Form <0> in package {@link IGESDraw`IGESDraw`}
IGESDraw_Drawing: declare class IGESDraw_Drawing extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Drawing
Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allViewOrigins: NCollection_HArray1_gp_XY, allAnnotations: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns the number of view pointers in <me>
NbViews(): number;

// returns the ViewKindEntity indicated by ViewIndex raises an exception if ViewIndex <= 0 or ViewIndex > `NbViews()`
ViewItem(ViewIndex: number): IGESData_ViewKindEntity;

// returns the Drawing space coordinates of the origin of the Transformed view indicated by TViewIndex raises an exception if TViewIndex <= 0 or TViewIndex > `NbViews()`
ViewOrigin(TViewIndex: number): gp_Pnt2d;

// returns the number of Annotation entities in <me>
NbAnnotations(): number;

// returns the Annotation entity in this Drawing, indicated by the AnnotationIndex raises an exception if AnnotationIndex <= 0 or AnnotationIndex > `NbAnnotations()`
Annotation(AnnotationIndex: number): IGESData_IGESEntity;

ViewToDrawing(NumView: number, ViewCoords: gp_XYZ): gp_XY;

// Returns the Drawing Unit Value if it is specified (by a specific property entity) If not specified, returns False, and val as zero
DrawingUnit(value?: number): { returnValue: boolean; value: number };

// Returns the Drawing Size if it is specified (by a specific property entity) If not specified, returns False, and X,Y as zero
DrawingSize(X?: number, Y?: number): { returnValue: boolean; X: number; Y: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESDrawingWithRotation, Type <404> Form <1> in package {@link IGESDraw`IGESDraw`}
IGESDraw_DrawingWithRotation: declare class IGESDraw_DrawingWithRotation extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class DrawingWithRotation
Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allViewOrigins: NCollection_HArray1_gp_XY, allOrientationAngles: NCollection_HArray1_double, allAnnotations: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns the number of view pointers in <me>
NbViews(): number;

// returns the View entity indicated by Index raises an exception if Index <= 0 or Index > `NbViews()`
ViewItem(Index: number): IGESData_ViewKindEntity;

// returns the Drawing space coordinates of the origin of the Transformed view indicated by Index raises an exception if Index <= 0 or Index > `NbViews()`
ViewOrigin(Index: number): gp_Pnt2d;

// returns the Orientation angle for the Transformed view indicated by Index raises an exception if Index <= 0 or Index > `NbViews()`
OrientationAngle(Index: number): number;

// returns the number of Annotation entities in <me>
NbAnnotations(): number;

// returns the Annotation entity in this Drawing, indicated by Index raises an exception if Index <= 0 or Index > `NbAnnotations()`
Annotation(Index: number): IGESData_IGESEntity;

ViewToDrawing(NumView: number, ViewCoords: gp_XYZ): gp_XY;

// Returns the Drawing Unit Value if it is specified (by a specific property entity) If not specified, returns False, and val as zero
DrawingUnit(value?: number): { returnValue: boolean; value: number };

// Returns the Drawing Size if it is specified (by a specific property entity) If not specified, returns False, and X,Y as zero
DrawingSize(X?: number, Y?: number): { returnValue: boolean; X: number; Y: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services for {@link IGESDraw`IGESDraw`} (specific part) This Services comprise
IGESDraw_GeneralModule: declare class IGESDraw_GeneralModule extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Renews parameters which are specific of each Type of Entity
OwnRenewCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Clears parameters with can cause looping structures
OwnDeleteCase(CN: number, ent: IGESData_IGESEntity): void;

// Returns a category number which characterizes an entity Planar
CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESLabelDisplay, Type <402> Form <5> in package {@link IGESDraw`IGESDraw`}
IGESDraw_LabelDisplay: declare class IGESDraw_LabelDisplay extends IGESData_LabelDisplayEntity

constructor

// This method is used to set the fields of the class LabelDisplay
Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allTextLocations: NCollection_HArray1_gp_XYZ, allLeaderEntities: NCollection_HArray1_handle_IGESDimen_LeaderArrow, allLabelLevels: NCollection_HArray1_int, allDisplayedEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns the number of label placements in <me>
NbLabels(): number;

// returns the View entity indicated by ViewIndex raises an exception if ViewIndex <= 0 or ViewIndex > `NbLabels()`
ViewItem(ViewIndex: number): IGESData_ViewKindEntity;

// returns the 3d-Point coordinates of the text location, in the view indicated by ViewIndex raises an exception if ViewIndex <= 0 or ViewIndex > `NbLabels()`
TextLocation(ViewIndex: number): gp_Pnt;

// returns the Leader entity in the view indicated by ViewIndex raises an exception if ViewIndex <= 0 or ViewIndex > `NbLabels()`
LeaderEntity(ViewIndex: number): IGESDimen_LeaderArrow;

// returns the Entity label level number in the view indicated by ViewIndex raises an exception if ViewIndex <= 0 or ViewIndex > `NbLabels()`
LabelLevel(ViewIndex: number): number;

// returns the entity indicated by EntityIndex raises an exception if EntityIndex <= 0 or EntityIndex > `NbLabels()`
DisplayedEntity(EntityIndex: number): IGESData_IGESEntity;

// returns the transformed 3d-Point coordinates of the text location, in the view indicated by ViewIndex raises an exception if ViewIndex <= 0 or ViewIndex > `NbLabels()`
TransformedTextLocation(ViewIndex: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Network Subfigure Instance Entity, Type <420> Form Number <0> in package {@link IGESDraw`IGESDraw`}
IGESDraw_NetworkSubfigure: declare class IGESDraw_NetworkSubfigure extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class NetworkSubfigure
Init(aDefinition: IGESDraw_NetworkSubfigureDef, aTranslation: gp_XYZ, aScaleFactor: gp_XYZ, aTypeFlag: number, aDesignator: TCollection_HAsciiString, aTemplate: IGESGraph_TextDisplayTemplate, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint): void;

// returns Network Subfigure Definition Entity specified by this entity
SubfigureDefinition(): IGESDraw_NetworkSubfigureDef;

// returns Translation Data relative to either model space or to the definition space of a referring entity
Translation(): gp_XYZ;

// returns the Transformed Translation Data relative to either model space or to the definition space of a referring entity
TransformedTranslation(): gp_XYZ;

// returns Scale factor in definition space(x, y, z axes)
ScaleFactors(): gp_XYZ;

// returns Type Flag which implements the distinction between Logical design and Physical design data,and is required if both are present
TypeFlag(): number;

// returns the primary reference designator
ReferenceDesignator(): TCollection_HAsciiString;

// returns True if Text Display Template Entity is specified, else False
HasDesignatorTemplate(): boolean;

// returns primary reference designator Text Display Template Entity, or null
DesignatorTemplate(): IGESGraph_TextDisplayTemplate;

// returns the number of associated Connect Point Entities
NbConnectPoints(): number;

// returns the Index'th associated Connect point Entity raises exception if Index <= 0 or Index > `NbConnectPoints()`
ConnectPoint(Index: number): IGESDraw_ConnectPoint;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESNetworkSubfigureDef, Type <320> Form Number <0> in package {@link IGESDraw`IGESDraw`}
IGESDraw_NetworkSubfigureDef: declare class IGESDraw_NetworkSubfigureDef extends IGESData_IGESEntity

constructor

// This method is used to set fields of the class NetworkSubfigureDef
Init(aDepth: number, aName: TCollection_HAsciiString, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity, aTypeFlag: number, aDesignator: TCollection_HAsciiString, aTemplate: IGESGraph_TextDisplayTemplate, allPointEntities: NCollection_HArray1_handle_IGESDraw_ConnectPoint): void;

// returns Depth of Subfigure(indication the amount of nesting) Note
Depth(): number;

// returns the Subfigure Name
Name(): TCollection_HAsciiString;

// returns Number of Associated(child) entries in subfigure exclusive of primary reference designator and Control Points
NbEntities(): number;

// returns the Index'th IGESEntity in subfigure exclusive of primary reference designator and Control Points raises exception if Index <=0 or Index > `NbEntities()`
Entity(Index: number): IGESData_IGESEntity;

// return value = 0
TypeFlag(): number;

// returns Primary Reference Designator
Designator(): TCollection_HAsciiString;

// returns True if Text Display Template is specified for primary designator else returns False
HasDesignatorTemplate(): boolean;

// if Text Display Template specified then return TextDisplayTemplate else return NULL Handle
DesignatorTemplate(): IGESGraph_TextDisplayTemplate;

// returns the Number Of Associated(child) Connect Point Entities
NbPointEntities(): number;

// returns True is Index'th Associated Connect Point Entity is present else returns False raises exception if Index is out of bound
HasPointEntity(Index: number): boolean;

// returns the Index'th Associated Connect Point Entity raises exception if Index <= 0 or Index > `NbPointEntities()`
PointEntity(Index: number): IGESDraw_ConnectPoint;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESPerspectiveView, Type <410> Form <1> in package {@link IGESDraw`IGESDraw`}
IGESDraw_PerspectiveView: declare class IGESDraw_PerspectiveView extends IGESData_ViewKindEntity

constructor

// This method is used to set the fields of the class PerspectiveView
Init(aViewNumber: number, aScaleFactor: number, aViewNormalVector: gp_XYZ, aViewReferencePoint: gp_XYZ, aCenterOfProjection: gp_XYZ, aViewUpVector: gp_XYZ, aViewPlaneDistance: number, aTopLeft: gp_XY, aBottomRight: gp_XY, aDepthClip: number, aBackPlaneDistance: number, aFrontPlaneDistance: number): void;

// Returns True (for a single view)
IsSingle(): boolean;

// Returns 1 (single view)
NbViews(): number;

// For a single view, returns <me> whatever <num>
ViewItem(num: number): IGESData_ViewKindEntity;

// returns the view number associated with <me>
ViewNumber(): number;

// returns the scale factor associated with <me>
ScaleFactor(): number;

// returns the View plane normal vector (model space)
ViewNormalVector(): gp_Vec;

// returns the View reference point (model space)
ViewReferencePoint(): gp_Pnt;

// returns the Center Of Projection (model space)
CenterOfProjection(): gp_Pnt;

// returns the View up vector (model space)
ViewUpVector(): gp_Vec;

// returns the View plane distance (model space)
ViewPlaneDistance(): number;

// returns the top left point of the clipping window
TopLeft(): gp_Pnt2d;

// returns the bottom right point of the clipping window
BottomRight(): gp_Pnt2d;

// returns the Depth clipping indicator 0 = No depth clipping 1 = Back clipping plane ON 2 = Front clipping plane ON 3 = Back and front clipping planes ON
DepthClip(): number;

// returns the View coordinate denoting the location of the back clipping plane
BackPlaneDistance(): number;

// returns the View coordinate denoting the location of the front clipping plane
FrontPlaneDistance(): number;

// returns the Transformation Matrix
ViewMatrix(): IGESData_TransfEntity;

// returns XYX from the Model space to the View space by applying the View Matrix
ModelToView(coords: gp_XYZ): gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESPlanar, Type <402> Form <16> in package {@link IGESDraw`IGESDraw`}
IGESDraw_Planar: declare class IGESDraw_Planar extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Planar
Init(nbMats: number, aTransformationMatrix: IGESGeom_TransformationMatrix, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns the number of Transformation matrices in <me>
NbMatrices(): number;

// returns the number of Entities in the plane pointed to by this associativity
NbEntities(): number;

// returns True if TransformationMatrix is Identity Matrix, i.e:- No Matrix defined
IsIdentityMatrix(): boolean;

// returns the Transformation matrix moving data from the XY plane into space or zero
TransformMatrix(): IGESGeom_TransformationMatrix;

// returns the Entity on the specified plane, indicated by EntityIndex raises an exception if EntityIndex <= 0 or EntityIndex > `NbEntities()`
Entity(EntityIndex: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Protocol for {@link IGESDraw`IGESDraw`}
IGESDraw_Protocol: declare class IGESDraw_Protocol extends IGESData_Protocol

constructor

// Gives the count of Resource Protocol
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type This Case Number is then used in Libraries
TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Draw File Access Module for {@link IGESDraw`IGESDraw`} (specific parts) Specific actions concern
IGESDraw_ReadWriteModule: declare class IGESDraw_ReadWriteModule extends IGESData_ReadWriteModule

constructor

// Defines Case Numbers for Entities of {@link IGESDraw`IGESDraw`}
CaseIGES(typenum: number, formnum: number): number;

// Writes own parameters to IGESWriter
WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGES Rectangular Array Subfigure Instance Entity, Type <412> Form Number <0> in package {@link IGESDraw`IGESDraw`} Used to produce copies of object called the base entity, arranging them in equally spaced rows and columns
IGESDraw_RectArraySubfigure: declare class IGESDraw_RectArraySubfigure extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class RectArraySubfigure
Init(aBase: IGESData_IGESEntity, aScale: number, aCorner: gp_XYZ, nbCols: number, nbRows: number, hDisp: number, vtDisp: number, rotationAngle: number, doDont: number, allNumPos: NCollection_HArray1_int): void;

// returns the base entity, copies of which are produced
BaseEntity(): IGESData_IGESEntity;

// returns the scale factor
ScaleFactor(): number;

// returns coordinates of lower left hand corner for the entire array
LowerLeftCorner(): gp_Pnt;

// returns Transformed coordinates of lower left corner for the array
TransformedLowerLeftCorner(): gp_Pnt;

// returns number of columns in the array
NbColumns(): number;

// returns number of rows in the array
NbRows(): number;

// returns horizontal distance between columns
ColumnSeparation(): number;

// returns vertical distance between rows
RowSeparation(): number;

// returns rotation angle in radians
RotationAngle(): number;

// returns True if (ListCount = 0) i.e., all elements to be displayed
DisplayFlag(): boolean;

// returns 0 if all replicated entities to be displayed
ListCount(): number;

// returns 0 if half or fewer of the elements of the array are defined 1 if half or more of the elements are defined
DoDontFlag(): boolean;

// returns whether Index is to be processed (DO) or not to be processed(DON'T) if (ListCount = 0) return theDoDontFlag
PositionNum(Index: number): boolean;

// returns the Index'th value position raises exception if Index <= 0 or Index > `ListCount()`
ListPosition(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
