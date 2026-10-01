# build123d — exporters3d

5 top-level symbols. Signatures are verbatim python.

// Export this shape to a BREP file
// build123d.exporters3d.export_brep (function)
export_brep(to_export: Shape, file_path: PathLike | str | bytes | BytesIO | BinaryIO) -> bool
//   to_export: object or assembly
//   file_path: Union[PathLike, str, bytes, BytesIO]

// export_gltf
// build123d.exporters3d.export_gltf (function)
export_gltf(to_export: Shape, file_path: PathLike | str | bytes, unit: Unit = Unit.MM, binary: bool = False, linear_deflection: float = 0.001, angular_deflection: float = 0.1) -> bool
//   to_export: object or assembly
//   file_path: glTF file path
//   unit: shape units
//   binary: output format
//   linear_deflection: A linear deflection setting which limits the distance between a curve and its tessellation
//   angular_deflection: Angular deflection setting which limits the angle between subsequent segments in a polyline

// export_step
// build123d.exporters3d.export_step (function)
export_step(to_export: Shape, file_path: PathLike | str | bytes | BytesIO | BinaryIO, unit: Unit = Unit.MM, write_pcurves: bool = True, precision_mode: PrecisionMode = PrecisionMode.AVERAGE, timestamp: str | datetime | None = None) -> bool
//   to_export: object or assembly
//   file_path: step file path
//   unit: shape units
//   write_pcurves: write parametric curves to the STEP file
//   precision_mode: geometric data precision

// Export STL
// build123d.exporters3d.export_stl (function)
export_stl(to_export: Shape, file_path: PathLike | str | bytes, tolerance: float = 0.001, angular_tolerance: float = 0.1, ascii_format: bool = False) -> bool
//   to_export: object or assembly
//   file_path: The path and file name to write the STL output to
//   tolerance: A linear deflection setting which limits the distance between a curve and its tessellation
//   angular_tolerance: Angular deflection setting which limits the angle between subsequent segments in a polyline
//   ascii_format: Export the file as ASCII (True) or binary (False) STL format

// Export a shape to PCBWay for quoting
// build123d.exporters3d.export_to_pcbway (function)
export_to_pcbway(to_export: Shape, unit: Unit = Unit.MM, write_pcurves: bool = True, precision_mode: PrecisionMode = PrecisionMode.AVERAGE) -> str
//   to_export: object or assembly
//   unit: shape units
//   write_pcurves: write parametric curves to the STEP file
//   precision_mode: geometric data precision
