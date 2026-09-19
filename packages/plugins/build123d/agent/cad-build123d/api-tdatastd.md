# build123d — TDataStd

1 top-level symbols. Signatures are verbatim python.

// Used to define a name attribute containing a string which specifies the name.Used to define a name attribute containing a string which specifies the name.Used to define a name attribute containing a string which specifies the name
TDataStd_Name

  // __init__(self
  __init__(self: OCP.OCP.TDataStd.TDataStd_Name) -> None

  // Set(self
  Set(self: OCP.OCP.TDataStd.TDataStd_Name, S: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // SetID(*args, **kwargs)
  SetID(*args, **kwargs)
  SetID(self: OCP.OCP.TDataStd.TDataStd_Name, guid: OCP.OCP.Standard.Standard_GUID) -> None
  SetID(self: OCP.OCP.TDataStd.TDataStd_Name) -> None

  // Dump(self
  Dump(self: OCP.OCP.TDataStd.TDataStd_Name, anOS: io.BytesIO) -> io.BytesIO

  // NewEmpty(self
  NewEmpty(self: OCP.OCP.TDataStd.TDataStd_Name) -> OCP.OCP.TDF.TDF_Attribute

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // Set_s(*args, **kwargs)
  Set_s(*args, **kwargs)
  Set_s(label: OCP.OCP.TDF.TDF_Label, string: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TDataStd.TDataStd_Name
  Set_s(label: OCP.OCP.TDF.TDF_Label, guid: OCP.OCP.Standard.Standard_GUID, string: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TDataStd.TDataStd_Name

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.TDataStd.TDataStd_Name) -> OCP.OCP.Standard.Standard_Type
