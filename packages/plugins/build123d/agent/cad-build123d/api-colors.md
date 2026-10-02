# build123d — colors

2 top-level symbols. Signatures are verbatim python.

// Category: colors
// Named tuple representing an RGB color value
// Remarks: Attributes: r: red channel in range [0, 255] g: green channel in range [0, 255] b: blue channel in range [0, 255]
RGB

  // Returns the color value as a tuple of floats in range [0, 1]
  // ezdxf.colors.RGB.to_floats (method)
  to_floats() -> tuple[float, float, float]

  // Returns an :class:`RGB` instance from floats in range [0, 1]
  // ezdxf.colors.RGB.from_floats (method)
  from_floats(rgb: tuple[float, float, float]) -> Self

  // Returns the color value as hex string "#RRGGBB"
  // ezdxf.colors.RGB.to_hex (method)
  to_hex() -> str

  // Returns an :class:`RGB` instance from a hex color string, the `color` string
  // Remarks: is a hex string "RRGGBB" with an optional leading "#", an appended alpha channel is ignore.
  // ezdxf.colors.RGB.from_hex (method)
  from_hex(color: str) -> Self

  // Returns perceived luminance for an RGB color in range [0.0, 1.0]
  // Remarks: from dark to light.
  luminance: float

// Category: colors
// Convert :ref:`ACI` into (r, g, b) tuple, based on default AutoCAD
// Remarks: colors.
// ezdxf.colors.aci2rgb (function)
aci2rgb(index: int) -> RGB
