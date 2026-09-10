# libcascade — Units

24 top-level symbols. Signatures are verbatim typescript.

// This package provides all the facilities to create and question a dictionary of units, and also to manipulate measurements which are real values with units
Units: declare class Units

constructor

// Defines the location of the file containing all the information useful in creating the dictionary of all the units known to the system
static UnitsFile(afile: string): void;

// Defines the location of the file containing the lexicon useful in manipulating composite units
static LexiconFile(afile: string): void;

// Returns a unique instance of the dictionary of units
static DictionaryOfUnits(amode?: boolean): Units_UnitsDictionary;

// Returns a unique quantity instance corresponding to <aquantity>
static Quantity(aquantity: string): Units_Quantity;

// Returns the first quantity string founded from the unit <aUnit>
static FirstQuantity(aunit: string): string;

// Returns a unique instance of the {@link Units_Lexicon`Units_Lexicon`}
static LexiconUnits(amode?: boolean): Units_Lexicon;

// Return a unique instance of LexiconFormula
static LexiconFormula(): Units_Lexicon;

// Returns always the same instance of Dimensions
static NullDimensions(): Units_Dimensions;

// Converts <avalue> expressed in <afirstunit> into the <asecondunit>
static Convert(avalue: number, afirstunit: string, asecondunit: string): number;

static ToSI(aData: number, aUnit: string): number;

static ToSI_1(aData: number, aUnit: string): number;

static ToSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

static FromSI(aData: number, aUnit: string): number;

static FromSI_1(aData: number, aUnit: string): number;

static FromSI_2(aData: number, aUnit: string): { returnValue: number; aDim: Units_Dimensions; [Symbol.dispose](): void };

// return the dimension associated to the Type
static Dimensions(aType: string): Units_Dimensions;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class includes all the methods to create and manipulate the dimensions of the physical quantities
Units_Dimensions: declare class Units_Dimensions extends Standard_Transient

constructor

// Returns the power of mass stored in the dimensions
Mass(): number;

// Returns the power of length stored in the dimensions
Length(): number;

// Returns the power of time stored in the dimensions
Time(): number;

// Returns the power of electrical intensity (current) stored in the dimensions
ElectricCurrent(): number;

// Returns the power of temperature stored in the dimensions
ThermodynamicTemperature(): number;

// Returns the power of quantity of material (mole) stored in the dimensions
AmountOfSubstance(): number;

// Returns the power of light intensity stored in the dimensions
LuminousIntensity(): number;

// Returns the power of plane angle stored in the dimensions
PlaneAngle(): number;

// Returns the power of solid angle stored in the dimensions
SolidAngle(): number;

// Returns the quantity string of the dimension
Quantity(): string;

// Creates and returns a new Dimensions object which is the result of the multiplication of <me> and <adimensions>
Multiply(adimensions: Units_Dimensions): Units_Dimensions;

// Creates and returns a new Dimensions object which is the result of the division of <me> by <adimensions>
Divide(adimensions: Units_Dimensions): Units_Dimensions;

// Creates and returns a new Dimensions object which is the result of the power of <me> and <anexponent>
Power(anexponent: number): Units_Dimensions;

// Returns true if <me> and <adimensions> have the same dimensions, false otherwise
IsEqual(adimensions: Units_Dimensions): boolean;

// Returns false if <me> and <adimensions> have the same dimensions, true otherwise
IsNotEqual(adimensions: Units_Dimensions): boolean;

// Useful for degugging
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

// Returns the basic dimensions
static ASolidAngle(): Units_Dimensions;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides all the services to explore UnitsSystem or UnitsDictionary
Units_Explorer: declare class Units_Explorer

constructor

// Initializes the instance of the class with the UnitsSystem <aunitssystem>
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

// Returns True if there is another Quantity to explore, False otherwise
MoreQuantity(): boolean;

// Sets the next Quantity current
NextQuantity(): void;

// Returns the name of the current Quantity
Quantity(): TCollection_AsciiString;

// Returns True if there is another Unit to explore, False otherwise
MoreUnit(): boolean;

// Sets the next Unit current
NextUnit(): void;

// Returns the name of the current unit
Unit(): TCollection_AsciiString;

// If the units system to explore is a user system, returns True if the current unit is active, False otherwise
IsActive(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines a lexicon useful to analyse and recognize the different key words included in a sentence
Units_Lexicon: declare class Units_Lexicon extends Standard_Transient

constructor

// Reads the file <afilename> to create a sequence of tokens stored in <thesequenceoftokens>
Creates(): void;

// Returns the first item of the sequence of tokens
Sequence(): NCollection_HSequence_handle_Units_Token;

// Adds to the lexicon a new token with <aword>, <amean>, <avalue> as arguments
AddToken(aword: string, amean: string, avalue: number): void;

// Useful for debugging
Dump(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines all the methods to create and compute an algebraic formula
Units_MathSentence: declare class Units_MathSentence extends Units_Sentence

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines a measurement which is the association of a real value and a unit
Units_Measurement: declare class Units_Measurement

constructor

// Converts (if possible) the measurement object into another unit
Convert(aunit: string): void;

// Returns a Measurement object with the integer value of the measurement contained in <me>
Integer(): Units_Measurement;

// Returns a Measurement object with the fractional value of the measurement contained in <me>
Fractional(): Units_Measurement;

// Returns the value of the measurement
Measurement(): number;

// Returns the token contained in <me>
Token(): Units_Token;

// Returns (if it is possible) a measurement which is the addition of <me> and <ameasurement>
Add(ameasurement: Units_Measurement): Units_Measurement;

// Returns (if it is possible) a measurement which is the subtraction of <me> and <ameasurement>
Subtract(ameasurement: Units_Measurement): Units_Measurement;

// Returns a measurement which is the multiplication of <me> and <ameasurement>
Multiply(ameasurement: Units_Measurement): Units_Measurement;
Multiply(avalue: number): Units_Measurement;
Multiply(ameasurement: Units_Measurement): Units_Measurement;
Multiply(avalue: number): Units_Measurement;

// Returns a measurement which is the division of <me> by <ameasurement>
Divide(ameasurement: Units_Measurement): Units_Measurement;
Divide(avalue: number): Units_Measurement;
Divide(ameasurement: Units_Measurement): Units_Measurement;
Divide(avalue: number): Units_Measurement;

// Returns a measurement which is <me> powered <anexponent>
Power(anexponent: number): Units_Measurement;

HasToken(): boolean;

// Useful for debugging
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Units_NoSuchType: declare class Units_NoSuchType extends Standard_NoSuchObject

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Units_NoSuchUnit: declare class Units_NoSuchUnit extends Standard_NoSuchObject

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class stores in its field all the possible units of all the unit systems for a given physical quantity
Units_Quantity: declare class Units_Quantity extends Standard_Transient

constructor

// Returns in a AsciiString from {@link TCollection `TCollection`} the name of the quantity
Name(): TCollection_AsciiString;

// Returns the physical dimensions of the quantity
Dimensions(): Units_Dimensions;

// Returns <theunitssequence>, which is the sequence of all the units stored for this physical quantity
Sequence(): NCollection_HSequence_handle_Units_Unit;

// Returns True if the name of the Quantity <me> is equal to <astring>, False otherwise
IsEqual(astring: string): boolean;

// Useful for debugging
Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes all the methods to create and compute an expression contained in a string
Units_Sentence: declare class Units_Sentence

constructor

// For each constant encountered, sets the value
SetConstants(): void;

// Returns <thesequenceoftokens>
Sequence(): NCollection_HSequence_handle_Units_Token;
Sequence(asequenceoftokens: NCollection_HSequence_handle_Units_Token): void;
Sequence(): NCollection_HSequence_handle_Units_Token;
Sequence(asequenceoftokens: NCollection_HSequence_handle_Units_Token): void;

// Computes and returns in a token the result of the expression
Evaluate(): Units_Token;

// Return True if number of created tokens > 0 (i.e creation of sentence is successful)
IsDone(): boolean;

// Useful for debugging
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The ShiftedToken class inherits from Token and describes tokens which have a gap in addition of the multiplicative factor
Units_ShiftedToken: declare class Units_ShiftedToken extends Units_Token

constructor

// Creates and returns a token, which is a ShiftedToken
Creates(): Units_Token;

// Returns the gap <themove>
Move(): number;

// This virtual method is called by the Measurement methods, to compute the measurement during a conversion
Multiplied(avalue: number): number;

// This virtual method is called by the Measurement methods, to compute the measurement during a conversion
Divided(avalue: number): number;

// Useful for debugging
Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is useful to describe units with a shifted origin in relation to another unit
Units_ShiftedUnit: declare class Units_ShiftedUnit extends Units_Unit

constructor

// Sets the field <themove> to <amove> Returns the shifted value <themove>
Move(amove: number): void;
Move(): number;
Move(amove: number): void;
Move(): number;

// This redefined method returns a ShiftedToken object
Token(): Units_Token;

// Useful for debugging
Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines an elementary word contained in a Sentence object
Units_Token: declare class Units_Token extends Standard_Transient

constructor

// Creates and returns a token, which is a ShiftedToken
Creates(): Units_Token;

// Returns the length of the word
Length(): number;

// Returns the string <theword> Sets the field <theword> to <aword>
Word(): TCollection_AsciiString;
Word(aword: string): void;
Word(): TCollection_AsciiString;
Word(aword: string): void;

// Returns the significance of the word <theword>, which is in the field <themean>
Mean(): TCollection_AsciiString;
Mean(amean: string): void;
Mean(): TCollection_AsciiString;
Mean(amean: string): void;

// Returns the value stored in the field <thevalue>
Value(): number;
Value(avalue: number): void;
Value(): number;
Value(avalue: number): void;

// Returns the dimensions of the token <thedimensions>
Dimensions(): Units_Dimensions;
Dimensions(adimensions: Units_Dimensions): void;
Dimensions(): Units_Dimensions;
Dimensions(adimensions: Units_Dimensions): void;

// Updates the token <me> with the additional signification <amean> by concatenation of the two strings <themean> and <amean>
Update(amean: string): void;

// Returns a token which is the addition of <me> and another token <atoken>
Add(aninteger: number): Units_Token;
Add(atoken: Units_Token): Units_Token;
Add(aninteger: number): Units_Token;
Add(atoken: Units_Token): Units_Token;

// Returns a token which is the subtraction of <me> and another token <atoken>
Subtract(atoken: Units_Token): Units_Token;

// Returns a token which is the product of <me> and another token <atoken>
Multiply(atoken: Units_Token): Units_Token;

// This virtual method is called by the Measurement methods, to compute the measurement during a conversion
Multiplied(avalue: number): number;

// Returns a token which is the division of <me> by another token <atoken>
Divide(atoken: Units_Token): Units_Token;

// This virtual method is called by the Measurement methods, to compute the measurement during a conversion
Divided(avalue: number): number;

// Returns a token which is <me> to the power of another token <atoken>
Power(atoken: Units_Token): Units_Token;
Power(anexponent: number): Units_Token;
Power(atoken: Units_Token): Units_Token;
Power(anexponent: number): Units_Token;

// Returns true if the field <theword> and the string <astring> are the same, false otherwise
IsEqual(astring: string): boolean;
IsEqual(atoken: Units_Token): boolean;
IsEqual(astring: string): boolean;
IsEqual(atoken: Units_Token): boolean;

// Returns false if the field <theword> and the string <astring> are the same, true otherwise
IsNotEqual(astring: string): boolean;
IsNotEqual(atoken: Units_Token): boolean;
IsNotEqual(astring: string): boolean;
IsNotEqual(atoken: Units_Token): boolean;

// Returns true if the field <theword> is strictly contained at the beginning of the string <astring>, false otherwise
IsLessOrEqual(astring: string): boolean;

// Returns false if the field <theword> is strictly contained at the beginning of the string <astring>, true otherwise
IsGreater(astring: string): boolean;
IsGreater(atoken: Units_Token): boolean;
IsGreater(astring: string): boolean;
IsGreater(atoken: Units_Token): boolean;

// Returns true if the string <astring> is strictly contained at the beginning of the field <theword> false otherwise
IsGreaterOrEqual(atoken: Units_Token): boolean;

// Useful for debugging
Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines an elementary word contained in a physical quantity
Units_Unit: declare class Units_Unit extends Standard_Transient

constructor

// Returns the name of the unit <thename>
Name(): TCollection_AsciiString;

// Adds a new symbol <asymbol> attached to <me>
Symbol(asymbol: string): void;

// Returns the value in relation with the International System of {@link Units`Units`}
Value(): number;
Value(avalue: number): void;
Value(): number;
Value(avalue: number): void;

// Returns <thequantity> contained in <me>
Quantity(): Units_Quantity;
Quantity(aquantity: Units_Quantity): void;
Quantity(): Units_Quantity;
Quantity(aquantity: Units_Quantity): void;

// Returns the sequence of symbols <thesymbolssequence>
SymbolsSequence(): NCollection_HSequence_handle_TCollection_HAsciiString;

// Starting with <me>, returns a new Token object
Token(): Units_Token;

// Compares all the symbols linked within <me> with the name of <atoken>, and returns True if there is one symbol equal to the name, False otherwise
IsEqual(astring: string): boolean;

// Useful for debugging
Dump(ashift: number, alevel: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes all the facilities to manipulate and compute units contained in a string expression
Units_UnitSentence: declare class Units_UnitSentence extends Units_Sentence

constructor

// Analyzes the sequence of tokens created by the constructor to find the true significance of each token
Analyse(): void;

// For each token which represents a unit, finds in the sequence of physical quantities all the characteristics of the unit found
SetUnits(aquantitiessequence: NCollection_HSequence_handle_Units_Quantity): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class creates a dictionary of all the units you want to know
Units_UnitsDictionary: declare class Units_UnitsDictionary extends Standard_Transient

constructor

// Returns a UnitsDictionary object which contains the sequence of all the units you want to consider, physical quantity by physical quantity
Creates(): void;

// Returns the head of the sequence of physical quantities
Sequence(): NCollection_HSequence_handle_Units_Quantity;

// Returns for <aquantity> the active unit
ActiveUnit(aquantity: string): TCollection_AsciiString;

// Dumps only the sequence of quantities without the units if <alevel> is equal to zero, and for each quantity all the units stored if <alevel> is equal to one
Dump(alevel: number): void;
Dump(adimensions: Units_Dimensions): void;
Dump(alevel: number): void;
Dump(adimensions: Units_Dimensions): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines a lexicon useful to analyse and recognize the different key words included in a sentence
Units_UnitsLexicon: declare class Units_UnitsLexicon extends Units_Lexicon

constructor

// Reads the files <afilename1> and <afilename2> to create a sequence of tokens stored in <thesequenceoftokens>
Creates(amode?: boolean): void;
Creates(): void;
Creates(amode?: boolean): void;
Creates(): void;

// Useful for debugging
Dump(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows the user to define his own system of units
Units_UnitsSystem: declare class Units_UnitsSystem extends Standard_Transient

constructor

// Returns the sequence of refined quantities
QuantitiesSequence(): NCollection_HSequence_handle_Units_Quantity;

// Returns a sequence of integer in correspondence with the sequence of quantities, which indicates, for each redefined quantity, the index into the sequence of units, of the active unit
ActiveUnitsSequence(): NCollection_HSequence_int;

// Specifies for <aquantity> the unit <aunit> used
Specify(aquantity: string, aunit: string): void;

// Removes for <aquantity> the unit <aunit> used
Remove(aquantity: string, aunit: string): void;

// Specifies for <aquantity> the unit <aunit> used
Activate(aquantity: string, aunit: string): void;

// Activates the first unit of all defined system quantities
Activates(): void;

// Returns for <aquantity> the active unit
ActiveUnit(aquantity: string): TCollection_AsciiString;

// Converts a real value <avalue> from the unit <aunit> belonging to the physical dimensions <aquantity> to the corresponding unit of the user system
ConvertValueToUserSystem(aquantity: string, avalue: number, aunit: string): number;

// Converts the real value <avalue> from the S.I
ConvertSIValueToUserSystem(aquantity: string, avalue: number): number;

// Converts the real value <avalue> from the user system of units to the S.I
ConvertUserSystemValueToSI(aquantity: string, avalue: number): number;

Dump(): void;

// Returns TRUE if no units has been defined in the system
IsEmpty(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Units_QtsSequence: NCollection_Sequence_handle_Units_Quantity

Units_QuantitiesSequence: NCollection_HSequence_handle_Units_Quantity

Units_TksSequence: NCollection_Sequence_handle_Units_Token

Units_TokensSequence: NCollection_HSequence_handle_Units_Token

Units_UnitsSequence: NCollection_HSequence_handle_Units_Unit

Units_UtsSequence: NCollection_Sequence_handle_Units_Unit
