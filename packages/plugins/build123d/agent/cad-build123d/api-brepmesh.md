# build123d — BRepMesh

1 top-level symbols. Signatures are verbatim python.

// Category: BRepMesh
// Builds the mesh of a shape with respect of their correctly triangulated parts
BRepMesh_IncrementalMesh

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> None

2. __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theLinDeflection: float, isRelative: bool = False, theAngDeflection: float = 0.5, isInParallel: bool = False) -> None

3. __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theParameters: OCP.OCP.IMeshTools.IMeshTools_Parameters, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f2ee2b0>) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> None
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theLinDeflection: float, isRelative: bool = False, theAngDeflection: float = 0.5, isInParallel: bool = False) -> None
  __init__(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theParameters: OCP.OCP.IMeshTools.IMeshTools_Parameters, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f2ee2b0>) -> None

  // Perform(*args, **kwargs)
  // Remarks: Overloaded function.

1. Perform(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f463eb0>) -> None

Performs meshing of the shape.

2. Perform(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theContext: OCP.OCP.IMeshTools.IMeshTools_Context, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f498db0>) -> None

Performs meshing using custom context;
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f463eb0>) -> None
  Perform(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh, theContext: OCP.OCP.IMeshTools.IMeshTools_Context, theRange: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f498db0>) -> None

  // IsModified(self
  // Remarks: Returns modified flag.
  IsModified(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> bool

  // GetStatusFlags(self
  // Remarks: Returns accumulated status flags faced during meshing.
  GetStatusFlags(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> int

  // IsParallelDefault_s() -> bool
  // Remarks: Returns multi-threading usage flag set by default in Discret() static method (thus applied only to Mesh Factories).
  IsParallelDefault_s() -> bool

  // SetParallelDefault_s(isInParallel
  // Remarks: Setup multi-threading usage flag set by default in Discret() static method (thus applied only to Mesh Factories).
  SetParallelDefault_s(isInParallel: bool) -> None

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // Parameters(self
  // Remarks: Returns meshing parameters
  Parameters(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.IMeshTools.IMeshTools_Parameters

  // ChangeParameters(self
  // Remarks: Returns modifiable meshing parameters
  ChangeParameters(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.IMeshTools.IMeshTools_Parameters

  // DynamicType(self
  DynamicType(self: OCP.OCP.BRepMesh.BRepMesh_IncrementalMesh) -> OCP.OCP.Standard.Standard_Type
