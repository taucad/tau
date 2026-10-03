# libcascade — GeomProjLib

1 top-level symbols. Signatures are verbatim typescript.

GeomProjLib: declare class GeomProjLib

  // GeomProjLib.constructor (constructor)
  constructor();

  // GeomProjLib.Curve2d (method)
  static Curve2d(C: Geom_Curve, First: number, Last: number, S: Geom_Surface, UFirst: number, ULast: number, VFirst: number, VLast: number, Tolerance?: number): { returnValue: Geom2d_Curve; Tolerance: number; [Symbol.dispose](): void };
  static Curve2d(C: Geom_Curve, First: number, Last: number, S: Geom_Surface, Tolerance?: number): { returnValue: Geom2d_Curve; Tolerance: number; [Symbol.dispose](): void };
  static Curve2d(C: Geom_Curve, First: number, Last: number, S: Geom_Surface): Geom2d_Curve;
  static Curve2d(C: Geom_Curve, S: Geom_Surface): Geom2d_Curve;
  static Curve2d(C: Geom_Curve, S: Geom_Surface, UDeb: number, UFin: number, VDeb: number, VFin: number): Geom2d_Curve;
  static Curve2d(C: Geom_Curve, S: Geom_Surface, UDeb: number, UFin: number, VDeb: number, VFin: number, Tolerance?: number): { returnValue: Geom2d_Curve; Tolerance: number; [Symbol.dispose](): void };

  // GeomProjLib.Project (method)
  static Project(C: Geom_Curve, S: Geom_Surface): Geom_Curve;

  // GeomProjLib.ProjectOnPlane (method)
  static ProjectOnPlane(Curve: Geom_Curve, Plane: Geom_Plane, Dir: gp_Dir, KeepParametrization: boolean): Geom_Curve;

  // GeomProjLib.delete (method)
  delete(): void;

  // GeomProjLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
