# libcascade — Units

24 top-level symbols. Signatures are verbatim typescript.

Units: declare class Units

constructor

static UnitsFile(afile: string): void;

static LexiconFile(afile: string): void;

static DictionaryOfUnits(amode?: boolean): Units_UnitsDictionary;

static Quantity(aquantity: string): Units_Quantity;

static FirstQuantity(aunit: string): string;

static LexiconUnits(amode?: boolean): Units_Lexicon;

static LexiconFormula(): Units_Lexicon;

static NullDimensions(): Units_Dimensions;

static Convert(avalue: number, afirstunit: string, asecondunit: string): number;

static ToSI(aData: number, aUnit: string): number;

static ToSI_1(aData: number, aUnit: string): number;

static ToSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

static FromSI(aData: number, aUnit: string): number;

static FromSI_1(aData: number, aUnit: string): number;

static FromSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

static Dimensions(aType: string): Units_Dimensions;

delete(): void;

[Symbol.dispose](): void;

Units_Dimensions: declare class Units_Dimensions extends Standard_Transient

constructor

Mass(): number;

Length(): number;

Time(): number;

ElectricCurrent(): number;

ThermodynamicTemperature(): number;

AmountOfSubstance(): number;

LuminousIntensity(): number;

PlaneAngle(): number;

SolidAngle(): number;

Quantity(): string;

Multiply(adimensions: Units_Dimensions): Units_Dimensions;

Divide(adimensions: Units_Dimensions): Units_Dimensions;

Power(anexponent: number): Units_Dimensions;

IsEqual(adimensions: Units_Dimensions): boolean;

IsNotEqual(adimensions: Units_Dimensions): boolean;

Dump(ashift: number): void;

static ALess(): Units_Dimensions;

static AMass(): Units_Dimensions;

static ALength(): Units_Dimensions;

static ATime(): Units_Dimensions;

static AElectricCurrent(): Units_Dimensions;

static AThermodynamicTemperature(): Units_Dimensions;

static AAmountOfSubstance(): Units_Dimensions;

static ALuminousIntensity(): Units_Dimensions;

static APlaneAngle(): Units_Dimensions;

static ASolidAngle(): Units_Dimensions;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_Explorer: declare class Units_Explorer

constructor

Init(aunitssystem: Units_UnitsSystem): void;
Init(aunitsdictionary: Units_UnitsDictionary): void;
Init(aunitssystem: Units_UnitsSystem, aquantity: string): void;
Init(aunitsdictionary: Units_UnitsDictionary, aquantity: string): void;
Init(aunitssystem: Units_UnitsSystem): void;
Init(aunitsdictionary: Units_UnitsDictionary): void;
Init(aunitssystem: Units_UnitsSystem, aquantity: string): void;
Init(aunitsdictionary: Units_UnitsDictionary, aquantity: string): void;
Init(aunitssystem: Units_UnitsSystem): void;
Init(aunitsdictionary: Units_UnitsDictionary): void;
Init(aunitssystem: Units_UnitsSystem, aquantity: string): void;
Init(aunitsdictionary: Units_UnitsDictionary, aquantity: string): void;
Init(aunitssystem: Units_UnitsSystem): void;
Init(aunitsdictionary: Units_UnitsDictionary): void;
Init(aunitssystem: Units_UnitsSystem, aquantity: string): void;
Init(aunitsdictionary: Units_UnitsDictionary, aquantity: string): void;

MoreQuantity(): boolean;

NextQuantity(): void;

Quantity(): TCollection_AsciiString;

MoreUnit(): boolean;

NextUnit(): void;

Unit(): TCollection_AsciiString;

IsActive(): boolean;

delete(): void;

[Symbol.dispose](): void;

Units_Lexicon: declare class Units_Lexicon extends Standard_Transient

constructor

Creates(): void;

Sequence(): NCollection_HSequence_handle_Units_Token;

AddToken(aword: string, amean: string, avalue: number): void;

Dump(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_MathSentence: declare class Units_MathSentence extends Units_Sentence

constructor

delete(): void;

[Symbol.dispose](): void;

Units_Measurement: declare class Units_Measurement

constructor

Convert(aunit: string): void;

Integer(): Units_Measurement;

Fractional(): Units_Measurement;

Measurement(): number;

Token(): Units_Token;

Add(ameasurement: Units_Measurement): Units_Measurement;

Subtract(ameasurement: Units_Measurement): Units_Measurement;

Multiply(ameasurement: Units_Measurement): Units_Measurement;
Multiply(avalue: number): Units_Measurement;
Multiply(ameasurement: Units_Measurement): Units_Measurement;
Multiply(avalue: number): Units_Measurement;

Divide(ameasurement: Units_Measurement): Units_Measurement;
Divide(avalue: number): Units_Measurement;
Divide(ameasurement: Units_Measurement): Units_Measurement;
Divide(avalue: number): Units_Measurement;

Power(anexponent: number): Units_Measurement;

HasToken(): boolean;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

Units_NoSuchType: declare class Units_NoSuchType extends Standard_NoSuchObject

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Units_NoSuchUnit: declare class Units_NoSuchUnit extends Standard_NoSuchObject

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Units_Quantity: declare class Units_Quantity extends Standard_Transient

constructor

Name(): TCollection_AsciiString;

Dimensions(): Units_Dimensions;

Sequence(): NCollection_HSequence_handle_Units_Unit;

IsEqual(astring: string): boolean;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_Sentence: declare class Units_Sentence

constructor

SetConstants(): void;

Sequence(): NCollection_HSequence_handle_Units_Token;
Sequence(asequenceoftokens: NCollection_HSequence_handle_Units_Token): void;
Sequence(): NCollection_HSequence_handle_Units_Token;
Sequence(asequenceoftokens: NCollection_HSequence_handle_Units_Token): void;

Evaluate(): Units_Token;

IsDone(): boolean;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

Units_ShiftedToken: declare class Units_ShiftedToken extends Units_Token

constructor

Creates(): Units_Token;

Move(): number;

Multiplied(avalue: number): number;

Divided(avalue: number): number;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_ShiftedUnit: declare class Units_ShiftedUnit extends Units_Unit

constructor

Move(amove: number): void;
Move(): number;
Move(amove: number): void;
Move(): number;

Token(): Units_Token;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_Token: declare class Units_Token extends Standard_Transient

constructor

Creates(): Units_Token;

Length(): number;

Word(): TCollection_AsciiString;
Word(aword: string): void;
Word(): TCollection_AsciiString;
Word(aword: string): void;

Mean(): TCollection_AsciiString;
Mean(amean: string): void;
Mean(): TCollection_AsciiString;
Mean(amean: string): void;

Value(): number;
Value(avalue: number): void;
Value(): number;
Value(avalue: number): void;

Dimensions(): Units_Dimensions;
Dimensions(adimensions: Units_Dimensions): void;
Dimensions(): Units_Dimensions;
Dimensions(adimensions: Units_Dimensions): void;

Update(amean: string): void;

Add(aninteger: number): Units_Token;
Add(atoken: Units_Token): Units_Token;
Add(aninteger: number): Units_Token;
Add(atoken: Units_Token): Units_Token;

Subtract(atoken: Units_Token): Units_Token;

Multiply(atoken: Units_Token): Units_Token;

Multiplied(avalue: number): number;

Divide(atoken: Units_Token): Units_Token;

Divided(avalue: number): number;

Power(atoken: Units_Token): Units_Token;
Power(anexponent: number): Units_Token;
Power(atoken: Units_Token): Units_Token;
Power(anexponent: number): Units_Token;

IsEqual(astring: string): boolean;
IsEqual(atoken: Units_Token): boolean;
IsEqual(astring: string): boolean;
IsEqual(atoken: Units_Token): boolean;

IsNotEqual(astring: string): boolean;
IsNotEqual(atoken: Units_Token): boolean;
IsNotEqual(astring: string): boolean;
IsNotEqual(atoken: Units_Token): boolean;

IsLessOrEqual(astring: string): boolean;

IsGreater(astring: string): boolean;
IsGreater(atoken: Units_Token): boolean;
IsGreater(astring: string): boolean;
IsGreater(atoken: Units_Token): boolean;

IsGreaterOrEqual(atoken: Units_Token): boolean;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_Unit: declare class Units_Unit extends Standard_Transient

constructor

Name(): TCollection_AsciiString;

Symbol(asymbol: string): void;

Value(): number;
Value(avalue: number): void;
Value(): number;
Value(avalue: number): void;

Quantity(): Units_Quantity;
Quantity(aquantity: Units_Quantity): void;
Quantity(): Units_Quantity;
Quantity(aquantity: Units_Quantity): void;

SymbolsSequence(): NCollection_HSequence_handle_TCollection_HAsciiString;

Token(): Units_Token;

IsEqual(astring: string): boolean;

Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_UnitSentence: declare class Units_UnitSentence extends Units_Sentence

constructor

Analyse(): void;

SetUnits(aquantitiessequence: NCollection_HSequence_handle_Units_Quantity): void;

delete(): void;

[Symbol.dispose](): void;

Units_UnitsDictionary: declare class Units_UnitsDictionary extends Standard_Transient

constructor

Creates(): void;

Sequence(): NCollection_HSequence_handle_Units_Quantity;

ActiveUnit(aquantity: string): TCollection_AsciiString;

Dump(alevel: number): void;
Dump(adimensions: Units_Dimensions): void;
Dump(alevel: number): void;
Dump(adimensions: Units_Dimensions): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_UnitsLexicon: declare class Units_UnitsLexicon extends Units_Lexicon

constructor

Creates(amode?: boolean): void;
Creates(): void;
Creates(amode?: boolean): void;
Creates(): void;

Dump(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_UnitsSystem: declare class Units_UnitsSystem extends Standard_Transient

constructor

QuantitiesSequence(): NCollection_HSequence_handle_Units_Quantity;

ActiveUnitsSequence(): NCollection_HSequence_int;

Specify(aquantity: string, aunit: string): void;

Remove(aquantity: string, aunit: string): void;

Activate(aquantity: string, aunit: string): void;

Activates(): void;

ActiveUnit(aquantity: string): TCollection_AsciiString;

ConvertValueToUserSystem(aquantity: string, avalue: number, aunit: string): number;

ConvertSIValueToUserSystem(aquantity: string, avalue: number): number;

ConvertUserSystemValueToSI(aquantity: string, avalue: number): number;

Dump(): void;

IsEmpty(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Units_QtsSequence: NCollection_Sequence_handle_Units_Quantity

Units_QuantitiesSequence: NCollection_HSequence_handle_Units_Quantity

Units_TksSequence: NCollection_Sequence_handle_Units_Token

Units_TokensSequence: NCollection_HSequence_handle_Units_Token

Units_UnitsSequence: NCollection_HSequence_handle_Units_Unit

Units_UtsSequence: NCollection_Sequence_handle_Units_Unit
