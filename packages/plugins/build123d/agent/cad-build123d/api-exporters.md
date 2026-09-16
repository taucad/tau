# build123d — exporters

11 top-level symbols. Signatures are verbatim python.

// An enum class that automatically sets members' value to their name
AutoNameEnum

// Colors
ColorIndex

  RED

  YELLOW

  GREEN

  CYAN

  BLUE

  MAGENTA

  BLACK

  GRAY

  LIGHT_GRAY

// Line type dash pattern dot widths, expressed in tenths of an inch
DotLength

  TRUE_DOT

  INKSCAPE_COMPAT

  QCAD_IMPERIAL

// A base drawing object
Drawing

  Drawing(shape: Shape, look_at: VectorLike | None = None, look_from: VectorLike = (1, -1, 1), look_up: VectorLike = (0, 0, 1), with_hidden: bool = True, focus: float | None = None)

// Base class for 2D exporters (DXF, SVG)
Export2D

// The ExportDXF class provides functionality for exporting 2D shapes to DXF
ExportDXF

  ExportDXF(version: str = ezdxf.DXF2013, unit: Unit = Unit.MM, color: ColorIndex | None = None, line_weight: float | None = None, line_type: LineType | None = None)
  //   version: The DXF version to use for the output file
  //   unit: The unit used for the exported DXF
  //   color: The default color index for shapes
  //   line_weight: The default line weight (stroke width) for shapes, in millimeters
  //   line_type: e default line type for shapes

  // add_layer
  add_layer(name: str, color: ColorIndex | None = None, line_weight: float | None = None, line_type: LineType | None = None) -> Self
  //   name: The name of the layer definition
  //   color: The color index for shapes on this layer
  //   line_weight: The line weight (stroke width) for shapes on this layer, in millimeters
  //   line_type: The line type for shapes on this layer

  // add_shape
  add_shape(shape: Shape | Iterable[Shape], layer: str = '') -> Self
  //   shape: The shape or collection of shapes to be added
  //   layer: The name of the layer where the shape will be added

  // write
  write(file_name: PathLike | str | bytes | BytesIO, ascii_format: bool = True)
  //   file_name: The file name (including path) where the DXF data will be written
  //   ascii_format: Export the file as ASCII (True) or binary (False) DXF format

// ExportSVG
ExportSVG

  ExportSVG(unit: Unit = Unit.MM, scale: float = 1, margin: float = 0, fit_to_stroke: bool = True, precision: int = 6, fill_color: ColorIndex | RGB | Color | None = None, line_color: ColorIndex | RGB | Color | None = Export2D.DEFAULT_COLOR_INDEX, line_weight: float = Export2D.DEFAULT_LINE_WEIGHT, line_type: LineType = Export2D.DEFAULT_LINE_TYPE, dot_length: DotLength | float = DotLength.INKSCAPE_COMPAT)
  //   unit: The unit used for the exported SVG
  //   scale: The scaling factor applied to the exported SVG
  //   margin: The margin added around the exported shapes
  //   fit_to_stroke: A boolean indicating whether the SVG view box should fit the strokes of the shapes
  //   precision: The number of decimal places used for rounding coordinates in the SVG
  //   fill_color: The default fill color for shapes
  //   line_color: The default line color for shapes
  //   line_weight: The default line weight (stroke width) for shapes, in millimeters
  //   line_type: The default line type for shapes
  //   dot_length: The width of rendered dots in a Can be either a DotLength enum or a float value in tenths of an inch

  // add_layer
  add_layer(name: str, fill_color: ColorIndex | RGB | Color | None = None, line_color: ColorIndex | RGB | Color | None = Export2D.DEFAULT_COLOR_INDEX, line_weight: float = Export2D.DEFAULT_LINE_WEIGHT, line_type: LineType = Export2D.DEFAULT_LINE_TYPE) -> Self
  //   name: The name of the layer
  //   fill_color: The fill color for shapes on this layer
  //   line_color: The line color for shapes on this layer
  //   line_weight: The line weight (stroke width) for shapes on this layer, in millimeters
  //   line_type: The line type for shapes on this layer

  // add_shape
  add_shape(shape: Shape | Iterable[Shape], layer: str = '', reverse_wires: bool = False)
  //   shape: The shape or collection of shapes to be added
  //   layer: The name of the layer where the shape(s) will be added
  //   reverse_wires: A boolean indicating whether the wires of the shape(s) should be in reversed direction

  // write
  write(path: PathLike | str | bytes | BytesIO)
  //   path: The file path where the SVG data will be written

// Line Types
LineType

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

// Prepare an ANSI line pattern for ezdxf usage
ansi_pattern(*args)

// Prepare an ISO line pattern for ezdxf usage
iso_pattern(*args)

// Return the multiplicative conversion factor to go from from_unit to to_unit
unit_conversion_scale(from_unit: Unit, to_unit: Unit) -> float
