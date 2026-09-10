# build123d — colors

2 top-level symbols. Signatures are verbatim python.

// Named tuple representing an RGB color value
RGB

// Returns the color value as a tuple of floats in range [0, 1]
to_floats() -> tuple[float, float, float]

// Returns an :class:`RGB` instance from floats in range [0, 1]
from_floats(rgb: tuple[float, float, float]) -> Self

// Returns the color value as hex string "#RRGGBB"
to_hex() -> str

// Returns an :class:`RGB` instance from a hex color string, the `color` string
from_hex(color: str) -> Self

// Returns perceived luminance for an RGB color in range [0.0, 1.0]
luminance: float

// Convert :ref:`ACI` into (r, g, b) tuple, based on default AutoCAD
aci2rgb(index: int) -> RGB
