# libcascade — Quantity

4 top-level symbols. Signatures are verbatim typescript.

Quantity_Color: declare class Quantity_Color

constructor

Name(): Quantity_NameOfColor;
static Name(theR: number, theG: number, theB: number): Quantity_NameOfColor;

SetValues(theName: Quantity_NameOfColor): void;
SetValues(theC1: number, theC2: number, theC3: number, theType: Quantity_TypeOfColor): void;
SetValues(theName: Quantity_NameOfColor): void;
SetValues(theC1: number, theC2: number, theC3: number, theType: Quantity_TypeOfColor): void;

Rgb(): [number, number, number];

Red(): number;

Green(): number;

Blue(): number;

Hue(): number;

Light(): number;

ChangeIntensity(theDelta: number): void;

Saturation(): number;

ChangeContrast(theDelta: number): void;

IsDifferent(theOther: Quantity_Color): boolean;

IsEqual(theOther: Quantity_Color): boolean;

Distance(theColor: Quantity_Color): number;

SquareDistance(theColor: Quantity_Color): number;

Delta(theColor: Quantity_Color, DC?: number, DI?: number): { DC: number; DI: number };

DeltaE2000(theOther: Quantity_Color): number;

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

delete(): void;

[Symbol.dispose](): void;

Quantity_ColorRGBA: declare class Quantity_ColorRGBA

constructor

SetValues(theRed: number, theGreen: number, theBlue: number, theAlpha: number): void;

GetRGB(): Quantity_Color;

ChangeRGB(): Quantity_Color;

SetRGB(theRgb: Quantity_Color): void;

Alpha(): number;

SetAlpha(theAlpha: number): void;

IsDifferent(theOther: Quantity_ColorRGBA): boolean;

IsEqual(theOther: Quantity_ColorRGBA): boolean;

static ColorFromName(theColorNameString: string, theColor: Quantity_ColorRGBA): boolean;

static ColorFromHex(theHexColorString: string, theColor: Quantity_ColorRGBA, theAlphaComponentIsOff: boolean): boolean;

static ColorToHex(theColor: Quantity_ColorRGBA, theToPrefixHash?: boolean): TCollection_AsciiString;

delete(): void;

[Symbol.dispose](): void;

Quantity_NameOfColor: typeof Quantity_NameOfColor[keyof typeof Quantity_NameOfColor]

Quantity_TypeOfColor: typeof Quantity_TypeOfColor[keyof typeof Quantity_TypeOfColor]
