# libcascade — GeomToIGES (2)

2 top-level symbols. Signatures are verbatim typescript.

// This class implements the transfer of the Surface Entity from Geom To IGES
GeomToIGES_GeomSurface: declare class GeomToIGES_GeomSurface extends GeomToIGES_GeomEntity

constructor

// Transfer a GeometryEntity which answer True to the member
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

TransferPlaneSurface(start: Geom_Plane, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

TransferCylindricalSurface(start: Geom_CylindricalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

TransferConicalSurface(start: Geom_ConicalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

TransferSphericalSurface(start: Geom_SphericalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

TransferToroidalSurface(start: Geom_ToroidalSurface, Udeb: number, Ufin: number, Vdeb: number, Vfin: number): IGESData_IGESEntity;

// Returns the value of "TheLength"
Length(): number;

// Returns Brep mode flag
GetBRepMode(): boolean;

// Sets BRep mode flag
SetBRepMode(flag: boolean): void;

// Returns flag for writing elementary surfaces
GetAnalyticMode(): boolean;

// Setst flag for writing elementary surfaces
SetAnalyticMode(flag: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the transfer of the Vector from Geom to IGES
GeomToIGES_GeomVector: declare class GeomToIGES_GeomVector extends GeomToIGES_GeomEntity

constructor

// Transfer a GeometryEntity which answer True to the member
TransferVector(start: Geom_Vector): IGESGeom_Direction;
TransferVector(start: Geom_VectorWithMagnitude): IGESGeom_Direction;
TransferVector(start: Geom_Direction): IGESGeom_Direction;
TransferVector(start: Geom_Vector): IGESGeom_Direction;
TransferVector(start: Geom_VectorWithMagnitude): IGESGeom_Direction;
TransferVector(start: Geom_Direction): IGESGeom_Direction;
TransferVector(start: Geom_Vector): IGESGeom_Direction;
TransferVector(start: Geom_VectorWithMagnitude): IGESGeom_Direction;
TransferVector(start: Geom_Direction): IGESGeom_Direction;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
