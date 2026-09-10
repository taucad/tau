# libcascade — Quantity

4 top-level symbols. Signatures are verbatim typescript.

// This class allows the definition of an RGB color as triplet of 3 normalized floating point values (red, green, blue)
Quantity_Color: declare class Quantity_Color

constructor

// Returns the name of the nearest color from the Quantity_NameOfColor enumeration
Name(): Quantity_NameOfColor;
static Name(theR: number, theG: number, theB: number): Quantity_NameOfColor;

// Updates the color from specified named color
SetValues(theName: Quantity_NameOfColor): void;
SetValues(theC1: number, theC2: number, theC3: number, theType: Quantity_TypeOfColor): void;
SetValues(theName: Quantity_NameOfColor): void;
SetValues(theC1: number, theC2: number, theC3: number, theType: Quantity_TypeOfColor): void;

// Return the color as vector of 3 float elements
Rgb(): [number, number, number];

// Returns the Red component (quantity of red) of the color within range [0.0
Red(): number;

// Returns the Green component (quantity of green) of the color within range [0.0
Green(): number;

// Returns the Blue component (quantity of blue) of the color within range [0.0
Blue(): number;

// Returns the Hue component (hue angle) of the color in degrees within range [0.0
Hue(): number;

// Returns the Light component (value of the lightness) of the color within range [0.0
Light(): number;

// Increases or decreases the intensity (variation of the lightness)
ChangeIntensity(theDelta: number): void;

// Returns the Saturation component (value of the saturation) of the color within range [0.0
Saturation(): number;

// Increases or decreases the contrast (variation of the saturation)
ChangeContrast(theDelta: number): void;

// Returns TRUE if the distance between two colors is greater than `Epsilon()`
IsDifferent(theOther: Quantity_Color): boolean;

// Returns TRUE if the distance between two colors is no greater than `Epsilon()`
IsEqual(theOther: Quantity_Color): boolean;

// Returns the distance between two colors
Distance(theColor: Quantity_Color): number;

// Returns the square of distance between two colors
SquareDistance(theColor: Quantity_Color): number;

// Returns the percentage change of contrast and intensity between this and another color
Delta(theColor: Quantity_Color, DC?: number, DI?: number): { DC: number; DI: number };

// Returns the value of the perceptual difference between this color and `theOther`, computed using the CIEDE2000 formula
DeltaE2000(theOther: Quantity_Color): number;

// Returns the name of the color identified by the given Quantity_NameOfColor enumeration value
static StringName(theColor: Quantity_NameOfColor): string;

static ColorFromHex(theHexColorString: string, theColor: Quantity_Color): boolean;

static ColorToHex(theColor: Quantity_Color, theToPrefixHash?: boolean): TCollection_AsciiString;

static Color2argb(theColor: Quantity_Color, theARGB?: number): { theARGB: number };

static Argb2color(theARGB: number, theColor: Quantity_Color): void;

static Convert_LinearRGB_To_sRGB(theLinearValue: number): number;

static Convert_sRGB_To_LinearRGB(thesRGBValue: number): number;

static Convert_LinearRGB_To_sRGB_approx22(theLinearValue: number): number;

static Convert_sRGB_To_LinearRGB_approx22(thesRGBValue: number): number;

static HlsRgb(theH: number, theL: number, theS: number, theR?: number, theG?: number, theB?: number): { theR: number; theG: number; theB: number };

static RgbHls(theR: number, theG: number, theB: number, theH?: number, theL?: number, theS?: number): { theH: number; theL: number; theS: number };

static Epsilon(): number;

static SetEpsilon(theEpsilon: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The pair of {@link Quantity_Color`Quantity_Color`} and Alpha component (1.0 opaque, 0.0 transparent)
Quantity_ColorRGBA: declare class Quantity_ColorRGBA

constructor

// Assign new values to the color
SetValues(theRed: number, theGreen: number, theBlue: number, theAlpha: number): void;

// Return RGB color value
GetRGB(): Quantity_Color;

// Modify RGB color components without affecting alpha value
ChangeRGB(): Quantity_Color;

// Assign RGB color components without affecting alpha value
SetRGB(theRgb: Quantity_Color): void;

// Return alpha value (1.0 means opaque, 0.0 means fully transparent)
Alpha(): number;

// Assign the alpha value
SetAlpha(theAlpha: number): void;

// Returns true if the distance between colors is greater than `Epsilon()`
IsDifferent(theOther: Quantity_ColorRGBA): boolean;

// Two colors are considered to be equal if their distance is no greater than `Epsilon()`
IsEqual(theOther: Quantity_ColorRGBA): boolean;

// Finds color from predefined names
static ColorFromName(theColorNameString: string, theColor: Quantity_ColorRGBA): boolean;
// theColorNameString: the color name
// theColor: a found color Mutated in place

// Parses the string as a hex color (like "#FF0" for short sRGB color, "#FF0F" for short sRGBA color, "#FFFF00" for RGB color, or "#FFFF00FF" for RGBA color)
static ColorFromHex(theHexColorString: string, theColor: Quantity_ColorRGBA, theAlphaComponentIsOff: boolean): boolean;
// theHexColorString: the string to be parsed
// theColor: a color that is a result of parsing Mutated in place
// theAlphaComponentIsOff: the flag that indicates if a color alpha component is presented in the input string (false) or not (true)

// Returns hex sRGBA string in format "#RRGGBBAA"
static ColorToHex(theColor: Quantity_ColorRGBA, theToPrefixHash?: boolean): TCollection_AsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of names of known colors
Quantity_NameOfColor: typeof Quantity_NameOfColor[keyof typeof Quantity_NameOfColor]

// Identifies color definition systems
Quantity_TypeOfColor: typeof Quantity_TypeOfColor[keyof typeof Quantity_TypeOfColor]
