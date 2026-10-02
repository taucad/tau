# build123d — XCAFApp

1 top-level symbols. Signatures are verbatim python.

// Category: XCAFApp
// Implements an Application for the DECAF documentsImplements an Application for the DECAF documentsImplements an Application for the DECAF documents
XCAFApp_Application

  // Initialize self
  XCAFApp_Application(*args, **kwargs)

  // ResourcesName(self
  // Remarks: methods from TDocStd_Application ================================
  ResourcesName(self: OCP.OCP.XCAFApp.XCAFApp_Application) -> str

  // InitDocument(self
  // Remarks: Set XCAFDoc_DocumentTool attribute
  InitDocument(self: OCP.OCP.XCAFApp.XCAFApp_Application, aDoc: OCP.OCP.CDM.CDM_Document) -> None

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.XCAFApp.XCAFApp_Application, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // GetApplication_s() -> OCP.OCP.XCAFApp.XCAFApp_Application
  // Remarks: Initializes (for the first time) and returns the static object (XCAFApp_Application) This is the only valid method to get XCAFApp_Application object, and it should be called at least once before any actions with documents in order to init application
  GetApplication_s() -> OCP.OCP.XCAFApp.XCAFApp_Application

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.XCAFApp.XCAFApp_Application) -> OCP.OCP.Standard.Standard_Type
