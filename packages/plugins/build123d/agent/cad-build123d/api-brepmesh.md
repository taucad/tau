# build123d — BRepMesh

1 top-level symbols. Signatures are verbatim python.

// Builds the mesh of a shape with respect of their correctly triangulated parts
BRepMesh_IncrementalMesh

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> None
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theLinDeflection: float, isRelative: bool = False, theAngDeflection: float = 0.5, isInParallel: bool = False) -> None
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theParameters: OCP.OCP.IMeshTools.IMeshTools_Parameters, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f2ee2b0>) -> None

  // Perform(*args, **kwargs)
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f463eb0>) -> None
  Perform(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theContext: OCP.OCP.IMeshTools.IMeshTools_Context, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f498db0>) -> None

  // IsModified(self
  IsModified(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> bool

  // GetStatusFlags(self
  GetStatusFlags(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> int

  // IsParallelDefault_s() -> bool
  IsParallelDefault_s() -> bool

  // SetParallelDefault_s(isInParallel
  SetParallelDefault_s(isInParallel: bool) -> None

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // Parameters(self
  Parameters(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.IMeshTools.IMeshTools_Parameters

  // ChangeParameters(self
  ChangeParameters(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.IMeshTools.IMeshTools_Parameters

  // DynamicType(self
  DynamicType(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.Standard.Standard_Type
