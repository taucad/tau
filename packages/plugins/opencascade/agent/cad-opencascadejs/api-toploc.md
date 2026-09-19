# libcascade — TopLoc

5 top-level symbols. Signatures are verbatim typescript.

TopLoc_Datum3D: declare class TopLoc_Datum3D extends Standard_Transient

  constructor

  Transformation(): gp_Trsf;

  Trsf(): gp_Trsf;

  Form(): gp_TrsfForm;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopLoc_ItemLocation: declare class TopLoc_ItemLocation

  constructor

  delete(): void;

  [Symbol.dispose](): void;

TopLoc_Location: declare class TopLoc_Location

  constructor

  IsIdentity(): boolean;

  Identity(): void;

  FirstDatum(): TopLoc_Datum3D;

  FirstPower(): number;

  NextLocation(): TopLoc_Location;

  Transformation(): gp_Trsf;

  Inverted(): TopLoc_Location;

  Multiplied(Other: TopLoc_Location): TopLoc_Location;

  Divided(Other: TopLoc_Location): TopLoc_Location;

  Predivided(Other: TopLoc_Location): TopLoc_Location;

  Powered(pwr: number): TopLoc_Location;

  HashCode(): number;

  IsEqual(theOther: TopLoc_Location): boolean;

  IsDifferent(theOther: TopLoc_Location): boolean;

  Clear(): void;

  static ScalePrec(): number;

  delete(): void;

  [Symbol.dispose](): void;

TopLoc_SListNodeOfItemLocation: declare class TopLoc_SListNodeOfItemLocation extends Standard_Transient

  constructor

  Tail(): TopLoc_SListOfItemLocation;

  Value(): TopLoc_ItemLocation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TopLoc_SListOfItemLocation: declare class TopLoc_SListOfItemLocation

  constructor

  Assign(Other: TopLoc_SListOfItemLocation): TopLoc_SListOfItemLocation;

  IsEmpty(): boolean;

  Clear(): void;

  Value(): TopLoc_ItemLocation;

  Tail(): TopLoc_SListOfItemLocation;

  Construct(anItem: TopLoc_ItemLocation): void;

  ToTail(): void;

  More(): boolean;

  Next(): void;

  delete(): void;

  [Symbol.dispose](): void;
