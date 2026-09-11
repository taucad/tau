# libcascade — IGESDimen

29 top-level symbols. Signatures are verbatim typescript.

IGESDimen: declare class IGESDimen

constructor

static Init(): void;

static Protocol(): IGESDimen_Protocol;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_AngularDimension: declare class IGESDimen_AngularDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, aLine: IGESDimen_WitnessLine, anotherLine: IGESDimen_WitnessLine, aVertex: gp_XY, aRadius: number, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow): void;

Note(): IGESDimen_GeneralNote;

HasFirstWitnessLine(): boolean;

FirstWitnessLine(): IGESDimen_WitnessLine;

HasSecondWitnessLine(): boolean;

SecondWitnessLine(): IGESDimen_WitnessLine;

Vertex(): gp_Pnt2d;

TransformedVertex(): gp_Pnt2d;

Radius(): number;

FirstLeader(): IGESDimen_LeaderArrow;

SecondLeader(): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_BasicDimension: declare class IGESDimen_BasicDimension extends IGESData_IGESEntity

constructor

Init(nbPropVal: number, lowerLeft: gp_XY, lowerRight: gp_XY, upperRight: gp_XY, upperLeft: gp_XY): void;

NbPropertyValues(): number;

LowerLeft(): gp_Pnt2d;

LowerRight(): gp_Pnt2d;

UpperRight(): gp_Pnt2d;

UpperLeft(): gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_CenterLine: declare class IGESDimen_CenterLine extends IGESData_IGESEntity

constructor

Init(aDataType: number, aZdisp: number, dataPnts: NCollection_HArray1_gp_XY): void;

SetCrossHair(mode: boolean): void;

Datatype(): number;

NbPoints(): number;

ZDisplacement(): number;

Point(Index: number): gp_Pnt;

TransformedPoint(Index: number): gp_Pnt;

IsCrossHair(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_CurveDimension: declare class IGESDimen_CurveDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, aCurve: IGESData_IGESEntity, anotherCurve: IGESData_IGESEntity, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aLine: IGESDimen_WitnessLine, anotherLine: IGESDimen_WitnessLine): void;

Note(): IGESDimen_GeneralNote;

FirstCurve(): IGESData_IGESEntity;

HasSecondCurve(): boolean;

SecondCurve(): IGESData_IGESEntity;

FirstLeader(): IGESDimen_LeaderArrow;

SecondLeader(): IGESDimen_LeaderArrow;

HasFirstWitnessLine(): boolean;

FirstWitnessLine(): IGESDimen_WitnessLine;

HasSecondWitnessLine(): boolean;

SecondWitnessLine(): IGESDimen_WitnessLine;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_DiameterDimension: declare class IGESDimen_DiameterDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aCenter: gp_XY): void;

Note(): IGESDimen_GeneralNote;

FirstLeader(): IGESDimen_LeaderArrow;

HasSecondLeader(): boolean;

SecondLeader(): IGESDimen_LeaderArrow;

Center(): gp_Pnt2d;

TransformedCenter(): gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_DimensionDisplayData: declare class IGESDimen_DimensionDisplayData extends IGESData_IGESEntity

constructor

Init(numProps: number, aDimType: number, aLabelPos: number, aCharSet: number, aString: TCollection_HAsciiString, aSymbol: number, anAng: number, anAlign: number, aLevel: number, aPlace: number, anOrient: number, initVal: number, notes: NCollection_HArray1_int, startInd: NCollection_HArray1_int, endInd: NCollection_HArray1_int): void;

NbPropertyValues(): number;

DimensionType(): number;

LabelPosition(): number;

CharacterSet(): number;

LString(): TCollection_HAsciiString;

DecimalSymbol(): number;

WitnessLineAngle(): number;

TextAlignment(): number;

TextLevel(): number;

TextPlacement(): number;

ArrowHeadOrientation(): number;

InitialValue(): number;

NbSupplementaryNotes(): number;

SupplementaryNote(Index: number): number;

StartIndex(Index: number): number;

EndIndex(Index: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_DimensionTolerance: declare class IGESDimen_DimensionTolerance extends IGESData_IGESEntity

constructor

Init(nbPropVal: number, aSecTolFlag: number, aTolType: number, aTolPlaceFlag: number, anUpperTol: number, aLowerTol: number, aSignFlag: boolean, aFracFlag: number, aPrecision: number): void;

NbPropertyValues(): number;

SecondaryToleranceFlag(): number;

ToleranceType(): number;

TolerancePlacementFlag(): number;

UpperTolerance(): number;

LowerTolerance(): number;

SignSuppressionFlag(): boolean;

FractionFlag(): number;

Precision(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_DimensionUnits: declare class IGESDimen_DimensionUnits extends IGESData_IGESEntity

constructor

Init(nbPropVal: number, aSecondPos: number, aUnitsInd: number, aCharSet: number, aFormat: TCollection_HAsciiString, aFracFlag: number, aPrecision: number): void;

NbPropertyValues(): number;

SecondaryDimenPosition(): number;

UnitsIndicator(): number;

CharacterSet(): number;

FormatString(): TCollection_HAsciiString;

FractionFlag(): number;

PrecisionOrDenominator(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_DimensionedGeometry: declare class IGESDimen_DimensionedGeometry extends IGESData_IGESEntity

constructor

Init(nbDims: number, aDimension: IGESData_IGESEntity, entities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

NbDimensions(): number;

NbGeometryEntities(): number;

DimensionEntity(): IGESData_IGESEntity;

GeometryEntity(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_FlagNote: declare class IGESDimen_FlagNote extends IGESData_IGESEntity

constructor

Init(leftCorner: gp_XYZ, anAngle: number, aNote: IGESDimen_GeneralNote, someLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

LowerLeftCorner(): gp_Pnt;

TransformedLowerLeftCorner(): gp_Pnt;

Angle(): number;

Note(): IGESDimen_GeneralNote;

NbLeaders(): number;

Leader(Index: number): IGESDimen_LeaderArrow;

Height(): number;

CharacterHeight(): number;

Length(): number;

TextWidth(): number;

TipLength(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_GeneralLabel: declare class IGESDimen_GeneralLabel extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, someLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

Note(): IGESDimen_GeneralNote;

NbLeaders(): number;

Leader(Index: number): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_GeneralModule: declare class IGESDimen_GeneralModule extends IGESData_GeneralModule

constructor

DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_GeneralNote: declare class IGESDimen_GeneralNote extends IGESData_IGESEntity

constructor

Init(nbChars: NCollection_HArray1_int, widths: NCollection_HArray1_double, heights: NCollection_HArray1_double, fontCodes: NCollection_HArray1_int, fonts: NCollection_HArray1_handle_IGESGraph_TextFontDef, slants: NCollection_HArray1_double, rotations: NCollection_HArray1_double, mirrorFlags: NCollection_HArray1_int, rotFlags: NCollection_HArray1_int, start: NCollection_HArray1_gp_XYZ, texts: NCollection_HArray1_handle_TCollection_HAsciiString): void;

SetFormNumber(form: number): void;

NbStrings(): number;

NbCharacters(Index: number): number;

BoxWidth(Index: number): number;

BoxHeight(Index: number): number;

IsFontEntity(Index: number): boolean;

FontCode(Index: number): number;

FontEntity(Index: number): IGESGraph_TextFontDef;

SlantAngle(Index: number): number;

RotationAngle(Index: number): number;

MirrorFlag(Index: number): number;

RotateFlag(Index: number): number;

StartPoint(Index: number): gp_Pnt;

TransformedStartPoint(Index: number): gp_Pnt;

ZDepthStartPoint(Index: number): number;

Text(Index: number): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_GeneralSymbol: declare class IGESDimen_GeneralSymbol extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, allGeoms: NCollection_HArray1_handle_IGESData_IGESEntity, allLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

SetFormNumber(form: number): void;

HasNote(): boolean;

Note(): IGESDimen_GeneralNote;

NbGeomEntities(): number;

GeomEntity(Index: number): IGESData_IGESEntity;

NbLeaders(): number;

LeaderArrow(Index: number): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_LeaderArrow: declare class IGESDimen_LeaderArrow extends IGESData_IGESEntity

constructor

Init(height: number, width: number, depth: number, position: gp_XY, segments: NCollection_HArray1_gp_XY): void;

SetFormNumber(form: number): void;

NbSegments(): number;

ArrowHeadHeight(): number;

ArrowHeadWidth(): number;

ZDepth(): number;

ArrowHead(): gp_Pnt2d;

TransformedArrowHead(): gp_Pnt;

SegmentTail(Index: number): gp_Pnt2d;

TransformedSegmentTail(Index: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_LinearDimension: declare class IGESDimen_LinearDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aWitness: IGESDimen_WitnessLine, anotherWitness: IGESDimen_WitnessLine): void;

SetFormNumber(form: number): void;

Note(): IGESDimen_GeneralNote;

FirstLeader(): IGESDimen_LeaderArrow;

SecondLeader(): IGESDimen_LeaderArrow;

HasFirstWitness(): boolean;

FirstWitness(): IGESDimen_WitnessLine;

HasSecondWitness(): boolean;

SecondWitness(): IGESDimen_WitnessLine;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_NewDimensionedGeometry: declare class IGESDimen_NewDimensionedGeometry extends IGESData_IGESEntity

constructor

Init(nbDimens: number, aDimen: IGESData_IGESEntity, anOrientation: number, anAngle: number, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity, allLocations: NCollection_HArray1_int, allPoints: NCollection_HArray1_gp_XYZ): void;

NbDimensions(): number;

NbGeometries(): number;

DimensionEntity(): IGESData_IGESEntity;

DimensionOrientationFlag(): number;

AngleValue(): number;

GeometryEntity(Index: number): IGESData_IGESEntity;

DimensionLocationFlag(Index: number): number;

Point(Index: number): gp_Pnt;

TransformedPoint(Index: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_NewGeneralNote: declare class IGESDimen_NewGeneralNote extends IGESData_IGESEntity

constructor

Init(width: number, height: number, justifyCode: number, areaLoc: gp_XYZ, areaRotationAngle: number, baseLinePos: gp_XYZ, normalInterlineSpace: number, charDisplays: NCollection_HArray1_int, charWidths: NCollection_HArray1_double, charHeights: NCollection_HArray1_double, interCharSpc: NCollection_HArray1_double, interLineSpc: NCollection_HArray1_double, fontStyles: NCollection_HArray1_int, charAngles: NCollection_HArray1_double, controlCodeStrings: NCollection_HArray1_handle_TCollection_HAsciiString, nbChars: NCollection_HArray1_int, boxWidths: NCollection_HArray1_double, boxHeights: NCollection_HArray1_double, charSetCodes: NCollection_HArray1_int, charSetEntities: NCollection_HArray1_handle_IGESData_IGESEntity, slAngles: NCollection_HArray1_double, rotAngles: NCollection_HArray1_double, mirrorFlags: NCollection_HArray1_int, rotateFlags: NCollection_HArray1_int, startPoints: NCollection_HArray1_gp_XYZ, texts: NCollection_HArray1_handle_TCollection_HAsciiString): void;

TextWidth(): number;

TextHeight(): number;

JustifyCode(): number;

AreaLocation(): gp_Pnt;

TransformedAreaLocation(): gp_Pnt;

ZDepthAreaLocation(): number;

AreaRotationAngle(): number;

BaseLinePosition(): gp_Pnt;

TransformedBaseLinePosition(): gp_Pnt;

ZDepthBaseLinePosition(): number;

NormalInterlineSpace(): number;

NbStrings(): number;

CharacterDisplay(Index: number): number;

IsVariable(Index: number): boolean;

CharacterWidth(Index: number): number;

CharacterHeight(Index: number): number;

InterCharacterSpace(Index: number): number;

InterlineSpace(Index: number): number;

FontStyle(Index: number): number;

CharacterAngle(Index: number): number;

ControlCodeString(Index: number): TCollection_HAsciiString;

NbCharacters(Index: number): number;

BoxWidth(Index: number): number;

BoxHeight(Index: number): number;

IsCharSetEntity(Index: number): boolean;

CharSetCode(Index: number): number;

CharSetEntity(Index: number): IGESData_IGESEntity;

SlantAngle(Index: number): number;

RotationAngle(Index: number): number;

MirrorFlag(Index: number): number;

IsMirrored(Index: number): boolean;

RotateFlag(Index: number): number;

StartPoint(Index: number): gp_Pnt;

TransformedStartPoint(Index: number): gp_Pnt;

ZDepthStartPoint(Index: number): number;

Text(Index: number): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_OrdinateDimension: declare class IGESDimen_OrdinateDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, aType: boolean, aLine: IGESDimen_WitnessLine, anArrow: IGESDimen_LeaderArrow): void;

IsLine(): boolean;

IsLeader(): boolean;

Note(): IGESDimen_GeneralNote;

WitnessLine(): IGESDimen_WitnessLine;

Leader(): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_PointDimension: declare class IGESDimen_PointDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, anArrow: IGESDimen_LeaderArrow, aGeom: IGESData_IGESEntity): void;

Note(): IGESDimen_GeneralNote;

LeaderArrow(): IGESDimen_LeaderArrow;

GeomCase(): number;

Geom(): IGESData_IGESEntity;

CircularArc(): IGESGeom_CircularArc;

CompositeCurve(): IGESGeom_CompositeCurve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_Protocol: declare class IGESDimen_Protocol extends IGESData_Protocol

constructor

NbResources(): number;

Resource(num: number): Interface_Protocol;

TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_RadiusDimension: declare class IGESDimen_RadiusDimension extends IGESData_IGESEntity

constructor

Init(aNote: IGESDimen_GeneralNote, anArrow: IGESDimen_LeaderArrow, arcCenter: gp_XY, anotherArrow: IGESDimen_LeaderArrow): void;

InitForm(form: number): void;

Note(): IGESDimen_GeneralNote;

Leader(): IGESDimen_LeaderArrow;

Center(): gp_Pnt2d;

TransformedCenter(): gp_Pnt;

HasLeader2(): boolean;

Leader2(): IGESDimen_LeaderArrow;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_ReadWriteModule: declare class IGESDimen_ReadWriteModule extends IGESData_ReadWriteModule

constructor

CaseIGES(typenum: number, formnum: number): number;

WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_Section: declare class IGESDimen_Section extends IGESData_IGESEntity

constructor

Init(dataType: number, aDisp: number, dataPoints: NCollection_HArray1_gp_XY): void;

SetFormNumber(form: number): void;

Datatype(): number;

NbPoints(): number;

ZDisplacement(): number;

Point(Index: number): gp_Pnt;

TransformedPoint(Index: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_SectionedArea: declare class IGESDimen_SectionedArea extends IGESData_IGESEntity

constructor

Init(aCurve: IGESData_IGESEntity, aPattern: number, aPoint: gp_XYZ, aDistance: number, anAngle: number, someIslands: NCollection_HArray1_handle_IGESData_IGESEntity): void;

SetInverted(mode: boolean): void;

IsInverted(): boolean;

ExteriorCurve(): IGESData_IGESEntity;

Pattern(): number;

PassingPoint(): gp_Pnt;

TransformedPassingPoint(): gp_Pnt;

ZDepth(): number;

Distance(): number;

Angle(): number;

NbIslands(): number;

IslandCurve(Index: number): IGESData_IGESEntity;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_SpecificModule: declare class IGESDimen_SpecificModule extends IGESData_SpecificModule

constructor

OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_ToolAngularDimension: declare class IGESDimen_ToolAngularDimension

constructor

WriteOwnParams(ent: IGESDimen_AngularDimension, IW: IGESData_IGESWriter): void;

DirChecker(ent: IGESDimen_AngularDimension): IGESData_DirChecker;

OwnCheck(ent: IGESDimen_AngularDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDimen_AngularDimension, entto: IGESDimen_AngularDimension, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;

IGESDimen_ToolBasicDimension: declare class IGESDimen_ToolBasicDimension

constructor

WriteOwnParams(ent: IGESDimen_BasicDimension, IW: IGESData_IGESWriter): void;

OwnCorrect(ent: IGESDimen_BasicDimension): boolean;

DirChecker(ent: IGESDimen_BasicDimension): IGESData_DirChecker;

OwnCheck(ent: IGESDimen_BasicDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

OwnCopy(entfrom: IGESDimen_BasicDimension, entto: IGESDimen_BasicDimension, TC: Interface_CopyTool): void;

delete(): void;

[Symbol.dispose](): void;
