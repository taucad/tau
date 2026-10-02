# build123d — svg

2 top-level symbols. Signatures are verbatim python.

// Category: svg
ColorAndLabel

  // ocpsvg.svg.ColorAndLabel.__init__ (constructor)
  ColorAndLabel(element: ShapeElement, parents: Sequence[ParentElement], label_by: str = 'id') -> None

  // Fill color if shape should be filled stroke color otherwise
  // ocpsvg.svg.ColorAndLabel.color_for (method)
  color_for(shape: TopoDS_Shape)

  // ocpsvg.svg.ColorAndLabel.Label_by (method)
  Label_by(label_by: str = 'id')

// Category: svg
// Import shapes from an SVG document as faces and/or wires
// Remarks: Each visible shape and path is converted to zero or more Face if it is filled, and to zero or more Wire if it is not filled. This importer does not cover the whole SVG specification, its most notable known limitations are: - degenerate and self-crossing paths may result in invalid faces and wires - clipping, both by clipping paths and viewport, is ignored - graphic properties such as line strokes and pattern fills are ignored Documents relying on these features need to be pre-processed externally. :param svg_file: input SVG document :param flip_y: whether to mirror the Y-coordinates to compensate for SVG's top left origin, defaults to True :param ignore_visibility: whether to ignore visibility attribute and process hidden elements. :param metadata: funtion to generate metadata from the source SVG element :raises IOError: :raises SyntaxError: :raises ValueError:
// ocpsvg.svg.import_svg_document (function)
import_svg_document(svg_file: Union[str, pathlib.Path, TextIO], flip_y: bool = True, ignore_visibility: bool = False, metadata: Optional[Callable[[ShapeElement, Sequence[ParentElement]], M]]) -> ItemsFromDocument[tuple[FaceOrWire, M]]
import_svg_document(svg_file: Union[str, pathlib.Path, TextIO], flip_y: bool = True, ignore_visibility: bool = False) -> ItemsFromDocument[FaceOrWire]
