# build123d — Quantity

3 top-level symbols. Signatures are verbatim python.

// This class allows the definition of an RGB color as triplet of 3 normalized floating point values (red, green, blue)
Quantity_Color

  // __init__(*args, **kwargs)
  // OCP.OCP.Quantity.Quantity_Color.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Quantity.Quantity_Color) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_Color, theName: OCP.OCP.Quantity.Quantity_NameOfColor) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_Color, theC1: float, theC2: float, theC3: float, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_Color, theRgb: OCP.OCP.gp.gp_Vec3f) -> None

  // Name(self
  // OCP.OCP.Quantity.Quantity_Color.Name (method)
  Name(self: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.Quantity.Quantity_NameOfColor

  // SetValues(*args, **kwargs)
  // OCP.OCP.Quantity.Quantity_Color.SetValues (method)
  SetValues(*args, **kwargs)
  SetValues(self: OCP.OCP.Quantity.Quantity_Color, theName: OCP.OCP.Quantity.Quantity_NameOfColor) -> None
  SetValues(self: OCP.OCP.Quantity.Quantity_Color, theC1: float, theC2: float, theC3: float, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> None

  // Red(self
  // OCP.OCP.Quantity.Quantity_Color.Red (method)
  Red(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // Green(self
  // OCP.OCP.Quantity.Quantity_Color.Green (method)
  Green(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // Blue(self
  // OCP.OCP.Quantity.Quantity_Color.Blue (method)
  Blue(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // Hue(self
  // OCP.OCP.Quantity.Quantity_Color.Hue (method)
  Hue(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // Light(self
  // OCP.OCP.Quantity.Quantity_Color.Light (method)
  Light(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // ChangeIntensity(self
  // OCP.OCP.Quantity.Quantity_Color.ChangeIntensity (method)
  ChangeIntensity(self: OCP.OCP.Quantity.Quantity_Color, theDelta: float) -> None

  // Saturation(self
  // OCP.OCP.Quantity.Quantity_Color.Saturation (method)
  Saturation(self: OCP.OCP.Quantity.Quantity_Color) -> float

  // ChangeContrast(self
  // OCP.OCP.Quantity.Quantity_Color.ChangeContrast (method)
  ChangeContrast(self: OCP.OCP.Quantity.Quantity_Color, theDelta: float) -> None

  // IsDifferent(self
  // OCP.OCP.Quantity.Quantity_Color.IsDifferent (method)
  IsDifferent(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> bool

  // IsEqual(self
  // OCP.OCP.Quantity.Quantity_Color.IsEqual (method)
  IsEqual(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> bool

  // Distance(self
  // OCP.OCP.Quantity.Quantity_Color.Distance (method)
  Distance(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> float

  // SquareDistance(self
  // OCP.OCP.Quantity.Quantity_Color.SquareDistance (method)
  SquareDistance(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> float

  // DeltaE2000(self
  // OCP.OCP.Quantity.Quantity_Color.DeltaE2000 (method)
  DeltaE2000(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> float

  // DumpJson(self
  // OCP.OCP.Quantity.Quantity_Color.DumpJson (method)
  DumpJson(self: OCP.OCP.Quantity.Quantity_Color, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.Quantity.Quantity_Color.InitFromJson (method)
  InitFromJson(self: OCP.OCP.Quantity.Quantity_Color, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Values(self
  // OCP.OCP.Quantity.Quantity_Color.Values (method)
  Values(self: OCP.OCP.Quantity.Quantity_Color, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> tuple[float, float, float]

  // Delta(self
  // OCP.OCP.Quantity.Quantity_Color.Delta (method)
  Delta(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> tuple[float, float]

  // Name_s(theR
  // OCP.OCP.Quantity.Quantity_Color.Name_s (method)
  Name_s(theR: float, theG: float, theB: float) -> OCP.OCP.Quantity.Quantity_NameOfColor

  // StringName_s(theColor
  // OCP.OCP.Quantity.Quantity_Color.StringName_s (method)
  StringName_s(theColor: OCP.OCP.Quantity.Quantity_NameOfColor) -> str

  // ColorFromName_s(*args, **kwargs)
  // OCP.OCP.Quantity.Quantity_Color.ColorFromName_s (method)
  ColorFromName_s(*args, **kwargs)
  ColorFromName_s(theName: str, theColor: OCP.OCP.Quantity.Quantity_NameOfColor) -> bool
  ColorFromName_s(theColorNameString: str, theColor: OCP.OCP.Quantity.Quantity_Color) -> bool

  // ColorFromHex_s(theHexColorString
  // OCP.OCP.Quantity.Quantity_Color.ColorFromHex_s (method)
  ColorFromHex_s(theHexColorString: str, theColor: OCP.OCP.Quantity.Quantity_Color) -> bool

  // ColorToHex_s(theColor
  // OCP.OCP.Quantity.Quantity_Color.ColorToHex_s (method)
  ColorToHex_s(theColor: OCP.OCP.Quantity.Quantity_Color, theToPrefixHash: bool = True) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Convert_sRGB_To_HLS_s(theRgb
  // OCP.OCP.Quantity.Quantity_Color.Convert_sRGB_To_HLS_s (method)
  Convert_sRGB_To_HLS_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_HLS_To_sRGB_s(theHls
  // OCP.OCP.Quantity.Quantity_Color.Convert_HLS_To_sRGB_s (method)
  Convert_HLS_To_sRGB_s(theHls: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_LinearRGB_To_HLS_s(theRgb
  // OCP.OCP.Quantity.Quantity_Color.Convert_LinearRGB_To_HLS_s (method)
  Convert_LinearRGB_To_HLS_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_HLS_To_LinearRGB_s(theHls
  // OCP.OCP.Quantity.Quantity_Color.Convert_HLS_To_LinearRGB_s (method)
  Convert_HLS_To_LinearRGB_s(theHls: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_LinearRGB_To_Lab_s(theRgb
  // OCP.OCP.Quantity.Quantity_Color.Convert_LinearRGB_To_Lab_s (method)
  Convert_LinearRGB_To_Lab_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_Lab_To_Lch_s(theLab
  // OCP.OCP.Quantity.Quantity_Color.Convert_Lab_To_Lch_s (method)
  Convert_Lab_To_Lch_s(theLab: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_Lab_To_LinearRGB_s(theLab
  // OCP.OCP.Quantity.Quantity_Color.Convert_Lab_To_LinearRGB_s (method)
  Convert_Lab_To_LinearRGB_s(theLab: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_Lch_To_Lab_s(theLch
  // OCP.OCP.Quantity.Quantity_Color.Convert_Lch_To_Lab_s (method)
  Convert_Lch_To_Lab_s(theLch: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Argb2color_s(theARGB
  // OCP.OCP.Quantity.Quantity_Color.Argb2color_s (method)
  Argb2color_s(theARGB: int, theColor: OCP.OCP.Quantity.Quantity_Color) -> None

  // Convert_LinearRGB_To_sRGB_s(*args, **kwargs)
  // OCP.OCP.Quantity.Quantity_Color.Convert_LinearRGB_To_sRGB_s (method)
  Convert_LinearRGB_To_sRGB_s(*args, **kwargs)
  Convert_LinearRGB_To_sRGB_s(theLinearValue: float) -> float
  Convert_LinearRGB_To_sRGB_s(theLinearValue: float) -> float

  // Convert_sRGB_To_LinearRGB_s(*args, **kwargs)
  // OCP.OCP.Quantity.Quantity_Color.Convert_sRGB_To_LinearRGB_s (method)
  Convert_sRGB_To_LinearRGB_s(*args, **kwargs)
  Convert_sRGB_To_LinearRGB_s(thesRGBValue: float) -> float
  Convert_sRGB_To_LinearRGB_s(thesRGBValue: float) -> float

  // Convert_LinearRGB_To_sRGB_approx22_s(*args, **kwargs)
  // OCP.OCP.Quantity.Quantity_Color.Convert_LinearRGB_To_sRGB_approx22_s (method)
  Convert_LinearRGB_To_sRGB_approx22_s(*args, **kwargs)
  Convert_LinearRGB_To_sRGB_approx22_s(theLinearValue: float) -> float
  Convert_LinearRGB_To_sRGB_approx22_s(theRGB: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Convert_sRGB_To_LinearRGB_approx22_s(*args, **kwargs)
  // OCP.OCP.Quantity.Quantity_Color.Convert_sRGB_To_LinearRGB_approx22_s (method)
  Convert_sRGB_To_LinearRGB_approx22_s(*args, **kwargs)
  Convert_sRGB_To_LinearRGB_approx22_s(thesRGBValue: float) -> float
  Convert_sRGB_To_LinearRGB_approx22_s(theRGB: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

  // Epsilon_s() -> float
  // OCP.OCP.Quantity.Quantity_Color.Epsilon_s (method)
  Epsilon_s() -> float

  // SetEpsilon_s(theEpsilon
  // OCP.OCP.Quantity.Quantity_Color.SetEpsilon_s (method)
  SetEpsilon_s(theEpsilon: float) -> None

  // Color2argb_s(theColor
  // OCP.OCP.Quantity.Quantity_Color.Color2argb_s (method)
  Color2argb_s(theColor: OCP.OCP.Quantity.Quantity_Color) -> tuple[int]

  // HlsRgb_s(theH
  // OCP.OCP.Quantity.Quantity_Color.HlsRgb_s (method)
  HlsRgb_s(theH: float, theL: float, theS: float) -> tuple[float, float, float]

  // RgbHls_s(theR
  // OCP.OCP.Quantity.Quantity_Color.RgbHls_s (method)
  RgbHls_s(theR: float, theG: float, theB: float) -> tuple[float, float, float]

  // Rgb(self
  // OCP.OCP.Quantity.Quantity_Color.Rgb (method)
  Rgb(self: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.gp.gp_Vec3f

// The pair of Quantity_Color and Alpha component (1.0 opaque, 0.0 transparent)
Quantity_ColorRGBA

  // __init__(*args, **kwargs)
  // OCP.OCP.Quantity.Quantity_ColorRGBA.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color, theAlpha: float) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgba: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> None
  __init__(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRed: float, theGreen: float, theBlue: float, theAlpha: float) -> None

  // SetValues(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.SetValues (method)
  SetValues(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRed: float, theGreen: float, theBlue: float, theAlpha: float) -> None

  // SetRGB(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.SetRGB (method)
  SetRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color) -> None

  // Alpha(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.Alpha (method)
  Alpha(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> float

  // SetAlpha(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.SetAlpha (method)
  SetAlpha(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theAlpha: float) -> None

  // IsDifferent(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.IsDifferent (method)
  IsDifferent(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOther: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // IsEqual(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.IsEqual (method)
  IsEqual(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOther: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // DumpJson(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.DumpJson (method)
  DumpJson(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.InitFromJson (method)
  InitFromJson(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // ColorFromName_s(theColorNameString
  // OCP.OCP.Quantity.Quantity_ColorRGBA.ColorFromName_s (method)
  ColorFromName_s(theColorNameString: str, theColor: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

  // ColorFromHex_s(theHexColorString
  // OCP.OCP.Quantity.Quantity_ColorRGBA.ColorFromHex_s (method)
  ColorFromHex_s(theHexColorString: str, theColor: OCP.OCP.Quantity.Quantity_ColorRGBA, theAlphaComponentIsOff: bool = False) -> bool

  // ColorToHex_s(theColor
  // OCP.OCP.Quantity.Quantity_ColorRGBA.ColorToHex_s (method)
  ColorToHex_s(theColor: OCP.OCP.Quantity.Quantity_ColorRGBA, theToPrefixHash: bool = True) -> OCP.OCP.TCollection.TCollection_AsciiString

  // Convert_LinearRGB_To_sRGB_s(theRGB
  // OCP.OCP.Quantity.Quantity_ColorRGBA.Convert_LinearRGB_To_sRGB_s (method)
  Convert_LinearRGB_To_sRGB_s(theRGB: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> OCP.OCP.Graphic3d.Graphic3d_Vec4

  // Convert_sRGB_To_LinearRGB_s(theRGB
  // OCP.OCP.Quantity.Quantity_ColorRGBA.Convert_sRGB_To_LinearRGB_s (method)
  Convert_sRGB_To_LinearRGB_s(theRGB: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> OCP.OCP.Graphic3d.Graphic3d_Vec4

  // GetRGB(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.GetRGB (method)
  GetRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.Quantity.Quantity_Color

  // ChangeRGB(self
  // OCP.OCP.Quantity.Quantity_ColorRGBA.ChangeRGB (method)
  ChangeRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.Quantity.Quantity_Color

// Identifies color definition systems
Quantity_TypeOfColor

  // __init__(self
  // OCP.OCP.Quantity.Quantity_TypeOfColor.__init__ (constructor)
  __init__(self: OCP.OCP.Quantity.Quantity_TypeOfColor, value: int) -> None

  // name(self
  name

  value
