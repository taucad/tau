# build123d — mesher

1 top-level symbols. Signatures are verbatim python.

// Category: mesher
// Mesher
// Remarks: Tool for exporting and importing meshed objects stored in 3MF or STL files.
Mesher

  Mesher(unit: Unit = Unit.MM)
  //   unit: model units

  // Unit used in the model
  model_unit: Unit

  // Number of triangles in each of the model's meshes
  triangle_counts: list[int]

  // Number of vertices in each of the models's meshes
  vertex_counts: list[int]

  // Number of meshes in the model
  mesh_count: int

  // 3MF Consortium Lib#MF version
  library_version: str

  // add_meta_data
  // Remarks: Add meta data to the models
  add_meta_data(name_space: str, name: str, value: str, metadata_type: str, must_preserve: bool)
  //   name_space: categorizer of different metadata entries
  //   name: metadata label
  //   value: metadata content
  //   metadata_type: metadata type
  //   must_preserve: metadata must not be removed if unused

  // Add the code calling this method to the 3MF metadata with the custom
  // Remarks: name space `build123d`, name equal to the base file name and the type as `python`
  add_code_to_metadata()

  // Retrieve all of the metadata
  get_meta_data() -> list[dict]

  // Retrieve the metadata value and type for the provided name space and name
  get_meta_data_by_key(name_space: str, name: str) -> dict

  // Retrieve the properties from all the meshes
  get_mesh_properties() -> list[dict]

  // add_shape
  // Remarks: Add a shape to the 3MF/STL file.
  // Throws: RuntimeError: 3mf mesh is invalid
  // Throws: Warning: Degenerate shape skipped
  // Throws: Warning: 3mf mesh is not manifold
  add_shape(shape: Shape | Iterable[Shape], linear_deflection: float = 0.001, angular_deflection: float = 0.1, mesh_type: MeshType = MeshType.MODEL, part_number: str | None = None, uuid_value: UUID | None = None)
  //   shape: build123d object
  //   linear_deflection: mesh control for edges
  //   angular_deflection: mesh control for non-planar surfaces
  //   mesh_type: 3D printing use of mesh
  //   part_number: part #
  //   uuid_value: value from uuid package

  // read
  // Remarks: Returns: list[Shape]: build123d shapes extracted from mesh file
  // Throws: ValueError: Unknown file format - must be 3mf or stl
  read(file_name: PathLike | str | bytes) -> list[Shape]

  // write
  // Throws: ValueError: Unknown file format - must be 3mf or stl
  write(file_name: PathLike | str | bytes)

  // write_stream
  // Throws: ValueError: Unknown file format - must be 3mf or stl
  write_stream(stream: BytesIO, file_type: Literal['3mf', 'stl'])
  //   stream: byte stream
  //   file_type: output mesh format, either "3mf" or "stl"
