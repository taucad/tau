# libcascade — XCAFDoc (3)

6 top-level symbols. Signatures are verbatim typescript.

// Defines sections structure of an XDE document
XCAFDoc_DocumentTool: declare class XCAFDoc_DocumentTool extends TDataStd_GenericEmpty

constructor

static GetID(): Standard_GUID;

// Create (if not exist) DocumentTool attribute on 0.1 label if <IsAcces> is true, else on <L> label
static Set(L: TDF_Label, IsAcces?: boolean): XCAFDoc_DocumentTool;

static IsXCAFDocument(Doc: TDocStd_Document): boolean;

// Returns label where the DocumentTool attribute is or 0.1 if DocumentTool is not yet set
static DocLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 1
static ShapesLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 2
static ColorsLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 3
static LayersLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 4
static DGTsLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 5
static MaterialsLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 7
static ViewsLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 8
static ClippingPlanesLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 9
static NotesLabel(acces: TDF_Label): TDF_Label;

// Returns sub-label of `DocLabel()` with tag 10
static VisMaterialLabel(theLabel: TDF_Label): TDF_Label;

// Creates (if it does not exist) ShapeTool attribute on `ShapesLabel()`
static ShapeTool(acces: TDF_Label): XCAFDoc_ShapeTool;

// Checks for the ShapeTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckShapeTool(theAcces: TDF_Label): boolean;

// Creates (if it does not exist) ColorTool attribute on `ColorsLabel()`
static ColorTool(acces: TDF_Label): XCAFDoc_ColorTool;

// Checks for the ColorTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckColorTool(theAcces: TDF_Label): boolean;

// Creates (if it does not exist) {@link XCAFDoc_VisMaterialTool`XCAFDoc_VisMaterialTool`} attribute on `VisMaterialLabel()`
static VisMaterialTool(theLabel: TDF_Label): XCAFDoc_VisMaterialTool;

// Checks for the VisMaterialTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckVisMaterialTool(theAcces: TDF_Label): boolean;

// Creates (if it does not exist) LayerTool attribute on `LayersLabel()`
static LayerTool(acces: TDF_Label): XCAFDoc_LayerTool;

// Checks for the LayerTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckLayerTool(theAcces: TDF_Label): boolean;

// Creates (if it does not exist) DimTolTool attribute on `DGTsLabel()`
static DimTolTool(acces: TDF_Label): XCAFDoc_DimTolTool;

// Checks for the DimTolTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckDimTolTool(theAcces: TDF_Label): boolean;

// Creates (if it does not exist) DimTolTool attribute on `DGTsLabel()`
static MaterialTool(acces: TDF_Label): XCAFDoc_MaterialTool;

// Checks for the MaterialTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckMaterialTool(theAcces: TDF_Label): boolean;

// Creates (if it does not exist) ViewTool attribute on `ViewsLabel()`
static ViewTool(acces: TDF_Label): XCAFDoc_ViewTool;

// Checks for the ViewTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckViewTool(theAcces: TDF_Label): boolean;

// Creates (if it does not exist) ClippingPlaneTool attribute on `ClippingPlanesLabel()`
static ClippingPlaneTool(acces: TDF_Label): XCAFDoc_ClippingPlaneTool;

// Checks for the ClippingPlaneTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckClippingPlaneTool(theAcces: TDF_Label): boolean;

// Creates (if it does not exist) NotesTool attribute on `NotesLabel()`
static NotesTool(acces: TDF_Label): XCAFDoc_NotesTool;

// Checks for the NotesTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
static CheckNotesTool(theAcces: TDF_Label): boolean;

// Returns value of current internal unit for the document converted to base unit type
static GetLengthUnit(theDoc: TDocStd_Document, theResut: number, theBaseUnit: UnitsMethods_LengthUnit): { returnValue: boolean; theResut: number };
static GetLengthUnit(theDoc: TDocStd_Document, theResut?: number): { returnValue: boolean; theResut: number };
static GetLengthUnit(theDoc: TDocStd_Document, theResut: number, theBaseUnit: UnitsMethods_LengthUnit): { returnValue: boolean; theResut: number };
static GetLengthUnit(theDoc: TDocStd_Document, theResut?: number): { returnValue: boolean; theResut: number };

// Sets value of current internal unit to the document in meter
static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number): void;
static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;
static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number): void;
static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;

// to be called when reading this attribute from file
Init(): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// To init this derived attribute after the attribute restore using the base restore-methods
AfterRetrieval(forceIt?: boolean): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool for edit structure of document
XCAFDoc_Editor: declare class XCAFDoc_Editor

constructor

// Converts shape (compound/compsolid/shell/wire) to assembly
static Expand(theDoc: TDF_Label, theShape: TDF_Label, theRecursively: boolean): boolean;
static Expand(theDoc: TDF_Label, theRecursively: boolean): boolean;
static Expand(theDoc: TDF_Label, theShape: TDF_Label, theRecursively: boolean): boolean;
static Expand(theDoc: TDF_Label, theRecursively: boolean): boolean;
// theDoc: input document
// theShape: input shape label
// theRecursively: recursively expand a compound subshape

// Clones all labels to a new position, keeping the structure with all the attributes
static Extract(theSrcLabels: NCollection_Sequence_TDF_Label, theDstLabel: TDF_Label, theIsNoVisMat: boolean): boolean;
static Extract(theSrcLabel: TDF_Label, theDstLabel: TDF_Label, theIsNoVisMat: boolean): boolean;
static Extract(theSrcLabels: NCollection_Sequence_TDF_Label, theDstLabel: TDF_Label, theIsNoVisMat: boolean): boolean;
static Extract(theSrcLabel: TDF_Label, theDstLabel: TDF_Label, theIsNoVisMat: boolean): boolean;
// theSrcLabels: original labels to copy from
// theDstLabel: label to set result as a component of or a main document's label to simply set new shape
// theIsNoVisMat: get a VisMaterial attributes as is or convert to color

// Copies shapes label with keeping of shape structure (recursively)
static CloneShapeLabel(theSrcLabel: TDF_Label, theSrcShapeTool: XCAFDoc_ShapeTool, theDstShapeTool: XCAFDoc_ShapeTool, theMap: NCollection_DataMap_TDF_Label_TDF_Label): TDF_Label;
// theSrcLabel: original label to copy from
// theSrcShapeTool: shape tool to get
// theDstShapeTool: shape tool to set
// theMap: relating map of the original shapes label and labels created from them Mutated in place

// Copies metadata contains from the source label to the destination label
static CloneMetaData(theSrcLabel: TDF_Label, theDstLabel: TDF_Label, theVisMatMap: NCollection_DataMap_handle_XCAFDoc_VisMaterial_handle_XCAFDoc_VisMaterial, theToCopyColor?: boolean, theToCopyLayer?: boolean, theToCopyMaterial?: boolean, theToCopyVisMaterial?: boolean, theToCopyAttributes?: boolean): void;
// theSrcLabel: original label to copy from
// theDstLabel: destination shape label to set attributes
// theVisMatMap: relating map of the original VisMaterial and created
// theToCopyColor: copying visible value and shape color (handled all color type)
// theToCopyLayer: copying layer
// theToCopyMaterial: copying material
// theToCopyVisMaterial: copying visual material
// theToCopyAttributes: copying of other node attributes, for example, a shape's property

// Gets shape labels that has down relation with the input label
static GetParentShapeLabels(theLabel: TDF_Label, theRelatedLabels: NCollection_Map_TDF_Label): void;
// theLabel: input label
// theRelatedLabels: output labels Mutated in place

// Gets shape labels that has up relation with the input label
static GetChildShapeLabels(theLabel: TDF_Label, theRelatedLabels: NCollection_Map_TDF_Label): void;
// theLabel: input label
// theRelatedLabels: output labels Mutated in place

// Filters original shape tree with keeping structure
static FilterShapeTree(theShapeTool: XCAFDoc_ShapeTool, theLabelsToKeep: NCollection_Map_TDF_Label): boolean;
// theShapeTool: shape tool to extract from
// theLabelsToKeep: labels to keep

// Applies geometrical scaling to the following assembly components
static RescaleGeometry(theLabel: TDF_Label, theScaleFactor: number, theForceIfNotRoot?: boolean): boolean;
// theLabel: starting label
// theScaleFactor: scale factor, should be positive
// theForceIfNotRoot: allows scaling of a non root assembly if true, otherwise - returns false

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Attribute to store dimension and tolerance
XCAFDoc_GeomTolerance: declare class XCAFDoc_GeomTolerance extends TDataStd_GenericEmpty

constructor

static GetID(): Standard_GUID;

static Set(theLabel: TDF_Label): XCAFDoc_GeomTolerance;

// Updates parent's label and its sub-labels with data taken from theGeomToleranceObject
SetObject(theGeomToleranceObject: XCAFDimTolObjects_GeomToleranceObject): void;

// Returns geometry tolerance object data taken from the paren's label and its sub-labels
GetObject(): XCAFDimTolObjects_GeomToleranceObject;

// Returns the ID of the attribute
ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This attribute allow user multirelation tree of labels
XCAFDoc_GraphNode: declare class XCAFDoc_GraphNode extends TDF_Attribute

constructor

// **class methods working on the node**
static Find(L: TDF_Label): { returnValue: boolean; G: XCAFDoc_GraphNode; [Symbol.dispose](): void };

// Finds or Creates a GraphNode attribute on the label <L> with the default Graph ID, returned by the method <GetDefaultGraphID>
static Set(L: TDF_Label): XCAFDoc_GraphNode;
static Set(L: TDF_Label, ExplicitGraphID: Standard_GUID): XCAFDoc_GraphNode;
static Set(L: TDF_Label): XCAFDoc_GraphNode;
static Set(L: TDF_Label, ExplicitGraphID: Standard_GUID): XCAFDoc_GraphNode;

// returns a default Graph ID
static GetDefaultGraphID(): Standard_GUID;

SetGraphID(explicitID: Standard_GUID): void;

// Set GraphNode <F> as father of me and returns index of <F> in Sequence that containing Fathers GraphNodes
SetFather(F: XCAFDoc_GraphNode): number;

// Set GraphNode <Ch> as child of me and returns index of <Ch> in Sequence that containing Children GraphNodes
SetChild(Ch: XCAFDoc_GraphNode): number;

// Remove <F> from Fathers GraphNodeSequence
UnSetFather(F: XCAFDoc_GraphNode): void;
UnSetFather(Findex: number): void;
UnSetFather(F: XCAFDoc_GraphNode): void;
UnSetFather(Findex: number): void;

// Remove <Ch> from GraphNodeSequence
UnSetChild(Ch: XCAFDoc_GraphNode): void;
UnSetChild(Chindex: number): void;
UnSetChild(Ch: XCAFDoc_GraphNode): void;
UnSetChild(Chindex: number): void;

// Return GraphNode by index from GraphNodeSequence
GetFather(Findex: number): XCAFDoc_GraphNode;

// Return GraphNode by index from GraphNodeSequence
GetChild(Chindex: number): XCAFDoc_GraphNode;

// Return index of <F>, or zero if there is no such Graphnode
FatherIndex(F: XCAFDoc_GraphNode): number;

// Return index of <Ch>, or zero if there is no such Graphnode
ChildIndex(Ch: XCAFDoc_GraphNode): number;

// returns TRUE if <me> is father of <Ch>
IsFather(Ch: XCAFDoc_GraphNode): boolean;

// returns TRUE if <me> is child of <F>
IsChild(F: XCAFDoc_GraphNode): boolean;

// return Number of Fathers GraphNodes
NbFathers(): number;

// return Number of Childrens GraphNodes
NbChildren(): number;

// Returns the Graph ID (default or explicit one depending on the Set method used)
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

// Something to do before forgetting an Attribute to a label
BeforeForget(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides tools to store and retrieve attributes (Layers) of {@link TopoDS_Shape`TopoDS_Shape`} in and from {@link TDocStd_Document`TDocStd_Document`} A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Layers section of document
XCAFDoc_LayerTool: declare class XCAFDoc_LayerTool extends TDataStd_GenericEmpty

constructor

// Creates (if not exist) LayerTool
static Set(L: TDF_Label): XCAFDoc_LayerTool;

static GetID(): Standard_GUID;

// returns the label under which Layers are stored
BaseLabel(): TDF_Label;

// Returns internal {@link XCAFDoc_ShapeTool`XCAFDoc_ShapeTool`} tool
ShapeTool(): XCAFDoc_ShapeTool;

// Returns True if label belongs to a Layertable and is a Layer definition
IsLayer(lab: TDF_Label): boolean;

// Returns Layer defined by label lab Returns False if the label is not in Layertable or does not define a Layer
GetLayer(lab: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
// aLayer: Mutated in place

// Finds a Layer definition in a Layertable and returns its label if found Returns False if Layer is not found in Layertable
FindLayer(aLayer: TCollection_ExtendedString, lab: TDF_Label): boolean;
FindLayer(aLayer: TCollection_ExtendedString, theToFindWithProperty: boolean, theToFindVisible: boolean): TDF_Label;
FindLayer(aLayer: TCollection_ExtendedString, lab: TDF_Label): boolean;
FindLayer(aLayer: TCollection_ExtendedString, theToFindWithProperty: boolean, theToFindVisible: boolean): TDF_Label;
// lab: Mutated in place

// Adds a Layer definition to a Layertable and returns its label (returns existing label if the same Layer is already defined) Adds a Layer definition to a Layertable and returns its label Returns existing label (if it is already defined) of visible or invisible layer, according to <theToFindVisible> parameter
AddLayer(theLayer: TCollection_ExtendedString): TDF_Label;
AddLayer(theLayer: TCollection_ExtendedString, theToFindVisible: boolean): TDF_Label;
AddLayer(theLayer: TCollection_ExtendedString): TDF_Label;
AddLayer(theLayer: TCollection_ExtendedString, theToFindVisible: boolean): TDF_Label;

// Removes Layer from the Layertable
RemoveLayer(lab: TDF_Label): void;

// Returns a sequence of Layers currently stored in the Layertable
GetLayerLabels(Labels: NCollection_Sequence_TDF_Label): void;
// Labels: Mutated in place

// Sets a link from label <L> to Layer defined by <LayerL> optional parameter <shapeInOneLayer> show could shape be in number of layers or only in one
SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;
SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;
SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;
SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;

// Removes a link from label <L> to all layers
UnSetLayers(L: TDF_Label): void;
UnSetLayers(Sh: TopoDS_Shape): boolean;
UnSetLayers(L: TDF_Label): void;
UnSetLayers(Sh: TopoDS_Shape): boolean;

// Remove link from label <L> and Layer <aLayer>
UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;

// Returns True if label <L> has a Layer associated with the <aLayer>
IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;

// Return sequence of strings <aLayerS> that associated with label <L>
GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;

// Return sequanese of shape labels that assigned with layers to <ShLabels>
static GetShapesOfLayer(theLayerL: TDF_Label, theShLabels: NCollection_Sequence_TDF_Label): void;
// theShLabels: Mutated in place

// Return TRUE if layer is visible, FALSE if invisible
IsVisible(layerL: TDF_Label): boolean;

// Set the visibility of layer
SetVisibility(layerL: TDF_Label, isvisible?: boolean): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Used to define a Length Unit attribute containing a length unit info
XCAFDoc_LengthUnit: declare class XCAFDoc_LengthUnit extends TDF_Attribute

constructor

// Returns the GUID of the attribute
static GetID(): Standard_GUID;

// Finds or creates a LengthUnit attribute
static Set(theLabel: TDF_Label, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theGUID: Standard_GUID, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
Set(theUnitName: TCollection_AsciiString, theUnitValue: number): void;
static Set(theLabel: TDF_Label, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theGUID: Standard_GUID, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theGUID: Standard_GUID, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
// theUnitValue: length scale factor to meter The LengthUnit attribute is returned

// Length unit description (could be arbitrary text)
GetUnitName(): TCollection_AsciiString;

// Returns length unit scale factor to meter
GetUnitValue(): number;

IsEmpty(): boolean;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
