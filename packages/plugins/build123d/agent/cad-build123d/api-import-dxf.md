# build123d — import_dxf

1 top-level symbols. Signatures are verbatim python.

# Category: import_dxf
# Import shapes from a DXF file
# Remarks: Returns: ShapeList: build123d objects
# Throws: DXFStructureError: file not found
# build123d.import_dxf.import_dxf (function)
import_dxf(dxf_file: str | PathLike | TextIO | BinaryIO) -> ShapeList
#   dxf_file: dxf file path or readable stream
