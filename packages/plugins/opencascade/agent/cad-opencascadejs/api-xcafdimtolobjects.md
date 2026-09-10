# libcascade — XCAFDimTolObjects

22 top-level symbols. Signatures are verbatim typescript.

// Defines types of qualifier for angular dimensions
XCAFDimTolObjects_AngularQualifier: typeof XCAFDimTolObjects_AngularQualifier[keyof typeof XCAFDimTolObjects_AngularQualifier]

// Defines modifirs
XCAFDimTolObjects_DatumModifWithValue: typeof XCAFDimTolObjects_DatumModifWithValue[keyof typeof XCAFDimTolObjects_DatumModifWithValue]

// Access object to store datum
XCAFDimTolObjects_DatumObject: declare class XCAFDimTolObjects_DatumObject extends Standard_Transient

constructor

// Returns semantic name
GetSemanticName(): TCollection_HAsciiString;

// Sets semantic name
SetSemanticName(theName: TCollection_HAsciiString): void;

// Returns datum name
GetName(): TCollection_HAsciiString;

// Sets datum name
SetName(theTag: TCollection_HAsciiString): void;

// Returns a sequence of modifiers of the datum
GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif;

// Sets new sequence of datum modifiers
SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

// Retrieves datum modifier with value
GetModifierWithValue(theModifier?: XCAFDimTolObjects_DatumModifWithValue, theValue?: number): { theModifier: XCAFDimTolObjects_DatumModifWithValue; theValue: number };

// Sets datum modifier with value
SetModifierWithValue(theModifier: XCAFDimTolObjects_DatumModifWithValue, theValue: number): void;

// Adds a modifier to the datum sequence of modifiers
AddModifier(theModifier: XCAFDimTolObjects_DatumSingleModif): void;

// Returns datum target shape
GetDatumTarget(): TopoDS_Shape;

// Sets datum target shape
SetDatumTarget(theShape: TopoDS_Shape): void;

// Returns datum position in the related geometric tolerance object
GetPosition(): number;

// Sets datum position in the related geometric tolerance object
SetPosition(thePosition: number): void;

// Returns True if the datum target is specified
IsDatumTarget(): boolean;
IsDatumTarget(theIsDT: boolean): void;
IsDatumTarget(): boolean;
IsDatumTarget(theIsDT: boolean): void;

// Returns datum target type
GetDatumTargetType(): XCAFDimTolObjects_DatumTargetType;

// Sets datum target to point, line, rectangle, circle or area type
SetDatumTargetType(theType: XCAFDimTolObjects_DatumTargetType): void;

// Returns datum target axis
GetDatumTargetAxis(): gp_Ax2;

// Sets datum target axis
SetDatumTargetAxis(theAxis: gp_Ax2): void;

// Returns datum target length for line and rectangle types
GetDatumTargetLength(): number;

// Sets datum target length
SetDatumTargetLength(theLength: number): void;

// Returns datum target width for rectangle type
GetDatumTargetWidth(): number;

// Sets datum target width
SetDatumTargetWidth(theWidth: number): void;

// Returns datum target number
GetDatumTargetNumber(): number;

// Sets datum target number
SetDatumTargetNumber(theNumber: number): void;

// Sets annotation plane
SetPlane(thePlane: gp_Ax2): void;

// Returns annotation plane
GetPlane(): gp_Ax2;

// Sets a point on the datum target shape
SetPoint(thePnt: gp_Pnt): void;

// Gets point on the datum shape
GetPoint(): gp_Pnt;

// Sets a position of the datum text
SetPointTextAttach(thePntText: gp_Pnt): void;

// Gets datum text position
GetPointTextAttach(): gp_Pnt;

// Returns True if the datum has annotation plane
HasPlane(): boolean;

// Returns True if point on the datum target is specified
HasPoint(): boolean;

// Returns True if the datum text position is specified
HasPointText(): boolean;

// Set graphical presentation for object
SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

// Returns graphical presentation of the object
GetPresentation(): TopoDS_Shape;

// Returns graphical presentation of the object
GetPresentationName(): TCollection_HAsciiString;

// Returns True if the datum has valid parameters for datum target (width, length, circle radius etc)
HasDatumTargetParams(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines modifirs
XCAFDimTolObjects_DatumSingleModif: typeof XCAFDimTolObjects_DatumSingleModif[keyof typeof XCAFDimTolObjects_DatumSingleModif]

// Defines types of dimension
XCAFDimTolObjects_DatumTargetType: typeof XCAFDimTolObjects_DatumTargetType[keyof typeof XCAFDimTolObjects_DatumTargetType]

// Defines value of form variance
XCAFDimTolObjects_DimensionFormVariance: typeof XCAFDimTolObjects_DimensionFormVariance[keyof typeof XCAFDimTolObjects_DimensionFormVariance]

// Defines value of grade
XCAFDimTolObjects_DimensionGrade: typeof XCAFDimTolObjects_DimensionGrade[keyof typeof XCAFDimTolObjects_DimensionGrade]

// Defines modifirs
XCAFDimTolObjects_DimensionModif: typeof XCAFDimTolObjects_DimensionModif[keyof typeof XCAFDimTolObjects_DimensionModif]

// Access object to store dimension data
XCAFDimTolObjects_DimensionObject: declare class XCAFDimTolObjects_DimensionObject extends Standard_Transient

constructor

// Returns semantic name
GetSemanticName(): TCollection_HAsciiString;

// Sets semantic name
SetSemanticName(theName: TCollection_HAsciiString): void;

// Sets dimension qualifier as min., max
SetQualifier(theQualifier: XCAFDimTolObjects_DimensionQualifier): void;

// Returns dimension qualifier
GetQualifier(): XCAFDimTolObjects_DimensionQualifier;

// Returns True if the object has dimension qualifier
HasQualifier(): boolean;

// Sets angular qualifier as small, large or equal
SetAngularQualifier(theAngularQualifier: XCAFDimTolObjects_AngularQualifier): void;

// Returns angular qualifier
GetAngularQualifier(): XCAFDimTolObjects_AngularQualifier;

// Returns True if the object has angular qualifier
HasAngularQualifier(): boolean;

// Sets a specific type of dimension
SetType(theTyupe: XCAFDimTolObjects_DimensionType): void;

// Returns dimension type
GetType(): XCAFDimTolObjects_DimensionType;

// Returns the main dimension value
GetValue(): number;

// Returns raw array of dimension values
GetValues(): NCollection_HArray1_double;

// Sets the main dimension value
SetValue(theValue: number): void;

// Replaces current raw array of dimension values with theValues array
SetValues(theValue: NCollection_HArray1_double): void;

// Returns True if the dimension is of range kind
IsDimWithRange(): boolean;

// Sets the upper bound of the range dimension, otherwise resets it to an empty range with the specified upper bound
SetUpperBound(theUpperBound: number): void;

// Sets the lower bound of the range dimension, otherwise resets it to an empty range with the specified lower bound
SetLowerBound(theLowerBound: number): void;

// Returns the upper bound of the range dimension, otherwise - zero
GetUpperBound(): number;

// Returns the lower bound of the range dimension, otherwise - zero
GetLowerBound(): number;

// Returns True if the dimension is of +/- tolerance kind
IsDimWithPlusMinusTolerance(): boolean;

// Sets the upper value of the toleranced dimension, otherwise resets a simple dimension to toleranced one with the specified lower/upper tolerances
SetUpperTolValue(theUperTolValue: number): boolean;

// Sets the lower value of the toleranced dimension, otherwise resets a simple dimension to toleranced one with the specified lower/upper tolerances
SetLowerTolValue(theLowerTolValue: number): boolean;

// Returns the lower value of the toleranced dimension, otherwise - zero
GetUpperTolValue(): number;

// Returns the upper value of the toleranced dimension, otherwise - zero
GetLowerTolValue(): number;

// Returns True if the form variance was set to not XCAFDimTolObjects_DimensionFormVariance_None value
IsDimWithClassOfTolerance(): boolean;

// Sets tolerance class of the dimension
SetClassOfTolerance(theHole: boolean, theFormVariance: XCAFDimTolObjects_DimensionFormVariance, theGrade: XCAFDimTolObjects_DimensionGrade): void;
// theHole: True if the tolerance applies to an internal feature
// theFormVariance: represents the fundamental deviation or "position letter" of the ISO 286 limits-and-fits tolerance classification
// theGrade: represents the quality or the accuracy grade of a tolerance

// Retrieves tolerance class parameters of the dimension
GetClassOfTolerance(theHole?: boolean, theFormVariance?: XCAFDimTolObjects_DimensionFormVariance, theGrade?: XCAFDimTolObjects_DimensionGrade): { returnValue: boolean; theHole: boolean; theFormVariance: XCAFDimTolObjects_DimensionFormVariance; theGrade: XCAFDimTolObjects_DimensionGrade };

// Sets the number of places to the left and right of the decimal point respectively
SetNbOfDecimalPlaces(theL: number, theR: number): void;

// Returns the number of places to the left and right of the decimal point respectively
GetNbOfDecimalPlaces(theL?: number, theR?: number): { theL: number; theR: number };

// Returns a sequence of modifiers of the dimension
GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_DimensionModif;

// Sets new sequence of dimension modifiers
SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

// Adds a modifier to the dimension sequence of modifiers
AddModifier(theModifier: XCAFDimTolObjects_DimensionModif): void;

// Returns a 'curve' along which the dimension is measured
GetPath(): TopoDS_Edge;

// Sets a 'curve' along which the dimension is measured
SetPath(thePath: TopoDS_Edge): void;

// Returns the orientation of the dimension in annotation plane
GetDirection(theDir: gp_Dir): boolean;
// theDir: Mutated in place

// Sets an orientation of the dimension in annotation plane
SetDirection(theDir: gp_Dir): boolean;

// Sets position of the dimension text
SetPointTextAttach(thePntText: gp_Pnt): void;

// Returns position of the dimension text
GetPointTextAttach(): gp_Pnt;

// Returns True if the position of dimension text is specified
HasTextPoint(): boolean;

// Sets annotation plane
SetPlane(thePlane: gp_Ax2): void;

// Returns annotation plane
GetPlane(): gp_Ax2;

// Returns True if the object has annotation plane
HasPlane(): boolean;

// Returns true, if connection point exists (for dimensional_size), if connection point for the first shape exists (for dimensional_location)
HasPoint(): boolean;

HasPoint2(): boolean;

// Returns true, if the connection is a point not coordinate system (for dimensional_size), if connection point for the first shape exists (for dimensional_location)
IsPointConnection(): boolean;

IsPointConnection2(): boolean;

// Set connection point (for dimensional_size), Set connection point for the first shape (for dimensional_location)
SetPoint(thePnt: gp_Pnt): void;

SetPoint2(thePnt: gp_Pnt): void;

// Set connection point as a coordinate system (for dimensional_size), Set connection point as a coordinate system for the first shape (for dimensional_location)
SetConnectionAxis(theAxis: gp_Ax2): void;

SetConnectionAxis2(theAxis: gp_Ax2): void;

// Get connection point (for dimensional_size), Get connection point for the first shape (for dimensional_location)
GetPoint(): gp_Pnt;

GetPoint2(): gp_Pnt;

// Get connection point as a coordinate system (for dimensional_size), Get connection point as a coordinate system for the first shape (for dimensional_location)
GetConnectionAxis(): gp_Ax2;

GetConnectionAxis2(): gp_Ax2;

// Returns connection name of the object
GetConnectionName(): TCollection_HAsciiString;

// Returns 2nd connection name of the object
GetConnectionName2(): TCollection_HAsciiString;

// Sets connection name of the object
SetConnectionName(theName: TCollection_HAsciiString): void;

// Sets 2nd connection name of the object
SetConnectionName2(theName: TCollection_HAsciiString): void;

// Set graphical presentation for the object
SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

// Returns graphical presentation of the object
GetPresentation(): TopoDS_Shape;

// Returns graphical presentation of the object
GetPresentationName(): TCollection_HAsciiString;

// Returns true, if the object has descriptions
HasDescriptions(): boolean;

// Returns number of descriptions
NbDescriptions(): number;

// Returns description with the given number
GetDescription(theNumber: number): TCollection_HAsciiString;

// Returns name of description with the given number
GetDescriptionName(theNumber: number): TCollection_HAsciiString;

// Remove description with the given number
RemoveDescription(theNumber: number): void;

// Add new description
AddDescription(theDescription: TCollection_HAsciiString, theName: TCollection_HAsciiString): void;

// Returns true if the dimension type is a location
static IsDimensionalLocation(theType: XCAFDimTolObjects_DimensionType): boolean;

// Returns true if the dimension type is a size
static IsDimensionalSize(theType: XCAFDimTolObjects_DimensionType): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines types of qualifier
XCAFDimTolObjects_DimensionQualifier: typeof XCAFDimTolObjects_DimensionQualifier[keyof typeof XCAFDimTolObjects_DimensionQualifier]

// Defines types of dimension
XCAFDimTolObjects_DimensionType: typeof XCAFDimTolObjects_DimensionType[keyof typeof XCAFDimTolObjects_DimensionType]

// Defines types of material requirement
XCAFDimTolObjects_GeomToleranceMatReqModif: typeof XCAFDimTolObjects_GeomToleranceMatReqModif[keyof typeof XCAFDimTolObjects_GeomToleranceMatReqModif]

// Defines modifirs
XCAFDimTolObjects_GeomToleranceModif: typeof XCAFDimTolObjects_GeomToleranceModif[keyof typeof XCAFDimTolObjects_GeomToleranceModif]

// Access object to store dimension and tolerance
XCAFDimTolObjects_GeomToleranceObject: declare class XCAFDimTolObjects_GeomToleranceObject extends Standard_Transient

constructor

// Returns semantic name
GetSemanticName(): TCollection_HAsciiString;

// Sets semantic name
SetSemanticName(theName: TCollection_HAsciiString): void;

// Sets type of the object
SetType(theType: XCAFDimTolObjects_GeomToleranceType): void;

// Returns type of the object
GetType(): XCAFDimTolObjects_GeomToleranceType;

// Sets type of tolerance value
SetTypeOfValue(theTypeOfValue: XCAFDimTolObjects_GeomToleranceTypeValue): void;

// Returns type of tolerance value
GetTypeOfValue(): XCAFDimTolObjects_GeomToleranceTypeValue;

// Sets tolerance value
SetValue(theValue: number): void;

// Returns tolerance value
GetValue(): number;

// Sets material requirement of the tolerance
SetMaterialRequirementModifier(theMatReqModif: XCAFDimTolObjects_GeomToleranceMatReqModif): void;

// Returns material requirement of the tolerance
GetMaterialRequirementModifier(): XCAFDimTolObjects_GeomToleranceMatReqModif;

// Sets tolerance zone
SetZoneModifier(theZoneModif: XCAFDimTolObjects_GeomToleranceZoneModif): void;

// Returns tolerance zone
GetZoneModifier(): XCAFDimTolObjects_GeomToleranceZoneModif;

// Sets value associated with tolerance zone
SetValueOfZoneModifier(theValue: number): void;

// Returns value associated with tolerance zone
GetValueOfZoneModifier(): number;

// Sets new sequence of tolerance modifiers
SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

// Adds a tolerance modifier to the sequence of modifiers
AddModifier(theModifier: XCAFDimTolObjects_GeomToleranceModif): void;

// Returns a sequence of modifiers of the tolerance
GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif;

// Sets the maximal upper tolerance value for tolerance with modifiers
SetMaxValueModifier(theModifier: number): void;

// Returns the maximal upper tolerance
GetMaxValueModifier(): number;

SetAxis(theAxis: gp_Ax2): void;

GetAxis(): gp_Ax2;

HasAxis(): boolean;

// Sets annotation plane
SetPlane(thePlane: gp_Ax2): void;

// Returns annotation plane
GetPlane(): gp_Ax2;

// Sets reference point
SetPoint(thePnt: gp_Pnt): void;

// Returns reference point
GetPoint(): gp_Pnt;

// Sets text position
SetPointTextAttach(thePntText: gp_Pnt): void;

// Returns the text position
GetPointTextAttach(): gp_Pnt;

// Returns True if the object has annotation plane
HasPlane(): boolean;

// Returns True if reference point is specified
HasPoint(): boolean;

// Returns True if text position is specified
HasPointText(): boolean;

// Set graphical presentation for object
SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

// Returns graphical presentation of the object
GetPresentation(): TopoDS_Shape;

// Returns graphical presentation of the object
GetPresentationName(): TCollection_HAsciiString;

HasAffectedPlane(): boolean;

GetAffectedPlaneType(): XCAFDimTolObjects_ToleranceZoneAffectedPlane;

SetAffectedPlaneType(theType: XCAFDimTolObjects_ToleranceZoneAffectedPlane): void;

// Sets affected plane
SetAffectedPlane(thePlane: gp_Pln): void;
SetAffectedPlane(thePlane: gp_Pln, theType: XCAFDimTolObjects_ToleranceZoneAffectedPlane): void;
SetAffectedPlane(thePlane: gp_Pln): void;
SetAffectedPlane(thePlane: gp_Pln, theType: XCAFDimTolObjects_ToleranceZoneAffectedPlane): void;

// Returns affected plane
GetAffectedPlane(): gp_Pln;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines types of geom tolerance
XCAFDimTolObjects_GeomToleranceType: typeof XCAFDimTolObjects_GeomToleranceType[keyof typeof XCAFDimTolObjects_GeomToleranceType]

// Defines types of value of tolerane
XCAFDimTolObjects_GeomToleranceTypeValue: typeof XCAFDimTolObjects_GeomToleranceTypeValue[keyof typeof XCAFDimTolObjects_GeomToleranceTypeValue]

// Defines types of zone
XCAFDimTolObjects_GeomToleranceZoneModif: typeof XCAFDimTolObjects_GeomToleranceZoneModif[keyof typeof XCAFDimTolObjects_GeomToleranceZoneModif]

// Defines types of tolerance zone affected plane
XCAFDimTolObjects_ToleranceZoneAffectedPlane: typeof XCAFDimTolObjects_ToleranceZoneAffectedPlane[keyof typeof XCAFDimTolObjects_ToleranceZoneAffectedPlane]

XCAFDimTolObjects_Tool: declare class XCAFDimTolObjects_Tool

constructor

// Returns a sequence of Dimensions currently stored in the GD&T table
GetDimensions(theDimensionObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;
// theDimensionObjectSequence: Mutated in place

// Returns all Dimensions defined for Shape
GetRefDimensions(theShape: TopoDS_Shape, theDimensions: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): boolean;
// theDimensions: Mutated in place

// Returns a sequence of Tolerances currently stored in the GD&T table
GetGeomTolerances(theGeomToleranceObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject, theDatumObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject, theMap: NCollection_DataMap_handle_XCAFDimTolObjects_GeomToleranceObject_handle_XCAFDimTolObjects_DatumObject): void;
// theGeomToleranceObjectSequence: Mutated in place
// theDatumObjectSequence: Mutated in place
// theMap: Mutated in place

// Returns all GeomTolerances defined for Shape
GetRefGeomTolerances(theShape: TopoDS_Shape, theGeomToleranceObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject, theDatumObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject, theMap: NCollection_DataMap_handle_XCAFDimTolObjects_GeomToleranceObject_handle_XCAFDimTolObjects_DatumObject): boolean;
// theGeomToleranceObjectSequence: Mutated in place
// theDatumObjectSequence: Mutated in place
// theMap: Mutated in place

// Returns DatumObject defined for Shape
GetRefDatum(theShape: TopoDS_Shape): { returnValue: boolean; theDatum: XCAFDimTolObjects_DatumObject; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

XCAFDimTolObjects_DatumModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif

XCAFDimTolObjects_DimensionModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_DimensionModif

XCAFDimTolObjects_GeomToleranceModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif
