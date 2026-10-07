# libcascade — AppStdL

1 top-level symbols. Signatures are verbatim typescript.

AppStdL_Application: declare class AppStdL_Application extends TDocStd_Application

  // AppStdL_Application.constructor (constructor)
  constructor();

  // AppStdL_Application.ResourcesName (method)
  ResourcesName(): string;

  // AppStdL_Application.get_type_name (method)
  static get_type_name(): string;

  // AppStdL_Application.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // AppStdL_Application.DynamicType (method)
  DynamicType(): Standard_Type;

  // AppStdL_Application.delete (method)
  delete(): void;

  // AppStdL_Application.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
