# libcascade — gce

25 top-level symbols. Signatures are verbatim typescript.

gce_ErrorType: typeof gce_ErrorType[keyof typeof gce_ErrorType]

gce_MakeCirc: declare class gce_MakeCirc extends gce_Root

  constructor

  Value(): gp_Circ;

  Operator(): gp_Circ;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeCirc2d: declare class gce_MakeCirc2d extends gce_Root

  constructor

  Value(): gp_Circ2d;

  Operator(): gp_Circ2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeCone: declare class gce_MakeCone extends gce_Root

  constructor

  Value(): gp_Cone;

  Operator(): gp_Cone;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeCylinder: declare class gce_MakeCylinder extends gce_Root

  constructor

  Value(): gp_Cylinder;

  Operator(): gp_Cylinder;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeDir: declare class gce_MakeDir extends gce_Root

  constructor

  Value(): gp_Dir;

  Operator(): gp_Dir;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeDir2d: declare class gce_MakeDir2d extends gce_Root

  constructor

  Value(): gp_Dir2d;

  Operator(): gp_Dir2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeElips: declare class gce_MakeElips extends gce_Root

  constructor

  Value(): gp_Elips;

  Operator(): gp_Elips;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeElips2d: declare class gce_MakeElips2d extends gce_Root

  constructor

  Value(): gp_Elips2d;

  Operator(): gp_Elips2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeHypr: declare class gce_MakeHypr extends gce_Root

  constructor

  Value(): gp_Hypr;

  Operator(): gp_Hypr;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeHypr2d: declare class gce_MakeHypr2d extends gce_Root

  constructor

  Value(): gp_Hypr2d;

  Operator(): gp_Hypr2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeLin: declare class gce_MakeLin extends gce_Root

  constructor

  Value(): gp_Lin;

  Operator(): gp_Lin;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeLin2d: declare class gce_MakeLin2d extends gce_Root

  constructor

  Value(): gp_Lin2d;

  Operator(): gp_Lin2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeMirror: declare class gce_MakeMirror

  constructor

  Value(): gp_Trsf;

  Operator(): gp_Trsf;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeMirror2d: declare class gce_MakeMirror2d

  constructor

  Value(): gp_Trsf2d;

  Operator(): gp_Trsf2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeParab: declare class gce_MakeParab extends gce_Root

  constructor

  Value(): gp_Parab;

  Operator(): gp_Parab;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeParab2d: declare class gce_MakeParab2d extends gce_Root

  constructor

  Value(): gp_Parab2d;

  Operator(): gp_Parab2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakePln: declare class gce_MakePln extends gce_Root

  constructor

  Value(): gp_Pln;

  Operator(): gp_Pln;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeRotation: declare class gce_MakeRotation

  constructor

  Value(): gp_Trsf;

  Operator(): gp_Trsf;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeRotation2d: declare class gce_MakeRotation2d

  constructor

  Value(): gp_Trsf2d;

  Operator(): gp_Trsf2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeScale: declare class gce_MakeScale

  constructor

  Value(): gp_Trsf;

  Operator(): gp_Trsf;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeScale2d: declare class gce_MakeScale2d

  constructor

  Value(): gp_Trsf2d;

  Operator(): gp_Trsf2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeTranslation: declare class gce_MakeTranslation

  constructor

  Value(): gp_Trsf;

  Operator(): gp_Trsf;

  delete(): void;

  [Symbol.dispose](): void;

gce_MakeTranslation2d: declare class gce_MakeTranslation2d

  constructor

  Value(): gp_Trsf2d;

  Operator(): gp_Trsf2d;

  delete(): void;

  [Symbol.dispose](): void;

gce_Root: declare class gce_Root

  constructor

  IsDone(): boolean;

  IsError(): boolean;

  Status(): gce_ErrorType;

  delete(): void;

  [Symbol.dispose](): void;
