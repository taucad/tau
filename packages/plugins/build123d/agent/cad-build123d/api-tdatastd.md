# build123d — TDataStd

1 top-level symbols. Signatures are verbatim python.

// Used to define a name attribute containing a string which specifies the name.Used to define a name attribute containing a string which specifies the name.Used to define a name attribute containing a string which specifies the name
TDataStd_Name

  // __init__(self
  // OCP.OCP.TDataStd.TDataStd_Name.__init__ (constructor)
  __init__(self: OCP.OCP.TDataStd.TDataStd_Name) -> None

  // Set(self
  // OCP.OCP.TDataStd.TDataStd_Name.Set (method)
  Set(self: OCP.OCP.TDataStd.TDataStd_Name, S: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // SetID(*args, **kwargs)
  // OCP.OCP.TDataStd.TDataStd_Name.SetID (method)
  SetID(*args, **kwargs)
  SetID(self: OCP.OCP.TDataStd.TDataStd_Name, guid: OCP.OCP.Standard.Standard_GUID) -> None
  SetID(self: OCP.OCP.TDataStd.TDataStd_Name) -> None

  // Dump(self
  // OCP.OCP.TDataStd.TDataStd_Name.Dump (method)
  Dump(self: OCP.OCP.TDataStd.TDataStd_Name, anOS: io.BytesIO) -> io.BytesIO

  // NewEmpty(self
  // OCP.OCP.TDataStd.TDataStd_Name.NewEmpty (method)
  NewEmpty(self: OCP.OCP.TDataStd.TDataStd_Name) -> OCP.OCP.TDF.TDF_Attribute

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  // OCP.OCP.TDataStd.TDataStd_Name.GetID_s (method)
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // Set_s(*args, **kwargs)
  // OCP.OCP.TDataStd.TDataStd_Name.Set_s (method)
  Set_s(*args, **kwargs)
  Set_s(label: OCP.OCP.TDF.TDF_Label, string: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TDataStd.TDataStd_Name
  Set_s(label: OCP.OCP.TDF.TDF_Label, guid: OCP.OCP.Standard.Standard_GUID, string: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TDataStd.TDataStd_Name

  // get_type_name_s() -> str
  // OCP.OCP.TDataStd.TDataStd_Name.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.TDataStd.TDataStd_Name.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.TDataStd.TDataStd_Name.DynamicType (method)
  DynamicType(self: OCP.OCP.TDataStd.TDataStd_Name) -> OCP.OCP.Standard.Standard_Type
