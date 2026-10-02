# build123d — XCAFDoc

3 top-level symbols. Signatures are verbatim python.

// Category: XCAFDoc
// Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document.Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document.Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document
XCAFDoc_ColorTool

  // __init__(self
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> None

  // BaseLabel(self
  // Remarks: returns the label under which colors are stored
  BaseLabel(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.TDF.TDF_Label

  // IsColor(self
  // Remarks: Returns True if label belongs to a colortable and is a color definition
  IsColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, lab: OCP.OCP.TDF.TDF_Label) -> bool

  // FindColor(*args, **kwargs)
  // Remarks: Overloaded function.

1. FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color, lab: OCP.OCP.TDF.TDF_Label) -> bool

Finds a color definition in a colortable and returns its label if found Returns False if color is not found in colortable

2. FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA, lab: OCP.OCP.TDF.TDF_Label) -> bool

Finds a color definition in a colortable and returns its label if found Returns False if color is not found in colortable

3. FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.TDF.TDF_Label

Finds a color definition in a colortable and returns its label if found (or Null label else)

4. FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.TDF.TDF_Label

Finds a color definition in a colortable and returns its label if found (or Null label else)
  FindColor(*args, **kwargs)
  FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color, lab: OCP.OCP.TDF.TDF_Label) -> bool
  FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA, lab: OCP.OCP.TDF.TDF_Label) -> bool
  FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.TDF.TDF_Label
  FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.TDF.TDF_Label

  // AddColor(*args, **kwargs)
  // Remarks: Overloaded function.

1. AddColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.TDF.TDF_Label

Adds a color definition to a colortable and returns its label (returns existing label if the same color is already defined)

2. AddColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.TDF.TDF_Label

Adds a color definition to a colortable and returns its label (returns existing label if the same color is already defined)
  AddColor(*args, **kwargs)
  AddColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.TDF.TDF_Label
  AddColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.TDF.TDF_Label

  // RemoveColor(self
  // Remarks: Removes color from the colortable
  RemoveColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, lab: OCP.OCP.TDF.TDF_Label) -> None

  // GetColors(self
  // Remarks: Returns a sequence of colors currently stored in the colortable
  GetColors(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // SetColor(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, colorL: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None

Sets a link with GUID defined by <type> (see XCAFDoc::ColorRefGUID()) from label <L> to color defined by <colorL>. Color of shape is defined following way in dependance with type of color. If type of color is XCAFDoc_ColorGen - then this color defines default color for surfaces and curves. If for shape color with types XCAFDoc_ColorSurf or XCAFDoc_ColorCurv is specified then such color overrides generic color.

2. SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, Color: OCP.OCP.Quantity.Quantity_Color, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None

Sets a link with GUID defined by <type> (see XCAFDoc::ColorRefGUID()) from label <L> to color <Color> in the colortable Adds a color as necessary

3. SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, Color: OCP.OCP.Quantity.Quantity_ColorRGBA, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None

Sets a link with GUID defined by <type> (see XCAFDoc::ColorRefGUID()) from label <L> to color <Color> in the colortable Adds a color as necessary

4. SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, colorL: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

Sets a link with GUID defined by <type> (see XCAFDoc::ColorRefGUID()) from label <L> to color defined by <colorL> Returns False if cannot find a label for shape S

5. SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, Color: OCP.OCP.Quantity.Quantity_Color, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

Sets a link with GUID defined by <type> (see XCAFDoc::ColorRefGUID()) from label <L> to color <Color> in the colortable Adds a color as necessary Returns False if cannot find a label for shape S

6. SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, Color: OCP.OCP.Quantity.Quantity_ColorRGBA, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

Sets a link with GUID defined by <type> (see XCAFDoc::ColorRefGUID()) from label <L> to color <Color> in the colortable Adds a color as necessary Returns False if cannot find a label for shape S
  SetColor(*args, **kwargs)
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, colorL: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, Color: OCP.OCP.Quantity.Quantity_Color, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, Color: OCP.OCP.Quantity.Quantity_ColorRGBA, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, colorL: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, Color: OCP.OCP.Quantity.Quantity_Color, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, Color: OCP.OCP.Quantity.Quantity_ColorRGBA, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

  // UnSetColor(*args, **kwargs)
  // Remarks: Overloaded function.

1. UnSetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None

Removes a link with GUID defined by <type> (see XCAFDoc::ColorRefGUID()) from label <L> to color

2. UnSetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

Removes a link with GUID defined by <type> (see XCAFDoc::ColorRefGUID()) from label <L> to color Returns True if such link existed
  UnSetColor(*args, **kwargs)
  UnSetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
  UnSetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

  // IsSet(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsSet(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

Returns True if label <L> has a color assignment of the type <type>

2. IsSet(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

Returns True if label <L> has a color assignment of the type <type>
  IsSet(*args, **kwargs)
  IsSet(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
  IsSet(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

  // GetColor(*args, **kwargs)
  // Remarks: Overloaded function.

1. GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, colorL: OCP.OCP.TDF.TDF_Label) -> bool

Returns label with color assigned to <L> as <type> Returns False if no such color is assigned

2. GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool

Returns color assigned to <L> as <type> Returns False if no such color is assigned

3. GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

Returns color assigned to <L> as <type> Returns False if no such color is assigned
  GetColor(*args, **kwargs)
  GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, colorL: OCP.OCP.TDF.TDF_Label) -> bool
  GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
  GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // SetVisibility(self
  // Remarks: Set the visibility of object on label. Do nothing if there no any object. Set UAttribute with corresponding GUID.
  SetVisibility(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, shapeLabel: OCP.OCP.TDF.TDF_Label, isvisible: bool = True) -> None

  // IsColorByLayer(self
  // Remarks: Return TRUE if object color defined by its Layer, FALSE if not.
  IsColorByLayer(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label) -> bool

  // SetColorByLayer(self
  // Remarks: Set the Color defined by Layer flag on label. Do nothing if there no any object. Set UAttribute with corresponding GUID.
  SetColorByLayer(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, shapeLabel: OCP.OCP.TDF.TDF_Label, isColorByLayer: bool = False) -> None

  // SetInstanceColor(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color, isCreateSHUO: bool = True) -> bool

Sets the color of component that styled with SHUO structure Returns FALSE if no sush component found NOTE: create SHUO structeure if it is necessary and if <isCreateSHUO>

2. SetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA, isCreateSHUO: bool = True) -> bool

Sets the color of component that styled with SHUO structure Returns FALSE if no sush component found NOTE: create SHUO structeure if it is necessary and if <isCreateSHUO>
  SetInstanceColor(*args, **kwargs)
  SetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color, isCreateSHUO: bool = True) -> bool
  SetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA, isCreateSHUO: bool = True) -> bool

  // GetInstanceColor(*args, **kwargs)
  // Remarks: Overloaded function.

1. GetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool

Gets the color of component that styled with SHUO structure Returns FALSE if no sush component or color type

2. GetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

Gets the color of component that styled with SHUO structure Returns FALSE if no sush component or color type
  GetInstanceColor(*args, **kwargs)
  GetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
  GetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // IsInstanceVisible(self
  // Remarks: Gets the visibility status of component that styled with SHUO structure Returns FALSE if no sush component
  IsInstanceVisible(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // ReverseChainsOfTreeNodes(self
  // Remarks: Reverses order in chains of TreeNodes (from Last to First) under each Color Label since we became to use function ::Prepend() instead of ::Append() in method SetColor() for acceleration
  ReverseChainsOfTreeNodes(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> bool

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // NewEmpty(self
  NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.TDF.TDF_Attribute

  // AutoNaming_s() -> bool
  // Remarks: Returns current auto-naming mode; TRUE by default. If TRUE then for added colors the TDataStd_Name attribute will be automatically added. This setting is global.
  AutoNaming_s() -> bool

  // SetAutoNaming_s(theIsAutoNaming
  // Remarks: See also AutoNaming().
  SetAutoNaming_s(theIsAutoNaming: bool) -> None

  // Set_s(L
  // Remarks: Creates (if not exist) ColorTool.
  Set_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ColorTool

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // GetColor_s(*args, **kwargs)
  // Remarks: Overloaded function.

1. GetColor_s(lab: OCP.OCP.TDF.TDF_Label, col: OCP.OCP.Quantity.Quantity_Color) -> bool

Returns color defined by label lab Returns False if the label is not in colortable or does not define a color

2. GetColor_s(lab: OCP.OCP.TDF.TDF_Label, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

Returns color defined by label lab Returns False if the label is not in colortable or does not define a color

3. GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, colorL: OCP.OCP.TDF.TDF_Label) -> bool

Returns label with color assigned to <L> as <type> Returns False if no such color is assigned

4. GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool

Returns color assigned to <L> as <type> Returns False if no such color is assigned

5. GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

Returns color assigned to <L> as <type> Returns False if no such color is assigned
  GetColor_s(*args, **kwargs)
  GetColor_s(lab: OCP.OCP.TDF.TDF_Label, col: OCP.OCP.Quantity.Quantity_Color) -> bool
  GetColor_s(lab: OCP.OCP.TDF.TDF_Label, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool
  GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, colorL: OCP.OCP.TDF.TDF_Label) -> bool
  GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
  GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // IsVisible_s(L
  // Remarks: Return TRUE if object on this label is visible, FALSE if invisible.
  IsVisible_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // ShapeTool(self
  // Remarks: Returns internal XCAFDoc_ShapeTool tool
  ShapeTool(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

  // ID(self
  ID(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.Standard.Standard_GUID

  // DynamicType(self
  DynamicType(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.Standard.Standard_Type

// Category: XCAFDoc
// Defines types of color assignments Color of shape is defined following way in dependance with type of color
// Remarks: Members:

  XCAFDoc_ColorGen

  XCAFDoc_ColorSurf

  XCAFDoc_ColorCurv
XCAFDoc_ColorType

  // __init__(self
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, value: int) -> None

  // name(self
  name

  value

// Category: XCAFDoc
// Defines sections structure of an XDE document
XCAFDoc_DocumentTool

  // __init__(self
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> None

  // Init(self
  // Remarks: to be called when reading this attribute from file
  Init(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> None

  // AfterRetrieval(self
  // Remarks: To init this derived attribute after the attribute restore using the base restore-methods
  AfterRetrieval(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool, forceIt: bool = False) -> bool

  // NewEmpty(self
  NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> OCP.OCP.TDF.TDF_Attribute

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // Set_s(L
  // Remarks: Create (if not exist) DocumentTool attribute on 0.1 label if <IsAcces> is true, else on <L> label. This label will be returned by DocLabel(); If the attribute is already set it won't be reset on <L> even if <IsAcces> is false. ColorTool and ShapeTool attributes are also set by this method.
  Set_s(L: OCP.OCP.TDF.TDF_Label, IsAcces: bool = True) -> OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool

  // IsXCAFDocument_s(Doc
  IsXCAFDocument_s(Doc: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // DocLabel_s(acces
  // Remarks: Returns label where the DocumentTool attribute is or 0.1 if DocumentTool is not yet set.
  DocLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ShapesLabel_s(acces
  // Remarks: Returns sub-label of DocLabel() with tag 1.
  ShapesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ColorsLabel_s(acces
  // Remarks: Returns sub-label of DocLabel() with tag 2.
  ColorsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // LayersLabel_s(acces
  // Remarks: Returns sub-label of DocLabel() with tag 3.
  LayersLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // DGTsLabel_s(acces
  // Remarks: Returns sub-label of DocLabel() with tag 4.
  DGTsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // MaterialsLabel_s(acces
  // Remarks: Returns sub-label of DocLabel() with tag 5.
  MaterialsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ViewsLabel_s(acces
  // Remarks: Returns sub-label of DocLabel() with tag 7.
  ViewsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ClippingPlanesLabel_s(acces
  // Remarks: Returns sub-label of DocLabel() with tag 8.
  ClippingPlanesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // NotesLabel_s(acces
  // Remarks: Returns sub-label of DocLabel() with tag 9.
  NotesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // VisMaterialLabel_s(theLabel
  // Remarks: Returns sub-label of DocLabel() with tag 10.
  VisMaterialLabel_s(theLabel: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ShapeTool_s(acces
  // Remarks: Creates (if it does not exist) ShapeTool attribute on ShapesLabel().
  ShapeTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

  // CheckShapeTool_s(theAcces
  // Remarks: Checks for the ShapeTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckShapeTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // ColorTool_s(acces
  // Remarks: Creates (if it does not exist) ColorTool attribute on ColorsLabel().
  ColorTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ColorTool

  // CheckColorTool_s(theAcces
  // Remarks: Checks for the ColorTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckColorTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // VisMaterialTool_s(theLabel
  // Remarks: Creates (if it does not exist) XCAFDoc_VisMaterialTool attribute on VisMaterialLabel(). Should not be confused with MaterialTool() defining physical/manufacturing materials.
  VisMaterialTool_s(theLabel: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_VisMaterialTool

  // CheckVisMaterialTool_s(theAcces
  // Remarks: Checks for the VisMaterialTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckVisMaterialTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // LayerTool_s(acces
  // Remarks: Creates (if it does not exist) LayerTool attribute on LayersLabel().
  LayerTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_LayerTool

  // CheckLayerTool_s(theAcces
  // Remarks: Checks for the LayerTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckLayerTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // DimTolTool_s(acces
  // Remarks: Creates (if it does not exist) DimTolTool attribute on DGTsLabel().
  DimTolTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_DimTolTool

  // CheckDimTolTool_s(theAcces
  // Remarks: Checks for the DimTolTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckDimTolTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // MaterialTool_s(acces
  // Remarks: Creates (if it does not exist) DimTolTool attribute on DGTsLabel().
  MaterialTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_MaterialTool

  // CheckMaterialTool_s(theAcces
  // Remarks: Checks for the MaterialTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckMaterialTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // ViewTool_s(acces
  // Remarks: Creates (if it does not exist) ViewTool attribute on ViewsLabel().
  ViewTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ViewTool

  // CheckViewTool_s(theAcces
  // Remarks: Checks for the ViewTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckViewTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // ClippingPlaneTool_s(acces
  // Remarks: Creates (if it does not exist) ClippingPlaneTool attribute on ClippingPlanesLabel().
  ClippingPlaneTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ClippingPlaneTool

  // CheckClippingPlaneTool_s(theAcces
  // Remarks: Checks for the ClippingPlaneTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckClippingPlaneTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // NotesTool_s(acces
  // Remarks: Creates (if it does not exist) NotesTool attribute on NotesLabel().
  NotesTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_NotesTool

  // CheckNotesTool_s(theAcces
  // Remarks: Checks for the NotesTool attribute on the label's document Returns TRUE if Tool exists, ELSE if it has not been created
  CheckNotesTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // GetLengthUnit_s(*args, **kwargs)
  // Remarks: Overloaded function.

1. GetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theResut: float, theBaseUnit: OCP.OCP.UnitsMethods.UnitsMethods_LengthUnit) -> bool

Returns value of current internal unit for the document converted to base unit type.

2. GetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theResut: float) -> bool

Returns value of current internal unit for the document in meter
  GetLengthUnit_s(*args, **kwargs)
  GetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theResut: float, theBaseUnit: OCP.OCP.UnitsMethods.UnitsMethods_LengthUnit) -> bool
  GetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theResut: float) -> bool

  // SetLengthUnit_s(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theUnitValue: float) -> None

Sets value of current internal unit to the document in meter

2. SetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theUnitValue: float, theBaseUnit: OCP.OCP.UnitsMethods.UnitsMethods_LengthUnit) -> None

Sets value of current internal unit to the document
  SetLengthUnit_s(*args, **kwargs)
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
