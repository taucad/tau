# build123d — text

2 top-level symbols. Signatures are verbatim python.

// Category: text
// Wrap OCP Font_FontMgr
FontManager

  // Initialize FontManager
  // Remarks: Bundled fonts are added to global OCP instance if they haven't already
  FontManager()

  // Get list of available fonts by name and available styles (also called aspects)
  available_fonts() -> list[FontInfo]

  // Check if font exists at path and return system font
  check_font(path: str) -> Font_SystemFont | None

  // Find font in FontManager library by name and style
  find_font(name: str, style: FontStyle) -> Font_SystemFont

  // Register all font faces in a font file and return font face names
  register_font(path: str, override: bool = False, single_stroke = False) -> list[str]

  // Register all fonts in a folder
  register_folder(path: str, override: bool = False, single_stroke = False) -> list[str]

  // Runner to (re)inititalize the OCCT FontMgr font list since user folder is
  // Remarks: missing on Windows and some fonts may not be imported correctly.
  register_system_fonts()

// Category: text
// Get list of available fonts by name and available styles (also called aspects)
available_fonts() -> list[FontInfo]
