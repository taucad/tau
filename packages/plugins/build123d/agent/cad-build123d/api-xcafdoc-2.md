# build123d — XCAFDoc (2)

1 top-level symbols. Signatures are verbatim python.

// Category: XCAFDoc
// A tool to store shapes in an XDE document in the form of assembly structure, and to maintain this structure
XCAFDoc_ShapeTool

  // __init__(self
  __init__(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // IsTopLevel(self
  // Remarks: Returns True if the label is a label of top-level shape, as opposed to component of assembly or subshape
  IsTopLevel(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSubShape(self
  // Remarks: Checks whether shape is subshape of shape stored on label shapeL
  IsSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // SearchUsingMap(self
  SearchUsingMap(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findWithoutLoc: bool, findSubshape: bool) -> bool

  // Search(self
  // Remarks: General tool to find a (sub) shape in the document * If findInstance is True, and S has a non-null location, first tries to find the shape among the top-level shapes with this location * If not found, and findComponent is True, tries to find the shape among the components of assemblies * If not found, tries to find the shape without location among top-level shapes * If not found and findSubshape is True, tries to find a shape as a subshape of top-level simple shapes Returns False if nothing is found
  Search(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findInstance: bool = True, findComponent: bool = True, findSubshape: bool = True) -> bool

  // FindShape(*args, **kwargs)
  // Remarks: Overloaded function.

1. FindShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findInstance: bool = False) -> bool

Returns the label corresponding to shape S (searches among top-level shapes, not including subcomponents of assemblies and subshapes) If findInstance is False (default), search for the input shape without location If findInstance is True, searches for the input shape as is. Return True if <S> is found.

2. FindShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, findInstance: bool = False) -> OCP.OCP.TDF.TDF_Label

Does the same as previous method Returns Null label if not found
  FindShape(*args, **kwargs)
  FindShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label, findInstance: bool = False) -> bool
  FindShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, findInstance: bool = False) -> OCP.OCP.TDF.TDF_Label

  // GetOneShape(self
  // Remarks: Gets shape from a sequence of all top-level shapes which are free
  GetOneShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TopoDS.TopoDS_Shape

  // NewShape(self
  // Remarks: Creates new (empty) top-level shape. Initially it holds empty TopoDS_Compound
  NewShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Label

  // SetShape(self
  // Remarks: Sets representation (TopoDS_Shape) for top-level shape.
  SetShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // AddShape(self
  // Remarks: Adds a new top-level (creates and returns a new label) If makeAssembly is True, treats TopAbs_COMPOUND shapes as assemblies (creates assembly structure). NOTE: <makePrepare> replace components without location in assembly by located components to avoid some problems. If AutoNaming() is True then automatically attaches names.
  AddShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, S: OCP.OCP.TopoDS.TopoDS_Shape, makeAssembly: bool = True, makePrepare: bool = True) -> OCP.OCP.TDF.TDF_Label

  // RemoveShape(self
  // Remarks: Removes shape (whole label and all its sublabels) If removeCompletely is true, removes complete shape If removeCompletely is false, removes instance(location) only Returns False (and does nothing) if shape is not free or is not top-level shape
  RemoveShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, removeCompletely: bool = True) -> bool

  // Init(self
  // Remarks: set hasComponents into false
  Init(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // ComputeShapes(self
  // Remarks: recursive
  ComputeShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label) -> None

  // ComputeSimpleShapes(self
  // Remarks: Compute a sequence of simple shapes
  ComputeSimpleShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // GetShapes(self
  // Remarks: Returns a sequence of all top-level shapes
  GetShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // GetFreeShapes(self
  // Remarks: Returns a sequence of all top-level shapes which are free (i.e. not referred by any other)
  GetFreeShapes(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, FreeLabels: OCP.OCP.TDF.TDF_LabelSequence) -> None

  // AddComponent(*args, **kwargs)
  // Remarks: Overloaded function.

1. AddComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, assembly: OCP.OCP.TDF.TDF_Label, comp: OCP.OCP.TDF.TDF_Label, Loc: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TDF.TDF_Label

Adds a component given by its label and location to the assembly Note: assembly must be IsAssembly() or IsSimpleShape()

2. AddComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, assembly: OCP.OCP.TDF.TDF_Label, comp: OCP.OCP.TopoDS.TopoDS_Shape, expand: bool = False) -> OCP.OCP.TDF.TDF_Label

Adds a shape (located) as a component to the assembly If necessary, creates an additional top-level shape for component and return the Label of component. If expand is True and component is Compound, it will be created as assembly also Note: assembly must be IsAssembly() or IsSimpleShape()
  AddComponent(*args, **kwargs)
  AddComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, assembly: OCP.OCP.TDF.TDF_Label, comp: OCP.OCP.TDF.TDF_Label, Loc: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.TDF.TDF_Label
  AddComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, assembly: OCP.OCP.TDF.TDF_Label, comp: OCP.OCP.TopoDS.TopoDS_Shape, expand: bool = False) -> OCP.OCP.TDF.TDF_Label

  // RemoveComponent(self
  // Remarks: Removes a component from its assembly
  RemoveComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, comp: OCP.OCP.TDF.TDF_Label) -> None

  // UpdateAssemblies(self
  // Remarks: Top-down update for all assembly compounds stored in the document.
  UpdateAssemblies(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> None

  // FindSubShape(self
  // Remarks: Finds a label for subshape of shape stored on label shapeL Returns Null label if it is not found
  FindSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape, L: OCP.OCP.TDF.TDF_Label) -> bool

  // AddSubShape(*args, **kwargs)
  // Remarks: Overloaded function.

1. AddSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label

Adds a label for subshape of shape stored on label shapeL Returns Null label if it is not subshape

2. AddSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape, addedSubShapeL: OCP.OCP.TDF.TDF_Label) -> bool

Adds (of finds already existed) a label for subshape of shape stored on label shapeL. Label addedSubShapeL returns added (found) label or empty in case of wrong subshape. Returns True, if new shape was added, False in case of already existed subshape/wrong subshape
  AddSubShape(*args, **kwargs)
  AddSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label
  AddSubShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, shapeL: OCP.OCP.TDF.TDF_Label, sub: OCP.OCP.TopoDS.TopoDS_Shape, addedSubShapeL: OCP.OCP.TDF.TDF_Label) -> bool

  // FindMainShapeUsingMap(self
  FindMainShapeUsingMap(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label

  // FindMainShape(self
  // Remarks: Performs a search among top-level shapes to find the shape containing as subshape Checks only simple shapes, and returns the first found label (which should be the only one for valid model)
  FindMainShape(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, sub: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TDF.TDF_Label

  // BaseLabel(self
  // Remarks: returns the label under which shapes are stored
  BaseLabel(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Label

  // Dump(*args, **kwargs)
  // Remarks: Overloaded function.

1. Dump(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theDumpLog: io.BytesIO, deep: bool) -> io.BytesIO

2. Dump(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theDumpLog: io.BytesIO) -> io.BytesIO
  Dump(*args, **kwargs)
  Dump(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theDumpLog: io.BytesIO, deep: bool) -> io.BytesIO
  Dump(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theDumpLog: io.BytesIO) -> io.BytesIO

  // SetExternRefs(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetExternRefs(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> OCP.OCP.TDF.TDF_Label

Sets the names of references on the no-step files

2. SetExternRefs(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> None

Sets the names of references on the no-step files
  SetExternRefs(*args, **kwargs)
  SetExternRefs(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> OCP.OCP.TDF.TDF_Label
  SetExternRefs(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, L: OCP.OCP.TDF.TDF_Label, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> None

  // SetSHUO(self
  // Remarks: Sets the SHUO structure between upper_usage and next_usage create multy-level (if number of labels > 2) SHUO from first to last Initialise out <MainSHUOAttr> by main upper_usage SHUO attribute. Returns FALSE if some of labels in not component label
  SetSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Labels: OCP.OCP.TDF.TDF_LabelSequence, MainSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // RemoveSHUO(self
  // Remarks: Remove SHUO from component sublabel, remove all dependencies on other SHUO. Returns FALSE if cannot remove SHUO dependencies. NOTE: remove any styles that associated with this SHUO.
  RemoveSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, SHUOLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // FindComponent(self
  // Remarks: Search the path of labels in the document, that corresponds the component from any assembly Try to search the sequence of labels with location that produce this shape as component of any assembly NOTE: Clear sequence of labels before filling
  FindComponent(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // GetSHUOInstance(self
  // Remarks: Search for the component shape that styled by shuo Returns null shape if no any shape is found.
  GetSHUOInstance(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theSHUO: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> OCP.OCP.TopoDS.TopoDS_Shape

  // SetInstanceSHUO(self
  // Remarks: Search for the component shape by labelks path and set SHUO structure for founded label structure Returns null attribute if no component in any assembly found.
  SetInstanceSHUO(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.XCAFDoc.XCAFDoc_GraphNode

  // GetAllSHUOInstances(self
  // Remarks: Searching for component shapes that styled by shuo Returns empty sequence of shape if no any shape is found.
  GetAllSHUOInstances(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theSHUO: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode, theSHUOShapeSeq: OCP.OCP.TopTools.TopTools_SequenceOfShape) -> bool

  // SetLocation(self
  // Remarks: Sets location to the shape label If label is reference -> changes location attribute If label is free shape -> creates reference with location to it
  SetLocation(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShapeLabel: OCP.OCP.TDF.TDF_Label, theLoc: OCP.OCP.TopLoc.TopLoc_Location, theRefLabel: OCP.OCP.TDF.TDF_Label) -> bool

  // Expand(self
  // Remarks: Convert Shape (compound/compsolid/shell/wire) to assembly
  Expand(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Shape: OCP.OCP.TDF.TDF_Label) -> bool

  // GetNamedProperties(*args, **kwargs)
  // Remarks: Overloaded function.

1. GetNamedProperties(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theLabel: OCP.OCP.TDF.TDF_Label, theToCreate: bool = False) -> OCP.OCP.TDataStd.TDataStd_NamedData

Method to get NamedData attribute assigned to the given shape label.

2. GetNamedProperties(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theToCreate: bool = False) -> OCP.OCP.TDataStd.TDataStd_NamedData

Method to get NamedData attribute assigned to a label of the given shape.
  GetNamedProperties(*args, **kwargs)
  GetNamedProperties(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theLabel: OCP.OCP.TDF.TDF_Label, theToCreate: bool = False) -> OCP.OCP.TDataStd.TDataStd_NamedData
  GetNamedProperties(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theToCreate: bool = False) -> OCP.OCP.TDataStd.TDataStd_NamedData

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // NewEmpty(self
  NewEmpty(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.TDF.TDF_Attribute

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // Set_s(L
  // Remarks: Create (if not exist) ShapeTool from XCAFDoc on <L>.
  Set_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool

  // IsFree_s(L
  // Remarks: Returns True if the label is not used by any assembly, i.e. contains sublabels which are assembly components This is relevant only if IsShape() is True (There is no Father TreeNode on this <L>)
  IsFree_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsShape_s(L
  // Remarks: Returns True if the label represents a shape (simple shape, assembly or reference)
  IsShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSimpleShape_s(L
  // Remarks: Returns True if the label is a label of simple shape
  IsSimpleShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsReference_s(L
  // Remarks: Return true if <L> is a located instance of other shape i.e. reference
  IsReference_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsAssembly_s(L
  // Remarks: Returns True if the label is a label of assembly, i.e. contains sublabels which are assembly components This is relevant only if IsShape() is True
  IsAssembly_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsComponent_s(L
  // Remarks: Return true if <L> is reference serving as component of assembly
  IsComponent_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsCompound_s(L
  // Remarks: Returns True if the label is a label of compound, i.e. contains some sublabels This is relevant only if IsShape() is True
  IsCompound_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // IsSubShape_s(L
  // Remarks: Return true if <L> is subshape of the top-level shape
  IsSubShape_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // GetShape_s(*args, **kwargs)
  // Remarks: Overloaded function.

1. GetShape_s(L: OCP.OCP.TDF.TDF_Label, S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

To get TopoDS_Shape from shape's label For component, returns new shape with correct location Returns False if label does not contain shape

2. GetShape_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TopoDS.TopoDS_Shape

To get TopoDS_Shape from shape's label For component, returns new shape with correct location Returns Null shape if label does not contain shape
  GetShape_s(*args, **kwargs)
  GetShape_s(L: OCP.OCP.TDF.TDF_Label, S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  GetShape_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TopoDS.TopoDS_Shape

  // GetOneShape_s(theLabels
  // Remarks: Gets shape from a sequence of shape's labels
  GetOneShape_s(theLabels: OCP.OCP.TDF.TDF_LabelSequence) -> OCP.OCP.TopoDS.TopoDS_Shape

  // SetAutoNaming_s(V
  // Remarks: Sets auto-naming mode to <V>. If True then for added shapes, links, assemblies and SHUO's, the TDataStd_Name attribute is automatically added. For shapes it contains a shape type (e.g. "SOLID", "SHELL", etc); for links it has a form "=>[0:1:1:2]" (where a tag is a label containing a shape without a location); for assemblies it is "ASSEMBLY", and "SHUO" for SHUO's. This setting is global; it cannot be made a member function as it is used by static methods as well. By default, auto-naming is enabled. See also AutoNaming().
  SetAutoNaming_s(V: bool) -> None

  // AutoNaming_s() -> bool
  // Remarks: Returns current auto-naming mode. See SetAutoNaming() for description.
  AutoNaming_s() -> bool

  // GetUsers_s(L
  // Remarks: Returns list of labels which refer shape L as component Returns number of users (0 if shape is free)
  GetUsers_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence, getsubchilds: bool = False) -> int

  // GetLocation_s(L
  // Remarks: Returns location of instance
  GetLocation_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TopLoc.TopLoc_Location

  // GetReferredShape_s(L
  // Remarks: Returns label which corresponds to a shape referred by L Returns False if label is not reference
  GetReferredShape_s(L: OCP.OCP.TDF.TDF_Label, Label: OCP.OCP.TDF.TDF_Label) -> bool

  // NbComponents_s(L
  // Remarks: Returns number of Assembles components
  NbComponents_s(L: OCP.OCP.TDF.TDF_Label, getsubchilds: bool = False) -> int

  // GetComponents_s(L
  // Remarks: Returns list of components of assembly Returns False if label is not assembly
  GetComponents_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence, getsubchilds: bool = False) -> bool

  // GetSubShapes_s(L
  // Remarks: Returns list of labels identifying subshapes of the given shape Returns False if no subshapes are placed on that label
  GetSubShapes_s(L: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // DumpShape_s(theDumpLog
  // Remarks: Print to std::ostream <theDumpLog> type of shape found on <L> label and the entry of <L>, with <level> tabs before. If <deep>, print also TShape and Location addresses
  DumpShape_s(theDumpLog: io.BytesIO, L: OCP.OCP.TDF.TDF_Label, level: int = 0, deep: bool = False) -> None

  // IsExternRef_s(L
  // Remarks: Returns True if the label is a label of external references, i.e. there are some reference on the no-step files, which are described in document only their names
  IsExternRef_s(L: OCP.OCP.TDF.TDF_Label) -> bool

  // GetExternRefs_s(L
  // Remarks: Gets the names of references on the no-step files
  GetExternRefs_s(L: OCP.OCP.TDF.TDF_Label, SHAS: OCP.OCP.TColStd.TColStd_SequenceOfHAsciiString) -> None

  // GetSHUO_s(SHUOLabel
  // Remarks: Returns founded SHUO GraphNode attribute <aSHUOAttr> Returns false in other case
  GetSHUO_s(SHUOLabel: OCP.OCP.TDF.TDF_Label, aSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // GetAllComponentSHUO_s(CompLabel
  // Remarks: Returns founded SHUO GraphNodes of indicated component Returns false in other case
  GetAllComponentSHUO_s(CompLabel: OCP.OCP.TDF.TDF_Label, SHUOAttrs: OCP.OCP.TDF.TDF_AttributeSequence) -> bool

  // GetSHUOUpperUsage_s(NextUsageL
  // Remarks: Returns the sequence of labels of SHUO attributes, which is upper_usage for this next_usage SHUO attribute (that indicated by label) NOTE: returns upper_usages only on one level (not recurse) NOTE: do not clear the sequence before filling
  GetSHUOUpperUsage_s(NextUsageL: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // GetSHUONextUsage_s(UpperUsageL
  // Remarks: Returns the sequence of labels of SHUO attributes, which is next_usage for this upper_usage SHUO attribute (that indicated by label) NOTE: returns next_usages only on one level (not recurse) NOTE: do not clear the sequence before filling
  GetSHUONextUsage_s(UpperUsageL: OCP.OCP.TDF.TDF_Label, Labels: OCP.OCP.TDF.TDF_LabelSequence) -> bool

  // FindSHUO_s(Labels
  // Remarks: Searches the SHUO by labels of components from upper_usage component to next_usage Returns null attribute if no SHUO found
  FindSHUO_s(Labels: OCP.OCP.TDF.TDF_LabelSequence, theSHUOAttr: OCP.OCP.XCAFDoc.XCAFDoc_GraphNode) -> bool

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // ID(self
  ID(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.Standard.Standard_GUID

  // DynamicType(self
  DynamicType(self: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool) -> OCP.OCP.Standard.Standard_Type
