/**
 * Stub declarations for replicad-opencascadejs types.
 * Used only for type-level testing of the replicad bundled types.
 */

declare class Deletable {
  delete(): void;
}

export declare class Adaptor3d_Surface extends Deletable {}
export declare class BRepAdaptor_CompCurve extends Deletable {}
export declare class BRepAdaptor_Curve extends Deletable {}
export declare class BRepExtrema_DistShapeShape extends Deletable {}
export declare class Bnd_Box extends Deletable {}
export declare class Bnd_Box2d extends Deletable {}
export declare class GProp_GProps extends Deletable {}
export declare class Geom2dAdaptor_Curve extends Deletable {}
export declare class Geom2d_Curve extends Deletable {}
export declare class Handle_Geom2d_Curve extends Deletable {}
export declare class Handle_Geom_Surface extends Deletable {}
export declare class Law_Function extends Deletable {}
export declare class TDocStd_Document extends Deletable {}
export declare class TopoDS_CompSolid extends Deletable {}
export declare class TopoDS_Compound extends Deletable {}
export declare class TopoDS_Edge extends Deletable {}
export declare class TopoDS_Face extends Deletable {}
export declare class TopoDS_Shape extends Deletable {}
export declare class TopoDS_Shell extends Deletable {}
export declare class TopoDS_Solid extends Deletable {}
export declare class TopoDS_Vertex extends Deletable {}
export declare class TopoDS_Wire extends Deletable {}
export declare class gp_Ax1 extends Deletable {}
export declare class gp_Ax2 extends Deletable {}
export declare class gp_Ax2d extends Deletable {}
export declare class gp_Ax3 extends Deletable {}
export declare class gp_Dir extends Deletable {}
export declare class gp_Pnt extends Deletable {}
export declare class gp_Trsf extends Deletable {}
export declare class gp_Vec extends Deletable {}
export declare class gp_XYZ extends Deletable {}

export declare const enum TopAbs_ShapeEnum {
  TopAbs_COMPOUND = 0,
  TopAbs_COMPSOLID = 1,
  TopAbs_SOLID = 2,
  TopAbs_SHELL = 3,
  TopAbs_FACE = 4,
  TopAbs_WIRE = 5,
  TopAbs_EDGE = 6,
  TopAbs_VERTEX = 7,
  TopAbs_SHAPE = 8,
}

export declare class OpenCascadeInstance {}
