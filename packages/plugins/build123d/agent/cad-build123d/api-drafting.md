# build123d — drafting

6 top-level symbols. Signatures are verbatim python.

# Category: drafting
# Sketch Object
# build123d.drafting.Arrow (class)
class Arrow(BaseSketchObject)

  # build123d.drafting.Arrow.__init__ (constructor)
  Arrow(arrow_size: float, shaft_path: Edge | Wire, shaft_width: float, head_at_start: bool = True, head_type: HeadType = HeadType.CURVED, mode: Mode = Mode.ADD)
  #   arrow_size: arrow head tip to tail length
  #   shaft_path: line describing the shaft shape
  #   shaft_width: line width of shaft
  #   head_at_start: Defaults to True
  #   head_type: arrow head shape
  #   mode: _description_

# Category: drafting
# Sketch Object
# build123d.drafting.ArrowHead (class)
class ArrowHead(BaseSketchObject)

  # build123d.drafting.ArrowHead.__init__ (constructor)
  ArrowHead(size: float, head_type: HeadType = HeadType.CURVED, rotation: float = 0, mode: Mode = Mode.ADD)
  #   size: tip to tail length
  #   head_type: arrow head shape
  #   rotation: rotation in degrees
  #   mode: combination mode

# Category: drafting
# Sketch Object
# Remarks: Create a dimension line typically for internal measurements. Typically used for (but not restricted to) inside dimensions, a dimension line often as arrows on either side of a dimension or label. There are three options depending on the size of the text and length of the dimension line: Type 1) The label and arrows fit within the length of the path Type 2) The text fit within the path and the arrows go outside Type 3) Neither the text nor the arrows fit within the path
# Throws: ValueError: Only 2 points allowed for dimension lines
# Throws: ValueError: No output - no arrows selected
# build123d.drafting.DimensionLine (class)
class DimensionLine(BaseSketchObject)

  # build123d.drafting.DimensionLine.__init__ (constructor)
  DimensionLine(path: PathDescriptor, draft: Draft, sketch: Sketch | None = None, label: str | None = None, arrows: tuple[bool, bool] = (True, True), tolerance: float | tuple[float, float] | None = None, label_angle: bool = False, mode: Mode = Mode.ADD)
  #   path: a very general type of input used to describe the path the dimension line will follow
  #   draft: instance of Draft dataclass
  #   sketch: the Sketch being created to check for possible overlaps
  #   label: Defaults to ''
  #   arrows: a pair of boolean values controlling the placement of the start and end arrows
  #   tolerance: an optional tolerance value to add to the extracted length value
  #   label_angle: a flag indicating that instead of an extracted length value, the size of the circular arc extracted from the path should be displayed in degrees
  #   mode: combination mode

# Category: drafting
# Draft
# Remarks: Documenting build123d designs with dimension and extension lines as well as callouts.
# build123d.drafting.Draft (class)
class Draft

  # Are metric units being used
  is_metric: bool

  # build123d.drafting.Draft.__init__ (constructor)
  Draft(font_size: float = 5.0, font: str = 'Arial', font_style: FontStyle = FontStyle.REGULAR, head_type: HeadType = HeadType.CURVED, arrow_length: float = 3.0, line_width: float = 0.5, pad_around_text: float = 2.0, unit: Unit = Unit.MM, number_display: NumberDisplay = NumberDisplay.DECIMAL, display_units: bool = True, decimal_precision: int = 2, fractional_precision: int = 64, extension_gap: float = 2.0) -> NoneType
  #   font_size: size of the text in dimension lines and callouts
  #   font: font to use for text
  #   font_style: text style
  #   head_type: arrow head shape
  #   arrow_length: arrow head length
  #   line_width: thickness of all lines
  #   pad_around_text: amount of padding around text
  #   unit: measurement unit
  #   number_display: numbers as decimal or fractions
  #   display_units: control the display of units with numbers
  #   decimal_precision: number of decimal places when displaying numbers
  #   fractional_precision: maximum fraction denominator - must be a factor of 2
  #   extension_gap: gap between the point and start of extension line in extension_line

# Category: drafting
# Sketch Object
# Remarks: Create a dimension line with two lines extending outward from the part to dimension. Typically used for (but not restricted to) outside dimensions, with a pair of lines extending from the edge of a part to a dimension line.
# build123d.drafting.ExtensionLine (class)
class ExtensionLine(BaseSketchObject)

  # build123d.drafting.ExtensionLine.__init__ (constructor)
  ExtensionLine(border: PathDescriptor, offset: float, draft: Draft, sketch: Sketch | None = None, label: str | None = None, arrows: tuple[bool, bool] = (True, True), tolerance: float | tuple[float, float] | None = None, label_angle: bool = False, measurement_direction: VectorLike | None = None, mode: Mode = Mode.ADD)
  #   border: a very general type of input defining the object to be dimensioned
  #   offset: a distance to displace the dimension line from the edge of the object
  #   draft: instance of Draft dataclass
  #   label: Defaults to ''
  #   arrows: a pair of boolean values controlling the placement of the start and end arrows
  #   tolerance: an optional tolerance value to add to the extracted length value
  #   label_angle: a flag indicating that instead of an extracted length value, the size of the circular arc extracted from the path should be displayed in degrees
  #   measurement_direction: Vector line which to project the dimension against
  #   mode: combination mode

# Category: drafting
# Sketch Object
# Remarks: The border of a technical drawing with external frame and text box.
# build123d.drafting.TechnicalDrawing (class)
class TechnicalDrawing(BaseSketchObject)

  # build123d.drafting.TechnicalDrawing.__init__ (constructor)
  TechnicalDrawing(designed_by: str = 'build123d', design_date: date | None = None, page_size: PageSize = PageSize.A4, title: str = 'Title', sub_title: str = 'Sub Title', drawing_number: str = 'B3D-1', sheet_number: int | None = None, drawing_scale: float = 1.0, nominal_text_size: float = 10.0, line_width: float = 0.5, mode: Mode = Mode.ADD)
  #   designed_by: Defaults to "build123d"
  #   design_date: Defaults to date.today()
  #   page_size: Defaults to PageSize.A4
  #   title: drawing title
  #   sub_title: drawing sub title
  #   drawing_number: Defaults to "B3D-1"
  #   sheet_number: Defaults to None
  #   drawing_scale: displays as 1:value
  #   nominal_text_size: size of title text
  #   line_width: Defaults to 0.5
  #   mode: combination mode
