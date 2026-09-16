# build123d — Interface

1 top-level symbols. Signatures are verbatim python.

// This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures.This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures.This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures
Interface_Static

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Interface.Interface_Static, family: str, name: str, type: OCP.OCP.Interface.Interface_ParamType = <Interface_ParamType.Interface_ParamText: 5>, init: str = '') -> None
  __init__(self: OCP.OCP.Interface.Interface_Static, family: str, name: str, other: OCP.OCP.Interface.Interface_Static) -> None

  // PrintStatic(self
  PrintStatic(self: OCP.OCP.Interface.Interface_Static, S: io.BytesIO) -> None

  // Family(self
  Family(self: OCP.OCP.Interface.Interface_Static) -> str

  // SetWild(self
  SetWild(self: OCP.OCP.Interface.Interface_Static, wildcard: OCP.OCP.Interface.Interface_Static) -> None

  // Wild(self
  Wild(self: OCP.OCP.Interface.Interface_Static) -> OCP.OCP.Interface.Interface_Static

  // SetUptodate(self
  SetUptodate(self: OCP.OCP.Interface.Interface_Static) -> None

  // UpdatedStatus(self
  UpdatedStatus(self: OCP.OCP.Interface.Interface_Static) -> bool

  // Init_s(*args, **kwargs)
  Init_s(*args, **kwargs)
  Init_s(family: str, name: str, type: OCP.OCP.Interface.Interface_ParamType, init: str = '') -> bool
  Init_s(family: str, name: str, type: str, init: str = '') -> bool

  // Static_s(name
  Static_s(name: str) -> OCP.OCP.Interface.Interface_Static

  // IsPresent_s(name
  IsPresent_s(name: str) -> bool

  // CDef_s(name
  CDef_s(name: str, part: str) -> str

  // IDef_s(name
  IDef_s(name: str, part: str) -> int

  // IsSet_s(name
  IsSet_s(name: str, proper: bool = True) -> bool

  // CVal_s(name
  CVal_s(name: str) -> str

  // IVal_s(name
  IVal_s(name: str) -> int

  // RVal_s(name
  RVal_s(name: str) -> float

  // SetCVal_s(name
  SetCVal_s(name: str, val: str) -> bool

  // SetIVal_s(name
  SetIVal_s(name: str, val: int) -> bool

  // SetRVal_s(name
  SetRVal_s(name: str, val: float) -> bool

  // Update_s(name
  Update_s(name: str) -> bool

  // IsUpdated_s(name
  IsUpdated_s(name: str) -> bool

  // Items_s(mode
  Items_s(mode: int = 0, criter: str = '') -> OCP.OCP.TColStd.TColStd_HSequenceOfHAsciiString

  // Standards_s() -> None
  Standards_s() -> None

  // FillMap_s(theMap
  FillMap_s(theMap: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.Interface.Interface_Static) -> OCP.OCP.Standard.Standard_Type
