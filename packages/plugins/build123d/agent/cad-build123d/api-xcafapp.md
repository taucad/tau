# build123d — XCAFApp

1 top-level symbols. Signatures are verbatim python.

// Category: XCAFApp
// Implements an Application for the DECAF documentsImplements an Application for the DECAF documentsImplements an Application for the DECAF documents
XCAFApp_Application

  // Initialize self
  // OCP.OCP.XCAFApp.XCAFApp_Application.__init__ (constructor)
  XCAFApp_Application(*args, **kwargs)

  // ResourcesName(self
  // Remarks: methods from TDocStd_Application ================================
  // OCP.OCP.XCAFApp.XCAFApp_Application.ResourcesName (method)
  ResourcesName(self: OCP.OCP.XCAFApp.XCAFApp_Application) -> str

  // InitDocument(self
  // Remarks: Set XCAFDoc_DocumentTool attribute
  // OCP.OCP.XCAFApp.XCAFApp_Application.InitDocument (method)
  InitDocument(self: OCP.OCP.XCAFApp.XCAFApp_Application, aDoc: OCP.OCP.CDM.CDM_Document) -> None

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.XCAFApp.XCAFApp_Application.DumpJson (method)
  DumpJson(self: OCP.OCP.XCAFApp.XCAFApp_Application, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // GetApplication_s() -> OCP.OCP.XCAFApp.XCAFApp_Application
  // Remarks: Initializes (for the first time) and returns the static object (XCAFApp_Application) This is the only valid method to get XCAFApp_Application object, and it should be called at least once before any actions with documents in order to init application
  // OCP.OCP.XCAFApp.XCAFApp_Application.GetApplication_s (method)
  GetApplication_s() -> OCP.OCP.XCAFApp.XCAFApp_Application

  // get_type_name_s() -> str
  // OCP.OCP.XCAFApp.XCAFApp_Application.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.XCAFApp.XCAFApp_Application.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.XCAFApp.XCAFApp_Application.DynamicType (method)
  DynamicType(self: OCP.OCP.XCAFApp.XCAFApp_Application) -> OCP.OCP.Standard.Standard_Type
