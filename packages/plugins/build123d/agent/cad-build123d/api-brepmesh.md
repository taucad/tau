# build123d — BRepMesh

1 top-level symbols. Signatures are verbatim python.

// Builds the mesh of a shape with respect of their correctly triangulated parts
BRepMesh_IncrementalMesh

  // __init__(*args, **kwargs)
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> None
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theLinDeflection: float, isRelative: bool = False, theAngDeflection: float = 0.5, isInParallel: bool = False) -> None
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theParameters: OCP.OCP.IMeshTools.IMeshTools_Parameters, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f2ee2b0>) -> None

  // Perform(*args, **kwargs)
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.Perform (method)
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f463eb0>) -> None
  Perform(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theContext: OCP.OCP.IMeshTools.IMeshTools_Context, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f498db0>) -> None

  // IsModified(self
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.IsModified (method)
  IsModified(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> bool

  // GetStatusFlags(self
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.GetStatusFlags (method)
  GetStatusFlags(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> int

  // IsParallelDefault_s() -> bool
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.IsParallelDefault_s (method)
  IsParallelDefault_s() -> bool

  // SetParallelDefault_s(isInParallel
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.SetParallelDefault_s (method)
  SetParallelDefault_s(isInParallel: bool) -> None

  // get_type_name_s() -> str
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // Parameters(self
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.Parameters (method)
  Parameters(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.IMeshTools.IMeshTools_Parameters

  // ChangeParameters(self
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.ChangeParameters (method)
  ChangeParameters(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.IMeshTools.IMeshTools_Parameters

  // DynamicType(self
  // OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh.DynamicType (method)
  DynamicType(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.Standard.Standard_Type
