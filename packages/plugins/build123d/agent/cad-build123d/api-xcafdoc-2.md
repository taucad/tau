# build123d — XCAFDoc (2)

1 top-level symbols. Signatures are verbatim python.

// A tool to store shapes in an XDE document in the form of assembly structure, and to maintain this structure
XCAFDoc_ShapeTool

  // __init__(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.__init__ (constructor)
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // IsTopLevel(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsTopLevel (method)
  IsTopLevel(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSubShape(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsSubShape (method)
  IsSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // SearchUsingMap(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.SearchUsingMap (method)
  SearchUsingMap(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findWithoutLoc: bool, findSubshape: bool) -> bool

  // Search(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.Search (method)
  Search(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findInstance: bool = True, findComponent: bool = True, findSubshape: bool = True) -> bool

  // FindShape(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.FindShape (method)
  FindShape(*args, **kwargs)
  FindShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findInstance: bool = False) -> bool
  FindShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, findInstance: bool = False) -> OCP.OCP.TDF.TDF_Label

  // GetOneShape(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetOneShape (method)
  GetOneShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TopoDS.TopoDS_Shape

  // NewShape(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.NewShape (method)
  NewShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Label

  // SetShape(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.SetShape (method)
  SetShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // AddShape(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.AddShape (method)
  AddShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, makeAssembly: bool = True, makePrepare: bool = True) -> OCP.OCP.TDF.TDF_Label

  // RemoveShape(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.RemoveShape (method)
  RemoveShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, removeCompletely: bool = True) -> bool

  // Init(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.Init (method)
  Init(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // ComputeShapes(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.ComputeShapes (method)
  ComputeShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label) -> None

  // ComputeSimpleShapes(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.ComputeSimpleShapes (method)
  ComputeSimpleShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // GetShapes(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetShapes (method)
  GetShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // GetFreeShapes(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetFreeShapes (method)
  GetFreeShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, FreeLabels: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // AddComponent(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.AddComponent (method)
  AddComponent(*args, **kwargs)
  AddComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, assembly: OCP.OCP.TDF.TDF_Label, comp: OCP.OCP.TDF.TDF_Label, Loc: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TDF.TDF_Label
  AddComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, assembly: OCP.OCP.TDF.TDF_Label, comp: OCP.OCP.TopoDS.TopoDS_Shape, expand: bool = False) -> OCP.OCP.TDF.TDF_Label

  // RemoveComponent(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.RemoveComponent (method)
  RemoveComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, comp: OCP.OCP.TDF.TDF_Label) -> None

  // UpdateAssemblies(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.UpdateAssemblies (method)
  UpdateAssemblies(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // FindSubShape(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.FindSubShape (method)
  FindSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label) -> bool

  // AddSubShape(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.AddSubShape (method)
  AddSubShape(*args, **kwargs)
  AddSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label
  AddSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape, addedSubShapeL: OCP.OCP.TDF.TDF_Label) -> bool

  // FindMainShapeUsingMap(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.FindMainShapeUsingMap (method)
  FindMainShapeUsingMap(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label

  // FindMainShape(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.FindMainShape (method)
  FindMainShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label

  // BaseLabel(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.BaseLabel (method)
  BaseLabel(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Label

  // Dump(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.Dump (method)
  Dump(*args, **kwargs)
  Dump(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theDumpLog: io.BytesIO, deep: bool) -> io.BytesIO
  Dump(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theDumpLog: io.BytesIO) -> io.BytesIO

  // SetExternRefs(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.SetExternRefs (method)
  SetExternRefs(*args, **kwargs)
  SetExternRefs(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> OCP.OCP.TDF.TDF_Label
  SetExternRefs(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> None

  // SetSHUO(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.SetSHUO (method)
  SetSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Labels: OCP.OCP.TDF.TDF_LabelSequence, MainSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // RemoveSHUO(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.RemoveSHUO (method)
  RemoveSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, SHUOLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // FindComponent(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.FindComponent (method)
  FindComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // GetSHUOInstance(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetSHUOInstance (method)
  GetSHUOInstance(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theSHUO: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> OCP.OCP.TopoDS.TopoDS_Shape

  // SetInstanceSHUO(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.SetInstanceSHUO (method)
  SetInstanceSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.XCAFDoc.XCAFDoc_GraphNode

  // GetAllSHUOInstances(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetAllSHUOInstances (method)
  GetAllSHUOInstances(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theSHUO: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode, theSHUOShapeSeq: OCP.OCP.TopTools.TopTools_SequenceOfShape) -> bool

  // SetLocation(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.SetLocation (method)
  SetLocation(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShapeLabel: OCP.OCP.TDF.TDF_Label, theLoc: OCP.OCP.TopLoc.TopLoc_Location, theRefLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Expand(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.Expand (method)
  Expand(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Shape: OCP.OCP.TDF.TDF_Label) -> bool

  // GetNamedProperties(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetNamedProperties (method)
  GetNamedProperties(*args, **kwargs)
  GetNamedProperties(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theLabel: OCP.OCP.TDF.TDF_Label, theToCreate: bool = False) -> OCP.OCP.TDataStd.TDataStd_NamedData
  GetNamedProperties(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theToCreate: bool = False) -> OCP.OCP.TDataStd.TDataStd_NamedData

  // DumpJson(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.DumpJson (method)
  DumpJson(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // NewEmpty(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.NewEmpty (method)
  NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Attribute

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetID_s (method)
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // Set_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.Set_s (method)
  Set_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

  // IsFree_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsFree_s (method)
  IsFree_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsShape_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsShape_s (method)
  IsShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSimpleShape_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsSimpleShape_s (method)
  IsSimpleShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsReference_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsReference_s (method)
  IsReference_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsAssembly_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsAssembly_s (method)
  IsAssembly_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsComponent_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsComponent_s (method)
  IsComponent_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsCompound_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsCompound_s (method)
  IsCompound_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSubShape_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsSubShape_s (method)
  IsSubShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // GetShape_s(*args, **kwargs)
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetShape_s (method)
  GetShape_s(*args, **kwargs)
  GetShape_s(L: OCP.OCP.TDF.TDF_Label, S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  GetShape_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TopoDS.TopoDS_Shape

  // GetOneShape_s(theLabels
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetOneShape_s (method)
  GetOneShape_s(theLabels: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TopoDS.TopoDS_Shape

  // SetAutoNaming_s(V
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.SetAutoNaming_s (method)
  SetAutoNaming_s(V: bool) -> None

  // AutoNaming_s() -> bool
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.AutoNaming_s (method)
  AutoNaming_s() -> bool

  // GetUsers_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetUsers_s (method)
  GetUsers_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence, getsubchilds: bool = False) -> int

  // GetLocation_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetLocation_s (method)
  GetLocation_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TopLoc.TopLoc_Location

  // GetReferredShape_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetReferredShape_s (method)
  GetReferredShape_s(L: OCP.OCP.TDF.TDF_Label, Label: OCP.OCP.TDF.TDF_Label) -> bool

  // NbComponents_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.NbComponents_s (method)
  NbComponents_s(L: OCP.OCP.TDF.TDF_Label, getsubchilds: bool = False) -> int

  // GetComponents_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetComponents_s (method)
  GetComponents_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence, getsubchilds: bool = False) -> bool

  // GetSubShapes_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetSubShapes_s (method)
  GetSubShapes_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // DumpShape_s(theDumpLog
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.DumpShape_s (method)
  DumpShape_s(theDumpLog: io.BytesIO, L: OCP.OCP.TDF.TDF_Label, level: int = 0, deep: bool = False) -> None

  // IsExternRef_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.IsExternRef_s (method)
  IsExternRef_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // GetExternRefs_s(L
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetExternRefs_s (method)
  GetExternRefs_s(L: OCP.OCP.TDF.TDF_Label, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> None

  // GetSHUO_s(SHUOLabel
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetSHUO_s (method)
  GetSHUO_s(SHUOLabel: OCP.OCP.TDF.TDF_Label, aSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // GetAllComponentSHUO_s(CompLabel
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetAllComponentSHUO_s (method)
  GetAllComponentSHUO_s(CompLabel: OCP.OCP.TDF.TDF_Label, SHUOAttrs: OCP.OCP.TDF.TDF_AttributeSequence) -> bool

  // GetSHUOUpperUsage_s(NextUsageL
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetSHUOUpperUsage_s (method)
  GetSHUOUpperUsage_s(NextUsageL: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // GetSHUONextUsage_s(UpperUsageL
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.GetSHUONextUsage_s (method)
  GetSHUONextUsage_s(UpperUsageL: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // FindSHUO_s(Labels
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.FindSHUO_s (method)
  FindSHUO_s(Labels: OCP.OCP.TDF.TDF_LabelSequence, theSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // get_type_name_s() -> str
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // ID(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.ID (method)
  ID(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.Standard.Standard_GUID

  // DynamicType(self
  // OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool.DynamicType (method)
  DynamicType(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.Standard.Standard_Type
