# libcascade — TopLoc

5 top-level symbols. Signatures are verbatim typescript.

TopLoc_Datum3D: declare class TopLoc_Datum3D extends Standard_Transient

  // TopLoc_Datum3D.constructor (constructor)
  constructor();
  constructor(T: gp_Trsf);

  // TopLoc_Datum3D.Transformation (method)
  Transformation(): gp_Trsf;

  // TopLoc_Datum3D.Trsf (method)
  Trsf(): gp_Trsf;

  // TopLoc_Datum3D.Form (method)
  Form(): gp_TrsfForm;

  // TopLoc_Datum3D.get_type_name (method)
  static get_type_name(): string;

  // TopLoc_Datum3D.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopLoc_Datum3D.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopLoc_Datum3D.delete (method)
  delete(): void;

  // TopLoc_Datum3D.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopLoc_ItemLocation: declare class TopLoc_ItemLocation

  // TopLoc_ItemLocation.constructor (constructor)
  constructor(D: TopLoc_Datum3D, P: number);

  // TopLoc_ItemLocation.delete (method)
  delete(): void;

  // TopLoc_ItemLocation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopLoc_Location: declare class TopLoc_Location

  // TopLoc_Location.constructor (constructor)
  constructor();
  constructor(theOther: TopLoc_Location);
  constructor(T: gp_Trsf);
  constructor(D: TopLoc_Datum3D);

  // TopLoc_Location.IsIdentity (method)
  IsIdentity(): boolean;

  // TopLoc_Location.Identity (method)
  Identity(): void;

  // TopLoc_Location.FirstDatum (method)
  FirstDatum(): TopLoc_Datum3D;

  // TopLoc_Location.FirstPower (method)
  FirstPower(): number;

  // TopLoc_Location.NextLocation (method)
  NextLocation(): TopLoc_Location;

  // TopLoc_Location.Transformation (method)
  Transformation(): gp_Trsf;

  // TopLoc_Location.Inverted (method)
  Inverted(): TopLoc_Location;

  // TopLoc_Location.Multiplied (method)
  Multiplied(Other: TopLoc_Location): TopLoc_Location;

  // TopLoc_Location.Divided (method)
  Divided(Other: TopLoc_Location): TopLoc_Location;

  // TopLoc_Location.Predivided (method)
  Predivided(Other: TopLoc_Location): TopLoc_Location;

  // TopLoc_Location.Powered (method)
  Powered(pwr: number): TopLoc_Location;

  // TopLoc_Location.HashCode (method)
  HashCode(): number;

  // TopLoc_Location.IsEqual (method)
  IsEqual(theOther: TopLoc_Location): boolean;

  // TopLoc_Location.IsDifferent (method)
  IsDifferent(theOther: TopLoc_Location): boolean;

  // TopLoc_Location.Clear (method)
  Clear(): void;

  // TopLoc_Location.ScalePrec (method)
  static ScalePrec(): number;

  // TopLoc_Location.delete (method)
  delete(): void;

  // TopLoc_Location.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopLoc_SListNodeOfItemLocation: declare class TopLoc_SListNodeOfItemLocation extends Standard_Transient

  // TopLoc_SListNodeOfItemLocation.constructor (constructor)
  constructor(I: TopLoc_ItemLocation, aTail: TopLoc_SListOfItemLocation);

  // TopLoc_SListNodeOfItemLocation.Tail (method)
  Tail(): TopLoc_SListOfItemLocation;

  // TopLoc_SListNodeOfItemLocation.Value (method)
  Value(): TopLoc_ItemLocation;

  // TopLoc_SListNodeOfItemLocation.get_type_name (method)
  static get_type_name(): string;

  // TopLoc_SListNodeOfItemLocation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TopLoc_SListNodeOfItemLocation.DynamicType (method)
  DynamicType(): Standard_Type;

  // TopLoc_SListNodeOfItemLocation.delete (method)
  delete(): void;

  // TopLoc_SListNodeOfItemLocation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopLoc_SListOfItemLocation: declare class TopLoc_SListOfItemLocation

  // TopLoc_SListOfItemLocation.constructor (constructor)
  constructor();
  constructor(Other: TopLoc_SListOfItemLocation);
  constructor(anItem: TopLoc_ItemLocation, aTail: TopLoc_SListOfItemLocation);

  // TopLoc_SListOfItemLocation.Assign (method)
  Assign(Other: TopLoc_SListOfItemLocation): TopLoc_SListOfItemLocation;

  // TopLoc_SListOfItemLocation.IsEmpty (method)
  IsEmpty(): boolean;

  // TopLoc_SListOfItemLocation.Clear (method)
  Clear(): void;

  // TopLoc_SListOfItemLocation.Value (method)
  Value(): TopLoc_ItemLocation;

  // TopLoc_SListOfItemLocation.Tail (method)
  Tail(): TopLoc_SListOfItemLocation;

  // TopLoc_SListOfItemLocation.Construct (method)
  Construct(anItem: TopLoc_ItemLocation): void;

  // TopLoc_SListOfItemLocation.ToTail (method)
  ToTail(): void;

  // TopLoc_SListOfItemLocation.More (method)
  More(): boolean;

  // TopLoc_SListOfItemLocation.Next (method)
  Next(): void;

  // TopLoc_SListOfItemLocation.delete (method)
  delete(): void;

  // TopLoc_SListOfItemLocation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
