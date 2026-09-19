# build123d — svg

2 top-level symbols. Signatures are verbatim python.

ColorAndLabel

  ColorAndLabel(element: ShapeElement, parents: Sequence[ParentElement], label_by: str = 'id') -> None

  // Fill color if shape should be filled stroke color otherwise
  color_for(shape: TopoDS_Shape)

  Label_by(label_by: str = 'id')

// Import shapes from an SVG document as faces and/or wires
import_svg_document(svg_file: Union[str, pathlib.Path, TextIO], flip_y: bool = True, ignore_visibility: bool = False, metadata: Optional[Callable[[ShapeElement, Sequence[ParentElement]], M]]) -> ItemsFromDocument[tuple[FaceOrWire, M]]
import_svg_document(svg_file: Union[str, pathlib.Path, TextIO], flip_y: bool = True, ignore_visibility: bool = False) -> ItemsFromDocument[FaceOrWire]
