# smlibpy — text

1 top-level symbols. Signatures are verbatim python.

# Category: text
# Lettering as a sketch in the XY plane, with the exact outlines of the font
# Remarks: Returns: A ``Sketch`` on ``Plane.XY``: one face per separate piece of a letter, counters as holes. Outlines are exact: straight segments are lines, curved runs are B-splines through the font's on-curve points.
# Throws: ValueError: An empty text, a size that is not positive, a character the font does not
# Throws: have, a font file that cannot be read, or a path the text does not fit on.
# smlibpy.text.Text (function)
Text(text: str, size: float, *, font: str | os.PathLike[str] | None = None, align: AlignLike = Align.CENTER, spacing: float = 0.0, line_spacing: float = 1.6, kerning: bool = True, path: Edge | Wire | None = None) -> Sketch
#   text: The text
#   size: Height of the capital letters (H, E, T) in mm, the nominal height of technical lettering
#   font: Path of a TrueType or OpenType font (``.ttf``, ``.otf``, ``.ttc``, ``.woff``)
#   align: Placement of the text's layout box (from the start to the end of the longest line, and from the baseline of the last line to the cap height of the first)
#   spacing: Extra distance between neighbouring letters in mm (negative
#   line_spacing: Distance between baselines as a multiple of ``size``
#   kerning: Apply the font's kerning pairs
#   path: An edge or wire in the XY plane to set one line of text along
