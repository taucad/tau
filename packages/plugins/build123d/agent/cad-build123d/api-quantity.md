# build123d — Quantity

3 top-level symbols. Signatures are verbatim python.

// Category: Quantity
// This class allows the definition of an RGB color as triplet of 3 normalized floating point values (red, green, blue)
Quantity_Color

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.Quantity.Quantity_Color) -> None 2. __init__(self: OCP.OCP.Quantity.Quantity_Color, theName: OCP.OCP.Quantity.Quantity_NameOfColor) -> None 3. __init__(self: OCP.OCP.Quantity.Quantity_Color, theC1: float, theC2: float, theC3: float, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> None 4. __init__(self: OCP.OCP.Quantity.Quantity_Color, theRgb: OCP.OCP.gp.gp_Vec3f) -> None
  // OCP.OCP.Quantity.Quantity_Color.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Quantity.Quantity_Color) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_Color, theName: OCP.OCP.Quantity.Quantity_NameOfColor) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_Color, theC1: float, theC2: float, theC3: float, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_Color, theRgb: OCP.OCP.gp.gp_Vec3f) -> None

  // Name(self
  // Remarks: Returns the name of the nearest color from the Quantity_NameOfColor enumeration.
  // OCP.OCP.Quantity.Quantity_Color.Name (method)
  Name(self: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.Quantity.Quantity_NameOfColor

  // SetValues(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetValues(self: OCP.OCP.Quantity.Quantity_Color, theName: OCP.OCP.Quantity.Quantity_NameOfColor) -> None Updates the color from specified named color. 2. SetValues(self: OCP.OCP.Quantity.Quantity_Color, theC1: float, theC2: float, theC3: float, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> None Updates a color according to the mode specified by theType. Throws exception if values are out of range.
  // OCP.OCP.Quantity.Quantity_Color.SetValues (method)
  SetValues(*args, **kwargs)
  SetValues(self: OCP.OCP.Quantity.Quantity_Color, theName: OCP.OCP.Quantity.Quantity_NameOfColor) -> None
  SetValues(self: OCP.OCP.Quantity.Quantity_Color, theC1: float, theC2: float, theC3: float, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> None

  // Red(self
  // Remarks: Returns the Red component (quantity of red) of the color within range [0.0; 1.0].
  // OCP.OCP.Quantity.Quantity_Color.Red (method)
  Red(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // Green(self
  // Remarks: Returns the Green component (quantity of green) of the color within range [0.0; 1.0].
  // OCP.OCP.Quantity.Quantity_Color.Green (method)
  Green(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // Blue(self
  // Remarks: Returns the Blue component (quantity of blue) of the color within range [0.0; 1.0].
  // OCP.OCP.Quantity.Quantity_Color.Blue (method)
  Blue(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // Hue(self
  // Remarks: Returns the Hue component (hue angle) of the color in degrees within range [0.0; 360.0], 0.0 being Red. -1.0 is a special value reserved for grayscale color (S should be 0.0)
  // OCP.OCP.Quantity.Quantity_Color.Hue (method)
  Hue(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // Light(self
  // Remarks: Returns the Light component (value of the lightness) of the color within range [0.0; 1.0].
  // OCP.OCP.Quantity.Quantity_Color.Light (method)
  Light(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // ChangeIntensity(self
  // Remarks: Increases or decreases the intensity (variation of the lightness). The delta is a percentage. Any value greater than zero will increase the intensity. The variation is expressed as a percentage of the current value.
  // OCP.OCP.Quantity.Quantity_Color.ChangeIntensity (method)
  ChangeIntensity(self: OCP.OCP.Quantity.Quantity_Color, theDelta: float) -> None

  // Saturation(self
  // Remarks: Returns the Saturation component (value of the saturation) of the color within range [0.0; 1.0].
  // OCP.OCP.Quantity.Quantity_Color.Saturation (method)
  Saturation(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // ChangeContrast(self
  // Remarks: Increases or decreases the contrast (variation of the saturation). The delta is a percentage. Any value greater than zero will increase the contrast. The variation is expressed as a percentage of the current value.
  // OCP.OCP.Quantity.Quantity_Color.ChangeContrast (method)
  ChangeContrast(self: OCP.OCP.Quantity.Quantity_Color, theDelta: float) -> None

  // IsDifferent(self
  // Remarks: Returns TRUE if the distance between two colors is greater than Epsilon().
  // OCP.OCP.Quantity.Quantity_Color.IsDifferent (method)
  IsDifferent(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> bool

  // IsEqual(self
  // Remarks: Returns TRUE if the distance between two colors is no greater than Epsilon().
  // OCP.OCP.Quantity.Quantity_Color.IsEqual (method)
  IsEqual(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> bool

  // Distance(self
  // Remarks: Returns the distance between two colors. It's a value between 0 and the square root of 3 (the black/white distance).
  // OCP.OCP.Quantity.Quantity_Color.Distance (method)
  Distance(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> float

  // SquareDistance(self
  // Remarks: Returns the square of distance between two colors.
  // OCP.OCP.Quantity.Quantity_Color.SquareDistance (method)
  SquareDistance(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> float

  // DeltaE2000(self
  // Remarks: Returns the value of the perceptual difference between this color and theOther, computed using the CIEDE2000 formula. The difference is in range [0, 100.], with 1 approximately corresponding to the minimal perceivable difference (usually difference 5 or greater is needed for the difference to be recognizable in practice).
  // OCP.OCP.Quantity.Quantity_Color.DeltaE2000 (method)
  DeltaE2000(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> float

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.Quantity.Quantity_Color.DumpJson (method)
  DumpJson(self: OCP.OCP.Quantity.Quantity_Color, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  // OCP.OCP.Quantity.Quantity_Color.InitFromJson (method)
  InitFromJson(self: OCP.OCP.Quantity.Quantity_Color, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Values(self
  // Remarks: Returns in theC1, theC2 and theC3 the components of this color according to the color system definition theType.
  // OCP.OCP.Quantity.Quantity_Color.Values (method)
  Values(self: OCP.OCP.Quantity.Quantity_Color, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> tuple[float, float, float]

  // Delta(self
  // Remarks: Returns the percentage change of contrast and intensity between this and another color. <DC> and <DI> are percentages, either positive or negative. The calculation is with respect to this color. If <DC> is positive then <me> is more contrasty. If <DI> is positive then <me> is more intense.
  // OCP.OCP.Quantity.Quantity_Color.Delta (method)
  Delta(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> tuple[float, float]

  // Name_s(theR
  // Remarks: Returns the color from Quantity_NameOfColor enumeration nearest to specified RGB values.
  // OCP.OCP.Quantity.Quantity_Color.Name_s (method)
  Name_s(theR: float, theG: float, theB: float) -> OCP.OCP.Quantity.Quantity_NameOfColor

  // StringName_s(theColor
  // Remarks: Returns the name of the color identified by the given Quantity_NameOfColor enumeration value.
  // OCP.OCP.Quantity.Quantity_Color.StringName_s (method)
  StringName_s(theColor: OCP.OCP.Quantity.Quantity_NameOfColor) -> str

  // ColorFromName_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. ColorFromName_s(theName: str, theColor: OCP.OCP.Quantity.Quantity_NameOfColor) -> bool Finds color from predefined names. For example, the name of the color which corresponds to "BLACK" is Quantity_NOC_BLACK. Returns FALSE if name is unknown. 2. ColorFromName_s(theColorNameString: str, theColor: OCP.OCP.Quantity.Quantity_Color) -> bool Finds color from predefined names.
  // OCP.OCP.Quantity.Quantity_Color.ColorFromName_s (method)
  ColorFromName_s(*args, **kwargs)
  ColorFromName_s(theName: str, theColor: OCP.OCP.Quantity.Quantity_NameOfColor) -> bool
  ColorFromName_s(theColorNameString: str, theColor: OCP.OCP.Quantity.Quantity_Color) -> bool

  // ColorFromHex_s(theHexColorString
  // Remarks: Parses the string as a hex color (like "#FF0" for short sRGB color, or "#FFFF00" for sRGB color)
  // OCP.OCP.Quantity.Quantity_Color.ColorFromHex_s (method)
  ColorFromHex_s(theHexColorString: str, theColor: OCP.OCP.Quantity.Quantity_Color) -> bool

  // ColorToHex_s(theColor
  // Remarks: Returns hex sRGB string in format "#FFAAFF".
  // OCP.OCP.Quantity.Quantity_Color.ColorToHex_s (method)
  ColorToHex_s(theColor: OCP.OCP.Quantity.Quantity_Color, theToPrefixHash: bool = True) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Convert_sRGB_To_HLS_s(theRgb
  // Remarks: Converts sRGB components into HLS ones.
  // OCP.OCP.Quantity.Quantity_Color.Convert_sRGB_To_HLS_s (method)
  Convert_sRGB_To_HLS_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_HLS_To_sRGB_s(theHls
  // Remarks: Converts HLS components into RGB ones.
  // OCP.OCP.Quantity.Quantity_Color.Convert_HLS_To_sRGB_s (method)
  Convert_HLS_To_sRGB_s(theHls: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_LinearRGB_To_HLS_s(theRgb
  // Remarks: Converts Linear RGB components into HLS ones.
  // OCP.OCP.Quantity.Quantity_Color.Convert_LinearRGB_To_HLS_s (method)
  Convert_LinearRGB_To_HLS_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_HLS_To_LinearRGB_s(theHls
  // Remarks: Converts HLS components into linear RGB ones.
  // OCP.OCP.Quantity.Quantity_Color.Convert_HLS_To_LinearRGB_s (method)
  Convert_HLS_To_LinearRGB_s(theHls: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_LinearRGB_To_Lab_s(theRgb
  // Remarks: Converts linear RGB components into CIE Lab ones.
  // OCP.OCP.Quantity.Quantity_Color.Convert_LinearRGB_To_Lab_s (method)
  Convert_LinearRGB_To_Lab_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_Lab_To_Lch_s(theLab
  // Remarks: Converts CIE Lab components into CIE Lch ones.
  // OCP.OCP.Quantity.Quantity_Color.Convert_Lab_To_Lch_s (method)
  Convert_Lab_To_Lch_s(theLab: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_Lab_To_LinearRGB_s(theLab
  // Remarks: Converts CIE Lab components into linear RGB ones. Note that the resulting values may be out of the valid range for RGB.
  // OCP.OCP.Quantity.Quantity_Color.Convert_Lab_To_LinearRGB_s (method)
  Convert_Lab_To_LinearRGB_s(theLab: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_Lch_To_Lab_s(theLch
  // Remarks: Converts CIE Lch components into CIE Lab ones.
  // OCP.OCP.Quantity.Quantity_Color.Convert_Lch_To_Lab_s (method)
  Convert_Lch_To_Lab_s(theLch: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Argb2color_s(theARGB
  // Remarks: Convert integer ARGB value to Color. Alpha bits are ignored. Note that this packing does NOT involve linear -> non-linear sRGB conversion, as would be usually expected to preserve higher (for human eye) color precision in 4 bytes.
  // OCP.OCP.Quantity.Quantity_Color.Argb2color_s (method)
  Argb2color_s(theARGB: int, theColor: OCP.OCP.Quantity.Quantity_Color) -> None

  // Convert_LinearRGB_To_sRGB_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Convert_LinearRGB_To_sRGB_s(theLinearValue: float) -> float Convert linear RGB component into sRGB using OpenGL specs formula (double precision), also known as gamma correction. 2. Convert_LinearRGB_To_sRGB_s(theLinearValue: float) -> float Convert linear RGB component into sRGB using OpenGL specs formula (single precision), also known as gamma correction.
  // OCP.OCP.Quantity.Quantity_Color.Convert_LinearRGB_To_sRGB_s (method)
  Convert_LinearRGB_To_sRGB_s(*args, **kwargs)
  Convert_LinearRGB_To_sRGB_s(theLinearValue: float) -> float
  Convert_LinearRGB_To_sRGB_s(theLinearValue: float) -> float

  // Convert_sRGB_To_LinearRGB_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Convert_sRGB_To_LinearRGB_s(thesRGBValue: float) -> float Convert sRGB component into linear RGB using OpenGL specs formula (double precision), also known as gamma correction. 2. Convert_sRGB_To_LinearRGB_s(thesRGBValue: float) -> float Convert sRGB component into linear RGB using OpenGL specs formula (single precision), also known as gamma correction.
  // OCP.OCP.Quantity.Quantity_Color.Convert_sRGB_To_LinearRGB_s (method)
  Convert_sRGB_To_LinearRGB_s(*args, **kwargs)
  Convert_sRGB_To_LinearRGB_s(thesRGBValue: float) -> float
  Convert_sRGB_To_LinearRGB_s(thesRGBValue: float) -> float

  // Convert_LinearRGB_To_sRGB_approx22_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Convert_LinearRGB_To_sRGB_approx22_s(theLinearValue: float) -> float Convert linear RGB component into sRGB using approximated uniform gamma coefficient 2.2. 2. Convert_LinearRGB_To_sRGB_approx22_s(theRGB: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f Convert linear RGB components into sRGB using approximated uniform gamma coefficient 2.2
  // OCP.OCP.Quantity.Quantity_Color.Convert_LinearRGB_To_sRGB_approx22_s (method)
  Convert_LinearRGB_To_sRGB_approx22_s(*args, **kwargs)
  Convert_LinearRGB_To_sRGB_approx22_s(theLinearValue: float) -> float
  Convert_LinearRGB_To_sRGB_approx22_s(theRGB: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_sRGB_To_LinearRGB_approx22_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Convert_sRGB_To_LinearRGB_approx22_s(thesRGBValue: float) -> float Convert sRGB component into linear RGB using approximated uniform gamma coefficient 2.2 2. Convert_sRGB_To_LinearRGB_approx22_s(theRGB: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f Convert sRGB components into linear RGB using approximated uniform gamma coefficient 2.2
  // OCP.OCP.Quantity.Quantity_Color.Convert_sRGB_To_LinearRGB_approx22_s (method)
  Convert_sRGB_To_LinearRGB_approx22_s(*args, **kwargs)
  Convert_sRGB_To_LinearRGB_approx22_s(thesRGBValue: float) -> float
  Convert_sRGB_To_LinearRGB_approx22_s(theRGB: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Epsilon_s() -> float
  // Remarks: Returns the value used to compare two colors for equality; 0.0001 by default.
  // OCP.OCP.Quantity.Quantity_Color.Epsilon_s (method)
  Epsilon_s() -> float

  // SetEpsilon_s(theEpsilon
  // Remarks: Set the value used to compare two colors for equality.
  // OCP.OCP.Quantity.Quantity_Color.SetEpsilon_s (method)
  SetEpsilon_s(theEpsilon: float) -> None

  // Color2argb_s(theColor
  // Remarks: Convert the color value to ARGB integer value, with alpha equals to 0. So the output is formatted as 0x00RRGGBB. Note that this unpacking does NOT involve non-linear sRGB -> linear RGB conversion, as would be usually expected for RGB color packed into 4 bytes.
  // OCP.OCP.Quantity.Quantity_Color.Color2argb_s (method)
  Color2argb_s(theColor: OCP.OCP.Quantity.Quantity_Color) -> tuple[int]

  // HlsRgb_s(theH
  // Remarks: Converts HLS components into sRGB ones.
  // OCP.OCP.Quantity.Quantity_Color.HlsRgb_s (method)
  HlsRgb_s(theH: float, theL: float, theS: float) -> tuple[float, float, float]

  // RgbHls_s(theR
  // Remarks: Converts sRGB components into HLS ones.
  // OCP.OCP.Quantity.Quantity_Color.RgbHls_s (method)
  RgbHls_s(theR: float, theG: float, theB: float) -> tuple[float, float, float]

  // Rgb(self
  // Remarks: Return the color as vector of 3 float elements.
  // OCP.OCP.Quantity.Quantity_Color.Rgb (method)
  Rgb(self: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.gp.gp_Vec3f

// Category: Quantity
// The pair of Quantity_Color and Alpha component (1.0 opaque, 0.0 transparent)
Quantity_ColorRGBA

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> None 2. __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color) -> None 3. __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color, theAlpha: float) -> None 4. __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgba: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> None 5. __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRed: float, theGreen: float, theBlue: float, theAlpha: float) -> None
  // OCP.OCP.Quantity.Quantity_ColorRGBA.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color, theAlpha: float) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgba: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRed: float, theGreen: float, theBlue: float, theAlpha: float) -> None

  // SetValues(self
  // Remarks: Assign new values to the color.
  // OCP.OCP.Quantity.Quantity_ColorRGBA.SetValues (method)
  SetValues(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRed: float, theGreen: float, theBlue: float, theAlpha: float) -> None

  // SetRGB(self
  // Remarks: Assign RGB color components without affecting alpha value.
  // OCP.OCP.Quantity.Quantity_ColorRGBA.SetRGB (method)
  SetRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color) -> None

  // Alpha(self
  // Remarks: Return alpha value (1.0 means opaque, 0.0 means fully transparent).
  // OCP.OCP.Quantity.Quantity_ColorRGBA.Alpha (method)
  Alpha(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> float

  // SetAlpha(self
  // Remarks: Assign the alpha value.
  // OCP.OCP.Quantity.Quantity_ColorRGBA.SetAlpha (method)
  SetAlpha(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theAlpha: float) -> None

  // IsDifferent(self
  // Remarks: Returns true if the distance between colors is greater than Epsilon().
  // OCP.OCP.Quantity.Quantity_ColorRGBA.IsDifferent (method)
  IsDifferent(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOther: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // IsEqual(self
  // Remarks: Two colors are considered to be equal if their distance is no greater than Epsilon().
  // OCP.OCP.Quantity.Quantity_ColorRGBA.IsEqual (method)
  IsEqual(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOther: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.Quantity.Quantity_ColorRGBA.DumpJson (method)
  DumpJson(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  // OCP.OCP.Quantity.Quantity_ColorRGBA.InitFromJson (method)
  InitFromJson(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // ColorFromName_s(theColorNameString
  // Remarks: Finds color from predefined names. For example, the name of the color which corresponds to "BLACK" is Quantity_NOC_BLACK. An alpha component is set to 1.0.
  // OCP.OCP.Quantity.Quantity_ColorRGBA.ColorFromName_s (method)
  ColorFromName_s(theColorNameString: str, theColor: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // ColorFromHex_s(theHexColorString
  // Remarks: Parses the string as a hex color (like "#FF0" for short sRGB color, "#FF0F" for short sRGBA color, "#FFFF00" for RGB color, or "#FFFF00FF" for RGBA color)
  // OCP.OCP.Quantity.Quantity_ColorRGBA.ColorFromHex_s (method)
  ColorFromHex_s(theHexColorString: str, theColor: OCP.OCP.Quantity.Quantity_ColorRGBA, theAlphaComponentIsOff: bool = False) -> bool

  // ColorToHex_s(theColor
  // Remarks: Returns hex sRGBA string in format "#RRGGBBAA".
  // OCP.OCP.Quantity.Quantity_ColorRGBA.ColorToHex_s (method)
  ColorToHex_s(theColor: OCP.OCP.Quantity.Quantity_ColorRGBA, theToPrefixHash: bool = True) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Convert_LinearRGB_To_sRGB_s(theRGB
  // Remarks: Convert linear RGB components into sRGB using OpenGL specs formula.
  // OCP.OCP.Quantity.Quantity_ColorRGBA.Convert_LinearRGB_To_sRGB_s (method)
  Convert_LinearRGB_To_sRGB_s(theRGB: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> OCP.OCP.Graphic3d.Graphic3d_Vec4

  // Convert_sRGB_To_LinearRGB_s(theRGB
  // Remarks: Convert sRGB components into linear RGB using OpenGL specs formula.
  // OCP.OCP.Quantity.Quantity_ColorRGBA.Convert_sRGB_To_LinearRGB_s (method)
  Convert_sRGB_To_LinearRGB_s(theRGB: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> OCP.OCP.Graphic3d.Graphic3d_Vec4

  // GetRGB(self
  // Remarks: Return RGB color value.
  // OCP.OCP.Quantity.Quantity_ColorRGBA.GetRGB (method)
  GetRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.Quantity.Quantity_Color

  // ChangeRGB(self
  // Remarks: Modify RGB color components without affecting alpha value.
  // OCP.OCP.Quantity.Quantity_ColorRGBA.ChangeRGB (method)
  ChangeRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.Quantity.Quantity_Color

// Category: Quantity
// Identifies color definition systems
// Remarks: Members: Quantity_TOC_RGB Quantity_TOC_sRGB Quantity_TOC_HLS Quantity_TOC_CIELab Quantity_TOC_CIELch
Quantity_TypeOfColor

  // __init__(self
  // OCP.OCP.Quantity.Quantity_TypeOfColor.__init__ (constructor)
  __init__(self: OCP.OCP.Quantity.Quantity_TypeOfColor, value: int) -> None

  // name(self
  name

  value
