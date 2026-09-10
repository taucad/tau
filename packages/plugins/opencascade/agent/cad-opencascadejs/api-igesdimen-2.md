# libcascade — IGESDimen (2)

19 top-level symbols. Signatures are verbatim typescript.

// defines New Dimensioned Geometry, Type <402>, Form <21> in package {@link IGESDimen`IGESDimen`} Links a dimension entity with the geometry entities it is dimensioning, so that later, in the receiving database, the dimension can be automatically recalculated and redrawn should the geometry be changed
IGESDimen_NewDimensionedGeometry: declare class IGESDimen_NewDimensionedGeometry extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class NewDimensionedGeometry
Init(nbDimens: number, aDimen: IGESData_IGESEntity, anOrientation: number, anAngle: number, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity, allLocations: NCollection_HArray1_int, allPoints: NCollection_HArray1_gp_XYZ): void;

// returns the number of dimensions
NbDimensions(): number;

// returns the number of associated geometry entities
NbGeometries(): number;

// returns the dimension entity
DimensionEntity(): IGESData_IGESEntity;

// returns the dimension orientation flag
DimensionOrientationFlag(): number;

// returns the angle value
AngleValue(): number;

// returns the Index'th geometry entity raises exception if Index <= 0 or Index > `NbGeometries()`
GeometryEntity(Index: number): IGESData_IGESEntity;

// returns the Index'th geometry entity's dimension location flag raises exception if Index <= 0 or Index > `NbGeometries()`
DimensionLocationFlag(Index: number): number;

// coordinate of point on Index'th geometry entity raises exception if Index <= 0 or Index > `NbGeometries()`
Point(Index: number): gp_Pnt;

// coordinate of point on Index'th geometry entity after Transformation raises exception if Index <= 0 or Index > `NbGeometries()`
TransformedPoint(Index: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines NewGeneralNote, Type <213> Form <0> in package {@link IGESDimen`IGESDimen`} Further attributes for formatting text strings
IGESDimen_NewGeneralNote: declare class IGESDimen_NewGeneralNote extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class NewGeneralNote
Init(width: number, height: number, justifyCode: number, areaLoc: gp_XYZ, areaRotationAngle: number, baseLinePos: gp_XYZ, normalInterlineSpace: number, charDisplays: NCollection_HArray1_int, charWidths: NCollection_HArray1_double, charHeights: NCollection_HArray1_double, interCharSpc: NCollection_HArray1_double, interLineSpc: NCollection_HArray1_double, fontStyles: NCollection_HArray1_int, charAngles: NCollection_HArray1_double, controlCodeStrings: NCollection_HArray1_handle_TCollection_HAsciiString, nbChars: NCollection_HArray1_int, boxWidths: NCollection_HArray1_double, boxHeights: NCollection_HArray1_double, charSetCodes: NCollection_HArray1_int, charSetEntities: NCollection_HArray1_handle_IGESData_IGESEntity, slAngles: NCollection_HArray1_double, rotAngles: NCollection_HArray1_double, mirrorFlags: NCollection_HArray1_int, rotateFlags: NCollection_HArray1_int, startPoints: NCollection_HArray1_gp_XYZ, texts: NCollection_HArray1_handle_TCollection_HAsciiString): void;

// returns width of text containment area of all strings in the note
TextWidth(): number;

// returns height of text containment area of all strings in the note
TextHeight(): number;

// returns Justification code of all strings within the note 0 = no justification 1 = right justified 2 = center justified 3 = left justified
JustifyCode(): number;

// returns Text containment area Location point
AreaLocation(): gp_Pnt;

// returns Text containment area Location point after Transformation
TransformedAreaLocation(): gp_Pnt;

// returns distance from the containment area plane
ZDepthAreaLocation(): number;

// returns rotation angle of text containment area in radians
AreaRotationAngle(): number;

// returns position of first base line
BaseLinePosition(): gp_Pnt;

// returns position of first base line after Transformation
TransformedBaseLinePosition(): gp_Pnt;

// returns distance from the Base line position plane
ZDepthBaseLinePosition(): number;

// returns Normal Interline Spacing
NormalInterlineSpace(): number;

// returns number of text HAsciiStrings
NbStrings(): number;

// returns Fixed/Variable width character display of string 0 = Fixed 1 = Variable raises exception if Index <= 0 or Index > `NbStrings()`
CharacterDisplay(Index: number): number;

// returns False if Character display width is Fixed optional method, if required raises exception if Index <= 0 or Index > `NbStrings()`
IsVariable(Index: number): boolean;

// returns Character Width of string raises exception if Index <= 0 or Index > `NbStrings()`
CharacterWidth(Index: number): number;

// returns Character Height of string raises exception if Index <= 0 or Index > `NbStrings()`
CharacterHeight(Index: number): number;

// returns Inter-character spacing of string raises exception if Index <= 0 or Index > `NbStrings()`
InterCharacterSpace(Index: number): number;

// returns Interline spacing of string raises exception if Index <= 0 or Index > `NbStrings()`
InterlineSpace(Index: number): number;

// returns FontStyle of string raises exception if Index <= 0 or Index > `NbStrings()`
FontStyle(Index: number): number;

// returns CharacterAngle of string Angle returned will be between 0 and 2PI raises exception if Index <= 0 or Index > `NbStrings()`
CharacterAngle(Index: number): number;

// returns ControlCodeString of string raises exception if Index <= 0 or Index > `NbStrings()`
ControlCodeString(Index: number): TCollection_HAsciiString;

// returns number of characters in string or zero raises exception if Index <= 0 or Index > `NbStrings()`
NbCharacters(Index: number): number;

// returns Box width of string raises exception if Index <= 0 or Index > `NbStrings()`
BoxWidth(Index: number): number;

// returns Box height of string raises exception if Index <= 0 or Index > `NbStrings()`
BoxHeight(Index: number): number;

// returns False if Value, True if Pointer (Entity) raises exception if Index <= 0 or Index > `NbStrings()`
IsCharSetEntity(Index: number): boolean;

// returns Character Set Interpretation (default = 1) of string returns 0 if IsCharSetEntity () is True 1 = {@link Standard `Standard`} ASCII 1001 = Symbol Font1 1002 = Symbol Font2 1003 = Symbol Font3 raises exception if Index <= 0 or Index > `NbStrings()`
CharSetCode(Index: number): number;

// returns Character Set Interpretation of string returns a Null Handle if IsCharSetEntity () is False raises exception if Index <= 0 or Index > `NbStrings()`
CharSetEntity(Index: number): IGESData_IGESEntity;

// returns Slant angle of string in radians default value = PI/2 raises exception if Index <= 0 or Index > `NbStrings()`
SlantAngle(Index: number): number;

// returns Rotation angle of string in radians raises exception if Index <= 0 or Index > `NbStrings()`
RotationAngle(Index: number): number;

// returns Mirror Flag of string 0 = no mirroring 1 = mirror axis is perpendicular to the text base line 2 = mirror axis is text base line raises exception if Index <= 0 or Index > `NbStrings()`
MirrorFlag(Index: number): number;

// returns False if MirrorFlag = 0
IsMirrored(Index: number): boolean;

// returns Rotate internal text Flag of string 0 = text horizontal 1 = text vertical raises exception if Index <= 0 or Index > `NbStrings()`
RotateFlag(Index: number): number;

// returns text start point of string raises exception if Index <= 0 or Index > `NbStrings()`
StartPoint(Index: number): gp_Pnt;

// returns text start point of string after Transformation raises exception if Index <= 0 or Index > `NbStrings()`
TransformedStartPoint(Index: number): gp_Pnt;

// returns distance from the start point plane raises exception if Index <= 0 or Index > `NbStrings()`
ZDepthStartPoint(Index: number): number;

// returns text string raises exception if Index <= 0 or Index > `NbStrings()`
Text(Index: number): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Ordinate Dimension, Type <218> Form <0, 1>, in package {@link IGESDimen`IGESDimen`} Note
IGESDimen_OrdinateDimension: declare class IGESDimen_OrdinateDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, aType: boolean, aLine: IGESDimen_WitnessLine, anArrow: IGESDimen_LeaderArrow): void;

// returns True if Witness Line and False if Leader (only for Form 0)
IsLine(): boolean;

// returns True if Leader and False if Witness Line (only for Form 0)
IsLeader(): boolean;

// returns the General Note entity associated
Note(): IGESDimen_GeneralNote;

// returns the Witness Line associated or Null handle
WitnessLine(): IGESDimen_WitnessLine;

// returns the Leader associated or Null handle
Leader(): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Point Dimension, Type <220> Form <0>, in package {@link IGESDimen`IGESDimen`} A Point Dimension Entity consists of a leader, text, and an optional circle or hexagon enclosing the text IGES specs for this entity mention SimpleClosedPlanarCurve Entity(106/63)which is not listed in LIST.Text In the sequel we have ignored this & considered only the other two entity for representing the hexagon or circle enclosing the text
IGESDimen_PointDimension: declare class IGESDimen_PointDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, anArrow: IGESDimen_LeaderArrow, aGeom: IGESData_IGESEntity): void;

Note(): IGESDimen_GeneralNote;

LeaderArrow(): IGESDimen_LeaderArrow;

// returns the type of geometric entity
GeomCase(): number;

// returns the Geometry Entity, Null handle if GeomCase(me) .eq
Geom(): IGESData_IGESEntity;

// returns Null handle if GeomCase(me) .ne
CircularArc(): IGESGeom_CircularArc;

// returns Null handle if GeomCase(me) .ne
CompositeCurve(): IGESGeom_CompositeCurve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Protocol for {@link IGESDimen`IGESDimen`}
IGESDimen_Protocol: declare class IGESDimen_Protocol extends IGESData_Protocol

constructor

// Gives the count of Resource Protocol
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type This Case Number is then used in Libraries
TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines IGES Radius Dimension, type <222> Form <0, 1>, in package {@link IGESDimen`IGESDimen`}
IGESDimen_RadiusDimension: declare class IGESDimen_RadiusDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, anArrow: IGESDimen_LeaderArrow, arcCenter: gp_XY, anotherArrow: IGESDimen_LeaderArrow): void;

// Allows to change Form Number (1 admits null arrow)
InitForm(form: number): void;

// returns the General Note entity
Note(): IGESDimen_GeneralNote;

// returns the Leader Arrow entity
Leader(): IGESDimen_LeaderArrow;

// returns the coordinates of the Arc Center
Center(): gp_Pnt2d;

// returns the coordinates of the Arc Center after Transformation (Z coord taken from ZDepth of Leader Entity)
TransformedCenter(): gp_Pnt;

// returns True if form is 1, False if 0
HasLeader2(): boolean;

// returns Null handle if Form is 0
Leader2(): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Dimen File Access Module for {@link IGESDimen`IGESDimen`} (specific parts) Specific actions concern
IGESDimen_ReadWriteModule: declare class IGESDimen_ReadWriteModule extends IGESData_ReadWriteModule

constructor

// Defines Case Numbers for Entities of {@link IGESDimen`IGESDimen`}
CaseIGES(typenum: number, formnum: number): number;

// Writes own parameters to IGESWriter
WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines Section, Type <106> Form <31-38> in package {@link IGESDimen`IGESDimen`} Contains information to display sectioned sides
IGESDimen_Section: declare class IGESDimen_Section extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Section
Init(dataType: number, aDisp: number, dataPoints: NCollection_HArray1_gp_XY): void;

// Changes FormNumber (indicates the Type of the Hatches) Error if not in range [31-38]
SetFormNumber(form: number): void;

// returns Interpretation Flag, always = 1
Datatype(): number;

// returns number of Data Points
NbPoints(): number;

// returns common Z displacement
ZDisplacement(): number;

// returns Index'th data point raises exception if Index <= 0 or Index > `NbPoints()`
Point(Index: number): gp_Pnt;

// returns Index'th data point after Transformation raises exception if Index <= 0 or Index > `NbPoints()`
TransformedPoint(Index: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Sectioned Area, Type <230> Form <0>, in package {@link IGESDimen`IGESDimen`} A sectioned area is a portion of a design which is to be filled with a pattern of lines
IGESDimen_SectionedArea: declare class IGESDimen_SectionedArea extends IGESData_IGESEntity

constructor

Init(aCurve: IGESData_IGESEntity, aPattern: number, aPoint: gp_XYZ, aDistance: number, anAngle: number, someIslands: NCollection_HArray1_handle_IGESData_IGESEntity): void;

// Sets the cross hatches to be inverted or not, according value of <mode> (corresponds to FormNumber)
SetInverted(mode: boolean): void;

// Returns True if cross hatches as Inverted, else they are {@link Standard `Standard`} (Inverted
IsInverted(): boolean;

// returns the exterior definition curve
ExteriorCurve(): IGESData_IGESEntity;

// returns fill pattern code
Pattern(): number;

// returns point thru which line should pass
PassingPoint(): gp_Pnt;

// returns point thru which line should pass after Transformation
TransformedPassingPoint(): gp_Pnt;

// returns the Z depth
ZDepth(): number;

// returns the normal distance between lines
Distance(): number;

// returns the angle of lines with XT axis
Angle(): number;

// returns the number of island curves
NbIslands(): number;

// returns the interior definition curves, returns Null Handle exception raised if Index <= 0 or Index > `NbIslands()`
IslandCurve(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Services attached to IGES Entities
IGESDimen_SpecificModule: declare class IGESDimen_SpecificModule extends IGESData_SpecificModule

constructor

// Performs non-ambiguous Corrections on Entities which support them (BasicDimension,CenterLine,DimensionDisplayData, DimensionTolerance,DimensionUnits,DimensionedGeometry, NewDimensionedGeometry,Section,WitnessLine)
OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a AngularDimension
IGESDimen_ToolAngularDimension: declare class IGESDimen_ToolAngularDimension

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_AngularDimension, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_AngularDimension): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_AngularDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_AngularDimension, entto: IGESDimen_AngularDimension, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a BasicDimension
IGESDimen_ToolBasicDimension: declare class IGESDimen_ToolBasicDimension

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_BasicDimension, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a BasicDimension (NbPropertyValues forced to 8)
OwnCorrect(ent: IGESDimen_BasicDimension): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_BasicDimension): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_BasicDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_BasicDimension, entto: IGESDimen_BasicDimension, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a CenterLine
IGESDimen_ToolCenterLine: declare class IGESDimen_ToolCenterLine

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_CenterLine, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a CenterLine (LineFont forced to Rank = 1, DataType forced to 1)
OwnCorrect(ent: IGESDimen_CenterLine): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_CenterLine): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_CenterLine, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_CenterLine, entto: IGESDimen_CenterLine, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a CurveDimension
IGESDimen_ToolCurveDimension: declare class IGESDimen_ToolCurveDimension

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_CurveDimension, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_CurveDimension): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_CurveDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_CurveDimension, entto: IGESDimen_CurveDimension, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DiameterDimension
IGESDimen_ToolDiameterDimension: declare class IGESDimen_ToolDiameterDimension

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_DiameterDimension, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_DiameterDimension): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_DiameterDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_DiameterDimension, entto: IGESDimen_DiameterDimension, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DimensionDisplayData
IGESDimen_ToolDimensionDisplayData: declare class IGESDimen_ToolDimensionDisplayData

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_DimensionDisplayData, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a DimensionDisplayData (NbPropertyValues forced to 14)
OwnCorrect(ent: IGESDimen_DimensionDisplayData): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_DimensionDisplayData): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_DimensionDisplayData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_DimensionDisplayData, entto: IGESDimen_DimensionDisplayData, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DimensionTolerance
IGESDimen_ToolDimensionTolerance: declare class IGESDimen_ToolDimensionTolerance

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_DimensionTolerance, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a DimensionTolerance (NbPropertyValues forced to 8)
OwnCorrect(ent: IGESDimen_DimensionTolerance): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_DimensionTolerance): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_DimensionTolerance, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_DimensionTolerance, entto: IGESDimen_DimensionTolerance, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DimensionUnits
IGESDimen_ToolDimensionUnits: declare class IGESDimen_ToolDimensionUnits

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_DimensionUnits, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a DimensionUnits (NbPropertyValues forced to 6)
OwnCorrect(ent: IGESDimen_DimensionUnits): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_DimensionUnits): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_DimensionUnits, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_DimensionUnits, entto: IGESDimen_DimensionUnits, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DimensionedGeometry
IGESDimen_ToolDimensionedGeometry: declare class IGESDimen_ToolDimensionedGeometry

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_DimensionedGeometry, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a DimensionedGeometry (NbDimensions forced to 1)
OwnCorrect(ent: IGESDimen_DimensionedGeometry): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_DimensionedGeometry): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_DimensionedGeometry, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_DimensionedGeometry, entto: IGESDimen_DimensionedGeometry, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
