# build123d — importers

5 top-level symbols. Signatures are verbatim python.

// Import shape from a BREP file
import_brep(file_name: PathLike | str | bytes) -> Shape
// file_name: brep file

// import_step
import_step(filename: PathLike | str | bytes) -> Compound

// import_stl
import_stl(file_name: PathLike | str | bytes, model_unit: Unit = Unit.MM) -> Face
// file_name: file path of STL file to import
// model_unit: the default unit used when creating the model

// import_svg
import_svg(svg_file: str | Path | TextIO, flip_y: bool = True, align: Align | tuple[Align, Align] | None = Align.MIN, ignore_visibility: bool = False, label_by: Literal['id', 'class', 'inkscape:label'] | str = 'id') -> ShapeList[Wire | Face]
import_svg(svg_file: str | Path | TextIO, flip_y: bool = True, align: Align | tuple[Align, Align] | None = Align.MIN, ignore_visibility: bool = False, label_by: Literal['id', 'class', 'inkscape:label'] | str = 'id', is_inkscape_label: bool | None = None) -> ShapeList[Wire | Face]
// svg_file: svg file
// flip_y: flip objects to compensate for svg orientation
// align: alignment of the SVG's viewbox, if None, the viewbox's origin will be at `(0,0,0)`
// ignore_visibility: Defaults to False
// label_by: XML attribute to use for imported shapes' `label` property

// translate_to_buildline_code
import_svg_as_buildline_code(file_name: PathLike | str | bytes, precision: int = TOL_DIGITS) -> tuple[str, str]
// file_name: svg file name
// precision: # digits to round values to
