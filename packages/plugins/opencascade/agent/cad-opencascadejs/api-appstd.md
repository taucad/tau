# libcascade — AppStd

1 top-level symbols. Signatures are verbatim typescript.

AppStd_Application: declare class AppStd_Application extends TDocStd_Application

  // AppStd_Application.constructor (constructor)
  constructor();

  // AppStd_Application.ResourcesName (method)
  ResourcesName(): string;

  // AppStd_Application.get_type_name (method)
  static get_type_name(): string;

  // AppStd_Application.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // AppStd_Application.DynamicType (method)
  DynamicType(): Standard_Type;

  // AppStd_Application.delete (method)
  delete(): void;

  // AppStd_Application.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
