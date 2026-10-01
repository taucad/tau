# build123d — Interface

1 top-level symbols. Signatures are verbatim python.

// This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures.This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures.This class gives a way to manage meaningful static variables, used as "global" parameters in various procedures
Interface_Static

  // __init__(*args, **kwargs)
  // OCP.OCP.Interface.Interface_Static.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Interface.Interface_Static, family: str, name: str, type: OCP.OCP.Interface.Interface_ParamType = <Interface_ParamType.Interface_ParamText: 5>, init: str = '') -> None
  __init__(self: OCP.OCP.Interface.Interface_Static, family: str, name: str, other: OCP.OCP.Interface.Interface_Static) -> None

  // PrintStatic(self
  // OCP.OCP.Interface.Interface_Static.PrintStatic (method)
  PrintStatic(self: OCP.OCP.Interface.Interface_Static, S: io.BytesIO) -> None

  // Family(self
  // OCP.OCP.Interface.Interface_Static.Family (method)
  Family(self: OCP.OCP.Interface.Interface_Static) -> str

  // SetWild(self
  // OCP.OCP.Interface.Interface_Static.SetWild (method)
  SetWild(self: OCP.OCP.Interface.Interface_Static, wildcard: OCP.OCP.Interface.Interface_Static) -> None

  // Wild(self
  // OCP.OCP.Interface.Interface_Static.Wild (method)
  Wild(self: OCP.OCP.Interface.Interface_Static) -> OCP.OCP.Interface.Interface_Static

  // SetUptodate(self
  // OCP.OCP.Interface.Interface_Static.SetUptodate (method)
  SetUptodate(self: OCP.OCP.Interface.Interface_Static) -> None

  // UpdatedStatus(self
  // OCP.OCP.Interface.Interface_Static.UpdatedStatus (method)
  UpdatedStatus(self: OCP.OCP.Interface.Interface_Static) -> bool

  // Init_s(*args, **kwargs)
  // OCP.OCP.Interface.Interface_Static.Init_s (method)
  Init_s(*args, **kwargs)
  Init_s(family: str, name: str, type: OCP.OCP.Interface.Interface_ParamType, init: str = '') -> bool
  Init_s(family: str, name: str, type: str, init: str = '') -> bool

  // Static_s(name
  // OCP.OCP.Interface.Interface_Static.Static_s (method)
  Static_s(name: str) -> OCP.OCP.Interface.Interface_Static

  // IsPresent_s(name
  // OCP.OCP.Interface.Interface_Static.IsPresent_s (method)
  IsPresent_s(name: str) -> bool

  // CDef_s(name
  // OCP.OCP.Interface.Interface_Static.CDef_s (method)
  CDef_s(name: str, part: str) -> str

  // IDef_s(name
  // OCP.OCP.Interface.Interface_Static.IDef_s (method)
  IDef_s(name: str, part: str) -> int

  // IsSet_s(name
  // OCP.OCP.Interface.Interface_Static.IsSet_s (method)
  IsSet_s(name: str, proper: bool = True) -> bool

  // CVal_s(name
  // OCP.OCP.Interface.Interface_Static.CVal_s (method)
  CVal_s(name: str) -> str

  // IVal_s(name
  // OCP.OCP.Interface.Interface_Static.IVal_s (method)
  IVal_s(name: str) -> int

  // RVal_s(name
  // OCP.OCP.Interface.Interface_Static.RVal_s (method)
  RVal_s(name: str) -> float

  // SetCVal_s(name
  // OCP.OCP.Interface.Interface_Static.SetCVal_s (method)
  SetCVal_s(name: str, val: str) -> bool

  // SetIVal_s(name
  // OCP.OCP.Interface.Interface_Static.SetIVal_s (method)
  SetIVal_s(name: str, val: int) -> bool

  // SetRVal_s(name
  // OCP.OCP.Interface.Interface_Static.SetRVal_s (method)
  SetRVal_s(name: str, val: float) -> bool

  // Update_s(name
  // OCP.OCP.Interface.Interface_Static.Update_s (method)
  Update_s(name: str) -> bool

  // IsUpdated_s(name
  // OCP.OCP.Interface.Interface_Static.IsUpdated_s (method)
  IsUpdated_s(name: str) -> bool

  // Items_s(mode
  // OCP.OCP.Interface.Interface_Static.Items_s (method)
  Items_s(mode: int = 0, criter: str = '') -> OCP.OCP.TColStd.TColStd_HSequenceOfHAsciiString

  // Standards_s() -> None
  // OCP.OCP.Interface.Interface_Static.Standards_s (method)
  Standards_s() -> None

  // FillMap_s(theMap
  // OCP.OCP.Interface.Interface_Static.FillMap_s (method)
  FillMap_s(theMap: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None

  // get_type_name_s() -> str
  // OCP.OCP.Interface.Interface_Static.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.Interface.Interface_Static.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.Interface.Interface_Static.DynamicType (method)
  DynamicType(self: OCP.OCP.Interface.Interface_Static) -> OCP.OCP.Standard.Standard_Type
