# build123d — text

2 top-level symbols. Signatures are verbatim python.

# Category: text
# Wrap OCP Font_FontMgr
# build123d.text.FontManager (class)
class FontManager

  # Initialize FontManager
  # Remarks: Bundled fonts are added to global OCP instance if they haven't already
  # build123d.text.FontManager.__init__ (constructor)
  FontManager()

  # Get list of available fonts by name and available styles (also called aspects)
  # build123d.text.FontManager.available_fonts (method)
  available_fonts() -> list[FontInfo]

  # Check if font exists at path and return system font
  # build123d.text.FontManager.check_font (method)
  check_font(path: str) -> Font_SystemFont | None

  # Find font in FontManager library by name and style
  # build123d.text.FontManager.find_font (method)
  find_font(name: str, style: FontStyle) -> Font_SystemFont

  # Register all font faces in a font file and return font face names
  # build123d.text.FontManager.register_font (method)
  register_font(path: str, override: bool = False, single_stroke = False) -> list[str]

  # Register all fonts in a folder
  # build123d.text.FontManager.register_folder (method)
  register_folder(path: str, override: bool = False, single_stroke = False) -> list[str]

  # Runner to (re)inititalize the OCCT FontMgr font list since user folder is
  # Remarks: missing on Windows and some fonts may not be imported correctly.
  # build123d.text.FontManager.register_system_fonts (method)
  register_system_fonts()

# Category: text
# Get list of available fonts by name and available styles (also called aspects)
# build123d.text.available_fonts (function)
available_fonts() -> list[FontInfo]
