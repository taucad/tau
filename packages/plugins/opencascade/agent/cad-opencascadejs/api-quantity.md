# libcascade — Quantity

4 top-level symbols. Signatures are verbatim typescript.

Quantity_Color: declare class Quantity_Color

  // Quantity_Color.constructor (constructor)
  constructor();
  constructor(theName: Quantity_NameOfColor);
  constructor(theC1: number, theC2: number, theC3: number, theType: Quantity_TypeOfColor);

  // Quantity_Color.Name (method)
  Name(): Quantity_NameOfColor;
  static Name(theR: number, theG: number, theB: number): Quantity_NameOfColor;

  // Quantity_Color.SetValues (method)
  SetValues(theName: Quantity_NameOfColor): void;
  SetValues(theC1: number, theC2: number, theC3: number, theType: Quantity_TypeOfColor): void;

  // Quantity_Color.Rgb (method)
  Rgb(): [number, number, number];

  // Quantity_Color.Red (method)
  Red(): number;

  // Quantity_Color.Green (method)
  Green(): number;

  // Quantity_Color.Blue (method)
  Blue(): number;

  // Quantity_Color.Hue (method)
  Hue(): number;

  // Quantity_Color.Light (method)
  Light(): number;

  // Quantity_Color.ChangeIntensity (method)
  ChangeIntensity(theDelta: number): void;

  // Quantity_Color.Saturation (method)
  Saturation(): number;

  // Quantity_Color.ChangeContrast (method)
  ChangeContrast(theDelta: number): void;

  // Quantity_Color.IsDifferent (method)
  IsDifferent(theOther: Quantity_Color): boolean;

  // Quantity_Color.IsEqual (method)
  IsEqual(theOther: Quantity_Color): boolean;

  // Quantity_Color.Distance (method)
  Distance(theColor: Quantity_Color): number;

  // Quantity_Color.SquareDistance (method)
  SquareDistance(theColor: Quantity_Color): number;

  // Quantity_Color.Delta (method)
  Delta(theColor: Quantity_Color, DC?: number, DI?: number): { DC: number; DI: number };

  // Quantity_Color.DeltaE2000 (method)
  DeltaE2000(theOther: Quantity_Color): number;

  // Quantity_Color.StringName (method)
  static StringName(theColor: Quantity_NameOfColor): string;

  // Quantity_Color.ColorFromHex (method)
  static ColorFromHex(theHexColorString: string, theColor: Quantity_Color): boolean;

  // Quantity_Color.ColorToHex (method)
  static ColorToHex(theColor: Quantity_Color, theToPrefixHash?: boolean): TCollection_AsciiString;

  // Quantity_Color.Color2argb (method)
  static Color2argb(theColor: Quantity_Color, theARGB?: number): { theARGB: number };

  // Quantity_Color.Argb2color (method)
  static Argb2color(theARGB: number, theColor: Quantity_Color): void;

  // Quantity_Color.Convert_LinearRGB_To_sRGB (method)
  static Convert_LinearRGB_To_sRGB(theLinearValue: number): number;

  // Quantity_Color.Convert_sRGB_To_LinearRGB (method)
  static Convert_sRGB_To_LinearRGB(thesRGBValue: number): number;

  // Quantity_Color.Convert_LinearRGB_To_sRGB_approx22 (method)
  static Convert_LinearRGB_To_sRGB_approx22(theLinearValue: number): number;

  // Quantity_Color.Convert_sRGB_To_LinearRGB_approx22 (method)
  static Convert_sRGB_To_LinearRGB_approx22(thesRGBValue: number): number;

  // Quantity_Color.HlsRgb (method)
  static HlsRgb(theH: number, theL: number, theS: number, theR?: number, theG?: number, theB?: number): { theR: number; theG: number; theB: number };

  // Quantity_Color.RgbHls (method)
  static RgbHls(theR: number, theG: number, theB: number, theH?: number, theL?: number, theS?: number): { theH: number; theL: number; theS: number };

  // Quantity_Color.Epsilon (method)
  static Epsilon(): number;

  // Quantity_Color.SetEpsilon (method)
  static SetEpsilon(theEpsilon: number): void;

  // Quantity_Color.delete (method)
  delete(): void;

  // Quantity_Color.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Quantity_ColorRGBA: declare class Quantity_ColorRGBA

  // Quantity_ColorRGBA.constructor (constructor)
  constructor();
  constructor(theRgb: Quantity_Color);
  constructor(theRgb: Quantity_Color, theAlpha: number);
  constructor(theRed: number, theGreen: number, theBlue: number, theAlpha: number);

  // Quantity_ColorRGBA.SetValues (method)
  SetValues(theRed: number, theGreen: number, theBlue: number, theAlpha: number): void;

  // Quantity_ColorRGBA.GetRGB (method)
  GetRGB(): Quantity_Color;

  // Quantity_ColorRGBA.ChangeRGB (method)
  ChangeRGB(): Quantity_Color;

  // Quantity_ColorRGBA.SetRGB (method)
  SetRGB(theRgb: Quantity_Color): void;

  // Quantity_ColorRGBA.Alpha (method)
  Alpha(): number;

  // Quantity_ColorRGBA.SetAlpha (method)
  SetAlpha(theAlpha: number): void;

  // Quantity_ColorRGBA.IsDifferent (method)
  IsDifferent(theOther: Quantity_ColorRGBA): boolean;

  // Quantity_ColorRGBA.IsEqual (method)
  IsEqual(theOther: Quantity_ColorRGBA): boolean;

  // Quantity_ColorRGBA.ColorFromName (method)
  static ColorFromName(theColorNameString: string, theColor: Quantity_ColorRGBA): boolean;

  // Quantity_ColorRGBA.ColorFromHex (method)
  static ColorFromHex(theHexColorString: string, theColor: Quantity_ColorRGBA, theAlphaComponentIsOff: boolean): boolean;

  // Quantity_ColorRGBA.ColorToHex (method)
  static ColorToHex(theColor: Quantity_ColorRGBA, theToPrefixHash?: boolean): TCollection_AsciiString;

  // Quantity_ColorRGBA.delete (method)
  delete(): void;

  // Quantity_ColorRGBA.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Quantity_NameOfColor: typeof Quantity_NameOfColor[keyof typeof Quantity_NameOfColor]

Quantity_TypeOfColor: typeof Quantity_TypeOfColor[keyof typeof Quantity_TypeOfColor]
