# libcascade — GccInt

8 top-level symbols. Signatures are verbatim typescript.

GccInt_BCirc: declare class GccInt_BCirc extends GccInt_Bisec

  // GccInt_BCirc.constructor (constructor)
  constructor(Circ: gp_Circ2d);

  // GccInt_BCirc.Circle (method)
  Circle(): gp_Circ2d;

  // GccInt_BCirc.ArcType (method)
  ArcType(): GccInt_IType;

  // GccInt_BCirc.get_type_name (method)
  static get_type_name(): string;

  // GccInt_BCirc.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GccInt_BCirc.DynamicType (method)
  DynamicType(): Standard_Type;

  // GccInt_BCirc.delete (method)
  delete(): void;

  // GccInt_BCirc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccInt_BElips: declare class GccInt_BElips extends GccInt_Bisec

  // GccInt_BElips.constructor (constructor)
  constructor(Ellipse: gp_Elips2d);

  // GccInt_BElips.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // GccInt_BElips.ArcType (method)
  ArcType(): GccInt_IType;

  // GccInt_BElips.get_type_name (method)
  static get_type_name(): string;

  // GccInt_BElips.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GccInt_BElips.DynamicType (method)
  DynamicType(): Standard_Type;

  // GccInt_BElips.delete (method)
  delete(): void;

  // GccInt_BElips.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccInt_BHyper: declare class GccInt_BHyper extends GccInt_Bisec

  // GccInt_BHyper.constructor (constructor)
  constructor(Hyper: gp_Hypr2d);

  // GccInt_BHyper.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // GccInt_BHyper.ArcType (method)
  ArcType(): GccInt_IType;

  // GccInt_BHyper.get_type_name (method)
  static get_type_name(): string;

  // GccInt_BHyper.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GccInt_BHyper.DynamicType (method)
  DynamicType(): Standard_Type;

  // GccInt_BHyper.delete (method)
  delete(): void;

  // GccInt_BHyper.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccInt_BLine: declare class GccInt_BLine extends GccInt_Bisec

  // GccInt_BLine.constructor (constructor)
  constructor(Line: gp_Lin2d);

  // GccInt_BLine.Line (method)
  Line(): gp_Lin2d;

  // GccInt_BLine.ArcType (method)
  ArcType(): GccInt_IType;

  // GccInt_BLine.get_type_name (method)
  static get_type_name(): string;

  // GccInt_BLine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GccInt_BLine.DynamicType (method)
  DynamicType(): Standard_Type;

  // GccInt_BLine.delete (method)
  delete(): void;

  // GccInt_BLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccInt_BParab: declare class GccInt_BParab extends GccInt_Bisec

  // GccInt_BParab.constructor (constructor)
  constructor(Parab: gp_Parab2d);

  // GccInt_BParab.Parabola (method)
  Parabola(): gp_Parab2d;

  // GccInt_BParab.ArcType (method)
  ArcType(): GccInt_IType;

  // GccInt_BParab.get_type_name (method)
  static get_type_name(): string;

  // GccInt_BParab.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GccInt_BParab.DynamicType (method)
  DynamicType(): Standard_Type;

  // GccInt_BParab.delete (method)
  delete(): void;

  // GccInt_BParab.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccInt_BPoint: declare class GccInt_BPoint extends GccInt_Bisec

  // GccInt_BPoint.constructor (constructor)
  constructor(Point: gp_Pnt2d);

  // GccInt_BPoint.Point (method)
  Point(): gp_Pnt2d;

  // GccInt_BPoint.ArcType (method)
  ArcType(): GccInt_IType;

  // GccInt_BPoint.get_type_name (method)
  static get_type_name(): string;

  // GccInt_BPoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GccInt_BPoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // GccInt_BPoint.delete (method)
  delete(): void;

  // GccInt_BPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccInt_Bisec: declare class GccInt_Bisec extends Standard_Transient

  // GccInt_Bisec.ArcType (method)
  ArcType(): GccInt_IType;

  // GccInt_Bisec.Point (method)
  Point(): gp_Pnt2d;

  // GccInt_Bisec.Line (method)
  Line(): gp_Lin2d;

  // GccInt_Bisec.Circle (method)
  Circle(): gp_Circ2d;

  // GccInt_Bisec.Hyperbola (method)
  Hyperbola(): gp_Hypr2d;

  // GccInt_Bisec.Parabola (method)
  Parabola(): gp_Parab2d;

  // GccInt_Bisec.Ellipse (method)
  Ellipse(): gp_Elips2d;

  // GccInt_Bisec.get_type_name (method)
  static get_type_name(): string;

  // GccInt_Bisec.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // GccInt_Bisec.DynamicType (method)
  DynamicType(): Standard_Type;

  // GccInt_Bisec.delete (method)
  delete(): void;

  // GccInt_Bisec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GccInt_IType: typeof GccInt_IType[keyof typeof GccInt_IType]

  readonly GccInt_Lin: 'GccInt_Lin'

  readonly GccInt_Cir: 'GccInt_Cir'

  readonly GccInt_Ell: 'GccInt_Ell'

  readonly GccInt_Par: 'GccInt_Par'

  readonly GccInt_Hpr: 'GccInt_Hpr'

  readonly GccInt_Pnt: 'GccInt_Pnt'
