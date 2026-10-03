# libcascade — Geom2dToIGES

4 top-level symbols. Signatures are verbatim typescript.

Geom2dToIGES_Geom2dCurve: declare class Geom2dToIGES_Geom2dCurve extends Geom2dToIGES_Geom2dEntity

  // Geom2dToIGES_Geom2dCurve.constructor (constructor)
  constructor();
  constructor(G2dE: Geom2dToIGES_Geom2dEntity);

  // Geom2dToIGES_Geom2dCurve.Transfer2dCurve (method)
  Transfer2dCurve(start: Geom2d_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;

  // Geom2dToIGES_Geom2dCurve.delete (method)
  delete(): void;

  // Geom2dToIGES_Geom2dCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dToIGES_Geom2dEntity: declare class Geom2dToIGES_Geom2dEntity

  // Geom2dToIGES_Geom2dEntity.constructor (constructor)
  constructor();
  constructor(GE: Geom2dToIGES_Geom2dEntity);

  // Geom2dToIGES_Geom2dEntity.SetModel (method)
  SetModel(model: IGESData_IGESModel): void;

  // Geom2dToIGES_Geom2dEntity.GetModel (method)
  GetModel(): IGESData_IGESModel;

  // Geom2dToIGES_Geom2dEntity.SetUnit (method)
  SetUnit(unit: number): void;

  // Geom2dToIGES_Geom2dEntity.GetUnit (method)
  GetUnit(): number;

  // Geom2dToIGES_Geom2dEntity.delete (method)
  delete(): void;

  // Geom2dToIGES_Geom2dEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dToIGES_Geom2dPoint: declare class Geom2dToIGES_Geom2dPoint extends Geom2dToIGES_Geom2dEntity

  // Geom2dToIGES_Geom2dPoint.constructor (constructor)
  constructor();
  constructor(G2dE: Geom2dToIGES_Geom2dEntity);

  // Geom2dToIGES_Geom2dPoint.Transfer2dPoint (method)
  Transfer2dPoint(start: Geom2d_Point): IGESGeom_Point;
  Transfer2dPoint(start: Geom2d_CartesianPoint): IGESGeom_Point;

  // Geom2dToIGES_Geom2dPoint.delete (method)
  delete(): void;

  // Geom2dToIGES_Geom2dPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Geom2dToIGES_Geom2dVector: declare class Geom2dToIGES_Geom2dVector extends Geom2dToIGES_Geom2dEntity

  // Geom2dToIGES_Geom2dVector.constructor (constructor)
  constructor();
  constructor(G2dE: Geom2dToIGES_Geom2dEntity);

  // Geom2dToIGES_Geom2dVector.Transfer2dVector (method)
  Transfer2dVector(start: Geom2d_Vector): IGESGeom_Direction;
  Transfer2dVector(start: Geom2d_VectorWithMagnitude): IGESGeom_Direction;
  Transfer2dVector(start: Geom2d_Direction): IGESGeom_Direction;

  // Geom2dToIGES_Geom2dVector.delete (method)
  delete(): void;

  // Geom2dToIGES_Geom2dVector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
