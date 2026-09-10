# build123d — XCAFDoc

3 top-level symbols. Signatures are verbatim python.

// Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document.Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document.Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document
XCAFDoc_ColorTool

// **init**(self
**init**(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> None

// BaseLabel(self
BaseLabel(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.TDF.TDF_Label

// IsColor(self
IsColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, lab: OCP.OCP.TDF.TDF_Label) -> bool

// FindColor(*args, \*\*kwargs)
FindColor(*args, \*\*kwargs)
FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color, lab: OCP.OCP.TDF.TDF_Label) -> bool
FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA, lab: OCP.OCP.TDF.TDF_Label) -> bool
FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.TDF.TDF_Label
FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.TDF.TDF_Label

// AddColor(*args, \*\*kwargs)
AddColor(*args, \*\*kwargs)
AddColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.TDF.TDF_Label
AddColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.TDF.TDF_Label

// RemoveColor(self
RemoveColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, lab: OCP.OCP.TDF.TDF_Label) -> None

// GetColors(self
GetColors(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> None

// SetColor(*args, \*\*kwargs)
SetColor(*args, \*\*kwargs)
SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, colorL: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, Color: OCP.OCP.Quantity.Quantity_Color, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, Color: OCP.OCP.Quantity.Quantity_ColorRGBA, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, colorL: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, Color: OCP.OCP.Quantity.Quantity_Color, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, Color: OCP.OCP.Quantity.Quantity_ColorRGBA, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

// UnSetColor(*args, \*\*kwargs)
UnSetColor(*args, \*\*kwargs)
UnSetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
UnSetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

// IsSet(*args, \*\*kwargs)
IsSet(*args, \*\*kwargs)
IsSet(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
IsSet(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

// GetColor(*args, \*\*kwargs)
GetColor(*args, \*\*kwargs)
GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, colorL: OCP.OCP.TDF.TDF_Label) -> bool
GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

// SetVisibility(self
SetVisibility(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, shapeLabel: OCP.OCP.TDF.TDF_Label, isvisible: bool = True) -> None

// IsColorByLayer(self
IsColorByLayer(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label) -> bool

// SetColorByLayer(self
SetColorByLayer(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, shapeLabel: OCP.OCP.TDF.TDF_Label, isColorByLayer: bool = False) -> None

// SetInstanceColor(*args, \*\*kwargs)
SetInstanceColor(*args, \*\*kwargs)
SetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color, isCreateSHUO: bool = True) -> bool
SetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA, isCreateSHUO: bool = True) -> bool

// GetInstanceColor(*args, \*\*kwargs)
GetInstanceColor(*args, \*\*kwargs)
GetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
GetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

// IsInstanceVisible(self
IsInstanceVisible(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

// ReverseChainsOfTreeNodes(self
ReverseChainsOfTreeNodes(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> bool

// DumpJson(self
DumpJson(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theOStream: io.BytesIO, theDepth: int = -1) -> None

// NewEmpty(self
NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.TDF.TDF_Attribute

// AutoNaming_s() -> bool
AutoNaming_s() -> bool

// SetAutoNaming_s(theIsAutoNaming
SetAutoNaming_s(theIsAutoNaming: bool) -> None

// Set_s(L
Set_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ColorTool

// GetID_s() -> OCP.OCP.Standard.Standard_GUID
GetID_s() -> OCP.OCP.Standard.Standard_GUID

// GetColor_s(*args, \*\*kwargs)
GetColor_s(*args, \*\*kwargs)
GetColor_s(lab: OCP.OCP.TDF.TDF_Label, col: OCP.OCP.Quantity.Quantity_Color) -> bool
GetColor_s(lab: OCP.OCP.TDF.TDF_Label, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool
GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, colorL: OCP.OCP.TDF.TDF_Label) -> bool
GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

// IsVisible_s(L
IsVisible_s(L: OCP.OCP.TDF.TDF_Label) -> bool

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// ShapeTool(self
ShapeTool(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

// ID(self
ID(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.Standard.Standard_GUID

// DynamicType(self
DynamicType(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.Standard.Standard_Type

// Defines types of color assignments Color of shape is defined following way in dependance with type of color
XCAFDoc_ColorType

// **init**(self
**init**(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, value: int) -> None

// name(self
name

value

// Defines sections structure of an XDE document
XCAFDoc_DocumentTool

// **init**(self
**init**(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> None

// Init(self
Init(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> None

// AfterRetrieval(self
AfterRetrieval(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool, forceIt: bool = False) -> bool

// NewEmpty(self
NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> OCP.OCP.TDF.TDF_Attribute

// GetID_s() -> OCP.OCP.Standard.Standard_GUID
GetID_s() -> OCP.OCP.Standard.Standard_GUID

// Set_s(L
Set_s(L: OCP.OCP.TDF.TDF_Label, IsAcces: bool = True) -> OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool

// IsXCAFDocument_s(Doc
IsXCAFDocument_s(Doc: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// DocLabel_s(acces
DocLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// ShapesLabel_s(acces
ShapesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// ColorsLabel_s(acces
ColorsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// LayersLabel_s(acces
LayersLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// DGTsLabel_s(acces
DGTsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// MaterialsLabel_s(acces
MaterialsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// ViewsLabel_s(acces
ViewsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// ClippingPlanesLabel_s(acces
ClippingPlanesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// NotesLabel_s(acces
NotesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// VisMaterialLabel_s(theLabel
VisMaterialLabel_s(theLabel: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

// ShapeTool_s(acces
ShapeTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

// CheckShapeTool_s(theAcces
CheckShapeTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// ColorTool_s(acces
ColorTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ColorTool

// CheckColorTool_s(theAcces
CheckColorTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// VisMaterialTool_s(theLabel
VisMaterialTool_s(theLabel: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_VisMaterialTool

// CheckVisMaterialTool_s(theAcces
CheckVisMaterialTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// LayerTool_s(acces
LayerTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_LayerTool

// CheckLayerTool_s(theAcces
CheckLayerTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// DimTolTool_s(acces
DimTolTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_DimTolTool

// CheckDimTolTool_s(theAcces
CheckDimTolTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// MaterialTool_s(acces
MaterialTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_MaterialTool

// CheckMaterialTool_s(theAcces
CheckMaterialTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// ViewTool_s(acces
ViewTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ViewTool

// CheckViewTool_s(theAcces
CheckViewTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// ClippingPlaneTool_s(acces
ClippingPlaneTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ClippingPlaneTool

// CheckClippingPlaneTool_s(theAcces
CheckClippingPlaneTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// NotesTool_s(acces
NotesTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_NotesTool

// CheckNotesTool_s(theAcces
CheckNotesTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

// GetLengthUnit_s(*args, \*\*kwargs)
GetLengthUnit_s(*args, \*\*kwargs)
GetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theResut: float, theBaseUnit: OCP.OCP.UnitsMethods.UnitsMethods_LengthUnit) -> bool
GetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theResut: float) -> bool

// SetLengthUnit_s(*args, \*\*kwargs)
SetLengthUnit_s(*args, \*\*kwargs)
SetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theUnitValue: float) -> None
SetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theUnitValue: float, theBaseUnit: OCP.OCP.UnitsMethods.UnitsMethods_LengthUnit) -> None

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// ID(self
ID(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> OCP.OCP.Standard.Standard_GUID

// DynamicType(self
DynamicType(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> OCP.OCP.Standard.Standard_Type
