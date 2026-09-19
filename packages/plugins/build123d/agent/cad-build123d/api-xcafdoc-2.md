# build123d — XCAFDoc (2)

1 top-level symbols. Signatures are verbatim python.

// A tool to store shapes in an XDE document in the form of assembly structure, and to maintain this structure
XCAFDoc_ShapeTool

  // __init__(self
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // IsTopLevel(self
  IsTopLevel(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSubShape(self
  IsSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // SearchUsingMap(self
  SearchUsingMap(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findWithoutLoc: bool, findSubshape: bool) -> bool

  // Search(self
  Search(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findInstance: bool = True, findComponent: bool = True, findSubshape: bool = True) -> bool

  // FindShape(*args, **kwargs)
  FindShape(*args, **kwargs)
  FindShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findInstance: bool = False) -> bool
  FindShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, findInstance: bool = False) -> OCP.OCP.TDF.TDF_Label

  // GetOneShape(self
  GetOneShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TopoDS.TopoDS_Shape

  // NewShape(self
  NewShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Label

  // SetShape(self
  SetShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // AddShape(self
  AddShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, makeAssembly: bool = True, makePrepare: bool = True) -> OCP.OCP.TDF.TDF_Label

  // RemoveShape(self
  RemoveShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, removeCompletely: bool = True) -> bool

  // Init(self
  Init(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // ComputeShapes(self
  ComputeShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label) -> None

  // ComputeSimpleShapes(self
  ComputeSimpleShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // GetShapes(self
  GetShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // GetFreeShapes(self
  GetFreeShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, FreeLabels: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // AddComponent(*args, **kwargs)
  AddComponent(*args, **kwargs)
  AddComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, assembly: OCP.OCP.TDF.TDF_Label, comp: OCP.OCP.TDF.TDF_Label, Loc: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TDF.TDF_Label
  AddComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, assembly: OCP.OCP.TDF.TDF_Label, comp: OCP.OCP.TopoDS.TopoDS_Shape, expand: bool = False) -> OCP.OCP.TDF.TDF_Label

  // RemoveComponent(self
  RemoveComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, comp: OCP.OCP.TDF.TDF_Label) -> None

  // UpdateAssemblies(self
  UpdateAssemblies(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // FindSubShape(self
  FindSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label) -> bool

  // AddSubShape(*args, **kwargs)
  AddSubShape(*args, **kwargs)
  AddSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label
  AddSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape, addedSubShapeL: OCP.OCP.TDF.TDF_Label) -> bool

  // FindMainShapeUsingMap(self
  FindMainShapeUsingMap(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label

  // FindMainShape(self
  FindMainShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label

  // BaseLabel(self
  BaseLabel(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Label

  // Dump(*args, **kwargs)
  Dump(*args, **kwargs)
  Dump(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theDumpLog: io.BytesIO, deep: bool) -> io.BytesIO
  Dump(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theDumpLog: io.BytesIO) -> io.BytesIO

  // SetExternRefs(*args, **kwargs)
  SetExternRefs(*args, **kwargs)
  SetExternRefs(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> OCP.OCP.TDF.TDF_Label
  SetExternRefs(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> None

  // SetSHUO(self
  SetSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Labels: OCP.OCP.TDF.TDF_LabelSequence, MainSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // RemoveSHUO(self
  RemoveSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, SHUOLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // FindComponent(self
  FindComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // GetSHUOInstance(self
  GetSHUOInstance(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theSHUO: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> OCP.OCP.TopoDS.TopoDS_Shape

  // SetInstanceSHUO(self
  SetInstanceSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.XCAFDoc.XCAFDoc_GraphNode

  // GetAllSHUOInstances(self
  GetAllSHUOInstances(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theSHUO: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode, theSHUOShapeSeq: OCP.OCP.TopTools.TopTools_SequenceOfShape) -> bool

  // SetLocation(self
  SetLocation(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShapeLabel: OCP.OCP.TDF.TDF_Label, theLoc: OCP.OCP.TopLoc.TopLoc_Location, theRefLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Expand(self
  Expand(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Shape: OCP.OCP.TDF.TDF_Label) -> bool

  // GetNamedProperties(*args, **kwargs)
  GetNamedProperties(*args, **kwargs)
  GetNamedProperties(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theLabel: OCP.OCP.TDF.TDF_Label, theToCreate: bool = False) -> OCP.OCP.TDataStd.TDataStd_NamedData
  GetNamedProperties(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theToCreate: bool = False) -> OCP.OCP.TDataStd.TDataStd_NamedData

  // DumpJson(self
  DumpJson(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // NewEmpty(self
  NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Attribute

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // Set_s(L
  Set_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

  // IsFree_s(L
  IsFree_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsShape_s(L
  IsShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSimpleShape_s(L
  IsSimpleShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsReference_s(L
  IsReference_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsAssembly_s(L
  IsAssembly_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsComponent_s(L
  IsComponent_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsCompound_s(L
  IsCompound_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSubShape_s(L
  IsSubShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // GetShape_s(*args, **kwargs)
  GetShape_s(*args, **kwargs)
  GetShape_s(L: OCP.OCP.TDF.TDF_Label, S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  GetShape_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TopoDS.TopoDS_Shape

  // GetOneShape_s(theLabels
  GetOneShape_s(theLabels: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TopoDS.TopoDS_Shape

  // SetAutoNaming_s(V
  SetAutoNaming_s(V: bool) -> None

  // AutoNaming_s() -> bool
  AutoNaming_s() -> bool

  // GetUsers_s(L
  GetUsers_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence, getsubchilds: bool = False) -> int

  // GetLocation_s(L
  GetLocation_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TopLoc.TopLoc_Location

  // GetReferredShape_s(L
  GetReferredShape_s(L: OCP.OCP.TDF.TDF_Label, Label: OCP.OCP.TDF.TDF_Label) -> bool

  // NbComponents_s(L
  NbComponents_s(L: OCP.OCP.TDF.TDF_Label, getsubchilds: bool = False) -> int

  // GetComponents_s(L
  GetComponents_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence, getsubchilds: bool = False) -> bool

  // GetSubShapes_s(L
  GetSubShapes_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // DumpShape_s(theDumpLog
  DumpShape_s(theDumpLog: io.BytesIO, L: OCP.OCP.TDF.TDF_Label, level: int = 0, deep: bool = False) -> None

  // IsExternRef_s(L
  IsExternRef_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // GetExternRefs_s(L
  GetExternRefs_s(L: OCP.OCP.TDF.TDF_Label, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> None

  // GetSHUO_s(SHUOLabel
  GetSHUO_s(SHUOLabel: OCP.OCP.TDF.TDF_Label, aSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // GetAllComponentSHUO_s(CompLabel
  GetAllComponentSHUO_s(CompLabel: OCP.OCP.TDF.TDF_Label, SHUOAttrs: OCP.OCP.TDF.TDF_AttributeSequence) -> bool

  // GetSHUOUpperUsage_s(NextUsageL
  GetSHUOUpperUsage_s(NextUsageL: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // GetSHUONextUsage_s(UpperUsageL
  GetSHUONextUsage_s(UpperUsageL: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // FindSHUO_s(Labels
  FindSHUO_s(Labels: OCP.OCP.TDF.TDF_LabelSequence, theSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // ID(self
  ID(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.Standard.Standard_GUID

  // DynamicType(self
  DynamicType(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.Standard.Standard_Type
