# libcascade — IGESDimen

17 top-level symbols. Signatures are verbatim typescript.

// This package represents Entities applied to Dimensions ie
IGESDimen: declare class IGESDimen

constructor

// Prepares dynamic data (Protocol, Modules) for this package
static Init(): void;

// Returns the Protocol for this Package
static Protocol(): IGESDimen_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines AngularDimension, Type <202> Form <0> in package {@link IGESDimen`IGESDimen`} Used to dimension angles
IGESDimen_AngularDimension: declare class IGESDimen_AngularDimension extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class AngularDimension
Init(aNote: IGESDimen_GeneralNote, aLine: IGESDimen_WitnessLine, anotherLine: IGESDimen_WitnessLine, aVertex: gp_XY, aRadius: number, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow): void;

// returns the General Note Entity of the Dimension
Note(): IGESDimen_GeneralNote;

// returns False if theFirstWitnessLine is Null Handle
HasFirstWitnessLine(): boolean;

// returns the First Witness Line Entity or Null Handle
FirstWitnessLine(): IGESDimen_WitnessLine;

// returns False if theSecondWitnessLine is Null Handle
HasSecondWitnessLine(): boolean;

// returns the Second Witness Line Entity or Null Handle
SecondWitnessLine(): IGESDimen_WitnessLine;

// returns the coordinates of the Vertex point as Pnt2d from gp
Vertex(): gp_Pnt2d;

// returns the coordinates of the Vertex point as Pnt2d from gp after Transformation
TransformedVertex(): gp_Pnt2d;

// returns the Radius of the Leader arcs
Radius(): number;

// returns the First Leader Entity
FirstLeader(): IGESDimen_LeaderArrow;

// returns the Second Leader Entity
SecondLeader(): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGES Basic Dimension, Type 406, Form 31, in package {@link IGESDimen`IGESDimen`} The basic Dimension Property indicates that the referencing dimension entity is to be displayed with a box around text
IGESDimen_BasicDimension: declare class IGESDimen_BasicDimension extends IGESData_IGESEntity

constructor

Init(nbPropVal: number, lowerLeft: gp_XY, lowerRight: gp_XY, upperRight: gp_XY, upperLeft: gp_XY): void;

// returns the number of properties = 8
NbPropertyValues(): number;

// returns coordinates of lower left corner
LowerLeft(): gp_Pnt2d;

// returns coordinates of lower right corner
LowerRight(): gp_Pnt2d;

// returns coordinates of upper right corner
UpperRight(): gp_Pnt2d;

// returns coordinates of upper left corner
UpperLeft(): gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines CenterLine, Type <106> Form <20-21> in package {@link IGESDimen`IGESDimen`} Is an entity appearing as crosshairs or as a construction between 2 positions
IGESDimen_CenterLine: declare class IGESDimen_CenterLine extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class CenterLine
Init(aDataType: number, aZdisp: number, dataPnts: NCollection_HArray1_gp_XY): void;

// Sets FormNumber to 20 if <mode> is True, 21 else
SetCrossHair(mode: boolean): void;

// returns Interpretation Flag
Datatype(): number;

// returns Number of Data Points
NbPoints(): number;

// returns Common Z displacement
ZDisplacement(): number;

// returns the data point as Pnt from gp
Point(Index: number): gp_Pnt;

// returns the data point as Pnt from gp after Transformation
TransformedPoint(Index: number): gp_Pnt;

// returns True if Form is 20
IsCrossHair(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines CurveDimension, Type <204> Form <0> in package {@link IGESDimen`IGESDimen`} Used to dimension curves Consists of one tail segment of nonzero length beginning with an arrowhead and which serves to define the orientation
IGESDimen_CurveDimension: declare class IGESDimen_CurveDimension extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class CurveDimension
Init(aNote: IGESDimen_GeneralNote, aCurve: IGESData_IGESEntity, anotherCurve: IGESData_IGESEntity, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aLine: IGESDimen_WitnessLine, anotherLine: IGESDimen_WitnessLine): void;

// returns the General Note Entity
Note(): IGESDimen_GeneralNote;

// returns the First curve Entity
FirstCurve(): IGESData_IGESEntity;

// returns False if theSecondCurve is a Null Handle
HasSecondCurve(): boolean;

// returns the Second curve Entity or a Null Handle
SecondCurve(): IGESData_IGESEntity;

// returns the First Leader Entity
FirstLeader(): IGESDimen_LeaderArrow;

// returns the Second Leader Entity
SecondLeader(): IGESDimen_LeaderArrow;

// returns False if theFirstWitnessLine is a Null Handle
HasFirstWitnessLine(): boolean;

// returns the First Witness Line Entity or a Null Handle
FirstWitnessLine(): IGESDimen_WitnessLine;

// returns False if theSecondWitnessLine is a Null Handle
HasSecondWitnessLine(): boolean;

// returns the Second Witness Line Entity or a Null Handle
SecondWitnessLine(): IGESDimen_WitnessLine;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines DiameterDimension, Type <206> Form <0> in package {@link IGESDimen`IGESDimen`} Used for dimensioning diameters
IGESDimen_DiameterDimension: declare class IGESDimen_DiameterDimension extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class DiameterDimension
Init(aNote: IGESDimen_GeneralNote, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aCenter: gp_XY): void;

// returns the General Note Entity
Note(): IGESDimen_GeneralNote;

// returns the First Leader Entity
FirstLeader(): IGESDimen_LeaderArrow;

// returns False if theSecondleader is a Null Handle
HasSecondLeader(): boolean;

// returns the Second Leader Entity
SecondLeader(): IGESDimen_LeaderArrow;

// returns the Arc Center coordinates as Pnt2d from package gp
Center(): gp_Pnt2d;

// returns the Arc Center coordinates as Pnt2d from package gp after Transformation
TransformedCenter(): gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGES Dimension Display Data, Type <406> Form <30>, in package {@link IGESDimen`IGESDimen`} The Dimensional Display Data Property is optional but when present must be referenced by a dimension entity
IGESDimen_DimensionDisplayData: declare class IGESDimen_DimensionDisplayData extends IGESData_IGESEntity

constructor

Init(numProps: number, aDimType: number, aLabelPos: number, aCharSet: number, aString: TCollection_HAsciiString, aSymbol: number, anAng: number, anAlign: number, aLevel: number, aPlace: number, anOrient: number, initVal: number, notes: NCollection_HArray1_int, startInd: NCollection_HArray1_int, endInd: NCollection_HArray1_int): void;

// returns the number of property values (14)
NbPropertyValues(): number;

// returns the dimension type
DimensionType(): number;

// returns the preferred label position
LabelPosition(): number;

// returns the character set interpretation
CharacterSet(): number;

// returns e.g., 8HDIAMETER
LString(): TCollection_HAsciiString;

DecimalSymbol(): number;

// returns the witness line angle in radians
WitnessLineAngle(): number;

// returns the text alignment
TextAlignment(): number;

// returns the text level
TextLevel(): number;

// returns the preferred text placement
TextPlacement(): number;

// returns the arrowhead orientation
ArrowHeadOrientation(): number;

// returns the primary dimension initial value
InitialValue(): number;

// returns the number of supplementary notes or zero
NbSupplementaryNotes(): number;

// returns the Index'th supplementary note raises exception if Index <= 0 or Index > `NbSupplementaryNotes()`
SupplementaryNote(Index: number): number;

// returns the Index'th note start index raises exception if Index <= 0 or Index > `NbSupplementaryNotes()`
StartIndex(Index: number): number;

// returns the Index'th note end index raises exception if Index <= 0 or Index > NbSupplemetaryNotes()
EndIndex(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Dimension Tolerance, Type <406>, Form <29> in package {@link IGESDimen`IGESDimen`} Provides tolerance information for a dimension which can be used by the receiving system to regenerate the dimension
IGESDimen_DimensionTolerance: declare class IGESDimen_DimensionTolerance extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class DimensionTolerance
Init(nbPropVal: number, aSecTolFlag: number, aTolType: number, aTolPlaceFlag: number, anUpperTol: number, aLowerTol: number, aSignFlag: boolean, aFracFlag: number, aPrecision: number): void;

// returns the number of property values, always = 8
NbPropertyValues(): number;

// returns the Secondary Tolerance Flag
SecondaryToleranceFlag(): number;

// returns the Tolerance Type
ToleranceType(): number;

// returns the Tolerance Placement Flag, default = 2
TolerancePlacementFlag(): number;

// returns the Upper or Bilateral Tolerance Value
UpperTolerance(): number;

// returns the Lower Tolerance Value
LowerTolerance(): number;

// returns the Sign Suppression Flag
SignSuppressionFlag(): boolean;

// returns the Fraction Flag
FractionFlag(): number;

// returns the {@link Precision`Precision`} for Value Display
Precision(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Dimension {@link Units `Units`}, Type <406>, Form <28> in package {@link IGESDimen`IGESDimen`} Describes the units and formatting details of the nominal value of a dimension
IGESDimen_DimensionUnits: declare class IGESDimen_DimensionUnits extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class DimensionUnits
Init(nbPropVal: number, aSecondPos: number, aUnitsInd: number, aCharSet: number, aFormat: TCollection_HAsciiString, aFracFlag: number, aPrecision: number): void;

// returns the number of property values
NbPropertyValues(): number;

// returns position of secondary dimension w.r.t
SecondaryDimenPosition(): number;

// returns the units indicator
UnitsIndicator(): number;

// returns the character set interpretation
CharacterSet(): number;

// returns the string used in formatting value
FormatString(): TCollection_HAsciiString;

// returns the fraction flag
FractionFlag(): number;

// returns the precision/denominator number of decimal places when `FractionFlag()` = 0 denominator of fraction when `FractionFlag()` = 1
PrecisionOrDenominator(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGES Dimensioned Geometry, Type <402> Form <13>, in package {@link IGESDimen`IGESDimen`} This entity has been replaced by the new form of Dimensioned Geometry Associativity Entity (Type 402, Form 21) and should no longer be used by preprocessors
IGESDimen_DimensionedGeometry: declare class IGESDimen_DimensionedGeometry extends IGESData_IGESEntity

constructor

Init(nbDims: number, aDimension: IGESData_IGESEntity, entities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// returns the number of dimensions
NbDimensions(): number;

// returns the number of associated geometry entities
NbGeometryEntities(): number;

// returns the Dimension entity
DimensionEntity(): IGESData_IGESEntity;

// returns the num'th Geometry entity raises exception if Index <= 0 or Index > `NbGeometryEntities()`
GeometryEntity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines FlagNote, Type <208> Form <0> in package {@link IGESDimen`IGESDimen`} Is label information formatted in different ways
IGESDimen_FlagNote: declare class IGESDimen_FlagNote extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class FlagNote
Init(leftCorner: gp_XYZ, anAngle: number, aNote: IGESDimen_GeneralNote, someLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

// returns Lower Left coordinate of Flag as Pnt from package gp
LowerLeftCorner(): gp_Pnt;

// returns Lower Left coordinate of Flag as Pnt from package gp after Transformation
TransformedLowerLeftCorner(): gp_Pnt;

// returns Rotation angle in radians
Angle(): number;

// returns General Note Entity
Note(): IGESDimen_GeneralNote;

// returns number of Arrows (Leaders) or zero
NbLeaders(): number;

// returns Leader Entity raises exception if Index <= 0 or Index > `NbLeaders()`
Leader(Index: number): IGESDimen_LeaderArrow;

// returns Height computed by the formula
Height(): number;

// returns the Character Height (from General Note)
CharacterHeight(): number;

// returns Length computed by the formula
Length(): number;

// returns the Text Width (from General Note)
TextWidth(): number;

// returns TipLength computed by the formula
TipLength(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines GeneralLabel, Type <210> Form <0> in package {@link IGESDimen`IGESDimen`} Used for general labeling with leaders
IGESDimen_GeneralLabel: declare class IGESDimen_GeneralLabel extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class GeneralLabel
Init(aNote: IGESDimen_GeneralNote, someLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

// returns General Note Entity
Note(): IGESDimen_GeneralNote;

// returns Number of Leaders
NbLeaders(): number;

// returns Leader Entity raises exception if Index <= 0 or Index > `NbLeaders()`
Leader(Index: number): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services for {@link IGESDimen`IGESDimen`} (specific part) This Services comprise
IGESDimen_GeneralModule: declare class IGESDimen_GeneralModule extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Returns a category number which characterizes an entity Drawing for all
CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines GeneralNote, Type <212> Form <0-8, 100-200, 105> in package {@link IGESDimen`IGESDimen`} Used for formatting boxed text in different ways
IGESDimen_GeneralNote: declare class IGESDimen_GeneralNote extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class GeneralNote
Init(nbChars: NCollection_HArray1_int, widths: NCollection_HArray1_double, heights: NCollection_HArray1_double, fontCodes: NCollection_HArray1_int, fonts: NCollection_HArray1_handle_IGESGraph_TextFontDef, slants: NCollection_HArray1_double, rotations: NCollection_HArray1_double, mirrorFlags: NCollection_HArray1_int, rotFlags: NCollection_HArray1_int, start: NCollection_HArray1_gp_XYZ, texts: NCollection_HArray1_handle_TCollection_HAsciiString): void;

// Changes FormNumber (indicates Graphical Representation) Error if not in ranges [0-8] or [100-102] or 105
SetFormNumber(form: number): void;

// returns number of text strings in General Note
NbStrings(): number;

// returns number of characters of string or zero raises exception if Index <= 0 or Index > `NbStrings()`
NbCharacters(Index: number): number;

// returns Box width of string raises exception if Index <= 0 or Index > `NbStrings()`
BoxWidth(Index: number): number;

// returns Box height of string raises exception if Index <= 0 or Index > `NbStrings()`
BoxHeight(Index: number): number;

// returns False if Value, True if Entity raises exception if Index <= 0 or Index > `NbStrings()`
IsFontEntity(Index: number): boolean;

// returns Font code (default = 1) of string returns 0 if IsFontEntity () is True raises exception if Index <= 0 or Index > `NbStrings()`
FontCode(Index: number): number;

// returns Text Font Definition Entity of string returns a Null Handle if IsFontEntity () returns False raises exception if Index <= 0 or Index > `NbStrings()`
FontEntity(Index: number): IGESGraph_TextFontDef;

// returns Slant angle of string in radians default value = PI/2 raises exception if Index <= 0 or Index > `NbStrings()`
SlantAngle(Index: number): number;

// returns Rotation angle of string in radians raises exception if Index <= 0 or Index > `NbStrings()`
RotationAngle(Index: number): number;

// returns Mirror Flag of string 0 = no mirroring 1 = mirror axis is perpendicular to the text base line 2 = mirror axis is text base line raises exception if Index <= 0 or Index > `NbStrings()`
MirrorFlag(Index: number): number;

// returns Rotate internal text Flag of string 0 = text horizontal 1 = text vertical raises exception if Index <= 0 or Index > `NbStrings()`
RotateFlag(Index: number): number;

// returns text start point of Index'th string raises exception if Index <= 0 or Index > `NbStrings()`
StartPoint(Index: number): gp_Pnt;

// returns text start point of Index'th string after Transformation raises exception if Index <= 0 or Index > `NbStrings()`
TransformedStartPoint(Index: number): gp_Pnt;

// returns distance from Start Point plane of string raises exception if Index <= 0 or Index > `NbStrings()`
ZDepthStartPoint(Index: number): number;

// returns text string raises exception if Index <= 0 or Index > `NbStrings()`
Text(Index: number): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines General Symbol, Type <228>, Form <0-3,5001-9999> in package {@link IGESDimen`IGESDimen`} Consists of zero or one (Form 0) or one (all other forms), one or more geometry entities which define a symbol, and zero, one or more associated leaders
IGESDimen_GeneralSymbol: declare class IGESDimen_GeneralSymbol extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class GeneralSymbol
Init(aNote: IGESDimen_GeneralNote, allGeoms: NCollection_HArray1_handle_IGESData_IGESEntity, allLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

// Changes FormNumber (indicates the Nature of the Symbol) Error if not in ranges [0-3] or [> 5000]
SetFormNumber(form: number): void;

// returns True if there is associated General Note Entity
HasNote(): boolean;

// returns Null handle for form 0 only
Note(): IGESDimen_GeneralNote;

// returns number of Geometry Entities
NbGeomEntities(): number;

// returns the Index'th Geometry Entity raises exception if Index <= 0 or Index > `NbGeomEntities()`
GeomEntity(Index: number): IGESData_IGESEntity;

// returns number of Leaders or zero if not specified
NbLeaders(): number;

// returns the Index'th Leader Arrow raises exception if Index <= 0 or Index > `NbLeaders()`
LeaderArrow(Index: number): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines LeaderArrow, Type <214> Form <1-12> in package {@link IGESDimen`IGESDimen`} Consists of one or more line segments except when leader is part of an angular dimension, with links to presumed text item
IGESDimen_LeaderArrow: declare class IGESDimen_LeaderArrow extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class LeaderArrow
Init(height: number, width: number, depth: number, position: gp_XY, segments: NCollection_HArray1_gp_XY): void;

// Changes FormNumber (indicates the Shape of the Arrow) Error if not in range [0-12]
SetFormNumber(form: number): void;

// returns number of segments
NbSegments(): number;

// returns ArrowHead height
ArrowHeadHeight(): number;

// returns ArrowHead width
ArrowHeadWidth(): number;

// returns Z depth
ZDepth(): number;

// returns ArrowHead coordinates
ArrowHead(): gp_Pnt2d;

// returns ArrowHead coordinates after Transformation
TransformedArrowHead(): gp_Pnt;

// returns segment tail coordinates
SegmentTail(Index: number): gp_Pnt2d;

// returns segment tail coordinates after Transformation
TransformedSegmentTail(Index: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines LinearDimension, Type <216> Form <0> in package {@link IGESDimen`IGESDimen`} Used for linear dimensioning
IGESDimen_LinearDimension: declare class IGESDimen_LinearDimension extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class LinearDimension
Init(aNote: IGESDimen_GeneralNote, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aWitness: IGESDimen_WitnessLine, anotherWitness: IGESDimen_WitnessLine): void;

// Changes FormNumber (indicates the Nature of the Dimension Unspecified, Diameter or Radius) Error if not in range [0-2]
SetFormNumber(form: number): void;

// returns General Note Entity
Note(): IGESDimen_GeneralNote;

// returns first Leader Entity
FirstLeader(): IGESDimen_LeaderArrow;

// returns second Leader Entity
SecondLeader(): IGESDimen_LeaderArrow;

// returns False if no first witness line
HasFirstWitness(): boolean;

// returns first Witness Line Entity or a Null Handle
FirstWitness(): IGESDimen_WitnessLine;

// returns False if no second witness line
HasSecondWitness(): boolean;

// returns second Witness Line Entity or a Null Handle
SecondWitness(): IGESDimen_WitnessLine;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
