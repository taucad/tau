# libcascade — Units

24 top-level symbols. Signatures are verbatim typescript.

Units: declare class Units

  // Units.constructor (constructor)
  constructor();

  // Units.UnitsFile (method)
  static UnitsFile(afile: string): void;

  // Units.LexiconFile (method)
  static LexiconFile(afile: string): void;

  // Units.DictionaryOfUnits (method)
  static DictionaryOfUnits(amode?: boolean): Units_UnitsDictionary;

  // Units.Quantity (method)
  static Quantity(aquantity: string): Units_Quantity;

  // Units.FirstQuantity (method)
  static FirstQuantity(aunit: string): string;

  // Units.LexiconUnits (method)
  static LexiconUnits(amode?: boolean): Units_Lexicon;

  // Units.LexiconFormula (method)
  static LexiconFormula(): Units_Lexicon;

  // Units.NullDimensions (method)
  static NullDimensions(): Units_Dimensions;

  // Units.Convert (method)
  static Convert(avalue: number, afirstunit: string, asecondunit: string): number;

  // Units.ToSI (method)
  static ToSI(aData: number, aUnit: string): number;

  // Units.ToSI_1 (method)
  static ToSI_1(aData: number, aUnit: string): number;

  // Units.ToSI_2 (method)
  static ToSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

  // Units.FromSI (method)
  static FromSI(aData: number, aUnit: string): number;

  // Units.FromSI_1 (method)
  static FromSI_1(aData: number, aUnit: string): number;

  // Units.FromSI_2 (method)
  static FromSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

  // Units.Dimensions (method)
  static Dimensions(aType: string): Units_Dimensions;

  // Units.delete (method)
  delete(): void;

  // Units.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_Dimensions: declare class Units_Dimensions extends Standard_Transient

  // Units_Dimensions.constructor (constructor)
  constructor(amass: number, alength: number, atime: number, anelectriccurrent: number, athermodynamictemperature: number, anamountofsubstance: number, aluminousintensity: number, aplaneangle: number, asolidangle: number);

  // Units_Dimensions.Mass (method)
  Mass(): number;

  // Units_Dimensions.Length (method)
  Length(): number;

  // Units_Dimensions.Time (method)
  Time(): number;

  // Units_Dimensions.ElectricCurrent (method)
  ElectricCurrent(): number;

  // Units_Dimensions.ThermodynamicTemperature (method)
  ThermodynamicTemperature(): number;

  // Units_Dimensions.AmountOfSubstance (method)
  AmountOfSubstance(): number;

  // Units_Dimensions.LuminousIntensity (method)
  LuminousIntensity(): number;

  // Units_Dimensions.PlaneAngle (method)
  PlaneAngle(): number;

  // Units_Dimensions.SolidAngle (method)
  SolidAngle(): number;

  // Units_Dimensions.Quantity (method)
  Quantity(): string;

  // Units_Dimensions.Multiply (method)
  Multiply(adimensions: Units_Dimensions): Units_Dimensions;

  // Units_Dimensions.Divide (method)
  Divide(adimensions: Units_Dimensions): Units_Dimensions;

  // Units_Dimensions.Power (method)
  Power(anexponent: number): Units_Dimensions;

  // Units_Dimensions.IsEqual (method)
  IsEqual(adimensions: Units_Dimensions): boolean;

  // Units_Dimensions.IsNotEqual (method)
  IsNotEqual(adimensions: Units_Dimensions): boolean;

  // Units_Dimensions.Dump (method)
  Dump(ashift: number): void;

  // Units_Dimensions.ALess (method)
  static ALess(): Units_Dimensions;

  // Units_Dimensions.AMass (method)
  static AMass(): Units_Dimensions;

  // Units_Dimensions.ALength (method)
  static ALength(): Units_Dimensions;

  // Units_Dimensions.ATime (method)
  static ATime(): Units_Dimensions;

  // Units_Dimensions.AElectricCurrent (method)
  static AElectricCurrent(): Units_Dimensions;

  // Units_Dimensions.AThermodynamicTemperature (method)
  static AThermodynamicTemperature(): Units_Dimensions;

  // Units_Dimensions.AAmountOfSubstance (method)
  static AAmountOfSubstance(): Units_Dimensions;

  // Units_Dimensions.ALuminousIntensity (method)
  static ALuminousIntensity(): Units_Dimensions;

  // Units_Dimensions.APlaneAngle (method)
  static APlaneAngle(): Units_Dimensions;

  // Units_Dimensions.ASolidAngle (method)
  static ASolidAngle(): Units_Dimensions;

  // Units_Dimensions.get_type_name (method)
  static get_type_name(): string;

  // Units_Dimensions.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_Dimensions.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_Dimensions.delete (method)
  delete(): void;

  // Units_Dimensions.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_Explorer: declare class Units_Explorer

  // Units_Explorer.constructor (constructor)
  constructor();
  constructor(aunitssystem: Units_UnitsSystem);
  constructor(aunitsdictionary: Units_UnitsDictionary);
  constructor(aunitssystem: Units_UnitsSystem, aquantity: string);
  constructor(aunitsdictionary: Units_UnitsDictionary, aquantity: string);

  // Units_Explorer.Init (method)
  Init(aunitssystem: Units_UnitsSystem): void;
  Init(aunitsdictionary: Units_UnitsDictionary): void;
  Init(aunitssystem: Units_UnitsSystem, aquantity: string): void;
  Init(aunitsdictionary: Units_UnitsDictionary, aquantity: string): void;

  // Units_Explorer.MoreQuantity (method)
  MoreQuantity(): boolean;

  // Units_Explorer.NextQuantity (method)
  NextQuantity(): void;

  // Units_Explorer.Quantity (method)
  Quantity(): TCollection_AsciiString;

  // Units_Explorer.MoreUnit (method)
  MoreUnit(): boolean;

  // Units_Explorer.NextUnit (method)
  NextUnit(): void;

  // Units_Explorer.Unit (method)
  Unit(): TCollection_AsciiString;

  // Units_Explorer.IsActive (method)
  IsActive(): boolean;

  // Units_Explorer.delete (method)
  delete(): void;

  // Units_Explorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_Lexicon: declare class Units_Lexicon extends Standard_Transient

  // Units_Lexicon.constructor (constructor)
  constructor();

  // Units_Lexicon.Creates (method)
  Creates(): void;

  // Units_Lexicon.Sequence (method)
  Sequence(): NCollection_HSequence_handle_Units_Token;

  // Units_Lexicon.AddToken (method)
  AddToken(aword: string, amean: string, avalue: number): void;

  // Units_Lexicon.Dump (method)
  Dump(): void;

  // Units_Lexicon.get_type_name (method)
  static get_type_name(): string;

  // Units_Lexicon.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_Lexicon.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_Lexicon.delete (method)
  delete(): void;

  // Units_Lexicon.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_MathSentence: declare class Units_MathSentence extends Units_Sentence

  // Units_MathSentence.constructor (constructor)
  constructor(astring: string);

  // Units_MathSentence.delete (method)
  delete(): void;

  // Units_MathSentence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_Measurement: declare class Units_Measurement

  // Units_Measurement.constructor (constructor)
  constructor();
  constructor(avalue: number, atoken: Units_Token);
  constructor(avalue: number, aunit: string);

  // Units_Measurement.Convert (method)
  Convert(aunit: string): void;

  // Units_Measurement.Integer (method)
  Integer(): Units_Measurement;

  // Units_Measurement.Fractional (method)
  Fractional(): Units_Measurement;

  // Units_Measurement.Measurement (method)
  Measurement(): number;

  // Units_Measurement.Token (method)
  Token(): Units_Token;

  // Units_Measurement.Add (method)
  Add(ameasurement: Units_Measurement): Units_Measurement;

  // Units_Measurement.Subtract (method)
  Subtract(ameasurement: Units_Measurement): Units_Measurement;

  // Units_Measurement.Multiply (method)
  Multiply(ameasurement: Units_Measurement): Units_Measurement;
  Multiply(avalue: number): Units_Measurement;

  // Units_Measurement.Divide (method)
  Divide(ameasurement: Units_Measurement): Units_Measurement;
  Divide(avalue: number): Units_Measurement;

  // Units_Measurement.Power (method)
  Power(anexponent: number): Units_Measurement;

  // Units_Measurement.HasToken (method)
  HasToken(): boolean;

  // Units_Measurement.Dump (method)
  Dump(): void;

  // Units_Measurement.delete (method)
  delete(): void;

  // Units_Measurement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_NoSuchType: declare class Units_NoSuchType extends Standard_NoSuchObject

  // Units_NoSuchType.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Units_NoSuchType.ExceptionType (method)
  ExceptionType(): string;

  // Units_NoSuchType.delete (method)
  delete(): void;

  // Units_NoSuchType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_NoSuchUnit: declare class Units_NoSuchUnit extends Standard_NoSuchObject

  // Units_NoSuchUnit.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Units_NoSuchUnit.ExceptionType (method)
  ExceptionType(): string;

  // Units_NoSuchUnit.delete (method)
  delete(): void;

  // Units_NoSuchUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_Quantity: declare class Units_Quantity extends Standard_Transient

  // Units_Quantity.constructor (constructor)
  constructor(aname: string, adimensions: Units_Dimensions, aunitssequence: NCollection_HSequence_handle_Units_Unit);

  // Units_Quantity.Name (method)
  Name(): TCollection_AsciiString;

  // Units_Quantity.Dimensions (method)
  Dimensions(): Units_Dimensions;

  // Units_Quantity.Sequence (method)
  Sequence(): NCollection_HSequence_handle_Units_Unit;

  // Units_Quantity.IsEqual (method)
  IsEqual(astring: string): boolean;

  // Units_Quantity.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // Units_Quantity.get_type_name (method)
  static get_type_name(): string;

  // Units_Quantity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_Quantity.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_Quantity.delete (method)
  delete(): void;

  // Units_Quantity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_Sentence: declare class Units_Sentence

  // Units_Sentence.constructor (constructor)
  constructor(alexicon: Units_Lexicon, astring: string);

  // Units_Sentence.SetConstants (method)
  SetConstants(): void;

  // Units_Sentence.Sequence (method)
  Sequence(): NCollection_HSequence_handle_Units_Token;
  Sequence(asequenceoftokens: NCollection_HSequence_handle_Units_Token): void;

  // Units_Sentence.Evaluate (method)
  Evaluate(): Units_Token;

  // Units_Sentence.IsDone (method)
  IsDone(): boolean;

  // Units_Sentence.Dump (method)
  Dump(): void;

  // Units_Sentence.delete (method)
  delete(): void;

  // Units_Sentence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_ShiftedToken: declare class Units_ShiftedToken extends Units_Token

  // Units_ShiftedToken.constructor (constructor)
  constructor(aword: string, amean: string, avalue: number, amove: number, adimensions: Units_Dimensions);

  // Units_ShiftedToken.Creates (method)
  Creates(): Units_Token;

  // Units_ShiftedToken.Move (method)
  Move(): number;

  // Units_ShiftedToken.Multiplied (method)
  Multiplied(avalue: number): number;

  // Units_ShiftedToken.Divided (method)
  Divided(avalue: number): number;

  // Units_ShiftedToken.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // Units_ShiftedToken.get_type_name (method)
  static get_type_name(): string;

  // Units_ShiftedToken.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_ShiftedToken.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_ShiftedToken.delete (method)
  delete(): void;

  // Units_ShiftedToken.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_ShiftedUnit: declare class Units_ShiftedUnit extends Units_Unit

  // Units_ShiftedUnit.constructor (constructor)
  constructor(aname: string);
  constructor(aname: string, asymbol: string);
  constructor(aname: string, asymbol: string, avalue: number, amove: number, aquantity: Units_Quantity);

  // Units_ShiftedUnit.Move (method)
  Move(amove: number): void;
  Move(): number;

  // Units_ShiftedUnit.Token (method)
  Token(): Units_Token;

  // Units_ShiftedUnit.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // Units_ShiftedUnit.get_type_name (method)
  static get_type_name(): string;

  // Units_ShiftedUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_ShiftedUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_ShiftedUnit.delete (method)
  delete(): void;

  // Units_ShiftedUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_Token: declare class Units_Token extends Standard_Transient

  // Units_Token.constructor (constructor)
  constructor();
  constructor(aword: string);
  constructor(atoken: Units_Token);
  constructor(aword: string, amean: string);
  constructor(aword: string, amean: string, avalue: number);
  constructor(aword: string, amean: string, avalue: number, adimension: Units_Dimensions);

  // Units_Token.Creates (method)
  Creates(): Units_Token;

  // Units_Token.Length (method)
  Length(): number;

  // Units_Token.Word (method)
  Word(): TCollection_AsciiString;
  Word(aword: string): void;

  // Units_Token.Mean (method)
  Mean(): TCollection_AsciiString;
  Mean(amean: string): void;

  // Units_Token.Value (method)
  Value(): number;
  Value(avalue: number): void;

  // Units_Token.Dimensions (method)
  Dimensions(): Units_Dimensions;
  Dimensions(adimensions: Units_Dimensions): void;

  // Units_Token.Update (method)
  Update(amean: string): void;

  // Units_Token.Add (method)
  Add(aninteger: number): Units_Token;
  Add(atoken: Units_Token): Units_Token;

  // Units_Token.Subtract (method)
  Subtract(atoken: Units_Token): Units_Token;

  // Units_Token.Multiply (method)
  Multiply(atoken: Units_Token): Units_Token;

  // Units_Token.Multiplied (method)
  Multiplied(avalue: number): number;

  // Units_Token.Divide (method)
  Divide(atoken: Units_Token): Units_Token;

  // Units_Token.Divided (method)
  Divided(avalue: number): number;

  // Units_Token.Power (method)
  Power(atoken: Units_Token): Units_Token;
  Power(anexponent: number): Units_Token;

  // Units_Token.IsEqual (method)
  IsEqual(astring: string): boolean;
  IsEqual(atoken: Units_Token): boolean;

  // Units_Token.IsNotEqual (method)
  IsNotEqual(astring: string): boolean;
  IsNotEqual(atoken: Units_Token): boolean;

  // Units_Token.IsLessOrEqual (method)
  IsLessOrEqual(astring: string): boolean;

  // Units_Token.IsGreater (method)
  IsGreater(astring: string): boolean;
  IsGreater(atoken: Units_Token): boolean;

  // Units_Token.IsGreaterOrEqual (method)
  IsGreaterOrEqual(atoken: Units_Token): boolean;

  // Units_Token.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // Units_Token.get_type_name (method)
  static get_type_name(): string;

  // Units_Token.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_Token.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_Token.delete (method)
  delete(): void;

  // Units_Token.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_Unit: declare class Units_Unit extends Standard_Transient

  // Units_Unit.constructor (constructor)
  constructor(aname: string);
  constructor(aname: string, asymbol: string);
  constructor(aname: string, asymbol: string, avalue: number, aquantity: Units_Quantity);

  // Units_Unit.Name (method)
  Name(): TCollection_AsciiString;

  // Units_Unit.Symbol (method)
  Symbol(asymbol: string): void;

  // Units_Unit.Value (method)
  Value(): number;
  Value(avalue: number): void;

  // Units_Unit.Quantity (method)
  Quantity(): Units_Quantity;
  Quantity(aquantity: Units_Quantity): void;

  // Units_Unit.SymbolsSequence (method)
  SymbolsSequence(): NCollection_HSequence_handle_TCollection_HAsciiString;

  // Units_Unit.Token (method)
  Token(): Units_Token;

  // Units_Unit.IsEqual (method)
  IsEqual(astring: string): boolean;

  // Units_Unit.Dump (method)
  Dump(ashift: number, alevel: number): void;

  // Units_Unit.get_type_name (method)
  static get_type_name(): string;

  // Units_Unit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_Unit.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_Unit.delete (method)
  delete(): void;

  // Units_Unit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_UnitSentence: declare class Units_UnitSentence extends Units_Sentence

  // Units_UnitSentence.constructor (constructor)
  constructor(astring: string);
  constructor(astring: string, aquantitiessequence: NCollection_HSequence_handle_Units_Quantity);

  // Units_UnitSentence.Analyse (method)
  Analyse(): void;

  // Units_UnitSentence.SetUnits (method)
  SetUnits(aquantitiessequence: NCollection_HSequence_handle_Units_Quantity): void;

  // Units_UnitSentence.delete (method)
  delete(): void;

  // Units_UnitSentence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_UnitsDictionary: declare class Units_UnitsDictionary extends Standard_Transient

  // Units_UnitsDictionary.constructor (constructor)
  constructor();

  // Units_UnitsDictionary.Creates (method)
  Creates(): void;

  // Units_UnitsDictionary.Sequence (method)
  Sequence(): NCollection_HSequence_handle_Units_Quantity;

  // Units_UnitsDictionary.ActiveUnit (method)
  ActiveUnit(aquantity: string): TCollection_AsciiString;

  // Units_UnitsDictionary.Dump (method)
  Dump(alevel: number): void;
  Dump(adimensions: Units_Dimensions): void;

  // Units_UnitsDictionary.get_type_name (method)
  static get_type_name(): string;

  // Units_UnitsDictionary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_UnitsDictionary.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_UnitsDictionary.delete (method)
  delete(): void;

  // Units_UnitsDictionary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_UnitsLexicon: declare class Units_UnitsLexicon extends Units_Lexicon

  // Units_UnitsLexicon.constructor (constructor)
  constructor();

  // Units_UnitsLexicon.Creates (method)
  Creates(amode?: boolean): void;
  Creates(): void;

  // Units_UnitsLexicon.Dump (method)
  Dump(): void;

  // Units_UnitsLexicon.get_type_name (method)
  static get_type_name(): string;

  // Units_UnitsLexicon.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_UnitsLexicon.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_UnitsLexicon.delete (method)
  delete(): void;

  // Units_UnitsLexicon.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_UnitsSystem: declare class Units_UnitsSystem extends Standard_Transient

  // Units_UnitsSystem.constructor (constructor)
  constructor();
  constructor(aName: string, Verbose?: boolean);

  // Units_UnitsSystem.QuantitiesSequence (method)
  QuantitiesSequence(): NCollection_HSequence_handle_Units_Quantity;

  // Units_UnitsSystem.ActiveUnitsSequence (method)
  ActiveUnitsSequence(): NCollection_HSequence_int;

  // Units_UnitsSystem.Specify (method)
  Specify(aquantity: string, aunit: string): void;

  // Units_UnitsSystem.Remove (method)
  Remove(aquantity: string, aunit: string): void;

  // Units_UnitsSystem.Activate (method)
  Activate(aquantity: string, aunit: string): void;

  // Units_UnitsSystem.Activates (method)
  Activates(): void;

  // Units_UnitsSystem.ActiveUnit (method)
  ActiveUnit(aquantity: string): TCollection_AsciiString;

  // Units_UnitsSystem.ConvertValueToUserSystem (method)
  ConvertValueToUserSystem(aquantity: string, avalue: number, aunit: string): number;

  // Units_UnitsSystem.ConvertSIValueToUserSystem (method)
  ConvertSIValueToUserSystem(aquantity: string, avalue: number): number;

  // Units_UnitsSystem.ConvertUserSystemValueToSI (method)
  ConvertUserSystemValueToSI(aquantity: string, avalue: number): number;

  // Units_UnitsSystem.Dump (method)
  Dump(): void;

  // Units_UnitsSystem.IsEmpty (method)
  IsEmpty(): boolean;

  // Units_UnitsSystem.get_type_name (method)
  static get_type_name(): string;

  // Units_UnitsSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Units_UnitsSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // Units_UnitsSystem.delete (method)
  delete(): void;

  // Units_UnitsSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Units_QtsSequence: NCollection_Sequence_handle_Units_Quantity

Units_QuantitiesSequence: NCollection_HSequence_handle_Units_Quantity

Units_TksSequence: NCollection_Sequence_handle_Units_Token

Units_TokensSequence: NCollection_HSequence_handle_Units_Token

Units_UnitsSequence: NCollection_HSequence_handle_Units_Unit

Units_UtsSequence: NCollection_Sequence_handle_Units_Unit
