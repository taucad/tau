#include "geospec_occt_bridge.h"

#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Curve2d.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepExtrema_SupportType.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <IMeshData_Status.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <Geom2dAdaptor_Curve.hxx>
#include <HeaderSection_FileSchema.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Interface_EntityIterator.hxx>
#include <Interface_Graph.hxx>
#include <Interface_InterfaceModel.hxx>
#include <Interface_Static.hxx>
#include <NCollection_Sequence.hxx>
#include <NCollection_IndexedMap.hxx>
#include <Poly_Triangulation.hxx>
#include <Precision.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <STEPConstruct_Tool.hxx>
#include <STEPConstruct_ExternRefs.hxx>
#include <STEPConstruct_UnitContext.hxx>
#include <Standard_Failure.hxx>
#include <StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.hxx>
#include <StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.hxx>
#include <StepGeom_Axis2Placement3d.hxx>
#include <StepGeom_CartesianPoint.hxx>
#include <StepGeom_Direction.hxx>
#include <StepGeom_Plane.hxx>
#include <StepBasic_Product.hxx>
#include <StepBasic_ProductDefinition.hxx>
#include <StepBasic_ProductDefinitionFormation.hxx>
#include <StepDimTol_Datum.hxx>
#include <StepAP242_DraughtingModelItemAssociation.hxx>
#include <StepAP242_ItemIdentifiedRepresentationUsage.hxx>
#include <StepRepr_GlobalUnitAssignedContext.hxx>
#include <StepRepr_NextAssemblyUsageOccurrence.hxx>
#include <StepRepr_ProductDefinitionShape.hxx>
#include <StepRepr_Representation.hxx>
#include <StepRepr_RepresentationContext.hxx>
#include <StepRepr_RepresentationItem.hxx>
#include <StepRepr_RepresentationRelationship.hxx>
#include <StepRepr_ShapeAspect.hxx>
#include <StepRepr_ShapeAspectRelationship.hxx>
#include <StepRepr_ConstructiveGeometryRepresentation.hxx>
#include <StepShape_ShapeDefinitionRepresentation.hxx>
#include <StepShape_AdvancedFace.hxx>
#include <StepData_StepModel.hxx>
#include <TCollection_AsciiString.hxx>
#include <TCollection_ExtendedString.hxx>
#include <TCollection_HAsciiString.hxx>
#include <TDF_Label.hxx>
#include <TDF_Tool.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_ShapeMapHasher.hxx>
#include <TransferBRep.hxx>
#include <Transfer_TransientProcess.hxx>
#include <NCollection_IndexedDataMap.hxx>
#include <NCollection_List.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Solid.hxx>
#include <TopoDS_Vertex.hxx>
#include <TopoDS_Wire.hxx>
#include <TopoDS_Shell.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Iterator.hxx>
#include <XCAFDoc_DimTolTool.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XSControl_TransferReader.hxx>
#include <XSControl_WorkSession.hxx>
#include <gp_Ax1.hxx>
#include <gp_Cone.hxx>
#include <gp_Circ.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Dir.hxx>
#include <gp_Dir2d.hxx>
#include <gp_Elips.hxx>
#include <gp_Lin.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Pnt2d.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <exception>
#include <iterator>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <sstream>
#include <string>
#include <tuple>
#include <unordered_set>
#include <utility>
#include <vector>

namespace {

struct ProductFacts {
  std::string label;
  std::string name;
};

struct LocatedFaceFacts {
  geospec_occt_located_face_facts facts{};
  TopoDS_Face shape;
  std::vector<uint32_t> edge_indices;
  std::string shape_label;
};

struct EdgeFacts {
  geospec_occt_edge_facts facts{};
};

struct FaceView {
  uint32_t query_index = 0;
  TopoDS_Face shape;
};

struct OccurrenceFacts {
  std::string label;
  std::string product_label;
  std::string name;
  std::string path;
  std::string product_name;
  std::string instance_name;
  bool has_instance_name = false;
  std::vector<uint32_t> ordinal_path;
  std::vector<uint32_t> source_route;
  TDF_Label source_label;
  bool source_transfer_valid = false;
  int parent = -1;
  size_t product = 0;
  TopoDS_Shape shape;
  gp_Trsf transform;
  geospec_occt_occurrence_facts facts{};
  std::vector<LocatedFaceFacts> faces;
  std::vector<FaceView> public_faces;
  std::vector<EdgeFacts> edges;
};

struct SourceFaceFacts {
  uint32_t entity = 0;
  bool same_sense = false;
  TopoDS_Face shape;
};

struct FaceFacts {
  geospec_occt_face_facts facts{};
  TopoDS_Face shape;
  geospec_occt_bounds bounds{};
  int reversed = 0;
  std::string shape_label;
};

struct PmiFacts {
  int kind = GEOSPEC_OCCT_PMI_DIMENSION;
  std::string label;
  std::string name;
  std::vector<std::string> shape_labels;
  size_t first_association_count = 0;
};

struct SubshapeFacts {
  int occurrence = -1;
  std::string occurrence_path;
  std::string name;
  int shape_type = GEOSPEC_OCCT_SUBSHAPE_FACE;
  bool has_face_index = false;
  uint32_t face_index = 0;
  std::string shape_label;
};

struct SemanticDatumFacts {
  int occurrence = -1;
  std::string occurrence_path;
  std::string label;
  std::string feature_name;
  std::vector<uint32_t> face_indices;
};

struct DatumPlacementFacts {
  int occurrence = -1;
  std::string occurrence_path;
  std::string name;
  std::array<double, 3> origin{};
  std::array<double, 3> x_axis{};
  std::array<double, 3> z_axis{};
};

struct MeshKey {
  int kind = GEOSPEC_OCCT_ENTITY_WHOLE;
  uint32_t occurrence = 0;
  uint32_t face = 0;
  uint64_t linear_bits = 0;
  uint64_t angular_bits = 0;

  bool operator==(const MeshKey& other) const noexcept {
    return kind == other.kind && occurrence == other.occurrence &&
           face == other.face && linear_bits == other.linear_bits &&
           angular_bits == other.angular_bits;
  }

};

struct MeshData {
  std::vector<std::array<double, 3>> positions;
  std::vector<std::array<uint32_t, 3>> triangles;
};

struct ReportData {
  geospec_occt_shape_facts shape{};
  std::vector<geospec_occt_occurrence_facts> occurrences;
  std::vector<geospec_occt_located_face_facts> whole_faces;
  std::vector<std::vector<geospec_occt_located_face_facts>> occurrence_faces;
  MeshData mesh;
};

struct EdgeTreatmentTransferData;

int write_string(const std::string& value, geospec_occt_string* output) noexcept {
  if (output == nullptr) return GEOSPEC_OCCT_OK;
  output->length = value.size();
  if (output->data == nullptr || output->capacity <= value.size()) {
    return value.empty() && output->capacity != 0 ? GEOSPEC_OCCT_OK
                                                  : GEOSPEC_OCCT_BUFFER_TOO_SMALL;
  }
  std::memcpy(output->data, value.data(), value.size());
  output->data[value.size()] = '\0';
  return GEOSPEC_OCCT_OK;
}

int fail(int status, const std::string& message, geospec_occt_string* error) noexcept {
  if (error == nullptr) return status;
  error->length = 0;
  if (error->data == nullptr || error->capacity == 0) return status;

  const size_t available = error->capacity - 1;
  size_t copied = std::min(message.size(), available);
  if (message.size() > available && available >= 3) {
    size_t prefix = available - 3;
    // Do not split a UTF-8 code point before the explicit truncation marker.
    while (prefix > 0 &&
           (static_cast<unsigned char>(message[prefix]) & 0xc0) == 0x80) {
      --prefix;
    }
    std::memcpy(error->data, message.data(), prefix);
    std::memcpy(error->data + prefix, "...", 3);
    copied = prefix + 3;
  } else {
    std::memcpy(error->data, message.data(), copied);
  }
  error->data[copied] = '\0';
  error->length = copied;
  return status;
}

std::string label_entry(const TDF_Label& label) {
  TCollection_AsciiString entry;
  TDF_Tool::Entry(label, entry);
  return entry.ToCString();
}

std::string utf8(const TCollection_ExtendedString& value) {
  std::vector<char> bytes(static_cast<size_t>(value.LengthOfCString()) + 1);
  char* output = bytes.data();
  value.ToUTF8CString(output);
  return output;
}

std::string label_name(const TDF_Label& label) {
  occ::handle<TDataStd_Name> name;
  return label.FindAttribute(TDataStd_Name::GetID(), name) ? utf8(name->Get()) : std::string{};
}

std::string hascii(const occ::handle<TCollection_HAsciiString>& value) {
  return value.IsNull() ? std::string{} : value->ToCString();
}

std::string step_schema(STEPCAFControl_Reader& reader) {
  const auto session = reader.ChangeReader().WS();
  if (session.IsNull() || session->Model().IsNull()) return {};
  const auto model = occ::down_cast<StepData_StepModel>(session->Model());
  if (model.IsNull()) return {};
  const auto schema = occ::down_cast<HeaderSection_FileSchema>(
      model->HeaderEntity(STANDARD_TYPE(HeaderSection_FileSchema)));
  return schema.IsNull() || schema->NbSchemaIdentifiers() == 0
             ? std::string{}
             : hascii(schema->SchemaIdentifiersValue(1));
}

std::string product_name(
    const occ::handle<StepRepr_ProductDefinitionShape>& shape_definition) {
  if (shape_definition.IsNull()) return {};
  const auto definition = shape_definition->Definition().ProductDefinition();
  if (definition.IsNull() || definition->Formation().IsNull()) return {};
  const auto product = definition->Formation()->OfProduct();
  if (product.IsNull()) return {};
  const std::string id = hascii(product->Id());
  return id.empty() ? hascii(product->Name()) : id;
}

struct ProductIdentityIndex {
  std::map<const void*, std::string> names_by_shape;
  std::string sole_product_name;
};

ProductIdentityIndex product_identity(STEPCAFControl_Reader& reader) {
  ProductIdentityIndex result;
  const auto session = reader.ChangeReader().WS();
  if (session.IsNull() || session->Model().IsNull() ||
      session->TransferReader().IsNull() ||
      session->TransferReader()->TransientProcess().IsNull()) {
    return result;
  }
  const auto model = session->Model();
  const auto process = session->TransferReader()->TransientProcess();
  int product_count = 0;
  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto product = occ::down_cast<StepBasic_Product>(model->Value(index));
    if (!product.IsNull()) {
      ++product_count;
      const std::string id = hascii(product->Id());
      result.sole_product_name = id.empty() ? hascii(product->Name()) : id;
    }
    const auto shape_definition =
        occ::down_cast<StepShape_ShapeDefinitionRepresentation>(model->Value(index));
    if (shape_definition.IsNull()) continue;
    const std::string name = product_name(
        occ::down_cast<StepRepr_ProductDefinitionShape>(
            shape_definition->Definition().PropertyDefinition()));
    if (name.empty()) continue;
    TopoDS_Shape shape = TransferBRep::ShapeResult(process, shape_definition);
    if (shape.IsNull() && !shape_definition->UsedRepresentation().IsNull()) {
      shape = TransferBRep::ShapeResult(
          process, shape_definition->UsedRepresentation());
    }
    if (!shape.IsNull() && !shape.TShape().IsNull()) {
      result.names_by_shape.emplace(shape.TShape().get(), name);
    }
  }
  if (product_count != 1) result.sole_product_name.clear();
  return result;
}

std::string resolved_product_name(const TDF_Label& label,
                                  const ProductIdentityIndex& identity) {
  const TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(label);
  if (!shape.IsNull() && !shape.TShape().IsNull()) {
    const auto found = identity.names_by_shape.find(shape.TShape().get());
    if (found != identity.names_by_shape.end()) return found->second;
  }
  if (!identity.sole_product_name.empty()) return identity.sole_product_name;
  return label_name(label);
}

gp_Dir step_direction(const occ::handle<StepGeom_Direction>& value,
                      const gp_Dir& fallback) {
  if (value.IsNull() || value->NbDirectionRatios() < 3) return fallback;
  const double x = value->DirectionRatiosValue(1);
  const double y = value->DirectionRatiosValue(2);
  const double z = value->DirectionRatiosValue(3);
  if (std::sqrt(x * x + y * y + z * z) <= 1e-12) return fallback;
  return gp_Dir(x, y, z);
}

double representation_length_factor(
    const occ::handle<StepRepr_Representation>& representation) {
  if (representation.IsNull() || representation->ContextOfItems().IsNull()) {
    return 1.0;
  }
  const auto context = representation->ContextOfItems();
  occ::handle<StepRepr_GlobalUnitAssignedContext> units;
  const auto geometric = occ::down_cast<
      StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext>(
      context);
  if (!geometric.IsNull()) units = geometric->GlobalUnitAssignedContext();
  if (units.IsNull()) {
    const auto uncertainty = occ::down_cast<
        StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx>(
        context);
    if (!uncertainty.IsNull()) {
      units = uncertainty->GlobalUnitAssignedContext();
    }
  }
  if (units.IsNull()) return 1.0;
  STEPConstruct_UnitContext unit_context;
  if (unit_context.ComputeFactors(units) != 0) return 1.0;
  const double factor = unit_context.LengthFactor();
  return std::isfinite(factor) && factor > 0.0 ? factor : 1.0;
}

bool placement_frame(const occ::handle<StepGeom_Axis2Placement3d>& placement,
                     double unit_factor, gp_Pnt& origin, gp_Dir& z_axis,
                     gp_Dir& x_axis) {
  if (placement.IsNull() || placement->Location().IsNull() ||
      placement->Location()->NbCoordinates() < 3) {
    return false;
  }
  const auto location = placement->Location();
  origin = gp_Pnt(location->CoordinatesValue(1) * unit_factor,
                  location->CoordinatesValue(2) * unit_factor,
                  location->CoordinatesValue(3) * unit_factor);
  z_axis = step_direction(
      placement->HasAxis() ? placement->Axis()
                           : occ::handle<StepGeom_Direction>{},
      gp_Dir(0.0, 0.0, 1.0));
  x_axis = step_direction(
      placement->HasRefDirection() ? placement->RefDirection()
                                   : occ::handle<StepGeom_Direction>{},
      gp_Dir(1.0, 0.0, 0.0));
  return true;
}

double source_length_unit_to_millimeters(STEPControl_Reader& reader) {
  const occ::handle<Interface_InterfaceModel> model = reader.WS()->Model();
  if (model.IsNull()) return 0.0;
  for (int index = 1; index <= model->NbEntities(); ++index) {
    const occ::handle<Standard_Transient> entity = model->Value(index);
    occ::handle<StepRepr_GlobalUnitAssignedContext> context;
    if (entity->IsKind(STANDARD_TYPE(
            StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext))) {
      context = occ::down_cast<
          StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext>(entity)
                    ->GlobalUnitAssignedContext();
    } else if (entity->IsKind(STANDARD_TYPE(
                   StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx))) {
      context = occ::down_cast<
          StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx>(entity)
                    ->GlobalUnitAssignedContext();
    }
    if (context.IsNull()) continue;
    STEPConstruct_UnitContext units;
    units.ComputeFactors(context);
    if (units.LengthDone() && std::isfinite(units.LengthFactor()) &&
        units.LengthFactor() > 0.0) {
      return units.LengthFactor();
    }
  }
  return 0.0;
}

void point(double output[3], const gp_Pnt& value) {
  output[0] = value.X();
  output[1] = value.Y();
  output[2] = value.Z();
}

void direction(double output[3], const gp_Dir& value) {
  output[0] = value.X();
  output[1] = value.Y();
  output[2] = value.Z();
}

geospec_occt_bounds bounds(const TopoDS_Shape& shape) {
  Bnd_Box box;
  BRepBndLib::AddOptimal(shape, box, false, false);
  if (box.IsVoid()) throw Standard_Failure("Shape has no finite bounds.");
  geospec_occt_bounds result{};
  box.Get(result.min[0], result.min[1], result.min[2], result.max[0], result.max[1], result.max[2]);
  return result;
}

geospec_occt_bounds reporting_bounds(const TopoDS_Shape& shape) {
  Bnd_Box box;
  BRepBndLib::Add(shape, box);
  if (box.IsVoid()) throw Standard_Failure("Shape has no finite reporting bounds.");
  geospec_occt_bounds result{};
  box.Get(result.min[0], result.min[1], result.min[2], result.max[0],
          result.max[1], result.max[2]);
  return result;
}

size_t shape_count(const TopoDS_Shape& shape, TopAbs_ShapeEnum kind) {
  size_t count = 0;
  for (TopExp_Explorer explorer(shape, kind); explorer.More(); explorer.Next()) {
    ++count;
  }
  return count;
}

geospec_occt_shape_facts shape_facts(const TopoDS_Shape& shape) {
  geospec_occt_shape_facts result{};
  result.valid = BRepCheck_Analyzer(shape).IsValid() ? 1 : 0;
  result.bounds = bounds(shape);

  GProp_GProps volume;
  BRepGProp::VolumeProperties(shape, volume);
  result.volume = volume.Mass();
  if (std::abs(result.volume) > std::numeric_limits<double>::epsilon()) {
    point(result.center_of_mass, volume.CentreOfMass());
  }

  GProp_GProps surface;
  BRepGProp::SurfaceProperties(shape, surface);
  result.surface_area = surface.Mass();
  result.compounds = shape_count(shape, TopAbs_COMPOUND);
  result.solids = shape_count(shape, TopAbs_SOLID);
  result.shells = shape_count(shape, TopAbs_SHELL);
  result.faces = shape_count(shape, TopAbs_FACE);
  result.wires = shape_count(shape, TopAbs_WIRE);
  result.edges = shape_count(shape, TopAbs_EDGE);
  result.vertices = shape_count(shape, TopAbs_VERTEX);
  return result;
}

void placement(double output[12], const TopLoc_Location& location) {
  const gp_Trsf transform = location.Transformation();
  size_t index = 0;
  for (int row = 1; row <= 3; ++row) {
    for (int column = 1; column <= 4; ++column) output[index++] = transform.Value(row, column);
  }
}

int surface_type(GeomAbs_SurfaceType type) {
  switch (type) {
    case GeomAbs_Plane: return GEOSPEC_OCCT_SURFACE_PLANE;
    case GeomAbs_Cylinder: return GEOSPEC_OCCT_SURFACE_CYLINDER;
    case GeomAbs_Cone: return GEOSPEC_OCCT_SURFACE_CONE;
    case GeomAbs_Sphere: return GEOSPEC_OCCT_SURFACE_SPHERE;
    case GeomAbs_Torus: return GEOSPEC_OCCT_SURFACE_TORUS;
    case GeomAbs_BezierSurface: return GEOSPEC_OCCT_SURFACE_BEZIER;
    case GeomAbs_BSplineSurface: return GEOSPEC_OCCT_SURFACE_BSPLINE;
    case GeomAbs_SurfaceOfRevolution: return GEOSPEC_OCCT_SURFACE_REVOLUTION;
    case GeomAbs_SurfaceOfExtrusion: return GEOSPEC_OCCT_SURFACE_EXTRUSION;
    case GeomAbs_OffsetSurface: return GEOSPEC_OCCT_SURFACE_OFFSET;
    case GeomAbs_OtherSurface: return GEOSPEC_OCCT_SURFACE_OTHER;
  }
  return GEOSPEC_OCCT_SURFACE_OTHER;
}

FaceFacts face_facts(const TopoDS_Face& face, uint32_t index,
                     uint32_t query_index) {
  BRepAdaptor_Surface surface(face);
  FaceFacts result;
  result.shape = face;
  result.bounds = bounds(face);
  result.reversed = face.Orientation() == TopAbs_REVERSED ? 1 : 0;
  result.facts.index = index;
  result.facts.query_index = query_index;
  result.facts.surface_type = surface_type(surface.GetType());
  result.facts.parameter_bounds[0] = surface.FirstUParameter();
  result.facts.parameter_bounds[1] = surface.LastUParameter();
  result.facts.parameter_bounds[2] = surface.FirstVParameter();
  result.facts.parameter_bounds[3] = surface.LastVParameter();

  GProp_GProps properties;
  BRepGProp::SurfaceProperties(face, properties);
  result.facts.area = properties.Mass();
  if (std::abs(result.facts.area) > std::numeric_limits<double>::epsilon()) {
    point(result.facts.center_of_mass, properties.CentreOfMass());
  }

  switch (surface.GetType()) {
    case GeomAbs_Plane: {
      const gp_Pln value = surface.Plane();
      point(result.facts.origin, value.Location());
      direction(result.facts.direction, value.Axis().Direction());
      break;
    }
    case GeomAbs_Cylinder: {
      const gp_Cylinder value = surface.Cylinder();
      point(result.facts.origin, value.Location());
      direction(result.facts.direction, value.Axis().Direction());
      result.facts.radius = value.Radius();
      break;
    }
    case GeomAbs_Cone: {
      const gp_Cone value = surface.Cone();
      point(result.facts.origin, value.Location());
      direction(result.facts.direction, value.Axis().Direction());
      result.facts.radius = value.RefRadius();
      result.facts.semi_angle = value.SemiAngle();
      break;
    }
    case GeomAbs_Sphere: {
      const gp_Sphere value = surface.Sphere();
      point(result.facts.origin, value.Location());
      result.facts.radius = value.Radius();
      break;
    }
    case GeomAbs_Torus: {
      const gp_Torus value = surface.Torus();
      point(result.facts.origin, value.Location());
      direction(result.facts.direction, value.Axis().Direction());
      result.facts.radius = value.MajorRadius();
      result.facts.secondary_radius = value.MinorRadius();
      break;
    }
    case GeomAbs_BezierSurface:
      result.facts.u_degree = static_cast<uint32_t>(surface.UDegree());
      result.facts.v_degree = static_cast<uint32_t>(surface.VDegree());
      result.facts.u_poles = static_cast<uint32_t>(surface.NbUPoles());
      result.facts.v_poles = static_cast<uint32_t>(surface.NbVPoles());
      break;
    case GeomAbs_BSplineSurface:
      result.facts.u_degree = static_cast<uint32_t>(surface.UDegree());
      result.facts.v_degree = static_cast<uint32_t>(surface.VDegree());
      result.facts.u_poles = static_cast<uint32_t>(surface.NbUPoles());
      result.facts.v_poles = static_cast<uint32_t>(surface.NbVPoles());
      result.facts.u_knots = static_cast<uint32_t>(surface.NbUKnots());
      result.facts.v_knots = static_cast<uint32_t>(surface.NbVKnots());
      result.facts.u_rational = surface.IsURational() ? 1 : 0;
      result.facts.v_rational = surface.IsVRational() ? 1 : 0;
      break;
    default: break;
  }
  return result;
}

template <typename Face>
int exact_face_index(const std::vector<Face>& faces,
                     const TopoDS_Shape& shape) {
  int match = 0;
  for (size_t index = 0; index < faces.size(); ++index) {
    if (!faces[index].shape.IsEqual(shape)) continue;
    if (match != 0) return 0;
    match = static_cast<int>(index + 1);
  }
  return match;
}

template <typename Face>
int exact_mapped_face_index(
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>& map,
    const std::vector<Face>& faces, const TopoDS_Shape& shape) {
  const int index = map.FindIndex(shape);
  return index > 0 &&
                 faces[static_cast<size_t>(index - 1)].shape.IsEqual(shape)
             ? index
             : 0;
}

int located_public_face_index(const TopoDS_Shape& product,
                              const TopoDS_Shape& attached,
                              const OccurrenceFacts& occurrence) {
  TopoDS_Shape product_face;
  for (TopExp_Explorer explorer(product, TopAbs_FACE); explorer.More();
       explorer.Next()) {
    if (!explorer.Current().IsSame(attached)) continue;
    if (!product_face.IsNull()) return -1;
    product_face = explorer.Current();
  }
  if (product_face.IsNull()) return -1;

  TopoDS_Shape located = product_face;
  located.Location(occurrence.shape.Location() * product.Location().Inverted() *
                   product_face.Location());
  const int face = exact_face_index(occurrence.public_faces, located);
  if (face == 0) return -1;
  return occurrence.public_faces[static_cast<size_t>(face - 1)].query_index == 0
             ? -1
             : face - 1;
}

int curve_type(GeomAbs_CurveType type) {
  switch (type) {
    case GeomAbs_Line: return GEOSPEC_OCCT_CURVE_LINE;
    case GeomAbs_Circle: return GEOSPEC_OCCT_CURVE_CIRCLE;
    case GeomAbs_Ellipse: return GEOSPEC_OCCT_CURVE_ELLIPSE;
    case GeomAbs_BSplineCurve:
    case GeomAbs_BezierCurve: return GEOSPEC_OCCT_CURVE_BSPLINE;
    default: return GEOSPEC_OCCT_CURVE_OTHER;
  }
}

EdgeFacts edge_facts(const TopoDS_Edge& edge, uint32_t index) {
  EdgeFacts result;
  result.facts.index = index;
  result.facts.bounds = bounds(edge);
  GProp_GProps properties;
  BRepGProp::LinearProperties(edge, properties);
  result.facts.length = properties.Mass();

  BRepAdaptor_Curve curve(edge);
  result.facts.curve_type = curve_type(curve.GetType());
  point(result.facts.start, curve.Value(curve.FirstParameter()));
  point(result.facts.end, curve.Value(curve.LastParameter()));
  switch (curve.GetType()) {
    case GeomAbs_Line: {
      const gp_Lin value = curve.Line();
      point(result.facts.origin, value.Location());
      direction(result.facts.direction, value.Direction());
      break;
    }
    case GeomAbs_Circle: {
      const gp_Circ value = curve.Circle();
      point(result.facts.origin, value.Location());
      direction(result.facts.direction, value.Axis().Direction());
      result.facts.radius = value.Radius();
      break;
    }
    case GeomAbs_Ellipse: {
      const gp_Elips value = curve.Ellipse();
      point(result.facts.origin, value.Location());
      direction(result.facts.direction, value.Axis().Direction());
      result.facts.radius = value.MajorRadius();
      result.facts.secondary_radius = value.MinorRadius();
      break;
    }
    default: break;
  }
  return result;
}

void populate_occurrence_geometry(OccurrenceFacts& occurrence) {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> edges;
  TopExp::MapShapes(occurrence.shape, TopAbs_EDGE, edges);
  occurrence.edges.reserve(static_cast<size_t>(edges.Extent()));
  for (int index = 1; index <= edges.Extent(); ++index) {
    occurrence.edges.push_back(
        edge_facts(TopoDS::Edge(edges(index)), static_cast<uint32_t>(index)));
  }

  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faces;
  TopExp::MapShapes(occurrence.shape, TopAbs_FACE, faces);
  occurrence.faces.reserve(static_cast<size_t>(faces.Extent()));
  for (int index = 1; index <= faces.Extent(); ++index) {
    const TopoDS_Face face = TopoDS::Face(faces(index));
    LocatedFaceFacts located;
    located.shape = face;
    located.facts.face = face_facts(face, static_cast<uint32_t>(index),
                                   static_cast<uint32_t>(index))
                             .facts;
    located.facts.bounds = bounds(face);
    located.facts.reversed = face.Orientation() == TopAbs_REVERSED ? 1 : 0;

    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> face_edges;
    TopExp::MapShapes(face, TopAbs_EDGE, face_edges);
    located.edge_indices.reserve(static_cast<size_t>(face_edges.Extent()));
    for (int edge = 1; edge <= face_edges.Extent(); ++edge) {
      const int occurrence_index = edges.FindIndex(face_edges(edge));
      if (occurrence_index > 0) {
        located.edge_indices.push_back(static_cast<uint32_t>(occurrence_index));
      }
    }
    located.facts.edge_count = located.edge_indices.size();
    occurrence.faces.push_back(std::move(located));
  }

  for (TopExp_Explorer explorer(occurrence.shape, TopAbs_FACE);
       explorer.More(); explorer.Next()) {
    const TopoDS_Face face = TopoDS::Face(explorer.Current());
    const int query_index =
        exact_mapped_face_index(faces, occurrence.faces, face);
    occurrence.public_faces.push_back(
        {query_index > 0 ? static_cast<uint32_t>(query_index) : 0, face});
  }
}

size_t product_index(const std::vector<ProductFacts>& products,
                     const std::string& label) {
  for (size_t index = 0; index < products.size(); ++index) {
    if (products[index].label == label) return index;
  }
  throw Standard_Failure("Occurrence product is absent from product facts.");
}

void append_free_shape_occurrence(
    const occ::handle<XCAFDoc_ShapeTool>& shape_tool, const TDF_Label& root,
    size_t ordinal, const std::string& path,
    const ProductIdentityIndex& identity,
    const std::vector<ProductFacts>& products,
    std::vector<OccurrenceFacts>& output) {
  OccurrenceFacts occurrence;
  occurrence.label = label_entry(root);
  occurrence.product_label = occurrence.label;
  occurrence.product_name = resolved_product_name(root, identity);
  occurrence.name = label_name(root);
  if (occurrence.name.empty()) occurrence.name = occurrence.product_name;
  if (occurrence.name.empty()) occurrence.name = occurrence.label;
  occurrence.path = path;
  occurrence.product = product_index(products, occurrence.product_label);
  occurrence.ordinal_path.push_back(static_cast<uint32_t>(ordinal));
  occurrence.source_label = root;
  occurrence.shape = shape_tool->GetShape(root);
  const TopLoc_Location location = XCAFDoc_ShapeTool::GetLocation(root);
  occurrence.shape.Location(location);
  occurrence.transform = location.Transformation();
  placement(occurrence.facts.placement, location);
  occurrence.facts.bounds = bounds(occurrence.shape);
  occurrence.facts.parent = -1;
  occurrence.facts.product = static_cast<uint32_t>(occurrence.product);
  occurrence.facts.ordinal_count = occurrence.ordinal_path.size();
  populate_occurrence_geometry(occurrence);
  output.push_back(std::move(occurrence));
}

void append_occurrences(const occ::handle<XCAFDoc_ShapeTool>& shape_tool,
                        const TDF_Label& assembly,
                        const TopLoc_Location& parent,
                        std::string path_prefix,
                        std::vector<uint32_t> ordinal_prefix,
                        int parent_index,
                        const ProductIdentityIndex& identity,
                        const std::vector<ProductFacts>& products,
                        std::vector<OccurrenceFacts>& output) {
  NCollection_Sequence<TDF_Label> components;
  if (!XCAFDoc_ShapeTool::GetComponents(assembly, components)) return;

  std::vector<std::string> names;
  names.reserve(static_cast<size_t>(components.Length()));
  std::map<std::string, size_t> totals;
  for (const TDF_Label& component : components) {
    TDF_Label product;
    std::string name = label_name(component);
    if (name.empty() && XCAFDoc_ShapeTool::GetReferredShape(component, product)) {
      name = label_name(product);
    }
    if (name.empty()) name = label_entry(component);
    names.push_back(name);
    ++totals[name];
  }
  std::map<std::string, size_t> ordinals;

  size_t component_index = 0;
  for (const TDF_Label& component : components) {
    TDF_Label product;
    if (!XCAFDoc_ShapeTool::GetReferredShape(component, product)) {
      ++component_index;
      continue;
    }
    const TopLoc_Location composed = parent * XCAFDoc_ShapeTool::GetLocation(component);
    TopoDS_Shape placed = shape_tool->GetShape(product);
    placed.Location(composed);

    OccurrenceFacts occurrence;
    occurrence.label = label_entry(component);
    occurrence.product_label = label_entry(product);
    occurrence.instance_name = label_name(component);
    occurrence.has_instance_name = !occurrence.instance_name.empty();
    occurrence.product_name = resolved_product_name(product, identity);
    occurrence.name = occurrence.has_instance_name ? occurrence.instance_name
                                                   : occurrence.product_name;
    std::string segment = names[component_index];
    if (totals[segment] > 1) {
      segment += "[" + std::to_string(++ordinals[names[component_index]]) + "]";
    }
    occurrence.path =
        path_prefix.empty() ? segment : path_prefix + "." + segment;
    occurrence.parent = parent_index;
    occurrence.product = product_index(products, occurrence.product_label);
    occurrence.ordinal_path = ordinal_prefix;
    occurrence.ordinal_path.push_back(
        static_cast<uint32_t>(component_index + 1));
    occurrence.source_label = component;
    occurrence.shape = placed;
    occurrence.transform = composed.Transformation();
    placement(occurrence.facts.placement, composed);
    occurrence.facts.bounds = bounds(placed);
    occurrence.facts.parent = occurrence.parent;
    occurrence.facts.product = static_cast<uint32_t>(occurrence.product);
    occurrence.facts.ordinal_count = occurrence.ordinal_path.size();
    populate_occurrence_geometry(occurrence);
    const int occurrence_index = static_cast<int>(output.size());
    output.push_back(std::move(occurrence));

    append_occurrences(shape_tool, product, composed,
                       output[static_cast<size_t>(occurrence_index)].path,
                       output[static_cast<size_t>(occurrence_index)].ordinal_path,
                       occurrence_index, identity, products, output);
    ++component_index;
  }
}

void prepare_source_associations(
    STEPCAFControl_Reader& reader,
    const occ::handle<XCAFDoc_ShapeTool>& shape_tool,
    std::vector<OccurrenceFacts>& occurrences,
    std::vector<SourceFaceFacts>& source_faces) {
  constexpr size_t kMaxSourceFaces = 8192;
  constexpr size_t kMaxRoute = 32;
  const auto session = reader.ChangeReader().WS();
  if (session.IsNull() || session->Model().IsNull() ||
      session->TransferReader().IsNull() ||
      session->TransferReader()->TransientProcess().IsNull()) {
    return;
  }
  const auto model = occ::down_cast<StepData_StepModel>(session->Model());
  if (model.IsNull()) return;
  const auto process = session->TransferReader()->TransientProcess();
  const STEPConstruct_Tool tool(session);
  std::vector<uint32_t> source_nauo(occurrences.size(), 0);
  std::vector<bool> ambiguous_nauo(occurrences.size(), false);

  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto entity = model->Value(index);
    const auto nauo =
        occ::down_cast<StepRepr_NextAssemblyUsageOccurrence>(entity);
    if (!nauo.IsNull()) {
      const int source_id = model->IdentLabel(nauo);
      if (source_id <= 0) continue;
      const TDF_Label label = STEPCAFControl_Reader::FindInstance(
          nauo, shape_tool, tool, reader.GetShapeLabelMap());
      if (label.IsNull()) continue;
      size_t found = occurrences.size();
      size_t count = 0;
      for (size_t occurrence = 0; occurrence < occurrences.size(); ++occurrence) {
        if (occurrences[occurrence].source_label.IsEqual(label)) {
          found = occurrence;
          ++count;
        }
      }
      if (count != 1 || ambiguous_nauo[found]) continue;
      if (source_nauo[found] != 0) {
        source_nauo[found] = 0;
        occurrences[found].source_transfer_valid = false;
        ambiguous_nauo[found] = true;
        continue;
      }
      const TopoDS_Shape transferred = TransferBRep::ShapeResult(process, nauo);
      if (transferred.IsNull() ||
          !transferred.IsSame(occurrences[found].shape) ||
          transferred.Orientation() != occurrences[found].shape.Orientation()) {
        continue;
      }
      source_nauo[found] = static_cast<uint32_t>(source_id);
      occurrences[found].source_transfer_valid = true;
      continue;
    }

    const auto face = occ::down_cast<StepShape_AdvancedFace>(entity);
    if (face.IsNull()) continue;
    if (source_faces.size() == kMaxSourceFaces) {
      source_faces.clear();
      return;
    }
    const int source_id = model->IdentLabel(face);
    const TopoDS_Shape transferred = TransferBRep::ShapeResult(process, face);
    if (source_id <= 0 || transferred.IsNull() ||
        transferred.ShapeType() != TopAbs_FACE) {
      continue;
    }
    source_faces.push_back({static_cast<uint32_t>(source_id), face->SameSense(),
                            TopoDS::Face(transferred)});
  }

  for (size_t occurrence = 0; occurrence < occurrences.size(); ++occurrence) {
    if (!occurrences[occurrence].source_transfer_valid) continue;
    std::vector<uint32_t> route;
    int current = static_cast<int>(occurrence);
    while (current >= 0 && route.size() < kMaxRoute) {
      const uint32_t source_id = source_nauo[static_cast<size_t>(current)];
      if (source_id == 0) {
        route.clear();
        break;
      }
      route.push_back(source_id);
      current = occurrences[static_cast<size_t>(current)].parent;
    }
    if (current >= 0 || route.empty()) {
      occurrences[occurrence].source_transfer_valid = false;
      continue;
    }
    std::reverse(route.begin(), route.end());
    occurrences[occurrence].source_route = std::move(route);
  }
  for (size_t left = 0; left < occurrences.size(); ++left) {
    if (!occurrences[left].source_transfer_valid) continue;
    for (size_t right = left + 1; right < occurrences.size(); ++right) {
      if (occurrences[right].source_transfer_valid &&
          occurrences[left].source_route == occurrences[right].source_route) {
        occurrences[left].source_transfer_valid = false;
        occurrences[right].source_transfer_valid = false;
      }
    }
  }
}

void append_pmi(const NCollection_Sequence<TDF_Label>& labels,
                int kind,
                std::vector<PmiFacts>& output) {
  for (const TDF_Label& label : labels) {
    PmiFacts record;
    record.kind = kind;
    record.label = label_entry(label);
    record.name = label_name(label);
    NCollection_Sequence<TDF_Label> first;
    NCollection_Sequence<TDF_Label> second;
    if (XCAFDoc_DimTolTool::GetRefShapeLabel(label, first, second)) {
      for (const TDF_Label& shape : first) record.shape_labels.push_back(label_entry(shape));
      record.first_association_count = record.shape_labels.size();
      for (const TDF_Label& shape : second) record.shape_labels.push_back(label_entry(shape));
    }
    output.push_back(std::move(record));
  }
}

int subshape_type(TopAbs_ShapeEnum type) {
  switch (type) {
    case TopAbs_FACE: return GEOSPEC_OCCT_SUBSHAPE_FACE;
    case TopAbs_EDGE: return GEOSPEC_OCCT_SUBSHAPE_EDGE;
    case TopAbs_VERTEX: return GEOSPEC_OCCT_SUBSHAPE_VERTEX;
    case TopAbs_SOLID: return GEOSPEC_OCCT_SUBSHAPE_SOLID;
    default: return -1;
  }
}

void append_subshapes(const occ::handle<XCAFDoc_ShapeTool>& shape_tool,
                      const NCollection_Sequence<TDF_Label>& product_labels,
                      std::vector<OccurrenceFacts>& occurrences,
                      std::vector<FaceFacts>& whole_query_faces,
                      const std::vector<FaceView>& whole_faces,
                      std::vector<SubshapeFacts>& output) {
  for (int product_index = 1; product_index <= product_labels.Length();
       ++product_index) {
    const TDF_Label& product = product_labels.Value(product_index);
    NCollection_Sequence<TDF_Label> labels;
    if (!XCAFDoc_ShapeTool::GetSubShapes(product, labels)) continue;
    const TopoDS_Shape product_shape = shape_tool->GetShape(product);

    std::vector<int> owners;
    for (size_t occurrence = 0; occurrence < occurrences.size(); ++occurrence) {
      if (occurrences[occurrence].product ==
          static_cast<size_t>(product_index - 1)) {
        owners.push_back(static_cast<int>(occurrence));
      }
    }
    if (owners.empty()) owners.push_back(-1);

    for (const TDF_Label& label : labels) {
      const std::string name = label_name(label);
      const TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(label);
      const int type = shape.IsNull() ? -1 : subshape_type(shape.ShapeType());
      if (name.empty() || type < 0) continue;
      for (const int owner : owners) {
        int face = -1;
        if (shape.ShapeType() == TopAbs_FACE) {
          if (owner >= 0) {
            face = located_public_face_index(
                product_shape, shape,
                occurrences[static_cast<size_t>(owner)]);
          } else {
            const int matched = exact_face_index(whole_faces, shape);
            if (matched > 0 &&
                whole_faces[static_cast<size_t>(matched - 1)].query_index > 0) {
              face = matched - 1;
            }
          }
        }
        SubshapeFacts record;
        record.occurrence = owner;
        if (owner >= 0) {
          record.occurrence_path =
              occurrences[static_cast<size_t>(owner)].path;
        }
        record.name = name;
        record.shape_type = type;
        record.has_face_index = face >= 0;
        record.face_index =
            face >= 0 ? static_cast<uint32_t>(face) : 0;
        record.shape_label = label_entry(label);
        output.push_back(record);
        if (face < 0) continue;
        if (owner < 0) {
          const uint32_t query_index =
              whole_faces[static_cast<size_t>(face)].query_index;
          if (query_index > 0) {
            whole_query_faces[static_cast<size_t>(query_index - 1)]
                .shape_label = record.shape_label;
          }
          continue;
        }
        const FaceView& located =
            occurrences[static_cast<size_t>(owner)]
                .public_faces[static_cast<size_t>(face)];
        if (located.query_index > 0) {
          occurrences[static_cast<size_t>(owner)]
              .faces[static_cast<size_t>(located.query_index - 1)]
              .shape_label = record.shape_label;
        }
        const int whole = exact_face_index(whole_query_faces, located.shape);
        if (whole > 0) {
          whole_query_faces[static_cast<size_t>(whole - 1)].shape_label =
              record.shape_label;
        }
      }
    }
  }
}

std::string product_name_from_shape_aspect(
    const occ::handle<StepRepr_ShapeAspect>& aspect) {
  if (aspect.IsNull()) return {};
  const auto shape_definition = aspect->OfShape();
  if (shape_definition.IsNull()) return {};
  const auto definition = shape_definition->Definition().ProductDefinition();
  if (definition.IsNull() || definition->Formation().IsNull()) return {};
  const auto product = definition->Formation()->OfProduct();
  if (product.IsNull()) return {};
  const std::string id = hascii(product->Id());
  return id.empty() ? hascii(product->Name()) : id;
}

void append_semantic_datums(
    STEPCAFControl_Reader& reader,
    const occ::handle<XCAFDoc_ShapeTool>& shape_tool,
    const NCollection_Sequence<TDF_Label>& product_labels,
    const std::vector<OccurrenceFacts>& occurrences,
    const std::vector<FaceView>& whole_faces,
    std::vector<SemanticDatumFacts>& output) {
  const auto session = reader.ChangeReader().WS();
  if (session.IsNull() || session->Model().IsNull()) return;
  const auto model = session->Model();

  std::map<const void*, std::vector<std::string>> letters_by_aspect;
  const auto append_letters = [&letters_by_aspect](
                                  const void* aspect,
                                  const std::vector<std::string>& letters) {
    bool changed = false;
    auto& existing = letters_by_aspect[aspect];
    for (const std::string& letter : letters) {
      if (std::find(existing.begin(), existing.end(), letter) == existing.end()) {
        existing.push_back(letter);
        changed = true;
      }
    }
    return changed;
  };
  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto datum = occ::down_cast<StepDimTol_Datum>(model->Value(index));
    if (datum.IsNull()) continue;
    const std::string letter = hascii(datum->Identification());
    if (!letter.empty()) append_letters(datum.get(), {letter});
  }

  std::vector<std::pair<const void*, const void*>> aspect_edges;
  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto relationship =
        occ::down_cast<StepRepr_ShapeAspectRelationship>(model->Value(index));
    if (relationship.IsNull()) continue;
    const auto relating = relationship->RelatingShapeAspect();
    const auto related = relationship->RelatedShapeAspect();
    if (relating.IsNull() || related.IsNull()) continue;
    aspect_edges.emplace_back(relating.get(), related.get());
    if (!occ::down_cast<StepDimTol_Datum>(relating).IsNull()) {
      aspect_edges.emplace_back(related.get(), relating.get());
    }
  }
  for (int round = 0; round < 8; ++round) {
    bool changed = false;
    for (const auto& [receiver, source] : aspect_edges) {
      const auto letters = letters_by_aspect.find(source);
      if (letters != letters_by_aspect.end() &&
          append_letters(receiver, letters->second)) {
        changed = true;
      }
    }
    if (!changed) break;
  }

  std::map<std::string, std::vector<TopoDS_Shape>> faces_by_letter;
  const auto transfer_reader = session->TransferReader();
  const auto process = transfer_reader.IsNull()
                           ? occ::handle<Transfer_TransientProcess>{}
                           : transfer_reader->TransientProcess();
  if (!process.IsNull()) {
    const Interface_Graph& graph = session->Graph();
    const auto collect_faces = [&process](
                                   const occ::handle<StepRepr_RepresentationItem>& item,
                                   std::vector<TopoDS_Shape>& faces) {
      if (item.IsNull()) return;
      const TopoDS_Shape bound = TransferBRep::ShapeResult(process, item);
      if (bound.IsNull()) return;
      if (bound.ShapeType() == TopAbs_FACE) {
        faces.push_back(bound);
      } else {
        for (TopExp_Explorer explorer(bound, TopAbs_FACE); explorer.More();
             explorer.Next()) {
          faces.push_back(explorer.Current());
        }
      }
    };

    for (int index = 1; index <= model->NbEntities(); ++index) {
      const auto usage = occ::down_cast<StepAP242_ItemIdentifiedRepresentationUsage>(
          model->Value(index));
      if (usage.IsNull() ||
          !occ::down_cast<StepAP242_DraughtingModelItemAssociation>(usage)
               .IsNull()) {
        continue;
      }
      const auto definition = usage->Definition().Value();
      if (definition.IsNull()) continue;
      const auto letters = letters_by_aspect.find(definition.get());
      if (letters == letters_by_aspect.end()) continue;

      std::vector<TopoDS_Shape> faces;
      for (int item = 1; item <= usage->NbIdentifiedItem(); ++item) {
        collect_faces(usage->IdentifiedItemValue(item), faces);
      }
      if (faces.empty()) {
        Interface_EntityIterator shared = graph.Shareds(usage);
        for (shared.Start(); shared.More(); shared.Next()) {
          collect_faces(occ::down_cast<StepRepr_RepresentationItem>(shared.Value()),
                        faces);
        }
      }
      for (const TopoDS_Shape& face : faces) {
        for (const std::string& letter : letters->second) {
          faces_by_letter[letter].push_back(face);
        }
      }
    }
  }

  std::map<std::string, std::map<size_t, std::vector<uint32_t>>>
      face_indices_by_letter;
  std::map<std::string, std::vector<uint32_t>> whole_face_indices_by_letter;
  for (const auto& [letter, attached_faces] : faces_by_letter) {
    auto& whole_indices = whole_face_indices_by_letter[letter];
    for (const TopoDS_Shape& attached : attached_faces) {
      const int face = exact_face_index(whole_faces, attached);
      if (face > 0 &&
          whole_faces[static_cast<size_t>(face - 1)].query_index > 0) {
        whole_indices.push_back(static_cast<uint32_t>(face - 1));
      }
    }
    std::sort(whole_indices.begin(), whole_indices.end());
    whole_indices.erase(
        std::unique(whole_indices.begin(), whole_indices.end()),
        whole_indices.end());

    for (size_t occurrence_index = 0; occurrence_index < occurrences.size();
         ++occurrence_index) {
      const OccurrenceFacts& occurrence = occurrences[occurrence_index];
      if (occurrence.product >= static_cast<size_t>(product_labels.Length())) {
        continue;
      }
      const TopoDS_Shape product_shape = shape_tool->GetShape(
          product_labels.Value(static_cast<int>(occurrence.product + 1)));
      std::vector<uint32_t> indices;
      for (const TopoDS_Shape& attached : attached_faces) {
        const int face =
            located_public_face_index(product_shape, attached, occurrence);
        if (face >= 0) {
          indices.push_back(static_cast<uint32_t>(face));
        }
      }
      if (!indices.empty()) {
        std::sort(indices.begin(), indices.end());
        indices.erase(std::unique(indices.begin(), indices.end()), indices.end());
        face_indices_by_letter[letter][occurrence_index] = std::move(indices);
      }
    }
  }

  std::map<std::pair<std::string, int>, bool> emitted;
  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto datum = occ::down_cast<StepDimTol_Datum>(model->Value(index));
    if (datum.IsNull()) continue;
    const std::string letter = hascii(datum->Identification());
    if (letter.empty()) continue;
    const std::string feature_name = hascii(datum->Name());
    const std::string product_name = product_name_from_shape_aspect(datum);
    std::vector<std::pair<int, std::vector<uint32_t>>> targets;

    const auto attached = face_indices_by_letter.find(letter);
    if (attached != face_indices_by_letter.end()) {
      for (const auto& [occurrence, faces] : attached->second) {
        targets.emplace_back(static_cast<int>(occurrence), faces);
      }
    }
    const auto whole_attached = whole_face_indices_by_letter.find(letter);
    if (targets.empty() &&
        whole_attached != whole_face_indices_by_letter.end() &&
        !whole_attached->second.empty()) {
      targets.emplace_back(-1, whole_attached->second);
    }
    if (targets.empty()) {
      for (size_t occurrence = 0; occurrence < occurrences.size(); ++occurrence) {
        if (!product_name.empty() &&
            occurrences[occurrence].product_name == product_name) {
          targets.emplace_back(static_cast<int>(occurrence),
                               std::vector<uint32_t>{});
        }
      }
    }
    if (targets.empty() && occurrences.size() == 1) {
      targets.emplace_back(0, std::vector<uint32_t>{});
    }
    if (targets.empty()) targets.emplace_back(-1, std::vector<uint32_t>{});

    for (auto& [occurrence, faces] : targets) {
      if (!emitted.emplace(std::make_pair(letter, occurrence), true).second) {
        continue;
      }
      const std::string path =
          occurrence >= 0
              ? occurrences[static_cast<size_t>(occurrence)].path
              : std::string{};
      output.push_back(
          {occurrence, path, letter, feature_name, std::move(faces)});
    }
  }
}

void append_datum_placements(STEPCAFControl_Reader& reader,
                             const std::vector<OccurrenceFacts>& occurrences,
                             std::vector<DatumPlacementFacts>& output) {
  const auto session = reader.ChangeReader().WS();
  if (session.IsNull() || session->Model().IsNull()) return;
  const auto model = session->Model();
  const Interface_Graph& graph = session->Graph();
  std::vector<std::pair<occ::handle<StepRepr_Representation>, std::string>>
      product_representations;
  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto definition =
        occ::down_cast<StepShape_ShapeDefinitionRepresentation>(
            model->Value(index));
    if (definition.IsNull() || definition->UsedRepresentation().IsNull()) {
      continue;
    }
    const std::string name = product_name(
        occ::down_cast<StepRepr_ProductDefinitionShape>(
            definition->Definition().PropertyDefinition()));
    if (!name.empty()) {
      product_representations.emplace_back(definition->UsedRepresentation(),
                                           name);
    }
  }

  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto constructive =
        occ::down_cast<StepRepr_ConstructiveGeometryRepresentation>(
            model->Value(index));
    if (constructive.IsNull() || constructive->Items().IsNull()) continue;
    const occ::handle<StepRepr_Representation> representation = constructive;
    std::vector<std::string> product_names;
    Interface_EntityIterator sharings = graph.Sharings(constructive);
    for (sharings.Start(); sharings.More(); sharings.Next()) {
      const auto relationship =
          occ::down_cast<StepRepr_RepresentationRelationship>(
              sharings.Value());
      if (relationship.IsNull()) continue;
      occ::handle<StepRepr_Representation> product_representation;
      if (relationship->Rep1() == representation) {
        product_representation = relationship->Rep2();
      } else if (relationship->Rep2() == representation) {
        product_representation = relationship->Rep1();
      } else {
        continue;
      }
      for (const auto& [candidate, product] : product_representations) {
        if (candidate == product_representation &&
            std::find(product_names.begin(), product_names.end(), product) ==
                product_names.end()) {
          product_names.push_back(product);
        }
      }
    }
    if (product_names.empty()) continue;

    const std::string representation_name = hascii(constructive->Name());
    const bool channel_name = representation_name == "supplemental geometry";
    const double unit_factor = representation_length_factor(representation);
    for (int item_index = 1; item_index <= constructive->NbItems();
         ++item_index) {
      const auto item = constructive->ItemsValue(item_index);
      if (item.IsNull()) continue;
      const std::string item_name = hascii(item->Name());
      const std::string evidence_name =
          !item_name.empty() ? item_name
                             : (channel_name ? std::string{}
                                             : representation_name);
      if (evidence_name.empty()) continue;
      const auto placement =
          occ::down_cast<StepGeom_Axis2Placement3d>(item);
      if (placement.IsNull()) continue;
      gp_Pnt local_origin;
      gp_Dir local_z;
      gp_Dir local_x;
      if (!placement_frame(placement, unit_factor, local_origin, local_z,
                           local_x)) {
        continue;
      }
      for (size_t occurrence_index = 0;
           occurrence_index < occurrences.size(); ++occurrence_index) {
        const OccurrenceFacts& occurrence = occurrences[occurrence_index];
        if (std::find(product_names.begin(), product_names.end(),
                      occurrence.product_name) == product_names.end()) {
          continue;
        }
        gp_Pnt origin = local_origin.Transformed(occurrence.transform);
        gp_Dir z_axis = local_z.Transformed(occurrence.transform);
        gp_Dir x_axis = local_x.Transformed(occurrence.transform);
        DatumPlacementFacts record;
        record.occurrence = static_cast<int>(occurrence_index);
        record.occurrence_path = occurrence.path;
        record.name = evidence_name;
        record.origin = {origin.X(), origin.Y(), origin.Z()};
        record.x_axis = {x_axis.X(), x_axis.Y(), x_axis.Z()};
        record.z_axis = {z_axis.X(), z_axis.Y(), z_axis.Z()};
        output.push_back(std::move(record));
      }
    }
  }
}

int copy_result(int first, int second) noexcept {
  return first == GEOSPEC_OCCT_OK ? second : first;
}

template <typename Function>
int guarded(geospec_occt_string* error, Function&& function) noexcept {
  try {
    return function();
  } catch (const Standard_Failure& failure) {
    return fail(GEOSPEC_OCCT_NATIVE_ERROR, failure.what(), error);
  } catch (const std::exception& exception) {
    return fail(GEOSPEC_OCCT_NATIVE_ERROR, exception.what(), error);
  } catch (...) {
    return fail(GEOSPEC_OCCT_NATIVE_ERROR, "Unknown OCCT failure.", error);
  }
}

}  // namespace

struct geospec_occt_document {
  occ::handle<TDocStd_Document> document;
  TopoDS_Shape shape;
  std::string schema;
  size_t source_byte_length = 0;
  size_t free_shape_count = 0;
  std::string source_length_unit;
  double source_unit_to_millimeters = 1.0;
  geospec_occt_shape_facts shape_facts{};
  mutable bool admission_validity_reusable = true;
  std::vector<ProductFacts> products;
  std::vector<OccurrenceFacts> occurrences;
  std::vector<SourceFaceFacts> source_faces;
  std::vector<FaceFacts> faces;
  std::vector<FaceView> public_faces;
  std::vector<PmiFacts> pmi;
  std::vector<SubshapeFacts> subshapes;
  std::vector<SemanticDatumFacts> semantic_datums;
  std::vector<DatumPlacementFacts> datum_placements;
  mutable std::optional<ReportData> report;
  mutable std::optional<std::pair<MeshKey, MeshData>> transfer_mesh;
  mutable std::optional<std::vector<geospec_occt_circular_bore_candidate>>
      circular_bores;
  mutable std::unique_ptr<EdgeTreatmentTransferData> edge_treatments;
};

namespace {

bool resolve_entity(const geospec_occt_document& document,
                    geospec_occt_entity entity, TopoDS_Shape& output,
                    std::string& message) {
  if (entity.kind == GEOSPEC_OCCT_ENTITY_WHOLE) {
    output = document.shape;
    return true;
  }
  if (entity.kind == GEOSPEC_OCCT_ENTITY_WHOLE_FACE) {
    if (entity.face == 0 || entity.face > document.faces.size()) {
      message = "Whole-shape face index is out of range.";
      return false;
    }
    output = document.faces[static_cast<size_t>(entity.face - 1)].shape;
    return true;
  }
  if (entity.occurrence >= document.occurrences.size()) {
    message = "Occurrence index is out of range.";
    return false;
  }
  const OccurrenceFacts& occurrence = document.occurrences[entity.occurrence];
  if (entity.kind == GEOSPEC_OCCT_ENTITY_OCCURRENCE) {
    output = occurrence.shape;
    return true;
  }
  if (entity.kind != GEOSPEC_OCCT_ENTITY_FACE || entity.face == 0 ||
      entity.face > occurrence.faces.size()) {
    message = "Face entity is invalid or out of range.";
    return false;
  }
  output = occurrence.faces[static_cast<size_t>(entity.face - 1)].shape;
  return true;
}

bool same_subshapes(const TopoDS_Shape& shape,
                    const std::vector<TopoDS_Solid>& solids,
                    TopAbs_ShapeEnum kind) {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> all;
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> owned;
  TopExp::MapShapes(shape, kind, all);
  for (const TopoDS_Solid& solid : solids) {
    TopExp::MapShapes(solid, kind, owned);
  }
  if (all.Extent() != owned.Extent()) return false;
  for (int index = 1; index <= all.Extent(); ++index) {
    if (!owned.Contains(all(index))) return false;
  }
  return true;
}

bool regular_solid_set(const TopoDS_Shape& shape, bool allow_empty,
                       std::vector<TopoDS_Solid>& solids,
                       std::string& message) {
  if (shape.IsNull()) {
    message = "A regular-solid operand is null.";
    return false;
  }
  if (shape.ShapeType() != TopAbs_SOLID &&
      shape.ShapeType() != TopAbs_COMPSOLID &&
      shape.ShapeType() != TopAbs_COMPOUND) {
    message = "A regular-solid operand must be a solid or a solid-only wrapper.";
    return false;
  }
  for (TopExp_Explorer explorer(shape, TopAbs_SOLID); explorer.More();
       explorer.Next()) {
    solids.push_back(TopoDS::Solid(explorer.Current()));
  }
  if (solids.empty()) {
    if (allow_empty) {
      for (TopAbs_ShapeEnum kind : {TopAbs_SHELL, TopAbs_FACE, TopAbs_WIRE,
                                    TopAbs_EDGE, TopAbs_VERTEX}) {
        NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> members;
        TopExp::MapShapes(shape, kind, members);
        if (!members.IsEmpty()) {
          message = "An empty regular-solid result contains lower-dimensional topology.";
          return false;
        }
      }
      return true;
    }
    message = "A regular-solid operand contains no solid.";
    return false;
  }
  for (TopAbs_ShapeEnum kind : {TopAbs_SHELL, TopAbs_FACE, TopAbs_WIRE,
                                TopAbs_EDGE, TopAbs_VERTEX}) {
    if (!same_subshapes(shape, solids, kind)) {
      message = "A regular-solid shape contains mixed-dimensional topology.";
      return false;
    }
  }
  BRepCheck_Analyzer analyzer(shape, true);
  if (!analyzer.IsValid()) {
    message = "A regular-solid shape is invalid.";
    return false;
  }
  for (const TopoDS_Solid& solid : solids) {
    if (!analyzer.IsValid(solid)) {
      message = "A regular-solid shape contains an invalid solid.";
      return false;
    }
    for (TopExp_Explorer explorer(solid, TopAbs_SHELL); explorer.More();
         explorer.Next()) {
      if (!TopoDS::Shell(explorer.Current()).Closed()) {
        message = "A regular-solid shape contains an open shell.";
        return false;
      }
    }
    GProp_GProps properties;
    BRepGProp::VolumeProperties(solid, properties);
    if (!std::isfinite(properties.Mass()) || properties.Mass() <= 0.0) {
      message = "A regular-solid shape has non-positive or non-finite volume.";
      return false;
    }
  }
  return true;
}

bool regular_solid_operand(const TopoDS_Shape& shape, TopoDS_Solid& solid,
                           std::string& message) {
  std::vector<TopoDS_Solid> solids;
  if (!regular_solid_set(shape, false, solids, message)) return false;
  if (solids.size() != 1) {
    message = "A regular-solid operand must resolve to exactly one solid.";
    return false;
  }
  solid = solids.front();
  return true;
}

bool qualified_cylinder_axial_extent(
    const TopoDS_Face& face, geospec_occt_cylinder_axial_extent_result& output,
    std::string& message) {
  BRepAdaptor_Surface surface(face);
  if (surface.GetType() != GeomAbs_Cylinder) {
    message = "The selected face is not cylindrical.";
    return false;
  }

  TopoDS_Wire wire;
  size_t wire_count = 0;
  for (TopExp_Explorer explorer(face, TopAbs_WIRE); explorer.More();
       explorer.Next()) {
    wire = TopoDS::Wire(explorer.Current());
    ++wire_count;
  }
  if (wire_count != 1) {
    message = "A qualified cylindrical band must contain exactly one boundary wire.";
    return false;
  }

  size_t edge_occurrence_count = 0;
  for (TopoDS_Iterator iterator(wire); iterator.More(); iterator.Next()) {
    if (iterator.Value().ShapeType() != TopAbs_EDGE) {
      message = "The cylindrical boundary wire contains a non-edge child.";
      return false;
    }
    ++edge_occurrence_count;
  }

  const gp_Cylinder cylinder = surface.Cylinder();
  const gp_Pnt origin = cylinder.Location();
  const gp_Dir axis = cylinder.Axis().Direction();
  const gp_Vec axis_vector(axis);
  const double radius = cylinder.Radius();
  const double face_tolerance =
      std::max(Precision::Confusion(), BRep_Tool::Tolerance(face));
  const double full_period = 2.0 * std::acos(-1.0);
  std::array<double, 2> rims{};
  size_t rim_count = 0;
  size_t seam_count = 0;
  size_t visited_count = 0;

  for (BRepTools_WireExplorer explorer(wire, face); explorer.More();
       explorer.Next()) {
    const TopoDS_Edge edge = explorer.Current();
    ++visited_count;
    if (BRep_Tool::IsClosed(edge, face)) {
      ++seam_count;
      continue;
    }

    BRepAdaptor_Curve curve(edge);
    if (curve.GetType() != GeomAbs_Circle || !curve.IsClosed() ||
        std::abs(std::abs(curve.LastParameter() - curve.FirstParameter()) -
                 full_period) > Precision::PConfusion()) {
      message = "A qualified cylindrical band may only have two full circular rims and seam boundaries.";
      return false;
    }
    if (rim_count == rims.size()) {
      message = "The cylindrical band has more than two circular rims.";
      return false;
    }
    const gp_Circ circle = curve.Circle();
    const double tolerance =
        std::max(face_tolerance, BRep_Tool::Tolerance(edge));
    if (!circle.Axis().Direction().IsParallel(axis, Precision::Angular()) ||
        std::abs(circle.Radius() - radius) > tolerance) {
      message = "A cylindrical rim is not coaxial with the selected analytic surface.";
      return false;
    }
    const gp_Vec delta(origin, circle.Location());
    const double along = delta.Dot(axis_vector);
    const gp_Vec radial = delta - axis_vector.Multiplied(along);
    if (radial.Magnitude() > tolerance) {
      message = "A cylindrical rim center is not on the selected surface axis.";
      return false;
    }
    rims[rim_count++] = along;
  }

  if (visited_count != edge_occurrence_count || rim_count != 2 ||
      seam_count != 2 || !std::isfinite(rims[0]) || !std::isfinite(rims[1]) ||
      std::abs(rims[1] - rims[0]) <= face_tolerance) {
    message = "The selected face is not a complete two-rim cylindrical band.";
    return false;
  }

  point(output.origin, origin);
  direction(output.axis, axis);
  output.radius = radius;
  output.from = std::min(rims[0], rims[1]);
  output.to = std::max(rims[0], rims[1]);
  return true;
}

using ShapeAncestors =
    NCollection_IndexedDataMap<TopoDS_Shape, NCollection_List<TopoDS_Shape>,
                               TopTools_ShapeMapHasher>;

struct BoreSolidContext {
  TopoDS_Solid solid;
  bool valid = false;
  double maximum_tolerance = 0.0;
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> edges;
  ShapeAncestors edge_faces;
};

bool maximum_topology_tolerance(const TopoDS_Shape& shape, double& maximum) {
  maximum = 0.0;
  for (TopAbs_ShapeEnum kind : {TopAbs_FACE, TopAbs_EDGE, TopAbs_VERTEX}) {
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> members;
    TopExp::MapShapes(shape, kind, members);
    for (int index = 1; index <= members.Extent(); ++index) {
      double tolerance = 0.0;
      if (kind == TopAbs_FACE) {
        tolerance = BRep_Tool::Tolerance(TopoDS::Face(members(index)));
      } else if (kind == TopAbs_EDGE) {
        tolerance = BRep_Tool::Tolerance(TopoDS::Edge(members(index)));
      } else {
        tolerance = BRep_Tool::Tolerance(TopoDS::Vertex(members(index)));
      }
      if (!std::isfinite(tolerance) || tolerance < 0.0) return false;
      maximum = std::max(maximum, tolerance);
    }
  }
  return true;
}

bool directed_edge_use(const TopoDS_Face& face, const TopoDS_Edge& edge,
                       TopAbs_Orientation& orientation) {
  size_t matches = 0;
  for (TopExp_Explorer wires(face, TopAbs_WIRE); wires.More(); wires.Next()) {
    const TopoDS_Wire wire = TopoDS::Wire(wires.Current());
    for (BRepTools_WireExplorer uses(wire, face); uses.More(); uses.Next()) {
      if (!uses.Current().IsSame(edge)) continue;
      orientation = uses.Current().Orientation();
      ++matches;
    }
  }
  return matches == 1 &&
         (orientation == TopAbs_FORWARD || orientation == TopAbs_REVERSED);
}

int indexed_public_face(
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>& map,
    const std::vector<std::vector<size_t>>& ordinals,
    const std::vector<FaceView>& faces, const TopoDS_Face& face) {
  const int mapped = map.FindIndex(face);
  if (mapped <= 0) return 0;
  int match = 0;
  for (const size_t ordinal : ordinals[static_cast<size_t>(mapped - 1)]) {
    if (!faces[ordinal].shape.IsEqual(face)) continue;
    if (match != 0) return 0;
    match = static_cast<int>(ordinal + 1);
  }
  return match;
}

int circular_bore_end(
    const geospec_occt_document& document, const TopoDS_Face& band,
    const TopoDS_Edge& rim, const gp_Pnt& rim_center, const gp_Dir& axis,
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>&
        public_face_map,
    const std::vector<std::vector<size_t>>& public_face_ordinals,
    BoreSolidContext& owner, geospec_occt_circular_bore_end& output) {
  const int edge_ordinal = owner.edges.FindIndex(rim);
  const int incidence = owner.edge_faces.FindIndex(rim);
  if (edge_ordinal <= 0 || incidence <= 0) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_INCOMPLETE_BAND;
  }

  const NCollection_List<TopoDS_Shape>& faces =
      owner.edge_faces.FindFromIndex(incidence);
  if (faces.Extent() != 2) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_INCOMPLETE_BAND;
  }
  TopoDS_Face adjacent;
  size_t band_count = 0;
  for (NCollection_List<TopoDS_Shape>::Iterator iterator(faces);
       iterator.More(); iterator.Next()) {
    const TopoDS_Face face = TopoDS::Face(iterator.Value());
    if (face.IsEqual(band)) {
      ++band_count;
    } else if (adjacent.IsNull()) {
      adjacent = face;
    } else {
      return GEOSPEC_OCCT_CIRCULAR_BORE_INCOMPLETE_BAND;
    }
  }
  if (band_count != 1 || adjacent.IsNull()) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_INCOMPLETE_BAND;
  }
  TopAbs_Orientation band_use = TopAbs_EXTERNAL;
  TopAbs_Orientation adjacent_use = TopAbs_EXTERNAL;
  if (!directed_edge_use(band, rim, band_use) ||
      !directed_edge_use(adjacent, rim, adjacent_use) ||
      band_use == adjacent_use) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_INCOMPLETE_BAND;
  }

  const BRepAdaptor_Surface surface(adjacent);
  if (surface.GetType() != GeomAbs_Plane) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_TERMINATION;
  }
  const gp_Pln plane = surface.Plane();
  if (!plane.Axis().Direction().IsParallel(axis, Precision::Angular()) ||
      plane.Distance(rim_center) > owner.maximum_tolerance) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_TERMINATION;
  }

  TopoDS_Wire containing;
  size_t containing_count = 0;
  size_t wire_count = 0;
  for (TopExp_Explorer wires(adjacent, TopAbs_WIRE); wires.More();
       wires.Next()) {
    const TopoDS_Wire wire = TopoDS::Wire(wires.Current());
    ++wire_count;
    size_t children = 0;
    size_t matches = 0;
    for (TopoDS_Iterator child(wire); child.More(); child.Next()) {
      if (child.Value().ShapeType() != TopAbs_EDGE) {
        return GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_TERMINATION;
      }
      ++children;
    }
    size_t visited = 0;
    for (BRepTools_WireExplorer use(wire, adjacent); use.More(); use.Next()) {
      ++visited;
      if (use.Current().IsSame(rim)) ++matches;
    }
    if (visited != children) {
      throw Standard_Failure("Circular bore boundary traversal is incomplete.");
    }
    if (matches == 0) continue;
    if (matches != 1 || children != 1) {
      return GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_TERMINATION;
    }
    containing = wire;
    ++containing_count;
  }
  if (containing_count != 1) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_TERMINATION;
  }

  const TopoDS_Wire outer = BRepTools::OuterWire(adjacent);
  if (outer.IsNull()) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_TERMINATION;
  }
  if (containing.IsSame(outer)) {
    if (wire_count != 1) {
      return GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_TERMINATION;
    }
    output.termination = GEOSPEC_OCCT_CIRCULAR_BORE_PLANAR_DISK_BOTTOM;
  } else {
    output.termination = GEOSPEC_OCCT_CIRCULAR_BORE_MOUTH;
  }

  const int public_face = indexed_public_face(
      public_face_map, public_face_ordinals, document.public_faces, adjacent);
  if (public_face == 0) {
    return GEOSPEC_OCCT_CIRCULAR_BORE_AMBIGUOUS_ASSOCIATION;
  }
  output.owning_solid_edge_ordinal = static_cast<uint32_t>(edge_ordinal);
  output.adjacent_public_face_ordinal =
      static_cast<uint32_t>(public_face - 1);
  return -1;
}

bool build_circular_bores(
    const geospec_occt_document& document, size_t max_candidates,
    size_t retained_candidate_size, size_t retained_inventory_size,
    std::vector<geospec_occt_circular_bore_candidate>& output,
    std::string& message, bool& native_error) {
  constexpr size_t kMaximumCandidates = 4096;
  constexpr size_t kMaximumOwnedBytes = 1024 * 1024;
  const size_t limit = std::min(max_candidates, kMaximumCandidates);
  size_t count = 0;
  for (const FaceView& view : document.public_faces) {
    if (BRepAdaptor_Surface(view.shape).GetType() != GeomAbs_Plane) ++count;
  }
  if (count > limit) {
    message = "Circular bore candidate count exceeds the requested bound.";
    return false;
  }
  if (retained_candidate_size > kMaximumOwnedBytes ||
      retained_inventory_size > kMaximumOwnedBytes ||
      count > (kMaximumOwnedBytes - retained_inventory_size) /
                  (sizeof(geospec_occt_circular_bore_candidate) +
                   retained_candidate_size)) {
    message = "Circular bore owned transfer exceeds one mebibyte.";
    return false;
  }

  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> solids;
  TopExp::MapShapes(document.shape, TopAbs_SOLID, solids);
  ShapeAncestors face_solids;
  TopExp::MapShapesAndAncestors(document.shape, TopAbs_FACE, TopAbs_SOLID,
                                face_solids);
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>
      public_face_map;
  std::vector<std::vector<size_t>> public_face_ordinals;
  for (size_t ordinal = 0; ordinal < document.public_faces.size(); ++ordinal) {
    const int mapped = public_face_map.Add(document.public_faces[ordinal].shape);
    if (static_cast<size_t>(mapped) > public_face_ordinals.size()) {
      public_face_ordinals.emplace_back();
    }
    public_face_ordinals[static_cast<size_t>(mapped - 1)].push_back(ordinal);
  }
  std::vector<std::unique_ptr<BoreSolidContext>> contexts(
      static_cast<size_t>(solids.Extent()));
  output.reserve(count);
  if (output.capacity() >
      (kMaximumOwnedBytes - retained_inventory_size -
       count * retained_candidate_size) /
          sizeof(geospec_occt_circular_bore_candidate)) {
    message = "Circular bore owned transfer capacity exceeds one mebibyte.";
    return false;
  }

  for (size_t public_ordinal = 0;
       public_ordinal < document.public_faces.size(); ++public_ordinal) {
    const FaceView& view = document.public_faces[public_ordinal];
    const BRepAdaptor_Surface surface(view.shape);
    if (surface.GetType() == GeomAbs_Plane) continue;
    if (public_ordinal > std::numeric_limits<uint32_t>::max()) {
      native_error = true;
      message = "Circular bore public face ordinal exceeds the transfer type.";
      return false;
    }

    geospec_occt_circular_bore_candidate candidate{};
    candidate.public_face_ordinal = static_cast<uint32_t>(public_ordinal);
    candidate.private_query_face = view.query_index;
    candidate.disposition = GEOSPEC_OCCT_CIRCULAR_BORE_UNQUALIFIED;
    if (surface.GetType() != GeomAbs_Cylinder) {
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_SURFACE;
      output.push_back(candidate);
      continue;
    }
    if (view.shape.Orientation() != TopAbs_FORWARD &&
        view.shape.Orientation() != TopAbs_REVERSED) {
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_UNSUPPORTED_ORIENTATION;
      output.push_back(candidate);
      continue;
    }

    const int ownership = face_solids.FindIndex(view.shape);
    int owner_ordinal = 0;
    if (ownership > 0 && face_solids.FindKey(ownership).IsEqual(view.shape)) {
      for (NCollection_List<TopoDS_Shape>::Iterator iterator(
               face_solids.FindFromIndex(ownership));
           iterator.More(); iterator.Next()) {
        const int ordinal = solids.FindIndex(iterator.Value());
        if (ordinal <= 0 || (owner_ordinal != 0 && owner_ordinal != ordinal)) {
          owner_ordinal = -1;
          break;
        }
        owner_ordinal = ordinal;
      }
    }
    if (owner_ordinal <= 0) {
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_AMBIGUOUS_OWNERSHIP;
      output.push_back(candidate);
      continue;
    }

    std::unique_ptr<BoreSolidContext>& slot =
        contexts[static_cast<size_t>(owner_ordinal - 1)];
    if (!slot) {
      slot = std::make_unique<BoreSolidContext>();
      std::string qualification;
      TopoDS_Solid qualified;
      slot->valid = regular_solid_operand(solids(owner_ordinal), qualified,
                                          qualification) &&
                    maximum_topology_tolerance(
                        solids(owner_ordinal), slot->maximum_tolerance);
      if (slot->valid) {
        slot->solid = qualified;
        TopExp::MapShapes(slot->solid, TopAbs_EDGE, slot->edges);
        TopExp::MapShapesAndAncestors(slot->solid, TopAbs_EDGE, TopAbs_FACE,
                                      slot->edge_faces);
      }
    }
    BoreSolidContext& owner = *slot;
    if (!owner.valid) {
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_INVALID_SOLID;
      output.push_back(candidate);
      continue;
    }
    candidate.owning_solid_ordinal = static_cast<uint32_t>(owner_ordinal - 1);
    if (view.query_index == 0) {
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_AMBIGUOUS_ASSOCIATION;
      output.push_back(candidate);
      continue;
    }
    if (view.shape.Orientation() == TopAbs_FORWARD) {
      candidate.disposition = GEOSPEC_OCCT_CIRCULAR_BORE_NON_MEMBER;
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_EXTERIOR_CYLINDER;
      output.push_back(candidate);
      continue;
    }

    if (!qualified_cylinder_axial_extent(view.shape, candidate.band, message)) {
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_INCOMPLETE_BAND;
      output.push_back(candidate);
      continue;
    }
    const gp_Pnt origin(candidate.band.origin[0], candidate.band.origin[1],
                        candidate.band.origin[2]);
    const gp_Dir axis(candidate.band.axis[0], candidate.band.axis[1],
                      candidate.band.axis[2]);
    const gp_Vec axis_vector(axis);
    std::array<TopoDS_Edge, 2> rims;
    std::array<gp_Pnt, 2> centers;
    std::array<bool, 2> found{};
    bool invalid_rims = false;
    TopoDS_Edge seam;
    std::array<TopAbs_Orientation, 2> seam_uses{};
    size_t seam_count = 0;
    TopoDS_Wire wire;
    for (TopExp_Explorer wires(view.shape, TopAbs_WIRE); wires.More();
         wires.Next()) {
      wire = TopoDS::Wire(wires.Current());
    }
    for (BRepTools_WireExplorer edges(wire, view.shape); edges.More();
         edges.Next()) {
      const TopoDS_Edge edge = edges.Current();
      if (BRep_Tool::IsClosed(edge, view.shape)) {
        if (seam_count == seam_uses.size() ||
            (!seam.IsNull() && !seam.IsSame(edge)) ||
            (edge.Orientation() != TopAbs_FORWARD &&
             edge.Orientation() != TopAbs_REVERSED)) {
          invalid_rims = true;
          break;
        }
        if (seam.IsNull()) seam = edge;
        seam_uses[seam_count++] = edge.Orientation();
        continue;
      }
      const gp_Pnt center = BRepAdaptor_Curve(edge).Circle().Location();
      const double station = gp_Vec(origin, center).Dot(axis_vector);
      const size_t end = station == candidate.band.from ? 0 : 1;
      if (found[end] || (end == 1 && station != candidate.band.to)) {
        candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_INCOMPLETE_BAND;
        invalid_rims = true;
        break;
      }
      rims[end] = edge;
      centers[end] = center;
      found[end] = true;
    }
    if (invalid_rims || !found[0] || !found[1] || seam_count != 2 ||
        seam_uses[0] == seam_uses[1]) {
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_INCOMPLETE_BAND;
      output.push_back(candidate);
      continue;
    }

    int endpoint_reason = -1;
    for (size_t end = 0; end < 2; ++end) {
      endpoint_reason = circular_bore_end(
          document, view.shape, rims[end], centers[end], axis, public_face_map,
          public_face_ordinals, owner, candidate.ends[end]);
      if (endpoint_reason >= 0) break;
    }
    if (endpoint_reason >= 0) {
      candidate.reason = endpoint_reason;
      output.push_back(candidate);
      continue;
    }
    candidate.maximum_topology_tolerance_mm = owner.maximum_tolerance;

    if (candidate.ends[0].termination ==
            GEOSPEC_OCCT_CIRCULAR_BORE_PLANAR_DISK_BOTTOM &&
        candidate.ends[1].termination ==
            GEOSPEC_OCCT_CIRCULAR_BORE_PLANAR_DISK_BOTTOM) {
      candidate.disposition = GEOSPEC_OCCT_CIRCULAR_BORE_NON_MEMBER;
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_SEALED_CAVITY;
      output.push_back(candidate);
      continue;
    }

    const gp_Pnt start = origin.Translated(
        axis_vector.Multiplied(candidate.band.from));
    BRepPrimAPI_MakeCylinder cylinder(gp_Ax2(start, axis),
                                     candidate.band.radius,
                                     candidate.band.to - candidate.band.from);
    cylinder.Build();
    if (!cylinder.IsDone()) {
      native_error = true;
      message = "OCCT failed to construct the finite circular bore cylinder.";
      return false;
    }
    const TopoDS_Shape cylinder_shape = cylinder.Shape();
    if (cylinder_shape.IsNull()) {
      native_error = true;
      message = "OCCT returned no finite circular bore cylinder.";
      return false;
    }
    NCollection_List<TopoDS_Shape> arguments;
    arguments.Append(owner.solid);
    NCollection_List<TopoDS_Shape> tools;
    tools.Append(cylinder_shape);
    BRepAlgoAPI_Common common;
    common.SetArguments(arguments);
    common.SetTools(tools);
    common.SetNonDestructive(true);
    common.SetRunParallel(false);
    common.Build();
    if (!common.IsDone() || common.HasErrors()) {
      std::ostringstream details;
      common.DumpErrors(details);
      native_error = true;
      message = details.str().empty()
                    ? "OCCT circular bore Common failed."
                    : "OCCT circular bore Common failed: " + details.str();
      return false;
    }
    const TopoDS_Shape residual = common.Shape();
    if (residual.IsNull() || !BRepCheck_Analyzer(residual, true).IsValid()) {
      native_error = true;
      message = "OCCT circular bore Common returned null or invalid topology.";
      return false;
    }
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>
        residual_solids;
    TopExp::MapShapes(residual, TopAbs_SOLID, residual_solids);
    if (static_cast<uint64_t>(residual_solids.Extent()) >
        std::numeric_limits<uint32_t>::max()) {
      native_error = true;
      message = "OCCT circular bore Common returned too many residual solids.";
      return false;
    }
    candidate.interior_residual_solid_count =
        static_cast<uint32_t>(residual_solids.Extent());
    if (!residual_solids.IsEmpty()) {
      candidate.disposition = GEOSPEC_OCCT_CIRCULAR_BORE_NON_MEMBER;
      candidate.reason = GEOSPEC_OCCT_CIRCULAR_BORE_OBSTRUCTED_INTERIOR;
    } else {
      candidate.disposition = GEOSPEC_OCCT_CIRCULAR_BORE_QUALIFIED;
      candidate.reason = 0;
    }
    output.push_back(candidate);
  }
  return true;
}

constexpr size_t kMaximumEdgeTreatmentRows = 4096;
constexpr size_t kMaximumEdgeTreatmentBoundaryUses = 8;
constexpr size_t kMaximumEdgeTreatmentResiduals = 16;
constexpr size_t kMaximumEdgeTreatmentOwnedBytes = 1024 * 1024;

struct EdgeTreatmentCertificateData {
  geospec_occt_edge_treatment_certificate value{};
  std::vector<geospec_occt_edge_treatment_boundary_use> boundary_uses;
  std::vector<geospec_occt_edge_treatment_residual> residuals;
};

struct EdgeTreatmentDispositionData {
  int disposition = GEOSPEC_OCCT_EDGE_TREATMENT_UNQUALIFIED;
  int reason = GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_SURFACE;
  std::unique_ptr<EdgeTreatmentCertificateData> certificate;
};

struct EdgeTreatmentRowData {
  geospec_occt_edge_treatment_row value{};
  std::string occurrence_path;
  std::string source_face_key;
  std::string label;
  EdgeTreatmentDispositionData chamfer;
  EdgeTreatmentDispositionData fillet;
};

struct EdgeTreatmentTransferData {
  geospec_occt_edge_treatment_counts counts{};
  std::vector<EdgeTreatmentRowData> rows;
  size_t owned_bytes = 0;
};

struct EdgeTreatmentUseData {
  geospec_occt_edge_treatment_boundary_use value{};
  TopoDS_Edge edge;
  TopoDS_Face adjacent;
  double maximum_tolerance = 0.0;
};

struct EdgeTreatmentScope {
  std::optional<uint32_t> occurrence;
  std::string occurrence_path;
  const TopoDS_Shape* shape = nullptr;
  const std::vector<FaceView>* faces = nullptr;
};

bool transition_surface(const TopoDS_Face& face) {
  const GeomAbs_SurfaceType type = BRepAdaptor_Surface(face).GetType();
  return type == GeomAbs_Plane || type == GeomAbs_Cone ||
         type == GeomAbs_Cylinder || type == GeomAbs_Torus;
}

bool checked_add_size(size_t value, size_t& total) {
  if (value > std::numeric_limits<size_t>::max() - total) return false;
  total += value;
  return true;
}

bool checked_product_size(size_t count, size_t width, size_t& output) {
  if (count != 0 && width > std::numeric_limits<size_t>::max() / count) {
    return false;
  }
  output = count * width;
  return true;
}

std::vector<EdgeTreatmentScope> edge_treatment_scopes(
    const geospec_occt_document& document) {
  std::vector<EdgeTreatmentScope> scopes;
  if (document.occurrences.empty()) {
    scopes.push_back({std::nullopt, {}, &document.shape, &document.public_faces});
    return scopes;
  }
  scopes.reserve(document.occurrences.size());
  for (size_t index = 0; index < document.occurrences.size(); ++index) {
    const OccurrenceFacts& occurrence = document.occurrences[index];
    scopes.push_back({static_cast<uint32_t>(index), occurrence.path,
                      &occurrence.shape, &occurrence.public_faces});
  }
  return scopes;
}

bool count_edge_treatments(
    const geospec_occt_document& document,
    geospec_occt_edge_treatment_counts& output, std::string& message) {
  uint64_t faces = 0;
  uint64_t uses = 0;
  for (const EdgeTreatmentScope& scope : edge_treatment_scopes(document)) {
    faces += scope.faces->size();
    if (faces > std::numeric_limits<uint32_t>::max()) {
      message = "Edge-treatment public face count exceeds the transfer type.";
      return false;
    }
    for (const FaceView& view : *scope.faces) {
      if (!transition_surface(view.shape)) continue;
      for (TopExp_Explorer wires(view.shape, TopAbs_WIRE); wires.More();
           wires.Next()) {
        const TopoDS_Wire wire = TopoDS::Wire(wires.Current());
        size_t children = 0;
        for (TopoDS_Iterator child(wire); child.More(); child.Next()) {
          if (child.Value().ShapeType() != TopAbs_EDGE) {
            message = "Edge-treatment boundary contains a non-edge child.";
            return false;
          }
          ++children;
        }
        size_t visited = 0;
        for (BRepTools_WireExplorer edge(wire, view.shape); edge.More();
             edge.Next()) {
          ++visited;
        }
        if (visited != children) {
          message = "Edge-treatment boundary traversal is incomplete.";
          return false;
        }
        uses += visited;
        if (uses > std::numeric_limits<uint32_t>::max()) {
          message = "Edge-treatment boundary-use count exceeds the transfer type.";
          return false;
        }
      }
    }
  }
  output.public_face_count = static_cast<uint32_t>(faces);
  output.candidate_edge_use_count = static_cast<uint32_t>(uses);
  return true;
}

gp_Pnt midpoint(const geospec_occt_edge_treatment_boundary_use& use) {
  return {(use.start[0] + use.end[0]) / 2.0,
          (use.start[1] + use.end[1]) / 2.0,
          (use.start[2] + use.end[2]) / 2.0};
}

bool natural_surface_normal(const TopoDS_Face& face, const gp_Pnt& at,
                            gp_Dir& output) {
  const BRepAdaptor_Surface surface(face);
  gp_Vec normal;
  switch (surface.GetType()) {
    case GeomAbs_Plane:
      output = surface.Plane().Axis().Direction();
      break;
    case GeomAbs_Cylinder: {
      const gp_Cylinder cylinder = surface.Cylinder();
      const gp_Vec axis(cylinder.Axis().Direction());
      const gp_Vec delta(cylinder.Location(), at);
      normal = delta - axis.Multiplied(delta.Dot(axis));
      if (normal.SquareMagnitude() <= 0.0) return false;
      output = gp_Dir(normal);
      break;
    }
    case GeomAbs_Cone: {
      const gp_Cone cone = surface.Cone();
      const gp_Vec axis(cone.Axis().Direction());
      const gp_Vec delta(cone.Location(), at);
      gp_Vec radial = delta - axis.Multiplied(delta.Dot(axis));
      if (radial.SquareMagnitude() <= 0.0) return false;
      radial.Normalize();
      normal = radial.Multiplied(std::cos(cone.SemiAngle())) -
               axis.Multiplied(std::sin(cone.SemiAngle()));
      if (normal.SquareMagnitude() <= 0.0) return false;
      output = gp_Dir(normal);
      break;
    }
    case GeomAbs_Torus: {
      const gp_Torus torus = surface.Torus();
      const gp_Vec axis(torus.Axis().Direction());
      const gp_Vec delta(torus.Location(), at);
      gp_Vec radial = delta - axis.Multiplied(delta.Dot(axis));
      if (radial.SquareMagnitude() <= 0.0) return false;
      radial.Normalize();
      const gp_Pnt tube_center =
          torus.Location().Translated(radial.Multiplied(torus.MajorRadius()));
      normal = gp_Vec(tube_center, at);
      if (normal.SquareMagnitude() <= 0.0) return false;
      output = gp_Dir(normal);
      break;
    }
    default: return false;
  }
  if (face.Orientation() == TopAbs_REVERSED) output.Reverse();
  return face.Orientation() == TopAbs_FORWARD ||
         face.Orientation() == TopAbs_REVERSED;
}

double surface_distance(const TopoDS_Face& face, const gp_Pnt& point_value) {
  const BRepAdaptor_Surface surface(face);
  switch (surface.GetType()) {
    case GeomAbs_Plane: return surface.Plane().Distance(point_value);
    case GeomAbs_Cylinder: {
      const gp_Cylinder cylinder = surface.Cylinder();
      return std::abs(gp_Lin(cylinder.Axis()).Distance(point_value) -
                      cylinder.Radius());
    }
    case GeomAbs_Cone: {
      const gp_Cone cone = surface.Cone();
      const gp_Vec axis(cone.Axis().Direction());
      const gp_Vec delta(cone.Location(), point_value);
      const double along = delta.Dot(axis);
      const double radial =
          (delta - axis.Multiplied(along)).Magnitude();
      const double expected =
          cone.RefRadius() + along * std::tan(cone.SemiAngle());
      return std::abs(radial - expected) *
             std::abs(std::cos(cone.SemiAngle()));
    }
    case GeomAbs_Torus: {
      const gp_Torus torus = surface.Torus();
      const gp_Vec axis(torus.Axis().Direction());
      const gp_Vec delta(torus.Location(), point_value);
      gp_Vec radial = delta - axis.Multiplied(delta.Dot(axis));
      if (radial.SquareMagnitude() <= 0.0) {
        return std::numeric_limits<double>::infinity();
      }
      radial.Normalize();
      const gp_Pnt tube_center =
          torus.Location().Translated(radial.Multiplied(torus.MajorRadius()));
      return std::abs(tube_center.Distance(point_value) -
                      torus.MinorRadius());
    }
    default: return std::numeric_limits<double>::infinity();
  }
}

double parallel_residual(const gp_Dir& left, const gp_Dir& right,
                         double scale) {
  return gp_Vec(left).Crossed(gp_Vec(right)).Magnitude() * scale;
}

double axis_distance(const gp_Ax1& left, const gp_Ax1& right) {
  const gp_Vec offset(left.Location(), right.Location());
  return offset.Crossed(gp_Vec(left.Direction())).Magnitude();
}

bool plane_intersection(const gp_Pln& left, const gp_Pln& right,
                        gp_Lin& output) {
  const gp_Vec left_normal(left.Axis().Direction());
  const gp_Vec right_normal(right.Axis().Direction());
  const gp_Vec direction_value = left_normal.Crossed(right_normal);
  const double denominator = direction_value.SquareMagnitude();
  if (!std::isfinite(denominator) || denominator <= 0.0) return false;
  // Solve relative to one source plane, avoiding subtraction of two large
  // world-origin offsets after a located occurrence has been translated.
  const double offset = right_normal.Dot(
      gp_Vec(left.Location(), right.Location()));
  const gp_Pnt location = left.Location().Translated(
      direction_value.Crossed(left_normal).Multiplied(offset / denominator));
  if (!std::isfinite(location.X()) || !std::isfinite(location.Y()) ||
      !std::isfinite(location.Z())) return false;
  output = gp_Lin(location, gp_Dir(direction_value));
  return true;
}

bool append_residual(EdgeTreatmentCertificateData& certificate, int kind,
                     double value, double limit, double scale) {
  if (!std::isfinite(value) || value < 0.0 || !std::isfinite(limit) ||
      limit < 0.0 || !std::isfinite(scale) || scale <= 0.0 ||
      certificate.residuals.size() == kMaximumEdgeTreatmentResiduals) {
    return false;
  }
  certificate.residuals.push_back({kind, value, limit, scale});
  return true;
}

bool collect_edge_treatment_boundary(
    const TopoDS_Face& face, BoreSolidContext& owner,
    std::vector<EdgeTreatmentUseData>& output, uint32_t& wire_count,
    int& reason, bool require_single_wire = true) {
  wire_count = 0;
  for (TopExp_Explorer wires(face, TopAbs_WIRE); wires.More(); wires.Next()) {
    if (wire_count == std::numeric_limits<uint32_t>::max()) {
      reason = GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM;
      return false;
    }
    const TopoDS_Wire wire = TopoDS::Wire(wires.Current());
    size_t children = 0;
    for (TopoDS_Iterator child(wire); child.More(); child.Next()) {
      if (child.Value().ShapeType() != TopAbs_EDGE) {
        reason = GEOSPEC_OCCT_EDGE_TREATMENT_INCOMPLETE_BOUNDARY;
        return false;
      }
      ++children;
    }
    size_t visited = 0;
    for (BRepTools_WireExplorer edges(wire, face); edges.More(); edges.Next()) {
      ++visited;
      if (output.size() == kMaximumEdgeTreatmentBoundaryUses) {
        reason = GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM;
        return false;
      }
      const TopoDS_Edge edge = edges.Current();
      if ((edge.Orientation() != TopAbs_FORWARD &&
           edge.Orientation() != TopAbs_REVERSED) ||
          BRep_Tool::Degenerated(edge)) {
        reason = GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT;
        return false;
      }
      const int edge_ordinal = owner.edges.FindIndex(edge);
      const int incidence = owner.edge_faces.FindIndex(edge);
      if (edge_ordinal <= 0 || incidence <= 0) {
        reason = GEOSPEC_OCCT_EDGE_TREATMENT_INCOMPLETE_BOUNDARY;
        return false;
      }
      TopoDS_Face adjacent;
      size_t candidate_count = 0;
      size_t adjacent_count = 0;
      for (NCollection_List<TopoDS_Shape>::Iterator iterator(
               owner.edge_faces.FindFromIndex(incidence));
           iterator.More(); iterator.Next()) {
        const TopoDS_Face member = TopoDS::Face(iterator.Value());
        if (member.IsSame(face)) {
          ++candidate_count;
        } else if (adjacent.IsNull() || adjacent.IsSame(member)) {
          adjacent = member;
          ++adjacent_count;
        } else {
          ++adjacent_count;
        }
      }
      const bool seam = BRep_Tool::IsClosed(edge, face);
      if ((!seam && (candidate_count != 1 || adjacent_count != 1)) ||
          (seam && (candidate_count != 2 || adjacent_count != 0))) {
        reason = GEOSPEC_OCCT_EDGE_TREATMENT_INCOMPLETE_BOUNDARY;
        return false;
      }
      if (!seam) {
        TopAbs_Orientation adjacent_use;
        if (!directed_edge_use(adjacent, edge, adjacent_use) ||
            adjacent_use == edge.Orientation()) {
          reason = GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_ORIENTATION;
          return false;
        }
      }

      BRepAdaptor_Curve curve(edge);
      const double first = curve.FirstParameter();
      const double last = curve.LastParameter();
      GProp_GProps properties;
      BRepGProp::LinearProperties(edge, properties);
      const double length = properties.Mass();
      TopoDS_Vertex start;
      TopoDS_Vertex end;
      TopExp::Vertices(edge, start, end, true);
      if (start.IsNull() || end.IsNull() || !std::isfinite(first) ||
          !std::isfinite(last) || first >= last || !std::isfinite(length) ||
          length <= 0.0) {
        reason = GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT;
        return false;
      }
      const double edge_tolerance = BRep_Tool::Tolerance(edge);
      const double start_tolerance = BRep_Tool::Tolerance(start);
      const double end_tolerance = BRep_Tool::Tolerance(end);
      if (!std::isfinite(edge_tolerance) || edge_tolerance < 0.0 ||
          !std::isfinite(start_tolerance) || start_tolerance < 0.0 ||
          !std::isfinite(end_tolerance) || end_tolerance < 0.0) {
        reason = GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT;
        return false;
      }
      EdgeTreatmentUseData use;
      use.edge = edge;
      use.adjacent = adjacent;
      use.value.owning_solid_edge_ordinal =
          static_cast<uint32_t>(edge_ordinal);
      use.value.wire_ordinal = wire_count;
      use.value.reversed = edge.Orientation() == TopAbs_REVERSED ? 1 : 0;
      use.value.seam = seam ? 1 : 0;
      use.value.role = seam ? GEOSPEC_OCCT_EDGE_TREATMENT_SEAM
                            : GEOSPEC_OCCT_EDGE_TREATMENT_END;
      use.value.curve = edge_facts(edge, static_cast<uint32_t>(edge_ordinal)).facts;
      use.value.parameter_range[0] = first;
      use.value.parameter_range[1] = last;
      point(use.value.start, BRep_Tool::Pnt(start));
      point(use.value.end, BRep_Tool::Pnt(end));
      use.value.curve.length = length;
      use.value.edge_tolerance_mm = edge_tolerance;
      use.value.vertex_tolerances_mm[0] = start_tolerance;
      use.value.vertex_tolerances_mm[1] = end_tolerance;
      use.maximum_tolerance =
          std::max({BRep_Tool::Tolerance(face), edge_tolerance,
                    start_tolerance, end_tolerance,
                    adjacent.IsNull() ? 0.0 : BRep_Tool::Tolerance(adjacent)});
      output.push_back(std::move(use));
    }
    if (visited != children) {
      throw Standard_Failure("Edge-treatment boundary traversal is incomplete.");
    }
    ++wire_count;
  }
  if ((require_single_wire && wire_count != 1) || output.empty()) {
    reason = GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM;
    return false;
  }
  return true;
}

bool support_transfer(
    const std::vector<FaceView>& public_faces,
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>&
        public_face_map,
    const std::vector<std::vector<size_t>>& public_face_ordinals,
    const TopoDS_Face& face, double maximum_tolerance,
    geospec_occt_edge_treatment_support& output) {
  const int public_face = indexed_public_face(
      public_face_map, public_face_ordinals, public_faces, face);
  if (public_face <= 0) return false;
  const FaceView& view = public_faces[static_cast<size_t>(public_face - 1)];
  if (view.query_index == 0) return false;
  output.public_face_ordinal = static_cast<uint32_t>(public_face - 1);
  output.private_query_face = view.query_index;
  output.surface = face_facts(face, output.public_face_ordinal,
                              output.private_query_face)
                       .facts;
  output.transferred_reversed =
      face.Orientation() == TopAbs_REVERSED ? 1 : 0;
  output.maximum_topology_tolerance_mm = maximum_tolerance;
  return true;
}

bool valid_full_u(const BRepAdaptor_Surface& surface, bool expected_full,
                  double tolerance, double scale, double& span) {
  span = surface.LastUParameter() - surface.FirstUParameter();
  if (!std::isfinite(span) || span <= 0.0 || !std::isfinite(tolerance) ||
      tolerance < 0.0 || !std::isfinite(scale) || scale <= 0.0) return false;
  if (!surface.IsUPeriodic()) return !expected_full;
  const double period = surface.UPeriod();
  if (!std::isfinite(period) || period <= 0.0) return false;
  const bool full = std::abs(span - period) * scale <= tolerance;
  return expected_full ? full : span < period && !full;
}

bool valid_full_seam(const std::vector<EdgeTreatmentUseData>& uses) {
  std::vector<const EdgeTreatmentUseData*> seams;
  for (const EdgeTreatmentUseData& use : uses) {
    if (use.value.seam != 0) seams.push_back(&use);
  }
  return seams.size() == 2 && seams[0]->edge.IsSame(seams[1]->edge) &&
         seams[0]->value.reversed != seams[1]->value.reversed;
}

std::vector<size_t> rails_with_support_type(
    const std::vector<EdgeTreatmentUseData>& uses, GeomAbs_SurfaceType type,
    GeomAbs_CurveType curve_type_value) {
  std::vector<size_t> result;
  for (size_t index = 0; index < uses.size(); ++index) {
    const EdgeTreatmentUseData& use = uses[index];
    if (use.value.seam != 0 || use.adjacent.IsNull()) continue;
    if (BRepAdaptor_Surface(use.adjacent).GetType() == type &&
        BRepAdaptor_Curve(use.edge).GetType() == curve_type_value) {
      result.push_back(index);
    }
  }
  return result;
}

void assign_rail_roles(std::vector<EdgeTreatmentUseData>& uses,
                       size_t first, size_t second) {
  uses[first].value.role = GEOSPEC_OCCT_EDGE_TREATMENT_RAIL0;
  uses[second].value.role = GEOSPEC_OCCT_EDGE_TREATMENT_RAIL1;
}

std::unique_ptr<EdgeTreatmentCertificateData> certificate_base(
    int kind, const FaceView& view, uint32_t public_ordinal,
    uint32_t wire_count, double maximum_tolerance,
    const geospec_occt_edge_treatment_support& first,
    const geospec_occt_edge_treatment_support& second,
    const std::vector<EdgeTreatmentUseData>& uses) {
  auto result = std::make_unique<EdgeTreatmentCertificateData>();
  result->value.kind = kind;
  result->value.surface =
      face_facts(view.shape, public_ordinal, view.query_index).facts;
  result->value.supports[0] = first;
  result->value.supports[1] = second;
  result->value.wire_count = wire_count;
  result->value.maximum_topology_tolerance_mm = maximum_tolerance;
  result->boundary_uses.reserve(uses.size());
  for (const EdgeTreatmentUseData& use : uses) {
    result->boundary_uses.push_back(use.value);
  }
  return result;
}

EdgeTreatmentDispositionData unqualified_edge_treatment(int reason) {
  return {GEOSPEC_OCCT_EDGE_TREATMENT_UNQUALIFIED, reason, nullptr};
}

EdgeTreatmentDispositionData nonmember_edge_treatment(int reason) {
  return {GEOSPEC_OCCT_EDGE_TREATMENT_NON_MEMBER, reason, nullptr};
}

EdgeTreatmentDispositionData qualified_edge_treatment(
    std::unique_ptr<EdgeTreatmentCertificateData> certificate) {
  certificate->value.boundary_use_count = certificate->boundary_uses.size();
  certificate->value.residual_count = certificate->residuals.size();
  return {GEOSPEC_OCCT_EDGE_TREATMENT_QUALIFIED, 0,
          std::move(certificate)};
}

// Four straight pcurves prove the complete selected rectangle, including both
// ends or both seam uses. Endpoint agreement alone is not a curved-trim proof.
bool rectangular_edge_treatment_trim(
    const TopoDS_Face& face, const std::vector<EdgeTreatmentUseData>& uses,
    bool rails_on_u, double u_scale, double v_scale,
    EdgeTreatmentCertificateData& certificate) {
  if (uses.size() != 4 || !std::isfinite(u_scale) || u_scale <= 0.0 ||
      !std::isfinite(v_scale) || v_scale <= 0.0) return false;
  const BRepAdaptor_Surface surface(face);
  const double u[2] = {surface.FirstUParameter(), surface.LastUParameter()};
  const double v[2] = {surface.FirstVParameter(), surface.LastVParameter()};
  if (!std::isfinite(u[0]) || !std::isfinite(u[1]) || u[0] >= u[1] ||
      !std::isfinite(v[0]) || !std::isfinite(v[1]) || v[0] >= v[1]) return false;
  unsigned sides = 0;
  for (const EdgeTreatmentUseData& use : uses) {
    BRepAdaptor_Curve2d trim(use.edge, face);
    if (trim.GetType() != GeomAbs_Line ||
        !std::isfinite(trim.FirstParameter()) ||
        !std::isfinite(trim.LastParameter()) ||
        trim.FirstParameter() >= trim.LastParameter()) return false;
    gp_Pnt2d a = trim.Value(trim.FirstParameter());
    gp_Pnt2d b = trim.Value(trim.LastParameter());
    if (use.value.reversed) std::swap(a, b);
    if (!std::isfinite(a.X()) || !std::isfinite(a.Y()) ||
        !std::isfinite(b.X()) || !std::isfinite(b.Y())) return false;
    const auto distance = [&](const gp_Pnt2d& p, double x, double y) {
      return std::abs(p.X() - x) * u_scale + std::abs(p.Y() - y) * v_scale;
    };
    int matched = -1;
    double residual = 0.0;
    for (int side = 0; side < 4; ++side) {
      const bool constant_u = side < 2;
      const int endpoint = side % 2;
      const double x0 = constant_u ? u[endpoint] : u[0];
      const double x1 = constant_u ? u[endpoint] : u[1];
      const double y0 = constant_u ? v[0] : v[endpoint];
      const double y1 = constant_u ? v[1] : v[endpoint];
      const double error = std::min(
          std::max(distance(a, x0, y0), distance(b, x1, y1)),
          std::max(distance(b, x0, y0), distance(a, x1, y1)));
      if (error <= use.maximum_tolerance) {
        if (matched >= 0) return false;
        matched = side;
        residual = error;
      }
    }
    if (matched < 0 || (sides & (1u << matched))) return false;
    sides |= 1u << matched;
    const bool rail = use.value.role == GEOSPEC_OCCT_EDGE_TREATMENT_RAIL0 ||
                      use.value.role == GEOSPEC_OCCT_EDGE_TREATMENT_RAIL1;
    if (rail != ((matched < 2) == rails_on_u)) return false;
    const gp_Pnt start(use.value.start[0], use.value.start[1], use.value.start[2]);
    const gp_Pnt end(use.value.end[0], use.value.end[1], use.value.end[2]);
    residual = std::max({residual, surface.Value(a.X(), a.Y()).Distance(start),
                         surface.Value(b.X(), b.Y()).Distance(end)});
    const BRepAdaptor_Curve curve(use.edge);
    if (matched >= 2) {
      // Constant V is a circle for each admitted revolution surface. Verify
      // the whole analytic circle and its angular span, not only the seam point.
      if (curve.GetType() != GeomAbs_Circle) return false;
      const gp_Ax1 axis = surface.GetType() == GeomAbs_Cylinder
                              ? surface.Cylinder().Axis()
                              : surface.GetType() == GeomAbs_Cone
                                    ? surface.Cone().Axis() : surface.Torus().Axis();
      const gp_Circ circle = curve.Circle();
      const gp_Pnt p = surface.Value(u[0], v[matched - 2]);
      const gp_Vec d(axis.Location(), p);
      const gp_Vec axis_vector(axis.Direction());
      const gp_Pnt center = axis.Location().Translated(
          axis_vector.Multiplied(d.Dot(axis_vector)));
      const double radius = center.Distance(p);
      residual = std::max({residual, center.Distance(circle.Location()),
          std::abs(radius - circle.Radius()),
          parallel_residual(axis.Direction(), circle.Axis().Direction(),
                            use.value.curve.length),
          std::abs((curve.LastParameter() - curve.FirstParameter()) -
                   (u[1] - u[0])) * radius});
    } else if (surface.GetType() != GeomAbs_Torus) {
      if (curve.GetType() != GeomAbs_Line) return false;
    } else {
      if (curve.GetType() != GeomAbs_Circle) return false;
      const gp_Torus torus = surface.Torus();
      const gp_Pnt p = surface.Value(u[matched], v[0]);
      const gp_Vec axis(torus.Axis().Direction());
      const gp_Vec d(torus.Location(), p);
      gp_Vec radial = d - axis.Multiplied(d.Dot(axis));
      if (radial.SquareMagnitude() <= 0.0) return false;
      radial.Normalize();
      const gp_Pnt center = torus.Location().Translated(
          radial.Multiplied(torus.MajorRadius()));
      const gp_Circ circle = curve.Circle();
      residual = std::max({residual, center.Distance(circle.Location()),
          std::abs(circle.Radius() - torus.MinorRadius()),
          parallel_residual(gp_Dir(axis.Crossed(radial)),
                            circle.Axis().Direction(), use.value.curve.length),
          std::abs((curve.LastParameter() - curve.FirstParameter()) -
                   (v[1] - v[0])) * torus.MinorRadius()});
    }
    if (!append_residual(certificate, GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION,
                         residual, use.maximum_tolerance, 1.0) ||
        residual > use.maximum_tolerance) return false;
  }
  return sides == 15;
}

EdgeTreatmentDispositionData classify_planar_chamfer(
    const FaceView& view, uint32_t public_ordinal,
    const std::vector<FaceView>& public_faces,
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>&
        public_face_map,
    const std::vector<std::vector<size_t>>& public_face_ordinals,
    BoreSolidContext& owner) {
  std::vector<EdgeTreatmentUseData> uses;
  uint32_t wire_count = 0;
  int reason = 0;
  // Complete bounded multiwire collection permits necessary-rail exclusion;
  // it does not admit a perforated transition as a qualified chamfer.
  if (!collect_edge_treatment_boundary(view.shape, owner, uses, wire_count,
                                       reason, false)) {
    return unqualified_edge_treatment(reason);
  }
  const std::vector<size_t> candidates = rails_with_support_type(
      uses, GeomAbs_Plane, GeomAbs_Line);
  // Absence of necessary straight/planar rails can decide elementary caps
  // before the stricter four-use admission gate. A spline/unknown boundary or
  // support is not an analytic exclusion, even if no recognized pair remains.
  int unresolved = 0;
  for (const EdgeTreatmentUseData& use : uses) {
    const GeomAbs_CurveType curve = BRepAdaptor_Curve(use.edge).GetType();
    if (curve == GeomAbs_BezierCurve || curve == GeomAbs_BSplineCurve ||
        curve == GeomAbs_OtherCurve) {
      unresolved = GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM;
    }
    if (!use.adjacent.IsNull() && !transition_surface(use.adjacent)) {
      unresolved = GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_SURFACE;
    }
  }
  std::vector<size_t> rails;
  for (size_t first : candidates) {
    for (size_t second : candidates) {
      if (second <= first ||
          uses[first].adjacent.IsSame(uses[second].adjacent)) continue;
      const gp_Pln first_plane = BRepAdaptor_Surface(uses[first].adjacent).Plane();
      const gp_Pln second_plane = BRepAdaptor_Surface(uses[second].adjacent).Plane();
      const double scale = std::min(uses[first].value.curve.length,
                                    uses[second].value.curve.length);
      const double tolerance = std::max(uses[first].maximum_tolerance,
                                        uses[second].maximum_tolerance);
      if (scale <= tolerance) {
        unresolved = GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT;
        continue;
      }
      // In the declared nominal profile, parallel supports cannot bound a
      // nondegenerate sharp edge. Test this before dividing by |n0 x n1|^2;
      // round-trip rotation noise must not invent a remote intersection.
      if (parallel_residual(first_plane.Axis().Direction(),
                            second_plane.Axis().Direction(), scale) <=
          tolerance) continue;
      gp_Lin intersection;
      if (!plane_intersection(first_plane, second_plane, intersection)) {
        unresolved = GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT;
        continue;
      }
      if (parallel_residual(BRepAdaptor_Curve(uses[first].edge).Line().Direction(),
                            intersection.Direction(), uses[first].value.curve.length) >
              uses[first].maximum_tolerance ||
          parallel_residual(BRepAdaptor_Curve(uses[second].edge).Line().Direction(),
                            intersection.Direction(), uses[second].value.curve.length) >
              uses[second].maximum_tolerance) continue;
      if (wire_count != 1 || uses.size() != 4 || (first + 2) % 4 != second) {
        return unqualified_edge_treatment(
            GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM);
      }
      if (!rails.empty()) return unqualified_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_AMBIGUOUS_ASSOCIATION);
      rails = {first, second};
    }
  }
  if (unresolved) {
    return unqualified_edge_treatment(unresolved);
  }
  if (rails.size() != 2) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
  }
  geospec_occt_edge_treatment_support supports[2]{};
  if (!support_transfer(public_faces, public_face_map, public_face_ordinals,
                        uses[rails[0]].adjacent,
                        uses[rails[0]].maximum_tolerance, supports[0]) ||
      !support_transfer(public_faces, public_face_map, public_face_ordinals,
                        uses[rails[1]].adjacent,
                        uses[rails[1]].maximum_tolerance, supports[1])) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_AMBIGUOUS_ASSOCIATION);
  }
  if (supports[1].public_face_ordinal < supports[0].public_face_ordinal) {
    std::swap(rails[0], rails[1]);
    std::swap(supports[0], supports[1]);
  }
  assign_rail_roles(uses, rails[0], rails[1]);
  const gp_Pln planes[2] = {
      BRepAdaptor_Surface(uses[rails[0]].adjacent).Plane(),
      BRepAdaptor_Surface(uses[rails[1]].adjacent).Plane()};
  gp_Lin sharp;
  if (!plane_intersection(planes[0], planes[1], sharp)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  const gp_Pnt rail_points[2] = {midpoint(uses[rails[0]].value),
                                 midpoint(uses[rails[1]].value)};
  const double offsets[2] = {sharp.Distance(rail_points[0]),
                             sharp.Distance(rail_points[1])};
  const double limit = std::max(uses[rails[0]].maximum_tolerance,
                                uses[rails[1]].maximum_tolerance);
  if (!std::isfinite(offsets[0]) || !std::isfinite(offsets[1]) ||
      offsets[0] <= limit || offsets[1] <= limit) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  auto certificate = certificate_base(
      GEOSPEC_OCCT_EDGE_TREATMENT_PLANAR_CHAMFER, view, public_ordinal,
      wire_count, owner.maximum_tolerance, supports[0], supports[1], uses);
  const gp_Dir sharp_direction = sharp.Direction();
  for (size_t index = 0; index < 2; ++index) {
    const EdgeTreatmentUseData& rail = uses[rails[index]];
    const BRepAdaptor_Curve curve(rail.edge);
    const double scale = rail.value.curve.length;
    const double direction_value = parallel_residual(
        curve.Line().Direction(), sharp_direction, scale);
    const gp_Pnt start(rail.value.start[0], rail.value.start[1],
                       rail.value.start[2]);
    const gp_Pnt end(rail.value.end[0], rail.value.end[1],
                     rail.value.end[2]);
    const double coincidence =
        std::max({surface_distance(view.shape, start),
                  surface_distance(view.shape, end),
                  surface_distance(rail.adjacent, start),
                  surface_distance(rail.adjacent, end)});
    const double station = std::max(std::abs(sharp.Distance(start) - offsets[index]),
                                    std::abs(sharp.Distance(end) - offsets[index]));
    if (!append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_COINCIDENCE,
                         coincidence, rail.maximum_tolerance, 1.0) ||
        !append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_PARALLEL_DIRECTION,
                         direction_value, rail.maximum_tolerance, scale) ||
        !append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION, station,
                         rail.maximum_tolerance, 1.0)) {
      return unqualified_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
    }
    if (coincidence > rail.maximum_tolerance ||
        direction_value > rail.maximum_tolerance ||
        station > rail.maximum_tolerance) {
      return nonmember_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
    }
  }
  const double equal_offsets = std::abs(offsets[0] - offsets[1]);
  if (!append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_EQUAL_OFFSETS,
                       equal_offsets, limit, 1.0)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  if (equal_offsets > limit) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_UNEQUAL_OFFSETS);
  }
  gp_Dir candidate_normal;
  gp_Dir support_normals[2];
  if (!natural_surface_normal(view.shape, rail_points[0], candidate_normal) ||
      !natural_surface_normal(uses[rails[0]].adjacent, rail_points[0],
                              support_normals[0]) ||
      !natural_surface_normal(uses[rails[1]].adjacent, rail_points[1],
                              support_normals[1])) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_ORIENTATION);
  }
  gp_Vec bisector = gp_Vec(support_normals[0]) + gp_Vec(support_normals[1]);
  if (bisector.SquareMagnitude() <= 0.0) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  bisector.Normalize();
  const double material_dot = candidate_normal.Dot(gp_Dir(bisector));
  const double material_scale =
      std::min(uses[rails[0]].value.curve.length,
               uses[rails[1]].value.curve.length);
  const double material_residual =
      parallel_residual(candidate_normal, gp_Dir(bisector), material_scale);
  if (!append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_MATERIAL_BRANCH,
                       material_residual, limit, material_scale)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_ORIENTATION);
  }
  if (material_residual > limit || material_dot <= 0.0) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_MATERIAL_BRANCH);
  }
  const double material_offsets[2] = {
      gp_Vec(planes[1].Location(), rail_points[0]).Dot(gp_Vec(support_normals[1])),
      gp_Vec(planes[0].Location(), rail_points[1]).Dot(gp_Vec(support_normals[0]))};
  if (std::abs(material_offsets[0]) <= limit ||
      std::abs(material_offsets[1]) <= limit ||
      (material_offsets[0] > 0.0) != (material_offsets[1] > 0.0)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_MATERIAL_BRANCH);
  }
  // The two straight ends must join matching axial stations of both rails.
  // Together with the complete four-use wire this excludes tapered/crossed trims.
  for (const EdgeTreatmentUseData& end_use : uses) {
    if (end_use.value.role != GEOSPEC_OCCT_EDGE_TREATMENT_END) continue;
    if (BRepAdaptor_Curve(end_use.edge).GetType() != GeomAbs_Line) {
      return unqualified_edge_treatment(GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM);
    }
    const gp_Pnt a(end_use.value.start[0], end_use.value.start[1], end_use.value.start[2]);
    const gp_Pnt b(end_use.value.end[0], end_use.value.end[1], end_use.value.end[2]);
    const double residual = std::max({surface_distance(view.shape, a),
        surface_distance(view.shape, b),
        std::abs(gp_Vec(a, b).Dot(gp_Vec(sharp_direction)))});
    if (!append_residual(*certificate, GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION,
                         residual, end_use.maximum_tolerance, 1.0) ||
        residual > end_use.maximum_tolerance) {
      return unqualified_edge_treatment(GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM);
    }
  }
  const gp_Vec transverse =
      gp_Vec(candidate_normal).Crossed(gp_Vec(sharp_direction));
  if (transverse.SquareMagnitude() <= 0.0) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  const gp_Dir transverse_direction(transverse);
  const double stations[2] = {
      gp_Vec(rail_points[0].X(), rail_points[0].Y(), rail_points[0].Z())
          .Dot(gp_Vec(transverse_direction)),
      gp_Vec(rail_points[1].X(), rail_points[1].Y(), rail_points[1].Z())
          .Dot(gp_Vec(transverse_direction))};
  certificate->value.metric_value_mm = offsets[0];
  certificate->value.material_side =
      material_offsets[0] < 0.0 ? GEOSPEC_OCCT_EDGE_TREATMENT_CONVEX
                                : GEOSPEC_OCCT_EDGE_TREATMENT_CONCAVE;
  certificate->value.full_u = 0;
  certificate->value.sweep_interval[0] = std::min(stations[0], stations[1]);
  certificate->value.sweep_interval[1] = std::max(stations[0], stations[1]);
  return qualified_edge_treatment(std::move(certificate));
}

EdgeTreatmentDispositionData classify_conical_chamfer(
    const FaceView& view, uint32_t public_ordinal,
    const std::vector<FaceView>& public_faces,
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>& map,
    const std::vector<std::vector<size_t>>& ordinals,
    BoreSolidContext& owner) {
  const BRepAdaptor_Surface candidate(view.shape);
  double u_span = 0.0;
  std::vector<EdgeTreatmentUseData> uses;
  uint32_t wire_count = 0;
  int reason = 0;
  if (!collect_edge_treatment_boundary(view.shape, owner, uses, wire_count,
                                       reason)) {
    return unqualified_edge_treatment(reason);
  }
  const std::vector<size_t> plane =
      rails_with_support_type(uses, GeomAbs_Plane, GeomAbs_Circle);
  const std::vector<size_t> cylinder =
      rails_with_support_type(uses, GeomAbs_Cylinder, GeomAbs_Circle);
  if (uses.size() != 4 || plane.size() != 1 || cylinder.size() != 1 ||
      !valid_full_seam(uses)) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
  }
  size_t rails[2] = {plane[0], cylinder[0]};
  geospec_occt_edge_treatment_support supports[2]{};
  if (!support_transfer(public_faces, map, ordinals, uses[rails[0]].adjacent,
                        uses[rails[0]].maximum_tolerance, supports[0]) ||
      !support_transfer(public_faces, map, ordinals, uses[rails[1]].adjacent,
                        uses[rails[1]].maximum_tolerance, supports[1])) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_AMBIGUOUS_ASSOCIATION);
  }
  if (supports[1].public_face_ordinal < supports[0].public_face_ordinal) {
    std::swap(rails[0], rails[1]);
    std::swap(supports[0], supports[1]);
  }
  assign_rail_roles(uses, rails[0], rails[1]);
  const gp_Cone cone = candidate.Cone();
  const gp_Ax1 axis = cone.Axis();
  const gp_Pln support_plane =
      BRepAdaptor_Surface(uses[plane[0]].adjacent).Plane();
  const gp_Cylinder support_cylinder =
      BRepAdaptor_Surface(uses[cylinder[0]].adjacent).Cylinder();
  const gp_Circ plane_circle = BRepAdaptor_Curve(uses[plane[0]].edge).Circle();
  const gp_Circ cylinder_circle =
      BRepAdaptor_Curve(uses[cylinder[0]].edge).Circle();
  const gp_Vec axis_vector(axis.Direction());
  const double plane_station =
      gp_Vec(axis.Location(), plane_circle.Location()).Dot(axis_vector);
  const double cylinder_station =
      gp_Vec(axis.Location(), cylinder_circle.Location()).Dot(axis_vector);
  const double metric = std::abs(cylinder_station - plane_station);
  const double radial_change =
      std::abs(cylinder_circle.Radius() - plane_circle.Radius());
  const double scale = std::min(uses[plane[0]].value.curve.length,
                                uses[cylinder[0]].value.curve.length);
  const double limit = std::max(uses[plane[0]].maximum_tolerance,
                                uses[cylinder[0]].maximum_tolerance);
  if (!valid_full_u(candidate, true, limit, scale, u_span) ||
      !std::isfinite(metric) || !std::isfinite(radial_change) ||
      metric <= limit || scale <= 0.0) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  auto certificate = certificate_base(
      GEOSPEC_OCCT_EDGE_TREATMENT_CONICAL_CHAMFER, view, public_ordinal,
      wire_count, owner.maximum_tolerance, supports[0], supports[1], uses);
  const double axis_gap = axis_distance(axis, support_cylinder.Axis());
  const double axis_direction = parallel_residual(
      axis.Direction(), support_cylinder.Axis().Direction(), scale);
  const double plane_direction = parallel_residual(
      axis.Direction(), support_plane.Axis().Direction(), scale);
  const double cone_angle =
      std::abs(std::abs(cone.SemiAngle()) - std::acos(-1.0) / 4.0);
  const double angle_residual = std::abs(std::sin(cone_angle)) * scale;
  const double equal_offsets = std::abs(metric - radial_change);
  const double plane_residual = support_plane.Distance(plane_circle.Location());
  const double cylinder_residual =
      std::max(axis_distance(axis, support_cylinder.Axis()),
               std::abs(cylinder_circle.Radius() -
                        support_cylinder.Radius()));
  if (!append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_AXIS_COINCIDENCE,
                       axis_gap, limit, 1.0) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_PARALLEL_DIRECTION,
                       axis_direction, limit, scale) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_PARALLEL_DIRECTION,
                       plane_direction, limit, scale) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_PARALLEL_DIRECTION,
                       angle_residual, limit, scale) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION,
                       plane_residual, uses[plane[0]].maximum_tolerance,
                       1.0) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION,
                       cylinder_residual,
                       uses[cylinder[0]].maximum_tolerance, 1.0) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_EQUAL_OFFSETS,
                       equal_offsets, limit, 1.0)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  if (equal_offsets > limit) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_UNEQUAL_OFFSETS);
  }
  if (axis_gap > limit || axis_direction > limit || plane_direction > limit ||
      angle_residual > limit || plane_residual > uses[plane[0]].maximum_tolerance ||
      cylinder_residual > uses[cylinder[0]].maximum_tolerance) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
  }
  gp_Dir candidate_normal;
  gp_Dir plane_normal;
  gp_Dir cylinder_normal;
  // Compare normals at the same angular phase; independently transferred
  // circular rails need not choose the same seam vertex.
  const gp_Pnt plane_point = BRepAdaptor_Curve(uses[plane[0]].edge).Value(
      BRepAdaptor_Curve(uses[plane[0]].edge).FirstParameter());
  gp_Vec radial(axis.Location(), plane_point);
  radial -= axis_vector.Multiplied(radial.Dot(axis_vector));
  if (radial.SquareMagnitude() <= 0.0) {
    return unqualified_edge_treatment(GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  radial.Normalize();
  const gp_Pnt cylinder_point = cylinder_circle.Location().Translated(
      radial.Multiplied(cylinder_circle.Radius()));
  if (!natural_surface_normal(view.shape, plane_point, candidate_normal) ||
      !natural_surface_normal(uses[plane[0]].adjacent, plane_point,
                              plane_normal) ||
      !natural_surface_normal(uses[cylinder[0]].adjacent, cylinder_point,
                              cylinder_normal)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_ORIENTATION);
  }
  gp_Vec bisector = gp_Vec(plane_normal) + gp_Vec(cylinder_normal);
  if (bisector.SquareMagnitude() <= 0.0) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  bisector.Normalize();
  const double material_dot = candidate_normal.Dot(gp_Dir(bisector));
  const double material_residual =
      parallel_residual(candidate_normal, gp_Dir(bisector), scale);
  if (!append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_MATERIAL_BRANCH,
                       material_residual, limit, scale)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_ORIENTATION);
  }
  if (material_residual > limit || material_dot <= 0.0) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_MATERIAL_BRANCH);
  }
  const double signed_plane = gp_Vec(support_plane.Location(), cylinder_point)
                                  .Dot(gp_Vec(plane_normal));
  const double signed_cylinder = (plane_circle.Radius() - support_cylinder.Radius()) *
                                 radial.Dot(gp_Vec(cylinder_normal));
  if (std::abs(signed_plane) <= limit || std::abs(signed_cylinder) <= limit ||
      (signed_plane > 0.0) != (signed_cylinder > 0.0)) {
    return unqualified_edge_treatment(GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_MATERIAL_BRANCH);
  }
  certificate->value.metric_value_mm = metric;
  certificate->value.material_side =
      signed_plane < 0.0 ? GEOSPEC_OCCT_EDGE_TREATMENT_CONVEX
                          : GEOSPEC_OCCT_EDGE_TREATMENT_CONCAVE;
  certificate->value.full_u = 1;
  certificate->value.sweep_interval[0] = candidate.FirstVParameter();
  certificate->value.sweep_interval[1] = candidate.LastVParameter();
  if (!rectangular_edge_treatment_trim(view.shape, uses, false,
          std::max(plane_circle.Radius(), cylinder_circle.Radius()), 1.0,
          *certificate)) {
    return unqualified_edge_treatment(GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM);
  }
  return qualified_edge_treatment(std::move(certificate));
}

EdgeTreatmentDispositionData classify_cylindrical_fillet(
    const FaceView& view, uint32_t public_ordinal,
    const std::vector<FaceView>& public_faces,
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>& map,
    const std::vector<std::vector<size_t>>& ordinals,
    BoreSolidContext& owner) {
  const BRepAdaptor_Surface candidate(view.shape);
  double u_span = 0.0;
  std::vector<EdgeTreatmentUseData> uses;
  uint32_t wire_count = 0;
  int reason = 0;
  if (!collect_edge_treatment_boundary(view.shape, owner, uses, wire_count,
                                       reason)) {
    return unqualified_edge_treatment(reason);
  }
  std::vector<size_t> rails = rails_with_support_type(
      uses, GeomAbs_Plane, GeomAbs_Line);
  if (uses.size() != 4 || rails.size() != 2 ||
      uses[rails[0]].adjacent.IsSame(uses[rails[1]].adjacent)) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
  }
  geospec_occt_edge_treatment_support supports[2]{};
  if (!support_transfer(public_faces, map, ordinals, uses[rails[0]].adjacent,
                        uses[rails[0]].maximum_tolerance, supports[0]) ||
      !support_transfer(public_faces, map, ordinals, uses[rails[1]].adjacent,
                        uses[rails[1]].maximum_tolerance, supports[1])) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_AMBIGUOUS_ASSOCIATION);
  }
  if (supports[1].public_face_ordinal < supports[0].public_face_ordinal) {
    std::swap(rails[0], rails[1]);
    std::swap(supports[0], supports[1]);
  }
  assign_rail_roles(uses, rails[0], rails[1]);
  const gp_Cylinder cylinder = candidate.Cylinder();
  const double radius = cylinder.Radius();
  const double limit = std::max(uses[rails[0]].maximum_tolerance,
                                uses[rails[1]].maximum_tolerance);
  const double scale = std::min(uses[rails[0]].value.curve.length,
                                uses[rails[1]].value.curve.length);
  if (!valid_full_u(candidate, false, limit, scale, u_span) ||
      u_span >= std::acos(-1.0) ||
      !std::isfinite(radius) || radius <= limit) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  auto certificate = certificate_base(
      GEOSPEC_OCCT_EDGE_TREATMENT_CYLINDRICAL_FILLET, view,
      public_ordinal, wire_count, owner.maximum_tolerance, supports[0],
      supports[1], uses);
  double offsets[2]{};
  double worst_material = 0.0;
  for (size_t index = 0; index < 2; ++index) {
    const EdgeTreatmentUseData& rail = uses[rails[index]];
    const gp_Pln plane = BRepAdaptor_Surface(rail.adjacent).Plane();
    const BRepAdaptor_Curve curve(rail.edge);
    const double scale = rail.value.curve.length;
    offsets[index] = plane.Distance(cylinder.Location());
    const double direction_value = parallel_residual(
        curve.Line().Direction(), cylinder.Axis().Direction(), scale);
    const double plane_direction =
        std::abs(plane.Axis().Direction().Dot(cylinder.Axis().Direction())) *
        scale;
    const gp_Pnt at = midpoint(rail.value);
    gp_Dir candidate_normal;
    gp_Dir support_normal;
    if (!natural_surface_normal(view.shape, at, candidate_normal) ||
        !natural_surface_normal(rail.adjacent, at, support_normal)) {
      return unqualified_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_ORIENTATION);
    }
    const double dot = candidate_normal.Dot(support_normal);
    const double tangent =
        parallel_residual(candidate_normal, support_normal, scale);
    const double material = std::max(0.0, -dot) * scale;
    worst_material = std::max(worst_material, material);
    const gp_Pnt start(rail.value.start[0], rail.value.start[1],
                       rail.value.start[2]);
    const gp_Pnt end(rail.value.end[0], rail.value.end[1],
                     rail.value.end[2]);
    const double coincidence =
        std::max({surface_distance(view.shape, start),
                  surface_distance(view.shape, end),
                  surface_distance(rail.adjacent, start),
                  surface_distance(rail.adjacent, end)});
    const double station = std::abs(offsets[index] - radius);
    if (!append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_COINCIDENCE,
                         coincidence, rail.maximum_tolerance, 1.0) ||
        !append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_PARALLEL_DIRECTION,
                         direction_value, rail.maximum_tolerance, scale) ||
        !append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_PARALLEL_DIRECTION,
                         plane_direction, rail.maximum_tolerance, scale) ||
        !append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_TANGENT_DIRECTION,
                         tangent, rail.maximum_tolerance, scale) ||
        !append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION, station,
                         rail.maximum_tolerance, 1.0)) {
      return unqualified_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
    }
    if (tangent > rail.maximum_tolerance) {
      return nonmember_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_NON_TANGENT_SUPPORT);
    }
    if (material > rail.maximum_tolerance) {
      return nonmember_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_MATERIAL_BRANCH);
    }
    if (coincidence > rail.maximum_tolerance ||
        direction_value > rail.maximum_tolerance ||
        plane_direction > rail.maximum_tolerance ||
        station > rail.maximum_tolerance) {
      return nonmember_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
    }
  }
  const double equal_offsets = std::abs(offsets[0] - offsets[1]);
  if (!append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_EQUAL_OFFSETS,
                       equal_offsets, limit, 1.0) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_MATERIAL_BRANCH,
                       worst_material, limit,
                       std::min(uses[rails[0]].value.curve.length,
                                uses[rails[1]].value.curve.length))) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  if (equal_offsets > limit) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_UNEQUAL_OFFSETS);
  }
  certificate->value.metric_value_mm = radius;
  certificate->value.material_side =
      view.shape.Orientation() == TopAbs_REVERSED
          ? GEOSPEC_OCCT_EDGE_TREATMENT_CONCAVE
          : GEOSPEC_OCCT_EDGE_TREATMENT_CONVEX;
  certificate->value.full_u = 0;
  certificate->value.sweep_interval[0] = candidate.FirstUParameter();
  certificate->value.sweep_interval[1] = candidate.LastUParameter();
  if (!rectangular_edge_treatment_trim(view.shape, uses, true, radius, 1.0,
                                      *certificate)) {
    return unqualified_edge_treatment(GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM);
  }
  return qualified_edge_treatment(std::move(certificate));
}

EdgeTreatmentDispositionData classify_toroidal_fillet(
    const FaceView& view, uint32_t public_ordinal,
    const std::vector<FaceView>& public_faces,
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>& map,
    const std::vector<std::vector<size_t>>& ordinals,
    BoreSolidContext& owner) {
  const BRepAdaptor_Surface candidate(view.shape);
  double u_span = 0.0;
  std::vector<EdgeTreatmentUseData> uses;
  uint32_t wire_count = 0;
  int reason = 0;
  if (!collect_edge_treatment_boundary(view.shape, owner, uses, wire_count,
                                       reason)) {
    return unqualified_edge_treatment(reason);
  }
  const std::vector<size_t> plane =
      rails_with_support_type(uses, GeomAbs_Plane, GeomAbs_Circle);
  const std::vector<size_t> cylinder =
      rails_with_support_type(uses, GeomAbs_Cylinder, GeomAbs_Circle);
  if (uses.size() != 4 || plane.size() != 1 || cylinder.size() != 1 ||
      !valid_full_seam(uses)) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
  }
  size_t rails[2] = {plane[0], cylinder[0]};
  geospec_occt_edge_treatment_support supports[2]{};
  if (!support_transfer(public_faces, map, ordinals, uses[rails[0]].adjacent,
                        uses[rails[0]].maximum_tolerance, supports[0]) ||
      !support_transfer(public_faces, map, ordinals, uses[rails[1]].adjacent,
                        uses[rails[1]].maximum_tolerance, supports[1])) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_AMBIGUOUS_ASSOCIATION);
  }
  if (supports[1].public_face_ordinal < supports[0].public_face_ordinal) {
    std::swap(rails[0], rails[1]);
    std::swap(supports[0], supports[1]);
  }
  assign_rail_roles(uses, rails[0], rails[1]);
  const gp_Torus torus = candidate.Torus();
  const gp_Pln support_plane =
      BRepAdaptor_Surface(uses[plane[0]].adjacent).Plane();
  const gp_Cylinder support_cylinder =
      BRepAdaptor_Surface(uses[cylinder[0]].adjacent).Cylinder();
  const gp_Circ plane_circle = BRepAdaptor_Curve(uses[plane[0]].edge).Circle();
  const gp_Circ cylinder_circle =
      BRepAdaptor_Curve(uses[cylinder[0]].edge).Circle();
  const double scale = std::min(uses[plane[0]].value.curve.length,
                                uses[cylinder[0]].value.curve.length);
  const double limit = std::max(uses[plane[0]].maximum_tolerance,
                                uses[cylinder[0]].maximum_tolerance);
  const double v_span =
      candidate.LastVParameter() - candidate.FirstVParameter();
  if (!valid_full_u(candidate, true, limit, scale, u_span) ||
      !std::isfinite(torus.MinorRadius()) || torus.MinorRadius() <= limit ||
      !std::isfinite(torus.MajorRadius()) ||
      torus.MajorRadius() - torus.MinorRadius() <= limit ||
      !std::isfinite(v_span) || v_span <= 0.0 || scale <= 0.0) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  auto certificate = certificate_base(
      GEOSPEC_OCCT_EDGE_TREATMENT_TOROIDAL_FILLET, view, public_ordinal,
      wire_count, owner.maximum_tolerance, supports[0], supports[1], uses);
  const double axis_gap =
      axis_distance(torus.Axis(), support_cylinder.Axis());
  const double axis_direction = parallel_residual(
      torus.Axis().Direction(), support_cylinder.Axis().Direction(), scale);
  const double plane_direction = parallel_residual(
      torus.Axis().Direction(), support_plane.Axis().Direction(), scale);
  const double sweep_residual =
      std::abs(v_span - std::acos(-1.0) / 2.0) * scale;
  const double plane_station =
      std::abs(gp_Vec(torus.Location(), plane_circle.Location())
                   .Dot(gp_Vec(torus.Axis().Direction())));
  const double plane_residual =
      std::max(support_plane.Distance(plane_circle.Location()),
               std::abs(plane_station - torus.MinorRadius()));
  const double cylinder_residual = std::max(
      std::abs(cylinder_circle.Radius() - support_cylinder.Radius()),
      std::abs(std::abs(cylinder_circle.Radius() - torus.MajorRadius()) -
               torus.MinorRadius()));
  if (!append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_AXIS_COINCIDENCE,
                       axis_gap, limit, 1.0) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_PARALLEL_DIRECTION,
                       axis_direction, limit, scale) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_PARALLEL_DIRECTION,
                       plane_direction, limit, scale) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION,
                       sweep_residual, limit, scale) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION,
                       plane_residual, uses[plane[0]].maximum_tolerance,
                       1.0) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_STATION,
                       cylinder_residual,
                       uses[cylinder[0]].maximum_tolerance, 1.0)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  if (axis_gap > limit || axis_direction > limit || plane_direction > limit ||
      sweep_residual > limit ||
      plane_residual > uses[plane[0]].maximum_tolerance ||
      cylinder_residual > uses[cylinder[0]].maximum_tolerance) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
  }
  double worst_tangent = 0.0;
  double worst_material = 0.0;
  for (size_t rail : {plane[0], cylinder[0]}) {
    const gp_Pnt at = midpoint(uses[rail].value);
    gp_Dir candidate_normal;
    gp_Dir support_normal;
    if (!natural_surface_normal(view.shape, at, candidate_normal) ||
        !natural_surface_normal(uses[rail].adjacent, at, support_normal)) {
      return unqualified_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_ORIENTATION);
    }
    const double dot = candidate_normal.Dot(support_normal);
    const double rail_scale = uses[rail].value.curve.length;
    const double tangent =
        parallel_residual(candidate_normal, support_normal, rail_scale);
    const double material = std::max(0.0, -dot) * rail_scale;
    worst_tangent = std::max(worst_tangent, tangent);
    worst_material = std::max(worst_material, material);
    const gp_Pnt start(uses[rail].value.start[0], uses[rail].value.start[1],
                       uses[rail].value.start[2]);
    const gp_Pnt end(uses[rail].value.end[0], uses[rail].value.end[1],
                     uses[rail].value.end[2]);
    const double coincidence =
        std::max({surface_distance(view.shape, start),
                  surface_distance(view.shape, end),
                  surface_distance(uses[rail].adjacent, start),
                  surface_distance(uses[rail].adjacent, end)});
    if (!append_residual(*certificate,
                         GEOSPEC_OCCT_EDGE_TREATMENT_RAIL_COINCIDENCE,
                         coincidence, uses[rail].maximum_tolerance, 1.0)) {
      return unqualified_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
    }
    if (coincidence > uses[rail].maximum_tolerance) {
      return nonmember_edge_treatment(
          GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_TOPOLOGY);
    }
  }
  if (!append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_TANGENT_DIRECTION,
                       worst_tangent, limit, scale) ||
      !append_residual(*certificate,
                       GEOSPEC_OCCT_EDGE_TREATMENT_MATERIAL_BRANCH,
                       worst_material, limit, scale)) {
    return unqualified_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_DEGENERATE_SUPPORT);
  }
  if (worst_tangent > limit) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_NON_TANGENT_SUPPORT);
  }
  if (worst_material > limit) {
    return nonmember_edge_treatment(
        GEOSPEC_OCCT_EDGE_TREATMENT_OUTSIDE_MATERIAL_BRANCH);
  }
  certificate->value.metric_value_mm = torus.MinorRadius();
  certificate->value.material_side =
      view.shape.Orientation() == TopAbs_REVERSED
          ? GEOSPEC_OCCT_EDGE_TREATMENT_CONCAVE
          : GEOSPEC_OCCT_EDGE_TREATMENT_CONVEX;
  certificate->value.full_u = 1;
  certificate->value.sweep_interval[0] = candidate.FirstVParameter();
  certificate->value.sweep_interval[1] = candidate.LastVParameter();
  if (!rectangular_edge_treatment_trim(view.shape, uses, false,
          torus.MajorRadius() + torus.MinorRadius(), torus.MinorRadius(),
          *certificate)) {
    return unqualified_edge_treatment(GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_TRIM);
  }
  return qualified_edge_treatment(std::move(certificate));
}

size_t edge_treatment_certificate_bytes(
    const EdgeTreatmentDispositionData& disposition) {
  if (!disposition.certificate) return 0;
  size_t total = sizeof(EdgeTreatmentCertificateData);
  size_t bytes = 0;
  if (!checked_product_size(disposition.certificate->boundary_uses.capacity(),
                            sizeof(geospec_occt_edge_treatment_boundary_use),
                            bytes) ||
      !checked_add_size(bytes, total) ||
      !checked_product_size(disposition.certificate->residuals.capacity(),
                            sizeof(geospec_occt_edge_treatment_residual),
                            bytes) ||
      !checked_add_size(bytes, total)) {
    return std::numeric_limits<size_t>::max();
  }
  return total;
}

bool edge_treatment_transfer_bytes(const EdgeTreatmentTransferData& transfer,
                                   size_t& output) {
  output = sizeof(EdgeTreatmentTransferData);
  size_t rows = 0;
  if (!checked_product_size(transfer.rows.capacity(),
                            sizeof(EdgeTreatmentRowData), rows) ||
      !checked_add_size(rows, output)) {
    return false;
  }
  for (const EdgeTreatmentRowData& row : transfer.rows) {
    for (const std::string* text :
         {&row.occurrence_path, &row.source_face_key, &row.label}) {
      if (!checked_add_size(text->capacity(), output) ||
          !checked_add_size(1, output)) return false;
    }
    const size_t chamfer = edge_treatment_certificate_bytes(row.chamfer);
    const size_t fillet = edge_treatment_certificate_bytes(row.fillet);
    if (chamfer == std::numeric_limits<size_t>::max() ||
        fillet == std::numeric_limits<size_t>::max() ||
        !checked_add_size(chamfer, output) ||
        !checked_add_size(fillet, output)) {
      return false;
    }
  }
  return true;
}

void source_face_identity(const geospec_occt_document& document,
                          const EdgeTreatmentScope& scope,
                          const TopoDS_Face& face,
                          EdgeTreatmentRowData& row) {
  const SourceFaceFacts* match = nullptr;
  for (const SourceFaceFacts& source : document.source_faces) {
    if (!face.IsPartner(source.shape)) continue;
    TopoDS_Shape expected = source.shape;
    if (scope.occurrence.has_value()) {
      expected = source.shape.Moved(scope.shape->Location());
    }
    if (!expected.Location().IsEqual(face.Location())) continue;
    if (match != nullptr) {
      match = nullptr;
      return;
    }
    match = &source;
  }
  if (match == nullptr) return;
  std::ostringstream key;
  key << '#' << match->entity;
  if (scope.occurrence.has_value()) {
    const OccurrenceFacts& occurrence =
        document.occurrences[*scope.occurrence];
    if (!occurrence.source_transfer_valid || occurrence.source_route.size() > 32) return;
    for (uint32_t entity : occurrence.source_route) key << "/#" << entity;
  }
  row.source_face_key = key.str();
  row.value.has_source_face_key = 1;
  row.value.has_source_same_sense = 1;
  row.value.source_same_sense = match->same_sense ? 1 : 0;
}

const std::string* edge_treatment_label(const geospec_occt_document& document,
                          const EdgeTreatmentScope& scope,
                          uint32_t public_ordinal,
                          EdgeTreatmentRowData& row) {
  size_t matches = 0;
  const std::string* label = nullptr;
  for (const SubshapeFacts& subshape : document.subshapes) {
    const int expected_occurrence =
        scope.occurrence.has_value() ? static_cast<int>(*scope.occurrence) : -1;
    if (subshape.shape_type != GEOSPEC_OCCT_SUBSHAPE_FACE ||
        !subshape.has_face_index || subshape.occurrence != expected_occurrence ||
        subshape.face_index != public_ordinal) {
      continue;
    }
    ++matches;
    if (matches == 1) label = &subshape.name;
  }
  if (matches == 0) {
    row.value.label = GEOSPEC_OCCT_EDGE_TREATMENT_LABEL_ABSENT;
  } else if (matches == 1) {
    row.value.label = GEOSPEC_OCCT_EDGE_TREATMENT_LABEL_UNIQUE;
  } else {
    row.value.label = GEOSPEC_OCCT_EDGE_TREATMENT_LABEL_AMBIGUOUS;
  }
  return matches == 1 ? label : nullptr;
}

bool build_edge_treatments(const geospec_occt_document& document,
                           size_t max_rows, EdgeTreatmentTransferData& output,
                           std::string& message) {
  if (!count_edge_treatments(document, output.counts, message)) return false;
  const size_t limit = std::min(max_rows, kMaximumEdgeTreatmentRows);
  if (output.counts.public_face_count > limit) {
    message = "Edge-treatment row count exceeds the requested bound.";
    return false;
  }
  size_t fixed_rows = 0;
  size_t fixed_total = sizeof(EdgeTreatmentTransferData);
  if (!checked_product_size(output.counts.public_face_count,
                            sizeof(EdgeTreatmentRowData), fixed_rows) ||
      !checked_add_size(fixed_rows, fixed_total) ||
      fixed_total > kMaximumEdgeTreatmentOwnedBytes) {
    message = "Edge-treatment transfer exceeds one mebibyte.";
    return false;
  }
  output.rows.reserve(output.counts.public_face_count);
  if (!edge_treatment_transfer_bytes(output, output.owned_bytes) ||
      output.owned_bytes > kMaximumEdgeTreatmentOwnedBytes) {
    message = "Edge-treatment row capacity exceeds one mebibyte.";
    return false;
  }
  for (const EdgeTreatmentScope& scope : edge_treatment_scopes(document)) {
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> solids;
    TopExp::MapShapes(*scope.shape, TopAbs_SOLID, solids);
    ShapeAncestors face_solids;
    TopExp::MapShapesAndAncestors(*scope.shape, TopAbs_FACE, TopAbs_SOLID,
                                  face_solids);
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> public_map;
    std::vector<std::vector<size_t>> public_ordinals;
    for (size_t ordinal = 0; ordinal < scope.faces->size(); ++ordinal) {
      const int mapped = public_map.Add((*scope.faces)[ordinal].shape);
      if (static_cast<size_t>(mapped) > public_ordinals.size()) {
        public_ordinals.emplace_back();
      }
      public_ordinals[static_cast<size_t>(mapped - 1)].push_back(ordinal);
    }
    std::vector<std::unique_ptr<BoreSolidContext>> owners(
        static_cast<size_t>(solids.Extent()));
    for (size_t public_ordinal = 0; public_ordinal < scope.faces->size();
         ++public_ordinal) {
      const FaceView& view = (*scope.faces)[public_ordinal];
      EdgeTreatmentRowData row;
      row.value.has_occurrence = scope.occurrence.has_value() ? 1 : 0;
      row.value.occurrence = scope.occurrence.value_or(0);
      row.value.public_face_ordinal = static_cast<uint32_t>(public_ordinal);
      row.value.private_query_face = view.query_index;
      if (scope.occurrence_path.size() > kMaximumEdgeTreatmentOwnedBytes) {
        message = "Edge-treatment occurrence path exceeds one mebibyte.";
        return false;
      }
      row.value.transferred_reversed =
          view.shape.Orientation() == TopAbs_REVERSED ? 1 : 0;
      source_face_identity(document, scope, view.shape, row);
      const std::string* label = edge_treatment_label(document, scope,
                           static_cast<uint32_t>(public_ordinal), row);
      size_t text_bytes = output.owned_bytes;
      if (!checked_add_size(scope.occurrence_path.size(), text_bytes) ||
          !checked_add_size(row.source_face_key.capacity(), text_bytes) ||
          !checked_add_size(label == nullptr ? 0 : label->size(), text_bytes) ||
          !checked_add_size(3, text_bytes) ||
          text_bytes > kMaximumEdgeTreatmentOwnedBytes) {
        message = "Edge-treatment source text exceeds one mebibyte.";
        return false;
      }
      row.occurrence_path = scope.occurrence_path;
      if (label != nullptr) row.label = *label;

      const GeomAbs_SurfaceType type = BRepAdaptor_Surface(view.shape).GetType();
      if (!transition_surface(view.shape)) {
        row.chamfer = unqualified_edge_treatment(
            GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_SURFACE);
        row.fillet = unqualified_edge_treatment(
            GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_SURFACE);
      } else if ((view.shape.Orientation() != TopAbs_FORWARD &&
                  view.shape.Orientation() != TopAbs_REVERSED) ||
                 view.query_index == 0) {
        const int qualification =
            view.query_index == 0
                ? GEOSPEC_OCCT_EDGE_TREATMENT_AMBIGUOUS_ASSOCIATION
                : GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_ORIENTATION;
        row.chamfer = unqualified_edge_treatment(qualification);
        row.fillet = unqualified_edge_treatment(qualification);
      } else {
        const int ownership = face_solids.FindIndex(view.shape);
        int owner_ordinal = 0;
        if (ownership > 0 && face_solids.FindKey(ownership).IsSame(view.shape)) {
          for (NCollection_List<TopoDS_Shape>::Iterator iterator(
                   face_solids.FindFromIndex(ownership));
               iterator.More(); iterator.Next()) {
            const int ordinal = solids.FindIndex(iterator.Value());
            if (ordinal <= 0 ||
                (owner_ordinal != 0 && owner_ordinal != ordinal)) {
              owner_ordinal = -1;
              break;
            }
            owner_ordinal = ordinal;
          }
        }
        if (owner_ordinal <= 0) {
          row.chamfer = unqualified_edge_treatment(
              GEOSPEC_OCCT_EDGE_TREATMENT_AMBIGUOUS_OWNERSHIP);
          row.fillet = unqualified_edge_treatment(
              GEOSPEC_OCCT_EDGE_TREATMENT_AMBIGUOUS_OWNERSHIP);
        } else {
          row.value.has_owning_solid_ordinal = 1;
          row.value.owning_solid_ordinal =
              static_cast<uint32_t>(owner_ordinal - 1);
          std::unique_ptr<BoreSolidContext>& owner =
              owners[static_cast<size_t>(owner_ordinal - 1)];
          if (!owner) {
            owner = std::make_unique<BoreSolidContext>();
            std::string qualification;
            TopoDS_Solid solid;
            owner->valid =
                regular_solid_operand(solids(owner_ordinal), solid,
                                      qualification) &&
                maximum_topology_tolerance(solids(owner_ordinal),
                                           owner->maximum_tolerance);
            if (owner->valid) {
              owner->solid = solid;
              TopExp::MapShapes(owner->solid, TopAbs_EDGE, owner->edges);
              TopExp::MapShapesAndAncestors(owner->solid, TopAbs_EDGE,
                                            TopAbs_FACE, owner->edge_faces);
            }
          }
          if (!owner->valid) {
            row.chamfer = unqualified_edge_treatment(
                GEOSPEC_OCCT_EDGE_TREATMENT_INVALID_SOLID);
            row.fillet = unqualified_edge_treatment(
                GEOSPEC_OCCT_EDGE_TREATMENT_INVALID_SOLID);
          } else {
            row.chamfer =
                type == GeomAbs_Plane
                    ? classify_planar_chamfer(
                          view, static_cast<uint32_t>(public_ordinal),
                          *scope.faces, public_map, public_ordinals, *owner)
                    : type == GeomAbs_Cone
                          ? classify_conical_chamfer(
                                view, static_cast<uint32_t>(public_ordinal),
                                *scope.faces, public_map, public_ordinals,
                                *owner)
                          : nonmember_edge_treatment(
                                GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_SURFACE);
            row.fillet =
                type == GeomAbs_Cylinder
                    ? classify_cylindrical_fillet(
                          view, static_cast<uint32_t>(public_ordinal),
                          *scope.faces, public_map, public_ordinals, *owner)
                    : type == GeomAbs_Torus
                          ? classify_toroidal_fillet(
                                view, static_cast<uint32_t>(public_ordinal),
                                *scope.faces, public_map, public_ordinals,
                                *owner)
                          : nonmember_edge_treatment(
                                GEOSPEC_OCCT_EDGE_TREATMENT_UNSUPPORTED_SURFACE);
          }
        }
      }
      row.value.chamfer_disposition = row.chamfer.disposition;
      row.value.chamfer_reason = row.chamfer.reason;
      row.value.fillet_disposition = row.fillet.disposition;
      row.value.fillet_reason = row.fillet.reason;
      output.rows.push_back(std::move(row));
      if (!edge_treatment_transfer_bytes(output, output.owned_bytes) ||
          output.owned_bytes > kMaximumEdgeTreatmentOwnedBytes) {
        message = "Edge-treatment owned transfer exceeds one mebibyte.";
        return false;
      }
    }
  }
  return output.rows.size() == output.counts.public_face_count &&
         edge_treatment_transfer_bytes(output, output.owned_bytes) &&
         output.owned_bytes <= kMaximumEdgeTreatmentOwnedBytes;
}

const EdgeTreatmentDispositionData* edge_treatment_disposition(
    const EdgeTreatmentTransferData& transfer, size_t row, int feature) {
  if (row >= transfer.rows.size()) return nullptr;
  if (feature == 0) return &transfer.rows[row].chamfer;
  if (feature == 1) return &transfer.rows[row].fillet;
  return nullptr;
}

using ShapeIndex = NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>;

int cartesian_axis(const gp_Dir& direction) {
  for (int axis = 1; axis <= 3; ++axis) {
    if (std::abs(direction.Coord(axis)) == 1.0 &&
        direction.Coord(axis % 3 + 1) == 0.0 &&
        direction.Coord((axis + 1) % 3 + 1) == 0.0) return axis - 1;
  }
  return -1;
}

bool equal_point(const gp_Pnt& a, const gp_Pnt& b) {
  return a.X() == b.X() && a.Y() == b.Y() && a.Z() == b.Z();
}

// Full directed traversal is required. An incomplete kernel traversal is an
// error, not an unsupported shape that can be skipped in a support search.
bool outer_cycle(const TopoDS_Face& face, size_t count,
                 std::vector<TopoDS_Edge>& cycle) {
  TopoDS_Wire wire;
  size_t wires = 0;
  for (TopExp_Explorer it(face, TopAbs_WIRE); it.More(); it.Next()) {
    wire = TopoDS::Wire(it.Current());
    ++wires;
  }
  if (wires != 1 || !wire.IsSame(BRepTools::OuterWire(face))) return false;
  size_t children = 0;
  for (TopoDS_Iterator it(wire); it.More(); it.Next()) {
    if (it.Value().ShapeType() != TopAbs_EDGE) return false;
    ++children;
  }
  if (children != count) return false;
  for (BRepTools_WireExplorer it(wire, face); it.More(); it.Next()) {
    cycle.push_back(it.Current());
  }
  if (cycle.size() != children) {
    throw Standard_Failure("Continuous wall boundary traversal is incomplete.");
  }
  for (size_t i = 0; i < cycle.size(); ++i) {
    if (cycle[i].Orientation() != TopAbs_FORWARD &&
        cycle[i].Orientation() != TopAbs_REVERSED) return false;
    TopoDS_Vertex start, end, next, next_end;
    TopExp::Vertices(cycle[i], start, end, true);
    TopExp::Vertices(cycle[(i + 1) % cycle.size()], next, next_end, true);
    if (start.IsNull() || end.IsNull() || next.IsNull()) {
      throw Standard_Failure("Continuous wall edge has incomplete vertex evidence.");
    }
    if (!end.IsSame(next) || BRep_Tool::Degenerated(cycle[i])) return false;
  }
  return true;
}

// These endpoint identities prove the whole affine curve-on-plane relation;
// they are not samples used to approximate a nonlinear trim.
bool planar_line_correspondence(const TopoDS_Edge& edge,
                                const TopoDS_Face& face) {
  BRepAdaptor_Surface surface(face);
  BRepAdaptor_Curve curve(edge);
  BRepAdaptor_Curve2d trim(edge, face);
  if (curve.GetType() != GeomAbs_Line || trim.GetType() != GeomAbs_Line ||
      surface.GetType() != GeomAbs_Plane) return false;
  for (double parameter : {curve.FirstParameter(), curve.LastParameter()}) {
    const gp_Pnt2d uv = trim.Value(parameter);
    if (!equal_point(curve.Value(parameter), surface.Value(uv.X(), uv.Y()))) {
      return false;
    }
  }
  return trim.FirstParameter() == curve.FirstParameter() &&
         trim.LastParameter() == curve.LastParameter();
}

bool continuous_box(const ShapeIndex& faces, const ShapeIndex& edges,
                    const ShapeIndex& vertices,
                    geospec_occt_continuous_wall_domain& output) {
  if (faces.Extent() != 6 || edges.Extent() != 12 || vertices.Extent() != 8) {
    return false;
  }
  std::array<std::array<double, 3>, 8> corners;
  for (int i = 1; i <= 8; ++i) {
    const gp_Pnt p = BRep_Tool::Pnt(TopoDS::Vertex(vertices(i)));
    corners[i - 1] = {p.X(), p.Y(), p.Z()};
    for (double value : corners[i - 1]) if (!std::isfinite(value)) return false;
  }
  std::sort(corners.begin(), corners.end());
  for (size_t i = 0; i < 8; ++i) {
    for (size_t axis = 0; axis < 3; ++axis) {
      const double expected = corners[(i & (4 >> axis)) ? 7 : 0][axis];
      if (corners[i][axis] != expected) return false;
      output.corners[i][axis] = corners[i][axis];
    }
    if (i && corners[i] == corners[i - 1]) return false;
  }
  for (int axis = 0; axis < 3; ++axis) {
    output.edge_lengths[axis] = corners[7][axis] - corners[0][axis];
    if (!std::isfinite(output.edge_lengths[axis]) || output.edge_lengths[axis] <= 0) {
      return false;
    }
  }
  std::array<int, 12> edge_uses{}, edge_directions{};
  for (int i = 1; i <= 6; ++i) {
    const TopoDS_Face face = TopoDS::Face(faces(i));
    BRepAdaptor_Surface surface(face);
    if (surface.GetType() != GeomAbs_Plane ||
        (face.Orientation() != TopAbs_FORWARD && face.Orientation() != TopAbs_REVERSED)) {
      return false;
    }
    const gp_Pln plane = surface.Plane();
    if (!plane.Position().Direct()) return false;
    gp_Dir normal = plane.Axis().Direction();
    if (face.Orientation() == TopAbs_REVERSED) normal.Reverse();
    const int axis = cartesian_axis(normal);
    if (axis < 0) return false;
    const int side = normal.Coord(axis + 1) > 0 ? 1 : 0;
    if (plane.Location().Coord(axis + 1) != corners[side ? 7 : 0][axis] ||
        output.opposite_face_pairs[axis][side] != 0) return false;
    output.opposite_face_pairs[axis][side] = static_cast<uint32_t>(i);
    output.face_indices[i - 1] = static_cast<uint32_t>(i);
    direction(output.outward_normals[i - 1], normal);
    std::vector<TopoDS_Edge> cycle;
    if (!outer_cycle(face, 4, cycle)) return false;
    std::array<uint32_t, 4> corner_ids;
    for (size_t j = 0; j < 4; ++j) {
      const TopoDS_Edge edge = cycle[j];
      if (edge.Orientation() != TopAbs_FORWARD && edge.Orientation() != TopAbs_REVERSED) {
        return false;
      }
      const int id = edges.FindIndex(edge);
      if (id == 0) throw Standard_Failure("Continuous box edge has no nominal ID.");
      ++edge_uses[id - 1];
      edge_directions[id - 1] += edge.Orientation() == TopAbs_FORWARD ? 1 : -1;
      BRepAdaptor_Curve curve(edge);
      if (curve.GetType() != GeomAbs_Line || cartesian_axis(curve.Line().Direction()) < 0 ||
          !planar_line_correspondence(edge, face)) return false;
      TopoDS_Vertex first, last;
      TopExp::Vertices(edge, first, last, true);
      const gp_Pnt a = BRep_Tool::Pnt(first), b = BRep_Tool::Pnt(last);
      const gp_Pnt c = curve.Value(curve.FirstParameter());
      const gp_Pnt d = curve.Value(curve.LastParameter());
      if (!((equal_point(a, c) && equal_point(b, d)) ||
            (equal_point(a, d) && equal_point(b, c)))) return false;
      const std::array<double, 3> p{a.X(), a.Y(), a.Z()};
      const auto found = std::find(corners.begin(), corners.end(), p);
      if (found == corners.end() || p[axis] != corners[side ? 7 : 0][axis]) return false;
      corner_ids[j] = static_cast<uint32_t>(found - corners.begin());
    }
    // Each boundary must visit exactly the four corners of its plane. Together
    // with affine, Cartesian edges and a directed closed wire this is a rectangle.
    auto unique = corner_ids;
    std::sort(unique.begin(), unique.end());
    if (std::adjacent_find(unique.begin(), unique.end()) != unique.end()) return false;
    const auto start = std::min_element(corner_ids.begin(), corner_ids.end());
    std::rotate(corner_ids.begin(), start, corner_ids.end());
    for (size_t j = 0; j < 4; ++j) output.face_corner_indices[i - 1][j] = corner_ids[j];
    const auto& a = corners[corner_ids[0]];
    const auto& b = corners[corner_ids[1]];
    const auto& c = corners[corner_ids[2]];
    const gp_Vec ab(b[0]-a[0], b[1]-a[1], b[2]-a[2]);
    const gp_Vec bc(c[0]-b[0], c[1]-b[1], c[2]-b[2]);
    if (ab.Crossed(bc).Dot(gp_Vec(normal)) <= 0) return false;
  }
  for (size_t i = 0; i < 12; ++i) {
    if (edge_uses[i] != 2 || edge_directions[i] != 0) return false;
  }
  output.kind = 0;
  return true;
}

bool equal_direction(const gp_Dir& a, const gp_Dir& b) {
  return a.X() == b.X() && a.Y() == b.Y() && a.Z() == b.Z();
}

bool signed_cartesian_frame(const gp_Ax3& frame) {
  const int x = cartesian_axis(frame.XDirection());
  const int y = cartesian_axis(frame.YDirection());
  const int z = cartesian_axis(frame.Direction());
  return frame.Direct() && x >= 0 && y >= 0 && z >= 0 && x != y && x != z && y != z;
}

bool line2d_is(const gp_Lin2d& line, double x, double y, double dx, double dy) {
  return line.Location().X() == x && line.Location().Y() == y &&
         line.Direction().X() == dx && line.Direction().Y() == dy;
}

bool mapped_direction_is(const gp_Ax3& plane, const gp_Dir2d& uv,
                         const gp_Dir& expected) {
  for (int coordinate = 1; coordinate <= 3; ++coordinate) {
    if (uv.X() * plane.XDirection().Coord(coordinate) +
            uv.Y() * plane.YDirection().Coord(coordinate) !=
        expected.Coord(coordinate)) return false;
  }
  return true;
}

gp_Pnt cylinder_phase_point(const gp_Cylinder& cylinder, double station) {
  const gp_Pnt& origin = cylinder.Location();
  const gp_Dir& phase = cylinder.Position().XDirection();
  const gp_Dir& axis = cylinder.Axis().Direction();
  const double radius = cylinder.Radius();
  return gp_Pnt(origin.X() + radius * phase.X() + station * axis.X(),
                origin.Y() + radius * phase.Y() + station * axis.Y(),
                origin.Z() + radius * phase.Z() + station * axis.Z());
}

bool continuous_cylinder(const ShapeIndex& faces, const ShapeIndex& edges,
                         const ShapeIndex& vertices,
                         geospec_occt_continuous_wall_domain& output,
                         std::string& message) {
  geospec_occt_continuous_wall_domain candidate{};
  message = "Continuous cylinder requires one band, two caps, two rims and one seam.";
  if (faces.Extent() != 3 || edges.Extent() != 3 || vertices.Extent() != 2) return false;
  TopoDS_Face lateral;
  std::vector<int> caps;
  for (int i = 1; i <= 3; ++i) {
    const TopoDS_Face face = TopoDS::Face(faces(i));
    BRepAdaptor_Surface surface(face);
    if (surface.GetType() == GeomAbs_Cylinder && lateral.IsNull()) {
      lateral = face;
      candidate.lateral_face = static_cast<uint32_t>(i);
    } else if (surface.GetType() == GeomAbs_Plane) {
      caps.push_back(i);
    } else return false;
  }
  if (lateral.IsNull() || caps.size() != 2 || lateral.Orientation() != TopAbs_FORWARD) {
    return false;
  }
  BRepAdaptor_Surface surface(lateral);
  const gp_Cylinder cylinder = surface.Cylinder();
  const gp_Pnt origin = cylinder.Location();
  const gp_Dir axis = cylinder.Axis().Direction();
  message = "Continuous cylinder requires an exactly Cartesian direct analytic frame.";
  if (!signed_cartesian_frame(cylinder.Position())) return false;
  const int axis_index = cartesian_axis(axis);
  for (int k = 1; k <= 3; ++k) if (!std::isfinite(origin.Coord(k))) return false;
  const double radius = cylinder.Radius();
  if (!std::isfinite(radius) || radius <= 0) return false;
  const double u0 = surface.FirstUParameter(), u1 = surface.LastUParameter();
  const double v0 = surface.FirstVParameter(), v1 = surface.LastVParameter();
  const double period = surface.UPeriod();
  message = "Continuous cylinder requires a finite increasing axial interval and an exact full analytic U period.";
  if (!std::isfinite(u0) || !std::isfinite(u1) || !std::isfinite(v0) ||
      !std::isfinite(v1) || !std::isfinite(period) || !std::isfinite(v1 - v0) ||
      !std::isfinite(2 * radius) || v0 >= v1 || u0 != 0 || u1 != period) return false;
  std::vector<TopoDS_Edge> cycle;
  message = "Continuous cylinder requires one full four-edge directed outer wire.";
  if (!outer_cycle(lateral, 4, cycle)) return false;
  std::array<TopoDS_Edge, 2> rims;
  TopoDS_Edge seam;
  std::array<int, 4> rectangle_uses{};
  int seam_direction = 0;
  for (size_t use_index = 0; use_index < cycle.size(); ++use_index) {
    const TopoDS_Edge edge = cycle[use_index];
    message = "Continuous cylinder lateral trim must consist of analytic lines in parameter space.";
    BRepAdaptor_Curve curve(edge);
    double trim_first = 0, trim_last = 0;
    bool trim_stored = false;
    const occ::handle<Geom2d_Curve> pcurve =
        BRep_Tool::CurveOnSurface(edge, lateral, trim_first, trim_last, &trim_stored);
    if (pcurve.IsNull()) return false;
    Geom2dAdaptor_Curve trim(pcurve, trim_first, trim_last);
    if (trim.GetType() != GeomAbs_Line) return false;
    const gp_Pnt2d a = trim.Value(trim_first);
    const gp_Pnt2d b = trim.Value(trim_last);
    auto& boundary = candidate.lateral_boundary[use_index];
    const int edge_index = edges.FindIndex(edge);
    if (edge_index == 0) {
      throw Standard_Failure("Continuous cylinder edge has no nominal ID.");
    }
    boundary.edge_index = static_cast<uint32_t>(edge_index);
    boundary.orientation = edge.Orientation() == TopAbs_FORWARD ? 0 : 1;
    boundary.curve_range[0] = trim_first;
    boundary.curve_range[1] = trim_last;
    boundary.pcurve_stored = trim_stored ? 1 : 0;
    boundary.parameter_endpoints[0][0] = a.X();
    boundary.parameter_endpoints[0][1] = a.Y();
    boundary.parameter_endpoints[1][0] = b.X();
    boundary.parameter_endpoints[1][1] = b.Y();
    if (BRep_Tool::IsClosed(edge, lateral)) {
      message = "Continuous cylinder seam must be one shared axial line with both complete opposite U boundaries.";
      if (curve.GetType() != GeomAbs_Line ||
          !equal_direction(curve.Line().Direction(), axis)) return false;
      if (!seam.IsNull() && !seam.IsSame(edge)) return false;
      seam = edge;
      seam_direction += edge.Orientation() == TopAbs_FORWARD ? 1 : -1;
      const gp_Lin2d line = trim.Line();
      const int side = line2d_is(line, u0, 0, 0, 1) ? 0
                       : line2d_is(line, u1, 0, 0, 1) ? 1 : -1;
      if (side < 0 || trim_first != v0 || trim_last != v1 ||
          a.X() != (side == 0 ? u0 : u1) || b.X() != a.X() ||
          a.Y() != v0 || b.Y() != v1) return false;
      boundary.side = side;
      ++rectangle_uses[side];
      if (!equal_point(curve.Line().Location(), cylinder_phase_point(cylinder, 0)) ||
          curve.FirstParameter() != v0 || curve.LastParameter() != v1 ||
          trim_first != curve.FirstParameter() || trim_last != curve.LastParameter()) return false;
    } else {
      message = "Continuous cylinder rim must be a full analytic circle exactly sharing the cylinder axis, radius and axial trim boundary.";
      if (curve.GetType() != GeomAbs_Circle || !curve.IsClosed() ||
          curve.FirstParameter() != 0 || curve.LastParameter() != curve.Period() ||
          curve.Period() != period) return false;
      const gp_Circ circle = curve.Circle();
      if (!equal_direction(circle.Axis().Direction(), axis) ||
          !equal_direction(circle.Position().XDirection(), cylinder.Position().XDirection()) ||
          !equal_direction(circle.Position().YDirection(), cylinder.Position().YDirection()) ||
          circle.Radius() != radius) return false;
      const double along = (circle.Location().Coord(axis_index + 1) -
          origin.Coord(axis_index + 1)) * axis.Coord(axis_index + 1);
      const int side = along == v0 ? 0 : along == v1 ? 1 : -1;
      if (side < 0 || !rims[side].IsNull()) return false;
      for (int k = 0; k < 3; ++k) if (k != axis_index &&
          circle.Location().Coord(k + 1) != origin.Coord(k + 1)) return false;
      if (!line2d_is(trim.Line(), 0, along, 1, 0) || trim_first != 0 ||
          trim_last != period || a.X() != 0 || b.X() != period ||
          a.Y() != along || b.Y() != along) return false;
      boundary.side = 2 + side;
      ++rectangle_uses[2 + side];
      rims[side] = edge;
      point(candidate.rim_centers[side], circle.Location());
      candidate.rim_radii[side] = circle.Radius();
      candidate.rim_edge_indices[side] = static_cast<uint32_t>(edge_index);
      candidate.rim_curve_ranges[side][0] = curve.FirstParameter();
      candidate.rim_curve_ranges[side][1] = curve.LastParameter();
      candidate.rim_curve_periods[side] = curve.Period();
    }
  }
  if (seam.IsNull() || seam_direction != 0 ||
      std::any_of(rectangle_uses.begin(), rectangle_uses.end(), [](int n) { return n != 1; })) {
    return false;
  }
  const TopoDS_Edge seam_forward = TopoDS::Edge(seam.Oriented(TopAbs_FORWARD));
  TopoDS_Vertex seam_first, seam_last;
  TopExp::Vertices(seam_forward, seam_first, seam_last, true);
  BRepAdaptor_Curve seam_curve(seam_forward);
  if (seam_first.IsNull() || seam_last.IsNull() ||
      !equal_point(BRep_Tool::Pnt(seam_first), cylinder_phase_point(cylinder, v0)) ||
      !equal_point(BRep_Tool::Pnt(seam_last), cylinder_phase_point(cylinder, v1))) return false;
  candidate.seam_curve_range[0] = seam_curve.FirstParameter();
  candidate.seam_curve_range[1] = seam_curve.LastParameter();
  candidate.seam_vertex_indices[0] = static_cast<uint32_t>(vertices.FindIndex(seam_first));
  candidate.seam_vertex_indices[1] = static_cast<uint32_t>(vertices.FindIndex(seam_last));
  if (candidate.seam_vertex_indices[0] == 0 || candidate.seam_vertex_indices[1] == 0 ||
      candidate.seam_vertex_indices[0] == candidate.seam_vertex_indices[1]) return false;
  for (int id : caps) {
    message = "Continuous cylinder cap must be an outward plane at its exact rim station.";
    const TopoDS_Face cap = TopoDS::Face(faces(id));
    BRepAdaptor_Surface cap_surface(cap);
    const gp_Pln plane = cap_surface.Plane();
    if (!signed_cartesian_frame(plane.Position())) return false;
    gp_Dir normal = plane.Axis().Direction();
    if (cap.Orientation() == TopAbs_REVERSED) normal.Reverse();
    else if (cap.Orientation() != TopAbs_FORWARD) return false;
    if (cartesian_axis(normal) != axis_index) return false;
    const int side = normal.Dot(axis) == -1.0 ? 0 : normal.Dot(axis) == 1.0 ? 1 : -1;
    if (side < 0 || candidate.cap_faces[side] != 0 ||
        plane.Location().Coord(axis_index + 1) != candidate.rim_centers[side][axis_index]) {
      return false;
    }
    std::vector<TopoDS_Edge> cap_cycle;
    message = "Continuous cylinder cap must have exactly its shared rim with opposite directed incidence.";
    if (!outer_cycle(cap, 1, cap_cycle) || !cap_cycle[0].IsSame(rims[side]) ||
        cap_cycle[0].Orientation() == rims[side].Orientation()) return false;
    double trim_first = 0, trim_last = 0;
    bool trim_stored = false;
    const occ::handle<Geom2d_Curve> pcurve = BRep_Tool::CurveOnSurface(
        cap_cycle[0], cap, trim_first, trim_last, &trim_stored);
    if (pcurve.IsNull()) return false;
    Geom2dAdaptor_Curve trim(pcurve, trim_first, trim_last);
    message = "Continuous cylinder cap trim must be a full circle exactly corresponding to the rim center and radius.";
    if (trim.GetType() != GeomAbs_Circle ||
        trim_first != 0 || trim_last != trim.Period() || trim.Period() != period) return false;
    const gp_Circ2d pcurve_circle = trim.Circle();
    BRepAdaptor_Curve rim_curve(rims[side]);
    const gp_Circ rim_circle = rim_curve.Circle();
    if (pcurve_circle.Radius() != rim_circle.Radius() ||
        !mapped_direction_is(plane.Position(), pcurve_circle.Position().XDirection(),
                             rim_circle.Position().XDirection()) ||
        !mapped_direction_is(plane.Position(), pcurve_circle.Position().YDirection(),
                             rim_circle.Position().YDirection())) return false;
    const gp_Pnt2d uv = pcurve_circle.Location();
    const gp_Pnt center = cap_surface.Value(uv.X(), uv.Y());
    const gp_Pnt rim_center(candidate.rim_centers[side][0], candidate.rim_centers[side][1],
                            candidate.rim_centers[side][2]);
    if (!equal_point(center, rim_center)) return false;
    TopoDS_Vertex rim_first, rim_last;
    message = "Continuous cylinder rim vertex must close and share the seam endpoint at the same axial station.";
    const TopoDS_Edge rim_forward = TopoDS::Edge(rims[side].Oriented(TopAbs_FORWARD));
    TopExp::Vertices(rim_forward, rim_first, rim_last, true);
    if (!rim_first.IsSame(rim_last) ||
        !(rim_first.IsSame(seam_first) || rim_first.IsSame(seam_last))) return false;
    if (!equal_point(BRep_Tool::Pnt(rim_first), cylinder_phase_point(cylinder, side ? v1 : v0))) return false;
    candidate.rim_vertex_indices[side][0] = static_cast<uint32_t>(vertices.FindIndex(rim_first));
    candidate.rim_vertex_indices[side][1] = static_cast<uint32_t>(vertices.FindIndex(rim_last));
    if (candidate.rim_vertex_indices[side][0] == 0 ||
        candidate.rim_vertex_indices[side][0] != candidate.rim_vertex_indices[side][1]) return false;
    candidate.cap_faces[side] = static_cast<uint32_t>(id);
    candidate.cap_pcurve_ranges[side][0] = trim_first;
    candidate.cap_pcurve_ranges[side][1] = trim_last;
    candidate.cap_pcurve_periods[side] = trim.Period();
    candidate.cap_pcurve_stored[side] = trim_stored ? 1 : 0;
  }
  for (int i = 1; i <= 2; ++i) {
    const gp_Pnt vertex = BRep_Tool::Pnt(TopoDS::Vertex(vertices(i)));
    for (int coordinate = 1; coordinate <= 3; ++coordinate) {
      if (!std::isfinite(vertex.Coord(coordinate))) return false;
    }
    candidate.vertices[i - 1].vertex_index = static_cast<uint32_t>(i);
    point(candidate.vertices[i - 1].point, vertex);
  }
  candidate.kind = 1;
  point(candidate.origin, origin);
  direction(candidate.axis, axis);
  direction(candidate.phase_x, cylinder.Position().XDirection());
  direction(candidate.phase_y, cylinder.Position().YDirection());
  candidate.radius = radius;
  candidate.from = v0;
  candidate.to = v1;
  candidate.lateral_parameter_bounds[0] = u0;
  candidate.lateral_parameter_bounds[1] = u1;
  candidate.lateral_parameter_bounds[2] = v0;
  candidate.lateral_parameter_bounds[3] = v1;
  candidate.seam_edge_index = static_cast<uint32_t>(edges.FindIndex(seam));
  candidate.attachment_profile = 0;
  candidate.surface_period = period;
  if (candidate.seam_edge_index == 0 || candidate.rim_edge_indices[0] == 0 ||
      candidate.rim_edge_indices[1] == 0) return false;
  output = candidate;
  return true;
}

// Nominal full-band reconstruction is deliberately separate from the exact
// stored-coordinate PhaseZeroV1 whole-solid classifier above.
bool finite_contact_face(const TopoDS_Face& face,
                         geospec_occt_finite_contact_face& output,
                         std::string& message) {
  message = "Finite contact requires complete analytic planar wires or attached conical circular rims.";
  if ((face.Orientation() != TopAbs_FORWARD && face.Orientation() != TopAbs_REVERSED) ||
      !BRepCheck_Analyzer(face, true).IsValid()) return false;
  BRepAdaptor_Surface surface(face);
  const bool planar = surface.GetType() == GeomAbs_Plane;
  if (!planar && surface.GetType() != GeomAbs_Cone) return false;
  output.kind = planar ? 0 : 1;
  output.tolerance = BRep_Tool::Tolerance(face);
  output.face_tolerance = output.tolerance;
  if (!std::isfinite(output.tolerance) || output.tolerance < 0) return false;
  if (planar) {
    const gp_Pln plane = surface.Plane();
    point(output.origin, plane.Location());
    gp_Dir n = plane.Axis().Direction();
    if (face.Orientation() == TopAbs_REVERSED) n.Reverse();
    direction(output.normal, n);
  } else {
    point(output.origin, surface.Cone().Location());
    direction(output.normal, surface.Cone().Axis().Direction());
  }
  const TopoDS_Wire outer = BRepTools::OuterWire(face);
  if (outer.IsNull()) return false;
  ShapeIndex edges, vertices;
  TopExp::MapShapes(face, TopAbs_EDGE, edges);
  TopExp::MapShapes(face, TopAbs_VERTEX, vertices);
  if (edges.Extent() > 16) return false;
  uint32_t outer_count = 0;
  for (TopExp_Explorer wires(face, TopAbs_WIRE); wires.More(); wires.Next()) {
    if (++output.wire_count > 9) return false;
    const TopoDS_Wire wire = TopoDS::Wire(wires.Current());
    const bool is_outer = wire.IsSame(outer);
    if (is_outer) ++outer_count;
    size_t direct_count = 0, visited = 0, circles = 0, lines = 0;
    for (TopoDS_Iterator it(wire); it.More(); it.Next()) {
      if (it.Value().ShapeType() != TopAbs_EDGE || ++direct_count > 16) return false;
    }
    TopoDS_Vertex initial, previous;
    for (BRepTools_WireExplorer uses(wire, face); uses.More(); uses.Next()) {
      ++visited;
      if (++output.edge_use_count > 24) return false;
      const TopoDS_Edge edge = uses.Current();
      if (BRep_Tool::Degenerated(edge) ||
          (edge.Orientation() != TopAbs_FORWARD && edge.Orientation() != TopAbs_REVERSED)) return false;
      TopoDS_Vertex start, end;
      TopExp::Vertices(edge, start, end, true);
      if (start.IsNull() || end.IsNull() || (!previous.IsNull() && !previous.IsSame(start))) return false;
      if (initial.IsNull()) initial = start;
      previous = end;
      BRepAdaptor_Curve curve(edge);
      const double first = curve.FirstParameter(), last = curve.LastParameter();
      const double limit = std::max({output.face_tolerance, BRep_Tool::Tolerance(edge),
          BRep_Tool::Tolerance(start), BRep_Tool::Tolerance(end)});
      if (!std::isfinite(first) || !std::isfinite(last) || first >= last ||
          !std::isfinite(limit) || limit < 0) return false;
      const gp_Pnt a = curve.Value(first), b = curve.Value(last);
      const gp_Pnt va = BRep_Tool::Pnt(start), vb = BRep_Tool::Pnt(end);
      double residual = std::min(std::max(a.Distance(va), b.Distance(vb)),
                                 std::max(a.Distance(vb), b.Distance(va)));
      if (!planar && BRep_Tool::IsClosed(edge, face)) {
        // Seam carries no contact witness. Both adjacent circles remain
        // independently attached to this actual selected conical face.
        if (curve.GetType() != GeomAbs_Line) return false;
        continue;
      }
      if (curve.GetType() == GeomAbs_Line && planar && is_outer) {
        ++lines;
        if (output.vertex_count == 8) return false;
        auto& out = output.lines[output.vertex_count];
        out.edge_index = static_cast<uint32_t>(edges.FindIndex(edge));
        out.start_vertex = static_cast<uint32_t>(vertices.FindIndex(start));
        out.end_vertex = static_cast<uint32_t>(vertices.FindIndex(end));
        out.reversed = edge.Orientation() == TopAbs_REVERSED ? 1 : 0;
        point(out.origin, curve.Line().Location());
        direction(out.direction, curve.Line().Direction());
        out.range[0] = first; out.range[1] = last;
        out.edge_tolerance = BRep_Tool::Tolerance(edge);
        out.vertex_tolerances[0] = BRep_Tool::Tolerance(start);
        out.vertex_tolerances[1] = BRep_Tool::Tolerance(end);
        point(output.vertices[output.vertex_count++], va);
        residual = std::max({residual, surface.Plane().Distance(a), surface.Plane().Distance(b)});
        out.attachment_residual = residual;
      } else if (curve.GetType() == GeomAbs_Circle) {
        ++circles;
        if (output.circle_count == 8 || !curve.IsClosed() || !start.IsSame(end)) return false;
        const gp_Circ circle = curve.Circle();
        auto& out = output.circles[output.circle_count++];
        out.edge_index = static_cast<uint32_t>(edges.FindIndex(edge));
        out.outer = is_outer ? 1 : 0;
        point(out.center, circle.Location());
        direction(out.axis, circle.Axis().Direction());
        out.radius = circle.Radius();
        out.range[0] = first; out.range[1] = last;
        out.period = curve.Period();
        if (!std::isfinite(out.radius) || out.radius <= 0 ||
            !std::isfinite(out.period) || out.period <= 0) return false;
        residual = std::max(residual, out.radius * std::abs((last-first)-out.period));
        if (planar) {
          // Whole-circle bound, not sampled attachment: center-plane gap
          // plus the maximum normal excursion of the radius.
          const gp_Dir n = surface.Plane().Axis().Direction();
          const double excursion = out.radius * gp_Vec(n).Crossed(gp_Vec(circle.Axis().Direction())).Magnitude();
          residual = std::max(residual, surface.Plane().Distance(circle.Location()) + excursion);
        } else {
          double pf = 0, pl = 0; bool stored = false;
          const auto pc = BRep_Tool::CurveOnSurface(edge, face, pf, pl, &stored);
          if (pc.IsNull() || !stored || !BRep_Tool::SameRange(edge) ||
              !BRep_Tool::SameParameter(edge) || pf != first || pl != last) return false;
          Geom2dAdaptor_Curve trim(pc, pf, pl);
          if (trim.GetType() != GeomAbs_Line) return false;
          const gp_Lin2d uv = trim.Line();
          if (uv.Direction().Y() != 0 || std::abs(uv.Direction().X()) != 1) return false;
          const gp_Cone cone = surface.Cone();
          const gp_Ax3 frame = cone.Position();
          const double v = uv.Location().Y(), phase = uv.Location().X();
          const double radius = cone.RefRadius() + v * std::sin(cone.SemiAngle());
          if (!std::isfinite(radius) || radius <= 0) return false;
          const gp_Pnt center = cone.Location().Translated(gp_Vec(frame.Direction()).Multiplied(v * std::cos(cone.SemiAngle())));
          const gp_Vec x(frame.XDirection()), y(frame.YDirection());
          const gp_Vec cx = (x.Multiplied(std::cos(phase)) + y.Multiplied(std::sin(phase))).Multiplied(radius);
          const gp_Vec cy = (y.Multiplied(std::cos(phase)) - x.Multiplied(std::sin(phase))).Multiplied(radius * uv.Direction().X());
          // Uniform coefficient bound for every parameter on the stored rim.
          residual = std::max(residual, circle.Location().Distance(center) +
              (gp_Vec(circle.Position().XDirection()).Multiplied(out.radius)-cx).Magnitude() +
              (gp_Vec(circle.Position().YDirection()).Multiplied(out.radius)-cy).Magnitude());
        }
        out.attachment_residual = residual; out.tolerance = limit;
      } else return false;
      if (!std::isfinite(residual) || residual > limit) return false;
      output.attachment_residual = std::max(output.attachment_residual, residual);
      output.tolerance = std::max(output.tolerance, limit);
    }
    if (visited != direct_count || visited == 0 || !previous.IsSame(initial)) return false;
    if (planar && !((circles == 1 && lines == 0 && visited == 1) ||
                    (is_outer && circles == 0 && lines >= 3))) return false;
  }
  return outer_count == 1 && (planar ? (output.vertex_count >= 3 || output.circle_count > 0)
                                   : output.circle_count > 0);
}

bool nominal_cylindrical_band(
    const TopoDS_Face& face, geospec_occt_nominal_cylindrical_band& output,
    std::string& message) {
  message = "Nominal cylindrical band requires a valid complete analytic face.";
  if ((face.Orientation() != TopAbs_FORWARD &&
       face.Orientation() != TopAbs_REVERSED) ||
      !BRepCheck_Analyzer(face, true).IsValid()) return false;
  BRepAdaptor_Surface surface(face);
  if (surface.GetType() != GeomAbs_Cylinder || !surface.IsUPeriodic()) return false;
  const gp_Cylinder cylinder = surface.Cylinder();
  const gp_Ax3 frame = cylinder.Position();
  const double radius = cylinder.Radius();
  const double u0 = surface.FirstUParameter(), u1 = surface.LastUParameter();
  const double v0 = surface.FirstVParameter(), v1 = surface.LastVParameter();
  const double period = surface.UPeriod();
  const auto finite = [](double value) { return std::isfinite(value); };
  const auto tolerance = [&](double value) { return finite(value) && value >= 0; };
  const auto accepted = [&](double value, double limit) {
    return tolerance(value) && tolerance(limit) && value <= limit;
  };
  const auto maximum_residual = [&](std::initializer_list<double> values) {
    double maximum = 0;
    for (double value : values) {
      if (!tolerance(value)) return std::numeric_limits<double>::infinity();
      maximum = std::max(maximum, value);
    }
    return maximum;
  };
  output.face_tolerance_mm = BRep_Tool::Tolerance(face);
  if (!frame.Direct() || !finite(radius) || radius <= 0 ||
      !finite(u0) || !finite(u1) || !finite(v0) || !finite(v1) ||
      !finite(u1 - u0) || !finite(v1 - v0) || u0 >= u1 || v0 >= v1 ||
      !finite(period) || period <= 0 || !tolerance(output.face_tolerance_mm)) return false;
  point(output.origin, cylinder.Location());
  direction(output.axis, frame.Direction());
  direction(output.phase_x, frame.XDirection());
  direction(output.phase_y, frame.YDirection());
  for (int k = 0; k < 3; ++k) {
    if (!finite(output.origin[k]) || !finite(output.axis[k]) ||
        !finite(output.phase_x[k]) || !finite(output.phase_y[k])) return false;
  }
  output.radius = radius;
  output.from = v0;
  output.to = v1;
  output.parameter_bounds[0] = u0;
  output.parameter_bounds[1] = u1;
  output.parameter_bounds[2] = v0;
  output.parameter_bounds[3] = v1;
  output.surface_period = period;
  output.period_residual_mm = radius * std::abs((u1 - u0) - period);
  message = "Nominal cylindrical band does not cover one stored analytic period.";
  if (!accepted(output.period_residual_mm, output.face_tolerance_mm)) return false;

  std::vector<TopoDS_Edge> cycle;
  message = "Nominal cylindrical band requires one complete four-use outer wire.";
  if (!outer_cycle(face, 4, cycle)) return false;
  ShapeIndex edges, vertices;
  TopExp::MapShapes(face, TopAbs_EDGE, edges);
  TopExp::MapShapes(face, TopAbs_VERTEX, vertices);
  if (edges.Extent() != 3 || vertices.Extent() != 2) return false;
  for (int i = 1; i <= 3; ++i) {
    output.edge_tolerances_mm[i - 1] = BRep_Tool::Tolerance(TopoDS::Edge(edges(i)));
    if (!tolerance(output.edge_tolerances_mm[i - 1])) return false;
  }
  for (int i = 1; i <= 2; ++i) {
    const auto vertex = TopoDS::Vertex(vertices(i));
    output.vertices[i - 1].vertex_index = static_cast<uint32_t>(i);
    point(output.vertices[i - 1].point, BRep_Tool::Pnt(vertex));
    output.vertex_tolerances_mm[i - 1] = BRep_Tool::Tolerance(vertex);
    if (!tolerance(output.vertex_tolerances_mm[i - 1]) ||
        !std::all_of(std::begin(output.vertices[i - 1].point),
                     std::end(output.vertices[i - 1].point), finite)) return false;
  }
  std::array<int, 4> side_uses{};
  int seam_direction = 0;
  for (size_t i = 0; i < cycle.size(); ++i) {
    const TopoDS_Edge edge = cycle[i];
    const int edge_id = edges.FindIndex(edge);
    BRepAdaptor_Curve curve(edge);
    double first = 0, last = 0;
    bool stored = false;
    const auto pcurve = BRep_Tool::CurveOnSurface(edge, face, first, last, &stored);
    message = "Nominal band requires stored affine pcurves with identical complete curve ranges.";
    if (edge_id == 0 || pcurve.IsNull() || !stored ||
        !BRep_Tool::SameRange(edge) || !BRep_Tool::SameParameter(edge) ||
        !finite(first) || !finite(last) || first >= last ||
        first != curve.FirstParameter() || last != curve.LastParameter()) return false;
    Geom2dAdaptor_Curve trim(pcurve, first, last);
    if (trim.GetType() != GeomAbs_Line) return false;
    const gp_Lin2d line = trim.Line();
    const gp_Pnt2d a = trim.Value(first), b = trim.Value(last);
    if (!finite(a.X()) || !finite(a.Y()) || !finite(b.X()) || !finite(b.Y()) ||
        !finite(line.Location().X()) || !finite(line.Location().Y())) return false;
    TopoDS_Vertex start, end;
    TopExp::Vertices(TopoDS::Edge(edge.Oriented(TopAbs_FORWARD)), start, end, true);
    const int start_id = vertices.FindIndex(start), end_id = vertices.FindIndex(end);
    if (start.IsNull() || end.IsNull() || start_id == 0 || end_id == 0) return false;
    auto& residual = output.boundary_residuals[i];
    residual.limit_mm = std::max({output.face_tolerance_mm,
        output.edge_tolerances_mm[edge_id - 1],
        output.vertex_tolerances_mm[start_id - 1],
        output.vertex_tolerances_mm[end_id - 1]});
    const bool seam = BRep_Tool::IsClosed(edge, face);
    if (seam ? (curve.GetType() != GeomAbs_Line || line.Direction().X() != 0 ||
                std::abs(line.Direction().Y()) != 1)
             : (curve.GetType() != GeomAbs_Circle || line.Direction().Y() != 0 ||
                std::abs(line.Direction().X()) != 1 || !curve.IsClosed())) return false;

    // Each affine UV segment must cover exactly one rectangle side up to the
    // participating model tolerances. More than one matching side is ambiguous.
    int side = -1;
    for (int candidate = seam ? 0 : 2; candidate < (seam ? 2 : 4); ++candidate) {
      const double fixed = candidate == 0 ? u0 : candidate == 1 ? u1
                           : candidate == 2 ? v0 : v1;
      const double error = seam
          ? maximum_residual({radius * std::abs(a.X() - fixed), radius * std::abs(b.X() - fixed),
                      std::abs(std::min(a.Y(), b.Y()) - v0),
                      std::abs(std::max(a.Y(), b.Y()) - v1)})
          : maximum_residual({std::abs(a.Y() - fixed), std::abs(b.Y() - fixed),
                      radius * std::abs(std::min(a.X(), b.X()) - u0),
                      radius * std::abs(std::max(a.X(), b.X()) - u1)});
      if (!accepted(error, residual.limit_mm)) continue;
      if (side >= 0) return false;
      side = candidate;
      residual.parameter_coverage_mm = error;
    }
    message = "Nominal band pcurve does not unambiguously cover a complete rectangle side.";
    if (side < 0 || ++side_uses[side] != 1) return false;
    auto& use = output.boundary[i];
    use.edge_index = static_cast<uint32_t>(edge_id);
    use.orientation = edge.Orientation() == TopAbs_FORWARD ? 0 : 1;
    use.side = side;
    use.curve_range[0] = first;
    use.curve_range[1] = last;
    use.pcurve_stored = 1;
    use.parameter_endpoints[0][0] = a.X();
    use.parameter_endpoints[0][1] = a.Y();
    use.parameter_endpoints[1][0] = b.X();
    use.parameter_endpoints[1][1] = b.Y();
    if (seam) {
      if (start_id == end_id || (output.seam_edge_index != 0 &&
          output.seam_edge_index != static_cast<uint32_t>(edge_id))) return false;
      output.seam_edge_index = static_cast<uint32_t>(edge_id);
      seam_direction += edge.Orientation() == TopAbs_FORWARD ? 1 : -1;
      point(output.seam_origin, curve.Line().Location());
      direction(output.seam_axis, curve.Line().Direction());
      output.seam_curve_range[0] = first;
      output.seam_curve_range[1] = last;
      output.seam_vertex_indices[0] = static_cast<uint32_t>(start_id);
      output.seam_vertex_indices[1] = static_cast<uint32_t>(end_id);
      // Both maps are affine on this complete interval (constant U).
      residual.curve_surface_mm = maximum_residual({
          curve.Value(first).Distance(surface.Value(a.X(), a.Y())),
          curve.Value(last).Distance(surface.Value(b.X(), b.Y()))});
    } else {
      if (start_id != end_id || !finite(curve.Period()) || curve.Period() <= 0) return false;
      const gp_Circ circle = curve.Circle();
      const double circle_radius = circle.Radius();
      if (!finite(circle_radius) || circle_radius <= 0) return false;
      residual.parameter_coverage_mm = maximum_residual({residual.parameter_coverage_mm,
          radius * std::abs((last - first) - curve.Period()),
          radius * std::abs(curve.Period() - period)});
      // A full circle is C + X*cos(t) + Y*sin(t). Its horizontal
      // affine pcurve supplies the corresponding surface coefficients, so
      // this triangle-inequality bound covers all t, not sampled locations.
      const double phase = line.Location().X();
      const gp_Vec x(frame.XDirection()), y(frame.YDirection());
      const gp_Vec expected_x =
          (x.Multiplied(std::cos(phase)) + y.Multiplied(std::sin(phase))).Multiplied(radius);
      const gp_Vec expected_y =
          (y.Multiplied(std::cos(phase)) - x.Multiplied(std::sin(phase)))
              .Multiplied(radius * line.Direction().X());
      const gp_Pnt expected_center = cylinder.Location().Translated(
          gp_Vec(frame.Direction()).Multiplied(line.Location().Y()));
      residual.curve_surface_mm = circle.Location().Distance(expected_center) +
          (gp_Vec(circle.Position().XDirection()).Multiplied(circle_radius) - expected_x).Magnitude() +
          (gp_Vec(circle.Position().YDirection()).Multiplied(circle_radius) - expected_y).Magnitude();
      auto& rim = output.rims[side - 2];
      rim.edge_index = static_cast<uint32_t>(edge_id);
      point(rim.center, circle.Location());
      direction(rim.axis, circle.Axis().Direction());
      direction(rim.phase_x, circle.Position().XDirection());
      direction(rim.phase_y, circle.Position().YDirection());
      rim.radius = circle_radius;
      rim.curve_range[0] = first;
      rim.curve_range[1] = last;
      rim.curve_period = curve.Period();
      rim.vertex_indices[0] = static_cast<uint32_t>(start_id);
      rim.vertex_indices[1] = static_cast<uint32_t>(end_id);
    }
    residual.vertex_attachment_mm = maximum_residual({
        BRep_Tool::Pnt(start).Distance(curve.Value(first)),
        BRep_Tool::Pnt(end).Distance(curve.Value(last)),
        BRep_Tool::Pnt(start).Distance(surface.Value(a.X(), a.Y())),
        BRep_Tool::Pnt(end).Distance(surface.Value(b.X(), b.Y()))});
    message = "Nominal band analytic attachment exceeds participating topology tolerances.";
    if (!accepted(residual.parameter_coverage_mm, residual.limit_mm) ||
        !accepted(residual.curve_surface_mm, residual.limit_mm) ||
        !accepted(residual.vertex_attachment_mm, residual.limit_mm)) return false;
  }
  message = "Nominal band requires opposite uses of one seam and two distinct attached closed rims.";
  if (seam_direction != 0 || output.seam_edge_index == 0 ||
      output.rims[0].edge_index == output.rims[1].edge_index ||
      output.rims[0].vertex_indices[0] == output.rims[1].vertex_indices[0] ||
      std::any_of(side_uses.begin(), side_uses.end(), [](int n) { return n != 1; })) return false;
  // Side endpoints establish the station assignment independently of face sense.
  for (const auto& use : output.boundary) {
    if (use.side > 1) continue;
    for (int endpoint = 0; endpoint < 2; ++endpoint) {
      const int station = use.parameter_endpoints[0][1] < use.parameter_endpoints[1][1]
          ? endpoint : 1 - endpoint;
      if (output.seam_vertex_indices[endpoint] != output.rims[station].vertex_indices[0]) return false;
    }
  }
  return true;
}

bool classify_continuous_wall(
    const TopoDS_Shape& shape,
    geospec_occt_continuous_wall_domain& output,
    ShapeIndex& faces, ShapeIndex& edges, std::string& message) {
  TopoDS_Solid solid;
  if (!regular_solid_operand(shape, solid, message)) return false;

  ShapeIndex shells, vertices;
  TopExp::MapShapes(solid, TopAbs_SHELL, shells);
  if (shells.Extent() != 1 || !TopoDS::Shell(shells(1)).Closed()) {
    message = "Continuous wall requires one closed outer shell without cavities.";
    return false;
  }
  BRepClass3d_SolidClassifier classifier(solid);
  classifier.PerformInfinitePoint(0.0);
  if (classifier.State() == TopAbs_UNKNOWN || classifier.State() == TopAbs_ON) {
    throw Standard_Failure(
        "Continuous wall outer-shell classification is inconclusive.");
  }
  if (classifier.State() != TopAbs_OUT) {
    message = "Continuous wall requires a bounded, outward-oriented solid.";
    return false;
  }

  // Preserve the source ordinals of the exact shape being classified.
  TopExp::MapShapes(shape, TopAbs_FACE, faces);
  TopExp::MapShapes(shape, TopAbs_EDGE, edges);
  TopExp::MapShapes(shape, TopAbs_VERTEX, vertices);
  double maximum = 0.0;
  for (int i = 1; i <= faces.Extent(); ++i) {
    const double tolerance = BRep_Tool::Tolerance(TopoDS::Face(faces(i)));
    if (!std::isfinite(tolerance) || tolerance < 0) {
      throw Standard_Failure(
          "Continuous wall face tolerance evidence is nonfinite.");
    }
    maximum = std::max(maximum, tolerance);
  }
  for (int i = 1; i <= edges.Extent(); ++i) {
    const double tolerance = BRep_Tool::Tolerance(TopoDS::Edge(edges(i)));
    if (!std::isfinite(tolerance) || tolerance < 0) {
      throw Standard_Failure(
          "Continuous wall edge tolerance evidence is nonfinite.");
    }
    maximum = std::max(maximum, tolerance);
  }
  for (int i = 1; i <= vertices.Extent(); ++i) {
    const double tolerance = BRep_Tool::Tolerance(TopoDS::Vertex(vertices(i)));
    if (!std::isfinite(tolerance) || tolerance < 0) {
      throw Standard_Failure(
          "Continuous wall vertex tolerance evidence is nonfinite.");
    }
    maximum = std::max(maximum, tolerance);
  }

  bool qualified = false;
  if (faces.Extent() == 6) {
    qualified = continuous_box(faces, edges, vertices, output);
  } else if (faces.Extent() == 3) {
    qualified = continuous_cylinder(faces, edges, vertices, output, message);
  }
  if (!qualified) {
    if (message.empty()) {
      message = "The complete analytic trim and incidence are outside the "
                "qualified continuous wall domains.";
    }
    return false;
  }
  output.maximum_topology_tolerance_mm = maximum;
  return true;
}

bool associate_continuous_subshapes(
    const ShapeIndex& classified, const TopoDS_Shape& occurrence,
    TopAbs_ShapeEnum kind, size_t capacity, uint32_t* output,
    uint32_t& output_count, const char* label, std::string& message) {
  if (static_cast<size_t>(classified.Extent()) > capacity) {
    message = std::string("Selected continuous ") + label +
              " association exceeds the fixed transfer capacity.";
    return false;
  }

  ShapeIndex query;
  TopExp::MapShapes(occurrence, kind, query);
  std::vector<bool> used(static_cast<size_t>(query.Extent()), false);
  for (int source = 1; source <= classified.Extent(); ++source) {
    int match = 0;
    for (int candidate = 1; candidate <= query.Extent(); ++candidate) {
      // IsEqual binds TShape identity, location, and orientation.
      if (!classified(source).IsEqual(query(candidate))) continue;
      if (match != 0) {
        message = std::string("Selected continuous ") + label +
                  " association is ambiguous.";
        return false;
      }
      match = candidate;
    }
    if (match == 0 || used[static_cast<size_t>(match - 1)]) {
      message = std::string("Selected continuous ") + label +
                " association is incomplete.";
      return false;
    }
    used[static_cast<size_t>(match - 1)] = true;
    output[static_cast<size_t>(source - 1)] = static_cast<uint32_t>(match);
  }
  if (std::find(used.begin(), used.end(), false) != used.end()) {
    message = std::string("Selected continuous ") + label +
              " association does not cover the occurrence query topology.";
    return false;
  }
  output_count = static_cast<uint32_t>(classified.Extent());
  return true;
}

uint64_t float_bits(double value) {
  uint64_t bits = 0;
  static_assert(sizeof(bits) == sizeof(value));
  std::memcpy(&bits, &value, sizeof(bits));
  return bits;
}

void mesh_shape(const TopoDS_Shape& shape, double linear, double angular) {
  BRepMesh_IncrementalMesh mesher(shape, linear, false, angular, false);
  if (!mesher.IsDone()) throw Standard_Failure("Tessellation failed.");
  // IsDone is set after collecting face/wire failures; it is not completeness.
  const int incomplete = IMeshData_OpenWire | IMeshData_SelfIntersectingWire |
      IMeshData_Failure | IMeshData_UnorientedWire | IMeshData_TooFewPoints |
      IMeshData_Outdated | IMeshData_UserBreak;
  if ((mesher.GetStatusFlags() & incomplete) != 0) {
    throw Standard_Failure("Tessellation has incomplete face or wire status.");
  }
}

MeshData compute_mesh(const TopoDS_Shape& shape, double linear,
                      double angular) {
  BRepBuilderAPI_Copy copy(shape, false, false);
  if (!copy.IsDone()) throw Standard_Failure("Tessellation shape copy failed.");
  const TopoDS_Shape isolated = copy.Shape();
  mesh_shape(isolated, linear, angular);

  MeshData result;
  std::map<std::tuple<double, double, double>, uint32_t> index_by_point;
  for (TopExp_Explorer explorer(isolated, TopAbs_FACE); explorer.More();
       explorer.Next()) {
    const TopoDS_Face face = TopoDS::Face(explorer.Current());
    TopLoc_Location location;
    const occ::handle<Poly_Triangulation> mesh =
        BRep_Tool::Triangulation(face, location);
    if (mesh.IsNull() || mesh->NbNodes() < 3 || mesh->NbTriangles() < 1) {
      throw Standard_Failure("Tessellation is missing a complete face triangulation.");
    }
    std::vector<uint32_t> local_indices;
    local_indices.reserve(static_cast<size_t>(mesh->NbNodes()));
    for (int node = 1; node <= mesh->NbNodes(); ++node) {
      const gp_Pnt placed =
          mesh->Node(node).Transformed(location.Transformation());
      const auto key =
          std::make_tuple(placed.X(), placed.Y(), placed.Z());
      auto [iterator, inserted] = index_by_point.emplace(
          key, static_cast<uint32_t>(result.positions.size()));
      if (inserted) {
        result.positions.push_back({placed.X(), placed.Y(), placed.Z()});
      }
      local_indices.push_back(iterator->second);
    }
    for (int triangle = 1; triangle <= mesh->NbTriangles(); ++triangle) {
      int first = 0;
      int second = 0;
      int third = 0;
      mesh->Triangle(triangle).Get(first, second, third);
      if (face.Orientation() == TopAbs_REVERSED) std::swap(second, third);
      result.triangles.push_back(
          {local_indices[static_cast<size_t>(first - 1)],
           local_indices[static_cast<size_t>(second - 1)],
           local_indices[static_cast<size_t>(third - 1)]});
    }
  }
  return result;
}

MeshData report_triangle_soup(const TopoDS_Shape& shape) {
  MeshData result;
  for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More();
       explorer.Next()) {
    const TopoDS_Face face = TopoDS::Face(explorer.Current());
    TopLoc_Location location;
    const occ::handle<Poly_Triangulation> mesh =
        BRep_Tool::Triangulation(face, location);
    if (mesh.IsNull() || mesh->NbNodes() < 3 || mesh->NbTriangles() < 1) {
      throw Standard_Failure("Tessellation is missing a complete face triangulation.");
    }
    const gp_Trsf transform = location.Transformation();
    const bool mirrored = transform.VectorialPart().Determinant() < 0.0;
    for (int triangle = 1; triangle <= mesh->NbTriangles(); ++triangle) {
      int nodes[3]{};
      mesh->Triangle(triangle).Get(nodes[0], nodes[1], nodes[2]);
      if ((face.Orientation() == TopAbs_REVERSED) != mirrored) {
        std::swap(nodes[1], nodes[2]);
      }
      if (result.positions.size() >
          static_cast<size_t>(std::numeric_limits<uint32_t>::max()) - 3) {
        throw Standard_Failure("Reported triangle soup exceeds the u32 index range.");
      }
      const uint32_t first = static_cast<uint32_t>(result.positions.size());
      for (int node : nodes) {
        const gp_Pnt placed = mesh->Node(node).Transformed(transform);
        result.positions.push_back({
            static_cast<double>(static_cast<float>(placed.X())),
            static_cast<double>(static_cast<float>(placed.Y())),
            static_cast<double>(static_cast<float>(placed.Z())),
        });
      }
      result.triangles.push_back({first, first + 1, first + 2});
    }
  }
  return result;
}

bool mapped_copy_shape(const BRepBuilderAPI_Copy& copy,
                       const TopoDS_Shape& source,
                       TopAbs_ShapeEnum expected_type,
                       const std::string& identity,
                       TopoDS_Shape& mapped,
                       std::string& message) {
  try {
    mapped = copy.ModifiedShape(source);
  } catch (const Standard_Failure& failure) {
    message = "OCCT copy history did not map " + identity + ": " + failure.what();
    return false;
  }
  if (mapped.IsNull() || mapped.ShapeType() != expected_type) {
    message = "OCCT copy history returned no valid " + identity + " counterpart.";
    return false;
  }
  // Copy history stores subshapes without the caller's contextual orientation.
  // CopyModification never reverses geometry; retain the original use of it.
  mapped.Orientation(source.Orientation());
  return true;
}

geospec_occt_located_face_facts reported_face(
    const TopoDS_Face& face, uint32_t index, uint32_t query_index,
    size_t edge_count) {
  FaceFacts value = face_facts(face, index, query_index);
  // The source XDE face report explicitly excludes triangulation. Whole-shape
  // reporting retains its separate triangulation-enabled source rule.
  Bnd_Box box;
  BRepBndLib::Add(face, box, false);
  if (box.IsVoid()) throw Standard_Failure("Face has no finite reporting bounds.");
  box.Get(value.bounds.min[0], value.bounds.min[1], value.bounds.min[2],
          value.bounds.max[0], value.bounds.max[1], value.bounds.max[2]);
  geospec_occt_located_face_facts result{};
  result.face = value.facts;
  result.bounds = value.bounds;
  result.reversed = value.reversed;
  result.edge_count = edge_count;
  return result;
}

bool build_report(const geospec_occt_document& document,
                  ReportData& report,
                  std::string& message) {
  BRepBuilderAPI_Copy copy(document.shape, false, false);
  if (!copy.IsDone() || copy.Shape().IsNull()) {
    message = "OCCT report shape copy failed.";
    return false;
  }
  const TopoDS_Shape isolated = copy.Shape();
  constexpr double pi = 3.141592653589793238462643383279502884;
  mesh_shape(isolated, 0.01, 15.0 * pi / 180.0);
  report.mesh = report_triangle_soup(isolated);

  report.shape = shape_facts(isolated);
  report.shape.bounds = reporting_bounds(isolated);

  report.occurrences.reserve(document.occurrences.size());
  report.occurrence_faces.reserve(document.occurrences.size());
  for (size_t occurrence_index = 0;
       occurrence_index < document.occurrences.size(); ++occurrence_index) {
    const OccurrenceFacts& source_occurrence =
        document.occurrences[occurrence_index];
    TopoDS_Shape mapped_occurrence;
    if (!mapped_copy_shape(
            copy, source_occurrence.shape, source_occurrence.shape.ShapeType(),
            "occurrence " + std::to_string(occurrence_index),
            mapped_occurrence, message)) {
      return false;
    }
    geospec_occt_occurrence_facts occurrence = source_occurrence.facts;
    // The source XDE occurrence report uses exact analytic bounds, but the
    // geometry still comes from the same history-qualified report copy.
    occurrence.bounds = bounds(mapped_occurrence);
    report.occurrences.push_back(occurrence);

    std::vector<geospec_occt_located_face_facts> mapped_faces;
    mapped_faces.reserve(source_occurrence.public_faces.size());
    for (size_t public_index = 0;
         public_index < source_occurrence.public_faces.size(); ++public_index) {
      const FaceView& source_face =
          source_occurrence.public_faces[public_index];
      if (source_face.query_index == 0) {
        message = "Occurrence public face has no unique private query address.";
        return false;
      }
      const LocatedFaceFacts& query_face =
          source_occurrence.faces[static_cast<size_t>(source_face.query_index - 1)];
      TopoDS_Shape mapped;
      if (!mapped_copy_shape(
              copy, source_face.shape, TopAbs_FACE,
              "occurrence " + std::to_string(occurrence_index) + " face " +
                  std::to_string(public_index),
              mapped, message)) {
        return false;
      }
      mapped_faces.push_back(reported_face(
          TopoDS::Face(mapped), static_cast<uint32_t>(public_index),
          source_face.query_index, query_face.edge_indices.size()));
    }
    report.occurrence_faces.push_back(std::move(mapped_faces));
  }

  report.whole_faces.reserve(document.public_faces.size());
  for (size_t public_index = 0; public_index < document.public_faces.size();
       ++public_index) {
    const FaceView& source_face = document.public_faces[public_index];
    if (source_face.query_index == 0) {
      message = "Public face has no unique private query address.";
      return false;
    }
    TopoDS_Shape mapped;
    if (!mapped_copy_shape(copy, source_face.shape, TopAbs_FACE,
                           "whole face " + std::to_string(public_index),
                           mapped, message)) {
      return false;
    }
    report.whole_faces.push_back(reported_face(
        TopoDS::Face(mapped), static_cast<uint32_t>(public_index),
        source_face.query_index, 0));
  }
  return true;
}

geospec_occt_validity_facts compute_validity(const geospec_occt_document& document,
                                             std::string& reason) {
  const TopoDS_Shape& shape = document.shape;
  geospec_occt_validity_facts result{};
  std::optional<BRepCheck_Analyzer> analyzer;
  // Admission already checked this exact shape with the same analyzer settings.
  // IsValid recursively visits every child, including every solid. Reuse only
  // that successful proof while no potentially destructive query has run.
  if (document.admission_validity_reusable && document.shape_facts.valid) {
    result.valid = 1;
  } else {
    analyzer.emplace(shape, true);
    result.valid = analyzer->IsValid() ? 1 : 0;
  }
  result.same_parameter = 1;
  result.closed_shells = 1;
  result.closed_solids = 1;
  result.closed_wires = 1;

  for (TopExp_Explorer explorer(shape, TopAbs_VERTEX); explorer.More();
       explorer.Next()) {
    result.max_tolerance =
        std::max(result.max_tolerance,
                 BRep_Tool::Tolerance(TopoDS::Vertex(explorer.Current())));
  }
  for (TopExp_Explorer explorer(shape, TopAbs_EDGE); explorer.More();
       explorer.Next()) {
    const TopoDS_Edge edge = TopoDS::Edge(explorer.Current());
    result.max_tolerance =
        std::max(result.max_tolerance, BRep_Tool::Tolerance(edge));
    if (!BRep_Tool::SameParameter(edge)) result.same_parameter = 0;
  }
  for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More();
       explorer.Next()) {
    result.max_tolerance =
        std::max(result.max_tolerance,
                 BRep_Tool::Tolerance(TopoDS::Face(explorer.Current())));
  }

  NCollection_IndexedDataMap<TopoDS_Shape, NCollection_List<TopoDS_Shape>,
                             TopTools_ShapeMapHasher>
      edge_faces;
  TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, edge_faces);
  for (int index = 1; index <= edge_faces.Extent(); ++index) {
    if (edge_faces.FindFromIndex(index).Extent() < 2) {
      ++result.free_bounds;
      ++result.open_edge_count;
    }
  }
  for (TopExp_Explorer explorer(shape, TopAbs_WIRE); explorer.More();
       explorer.Next()) {
    if (!TopoDS::Wire(explorer.Current()).Closed()) result.closed_wires = 0;
  }
  for (TopExp_Explorer explorer(shape, TopAbs_SHELL); explorer.More();
       explorer.Next()) {
    if (!TopoDS::Shell(explorer.Current()).Closed()) result.closed_shells = 0;
  }
  for (TopExp_Explorer explorer(shape, TopAbs_SOLID); explorer.More();
       explorer.Next()) {
    ++result.solid_count;
    if (analyzer.has_value() && !analyzer->IsValid(explorer.Current())) {
      ++result.invalid_solid_count;
    }
  }
  if (result.solid_count == 0) {
    result.closed_solids = 0;
    reason = "no-closed-solid";
  } else if (result.invalid_solid_count != 0) {
    result.closed_solids = 0;
    reason = "invalid-solid";
  } else if (result.open_edge_count != 0) {
    result.closed_solids = 0;
    reason = "open-edge";
  }
  if (!result.valid && reason.empty()) reason = "invalid-shape";
  return result;
}

int point_state(TopAbs_State state) {
  if (state == TopAbs_IN) return GEOSPEC_OCCT_POINT_IN;
  if (state == TopAbs_ON) return GEOSPEC_OCCT_POINT_ON;
  return GEOSPEC_OCCT_POINT_OUT;
}

void perform_extrema(BRepExtrema_DistShapeShape& distance,
                     const TopoDS_Shape& first,
                     const TopoDS_Shape& second) {
  distance.SetMultiThread(false);
  distance.LoadS1(first);
  distance.LoadS2(second);
  distance.Perform();
}

struct WallFace {
  TopoDS_Face face;
  Bnd_Box bounds;
  bool planar = false;
  int surface = GEOSPEC_OCCT_SURFACE_OTHER;
};

struct WallCandidate {
  double value = 0.0;
  gp_Pnt point_a;
  gp_Pnt point_b;
  uint32_t solid = 0;
  uint32_t face_a = 0;
  uint32_t face_b = 0;
  int surface_a = GEOSPEC_OCCT_SURFACE_OTHER;
  int surface_b = GEOSPEC_OCCT_SURFACE_OTHER;
  int support_a = GEOSPEC_OCCT_SUPPORT_UNKNOWN;
  int support_b = GEOSPEC_OCCT_SUPPORT_UNKNOWN;
  uint64_t sequence = 0;
};

struct WallBudget {
  uint64_t limit = 0;
  uint64_t consumed = 0;
  bool exceeded = false;

  bool charge() {
    if (consumed >= limit) {
      exceeded = true;
      return false;
    }
    ++consumed;
    return true;
  }
};

int support_type(BRepExtrema_SupportType type) {
  switch (type) {
    case BRepExtrema_IsVertex: return GEOSPEC_OCCT_SUPPORT_VERTEX;
    case BRepExtrema_IsOnEdge: return GEOSPEC_OCCT_SUPPORT_EDGE;
    case BRepExtrema_IsInFace: return GEOSPEC_OCCT_SUPPORT_FACE;
  }
  return GEOSPEC_OCCT_SUPPORT_UNKNOWN;
}

std::vector<WallFace> wall_faces(const TopoDS_Solid& solid) {
  std::vector<WallFace> result;
  for (TopExp_Explorer explorer(solid, TopAbs_FACE); explorer.More();
       explorer.Next()) {
    const TopoDS_Face face = TopoDS::Face(explorer.Current());
    Bnd_Box box;
    BRepBndLib::Add(face, box, false);
    BRepAdaptor_Surface surface(face, false);
    result.push_back({face, box, surface.GetType() == GeomAbs_Plane,
                      surface_type(surface.GetType())});
  }
  return result;
}

double segment_parameter(const gp_Pnt& start, const gp_Pnt& end,
                         const gp_Pnt& value) {
  const double x = end.X() - start.X();
  const double y = end.Y() - start.Y();
  const double z = end.Z() - start.Z();
  const double length_squared = x * x + y * y + z * z;
  if (length_squared <= 0.0) return 0.0;
  return ((value.X() - start.X()) * x + (value.Y() - start.Y()) * y +
          (value.Z() - start.Z()) * z) /
         length_squared;
}

gp_Pnt segment_point(const gp_Pnt& start, const gp_Pnt& end,
                     double parameter) {
  return gp_Pnt(start.X() + (end.X() - start.X()) * parameter,
                start.Y() + (end.Y() - start.Y()) * parameter,
                start.Z() + (end.Z() - start.Z()) * parameter);
}

bool material_neighborhood(BRepClass3d_SolidClassifier& classifier,
                           const gp_Pnt& value, double tolerance) {
  classifier.Perform(value, tolerance);
  if (classifier.State() == TopAbs_IN) return true;
  if (classifier.State() != TopAbs_ON) return false;
  const double offset = std::max(1e-4, tolerance * 100.0);
  const gp_Pnt probes[] = {
      gp_Pnt(value.X() + offset, value.Y(), value.Z()),
      gp_Pnt(value.X() - offset, value.Y(), value.Z()),
      gp_Pnt(value.X(), value.Y() + offset, value.Z()),
      gp_Pnt(value.X(), value.Y() - offset, value.Z()),
      gp_Pnt(value.X(), value.Y(), value.Z() + offset),
      gp_Pnt(value.X(), value.Y(), value.Z() - offset),
  };
  for (const gp_Pnt& probe : probes) {
    classifier.Perform(probe, tolerance);
    if (classifier.State() == TopAbs_IN) return true;
  }
  return false;
}

bool material_interval(const TopoDS_Solid& solid,
                       const std::vector<WallFace>& faces,
                       const gp_Pnt& point_a, const gp_Pnt& point_b,
                       double tolerance) {
  if (point_a.Distance(point_b) <= tolerance) return false;
  BRepBuilderAPI_MakeEdge builder(point_a, point_b);
  if (!builder.IsDone()) return false;
  const TopoDS_Edge segment = builder.Edge();
  Bnd_Box segment_bounds;
  segment_bounds.Add(point_a);
  segment_bounds.Add(point_b);

  std::vector<double> parameters{0.0, 1.0};
  constexpr double parameter_tolerance = 1e-6;
  for (const WallFace& face : faces) {
    if (face.bounds.Distance(segment_bounds) > tolerance) continue;
    try {
      BRepExtrema_DistShapeShape distance;
      perform_extrema(distance, segment, face.face);
      if (!distance.IsDone() || distance.NbSolution() < 1 ||
          distance.Value() > tolerance) {
        continue;
      }
      for (int solution = 1; solution <= distance.NbSolution(); ++solution) {
        double parameter =
            segment_parameter(point_a, point_b,
                              distance.PointOnShape1(solution));
        if (parameter < -parameter_tolerance ||
            parameter > 1.0 + parameter_tolerance) {
          continue;
        }
        parameter = std::clamp(parameter, 0.0, 1.0);
        const bool duplicate = std::any_of(
            parameters.begin(), parameters.end(), [&](double existing) {
              return std::abs(existing - parameter) <= parameter_tolerance;
            });
        if (!duplicate) parameters.push_back(parameter);
      }
    } catch (...) {
      return false;
    }
  }

  std::sort(parameters.begin(), parameters.end());
  BRepClass3d_SolidClassifier classifier(solid);
  for (size_t index = 0; index + 1 < parameters.size(); ++index) {
    const double left = parameters[index];
    const double right = parameters[index + 1];
    if (right - left <= parameter_tolerance) continue;
    const double middle = (left + right) / 2.0;
    if (middle <= parameter_tolerance ||
        middle >= 1.0 - parameter_tolerance) {
      continue;
    }
    if (!material_neighborhood(
            classifier, segment_point(point_a, point_b, middle), tolerance)) {
      return false;
    }
  }
  return parameters.size() > 2 ||
         material_neighborhood(
             classifier, segment_point(point_a, point_b, 0.5), tolerance);
}

gp_Pnt box_center(const Bnd_Box& box) {
  double min_x = 0.0;
  double min_y = 0.0;
  double min_z = 0.0;
  double max_x = 0.0;
  double max_y = 0.0;
  double max_z = 0.0;
  box.Get(min_x, min_y, min_z, max_x, max_y, max_z);
  return gp_Pnt((min_x + max_x) / 2.0, (min_y + max_y) / 2.0,
                (min_z + max_z) / 2.0);
}

bool parallel_planar_faces(const TopoDS_Face& left,
                           const TopoDS_Face& right) {
  gp_Dir a = BRepAdaptor_Surface(left, false).Plane().Axis().Direction();
  gp_Dir b = BRepAdaptor_Surface(right, false).Plane().Axis().Direction();
  if (left.Orientation() == TopAbs_REVERSED) a.Reverse();
  if (right.Orientation() == TopAbs_REVERSED) b.Reverse();
  return std::abs(std::abs(a.Dot(b)) - 1.0) <= 1e-4;
}

std::unordered_set<uint64_t> adjacent_pairs(
    const TopoDS_Solid& solid, const std::vector<WallFace>& faces) {
  std::unordered_set<uint64_t> result;
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> face_map;
  std::vector<uint32_t> local;
  for (uint32_t index = 0; index < faces.size(); ++index) {
    const int mapped = face_map.Add(faces[index].face);
    if (mapped > static_cast<int>(local.size())) local.push_back(index);
  }
  for (const TopAbs_ShapeEnum type : {TopAbs_EDGE, TopAbs_VERTEX}) {
    NCollection_IndexedDataMap<TopoDS_Shape, NCollection_List<TopoDS_Shape>,
                               TopTools_ShapeMapHasher>
        ancestors;
    TopExp::MapShapesAndAncestors(solid, type, TopAbs_FACE, ancestors);
    for (int index = 1; index <= ancestors.Extent(); ++index) {
      std::vector<uint32_t> indices;
      for (NCollection_List<TopoDS_Shape>::Iterator iterator(
               ancestors.FindFromIndex(index));
           iterator.More(); iterator.Next()) {
        const int mapped = face_map.FindIndex(iterator.Value());
        if (mapped > 0) indices.push_back(local[static_cast<size_t>(mapped - 1)]);
      }
      for (size_t left = 0; left < indices.size(); ++left) {
        for (size_t right = left + 1; right < indices.size(); ++right) {
          const uint32_t low = std::min(indices[left], indices[right]);
          const uint32_t high = std::max(indices[left], indices[right]);
          result.insert((static_cast<uint64_t>(low) << 32) | high);
        }
      }
    }
  }
  return result;
}

void accept_wall(std::vector<WallCandidate>& candidates, double& upper_bound,
                 WallCandidate candidate) {
  candidate.sequence = candidates.size();
  upper_bound = std::min(upper_bound, candidate.value);
  candidates.push_back(std::move(candidate));
}

geospec_occt_wall_result compute_wall(
    const TopoDS_Shape& shape, const geospec_occt_wall_options& options) {
  geospec_occt_wall_result result{};
  result.outcome = 1;
  result.limit = options.work_unit_budget;
  WallBudget budget{options.work_unit_budget};
  constexpr double tolerance = 1e-6;
  std::vector<WallCandidate> accepted;
  double upper_bound = std::numeric_limits<double>::infinity();
  uint32_t solid_index = 0;

  for (TopExp_Explorer solids(shape, TopAbs_SOLID); solids.More();
       solids.Next(), ++solid_index) {
    const TopoDS_Solid solid = TopoDS::Solid(solids.Current());
    const std::vector<WallFace> faces = wall_faces(solid);
    const bool planar_box =
        faces.size() == 6 &&
        std::all_of(faces.begin(), faces.end(),
                    [](const WallFace& face) { return face.planar; });
    const auto adjacent = adjacent_pairs(solid, faces);

    struct Pair {
      double lower_bound;
      uint32_t left;
      uint32_t right;
    };
    std::vector<Pair> pairs;
    for (uint32_t left = 0; left < faces.size(); ++left) {
      for (uint32_t right = left + 1; right < faces.size(); ++right) {
        const uint64_t key = (static_cast<uint64_t>(left) << 32) | right;
        if (adjacent.count(key) == 0) {
          pairs.push_back(
              {faces[left].bounds.Distance(faces[right].bounds), left, right});
        }
      }
    }
    std::sort(pairs.begin(), pairs.end(), [](const Pair& a, const Pair& b) {
      return std::tie(a.lower_bound, a.left, a.right) <
             std::tie(b.lower_bound, b.left, b.right);
    });

    for (const Pair& pair : pairs) {
      if (pair.lower_bound > upper_bound + tolerance) break;
      const WallFace& left = faces[pair.left];
      const WallFace& right = faces[pair.right];
      ++result.checked_pairs;

      if (planar_box && parallel_planar_faces(left.face, right.face)) {
        const gp_Pnt point_a = box_center(left.bounds);
        const gp_Pnt point_b = box_center(right.bounds);
        const double value = point_a.Distance(point_b);
        if (value > tolerance && value <= upper_bound + tolerance &&
            budget.charge() &&
            material_interval(solid, faces, point_a, point_b, tolerance)) {
          accept_wall(accepted, upper_bound,
                      {value, point_a, point_b, solid_index, pair.left,
                       pair.right, left.surface, right.surface,
                       GEOSPEC_OCCT_SUPPORT_FACE,
                       GEOSPEC_OCCT_SUPPORT_FACE});
        }
      }
      if (budget.exceeded || !budget.charge()) break;
      try {
        BRepExtrema_DistShapeShape distance;
        perform_extrema(distance, left.face, right.face);
        if (!distance.IsDone() || distance.NbSolution() < 1) {
          ++result.extrema_failed;
          continue;
        }
        if (distance.Value() <= tolerance) {
          ++result.zero_length;
          continue;
        }
        if (distance.Value() > upper_bound + tolerance) continue;
        for (int solution = 1; solution <= distance.NbSolution(); ++solution) {
          const gp_Pnt point_a = distance.PointOnShape1(solution);
          const gp_Pnt point_b = distance.PointOnShape2(solution);
          if (point_a.Distance(point_b) <= tolerance) {
            ++result.zero_length;
            continue;
          }
          if (!budget.charge()) break;
          if (!material_interval(solid, faces, point_a, point_b, tolerance)) {
            ++result.no_material_interval;
            continue;
          }
          accept_wall(
              accepted, upper_bound,
              {distance.Value(), point_a, point_b, solid_index, pair.left,
               pair.right, left.surface, right.surface,
               support_type(distance.SupportTypeShape1(solution)),
               support_type(distance.SupportTypeShape2(solution))});
        }
      } catch (...) {
        ++result.extrema_failed;
      }
      if (budget.exceeded) break;
    }
    if (budget.exceeded) break;
  }

  result.consumed = budget.consumed;
  if (budget.exceeded) {
    result.outcome = 2;
    return result;
  }
  std::sort(accepted.begin(), accepted.end(),
            [](const WallCandidate& a, const WallCandidate& b) {
              return std::tie(a.solid, a.face_a, a.face_b, a.sequence) <
                     std::tie(b.solid, b.face_a, b.face_b, b.sequence);
            });
  constexpr double tie_tolerance = 1e-6;
  bool measured = false;
  for (const WallCandidate& candidate : accepted) {
    if (!measured || candidate.value < result.value - tie_tolerance) {
      measured = true;
      result.outcome = 0;
      result.value = candidate.value;
      point(result.point_a, candidate.point_a);
      point(result.point_b, candidate.point_b);
      const gp_Pnt middle(
          (candidate.point_a.X() + candidate.point_b.X()) / 2.0,
          (candidate.point_a.Y() + candidate.point_b.Y()) / 2.0,
          (candidate.point_a.Z() + candidate.point_b.Z()) / 2.0);
      point(result.location, middle);
      result.solid_index = candidate.solid;
      result.face_a = candidate.face_a;
      result.face_b = candidate.face_b;
      result.surface_a = candidate.surface_a;
      result.surface_b = candidate.surface_b;
      result.support_a = candidate.support_a;
      result.support_b = candidate.support_b;
      result.tie_count = 1;
    } else if (std::abs(candidate.value - result.value) <= tie_tolerance) {
      ++result.tie_count;
    }
  }
  return result;
}

}  // namespace

int geospec_occt_open_step(const uint8_t* bytes, size_t length,
                           geospec_occt_document** output,
                           geospec_occt_string* error) noexcept {
  if (bytes == nullptr || length == 0 || output == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "STEP bytes/out is empty or null.", error);
  }
  *output = nullptr;
  return guarded(error, [&]() -> int {
    STEPCAFControl_Reader reader;
    // Reader construction registers and resets this option on first use.
    Interface_Static::SetIVal("read.stepcaf.subshapes.name", 1);
    reader.SetNameMode(true);
    reader.SetGDTMode(true);
    std::istringstream stream(std::string(reinterpret_cast<const char*>(bytes), length));
    if (reader.ReadStream("memory.step", stream) != IFSelect_RetDone) {
      return fail(GEOSPEC_OCCT_READ_FAILED, "STEP read failed.", error);
    }

    auto result = std::make_unique<geospec_occt_document>();
    result->schema = step_schema(reader);
    result->source_byte_length = length;
    result->document = new TDocStd_Document("BinXCAF");
    XCAFDoc_DocumentTool::Set(result->document->Main());

    NCollection_Sequence<TCollection_AsciiString> lengths;
    NCollection_Sequence<TCollection_AsciiString> angles;
    NCollection_Sequence<TCollection_AsciiString> solid_angles;
    reader.ChangeReader().FileUnits(lengths, angles, solid_angles);
    if (!lengths.IsEmpty()) {
      result->source_length_unit = lengths.First().ToCString();
      result->source_unit_to_millimeters =
          source_length_unit_to_millimeters(reader.ChangeReader());
      if (result->source_unit_to_millimeters <= 0.0) {
        return fail(GEOSPEC_OCCT_TRANSFER_FAILED,
                    "STEP source length unit could not be converted to millimeters.", error);
      }
    }

    STEPConstruct_ExternRefs external_references(reader.ChangeReader().WS());
    external_references.LoadExternRefs();
    if (external_references.NbExternRefs() != 0) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "STEP external file references are unsupported by byte-only admission.", error);
    }

    if (!reader.Transfer(result->document)) {
      return fail(GEOSPEC_OCCT_TRANSFER_FAILED, "STEP XDE transfer failed.", error);
    }
    if (result->source_length_unit.empty()) {
      double unit_meters = 0.0;
      if (XCAFDoc_DocumentTool::GetLengthUnit(result->document, unit_meters)) {
        result->source_unit_to_millimeters = unit_meters * 1000.0;
      }
    }

    const auto shape_tool = XCAFDoc_DocumentTool::ShapeTool(result->document->Main());
    NCollection_Sequence<TDF_Label> roots;
    shape_tool->GetFreeShapes(roots);
    if (roots.IsEmpty()) return fail(GEOSPEC_OCCT_NO_SHAPE, "STEP has no free shape.", error);
    for (const TDF_Label& root : roots) {
      TopExp_Explorer faces(shape_tool->GetShape(root), TopAbs_FACE);
      if (!XCAFDoc_ShapeTool::IsAssembly(root) && faces.More()) {
        ++result->free_shape_count;
      }
    }
    result->shape = shape_tool->GetOneShape();
    if (result->shape.IsNull()) return fail(GEOSPEC_OCCT_NO_SHAPE, "STEP has no shape.", error);
    result->shape_facts = shape_facts(result->shape);

    NCollection_Sequence<TDF_Label> products;
    shape_tool->GetShapes(products);
    const ProductIdentityIndex identity = product_identity(reader);
    result->products.reserve(static_cast<size_t>(products.Length()));
    for (const TDF_Label& product : products) {
      result->products.push_back(
          {label_entry(product), resolved_product_name(product, identity)});
    }
    std::vector<std::string> root_names;
    std::map<std::string, size_t> root_totals;
    for (const TDF_Label& root : roots) {
      std::string name = label_name(root);
      if (name.empty()) name = resolved_product_name(root, identity);
      if (name.empty()) name = label_entry(root);
      root_names.push_back(name);
      ++root_totals[name];
    }
    std::map<std::string, size_t> root_ordinals;
    size_t root_index = 0;
    for (const TDF_Label& root : roots) {
      NCollection_Sequence<TDF_Label> components;
      const bool has_components =
          XCAFDoc_ShapeTool::GetComponents(root, components);
      if (roots.Length() > 1 && !has_components) {
        std::string path = root_names[root_index];
        if (root_totals[path] > 1) {
          path += "[" +
                  std::to_string(++root_ordinals[root_names[root_index]]) +
                  "]";
        }
        append_free_shape_occurrence(shape_tool, root, root_index + 1, path,
                                     identity, result->products,
                                     result->occurrences);
      }
      append_occurrences(shape_tool, root, XCAFDoc_ShapeTool::GetLocation(root),
                         "", {}, -1, identity, result->products,
                         result->occurrences);
      ++root_index;
    }
    prepare_source_associations(reader, shape_tool, result->occurrences,
                                result->source_faces);
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faces;
    TopExp::MapShapes(result->shape, TopAbs_FACE, faces);
    result->faces.reserve(static_cast<size_t>(faces.Extent()));
    for (int index = 1; index <= faces.Extent(); ++index) {
      result->faces.push_back(face_facts(
          TopoDS::Face(faces(index)), static_cast<uint32_t>(index),
          static_cast<uint32_t>(index)));
    }
    result->public_faces.reserve(result->shape_facts.faces);
    for (TopExp_Explorer explorer(result->shape, TopAbs_FACE); explorer.More();
         explorer.Next()) {
      const TopoDS_Face face = TopoDS::Face(explorer.Current());
      const int query_index =
          exact_mapped_face_index(faces, result->faces, face);
      result->public_faces.push_back(
          {query_index > 0 ? static_cast<uint32_t>(query_index) : 0, face});
    }
    append_subshapes(shape_tool, products, result->occurrences,
                     result->faces, result->public_faces,
                     result->subshapes);

    const auto pmi_tool = XCAFDoc_DocumentTool::DimTolTool(result->document->Main());
    NCollection_Sequence<TDF_Label> dimensions;
    NCollection_Sequence<TDF_Label> tolerances;
    NCollection_Sequence<TDF_Label> datums;
    pmi_tool->GetDimensionLabels(dimensions);
    pmi_tool->GetGeomToleranceLabels(tolerances);
    pmi_tool->GetDatumLabels(datums);
    result->pmi.reserve(static_cast<size_t>(dimensions.Length() + tolerances.Length() + datums.Length()));
    append_pmi(dimensions, GEOSPEC_OCCT_PMI_DIMENSION, result->pmi);
    append_pmi(tolerances, GEOSPEC_OCCT_PMI_GEOMETRIC_TOLERANCE, result->pmi);
    append_pmi(datums, GEOSPEC_OCCT_PMI_DATUM, result->pmi);
    append_semantic_datums(reader, shape_tool, products, result->occurrences,
                           result->public_faces, result->semantic_datums);
    append_datum_placements(reader, result->occurrences,
                            result->datum_placements);

    *output = result.release();
    return GEOSPEC_OCCT_OK;
  });
}

void geospec_occt_release(geospec_occt_document* document) noexcept { delete document; }

int geospec_occt_document_facts(const geospec_occt_document* document,
                                geospec_occt_shape_facts* shape,
                                double* unit_to_millimeters,
                                geospec_occt_string* source_unit,
                                geospec_occt_string* error) noexcept {
  if (document == nullptr || shape == nullptr || unit_to_millimeters == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Document/facts output is null.", error);
  }
  *shape = document->shape_facts;
  *unit_to_millimeters = document->source_unit_to_millimeters;
  return write_string(document->source_length_unit, source_unit);
}

int geospec_occt_continuous_wall(
    const geospec_occt_document* document,
    geospec_occt_continuous_wall_domain* output,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || output == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Continuous wall document/output is null.", error);
  }
  *output = {};
  return guarded(error, [&]() -> int {
    ShapeIndex faces, edges;
    std::string message;
    if (!classify_continuous_wall(document->shape, *output, faces, edges,
                                  message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_selected_continuous_domain(
    const geospec_occt_document* document, uint32_t occurrence,
    geospec_occt_selected_continuous_domain_result* output,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || output == nullptr ||
      occurrence >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Selected continuous occurrence/output is invalid.", error);
  }
  *output = {};
  return guarded(error, [&]() -> int {
    const OccurrenceFacts& selected = document->occurrences[occurrence];
    ShapeIndex faces, edges;
    std::string message;
    if (!classify_continuous_wall(selected.shape, output->domain, faces, edges,
                                  message) ||
        !associate_continuous_subshapes(
            faces, selected.shape, TopAbs_FACE, std::size(output->face_map),
            output->face_map, output->face_count, "face", message) ||
        !associate_continuous_subshapes(
            edges, selected.shape, TopAbs_EDGE, std::size(output->edge_map),
            output->edge_map, output->edge_count, "edge", message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    output->occurrence = occurrence;
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_admission_facts(
    const geospec_occt_document* document,
    double* unit_to_millimeters, size_t* occurrence_count,
    geospec_occt_string* source_unit,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || unit_to_millimeters == nullptr ||
      occurrence_count == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/admission output is null.", error);
  }
  *unit_to_millimeters = document->source_unit_to_millimeters;
  *occurrence_count = document->occurrences.size();
  return write_string(document->source_length_unit, source_unit);
}

int geospec_occt_step_subject_metadata(
    const geospec_occt_document* document, size_t* source_byte_length,
    size_t* free_shape_count, geospec_occt_string* schema,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || source_byte_length == nullptr ||
      free_shape_count == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/STEP metadata output is null.", error);
  }
  *source_byte_length = document->source_byte_length;
  *free_shape_count = document->free_shape_count;
  return write_string(document->schema, schema);
}

int geospec_occt_report_prepare(
    const geospec_occt_document* document,
    geospec_occt_report_sizes* sizes,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || sizes == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/report sizes output is null.", error);
  }
  document->report.reset();
  return guarded(error, [&]() -> int {
    ReportData report;
    std::string message;
    if (!build_report(*document, report, message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    size_t occurrence_face_count = 0;
    for (const auto& faces : report.occurrence_faces) {
      if (faces.size() > std::numeric_limits<size_t>::max() -
                             occurrence_face_count) {
        return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                    "Reported occurrence-face count exceeds addressable memory.",
                    error);
      }
      occurrence_face_count += faces.size();
    }
    auto bytes = [&](size_t count, size_t width, size_t& output) -> bool {
      if (count != 0 && width > std::numeric_limits<size_t>::max() / count) {
        return false;
      }
      output = count * width;
      return true;
    };

    *sizes = {};
    sizes->occurrence_count = report.occurrences.size();
    sizes->whole_face_count = report.whole_faces.size();
    sizes->occurrence_face_count = occurrence_face_count;
    sizes->position_count = report.mesh.positions.size();
    sizes->triangle_count = report.mesh.triangles.size();
    sizes->shape_bytes = sizeof(report.shape);
    if (!bytes(report.occurrences.size(), sizeof(report.occurrences[0]),
               sizes->occurrence_bytes) ||
        !bytes(report.whole_faces.size(), sizeof(report.whole_faces[0]),
               sizes->whole_face_bytes) ||
        !bytes(occurrence_face_count,
               sizeof(geospec_occt_located_face_facts),
               sizes->occurrence_face_bytes) ||
        !bytes(report.mesh.positions.size(), sizeof(report.mesh.positions[0]),
               sizes->position_bytes) ||
        !bytes(report.mesh.triangles.size(), sizeof(report.mesh.triangles[0]),
               sizes->triangle_bytes)) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "Reported transfer byte count exceeds addressable memory.",
                  error);
    }
    document->report.emplace(std::move(report));
    return GEOSPEC_OCCT_OK;
  });
}

void geospec_occt_report_discard(
    const geospec_occt_document* document) noexcept {
  if (document != nullptr) document->report.reset();
}

int geospec_occt_report_document_facts(
    const geospec_occt_document* document,
    geospec_occt_shape_facts* shape,
    double* unit_to_millimeters,
    geospec_occt_string* source_unit,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || !document->report.has_value() || shape == nullptr ||
      unit_to_millimeters == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Prepared report/document facts output is unavailable.", error);
  }
  *shape = document->report->shape;
  *unit_to_millimeters = document->source_unit_to_millimeters;
  return write_string(document->source_length_unit, source_unit);
}

int geospec_occt_report_occurrence(
    const geospec_occt_document* document, size_t index,
    geospec_occt_occurrence_facts* occurrence,
    geospec_occt_string* label, geospec_occt_string* product_label,
    geospec_occt_string* name,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || !document->report.has_value() ||
      occurrence == nullptr || index >= document->report->occurrences.size() ||
      index >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Prepared report occurrence index/output is invalid.", error);
  }
  *occurrence = document->report->occurrences[index];
  const OccurrenceFacts& source = document->occurrences[index];
  int status = write_string(source.label, label);
  status = copy_result(status, write_string(source.product_label, product_label));
  return copy_result(status, write_string(source.name, name));
}

int geospec_occt_report_face(
    const geospec_occt_document* document, size_t index,
    geospec_occt_located_face_facts* face,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || !document->report.has_value() || face == nullptr ||
      index >= document->report->whole_faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Prepared report face index/output is invalid.", error);
  }
  *face = document->report->whole_faces[index];
  return GEOSPEC_OCCT_OK;
}

size_t geospec_occt_report_occurrence_face_count(
    const geospec_occt_document* document,
    uint32_t occurrence) noexcept {
  return document == nullptr || !document->report.has_value() ||
                 occurrence >= document->report->occurrence_faces.size()
             ? 0
             : document->report->occurrence_faces[occurrence].size();
}

int geospec_occt_report_occurrence_face(
    const geospec_occt_document* document, uint32_t occurrence, size_t index,
    geospec_occt_located_face_facts* face,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || !document->report.has_value() || face == nullptr ||
      occurrence >= document->report->occurrence_faces.size() ||
      index >= document->report->occurrence_faces[occurrence].size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Prepared report occurrence-face index/output is invalid.",
                error);
  }
  *face = document->report->occurrence_faces[occurrence][index];
  return GEOSPEC_OCCT_OK;
}

int geospec_occt_report_mesh(
    const geospec_occt_document* document,
    double* positions, size_t position_capacity,
    uint32_t* triangles, size_t triangle_capacity,
    size_t* position_count, size_t* triangle_count,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || !document->report.has_value() ||
      position_count == nullptr || triangle_count == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Prepared report mesh output is unavailable.", error);
  }
  const MeshData& mesh = document->report->mesh;
  *position_count = mesh.positions.size();
  *triangle_count = mesh.triangles.size();
  if (positions == nullptr || triangles == nullptr ||
      position_capacity < mesh.positions.size() ||
      triangle_capacity < mesh.triangles.size()) {
    return fail(GEOSPEC_OCCT_BUFFER_TOO_SMALL,
                "Reported mesh output buffer is too small.", error);
  }
  for (size_t index = 0; index < mesh.positions.size(); ++index) {
    std::copy(mesh.positions[index].begin(), mesh.positions[index].end(),
              positions + index * 3);
  }
  for (size_t index = 0; index < mesh.triangles.size(); ++index) {
    std::copy(mesh.triangles[index].begin(), mesh.triangles[index].end(),
              triangles + index * 3);
  }
  document->report.reset();
  return GEOSPEC_OCCT_OK;
}

size_t geospec_occt_product_count(const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->products.size();
}

int geospec_occt_product(const geospec_occt_document* document, size_t index,
                         geospec_occt_string* label, geospec_occt_string* name,
                         geospec_occt_string* error) noexcept {
  if (document == nullptr || index >= document->products.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Product index is out of range.", error);
  }
  const ProductFacts& product = document->products[index];
  return copy_result(write_string(product.label, label), write_string(product.name, name));
}

size_t geospec_occt_occurrence_count(const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->occurrences.size();
}

int geospec_occt_occurrence(const geospec_occt_document* document, size_t index,
                            geospec_occt_occurrence_facts* occurrence,
                            geospec_occt_string* label,
                            geospec_occt_string* product_label,
                            geospec_occt_string* name,
                            geospec_occt_string* error) noexcept {
  if (document == nullptr || occurrence == nullptr || index >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Occurrence index/output is invalid.", error);
  }
  const OccurrenceFacts& value = document->occurrences[index];
  *occurrence = value.facts;
  int status = write_string(value.label, label);
  status = copy_result(status, write_string(value.product_label, product_label));
  return copy_result(status, write_string(value.name, name));
}

int geospec_occt_occurrence_identity(
    const geospec_occt_document* document, size_t index,
    geospec_occt_string* path, geospec_occt_string* product_name,
    geospec_occt_string* instance_name,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || index >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence identity index is out of range.", error);
  }
  const OccurrenceFacts& value = document->occurrences[index];
  int status = write_string(value.path, path);
  status = copy_result(status, write_string(value.product_name, product_name));
  return copy_result(status, write_string(value.instance_name, instance_name));
}

int geospec_occt_occurrence_ordinal(
    const geospec_occt_document* document, size_t index,
    size_t ordinal_index, uint32_t* ordinal,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || ordinal == nullptr ||
      index >= document->occurrences.size() ||
      ordinal_index >= document->occurrences[index].ordinal_path.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence ordinal index/output is invalid.", error);
  }
  *ordinal = document->occurrences[index].ordinal_path[ordinal_index];
  return GEOSPEC_OCCT_OK;
}

size_t geospec_occt_face_count(const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->public_faces.size();
}

size_t geospec_occt_query_face_count(
    const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->faces.size();
}

int geospec_occt_face(const geospec_occt_document* document, size_t index,
                      geospec_occt_face_facts* face,
                      geospec_occt_string* error) noexcept {
  if (document == nullptr || face == nullptr ||
      index >= document->public_faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Face index/output is invalid.", error);
  }
  const uint32_t query_index = document->public_faces[index].query_index;
  if (query_index == 0) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Public face has no unique private query address.", error);
  }
  *face = document->faces[static_cast<size_t>(query_index - 1)].facts;
  face->index = static_cast<uint32_t>(index);
  face->query_index = query_index;
  return GEOSPEC_OCCT_OK;
}

int geospec_occt_face_location(const geospec_occt_document* document,
                               size_t index, geospec_occt_bounds* out_bounds,
                               int* out_reversed,
                               geospec_occt_string* error) noexcept {
  if (document == nullptr || out_bounds == nullptr || out_reversed == nullptr ||
      index >= document->public_faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Face location index/output is invalid.", error);
  }
  const uint32_t query_index = document->public_faces[index].query_index;
  if (query_index == 0) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Public face has no unique private query address.", error);
  }
  const FaceFacts& query_face =
      document->faces[static_cast<size_t>(query_index - 1)];
  *out_bounds = query_face.bounds;
  *out_reversed = query_face.reversed;
  return GEOSPEC_OCCT_OK;
}

int geospec_occt_face_label(const geospec_occt_document* document,
                            size_t index, geospec_occt_string* shape_label,
                            geospec_occt_string* error) noexcept {
  if (document == nullptr || index >= document->public_faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Face-label index is invalid.", error);
  }
  const uint32_t query_index = document->public_faces[index].query_index;
  if (query_index == 0) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Public face has no unique private query address.", error);
  }
  return write_string(
      document->faces[static_cast<size_t>(query_index - 1)].shape_label,
      shape_label);
}

size_t geospec_occt_pmi_count(const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->pmi.size();
}

int geospec_occt_pmi(const geospec_occt_document* document, size_t index,
                     geospec_occt_pmi_facts* pmi,
                     geospec_occt_string* label, geospec_occt_string* name,
                     geospec_occt_string* error) noexcept {
  if (document == nullptr || pmi == nullptr || index >= document->pmi.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "PMI index/output is invalid.", error);
  }
  const PmiFacts& value = document->pmi[index];
  pmi->kind = value.kind;
  pmi->association_count = value.shape_labels.size();
  pmi->first_association_count = value.first_association_count;
  return copy_result(write_string(value.label, label), write_string(value.name, name));
}

int geospec_occt_pmi_association(const geospec_occt_document* document,
                                 size_t pmi_index, size_t association_index,
                                 geospec_occt_string* shape_label,
                                 geospec_occt_string* error) noexcept {
  if (document == nullptr || pmi_index >= document->pmi.size() ||
      association_index >= document->pmi[pmi_index].shape_labels.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "PMI association index is out of range.", error);
  }
  return write_string(document->pmi[pmi_index].shape_labels[association_index], shape_label);
}

int geospec_occt_pmi_source_faces(
    const geospec_occt_document* document, uint32_t source_face_id,
    geospec_occt_pmi_source_face* output, size_t capacity,
    size_t* count, int* status, geospec_occt_string* error) noexcept {
  if (!document || !source_face_id || !output || !count || !status || capacity > 4096) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Invalid PMI source-face output.", error);
  }
  *count = 0;
  *status = 1;
  return guarded(error, [&]() -> int {
    const SourceFaceFacts* source = nullptr;
    for (const auto& candidate : document->source_faces) {
      if (candidate.entity != source_face_id) continue;
      if (source) { *status = 2; return GEOSPEC_OCCT_OK; }
      source = &candidate;
    }
    if (!source) return GEOSPEC_OCCT_OK;
    if (document->occurrences.empty()) {
      size_t found = 0;
      for (size_t index = 0; index < document->public_faces.size(); ++index) {
        const auto& candidate = document->public_faces[index];
        if (!candidate.shape.IsEqual(source->shape)) continue;
        if (++found > 1) { *count = 0; *status = 2; return GEOSPEC_OCCT_OK; }
        if (capacity == 0) return fail(GEOSPEC_OCCT_UNSUPPORTED, "PMI output capacity exhausted.", error);
        output[0] = {};
        output[0].occurrence = -1;
        output[0].public_face_ordinal = static_cast<uint32_t>(index);
      }
      *count = found;
      *status = found ? 0 : 1;
      return GEOSPEC_OCCT_OK;
    }
    bool unresolved = false;
    for (size_t index = 0; index < document->occurrences.size(); ++index) {
      const auto& occurrence = document->occurrences[index];
      // Only occurrences containing the original source TShape are applicable.
      size_t partners = 0;
      for (const auto& face : occurrence.faces) if (face.shape.IsPartner(source->shape)) ++partners;
      if (!partners) continue;
      if (partners != 1) { *count = 0; *status = 2; return GEOSPEC_OCCT_OK; }
      if (!occurrence.source_transfer_valid) { unresolved = true; continue; }
      geospec_occt_resolved_source_face resolved{};
      const int result = geospec_occt_resolve_source_face(document, source_face_id,
          occurrence.source_route.data(), occurrence.source_route.size(), &resolved, error);
      if (result != GEOSPEC_OCCT_OK) { unresolved = true; continue; }
      if (*count == capacity) return fail(GEOSPEC_OCCT_UNSUPPORTED, "PMI output capacity exhausted.", error);
      auto& value = output[(*count)++];
      value = {};
      value.occurrence = resolved.occurrence;
      value.public_face_ordinal = resolved.public_face_ordinal;
      value.route_count = occurrence.source_route.size();
      std::copy(occurrence.source_route.begin(), occurrence.source_route.end(), value.route);
    }
    *status = unresolved ? 3 : (*count ? 0 : 1);
    return GEOSPEC_OCCT_OK;
  });
}

size_t geospec_occt_subshape_count(
    const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->subshapes.size();
}

int geospec_occt_subshape(
    const geospec_occt_document* document, size_t index,
    geospec_occt_subshape_facts* subshape,
    geospec_occt_string* occurrence_path, geospec_occt_string* name,
    geospec_occt_string* shape_label,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || subshape == nullptr ||
      index >= document->subshapes.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Subshape index/output is invalid.", error);
  }
  const SubshapeFacts& value = document->subshapes[index];
  subshape->occurrence = value.occurrence;
  subshape->shape_type = value.shape_type;
  subshape->face_index = value.face_index;
  subshape->has_face_index = value.has_face_index ? 1 : 0;
  int status = write_string(value.occurrence_path, occurrence_path);
  status = copy_result(status, write_string(value.name, name));
  return copy_result(status, write_string(value.shape_label, shape_label));
}

size_t geospec_occt_semantic_datum_count(
    const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->semantic_datums.size();
}

int geospec_occt_semantic_datum(
    const geospec_occt_document* document, size_t index,
    geospec_occt_semantic_datum_facts* datum,
    geospec_occt_string* occurrence_path, geospec_occt_string* label,
    geospec_occt_string* feature_name,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || datum == nullptr ||
      index >= document->semantic_datums.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Semantic datum index/output is invalid.", error);
  }
  const SemanticDatumFacts& value = document->semantic_datums[index];
  datum->occurrence = value.occurrence;
  datum->face_count = value.face_indices.size();
  int status = write_string(value.occurrence_path, occurrence_path);
  status = copy_result(status, write_string(value.label, label));
  return copy_result(status, write_string(value.feature_name, feature_name));
}

int geospec_occt_semantic_datum_face(
    const geospec_occt_document* document, size_t index, size_t face_index,
    uint32_t* face, geospec_occt_string* error) noexcept {
  if (document == nullptr || face == nullptr ||
      index >= document->semantic_datums.size() ||
      face_index >= document->semantic_datums[index].face_indices.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Semantic datum face index/output is invalid.", error);
  }
  *face = document->semantic_datums[index].face_indices[face_index];
  return GEOSPEC_OCCT_OK;
}

size_t geospec_occt_datum_placement_count(
    const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->datum_placements.size();
}

int geospec_occt_datum_placement(
    const geospec_occt_document* document, size_t index,
    geospec_occt_datum_placement_facts* placement,
    geospec_occt_string* occurrence_path, geospec_occt_string* name,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || placement == nullptr ||
      index >= document->datum_placements.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Datum placement index/output is invalid.", error);
  }
  const DatumPlacementFacts& value = document->datum_placements[index];
  placement->occurrence = value.occurrence;
  std::copy(value.origin.begin(), value.origin.end(), placement->origin);
  std::copy(value.x_axis.begin(), value.x_axis.end(), placement->x_axis);
  std::copy(value.z_axis.begin(), value.z_axis.end(), placement->z_axis);
  return copy_result(write_string(value.occurrence_path, occurrence_path),
                     write_string(value.name, name));
}

size_t geospec_occt_occurrence_face_count(
    const geospec_occt_document* document, uint32_t occurrence) noexcept {
  return document == nullptr || occurrence >= document->occurrences.size()
             ? 0
             : document->occurrences[occurrence].public_faces.size();
}

size_t geospec_occt_occurrence_query_face_count(
    const geospec_occt_document* document, uint32_t occurrence) noexcept {
  return document == nullptr || occurrence >= document->occurrences.size()
             ? 0
             : document->occurrences[occurrence].faces.size();
}

int geospec_occt_resolve_source_face(
    const geospec_occt_document* document, uint32_t source_face_entity,
    const uint32_t* occurrence_route, size_t occurrence_route_count,
    geospec_occt_resolved_source_face* output,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || source_face_entity == 0 ||
      occurrence_route == nullptr || occurrence_route_count == 0 ||
      occurrence_route_count > 32 || output == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Source face key/output is invalid.", error);
  }
  *output = {};
  return guarded(error, [&]() -> int {
    const OccurrenceFacts* occurrence = nullptr;
    uint32_t occurrence_index = 0;
    for (size_t index = 0; index < document->occurrences.size(); ++index) {
      const OccurrenceFacts& candidate = document->occurrences[index];
      if (!candidate.source_transfer_valid ||
          candidate.source_route.size() != occurrence_route_count ||
          !std::equal(candidate.source_route.begin(), candidate.source_route.end(),
                      occurrence_route)) {
        continue;
      }
      if (occurrence != nullptr) {
        return fail(GEOSPEC_OCCT_UNSUPPORTED,
                    "Source occurrence route is ambiguous after transfer.", error);
      }
      occurrence = &candidate;
      occurrence_index = static_cast<uint32_t>(index);
    }
    if (occurrence == nullptr) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "Source occurrence route has no qualified forward transfer.", error);
    }

    const SourceFaceFacts* source = nullptr;
    for (const SourceFaceFacts& candidate : document->source_faces) {
      if (candidate.entity != source_face_entity) continue;
      if (source != nullptr) {
        return fail(GEOSPEC_OCCT_UNSUPPORTED,
                    "Source face entity is ambiguous after transfer.", error);
      }
      source = &candidate;
    }
    if (source == nullptr) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "Source face entity has no qualified forward transfer.", error);
    }

    size_t private_index = occurrence->faces.size();
    size_t private_count = 0;
    for (size_t index = 0; index < occurrence->faces.size(); ++index) {
      if (occurrence->faces[index].shape.IsPartner(source->shape)) {
        private_index = index;
        ++private_count;
      }
    }
    if (private_count != 1) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "Source face does not have one occurrence-face partner.", error);
    }
    const TopoDS_Face& transferred = occurrence->faces[private_index].shape;
    const TopoDS_Shape expected = source->shape.Moved(occurrence->shape.Location());
    if (!expected.Location().IsEqual(transferred.Location()) ||
        (transferred.Orientation() != TopAbs_FORWARD &&
         transferred.Orientation() != TopAbs_REVERSED) ||
        (expected.Orientation() != TopAbs_FORWARD &&
         expected.Orientation() != TopAbs_REVERSED)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "Source face location/orientation is not qualified.", error);
    }

    size_t public_index = occurrence->public_faces.size();
    size_t public_count = 0;
    for (size_t index = 0; index < occurrence->public_faces.size(); ++index) {
      const FaceView& candidate = occurrence->public_faces[index];
      if (candidate.query_index == private_index + 1 &&
          candidate.shape.IsEqual(transferred)) {
        public_index = index;
        ++public_count;
      }
    }
    if (public_count != 1) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "Source face has no unique public/private face association.", error);
    }
    output->occurrence = occurrence_index;
    output->public_face_ordinal = static_cast<uint32_t>(public_index);
    output->private_query_face = static_cast<uint32_t>(private_index + 1);
    output->source_same_sense = source->same_sense ? 1 : 0;
    output->transferred_reversed =
        transferred.Orientation() == TopAbs_REVERSED ? 1 : 0;
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_occurrence_face(
    const geospec_occt_document* document, uint32_t occurrence, size_t index,
    geospec_occt_located_face_facts* face,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || face == nullptr ||
      occurrence >= document->occurrences.size() ||
      index >= document->occurrences[occurrence].public_faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence face index/output is invalid.", error);
  }
  const OccurrenceFacts& value = document->occurrences[occurrence];
  const uint32_t query_index = value.public_faces[index].query_index;
  if (query_index == 0) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Occurrence public face has no unique private query address.",
                error);
  }
  *face = value.faces[static_cast<size_t>(query_index - 1)].facts;
  face->face.index = static_cast<uint32_t>(index);
  face->face.query_index = query_index;
  return GEOSPEC_OCCT_OK;
}

int geospec_occt_occurrence_face_label(
    const geospec_occt_document* document, uint32_t occurrence, size_t index,
    geospec_occt_string* shape_label,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || occurrence >= document->occurrences.size() ||
      index >= document->occurrences[occurrence].public_faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence face-label index is invalid.", error);
  }
  const OccurrenceFacts& value = document->occurrences[occurrence];
  const uint32_t query_index = value.public_faces[index].query_index;
  if (query_index == 0) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Occurrence public face has no unique private query address.",
                error);
  }
  return write_string(
      value.faces[static_cast<size_t>(query_index - 1)].shape_label,
      shape_label);
}

int geospec_occt_occurrence_face_edge(
    const geospec_occt_document* document, uint32_t occurrence,
    size_t face_index, size_t edge_index, uint32_t* edge,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || edge == nullptr ||
      occurrence >= document->occurrences.size() ||
      face_index >= document->occurrences[occurrence].public_faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence face-edge index/output is invalid.", error);
  }
  const OccurrenceFacts& value = document->occurrences[occurrence];
  const uint32_t query_index = value.public_faces[face_index].query_index;
  if (query_index == 0) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Occurrence public face has no unique private query address.",
                error);
  }
  const std::vector<uint32_t>& edge_indices =
      value.faces[static_cast<size_t>(query_index - 1)].edge_indices;
  if (edge_index >= edge_indices.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence face-edge index/output is invalid.", error);
  }
  *edge = edge_indices[edge_index];
  return GEOSPEC_OCCT_OK;
}

size_t geospec_occt_occurrence_edge_count(
    const geospec_occt_document* document, uint32_t occurrence) noexcept {
  return document == nullptr || occurrence >= document->occurrences.size()
             ? 0
             : document->occurrences[occurrence].edges.size();
}

int geospec_occt_occurrence_edge(
    const geospec_occt_document* document, uint32_t occurrence, size_t index,
    geospec_occt_edge_facts* edge, geospec_occt_string* error) noexcept {
  if (document == nullptr || edge == nullptr ||
      occurrence >= document->occurrences.size() ||
      index >= document->occurrences[occurrence].edges.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence edge index/output is invalid.", error);
  }
  *edge = document->occurrences[occurrence].edges[index].facts;
  return GEOSPEC_OCCT_OK;
}

int geospec_occt_validity(const geospec_occt_document* document,
                          geospec_occt_validity_facts* validity,
                          geospec_occt_string* reason,
                          geospec_occt_string* error) noexcept {
  if (document == nullptr || validity == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/validity output is null.", error);
  }
  return guarded(error, [&]() -> int {
    std::string message;
    *validity = compute_validity(*document, message);
    return write_string(message, reason);
  });
}

int geospec_occt_extrema(const geospec_occt_document* document,
                         geospec_occt_entity a, geospec_occt_entity b,
                         geospec_occt_extrema_result* extrema,
                         geospec_occt_string* error) noexcept {
  if (document == nullptr || extrema == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/extrema output is null.", error);
  }
  return guarded(error, [&]() -> int {
    TopoDS_Shape shape_a;
    TopoDS_Shape shape_b;
    std::string message;
    if (!resolve_entity(*document, a, shape_a, message) ||
        !resolve_entity(*document, b, shape_b, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    BRepExtrema_DistShapeShape distance;
    perform_extrema(distance, shape_a, shape_b);
    if (!distance.IsDone() || distance.NbSolution() < 1) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT extrema computation did not converge.", error);
    }
    extrema->distance = distance.Value();
    point(extrema->point_a, distance.PointOnShape1(1));
    point(extrema->point_b, distance.PointOnShape2(1));
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_classify_points(
    const geospec_occt_document* document, uint32_t occurrence,
    const double* points, size_t point_count, int* states,
    size_t state_capacity, geospec_occt_string* error) noexcept {
  if (document == nullptr || occurrence >= document->occurrences.size() ||
      (point_count != 0 && (points == nullptr || states == nullptr)) ||
      state_capacity < point_count) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Point-classification arguments are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    BRepClass3d_SolidClassifier classifier(
        document->occurrences[occurrence].shape);
    for (size_t index = 0; index < point_count; ++index) {
      const double* value = points + index * 3;
      if (!std::isfinite(value[0]) || !std::isfinite(value[1]) ||
          !std::isfinite(value[2])) {
        return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                    "Classification points must be finite.", error);
      }
      classifier.Perform(gp_Pnt(value[0], value[1], value[2]), 1e-7);
      states[index] = point_state(classifier.State());
    }
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_common_volume(
    const geospec_occt_document* document, uint32_t occurrence_a,
    uint32_t occurrence_b,
    geospec_occt_common_volume_result* common_result,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || common_result == nullptr ||
      occurrence_a >= document->occurrences.size() ||
      occurrence_b >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Common-volume arguments are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    *common_result = {};
    NCollection_List<TopoDS_Shape> arguments;
    arguments.Append(document->occurrences[occurrence_a].shape);
    NCollection_List<TopoDS_Shape> tools;
    tools.Append(document->occurrences[occurrence_b].shape);
    BRepAlgoAPI_Common common;
    common.SetArguments(arguments);
    common.SetTools(tools);
    common.SetRunParallel(false);
    // This existing Boolean route permits OCCT to modify its input topology.
    // Invalidate before execution, including if the operation later fails.
    document->admission_validity_reusable = false;
    common.Build();
    if (!common.IsDone()) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT boolean common failed.", error);
    }
    GProp_GProps properties;
    BRepGProp::VolumeProperties(common.Shape(), properties);
    common_result->volume = std::abs(properties.Mass());
    if (common_result->volume > 1e-12) {
      point(common_result->centroid, properties.CentreOfMass());
    }
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_regular_solid_containment(
    const geospec_occt_document* document, geospec_occt_entity subject_entity,
    geospec_occt_entity target_entity,
    geospec_occt_regular_solid_containment_result* result,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || result == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/containment output is null.", error);
  }
  return guarded(error, [&]() -> int {
    *result = {};
    TopoDS_Shape subject_shape;
    TopoDS_Shape target_shape;
    std::string message;
    if (!resolve_entity(*document, subject_entity, subject_shape, message) ||
        !resolve_entity(*document, target_entity, target_shape, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    TopoDS_Solid subject;
    TopoDS_Solid target;
    if (!regular_solid_operand(subject_shape, subject, message) ||
        !regular_solid_operand(target_shape, target, message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }

    NCollection_List<TopoDS_Shape> arguments;
    arguments.Append(subject);
    NCollection_List<TopoDS_Shape> tools;
    tools.Append(target);
    BRepAlgoAPI_Cut cut;
    cut.SetArguments(arguments);
    cut.SetTools(tools);
    cut.SetNonDestructive(true);
    cut.SetRunParallel(false);
    cut.Build();
    if (!cut.IsDone() || cut.HasErrors()) {
      std::ostringstream details;
      cut.DumpErrors(details);
      const std::string reported = details.str();
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  reported.empty()
                      ? "OCCT regular-solid difference failed."
                      : "OCCT regular-solid difference failed: " + reported,
                  error);
    }

    const TopoDS_Shape residual = cut.Shape();
    std::vector<TopoDS_Solid> residual_solids;
    if (!regular_solid_set(residual, true, residual_solids, message)) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT regular-solid difference returned invalid topology: " +
                      message,
                  error);
    }
    if (residual_solids.size() > std::numeric_limits<uint32_t>::max()) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT regular-solid difference returned too many solids.",
                  error);
    }
    result->residual_solid_count =
        static_cast<uint32_t>(residual_solids.size());
    result->contained = residual_solids.empty() ? 1 : 0;
    if (residual_solids.empty()) return GEOSPEC_OCCT_OK;

    GProp_GProps properties;
    BRepGProp::VolumeProperties(residual, properties);
    if (!std::isfinite(properties.Mass()) || properties.Mass() <= 0.0) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT regular-solid residual has non-positive or non-finite volume.",
                  error);
    }
    result->residual_volume = properties.Mass();
    result->residual_bounds = bounds(residual);
    point(result->residual_center_of_mass, properties.CentreOfMass());
    for (size_t axis = 0; axis < 3; ++axis) {
      if (!std::isfinite(result->residual_bounds.min[axis]) ||
          !std::isfinite(result->residual_bounds.max[axis]) ||
          result->residual_bounds.min[axis] > result->residual_bounds.max[axis] ||
          !std::isfinite(result->residual_center_of_mass[axis])) {
        return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                    "OCCT regular-solid residual has invalid bounds or center of mass.",
                    error);
      }
    }
    result->has_residual_bounds = 1;
    result->has_residual_center_of_mass = 1;
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_cylinder_axial_extent(
    const geospec_occt_document* document,
    geospec_occt_entity face_entity,
    geospec_occt_cylinder_axial_extent_result* extent,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || extent == nullptr ||
      (face_entity.kind != GEOSPEC_OCCT_ENTITY_FACE &&
       face_entity.kind != GEOSPEC_OCCT_ENTITY_WHOLE_FACE)) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Trimmed-cylinder arguments are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    TopoDS_Shape shape;
    std::string message;
    if (!resolve_entity(*document, face_entity, shape, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    *extent = {};
    if (!qualified_cylinder_axial_extent(TopoDS::Face(shape), *extent,
                                         message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_finite_contact_face_query(
    const geospec_occt_document* document, geospec_occt_entity face_entity,
    geospec_occt_finite_contact_face* output,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || output == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Finite contact document/output is null.", error);
  }
  *output = {};
  if (face_entity.kind == GEOSPEC_OCCT_ENTITY_WHOLE_FACE) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Finite contact requires a selected occurrence-face source route.", error);
  }
  if (face_entity.kind != GEOSPEC_OCCT_ENTITY_FACE) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Finite contact requires a face entity.", error);
  }
  return guarded(error, [&]() -> int {
    TopoDS_Shape shape;
    std::string message;
    if (!resolve_entity(*document, face_entity, shape, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    const auto& occurrence = document->occurrences[face_entity.occurrence];
    if (!occurrence.source_transfer_valid || occurrence.source_route.empty() ||
        occurrence.source_route.size() > 32) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, "Finite contact occurrence has no qualified source route.", error);
    }
    const SourceFaceFacts* source = nullptr;
    for (const auto& candidate : document->source_faces) {
      if (!shape.IsPartner(candidate.shape) ||
          !candidate.shape.Moved(occurrence.shape.Location()).Location().IsEqual(shape.Location())) continue;
      if (source != nullptr) {
        return fail(GEOSPEC_OCCT_UNSUPPORTED, "Finite contact source face association is ambiguous.", error);
      }
      source = &candidate;
    }
    if (source == nullptr) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, "Finite contact has no associated source AdvancedFace.", error);
    }
    geospec_occt_resolved_source_face association{};
    const int status = geospec_occt_resolve_source_face(document, source->entity,
        occurrence.source_route.data(), occurrence.source_route.size(), &association, error);
    if (status != GEOSPEC_OCCT_OK) return status;
    if (association.occurrence != face_entity.occurrence ||
        association.private_query_face != face_entity.face) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, "Finite contact forward association differs from selected face.", error);
    }
    geospec_occt_finite_contact_face candidate{};
    candidate.occurrence = association.occurrence;
    candidate.public_face_ordinal = association.public_face_ordinal;
    candidate.private_query_face = association.private_query_face;
    candidate.source_face_entity = source->entity;
    candidate.source_route_count = static_cast<uint32_t>(occurrence.source_route.size());
    std::copy(occurrence.source_route.begin(), occurrence.source_route.end(), candidate.source_route);
    candidate.source_same_sense = association.source_same_sense;
    candidate.transferred_reversed = association.transferred_reversed;
    if (!finite_contact_face(TopoDS::Face(shape), candidate, message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    *output = candidate;
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_nominal_cylindrical_band_query(
    const geospec_occt_document* document, geospec_occt_entity face_entity,
    geospec_occt_nominal_cylindrical_band* output,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || output == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Nominal band document/output is null.", error);
  }
  *output = {};
  if (face_entity.kind == GEOSPEC_OCCT_ENTITY_WHOLE_FACE) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Nominal band requires a selected occurrence-face source route.", error);
  }
  if (face_entity.kind != GEOSPEC_OCCT_ENTITY_FACE) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Nominal band requires a face entity.", error);
  }
  return guarded(error, [&]() -> int {
    TopoDS_Shape shape;
    std::string message;
    if (!resolve_entity(*document, face_entity, shape, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    const auto& occurrence = document->occurrences[face_entity.occurrence];
    if (!occurrence.source_transfer_valid || occurrence.source_route.empty() ||
        occurrence.source_route.size() > 32) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, "Nominal band occurrence has no qualified source route.", error);
    }
    const SourceFaceFacts* source = nullptr;
    for (const auto& candidate : document->source_faces) {
      if (!shape.IsPartner(candidate.shape) ||
          !candidate.shape.Moved(occurrence.shape.Location()).Location().IsEqual(shape.Location())) continue;
      if (source != nullptr) {
        return fail(GEOSPEC_OCCT_UNSUPPORTED, "Nominal band source face association is ambiguous.", error);
      }
      source = &candidate;
    }
    if (source == nullptr) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, "Nominal band has no associated source AdvancedFace.", error);
    }
    geospec_occt_resolved_source_face association{};
    const int status = geospec_occt_resolve_source_face(document, source->entity,
        occurrence.source_route.data(), occurrence.source_route.size(), &association, error);
    if (status != GEOSPEC_OCCT_OK) return status;
    if (association.occurrence != face_entity.occurrence ||
        association.private_query_face != face_entity.face) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, "Nominal band forward association differs from selected face.", error);
    }
    geospec_occt_nominal_cylindrical_band candidate{};
    candidate.occurrence = association.occurrence;
    candidate.public_face_ordinal = association.public_face_ordinal;
    candidate.private_query_face = association.private_query_face;
    candidate.source_face_entity = source->entity;
    candidate.source_route_count = static_cast<uint32_t>(occurrence.source_route.size());
    std::copy(occurrence.source_route.begin(), occurrence.source_route.end(), candidate.source_route);
    candidate.source_same_sense = association.source_same_sense;
    candidate.transferred_reversed = association.transferred_reversed;
    if (!nominal_cylindrical_band(TopoDS::Face(shape), candidate, message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    *output = candidate;
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_selected_bore_void_query(
    const geospec_occt_document* document, geospec_occt_entity face,
    geospec_occt_nominal_cylindrical_band* band,
    geospec_occt_circular_bore_candidate* clear_interior,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || band == nullptr || clear_interior == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Selected bore output/document is null.", error);
  }
  *band = {};
  *clear_interior = {};
  return guarded(error, [&]() -> int {
    geospec_occt_nominal_cylindrical_band associated{};
    const int status = geospec_occt_nominal_cylindrical_band_query(
        document, face, &associated, error);
    if (status != GEOSPEC_OCCT_OK) return status;
    const auto& occurrence = document->occurrences[face.occurrence];
    TopoDS_Solid solid;
    std::string message;
    if (!regular_solid_operand(occurrence.shape, solid, message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "Selected bore requires one complete regular material solid: " + message, error);
    }
    if (occurrence.public_faces.size() > 4096) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, "Selected bore material has too many faces.", error);
    }
    // A scoped view reuses A7 without changing its document-local semantics.
    // Its sole solid is the ENTIRE selected material, never just a face owner.
    geospec_occt_document scoped;
    scoped.shape = occurrence.shape;
    scoped.public_faces = occurrence.public_faces;
    std::vector<geospec_occt_circular_bore_candidate> candidates;
    bool native_error = false;
    if (!build_circular_bores(scoped, 4096, 0, 0, candidates, message, native_error)) {
      return fail(native_error ? GEOSPEC_OCCT_NATIVE_ERROR : GEOSPEC_OCCT_UNSUPPORTED,
                  message, error);
    }
    for (const auto& candidate : candidates) {
      if (candidate.public_face_ordinal != associated.public_face_ordinal ||
          candidate.private_query_face != face.face) continue;
      if (candidate.disposition != GEOSPEC_OCCT_CIRCULAR_BORE_QUALIFIED ||
          candidate.owning_solid_ordinal != 0 ||
          candidate.interior_residual_solid_count != 0 ||
          candidate.ends[0].termination != GEOSPEC_OCCT_CIRCULAR_BORE_MOUTH ||
          candidate.ends[1].termination != GEOSPEC_OCCT_CIRCULAR_BORE_MOUTH) {
        return fail(GEOSPEC_OCCT_UNSUPPORTED,
                    "Selected material does not certify a clear two-mouth bore.", error);
      }
      if (candidate.band.radius != associated.radius || candidate.band.from != associated.from ||
          candidate.band.to != associated.to ||
          !std::equal(candidate.band.origin, candidate.band.origin + 3, associated.origin) ||
          !std::equal(candidate.band.axis, candidate.band.axis + 3, associated.axis)) {
        return fail(GEOSPEC_OCCT_UNSUPPORTED, "Selected bore and source band disagree.", error);
      }
      *band = associated;
      *clear_interior = candidate;
      return GEOSPEC_OCCT_OK;
    }
    return fail(GEOSPEC_OCCT_UNSUPPORTED, "Selected bore face has no complete material certificate.", error);
  });
}

int geospec_occt_selected_interference_material_query(
    const geospec_occt_document* document, geospec_occt_entity face,
    geospec_occt_nominal_cylindrical_band* output, uint32_t* kind,
    geospec_occt_string* error) noexcept {
  if (!document || !output || !kind) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Material output/document is null.", error);
  }
  *output = {};
  *kind = UINT32_MAX;
  return guarded(error, [&]() -> int {
    geospec_occt_nominal_cylindrical_band band{};
    int status = geospec_occt_nominal_cylindrical_band_query(document, face, &band, error);
    if (status != GEOSPEC_OCCT_OK) return status;
    const auto& occurrence = document->occurrences[face.occurrence];
    auto refuse = [&](const char* message) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    };
    TopoDS_Solid solid;
    std::string message;
    if (!regular_solid_operand(occurrence.shape, solid, message))
      return refuse("Interference material requires exactly one complete regular solid.");
    ShapeIndex faces, edges, vertices, shells;
    TopExp::MapShapes(solid, TopAbs_FACE, faces);
    TopExp::MapShapes(solid, TopAbs_EDGE, edges);
    TopExp::MapShapes(solid, TopAbs_VERTEX, vertices);
    TopExp::MapShapes(solid, TopAbs_SHELL, shells);
    if (faces.Extent() > 4096 || edges.Extent() > 16384 || vertices.Extent() > 16384 ||
        shells.Extent() != 1 || occurrence.public_faces.size() != static_cast<size_t>(faces.Extent()))
      return refuse("Interference material exceeds its complete single-shell boundary domain.");
    BRepClass3d_SolidClassifier classifier(solid);
    classifier.PerformInfinitePoint(0);
    if (classifier.State() != TopAbs_OUT)
      return refuse("Interference material has reversed or ambiguous unbounded material.");
    // Every selected boundary must have an unambiguous AP242 forward route.
    for (const auto& view : occurrence.public_faces) {
      const SourceFaceFacts* source = nullptr;
      for (const auto& candidate : document->source_faces) {
        if (!view.shape.IsPartner(candidate.shape) ||
            !candidate.shape.Moved(occurrence.shape.Location()).Location().IsEqual(view.shape.Location())) continue;
        if (source) return refuse("Interference boundary source association is ambiguous.");
        source = &candidate;
      }
      if (!source) return refuse("Interference boundary lacks an AP242 source association.");
      geospec_occt_resolved_source_face resolved{};
      status = geospec_occt_resolve_source_face(document, source->entity,
          occurrence.source_route.data(), occurrence.source_route.size(), &resolved, error);
      if (status != GEOSPEC_OCCT_OK) return status;
      if (resolved.occurrence != face.occurrence || resolved.private_query_face != view.query_index)
        return refuse("Interference boundary forward source route disagrees.");
    }
    TopoDS_Shape selected;
    if (!resolve_entity(*document, face, selected, message))
      return refuse("Interference selected lateral face is missing.");
    const TopoDS_Face lateral = TopoDS::Face(selected);
    const gp_Dir axis(band.axis[0], band.axis[1], band.axis[2]);
    const gp_Pnt origin(band.origin[0], band.origin[1], band.origin[2]);
    if (band.transferred_reversed) {
      geospec_occt_circular_bore_candidate clear{};
      status = geospec_occt_selected_bore_void_query(document, face, &band, &clear, error);
      if (status != GEOSPEC_OCCT_OK) return status;
      // In this nominal domain the slab axis is exactly Cartesian. Every
      // other face is a bounded plane, so linear height extrema occur on
      // its complete boundary. Lines need endpoints; horizontal circles
      // have constant height. No reporting box participates in this proof.
      const int coordinate = cartesian_axis(axis);
      if (coordinate < 0) return refuse("Bore slab needs a Cartesian nominal axis.");
      const double lo = band.from, hi = band.to;
      // Knuth TwoDiff residual: refuse rounded station construction, rather
      // than using a rounded value as an exact slab-boundary predicate.
      auto exact_difference = [](double a, double b, double& result) {
        result = a - b;
        const double bv = a - result, av = result + bv;
        const double br = bv - b, ar = a - av;
        return std::isfinite(a) && std::isfinite(b) && std::isfinite(result) &&
            std::isfinite(bv) && std::isfinite(av) && std::isfinite(br) &&
            std::isfinite(ar) && ar + br == 0.0;
      };
      auto in_slab = [&](const gp_Pnt& p) {
        double difference = 0;
        if (!exact_difference(p.Coord(coordinate + 1), origin.Coord(coordinate + 1), difference)) return false;
        const double station = difference * axis.Coord(coordinate + 1);
        return std::isfinite(station) && station >= lo && station <= hi;
      };
      for (int i = 1; i <= faces.Extent(); ++i) {
        const TopoDS_Face boundary = TopoDS::Face(faces(i));
        if (boundary.IsSame(lateral)) continue;
        if (BRepAdaptor_Surface(boundary).GetType() != GeomAbs_Plane)
          return refuse("Bore slab has an unsupported nonplanar additional boundary.");
        size_t wire_count = 0;
        for (TopExp_Explorer wires(boundary, TopAbs_WIRE); wires.More(); wires.Next()) {
          ++wire_count;
          const TopoDS_Wire wire = TopoDS::Wire(wires.Current());
          size_t children = 0, visited = 0;
          for (TopoDS_Iterator child(wire); child.More(); child.Next()) {
            if (child.Value().ShapeType() != TopAbs_EDGE)
              return refuse("Bore slab has an incomplete wire.");
            ++children;
          }
          for (BRepTools_WireExplorer use(wire, boundary); use.More(); use.Next()) {
            ++visited;
            const TopoDS_Edge edge = use.Current();
            BRepAdaptor_Curve curve(edge);
            const double first = curve.FirstParameter(), last = curve.LastParameter();
            if (!std::isfinite(first) || !std::isfinite(last) || first >= last ||
                BRep_Tool::Degenerated(edge))
              return refuse("Bore slab edge has no bounded analytic interval.");
            if (curve.GetType() == GeomAbs_Line) {
              const gp_Lin line = curve.Line();
              const double slope = line.Direction().Coord(coordinate + 1);
              // A height-constant or signed-unit-height line has exact
              // parameter products; other slopes need a future directed trim
              // certificate, not an unqualified Value() evaluation.
              if (slope != 0.0 && slope != 1.0 && slope != -1.0)
                return refuse("Bore slab line needs an exact nominal height parameterization.");
              double a = 0, b = 0;
              if (!exact_difference(line.Location().Coord(coordinate + 1), -slope * first, a) ||
                  !exact_difference(line.Location().Coord(coordinate + 1), -slope * last, b))
                return refuse("Bore slab endpoint height requires rounded arithmetic.");
              gp_Pnt pa = line.Location(), pb = line.Location();
              pa.SetCoord(coordinate + 1, a);
              pb.SetCoord(coordinate + 1, b);
              if (!in_slab(pa) || !in_slab(pb))
                return refuse("Bore material extends outside the certified slab.");
            } else if (curve.GetType() == GeomAbs_Circle) {
              if (cartesian_axis(curve.Circle().Axis().Direction()) != coordinate ||
                  !in_slab(curve.Circle().Location()))
                return refuse("Bore slab circle is not a certified constant-height boundary.");
            } else return refuse("Bore slab boundary curve is outside its analytic domain.");
            double pf = 0, pl = 0;
            const auto pc = BRep_Tool::CurveOnSurface(edge, boundary, pf, pl);
            if (pc.IsNull() || !std::isfinite(pf) || !std::isfinite(pl) || pf >= pl)
              return refuse("Bore slab boundary lacks its complete pcurve.");
          }
          if (children == 0 || visited != children)
            return refuse("Bore slab wire traversal is incomplete.");
        }
        if (wire_count == 0 || BRepTools::OuterWire(boundary).IsNull())
          return refuse("Bore slab plane is not bounded.");
      }
      *kind = 0;
    } else {
      if (faces.Extent() != 3 || edges.Extent() != 3 || vertices.Extent() != 2)
        return refuse("Finite cylinder material needs exactly one band and two disks.");
      std::vector<TopoDS_Edge> lateral_cycle;
      if (!outer_cycle(lateral, 4, lateral_cycle))
        return refuse("Finite cylinder lateral attachment is incomplete.");
      std::array<TopoDS_Edge, 2> rims;
      for (const auto& edge : lateral_cycle) {
        if (BRep_Tool::IsClosed(edge, lateral)) continue;
        BRepAdaptor_Curve curve(edge);
        if (curve.GetType() != GeomAbs_Circle) return refuse("Cylinder rim is not circular.");
        const gp_Pnt center = curve.Circle().Location();
        const double station = gp_Vec(origin, center).Dot(gp_Vec(axis));
        const int side = std::abs(station - band.from) <= std::abs(station - band.to) ? 0 : 1;
        if (!rims[side].IsNull()) return refuse("Cylinder rim assignment is ambiguous.");
        rims[side] = edge;
      }
      std::array<bool, 2> attached{};
      for (int i = 1; i <= faces.Extent(); ++i) {
        const TopoDS_Face cap = TopoDS::Face(faces(i));
        if (cap.IsSame(lateral)) continue;
        BRepAdaptor_Surface surface(cap);
        std::vector<TopoDS_Edge> cycle;
        if (surface.GetType() != GeomAbs_Plane || !outer_cycle(cap, 1, cycle))
          return refuse("Cylinder cap must be one complete filled planar disk.");
        const int side = !rims[0].IsNull() && cycle[0].IsSame(rims[0]) ? 0 :
            !rims[1].IsNull() && cycle[0].IsSame(rims[1]) ? 1 : -1;
        if (side < 0 || attached[side] || cycle[0].Orientation() == rims[side].Orientation())
          return refuse("Cylinder cap does not share its complete oppositely directed rim.");
        const gp_Pln plane = surface.Plane();
        gp_Dir normal = plane.Axis().Direction();
        if (cap.Orientation() == TopAbs_REVERSED) normal.Reverse();
        else if (cap.Orientation() != TopAbs_FORWARD) return refuse("Cylinder cap sense is invalid.");
        const double limit = std::max({BRep_Tool::Tolerance(cap),
            BRep_Tool::Tolerance(cycle[0]), band.face_tolerance_mm});
        const gp_Dir desired = side ? axis : axis.Reversed();
        BRepAdaptor_Curve rim(rims[side]);
        const gp_Circ circle = rim.Circle();
        if (!std::isfinite(limit) || limit < 0 ||
            gp_Vec(normal).Subtracted(gp_Vec(desired)).Magnitude() * band.radius > limit ||
            plane.Distance(circle.Location()) > limit)
          return refuse("Cylinder cap plane fails nominal rim attachment.");
        double first = 0, last = 0;
        const auto pc = BRep_Tool::CurveOnSurface(cycle[0], cap, first, last);
        if (pc.IsNull()) return refuse("Cylinder cap has no pcurve.");
        Geom2dAdaptor_Curve trim(pc, first, last);
        if (trim.GetType() != GeomAbs_Circle || !std::isfinite(first) ||
            !std::isfinite(last) || first >= last ||
            std::abs((last - first) - trim.Period()) * band.radius > limit)
          return refuse("Cylinder cap pcurve is not one complete nominal circle.");
        const gp_Circ2d disk = trim.Circle();
        const gp_Pnt2d uv = disk.Location();
        if (std::abs(disk.Radius() - band.radius) > limit ||
            surface.Value(uv.X(), uv.Y()).Distance(circle.Location()) > limit)
          return refuse("Cylinder cap pcurve disagrees with its shared rim.");
        attached[side] = true;
      }
      if (!attached[0] || !attached[1]) return refuse("Cylinder is missing a complete cap.");
      *kind = 1;
    }
    *output = band;
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_circular_bores_prepare(
    const geospec_occt_document* document, size_t max_candidates,
    size_t retained_candidate_size, size_t retained_inventory_size,
    size_t* count, geospec_occt_string* error) noexcept {
  if (document == nullptr || count == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/circular bore count output is null.", error);
  }
  document->circular_bores.reset();
  return guarded(error, [&]() -> int {
    std::vector<geospec_occt_circular_bore_candidate> candidates;
    std::string message;
    bool native_error = false;
    if (!build_circular_bores(*document, max_candidates,
                              retained_candidate_size,
                              retained_inventory_size, candidates, message,
                              native_error)) {
      return fail(native_error ? GEOSPEC_OCCT_NATIVE_ERROR
                               : GEOSPEC_OCCT_UNSUPPORTED,
                  message, error);
    }
    *count = candidates.size();
    document->circular_bores.emplace(std::move(candidates));
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_circular_bore(
    const geospec_occt_document* document, size_t index,
    geospec_occt_circular_bore_candidate* candidate,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || candidate == nullptr ||
      !document->circular_bores.has_value() ||
      index >= document->circular_bores->size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Circular bore transfer is absent or out of range.", error);
  }
  *candidate = (*document->circular_bores)[index];
  return GEOSPEC_OCCT_OK;
}

void geospec_occt_circular_bores_discard(
    const geospec_occt_document* document) noexcept {
  if (document != nullptr) document->circular_bores.reset();
}

int geospec_occt_edge_treatment_counts_get(
    const geospec_occt_document* document,
    geospec_occt_edge_treatment_counts* counts,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || counts == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/edge-treatment count output is null.", error);
  }
  return guarded(error, [&]() -> int {
    std::string message;
    *counts = {};
    if (!count_edge_treatments(*document, *counts, message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_edge_treatments_prepare(
    const geospec_occt_document* document, size_t max_rows,
    geospec_occt_edge_treatment_counts* counts, size_t* transfer_bytes,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || counts == nullptr || transfer_bytes == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/edge-treatment transfer output is null.", error);
  }
  document->edge_treatments.reset();
  return guarded(error, [&]() -> int {
    auto transfer = std::make_unique<EdgeTreatmentTransferData>();
    std::string message;
    if (!build_edge_treatments(*document, max_rows, *transfer, message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    *counts = transfer->counts;
    *transfer_bytes = transfer->owned_bytes;
    document->edge_treatments = std::move(transfer);
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_edge_treatment(
    const geospec_occt_document* document, size_t row,
    geospec_occt_edge_treatment_row* output,
    geospec_occt_string* occurrence_path,
    geospec_occt_string* source_face_key, geospec_occt_string* label,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || output == nullptr ||
      !document->edge_treatments ||
      row >= document->edge_treatments->rows.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Edge-treatment transfer is absent or out of range.", error);
  }
  const EdgeTreatmentRowData& value = document->edge_treatments->rows[row];
  *output = value.value;
  return copy_result(
      copy_result(write_string(value.occurrence_path, occurrence_path),
                  write_string(value.source_face_key, source_face_key)),
      write_string(value.label, label));
}

int geospec_occt_edge_treatment_certificate_get(
    const geospec_occt_document* document, size_t row, int feature,
    geospec_occt_edge_treatment_certificate* output,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || output == nullptr ||
      !document->edge_treatments) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Edge-treatment certificate transfer is absent.", error);
  }
  const EdgeTreatmentDispositionData* disposition =
      edge_treatment_disposition(*document->edge_treatments, row, feature);
  if (disposition == nullptr || !disposition->certificate) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Edge-treatment certificate is absent or out of range.",
                error);
  }
  *output = disposition->certificate->value;
  return GEOSPEC_OCCT_OK;
}

int geospec_occt_edge_treatment_boundary_use_get(
    const geospec_occt_document* document, size_t row, int feature,
    size_t boundary_use,
    geospec_occt_edge_treatment_boundary_use* output,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || output == nullptr ||
      !document->edge_treatments) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Edge-treatment boundary transfer is absent.", error);
  }
  const EdgeTreatmentDispositionData* disposition =
      edge_treatment_disposition(*document->edge_treatments, row, feature);
  if (disposition == nullptr || !disposition->certificate ||
      boundary_use >= disposition->certificate->boundary_uses.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Edge-treatment boundary use is absent or out of range.",
                error);
  }
  *output = disposition->certificate->boundary_uses[boundary_use];
  return GEOSPEC_OCCT_OK;
}

int geospec_occt_edge_treatment_residual_get(
    const geospec_occt_document* document, size_t row, int feature,
    size_t residual, geospec_occt_edge_treatment_residual* output,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || output == nullptr ||
      !document->edge_treatments) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Edge-treatment residual transfer is absent.", error);
  }
  const EdgeTreatmentDispositionData* disposition =
      edge_treatment_disposition(*document->edge_treatments, row, feature);
  if (disposition == nullptr || !disposition->certificate ||
      residual >= disposition->certificate->residuals.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Edge-treatment residual is absent or out of range.", error);
  }
  *output = disposition->certificate->residuals[residual];
  return GEOSPEC_OCCT_OK;
}

void geospec_occt_edge_treatments_discard(
    const geospec_occt_document* document) noexcept {
  if (document != nullptr) document->edge_treatments.reset();
}

int geospec_occt_classify_face_points(
    const geospec_occt_document* document, geospec_occt_entity face_entity,
    const double* points, size_t point_count, double tolerance,
    int* states, size_t state_capacity,
    geospec_occt_string* error) noexcept {
  if (document == nullptr ||
      (face_entity.kind != GEOSPEC_OCCT_ENTITY_FACE &&
       face_entity.kind != GEOSPEC_OCCT_ENTITY_WHOLE_FACE) ||
      (point_count != 0 && (points == nullptr || states == nullptr)) ||
      state_capacity < point_count || !std::isfinite(tolerance) ||
      tolerance <= 0.0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Face-classification arguments are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    TopoDS_Shape shape;
    std::string message;
    if (!resolve_entity(*document, face_entity, shape, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    const TopoDS_Face face = TopoDS::Face(shape);
    const occ::handle<Geom_Surface> surface = BRep_Tool::Surface(face);
    for (size_t index = 0; index < point_count; ++index) {
      const double* value = points + index * 3;
      if (!std::isfinite(value[0]) || !std::isfinite(value[1]) ||
          !std::isfinite(value[2])) {
        return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                    "Classification points must be finite.", error);
      }
      const gp_Pnt point_value(value[0], value[1], value[2]);
      GeomAPI_ProjectPointOnSurf projection(point_value, surface);
      if (!projection.IsDone() || projection.NbPoints() < 1 ||
          projection.LowerDistance() > tolerance) {
        states[index] = GEOSPEC_OCCT_POINT_OUT;
        continue;
      }
      double u = 0.0;
      double v = 0.0;
      projection.LowerDistanceParameters(u, v);
      BRepClass_FaceClassifier classifier(face, gp_Pnt2d(u, v), tolerance);
      states[index] = point_state(classifier.State());
    }
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_minimum_wall_thickness(
    const geospec_occt_document* document,
    const geospec_occt_wall_options* options,
    geospec_occt_wall_result* wall,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || options == nullptr || wall == nullptr ||
      options->work_unit_budget == 0 ||
      !std::isfinite(options->mesh_linear_tolerance_mm) ||
      options->mesh_linear_tolerance_mm <= 0.0 ||
      !std::isfinite(options->mesh_angular_tolerance_degrees) ||
      options->mesh_angular_tolerance_degrees <= 0.0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Wall-thickness arguments are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    std::string reason;
    const geospec_occt_validity_facts validity =
        compute_validity(*document, reason);
    if (!validity.valid || !validity.closed_solids) {
      *wall = {};
      wall->outcome = 1;
      wall->limit = options->work_unit_budget;
      return GEOSPEC_OCCT_OK;
    }
    *wall = compute_wall(document->shape, *options);
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_tessellate(const geospec_occt_document* document,
                            geospec_occt_entity entity,
                            double linear_deflection, double angular_deflection,
                            double* positions, size_t position_capacity,
                            uint32_t* triangles, size_t triangle_capacity,
                            size_t* position_count, size_t* triangle_count,
                            geospec_occt_string* error) noexcept {
  if (document == nullptr || position_count == nullptr || triangle_count == nullptr ||
      !std::isfinite(linear_deflection) || !std::isfinite(angular_deflection) ||
      linear_deflection <= 0.0 || angular_deflection <= 0.0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Tessellation arguments are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    TopoDS_Shape shape;
    std::string message;
    if (!resolve_entity(*document, entity, shape, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    const MeshKey key{entity.kind, entity.occurrence, entity.face,
                      float_bits(linear_deflection),
                      float_bits(angular_deflection)};
    if (!document->transfer_mesh.has_value() ||
        !(document->transfer_mesh->first == key)) {
      document->transfer_mesh = std::make_pair(
          key, compute_mesh(shape, linear_deflection, angular_deflection));
    }
    const MeshData& mesh = document->transfer_mesh->second;

    *position_count = mesh.positions.size();
    *triangle_count = mesh.triangles.size();
    if (positions == nullptr && triangles == nullptr) return GEOSPEC_OCCT_OK;
    if (positions == nullptr || triangles == nullptr ||
        position_capacity < mesh.positions.size() ||
        triangle_capacity < mesh.triangles.size()) {
      return fail(GEOSPEC_OCCT_BUFFER_TOO_SMALL, "Tessellation output buffer is too small.", error);
    }
    for (size_t index = 0; index < mesh.positions.size(); ++index) {
      std::copy(mesh.positions[index].begin(), mesh.positions[index].end(),
                positions + index * 3);
    }
    for (size_t index = 0; index < mesh.triangles.size(); ++index) {
      std::copy(mesh.triangles[index].begin(), mesh.triangles[index].end(),
                triangles + index * 3);
    }
    document->transfer_mesh.reset();
    return GEOSPEC_OCCT_OK;
  });
}
