# build123d — Quantity

3 top-level symbols. Signatures are verbatim python.

// This class allows the definition of an RGB color as triplet of 3 normalized floating point values (red, green, blue)
Quantity_Color

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.Quantity.Quantity_Color) -> None
**init**(self: OCP.OCP.Quantity.Quantity_Color, theName: OCP.OCP.Quantity.Quantity_NameOfColor) -> None
**init**(self: OCP.OCP.Quantity.Quantity_Color, theC1: float, theC2: float, theC3: float, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> None
**init**(self: OCP.OCP.Quantity.Quantity_Color, theRgb: OCP.OCP.gp.gp_Vec3f) -> None

// Name(self
Name(self: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.Quantity.Quantity_NameOfColor

// SetValues(*args, \*\*kwargs)
SetValues(*args, \*\*kwargs)
SetValues(self: OCP.OCP.Quantity.Quantity_Color, theName: OCP.OCP.Quantity.Quantity_NameOfColor) -> None
SetValues(self: OCP.OCP.Quantity.Quantity_Color, theC1: float, theC2: float, theC3: float, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> None

// Red(self
Red(self: OCP.OCP.Quantity.Quantity_Color) -> float

// Green(self
Green(self: OCP.OCP.Quantity.Quantity_Color) -> float

// Blue(self
Blue(self: OCP.OCP.Quantity.Quantity_Color) -> float

// Hue(self
Hue(self: OCP.OCP.Quantity.Quantity_Color) -> float

// Light(self
Light(self: OCP.OCP.Quantity.Quantity_Color) -> float

// ChangeIntensity(self
ChangeIntensity(self: OCP.OCP.Quantity.Quantity_Color, theDelta: float) -> None

// Saturation(self
Saturation(self: OCP.OCP.Quantity.Quantity_Color) -> float

// ChangeContrast(self
ChangeContrast(self: OCP.OCP.Quantity.Quantity_Color, theDelta: float) -> None

// IsDifferent(self
IsDifferent(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> bool

// IsEqual(self
IsEqual(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> bool

// Distance(self
Distance(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> float

// SquareDistance(self
SquareDistance(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> float

// DeltaE2000(self
DeltaE2000(self: OCP.OCP.Quantity.Quantity_Color, theOther: OCP.OCP.Quantity.Quantity_Color) -> float

// DumpJson(self
DumpJson(self: OCP.OCP.Quantity.Quantity_Color, theOStream: io.BytesIO, theDepth: int = -1) -> None

// InitFromJson(self
InitFromJson(self: OCP.OCP.Quantity.Quantity_Color, theSStream: std::**1::basic_stringstream<char, std::**1::char_traits<char>, std::\_\_1::allocator<char>>, theStreamPos: int) -> bool

// Values(self
Values(self: OCP.OCP.Quantity.Quantity_Color, theType: OCP.OCP.Quantity.Quantity_TypeOfColor) -> tuple[float, float, float]

// Delta(self
Delta(self: OCP.OCP.Quantity.Quantity_Color, theColor: OCP.OCP.Quantity.Quantity_Color) -> tuple[float, float]

// Name_s(theR
Name_s(theR: float, theG: float, theB: float) -> OCP.OCP.Quantity.Quantity_NameOfColor

// StringName_s(theColor
StringName_s(theColor: OCP.OCP.Quantity.Quantity_NameOfColor) -> str

// ColorFromName_s(*args, \*\*kwargs)
ColorFromName_s(*args, \*\*kwargs)
ColorFromName_s(theName: str, theColor: OCP.OCP.Quantity.Quantity_NameOfColor) -> bool
ColorFromName_s(theColorNameString: str, theColor: OCP.OCP.Quantity.Quantity_Color) -> bool

// ColorFromHex_s(theHexColorString
ColorFromHex_s(theHexColorString: str, theColor: OCP.OCP.Quantity.Quantity_Color) -> bool

// ColorToHex_s(theColor
ColorToHex_s(theColor: OCP.OCP.Quantity.Quantity_Color, theToPrefixHash: bool = True) -> OCP.OCP.TCollection.TCollection_AsciiString

// Convert_sRGB_To_HLS_s(theRgb
Convert_sRGB_To_HLS_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Convert_HLS_To_sRGB_s(theHls
Convert_HLS_To_sRGB_s(theHls: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Convert_LinearRGB_To_HLS_s(theRgb
Convert_LinearRGB_To_HLS_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Convert_HLS_To_LinearRGB_s(theHls
Convert_HLS_To_LinearRGB_s(theHls: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Convert_LinearRGB_To_Lab_s(theRgb
Convert_LinearRGB_To_Lab_s(theRgb: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Convert_Lab_To_Lch_s(theLab
Convert_Lab_To_Lch_s(theLab: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Convert_Lab_To_LinearRGB_s(theLab
Convert_Lab_To_LinearRGB_s(theLab: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Convert_Lch_To_Lab_s(theLch
Convert_Lch_To_Lab_s(theLch: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Argb2color_s(theARGB
Argb2color_s(theARGB: int, theColor: OCP.OCP.Quantity.Quantity_Color) -> None

// Convert_LinearRGB_To_sRGB_s(*args, \*\*kwargs)
Convert_LinearRGB_To_sRGB_s(*args, \*\*kwargs)
Convert_LinearRGB_To_sRGB_s(theLinearValue: float) -> float
Convert_LinearRGB_To_sRGB_s(theLinearValue: float) -> float

// Convert_sRGB_To_LinearRGB_s(*args, \*\*kwargs)
Convert_sRGB_To_LinearRGB_s(*args, \*\*kwargs)
Convert_sRGB_To_LinearRGB_s(thesRGBValue: float) -> float
Convert_sRGB_To_LinearRGB_s(thesRGBValue: float) -> float

// Convert_LinearRGB_To_sRGB_approx22_s(*args, \*\*kwargs)
Convert_LinearRGB_To_sRGB_approx22_s(*args, \*\*kwargs)
Convert_LinearRGB_To_sRGB_approx22_s(theLinearValue: float) -> float
Convert_LinearRGB_To_sRGB_approx22_s(theRGB: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Convert_sRGB_To_LinearRGB_approx22_s(*args, \*\*kwargs)
Convert_sRGB_To_LinearRGB_approx22_s(*args, \*\*kwargs)
Convert_sRGB_To_LinearRGB_approx22_s(thesRGBValue: float) -> float
Convert_sRGB_To_LinearRGB_approx22_s(theRGB: OCP.OCP.gp.gp_Vec3f) -> OCP.OCP.gp.gp_Vec3f

// Epsilon_s() -> float
Epsilon_s() -> float

// SetEpsilon_s(theEpsilon
SetEpsilon_s(theEpsilon: float) -> None

// Color2argb_s(theColor
Color2argb_s(theColor: OCP.OCP.Quantity.Quantity_Color) -> tuple[int]

// HlsRgb_s(theH
HlsRgb_s(theH: float, theL: float, theS: float) -> tuple[float, float, float]

// RgbHls_s(theR
RgbHls_s(theR: float, theG: float, theB: float) -> tuple[float, float, float]

// Rgb(self
Rgb(self: OCP.OCP.Quantity.Quantity_Color) -> OCP.OCP.gp.gp_Vec3f

// The pair of Quantity_Color and Alpha component (1.0 opaque, 0.0 transparent)
Quantity_ColorRGBA

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> None
**init**(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color) -> None
**init**(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color, theAlpha: float) -> None
**init**(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgba: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> None
**init**(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRed: float, theGreen: float, theBlue: float, theAlpha: float) -> None

// SetValues(self
SetValues(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRed: float, theGreen: float, theBlue: float, theAlpha: float) -> None

// SetRGB(self
SetRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theRgb: OCP.OCP.Quantity.Quantity_Color) -> None

// Alpha(self
Alpha(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> float

// SetAlpha(self
SetAlpha(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theAlpha: float) -> None

// IsDifferent(self
IsDifferent(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOther: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

// IsEqual(self
IsEqual(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOther: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

// DumpJson(self
DumpJson(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theOStream: io.BytesIO, theDepth: int = -1) -> None

// InitFromJson(self
InitFromJson(self: OCP.OCP.Quantity.Quantity_ColorRGBA, theSStream: std::**1::basic_stringstream<char, std::**1::char_traits<char>, std::\_\_1::allocator<char>>, theStreamPos: int) -> bool

// ColorFromName_s(theColorNameString
ColorFromName_s(theColorNameString: str, theColor: OCP.OCP.Quantity.Quantity_ColorRGBA) -> bool

// ColorFromHex_s(theHexColorString
ColorFromHex_s(theHexColorString: str, theColor: OCP.OCP.Quantity.Quantity_ColorRGBA, theAlphaComponentIsOff: bool = False) -> bool

// ColorToHex_s(theColor
ColorToHex_s(theColor: OCP.OCP.Quantity.Quantity_ColorRGBA, theToPrefixHash: bool = True) -> OCP.OCP.TCollection.TCollection_AsciiString

// Convert_LinearRGB_To_sRGB_s(theRGB
Convert_LinearRGB_To_sRGB_s(theRGB: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> OCP.OCP.Graphic3d.Graphic3d_Vec4

// Convert_sRGB_To_LinearRGB_s(theRGB
Convert_sRGB_To_LinearRGB_s(theRGB: OCP.OCP.Graphic3d.Graphic3d_Vec4) -> OCP.OCP.Graphic3d.Graphic3d_Vec4

// GetRGB(self
GetRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.Quantity.Quantity_Color

// ChangeRGB(self
ChangeRGB(self: OCP.OCP.Quantity.Quantity_ColorRGBA) -> OCP.OCP.Quantity.Quantity_Color

// Identifies color definition systems
Quantity_TypeOfColor

// **init**(self
**init**(self: OCP.OCP.Quantity.Quantity_TypeOfColor, value: int) -> None

// name(self
name

value
