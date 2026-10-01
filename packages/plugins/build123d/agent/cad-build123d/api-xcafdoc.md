# build123d — XCAFDoc

3 top-level symbols. Signatures are verbatim python.

// Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document.Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document.Provides tools to store and retrieve attributes (colors) of TopoDS_Shape in and from TDocStd_Document A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document
XCAFDoc_ColorTool

  // __init__(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.__init__ (constructor)
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> None

  // BaseLabel(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.BaseLabel (method)
  BaseLabel(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.TDF.TDF_Label

  // IsColor(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.IsColor (method)
  IsColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, lab: OCP.OCP.TDF.TDF_Label) -> bool

  // FindColor(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.FindColor (method)
  FindColor(*args, **kwargs)
  FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color, lab: OCP.OCP.TDF.TDF_Label) -> bool
  FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA, lab: OCP.OCP.TDF.TDF_Label) -> bool
  FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.TDF.TDF_Label
  FindColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.TDF.TDF_Label

  // AddColor(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.AddColor (method)
  AddColor(*args, **kwargs)
  AddColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.TDF.TDF_Label
  AddColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.TDF.TDF_Label

  // RemoveColor(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.RemoveColor (method)
  RemoveColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, lab: OCP.OCP.TDF.TDF_Label) -> None

  // GetColors(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.GetColors (method)
  GetColors(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // SetColor(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.SetColor (method)
  SetColor(*args, **kwargs)
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, colorL: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, Color: OCP.OCP.Quantity.Quantity_Color, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, Color: OCP.OCP.Quantity.Quantity_ColorRGBA, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, colorL: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, Color: OCP.OCP.Quantity.Quantity_Color, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
  SetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, Color: OCP.OCP.Quantity.Quantity_ColorRGBA, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

  // UnSetColor(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.UnSetColor (method)
  UnSetColor(*args, **kwargs)
  UnSetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> None
  UnSetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

  // IsSet(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.IsSet (method)
  IsSet(*args, **kwargs)
  IsSet(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool
  IsSet(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType) -> bool

  // GetColor(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.GetColor (method)
  GetColor(*args, **kwargs)
  GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, colorL: OCP.OCP.TDF.TDF_Label) -> bool
  GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
  GetColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, S: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // SetVisibility(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.SetVisibility (method)
  SetVisibility(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, shapeLabel: OCP.OCP.TDF.TDF_Label, isvisible: bool = True) -> None

  // IsColorByLayer(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.IsColorByLayer (method)
  IsColorByLayer(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, L: OCP.OCP.TDF.TDF_Label) -> bool

  // SetColorByLayer(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.SetColorByLayer (method)
  SetColorByLayer(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, shapeLabel: OCP.OCP.TDF.TDF_Label, isColorByLayer: bool = False) -> None

  // SetInstanceColor(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.SetInstanceColor (method)
  SetInstanceColor(*args, **kwargs)
  SetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color, isCreateSHUO: bool = True) -> bool
  SetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA, isCreateSHUO: bool = True) -> bool

  // GetInstanceColor(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.GetInstanceColor (method)
  GetInstanceColor(*args, **kwargs)
  GetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
  GetInstanceColor(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // IsInstanceVisible(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.IsInstanceVisible (method)
  IsInstanceVisible(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // ReverseChainsOfTreeNodes(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.ReverseChainsOfTreeNodes (method)
  ReverseChainsOfTreeNodes(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> bool

  // DumpJson(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.DumpJson (method)
  DumpJson(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // NewEmpty(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.NewEmpty (method)
  NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.TDF.TDF_Attribute

  // AutoNaming_s() -> bool
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.AutoNaming_s (method)
  AutoNaming_s() -> bool

  // SetAutoNaming_s(theIsAutoNaming
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.SetAutoNaming_s (method)
  SetAutoNaming_s(theIsAutoNaming: bool) -> None

  // Set_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.Set_s (method)
  Set_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ColorTool

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.GetID_s (method)
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // GetColor_s(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.GetColor_s (method)
  GetColor_s(*args, **kwargs)
  GetColor_s(lab: OCP.OCP.TDF.TDF_Label, col: OCP.OCP.Quantity.Quantity_Color) -> bool
  GetColor_s(lab: OCP.OCP.TDF.TDF_Label, col: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool
  GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, colorL: OCP.OCP.TDF.TDF_Label) -> bool
  GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_Color) -> bool
  GetColor_s(L: OCP.OCP.TDF.TDF_Label, type: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, color: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // IsVisible_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.IsVisible_s (method)
  IsVisible_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // get_type_name_s() -> str
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // ShapeTool(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.ShapeTool (method)
  ShapeTool(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

  // ID(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.ID (method)
  ID(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.Standard.Standard_GUID

  // DynamicType(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorTool.DynamicType (method)
  DynamicType(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorTool) -> OCP.OCP.Standard.Standard_Type

// Defines types of color assignments Color of shape is defined following way in dependance with type of color
XCAFDoc_ColorType

  // __init__(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ColorType.__init__ (constructor)
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_ColorType, value: int) -> None

  // name(self
  name

  value

// Defines sections structure of an XDE document
XCAFDoc_DocumentTool

  // __init__(self
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.__init__ (constructor)
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> None

  // Init(self
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.Init (method)
  Init(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> None

  // AfterRetrieval(self
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.AfterRetrieval (method)
  AfterRetrieval(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool, forceIt: bool = False) -> bool

  // NewEmpty(self
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.NewEmpty (method)
  NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> OCP.OCP.TDF.TDF_Attribute

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.GetID_s (method)
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // Set_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.Set_s (method)
  Set_s(L: OCP.OCP.TDF.TDF_Label, IsAcces: bool = True) -> OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool

  // IsXCAFDocument_s(Doc
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.IsXCAFDocument_s (method)
  IsXCAFDocument_s(Doc: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // DocLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.DocLabel_s (method)
  DocLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ShapesLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ShapesLabel_s (method)
  ShapesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ColorsLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ColorsLabel_s (method)
  ColorsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // LayersLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.LayersLabel_s (method)
  LayersLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // DGTsLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.DGTsLabel_s (method)
  DGTsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // MaterialsLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.MaterialsLabel_s (method)
  MaterialsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ViewsLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ViewsLabel_s (method)
  ViewsLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ClippingPlanesLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ClippingPlanesLabel_s (method)
  ClippingPlanesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // NotesLabel_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.NotesLabel_s (method)
  NotesLabel_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // VisMaterialLabel_s(theLabel
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.VisMaterialLabel_s (method)
  VisMaterialLabel_s(theLabel: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDF.TDF_Label

  // ShapeTool_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ShapeTool_s (method)
  ShapeTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

  // CheckShapeTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckShapeTool_s (method)
  CheckShapeTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // ColorTool_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ColorTool_s (method)
  ColorTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ColorTool

  // CheckColorTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckColorTool_s (method)
  CheckColorTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // VisMaterialTool_s(theLabel
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.VisMaterialTool_s (method)
  VisMaterialTool_s(theLabel: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_VisMaterialTool

  // CheckVisMaterialTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckVisMaterialTool_s (method)
  CheckVisMaterialTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // LayerTool_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.LayerTool_s (method)
  LayerTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_LayerTool

  // CheckLayerTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckLayerTool_s (method)
  CheckLayerTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // DimTolTool_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.DimTolTool_s (method)
  DimTolTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_DimTolTool

  // CheckDimTolTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckDimTolTool_s (method)
  CheckDimTolTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // MaterialTool_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.MaterialTool_s (method)
  MaterialTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_MaterialTool

  // CheckMaterialTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckMaterialTool_s (method)
  CheckMaterialTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // ViewTool_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ViewTool_s (method)
  ViewTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ViewTool

  // CheckViewTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckViewTool_s (method)
  CheckViewTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // ClippingPlaneTool_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ClippingPlaneTool_s (method)
  ClippingPlaneTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ClippingPlaneTool

  // CheckClippingPlaneTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckClippingPlaneTool_s (method)
  CheckClippingPlaneTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // NotesTool_s(acces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.NotesTool_s (method)
  NotesTool_s(acces: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_NotesTool

  // CheckNotesTool_s(theAcces
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.CheckNotesTool_s (method)
  CheckNotesTool_s(theAcces: OCP.OCP.TDF.TDF_Label) -> bool

  // GetLengthUnit_s(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.GetLengthUnit_s (method)
  GetLengthUnit_s(*args, **kwargs)
  GetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theResut: float, theBaseUnit: OCP.OCP.UnitsMethods.UnitsMethods_LengthUnit) -> bool
  GetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theResut: float) -> bool

  // SetLengthUnit_s(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.SetLengthUnit_s (method)
  SetLengthUnit_s(*args, **kwargs)
  SetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theUnitValue: float) -> None
  SetLengthUnit_s(theDoc: OCP.OCP.TDocStd.TDocStd_Document, theUnitValue: float, theBaseUnit: OCP.OCP.UnitsMethods.UnitsMethods_LengthUnit) -> None

  // get_type_name_s() -> str
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // ID(self
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.ID (method)
  ID(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> OCP.OCP.Standard.Standard_GUID

  // DynamicType(self
  // OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool.DynamicType (method)
  DynamicType(self: OCP.OCP.XCAFDoc.XCAFDoc_DocumentTool) -> OCP.OCP.Standard.Standard_Type
