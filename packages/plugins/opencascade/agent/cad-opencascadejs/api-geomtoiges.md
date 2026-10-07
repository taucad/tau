# libcascade — GeomToIGES

5 top-level symbols. Signatures are verbatim typescript.

GeomToIGES_GeomCurve: declare class GeomToIGES_GeomCurve extends GeomToIGES_GeomEntity

  // GeomToIGES_GeomCurve.constructor (constructor)
  constructor();
  constructor(GE: GeomToIGES_GeomEntity);

  // GeomToIGES_GeomCurve.TransferCurve (method)
  TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
  TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;

  // GeomToIGES_GeomCurve.delete (method)
  delete(): void;

  // GeomToIGES_GeomCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToIGES_GeomEntity: declare class GeomToIGES_GeomEntity

  // GeomToIGES_GeomEntity.constructor (constructor)
  constructor();
  constructor(GE: GeomToIGES_GeomEntity);

  // GeomToIGES_GeomEntity.SetModel (method)
  SetModel(model: IGESData_IGESModel): void;

  // GeomToIGES_GeomEntity.GetModel (method)
  GetModel(): IGESData_IGESModel;

  // GeomToIGES_GeomEntity.SetUnit (method)
  SetUnit(unit: number): void;

  // GeomToIGES_GeomEntity.GetUnit (method)
  GetUnit(): number;

  // GeomToIGES_GeomEntity.delete (method)
  delete(): void;

  // GeomToIGES_GeomEntity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToIGES_GeomPoint: declare class GeomToIGES_GeomPoint extends GeomToIGES_GeomEntity

  // GeomToIGES_GeomPoint.constructor (constructor)
  constructor();
  constructor(GE: GeomToIGES_GeomEntity);

  // GeomToIGES_GeomPoint.TransferPoint (method)
  TransferPoint(start: Geom_Point): IGESGeom_Point;
  TransferPoint(start: Geom_CartesianPoint): IGESGeom_Point;

  // GeomToIGES_GeomPoint.delete (method)
  delete(): void;

  // GeomToIGES_GeomPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToIGES_GeomSurface: declare class GeomToIGES_GeomSurface extends GeomToIGES_GeomEntity

  // GeomToIGES_GeomSurface.constructor (constructor)
  constructor();
  constructor(GE: GeomToIGES_GeomEntity);

  // GeomToIGES_GeomSurface.TransferSurface (method)
  TransferSurface(start: Geom_Surface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_BoundedSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_BSplineSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_BezierSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_RectangularTrimmedSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_ElementarySurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_Plane, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_CylindricalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_ConicalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_SphericalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_ToroidalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_SweptSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_SurfaceOfLinearExtrusion, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_SurfaceOfRevolution, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;
  TransferSurface(start: Geom_OffsetSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

  // GeomToIGES_GeomSurface.TransferPlaneSurface (method)
  TransferPlaneSurface(start: Geom_Plane, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

  // GeomToIGES_GeomSurface.TransferCylindricalSurface (method)
  TransferCylindricalSurface(start: Geom_CylindricalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

  // GeomToIGES_GeomSurface.TransferConicalSurface (method)
  TransferConicalSurface(start: Geom_ConicalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

  // GeomToIGES_GeomSurface.TransferSphericalSurface (method)
  TransferSphericalSurface(start: Geom_SphericalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

  // GeomToIGES_GeomSurface.TransferToroidalSurface (method)
  TransferToroidalSurface(start: Geom_ToroidalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

  // GeomToIGES_GeomSurface.Length (method)
  Length(): number;

  // GeomToIGES_GeomSurface.GetBRepMode (method)
  GetBRepMode(): boolean;

  // GeomToIGES_GeomSurface.SetBRepMode (method)
  SetBRepMode(flag: boolean): void;

  // GeomToIGES_GeomSurface.GetAnalyticMode (method)
  GetAnalyticMode(): boolean;

  // GeomToIGES_GeomSurface.SetAnalyticMode (method)
  SetAnalyticMode(flag: boolean): void;

  // GeomToIGES_GeomSurface.delete (method)
  delete(): void;

  // GeomToIGES_GeomSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomToIGES_GeomVector: declare class GeomToIGES_GeomVector extends GeomToIGES_GeomEntity

  // GeomToIGES_GeomVector.constructor (constructor)
  constructor();
  constructor(GE: GeomToIGES_GeomEntity);

  // GeomToIGES_GeomVector.TransferVector (method)
  TransferVector(start: Geom_Vector): IGESGeom_Direction;
  TransferVector(start: Geom_VectorWithMagnitude): IGESGeom_Direction;
  TransferVector(start: Geom_Direction): IGESGeom_Direction;

  // GeomToIGES_GeomVector.delete (method)
  delete(): void;

  // GeomToIGES_GeomVector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
