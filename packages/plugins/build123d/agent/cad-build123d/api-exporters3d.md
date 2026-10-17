# build123d — exporters3d

6 top-level symbols. Signatures are verbatim python.

# Category: exporters3d
# Export this shape to a BREP file
# Remarks: Returns: bool: write status
# build123d.exporters3d.export_brep (function)
export_brep(to_export: Shape, file_path: PathLike | str | bytes | BytesIO | BinaryIO) -> bool
#   to_export: object or assembly
#   file_path: Union[PathLike, str, bytes, BytesIO]

# Category: exporters3d
# export_gltf
# Remarks: The glTF (GL Transmission Format) specification primarily focuses on the efficient transmission and loading of 3D models as a compact, binary format that is directly renderable by graphics APIs like WebGL, OpenGL, and Vulkan. It's designed to store detailed 3D model data, including meshes (vertices, normals, textures, etc.), animations, materials, and scene hierarchy, among other aspects. UV texture coordinates from the underlying surface parameterization are included in the glTF output as ``TEXCOORD_0`` accessors. These UVs support texture mapping, UV baking, and displacement-map workflows such as `BumpMesh <https://bumpmesh.com/>`_. Returns: bool: write status
# Throws: RuntimeError: Failed to write glTF file
# build123d.exporters3d.export_gltf (function)
export_gltf(to_export: Shape, file_path: PathLike | str | bytes, unit: Unit = Unit.MM, binary: bool = False, linear_deflection: float = 0.001, angular_deflection: float = 0.1) -> bool
#   to_export: object or assembly
#   file_path: glTF file path
#   unit: shape units
#   binary: output format
#   linear_deflection: A linear deflection setting which limits the distance between a curve and its tessellation
#   angular_deflection: Angular deflection setting which limits the angle between subsequent segments in a polyline

# Category: exporters3d
# export_obj
# Remarks: Exports a shape to Wavefront OBJ format. When *include_uvs* is True (default), per-vertex UV texture coordinates are extracted from OpenCASCADE's surface parameterization and written as ``vt`` records. These UVs enable texture mapping, UV baking, and displacement-map workflows such as `BumpMesh <https://bumpmesh.com/>`_ which can add displacement heightmap tessellations to 3D-printable meshes. When *atlas_packing* is True (default), all face UVs are packed into a single texture atlas preserving each face's physical aspect ratio. Returns: bool: success
# build123d.exporters3d.export_obj (function)
export_obj(to_export: Shape, file_path: PathLike | str | bytes | BytesIO | BinaryIO, linear_deflection: float = 0.001, angular_deflection: float = 0.1, include_uvs: bool = True, atlas_packing: bool = True, atlas_gutter: float = 0.0) -> bool
#   to_export: object or assembly
#   file_path: OBJ file path or writable binary stream (for pyodide/WASM environments)
#   linear_deflection: Tessellation linear deflection
#   angular_deflection: Tessellation angular deflection
#   include_uvs: Include UV texture coordinates
#   atlas_packing: Pack per-face UVs into a single atlas
#   atlas_gutter: Normalized empty margin around each UV island in a packed atlas

# Category: exporters3d
# export_step
# Remarks: Export a build123d Shape or assembly with color and label attributes. Note that if the color of a node in an assembly isn't set, it will be assigned the color of its nearest ancestor. Returns: bool: success
# Throws: RuntimeError: Unknown Compound type
# build123d.exporters3d.export_step (function)
export_step(to_export: Shape, file_path: PathLike | str | bytes | BytesIO | BinaryIO, unit: Unit = Unit.MM, write_pcurves: bool = True, precision_mode: PrecisionMode = PrecisionMode.AVERAGE, *, timestamp: str | datetime | None = None) -> bool
#   to_export: object or assembly
#   file_path: step file path
#   unit: shape units
#   write_pcurves: write parametric curves to the STEP file
#   precision_mode: geometric data precision

# Category: exporters3d
# Export STL
# Remarks: Exports a shape to a specified STL file. Returns: bool: Success
# Throws: FileNotFoundError: The destination directory does not exist.
# build123d.exporters3d.export_stl (function)
export_stl(to_export: Shape, file_path: PathLike | str | bytes, tolerance: float = 0.001, angular_tolerance: float = 0.1, ascii_format: bool = False) -> bool
#   to_export: object or assembly
#   file_path: The path and file name to write the STL output to
#   tolerance: A linear deflection setting which limits the distance between a curve and its tessellation
#   angular_tolerance: Angular deflection setting which limits the angle between subsequent segments in a polyline
#   ascii_format: Export the file as ASCII (True) or binary (False) STL format

# Category: exporters3d
# Export a shape to PCBWay for quoting
# Remarks: This function writes ``to_export`` to a temporary STEP file, uploads that file to PCBWay's external web service, opens the returned pricing page in the default browser, and returns the pricing page URL. Returns: str: URL of the pricing page
# build123d.exporters3d.export_to_pcbway (function)
export_to_pcbway(to_export: Shape, unit: Unit = Unit.MM, write_pcurves: bool = True, precision_mode: PrecisionMode = PrecisionMode.AVERAGE) -> str
#   to_export: object or assembly
#   unit: shape units
#   write_pcurves: write parametric curves to the STEP file
#   precision_mode: geometric data precision
