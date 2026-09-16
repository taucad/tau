# libcascade — GccInt

8 top-level symbols. Signatures are verbatim typescript.

GccInt_BCirc: declare class GccInt_BCirc extends GccInt_Bisec

  constructor

  Circle(): gp_Circ2d;

  ArcType(): GccInt_IType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GccInt_BElips: declare class GccInt_BElips extends GccInt_Bisec

  constructor

  Ellipse(): gp_Elips2d;

  ArcType(): GccInt_IType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GccInt_BHyper: declare class GccInt_BHyper extends GccInt_Bisec

  constructor

  Hyperbola(): gp_Hypr2d;

  ArcType(): GccInt_IType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GccInt_BLine: declare class GccInt_BLine extends GccInt_Bisec

  constructor

  Line(): gp_Lin2d;

  ArcType(): GccInt_IType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GccInt_BParab: declare class GccInt_BParab extends GccInt_Bisec

  constructor

  Parabola(): gp_Parab2d;

  ArcType(): GccInt_IType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GccInt_BPoint: declare class GccInt_BPoint extends GccInt_Bisec

  constructor

  Point(): gp_Pnt2d;

  ArcType(): GccInt_IType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GccInt_Bisec: declare class GccInt_Bisec extends Standard_Transient

  ArcType(): GccInt_IType;

  Point(): gp_Pnt2d;

  Line(): gp_Lin2d;

  Circle(): gp_Circ2d;

  Hyperbola(): gp_Hypr2d;

  Parabola(): gp_Parab2d;

  Ellipse(): gp_Elips2d;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

GccInt_IType: typeof GccInt_IType[keyof typeof GccInt_IType]
