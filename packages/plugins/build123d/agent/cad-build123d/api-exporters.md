# build123d — exporters

6 top-level symbols. Signatures are verbatim python.

# Category: exporters
# Line type dash pattern dot widths, expressed in tenths of an inch
# build123d.exporters.DotLength (enum)
class DotLength(Enum)

  TRUE_DOT

  INKSCAPE_COMPAT

  QCAD_IMPERIAL

# Category: exporters
# Base class for 2D exporters (DXF, SVG)
# build123d.exporters.Export2D (class)
class Export2D

# Category: exporters
# The ExportDXF class provides functionality for exporting 2D shapes to DXF
# Remarks: (Drawing Exchange Format) format. DXF is a widely used file format for exchanging CAD (Computer-Aided Design) data between different software applications. Example: .. code-block:: python exporter = ExportDXF(unit=Unit.MM, line_weight=0.5) exporter.add_layer("Layer 1", color=ColorIndex.RED, line_type=LineType.DASHED) exporter.add_shape(shape_object, layer="Layer 1") exporter.write("output.dxf")
# Throws: ValueError: unit not supported
# build123d.exporters.ExportDXF (class)
class ExportDXF(Export2D)

  # build123d.exporters.ExportDXF.__init__ (constructor)
  ExportDXF(version: str = ezdxf.DXF2013, unit: Unit = Unit.MM, color: ColorIndex | None = None, line_weight: float | None = None, line_type: LineType | None = None)
  #   version: The DXF version to use for the output file
  #   unit: The unit used for the exported DXF
  #   color: The default color index for shapes
  #   line_weight: The default line weight (stroke width) for shapes, in millimeters
  #   line_type: e default line type for shapes

  # add_layer
  # Remarks: Adds a new layer to the DXF export with the given properties. Returns: Self: DXF document with additional layer
  # build123d.exporters.ExportDXF.add_layer (method)
  add_layer(name: str, *, color: ColorIndex | None = None, line_weight: float | None = None, line_type: LineType | None = None) -> Self
  #   name: The name of the layer definition
  #   color: The color index for shapes on this layer
  #   line_weight: The line weight (stroke width) for shapes on this layer, in millimeters
  #   line_type: The line type for shapes on this layer

  # add_shape
  # Remarks: Adds a shape to the specified layer. Returns: Self: Document with additional shape
  # build123d.exporters.ExportDXF.add_shape (method)
  add_shape(shape: Shape | Iterable[Shape], layer: str = '') -> Self
  #   shape: The shape or collection of shapes to be added
  #   layer: The name of the layer where the shape will be added

  # write
  # Remarks: Writes the DXF data to the specified file name.
  # build123d.exporters.ExportDXF.write (method)
  write(file_name: PathLike | str | bytes | BytesIO, ascii_format: bool = True)
  #   file_name: The file name (including path) where the DXF data will be written
  #   ascii_format: Export the file as ASCII (True) or binary (False) DXF format

# Category: exporters
# ExportSVG
# Remarks: SVG file export functionality. The ExportSVG class provides functionality for exporting 2D shapes to SVG (Scalable Vector Graphics) format. SVG is a widely used vector graphics format that is supported by web browsers and various graphic editors. Example: .. code-block:: python exporter = ExportSVG(unit=Unit.MM, line_weight=0.5) exporter.add_layer("Layer 1", fill_color=(255, 0, 0), line_color=(0, 0, 255)) exporter.add_shape(shape_object, layer="Layer 1") exporter.write("output.svg")
# Throws: ValueError: Invalid unit.
# build123d.exporters.ExportSVG (class)
class ExportSVG(Export2D)

  # build123d.exporters.ExportSVG.__init__ (constructor)
  ExportSVG(unit: Unit = Unit.MM, scale: float = 1, margin: float = 0, fit_to_stroke: bool = True, precision: int = 6, fill_color: ColorIndex | RGB | Color | None = None, line_color: ColorIndex | RGB | Color | None = Export2D.DEFAULT_COLOR_INDEX, line_weight: float = Export2D.DEFAULT_LINE_WEIGHT, line_type: LineType = Export2D.DEFAULT_LINE_TYPE, dot_length: DotLength | float = DotLength.INKSCAPE_COMPAT)
  #   unit: The unit used for the exported SVG
  #   scale: The scaling factor applied to the exported SVG
  #   margin: The margin added around the exported shapes
  #   fit_to_stroke: A boolean indicating whether the SVG view box should fit the strokes of the shapes
  #   precision: The number of decimal places used for rounding coordinates in the SVG
  #   fill_color: The default fill color for shapes
  #   line_color: The default line color for shapes
  #   line_weight: The default line weight (stroke width) for shapes, in millimeters
  #   line_type: The default line type for shapes
  #   dot_length: The width of rendered dots in a Can be either a DotLength enum or a float value in tenths of an inch

  # add_layer
  # Remarks: Adds a new layer to the SVG export with the given properties. Returns: Self: Drawing with an additional layer
  # Throws: ValueError: Duplicate layer name
  # Throws: ValueError: Unknown linetype
  # build123d.exporters.ExportSVG.add_layer (method)
  add_layer(name: str, *, fill_color: ColorIndex | RGB | Color | None = None, line_color: ColorIndex | RGB | Color | None = Export2D.DEFAULT_COLOR_INDEX, line_weight: float = Export2D.DEFAULT_LINE_WEIGHT, line_type: LineType = Export2D.DEFAULT_LINE_TYPE) -> Self
  #   name: The name of the layer
  #   fill_color: The fill color for shapes on this layer
  #   line_color: The line color for shapes on this layer
  #   line_weight: The line weight (stroke width) for shapes on this layer, in millimeters
  #   line_type: The line type for shapes on this layer

  # add_shape
  # Remarks: Adds a shape or a collection of shapes to the specified layer.
  # Throws: ValueError: Undefined layer
  # build123d.exporters.ExportSVG.add_shape (method)
  add_shape(shape: Shape | Iterable[Shape], layer: str = '', reverse_wires: bool = False)
  #   shape: The shape or collection of shapes to be added
  #   layer: The name of the layer where the shape(s) will be added
  #   reverse_wires: A boolean indicating whether the wires of the shape(s) should be in reversed direction

  # write
  # Remarks: Writes the SVG data to the specified file path.
  # build123d.exporters.ExportSVG.write (method)
  write(path: PathLike | str | bytes | BytesIO)
  #   path: The file path where the SVG data will be written

# Category: exporters
# Line Types
# build123d.exporters.LineType (enum)
class LineType(AutoNameEnum)

  CONTINUOUS

  BORDER

  BORDER2

  BORDERX2

  CENTER

  CENTER2

  CENTERX2

  DASHDOT

  DASHDOT2

  DASHDOTX2

  DASHED

  DASHED2

  DASHEDX2

  DIVIDE

  DIVIDE2

  DIVIDEX2

  DOT

  DOT2

  DOTX2

  HIDDEN

  HIDDEN2

  HIDDENX2

  PHANTOM

  PHANTOM2

  PHANTOMX2

  ISO_DASH

  ISO_DASH_SPACE

  ISO_LONG_DASH_DOT

  ISO_LONG_DASH_DOUBLE_DOT

  ISO_LONG_DASH_TRIPLE_DOT

  ISO_DOT

  ISO_LONG_DASH_SHORT_DASH

  ISO_LONG_DASH_DOUBLE_SHORT_DASH

  ISO_DASH_DOT

  ISO_DOUBLE_DASH_DOT

  ISO_DASH_DOUBLE_DOT

  ISO_DOUBLE_DASH_DOUBLE_DOT

  ISO_DASH_TRIPLE_DOT

  ISO_DOUBLE_DASH_TRIPLE_DOT

# Category: exporters
# An enum class that automatically sets members' value to their name
# build123d.exporters.AutoNameEnum (enum)
class AutoNameEnum(Enum)
