# libcascade — TopLoc

5 top-level symbols. Signatures are verbatim typescript.

// Describes a coordinate transformation, i.e
TopLoc_Datum3D: declare class TopLoc_Datum3D extends Standard_Transient

constructor

// Returns a {@link gp_Trsf`gp_Trsf`} which, when applied to this datum, produces the default datum
Transformation(): gp_Trsf;

// Returns a {@link gp_Trsf`gp_Trsf`} which, when applied to this datum, produces the default datum
Trsf(): gp_Trsf;

// Return transformation form
Form(): gp_TrsfForm;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An ItemLocation is an elementary coordinate system in a Location
TopLoc_ItemLocation: declare class TopLoc_ItemLocation

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Location is a composite transition
TopLoc_Location: declare class TopLoc_Location

constructor

// Returns true if this location is equal to the Identity transformation
IsIdentity(): boolean;

// Resets this location to the Identity transformation
Identity(): void;

// Returns the first elementary datum of the Location
FirstDatum(): TopLoc_Datum3D;

// Returns the power elevation of the first elementary datum
FirstPower(): number;

// Returns a Location representing <me> without the first datum
NextLocation(): TopLoc_Location;

// Returns the transformation associated to the coordinate system
Transformation(): gp_Trsf;

// Returns the inverse of <me>
Inverted(): TopLoc_Location;

// Returns <me> \* <Other>, the elementary datums are concatenated
Multiplied(Other: TopLoc_Location): TopLoc_Location;

// Returns <me> / <Other>
Divided(Other: TopLoc_Location): TopLoc_Location;

// Returns <Other>.`Inverted()` \* <me>
Predivided(Other: TopLoc_Location): TopLoc_Location;

// Returns me at the power <pwr>
Powered(pwr: number): TopLoc_Location;

// Returns a hashed value for this local coordinate system
HashCode(): number;

// Returns true if this location and the location Other have the same elementary data, i.e
IsEqual(theOther: TopLoc_Location): boolean;

// Returns true if this location and the location Other do not have the same elementary data, i.e
IsDifferent(theOther: TopLoc_Location): boolean;

// Clear myItems
Clear(): void;

static ScalePrec(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TopLoc_SListNodeOfItemLocation: declare class TopLoc_SListNodeOfItemLocation extends Standard_Transient

constructor

Tail(): TopLoc_SListOfItemLocation;

Value(): TopLoc_ItemLocation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An SListOfItemLocation is a LISP like list of Items
TopLoc_SListOfItemLocation: declare class TopLoc_SListOfItemLocation

constructor

// Sets a list from an other one
Assign(Other: TopLoc_SListOfItemLocation): TopLoc_SListOfItemLocation;

// Return true if this list is empty
IsEmpty(): boolean;

// Sets the list to be empty
Clear(): void;

// Returns the current value of the list
Value(): TopLoc_ItemLocation;

// Returns the current tail of the list
Tail(): TopLoc_SListOfItemLocation;

// Replaces the list by a list with <anItem> as Value and the list <me> as tail
Construct(anItem: TopLoc_ItemLocation): void;

// Replaces the list <me> by its tail
ToTail(): void;

// Returns True if the iterator has a current value
More(): boolean;

// Moves the iterator to the next object in the list
Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
