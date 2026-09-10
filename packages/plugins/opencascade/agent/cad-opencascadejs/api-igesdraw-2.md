# libcascade — IGESDraw (2)

23 top-level symbols. Signatures are verbatim typescript.

// defines IGESSegmentedViewsVisible, Type <402> Form <19> in package {@link IGESDraw`IGESDraw`}
IGESDraw_SegmentedViewsVisible: declare class IGESDraw_SegmentedViewsVisible extends IGESData_ViewKindEntity

constructor

// This method is used to set the fields of the class SegmentedViewsVisible
Init(allViews: NCollection_HArray1_handle_IGESData_ViewKindEntity, allBreakpointParameters: NCollection_HArray1_double, allDisplayFlags: NCollection_HArray1_int, allColorValues: NCollection_HArray1_int, allColorDefinitions: NCollection_HArray1_handle_IGESGraph_Color, allLineFontValues: NCollection_HArray1_int, allLineFontDefinitions: NCollection_HArray1_handle_IGESData_LineFontEntity, allLineWeights: NCollection_HArray1_int): void;

// Returns False (for a complex view)
IsSingle(): boolean;

// Returns the count of Views referenced by <me> (inherited)
NbViews(): number;

// returns the number of view/segment blocks in <me> Similar to NbViews but has a more general significance
NbSegmentBlocks(): number;

// returns the View entity indicated by ViewIndex raises an exception if ViewIndex <= 0 or ViewIndex > `NbSegmentBlocks()`
ViewItem(num: number): IGESData_ViewKindEntity;

// returns the parameter of the breakpoint indicated by BreakpointIndex raises an exception if BreakpointIndex <= 0 or BreakpointIndex > `NbSegmentBlocks()`
BreakpointParameter(BreakpointIndex: number): number;

// returns the Display flag indicated by FlagIndex raises an exception if FlagIndex <= 0 or FlagIndex > `NbSegmentBlocks()`
DisplayFlag(FlagIndex: number): number;

// returns True if the ColorIndex'th value of the "theColorDefinitions" field of <me> is a pointer raises an exception if ColorIndex <= 0 or ColorIndex > `NbSegmentBlocks()`
IsColorDefinition(ColorIndex: number): boolean;

// returns the Color value indicated by ColorIndex raises an exception if ColorIndex <= 0 or ColorIndex > `NbSegmentBlocks()`
ColorValue(ColorIndex: number): number;

// returns the Color definition entity indicated by ColorIndex raises an exception if ColorIndex <= 0 or ColorIndex > `NbSegmentBlocks()`
ColorDefinition(ColorIndex: number): IGESGraph_Color;

// returns True if the FontIndex'th value of the "theLineFontDefinitions" field of <me> is a pointer raises an exception if FontIndex <= 0 or FontIndex > `NbSegmentBlocks()`
IsFontDefinition(FontIndex: number): boolean;

// returns the LineFont value indicated by FontIndex raises an exception if FontIndex <= 0 or FontIndex > `NbSegmentBlocks()`
LineFontValue(FontIndex: number): number;

// returns the LineFont definition entity indicated by FontIndex raises an exception if FontIndex <= 0 or FontIndex > `NbSegmentBlocks()`
LineFontDefinition(FontIndex: number): IGESData_LineFontEntity;

// returns the LineWeight value indicated by WeightIndex raises an exception if WeightIndex <= 0 or WeightIndex > `NbSegmentBlocks()`
LineWeightItem(WeightIndex: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Services attached to IGES Entities
IGESDraw_SpecificModule: declare class IGESDraw_SpecificModule extends IGESData_SpecificModule

constructor

// Performs non-ambiguous Corrections on Entities which support them (Planar)
OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a CircArraySubfigure
IGESDraw_ToolCircArraySubfigure: declare class IGESDraw_ToolCircArraySubfigure

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_CircArraySubfigure, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_CircArraySubfigure): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_CircArraySubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_CircArraySubfigure, entto: IGESDraw_CircArraySubfigure, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ConnectPoint
IGESDraw_ToolConnectPoint: declare class IGESDraw_ToolConnectPoint

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_ConnectPoint, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_ConnectPoint): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_ConnectPoint, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_ConnectPoint, entto: IGESDraw_ConnectPoint, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Drawing
IGESDraw_ToolDrawing: declare class IGESDraw_ToolDrawing

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_Drawing, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Drawing (Null Views are removed from list)
OwnCorrect(ent: IGESDraw_Drawing): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDraw_Drawing): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_Drawing, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_Drawing, entto: IGESDraw_Drawing, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DrawingWithRotation
IGESDraw_ToolDrawingWithRotation: declare class IGESDraw_ToolDrawingWithRotation

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_DrawingWithRotation, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a DrawingWithRotation (Null Views are removed from list)
OwnCorrect(ent: IGESDraw_DrawingWithRotation): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDraw_DrawingWithRotation): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_DrawingWithRotation, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_DrawingWithRotation, entto: IGESDraw_DrawingWithRotation, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a LabelDisplay
IGESDraw_ToolLabelDisplay: declare class IGESDraw_ToolLabelDisplay

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_LabelDisplay, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_LabelDisplay): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_LabelDisplay, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_LabelDisplay, entto: IGESDraw_LabelDisplay, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a NetworkSubfigure
IGESDraw_ToolNetworkSubfigure: declare class IGESDraw_ToolNetworkSubfigure

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_NetworkSubfigure, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_NetworkSubfigure): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_NetworkSubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_NetworkSubfigure, entto: IGESDraw_NetworkSubfigure, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a NetworkSubfigureDef
IGESDraw_ToolNetworkSubfigureDef: declare class IGESDraw_ToolNetworkSubfigureDef

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_NetworkSubfigureDef, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_NetworkSubfigureDef): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_NetworkSubfigureDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_NetworkSubfigureDef, entto: IGESDraw_NetworkSubfigureDef, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a PerspectiveView
IGESDraw_ToolPerspectiveView: declare class IGESDraw_ToolPerspectiveView

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_PerspectiveView, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_PerspectiveView): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_PerspectiveView, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_PerspectiveView, entto: IGESDraw_PerspectiveView, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Planar
IGESDraw_ToolPlanar: declare class IGESDraw_ToolPlanar

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_Planar, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Planar (NbMatrices forced to 1)
OwnCorrect(ent: IGESDraw_Planar): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDraw_Planar): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_Planar, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_Planar, entto: IGESDraw_Planar, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a RectArraySubfigure
IGESDraw_ToolRectArraySubfigure: declare class IGESDraw_ToolRectArraySubfigure

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_RectArraySubfigure, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_RectArraySubfigure): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_RectArraySubfigure, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_RectArraySubfigure, entto: IGESDraw_RectArraySubfigure, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SegmentedViewsVisible
IGESDraw_ToolSegmentedViewsVisible: declare class IGESDraw_ToolSegmentedViewsVisible

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_SegmentedViewsVisible, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_SegmentedViewsVisible): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_SegmentedViewsVisible, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_SegmentedViewsVisible, entto: IGESDraw_SegmentedViewsVisible, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a View
IGESDraw_ToolView: declare class IGESDraw_ToolView

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_View, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_View): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_View, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDraw_View, entto: IGESDraw_View, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ViewsVisible
IGESDraw_ToolViewsVisible: declare class IGESDraw_ToolViewsVisible

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_ViewsVisible, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_ViewsVisible): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_ViewsVisible, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters shared not implied, i.e
OwnCopy(entfrom: IGESDraw_ViewsVisible, entto: IGESDraw_ViewsVisible, TC: Interface_CopyTool): void;

// Copies Specific implied Parameters
OwnRenew(entfrom: IGESDraw_ViewsVisible, entto: IGESDraw_ViewsVisible, TC: Interface_CopyTool): void;

// Clears specific implied parameters, which cause looping structures
OwnWhenDelete(ent: IGESDraw_ViewsVisible): void;

// Sets automatic unambiguous Correction on a ViewsVisible (all displayed entities must refer to <ent> in directory part, else the list is cleared)
OwnCorrect(ent: IGESDraw_ViewsVisible): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a ViewsVisibleWithAttr
IGESDraw_ToolViewsVisibleWithAttr: declare class IGESDraw_ToolViewsVisibleWithAttr

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDraw_ViewsVisibleWithAttr, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDraw_ViewsVisibleWithAttr): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDraw_ViewsVisibleWithAttr, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters shared not implied, i.e
OwnCopy(entfrom: IGESDraw_ViewsVisibleWithAttr, entto: IGESDraw_ViewsVisibleWithAttr, TC: Interface_CopyTool): void;

// Copies Specific implied Parameters
OwnRenew(entfrom: IGESDraw_ViewsVisibleWithAttr, entto: IGESDraw_ViewsVisibleWithAttr, TC: Interface_CopyTool): void;

// Clears specific implied parameters, which cause looping structures
OwnWhenDelete(ent: IGESDraw_ViewsVisibleWithAttr): void;

// Sets automatic unambiguous Correction on a ViewsVisibleWithAttr (all displayed entities must refer to <ent> in directory part, else the list is cleared)
OwnCorrect(ent: IGESDraw_ViewsVisibleWithAttr): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES View Entity, Type <410> Form <0> in package {@link IGESDraw`IGESDraw`}
IGESDraw_View: declare class IGESDraw_View extends IGESData_ViewKindEntity

constructor

// This method is used to set fields of the class View
Init(aViewNum: number, aScale: number, aLeftPlane: IGESGeom_Plane, aTopPlane: IGESGeom_Plane, aRightPlane: IGESGeom_Plane, aBottomPlane: IGESGeom_Plane, aBackPlane: IGESGeom_Plane, aFrontPlane: IGESGeom_Plane): void;

// Returns True (for a single view)
IsSingle(): boolean;

// Returns 1 (single view)
NbViews(): number;

// For a single view, returns <me> whatever <num>
ViewItem(num: number): IGESData_ViewKindEntity;

// returns integer number identifying view orientation
ViewNumber(): number;

// returns the scale factor(Default = 1.0)
ScaleFactor(): number;

// returns False if left side of view volume is not present
HasLeftPlane(): boolean;

// returns the left side of view volume, or null handle
LeftPlane(): IGESGeom_Plane;

// returns False if top of view volume is not present
HasTopPlane(): boolean;

// returns the top of view volume, or null handle
TopPlane(): IGESGeom_Plane;

// returns False if right side of view volume is not present
HasRightPlane(): boolean;

// returns the right side of view volume, or null handle
RightPlane(): IGESGeom_Plane;

// returns False if bottom of view volume is not present
HasBottomPlane(): boolean;

// returns the bottom of view volume, or null handle
BottomPlane(): IGESGeom_Plane;

// returns False if back of view volume is not present
HasBackPlane(): boolean;

// returns the back of view volume, or null handle
BackPlane(): IGESGeom_Plane;

// returns False if front of view volume is not present
HasFrontPlane(): boolean;

// returns the front of view volume, or null handle
FrontPlane(): IGESGeom_Plane;

// returns the Transformation Matrix
ViewMatrix(): IGESData_TransfEntity;

// returns XYZ from the Model space to the View space by applying the View Matrix
ModelToView(coords: gp_XYZ): gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGESViewsVisible, Type <402>, Form <3> in package {@link IGESDraw`IGESDraw`}
IGESDraw_ViewsVisible: declare class IGESDraw_ViewsVisible extends IGESData_ViewKindEntity

constructor

// This method is used to set the fields of the class ViewsVisible
Init(allViewEntities: NCollection_HArray1_handle_IGESData_ViewKindEntity, allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// Changes only the list of Displayed Entities (Null allowed)
InitImplied(allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// Returns False (for a complex view)
IsSingle(): boolean;

// returns the Number of views visible
NbViews(): number;

// returns the number of entities displayed in the Views or zero if no Entities specified in these Views
NbDisplayedEntities(): number;

// returns the Index'th ViewKindEntity Entity raises exception if Index <= 0 or Index > NbViewsVisible()
ViewItem(num: number): IGESData_ViewKindEntity;

// returns the Index'th entity whose display is being specified by this associativity instance raises exception if Index <= 0 or Index > NbEntityDisplayed()
DisplayedEntity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESViewsVisibleWithAttr, Type <402>, Form <4> in package {@link IGESDraw`IGESDraw`}
IGESDraw_ViewsVisibleWithAttr: declare class IGESDraw_ViewsVisibleWithAttr extends IGESData_ViewKindEntity

constructor

// This method is used to set fields of the class ViewsVisibleWithAttr
Init(allViewEntities: NCollection_HArray1_handle_IGESData_ViewKindEntity, allLineFonts: NCollection_HArray1_int, allLineDefinitions: NCollection_HArray1_handle_IGESData_LineFontEntity, allColorValues: NCollection_HArray1_int, allColorDefinitions: NCollection_HArray1_handle_IGESGraph_Color, allLineWeights: NCollection_HArray1_int, allDisplayEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// Changes only the list of Displayed Entities (Null allowed)
InitImplied(allDisplayEntity: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// Returns False (for a complex view)
IsSingle(): boolean;

// returns the number of Views containing the view visible, line font, color number, and line weight information
NbViews(): number;

// returns the number of entities which have this particular set of display characteristic, or zero if no Entities specified
NbDisplayedEntities(): number;

// returns the Index'th ViewKindEntity entity raises exception if Index <= 0 or Index > `NbViews()`
ViewItem(num: number): IGESData_ViewKindEntity;

// returns the Index'th Line font value or zero raises exception if Index <= 0 or Index > `NbViews()`
LineFontValue(Index: number): number;

// returns True if the Index'th Line Font Definition is specified else returns False raises exception if Index <= 0 or Index > `NbViews()`
IsFontDefinition(Index: number): boolean;

// returns the Index'th Line Font Definition Entity or NULL(0) raises exception if Index <= 0 or Index > `NbViews()`
FontDefinition(Index: number): IGESData_LineFontEntity;

// returns the Index'th Color number value raises exception if Index <= 0 or Index > `NbViews()`
ColorValue(Index: number): number;

// returns True if Index'th Color Definition is specified else returns False raises exception if Index <= 0 or Index > `NbViews()`
IsColorDefinition(Index: number): boolean;

// returns the Index'th Color Definition Entity raises exception if Index <= 0 or Index > `NbViews()`
ColorDefinition(Index: number): IGESGraph_Color;

// returns the Index'th Color Line Weight raises exception if Index <= 0 or Index > `NbViews()`
LineWeightItem(Index: number): number;

// returns Index'th Display entity with this particular characteristics raises exception if Index <= 0 or Index > NbEntities()
DisplayedEntity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESDraw_Array1OfConnectPoint: NCollection_Array1_handle_IGESDraw_ConnectPoint

IGESDraw_Array1OfViewKindEntity: NCollection_Array1_handle_IGESData_ViewKindEntity

IGESDraw_HArray1OfConnectPoint: NCollection_HArray1_handle_IGESDraw_ConnectPoint

IGESDraw_HArray1OfViewKindEntity: NCollection_HArray1_handle_IGESData_ViewKindEntity
