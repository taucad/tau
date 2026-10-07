# libcascade — XCAFApp

1 top-level symbols. Signatures are verbatim typescript.

XCAFApp_Application: declare class XCAFApp_Application extends TDocStd_Application

  // XCAFApp_Application.ResourcesName (method)
  ResourcesName(): string;

  // XCAFApp_Application.InitDocument (method)
  InitDocument(theDoc: CDM_Document): void;

  // XCAFApp_Application.GetApplication (method)
  static GetApplication(): XCAFApp_Application;

  // XCAFApp_Application.get_type_name (method)
  static get_type_name(): string;

  // XCAFApp_Application.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFApp_Application.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFApp_Application.delete (method)
  delete(): void;

  // XCAFApp_Application.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
