# build123d — XCAFApp

1 top-level symbols. Signatures are verbatim python.

// Implements an Application for the DECAF documentsImplements an Application for the DECAF documentsImplements an Application for the DECAF documents
XCAFApp_Application

  // Initialize self
  XCAFApp_Application(*args, **kwargs)

  // ResourcesName(self
  ResourcesName(self: OCP.OCP.XCAFApp.XCAFApp_Application) -> str

  // InitDocument(self
  InitDocument(self: OCP.OCP.XCAFApp.XCAFApp_Application, aDoc: OCP.OCP.CDM.CDM_Document) -> None

  // DumpJson(self
  DumpJson(self: OCP.OCP.XCAFApp.XCAFApp_Application, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // GetApplication_s() -> OCP.OCP.XCAFApp.XCAFApp_Application
  GetApplication_s() -> OCP.OCP.XCAFApp.XCAFApp_Application

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.XCAFApp.XCAFApp_Application) -> OCP.OCP.Standard.Standard_Type
