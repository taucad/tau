# build123d — Interface

1 top-level symbols. Signatures are verbatim python.

// Category: Interface
// This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures.This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures.This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures
Interface_Static

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.Interface.Interface_Static, family: str, name: str, type: OCP.OCP.Interface.Interface_ParamType = <Interface_ParamType.Interface_ParamText: 5>, init: str = '') -> None 2. __init__(self: OCP.OCP.Interface.Interface_Static, family: str, name: str, other: OCP.OCP.Interface.Interface_Static) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Interface.Interface_Static, family: str, name: str, type: OCP.OCP.Interface.Interface_ParamType = <Interface_ParamType.Interface_ParamText: 5>, init: str = '') -> None
  __init__(self: OCP.OCP.Interface.Interface_Static, family: str, name: str, other: OCP.OCP.Interface.Interface_Static) -> None

  // PrintStatic(self
  // Remarks: Writes the properties of a parameter in the diagnostic file. These include: - Name - Family, - Wildcard (if it has one) - Current status (empty string if it was updated or if it is the original one) - Value
  PrintStatic(self: OCP.OCP.Interface.Interface_Static, S: io.BytesIO) -> None

  // Family(self
  // Remarks: Returns the family. It can be : a resource name for applis, an internal name between : $e (environment variables), $l (other, purely local)
  Family(self: OCP.OCP.Interface.Interface_Static) -> str

  // SetWild(self
  // Remarks: Sets a "wild-card" static : its value will be considered if <me> is not properly set. (reset by set a null one)
  SetWild(self: OCP.OCP.Interface.Interface_Static, wildcard: OCP.OCP.Interface.Interface_Static) -> None

  // Wild(self
  // Remarks: Returns the wildcard static, which can be (is most often) null
  Wild(self: OCP.OCP.Interface.Interface_Static) -> OCP.OCP.Interface.Interface_Static

  // SetUptodate(self
  // Remarks: Records a Static has "uptodate", i.e. its value has been taken into account by a reinitialisation procedure This flag is reset at each successful SetValue
  SetUptodate(self: OCP.OCP.Interface.Interface_Static) -> None

  // UpdatedStatus(self
  // Remarks: Returns the status "uptodate"
  UpdatedStatus(self: OCP.OCP.Interface.Interface_Static) -> bool

  // Init_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Init_s(family: str, name: str, type: OCP.OCP.Interface.Interface_ParamType, init: str = '') -> bool Declares a new Static (by calling its constructor) If this name is already taken, does nothing and returns False Else, creates it and returns True For additional definitions, get the Static then edit it 2. Init_s(family: str, name: str, type: str, init: str = '') -> bool As Init with ParamType, but type is given as a character This allows a simpler call Types : 'i' Integer, 'r' Real, 't' Text, 'e' Enum, 'o' Object '=' for same definition as, <init> gives the initial Static Returns False if <type> does not match this list
  Init_s(*args, **kwargs)
  Init_s(family: str, name: str, type: OCP.OCP.Interface.Interface_ParamType, init: str = '') -> bool
  Init_s(family: str, name: str, type: str, init: str = '') -> bool

  // Static_s(name
  // Remarks: Returns a Static from its name. Null Handle if not present
  Static_s(name: str) -> OCP.OCP.Interface.Interface_Static

  // IsPresent_s(name
  // Remarks: Returns True if a Static named <name> is present, False else
  IsPresent_s(name: str) -> bool

  // CDef_s(name
  // Remarks: Returns a part of the definition of a Static, as a CString The part is designated by its name, as a CString If the required value is not a string, it is converted to a CString then returned If <name> is not present, or <part> not defined for <name>, this function returns an empty string
  CDef_s(name: str, part: str) -> str

  // IDef_s(name
  // Remarks: Returns a part of the definition of a Static, as an Integer The part is designated by its name, as a CString If the required value is not a string, returns zero For a Boolean, 0 for false, 1 for true If <name> is not present, or <part> not defined for <name>, this function returns zero
  IDef_s(name: str, part: str) -> int

  // IsSet_s(name
  // Remarks: Returns True if <name> is present AND set <proper> True (D) : considers this item only <proper> False : if not set and attached to a wild-card, considers this wild-card
  IsSet_s(name: str, proper: bool = True) -> bool

  // CVal_s(name
  // Remarks: Returns the value of the parameter identified by the string name. If the specified parameter does not exist, an empty string is returned. Example Interface_Static::CVal("write.step.schema"); which could return: "AP214"
  CVal_s(name: str) -> str

  // IVal_s(name
  // Remarks: Returns the integer value of the translation parameter identified by the string name. Returns the value 0 if the parameter does not exist. Example Interface_Static::IVal("write.step.schema"); which could return: 3
  IVal_s(name: str) -> int

  // RVal_s(name
  // Remarks: Returns the value of a static translation parameter identified by the string name. Returns the value 0.0 if the parameter does not exist.
  RVal_s(name: str) -> float

  // SetCVal_s(name
  // Remarks: Modifies the value of the parameter identified by name. The modification is specified by the string val. false is returned if the parameter does not exist. Example Interface_Static::SetCVal ("write.step.schema","AP203") This syntax specifies a switch from the default STEP 214 mode to STEP 203 mode.
  SetCVal_s(name: str, val: str) -> bool

  // SetIVal_s(name
  // Remarks: Modifies the value of the parameter identified by name. The modification is specified by the integer value val. false is returned if the parameter does not exist. Example Interface_Static::SetIVal ("write.step.schema", 3) This syntax specifies a switch from the default STEP 214 mode to STEP 203 mode.S
  SetIVal_s(name: str, val: int) -> bool

  // SetRVal_s(name
  // Remarks: Modifies the value of a translation parameter. false is returned if the parameter does not exist. The modification is specified by the real number value val.
  SetRVal_s(name: str, val: float) -> bool

  // Update_s(name
  // Remarks: Sets a Static to be "uptodate" Returns False if <name> is not present This status can be used by a reinitialisation procedure to rerun if a value has been changed
  Update_s(name: str) -> bool

  // IsUpdated_s(name
  // Remarks: Returns the status "uptodate" from a Static Returns False if <name> is not present
  IsUpdated_s(name: str) -> bool

  // Items_s(mode
  // Remarks: Returns a list of names of statics : <mode> = 0 (D) : criter is for family <mode> = 1 : criter is regexp on names, takes final items (ignore wild cards) <mode> = 2 : idem but take only wilded, not final items <mode> = 3 : idem, take all items matching criter idem + 100 : takes only non-updated items idem + 200 : takes only updated items criter empty (D) : returns all names else returns names which match the given criter Remark : families beginning by '$' are not listed by criter "" they are listed only by criter "$"
  Items_s(mode: int = 0, criter: str = '') -> OCP.OCP.TColStd.TColStd_HSequenceOfHAsciiString

  // Standards_s() -> None
  // Remarks: Initializes all standard static parameters, which can be used by every function. statics specific of a norm or a function must be defined around it
  Standards_s() -> None

  // FillMap_s(theMap
  // Remarks: Fills given string-to-string map with all static data
  FillMap_s(theMap: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.Interface.Interface_Static) -> OCP.OCP.Standard.Standard_Type
