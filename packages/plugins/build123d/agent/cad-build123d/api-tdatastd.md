# build123d — TDataStd

1 top-level symbols. Signatures are verbatim python.

// Category: TDataStd
// Used to define a name attribute containing a string which specifies the name.Used to define a name attribute containing a string which specifies the name.Used to define a name attribute containing a string which specifies the name
TDataStd_Name

  // __init__(self
  __init__(self: OCP.OCP.TDataStd.TDataStd_Name) -> None

  // Set(self
  // Remarks: Sets <S> as name. Raises if <S> is not a valid name.
  Set(self: OCP.OCP.TDataStd.TDataStd_Name, S: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // SetID(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetID(self: OCP.OCP.TDataStd.TDataStd_Name, guid: OCP.OCP.Standard.Standard_GUID) -> None

Sets the explicit user defined GUID to the attribute.

2. SetID(self: OCP.OCP.TDataStd.TDataStd_Name) -> None

Sets default GUID for the attribute.
  SetID(*args, **kwargs)
  SetID(self: OCP.OCP.TDataStd.TDataStd_Name, guid: OCP.OCP.Standard.Standard_GUID) -> None
  SetID(self: OCP.OCP.TDataStd.TDataStd_Name) -> None

  // Dump(self
  Dump(self: OCP.OCP.TDataStd.TDataStd_Name, anOS: io.BytesIO) -> io.BytesIO

  // NewEmpty(self
  NewEmpty(self: OCP.OCP.TDataStd.TDataStd_Name) -> OCP.OCP.TDF.TDF_Attribute

  // GetID_s() -> OCP.OCP.Standard.Standard_GUID
  // Remarks: class methods working on the name itself ======================================== Returns the GUID for name attributes.
  GetID_s() -> OCP.OCP.Standard.Standard_GUID

  // Set_s(*args, **kwargs)
  // Remarks: Overloaded function.

1. Set_s(label: OCP.OCP.TDF.TDF_Label, string: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TDataStd.TDataStd_Name

Creates (if does not exist) and sets the name in the name attribute. from any label <L> search in father labels (L is not concerned) the first name attribute.if found set it in <father>. class methods working on the name tree ====================================== Search in the whole TDF_Data the Name attribute which fit with <fullPath>. Returns True if found. Search under <currentLabel> a label which fit with <name>. Returns True if found. Shortcut which avoids building a ListOfExtendedStrin. Search in the whole TDF_Data the label which fit with name Returns True if found. tools methods to translate path <-> pathlist =========================================== move to draw For Draw test we may provide this tool method which convert a path in a sequence of string to call after the FindLabel methods. Example: if it's given "Assembly:Part_1:Sketch_5" it will return in <pathlist> the list of 3 strings: "Assembly","Part_1","Sketch_5". move to draw from <pathlist> build the string path Name methods ============

2. Set_s(label: OCP.OCP.TDF.TDF_Label, guid: OCP.OCP.Standard.Standard_GUID, string: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TDataStd.TDataStd_Name

Finds, or creates, a Name attribute with explicit user defined <guid> and sets <string>. The Name attribute is returned.
  Set_s(*args, **kwargs)
  Set_s(label: OCP.OCP.TDF.TDF_Label, string: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TDataStd.TDataStd_Name
  Set_s(label: OCP.OCP.TDF.TDF_Label, guid: OCP.OCP.Standard.Standard_GUID, string: OCP.OCP.TCollection.TCollection_ExtendedString) -> OCP.OCP.TDataStd.TDataStd_Name

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.TDataStd.TDataStd_Name) -> OCP.OCP.Standard.Standard_Type
