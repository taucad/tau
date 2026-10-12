# build123d — importers

5 top-level symbols. Signatures are verbatim python.

# Category: importers
# Import shape from a BREP file
# Remarks: Returns: Shape: build123d object
# Throws: ValueError: file not found
# build123d.importers.import_brep (function)
import_brep(file_name: PathLike | str | bytes) -> Shape
#   file_name: brep file

# Category: importers
# import_step
# Remarks: Extract shapes from a STEP file and return them as a Compound object. Returns: Compound: contents of STEP file
# Throws: ValueError: can't open file
# build123d.importers.import_step (function)
import_step(filename: PathLike | str | bytes) -> Compound

# Category: importers
# import_stl
# Remarks: Extract shape from an STL file and return it as a Face reference object. Note that importing with this method and creating a reference is very fast while creating an editable model (with Mesher) may take minutes depending on the size of the STL file. Returns: Face: STL model
# Throws: ValueError: Could not import file
# Throws: ValueError: Invalid model_unit
# build123d.importers.import_stl (function)
import_stl(file_name: PathLike | str | bytes, model_unit: Unit = Unit.MM) -> Face
#   file_name: file path of STL file to import
#   model_unit: the default unit used when creating the model

# Category: importers
# import_svg
# Remarks: Returns: ShapeList[Union[Wire, Face]]: objects contained in svg
# Throws: ValueError: unexpected shape type
# build123d.importers.import_svg (function)
import_svg(svg_file: str | Path | TextIO, *, flip_y: bool = True, align: Align | tuple[Align, Align] | None = Align.MIN, ignore_visibility: bool = False, label_by: Literal['id', 'class', 'inkscape:label'] | str = 'id') -> ShapeList[Wire | Face]
import_svg(svg_file: str | Path | TextIO, *, flip_y: bool = True, align: Align | tuple[Align, Align] | None = Align.MIN, ignore_visibility: bool = False, label_by: Literal['id', 'class', 'inkscape:label'] | str = 'id', is_inkscape_label: bool | None = None) -> ShapeList[Wire | Face]
#   svg_file: svg file
#   flip_y: flip objects to compensate for svg orientation
#   align: alignment of the SVG's viewbox, if None, the viewbox's origin will be at `(0,0,0)`
#   ignore_visibility: Defaults to False
#   label_by: XML attribute to use for imported shapes' `label` property

# Category: importers
# translate_to_buildline_code
# Remarks: Translate the contents of the given svg file into executable build123d/BuildLine code. Returns: tuple[str, str]: code, builder instance name
# build123d.importers.import_svg_as_buildline_code (function)
import_svg_as_buildline_code(file_name: PathLike | str | bytes, precision: int = TOL_DIGITS) -> tuple[str, str]
#   file_name: svg file name
#   precision: # digits to round values to
