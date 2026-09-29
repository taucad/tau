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
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepExtrema_DistanceSS.hxx>
#include <Geom_BSplineSurface.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <IMeshTools_Parameters.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <IMeshData_Status.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <DE_ShapeFixParameters.hxx>
#include <DESTEP_Parameters.hxx>
#include <GProp_GProps.hxx>
#include <GeomAPI_ProjectPointOnSurf.hxx>
#include <Geom2dAdaptor_Curve.hxx>
#include <HeaderSection_FileSchema.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Interface_Check.hxx>
#include <Interface_EntityIterator.hxx>
#include <Interface_Graph.hxx>
#include <Interface_InterfaceModel.hxx>
#include <Interface_Static.hxx>
#include <NCollection_Sequence.hxx>
#include <OSD_Parallel.hxx>
#include <OSD_ThreadPool.hxx>
#include <NCollection_IndexedMap.hxx>
#include <Poly_Triangulation.hxx>
#include <Precision.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <STEPConstruct_Tool.hxx>
#include <STEPConstruct_ExternRefs.hxx>
#include <STEPConstruct_UnitContext.hxx>
#include <Standard_ArrayStreamBuffer.hxx>
#include <Standard_Failure.hxx>
#include <StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.hxx>
#include <StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.hxx>
#include <StepGeom_Axis2Placement3d.hxx>
#include <StepGeom_CartesianPoint.hxx>
#include <StepGeom_Direction.hxx>
#include <StepGeom_Plane.hxx>
#include <StepBasic_ApplicationContext.hxx>
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
#include <Transfer_Binder.hxx>
#include <Transfer_TransientProcess.hxx>
#include <NCollection_DataMap.hxx>
#include <NCollection_IncAllocator.hxx>
#include <NCollection_IndexedDataMap.hxx>
#include <NCollection_List.hxx>
#include <NCollection_Map.hxx>
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
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XSAlgo_ShapeProcessor.hxx>
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
#include <atomic>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <iterator>
#include <limits>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

namespace {

struct ProductFacts {
  std::string label;
  std::string name;
};

// Private occurrence face address; its numerics are a document slot.
struct LocatedFaceFacts {
  TopoDS_Face shape;
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
  // Bounds stay unset here; the source value is a document slot.
  geospec_occt_occurrence_facts facts{};
  std::vector<LocatedFaceFacts> faces;
  std::vector<FaceView> public_faces;
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
  uint32_t facets = 0;
  geospec_occt_shape_facts shape{};
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

// Same result as occ::down_cast<T>(entity). The full-model scans below test every
// entity against one type, and a failing dynamic_cast (type_info string compares)
// costs far more than OCCT's own IsKind walk.
template <class T>
occ::handle<T> entity_as(const occ::handle<Standard_Transient>& entity) {
  return !entity.IsNull() && entity->IsKind(STANDARD_TYPE(T)) ? occ::down_cast<T>(entity)
                                                              : occ::handle<T>{};
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
    const auto product = entity_as<StepBasic_Product>(model->Value(index));
    if (!product.IsNull()) {
      ++product_count;
      const std::string id = hascii(product->Id());
      result.sole_product_name = id.empty() ? hascii(product->Name()) : id;
    }
    const auto shape_definition =
        entity_as<StepShape_ShapeDefinitionRepresentation>(model->Value(index));
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

bool all_source_length_contexts_are_millimeters(STEPControl_Reader& reader) {
  const occ::handle<Interface_InterfaceModel> model = reader.WS()->Model();
  if (model.IsNull()) return false;
  bool found = false;
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
          StepGeom_GeomRepContextAndGlobUncertaintyAssCtxAndGlobUncertaintyAssCtx>(entity)
                    ->GlobalUnitAssignedContext();
    }
    if (context.IsNull()) continue;
    STEPConstruct_UnitContext units;
    units.ComputeFactors(context);
    if (!units.LengthDone() || units.LengthFactor() != 1.0) return false;
    found = true;
  }
  return found;
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

size_t shape_count(const TopoDS_Shape& shape, TopAbs_ShapeEnum kind) {
  size_t count = 0;
  for (TopExp_Explorer explorer(shape, kind); explorer.More(); explorer.Next()) {
    ++count;
  }
  return count;
}

bool collect_validation_solids(const TopoDS_Shape& shape,
                               std::vector<TopoDS_Shape>& solids) {
  if (shape.IsNull()) return false;
  if (shape.ShapeType() == TopAbs_SOLID) {
    solids.push_back(shape);
    return true;
  }
  if (shape.ShapeType() != TopAbs_COMPOUND) return false;
  TopoDS_Iterator child(shape, true, true);
  if (!child.More()) return false;
  for (; child.More(); child.Next()) {
    if (!collect_validation_solids(child.Value(), solids)) return false;
  }
  return true;
}

bool disjoint_validation_solids(const std::vector<TopoDS_Shape>& solids) {
  // IsSame includes the accumulated location but ignores orientation. Sharing
  // within one complete solid is normal; sharing across solids needs fallback.
  const occ::handle<NCollection_BaseAllocator> allocator =
      new NCollection_IncAllocator;
  NCollection_IndexedDataMap<TopoDS_Shape, size_t, TopTools_ShapeMapHasher> owners(
      size_t(1), allocator);
  for (size_t owner = 0; owner < solids.size(); ++owner) {
    std::vector<TopoDS_Shape> pending{solids[owner]};
    while (!pending.empty()) {
      const TopoDS_Shape current = pending.back();
      pending.pop_back();
      if (current.IsNull()) return false;
      const int index = owners.FindIndex(current);
      if (index != 0) {
        if (owners.FindFromIndex(index) != owner) return false;
        continue;
      }
      owners.Add(current, owner);
      for (TopoDS_Iterator child(current, true, true); child.More(); child.Next()) {
        pending.push_back(child.Value());
      }
    }
  }
  return !solids.empty();
}

// The source validity proof. A failed proof keeps the per-solid statuses of
// the whole-shape analyzer that decided it, so validity facts never analyze
// the shape a second time (L2-13).
struct SourceValidity {
  bool valid = false;
  uint32_t invalid_solid_count = 0;
};

// The whole-shape analyzer, with the settings validity facts always used,
// counting each located solid it reports invalid.
SourceValidity whole_shape_validity(const TopoDS_Shape& shape) {
  const BRepCheck_Analyzer analyzer(shape, true, false, false);
  SourceValidity result{analyzer.IsValid(), 0};
  if (!result.valid) {
    for (TopExp_Explorer solid(shape, TopAbs_SOLID); solid.More(); solid.Next()) {
      if (!analyzer.IsValid(solid.Current())) ++result.invalid_solid_count;
    }
  }
  return result;
}

// V3 (ruling 8): scaled and mirrored placements change the located geometry
// an analyzer checks, so only scale 1 with a positive determinant is rigid.
// An instance that is not FORWARD turns its shells against its solid, so its
// definition's analysis does not answer for it either.
bool rigid_placements(const std::vector<TopoDS_Shape>& solids) {
  for (const TopoDS_Shape& solid : solids) {
    const gp_Trsf transform = solid.Location().Transformation();
    if (solid.Orientation() != TopAbs_FORWARD || transform.ScaleFactor() != 1.0 ||
        transform.VectorialPart().Determinant() <= 0.0) {
      return false;
    }
  }
  return true;
}

// `analyses`, when given, counts the located-solid analyzer runs (the
// qualification controls read it).
SourceValidity shape_is_valid(const TopoDS_Shape& shape, uint32_t* analyses = nullptr) {
  if (shape.IsNull() || shape.ShapeType() != TopAbs_COMPOUND) {
    return whole_shape_validity(shape);
  }
  const auto solid_valid = [analyses](const TopoDS_Shape& solid) {
    if (analyses != nullptr) ++*analyses;
    return BRepCheck_Analyzer(solid, true, false, false).IsValid();
  };
  std::vector<TopoDS_Shape> solids;
  if (collect_validation_solids(shape, solids) && solids.size() > 1 &&
      disjoint_validation_solids(solids)) {
    // V3: with every placement rigid, the first located instance of each
    // solid definition answers "valid"; any failure falls through.
    if (rigid_placements(solids)) {
      NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> definitions;
      bool valid = true;
      for (const TopoDS_Shape& solid : solids) {
        const TopoDS_Shape definition =
            solid.Located(TopLoc_Location()).Oriented(TopAbs_FORWARD);
        if (definitions.Contains(definition)) continue;
        definitions.Add(definition);
        if (!solid_valid(solid)) {
          valid = false;
          break;
        }
      }
      if (valid) return {true, 0};
    }
    // The identity map is already destroyed. Analyze each exact located and
    // oriented solid, with the same geometric/ST/non-exact settings as before.
    bool valid = true;
    for (const TopoDS_Shape& solid : solids) {
      if (!solid_valid(solid)) {
        valid = false;
        break;
      }
    }
    if (valid) return {true, 0};
  }
  // Each leaf analyzer has been destroyed before whole-shape fallback.
  // Exceptions propagate to the existing operation guard, never to success.
  return whole_shape_validity(shape);
}

// V1 (rulings 2 and 3): shell closure from exact topology. Per unique shell
// definition, face uses per edge, skipping degenerated and INTERNAL/EXTERNAL
// uses: an odd count is open, three or more is non-manifold, and sharing
// across shells counts as closed. Faces outside any shell form one group. A
// group with no counted use (faces with no edge, as surfaceless faces have)
// proves nothing closed, so it fails too.
struct ClosureGroup {
  TopoDS_Shape key;          // the shell definition; null for the free faces
  TopLoc_Location instance;  // the first located instance, placing samples
  uint32_t edges = 0;        // edges with a counted use
  uint32_t open = 0, nonmanifold = 0, sample_count = 0;
  TopoDS_Edge samples[4];    // in the group's frame, in first-use order
  uint32_t sample_uses[4] = {};
  std::vector<uint32_t> occurrences;  // leaf ordinals, once `attributed`
};

struct ClosureFacet {
  uint32_t shells = 0, free_faces = 0, open_edges = 0, nonmanifold_edges = 0;
  bool shells_closed = true;
  bool attributed = false;
  // Only failing groups: shells in explorer order, then the free faces.
  std::vector<ClosureGroup> failing;
};

void count_face_uses(const TopoDS_Shape& group, ClosureGroup& result) {
  // Keyed by TShape and location, orientation ignored: a seam used twice by
  // one face counts two. The indexed map keeps samples deterministic.
  NCollection_IndexedDataMap<TopoDS_Shape, uint32_t, TopTools_ShapeMapHasher> uses;
  for (TopExp_Explorer face(group, TopAbs_FACE); face.More(); face.Next()) {
    for (TopExp_Explorer edge(face.Current(), TopAbs_EDGE); edge.More();
         edge.Next()) {
      const TopoDS_Edge& use = TopoDS::Edge(edge.Current());
      if (use.Orientation() == TopAbs_INTERNAL ||
          use.Orientation() == TopAbs_EXTERNAL || BRep_Tool::Degenerated(use)) {
        continue;
      }
      const int index = uses.FindIndex(use);
      if (index == 0) {
        uses.Add(use, 1);
      } else {
        ++uses.ChangeFromIndex(index);
      }
    }
  }
  result.edges = static_cast<uint32_t>(uses.Extent());
  for (int index = 1; index <= uses.Extent(); ++index) {
    const uint32_t count = uses.FindFromIndex(index);
    const bool open = count % 2 == 1, nonmanifold = count >= 3;
    result.open += open ? 1 : 0;
    result.nonmanifold += nonmanifold ? 1 : 0;
    if ((open || nonmanifold) && result.sample_count < 4) {
      result.samples[result.sample_count] = TopoDS::Edge(uses.FindKey(index));
      result.sample_uses[result.sample_count++] = count;
    }
  }
}

bool closed(const ClosureGroup& group) {
  return group.edges != 0 && group.open == 0 && group.nonmanifold == 0;
}

ClosureFacet closure_facet(const TopoDS_Shape& shape) {
  ClosureFacet facet;
  const auto add = [&facet](ClosureGroup&& group) {
    facet.open_edges += group.open;
    facet.nonmanifold_edges += group.nonmanifold;
    if (!closed(group)) facet.failing.push_back(std::move(group));
  };
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> definitions;
  for (TopExp_Explorer shell(shape, TopAbs_SHELL); shell.More(); shell.Next()) {
    const TopoDS_Shape key =
        shell.Current().Located(TopLoc_Location()).Oriented(TopAbs_FORWARD);
    if (definitions.Contains(key)) continue;
    definitions.Add(key);
    ClosureGroup group;
    group.key = key;
    group.instance = shell.Current().Location();
    count_face_uses(key, group);
    if (!closed(group)) facet.shells_closed = false;
    add(std::move(group));
  }
  facet.shells = static_cast<uint32_t>(definitions.Extent());
  BRep_Builder builder;
  TopoDS_Compound free_faces;
  builder.MakeCompound(free_faces);
  for (TopExp_Explorer face(shape, TopAbs_FACE, TopAbs_SHELL); face.More();
       face.Next()) {
    builder.Add(free_faces, face.Current());
    ++facet.free_faces;
  }
  if (facet.free_faces != 0) {
    ClosureGroup group;
    count_face_uses(free_faces, group);
    add(std::move(group));
  }
  return facet;
}

// S6 (ruling 26): BRepGProp::volumeProperties' rigid-instance cache, for the
// surface area alone (the centre of mass stays on the volume integral). A
// shape without a repeated solid TShape keeps the plain SurfaceProperties
// bits. With one, each rigid instance reuses its definition's area, which
// regroups the additions (relative ULP moves, as ruling 7 accepts for the
// centre of mass). ponytail: free faces keep the plain whole-shape integral
// rather than a separate free-face term.
double surface_area(const TopoDS_Shape& shape) {
  bool repeated = false;
  {
    NCollection_Map<occ::handle<TopoDS_TShape>> seen;
    for (TopExp_Explorer solid(shape, TopAbs_SOLID); solid.More() && !repeated;
         solid.Next()) {
      repeated = !seen.Add(solid.Current().TShape());
    }
  }
  if (!repeated || TopExp_Explorer(shape, TopAbs_FACE, TopAbs_SOLID).More()) {
    GProp_GProps whole;
    BRepGProp::SurfaceProperties(shape, whole);
    return whole.Mass();
  }
  struct Definition {
    double area;
    TopLoc_Location location;
  };
  NCollection_DataMap<occ::handle<TopoDS_TShape>, Definition> definitions;
  double area = 0.0;
  for (TopExp_Explorer explorer(shape, TopAbs_SOLID); explorer.More();
       explorer.Next()) {
    const TopoDS_Shape& solid = explorer.Current();
    if (const Definition* known = definitions.Seek(solid.TShape())) {
      const gp_Trsf relative =
          solid.Location().Multiplied(known->location.Inverted()).Transformation();
      if (std::abs(std::abs(relative.ScaleFactor()) - 1.0) <=
              TopLoc_Location::ScalePrec() &&
          !relative.IsNegative()) {
        area += known->area;
        continue;
      }
    }
    // A first instance, or one whose placement is not rigid relative to it.
    GProp_GProps properties;
    BRepGProp::SurfaceProperties(solid, properties);
    definitions.TryBind(solid.TShape(), {properties.Mass(), solid.Location()});
    area += properties.Mass();
  }
  return area;
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

// `measured == false` is the address part alone (F5): classification and
// analytic parameters, with area and centre of mass left zero.
FaceFacts face_facts(const TopoDS_Face& face, uint32_t index,
                     uint32_t query_index, bool include_optimal_bounds = true,
                     bool measured = true) {
  BRepAdaptor_Surface surface(face);
  FaceFacts result;
  result.shape = face;
  if (include_optimal_bounds) result.bounds = bounds(face);
  result.reversed = face.Orientation() == TopAbs_REVERSED ? 1 : 0;
  result.facts.index = index;
  result.facts.query_index = query_index;
  result.facts.surface_type = surface_type(surface.GetType());
  result.facts.parameter_bounds[0] = surface.FirstUParameter();
  result.facts.parameter_bounds[1] = surface.LastUParameter();
  result.facts.parameter_bounds[2] = surface.FirstVParameter();
  result.facts.parameter_bounds[3] = surface.LastVParameter();

  if (measured) {
    GProp_GProps properties;
    BRepGProp::SurfaceProperties(face, properties);
    result.facts.area = properties.Mass();
    if (std::abs(result.facts.area) > std::numeric_limits<double>::epsilon()) {
      point(result.facts.center_of_mass, properties.CentreOfMass());
    }
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
int exact_mapped_face_index(
    const NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>& map,
    const std::vector<Face>& faces, const TopoDS_Shape& shape) {
  const int index = map.FindIndex(shape);
  return index > 0 &&
                 faces[static_cast<size_t>(index - 1)].shape.IsEqual(shape)
             ? index
             : 0;
}

// A face list indexed by IsSame, with each key's ordinals in the list.
struct IndexedFaces {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> map;
  std::vector<std::vector<size_t>> ordinals;

  void add(const TopoDS_Shape& face, size_t ordinal) {
    const size_t key = static_cast<size_t>(map.Add(face));
    if (key > ordinals.size()) ordinals.resize(key);
    ordinals[key - 1].push_back(ordinal);
  }

  // The 1-based ordinal of the unique IsEqual match in `faces`, else 0. IsEqual
  // implies IsSame, so no match lies outside the shape's own key.
  template <typename Face>
  int exact(const std::vector<Face>& faces, const TopoDS_Shape& shape) const {
    const int key = map.FindIndex(shape);
    if (key <= 0) return 0;
    int match = 0;
    for (const size_t ordinal : ordinals[static_cast<size_t>(key - 1)]) {
      if (!faces[ordinal].shape.IsEqual(shape)) continue;
      if (match != 0) return 0;
      match = static_cast<int>(ordinal + 1);
    }
    return match;
  }
};

// Face indexes for the named-subshape and datum lookups: the whole shape's
// public faces over its private face map, and each product's and occurrence's
// faces indexed on their first lookup rather than scanned per lookup.
struct FaceLookups {
  IndexedFaces whole;
  std::vector<std::optional<IndexedFaces>> products;
  std::vector<std::optional<IndexedFaces>> occurrences;
};

int located_public_face_index(FaceLookups& lookups, size_t product,
                              const TopoDS_Shape& product_shape,
                              const TopoDS_Shape& attached,
                              const std::vector<OccurrenceFacts>& occurrences,
                              size_t occurrence) {
  std::optional<IndexedFaces>& product_faces = lookups.products[product];
  if (!product_faces) {
    product_faces.emplace();
    size_t ordinal = 0;
    for (TopExp_Explorer explorer(product_shape, TopAbs_FACE); explorer.More();
         explorer.Next()) {
      product_faces->add(explorer.Current(), ordinal++);
    }
  }
  // The one product face the explorer visits IsSame `attached`, else none.
  const int key = product_faces->map.FindIndex(attached);
  if (key <= 0 ||
      product_faces->ordinals[static_cast<size_t>(key - 1)].size() != 1) {
    return -1;
  }
  const TopoDS_Shape& product_face = product_faces->map(key);

  const OccurrenceFacts& value = occurrences[occurrence];
  TopoDS_Shape located = product_face;
  located.Location(value.shape.Location() *
                   product_shape.Location().Inverted() *
                   product_face.Location());
  std::optional<IndexedFaces>& faces = lookups.occurrences[occurrence];
  if (!faces) {
    faces.emplace();
    for (size_t ordinal = 0; ordinal < value.public_faces.size(); ++ordinal) {
      faces->add(value.public_faces[ordinal].shape, ordinal);
    }
  }
  const int face = faces->exact(value.public_faces, located);
  if (face == 0) return -1;
  return value.public_faces[static_cast<size_t>(face - 1)].query_index == 0
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

// Ordered private face addresses and public faces. Edge addresses, face→edge
// incidence and all numerics are filled on demand from these same shapes.
void populate_occurrence_geometry(OccurrenceFacts& occurrence) {
  // Transient map nodes come from one bump allocator released at return.
  const occ::handle<NCollection_BaseAllocator> allocator =
      new NCollection_IncAllocator;
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faces(
      size_t(1), allocator);
  TopExp::MapShapes(occurrence.shape, TopAbs_FACE, faces);
  occurrence.faces.reserve(static_cast<size_t>(faces.Extent()));
  for (int index = 1; index <= faces.Extent(); ++index) {
    LocatedFaceFacts located;
    located.shape = TopoDS::Face(faces(index));
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

std::map<std::string, size_t> index_products(
    const std::vector<ProductFacts>& products) {
  std::map<std::string, size_t> indices;
  for (size_t index = 0; index < products.size(); ++index) {
    indices.emplace(products[index].label, index);
  }
  return indices;
}

size_t product_index(const std::map<std::string, size_t>& products,
                     const std::string& label) {
  const auto found = products.find(label);
  if (found != products.end()) return found->second;
  throw Standard_Failure("Occurrence product is absent from product facts.");
}

std::vector<std::vector<int>> index_product_owners(
    size_t product_count, const std::vector<OccurrenceFacts>& occurrences) {
  std::vector<std::vector<int>> owners(product_count);
  for (size_t occurrence = 0; occurrence < occurrences.size(); ++occurrence) {
    const size_t product = occurrences[occurrence].product;
    if (product < product_count) {
      owners[product].push_back(static_cast<int>(occurrence));
    }
  }
  return owners;
}

void append_free_shape_occurrence(
    const occ::handle<XCAFDoc_ShapeTool>& shape_tool, const TDF_Label& root,
    size_t ordinal, const std::string& path,
    const ProductIdentityIndex& identity,
    const std::map<std::string, size_t>& products,
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
                        const std::map<std::string, size_t>& products,
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
    occurrence.facts.parent = occurrence.parent;
    occurrence.facts.product = static_cast<uint32_t>(occurrence.product);
    occurrence.facts.ordinal_count = occurrence.ordinal_path.size();
    const int occurrence_index = static_cast<int>(output.size());
    output.push_back(std::move(occurrence));

    append_occurrences(shape_tool, product, composed,
                       output[static_cast<size_t>(occurrence_index)].path,
                       output[static_cast<size_t>(occurrence_index)].ordinal_path,
                       occurrence_index, identity, products, output);
    // C2 (ruling 6): a leaf is an occurrence no other occurrence names as
    // parent. A parent keeps its label, path, product, placement and shape but
    // no face addresses: it is structure, and its children own the faces.
    if (output.size() == static_cast<size_t>(occurrence_index) + 1) {
      populate_occurrence_geometry(output[static_cast<size_t>(occurrence_index)]);
    }
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
  // Last matching occurrence and match count per label: the NAUO loop below
  // looked these up with a scan over all occurrences per NAUO.
  NCollection_DataMap<TDF_Label, std::pair<size_t, size_t>> label_occurrences;
  for (size_t occurrence = 0; occurrence < occurrences.size(); ++occurrence) {
    std::pair<size_t, size_t>* seen =
        label_occurrences.ChangeSeek(occurrences[occurrence].source_label);
    if (seen == nullptr) {
      label_occurrences.Bind(occurrences[occurrence].source_label, {occurrence, 1});
    } else {
      *seen = {occurrence, seen->second + 1};
    }
  }

  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto entity = model->Value(index);
    const auto nauo = entity_as<StepRepr_NextAssemblyUsageOccurrence>(entity);
    if (!nauo.IsNull()) {
      const int source_id = model->IdentLabel(nauo);
      if (source_id <= 0) continue;
      const TDF_Label label = STEPCAFControl_Reader::FindInstance(
          nauo, shape_tool, tool, reader.GetShapeLabelMap());
      if (label.IsNull()) continue;
      const std::pair<size_t, size_t>* match = label_occurrences.Seek(label);
      if (match == nullptr || match->second != 1 || ambiguous_nauo[match->first]) continue;
      const size_t found = match->first;
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

    const auto face = entity_as<StepShape_AdvancedFace>(entity);
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
  // A route shared by two or more valid occurrences is ambiguous for all of
  // them; this is the set the former pairwise pass invalidated.
  std::map<std::vector<uint32_t>, size_t> route_counts;
  for (const OccurrenceFacts& occurrence : occurrences) {
    if (occurrence.source_transfer_valid) ++route_counts[occurrence.source_route];
  }
  for (OccurrenceFacts& occurrence : occurrences) {
    if (occurrence.source_transfer_valid &&
        route_counts.at(occurrence.source_route) > 1) {
      occurrence.source_transfer_valid = false;
    }
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
                      FaceLookups& lookups,
                      std::vector<SubshapeFacts>& output) {
  std::vector<std::vector<int>> owners = index_product_owners(
      static_cast<size_t>(product_labels.Length()), occurrences);
  for (int product_index = 1; product_index <= product_labels.Length();
       ++product_index) {
    const TDF_Label& product = product_labels.Value(product_index);
    NCollection_Sequence<TDF_Label> labels;
    if (!XCAFDoc_ShapeTool::GetSubShapes(product, labels)) continue;
    const TopoDS_Shape product_shape = shape_tool->GetShape(product);

    std::vector<int>& product_owners =
        owners[static_cast<size_t>(product_index - 1)];
    if (product_owners.empty()) product_owners.push_back(-1);

    for (const TDF_Label& label : labels) {
      const std::string name = label_name(label);
      const TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(label);
      const int type = shape.IsNull() ? -1 : subshape_type(shape.ShapeType());
      if (name.empty() || type < 0) continue;
      for (const int owner : product_owners) {
        int face = -1;
        if (shape.ShapeType() == TopAbs_FACE) {
          if (owner >= 0) {
            face = located_public_face_index(
                lookups, static_cast<size_t>(product_index - 1), product_shape,
                shape, occurrences, static_cast<size_t>(owner));
          } else {
            const int matched = lookups.whole.exact(whole_faces, shape);
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
        const int whole = exact_mapped_face_index(
            lookups.whole.map, whole_query_faces, located.shape);
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
    const std::vector<FaceView>& whole_faces, FaceLookups& lookups,
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
    const auto datum = entity_as<StepDimTol_Datum>(model->Value(index));
    if (datum.IsNull()) continue;
    const std::string letter = hascii(datum->Identification());
    if (!letter.empty()) append_letters(datum.get(), {letter});
  }

  std::vector<std::pair<const void*, const void*>> aspect_edges;
  for (int index = 1; index <= model->NbEntities(); ++index) {
    const auto relationship =
        entity_as<StepRepr_ShapeAspectRelationship>(model->Value(index));
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
      const auto usage = entity_as<StepAP242_ItemIdentifiedRepresentationUsage>(
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
      const int face = lookups.whole.exact(whole_faces, attached);
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
        const int face = located_public_face_index(
            lookups, occurrence.product, product_shape, attached, occurrences,
            occurrence_index);
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
    const auto datum = entity_as<StepDimTol_Datum>(model->Value(index));
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
        entity_as<StepShape_ShapeDefinitionRepresentation>(
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
        entity_as<StepRepr_ConstructiveGeometryRepresentation>(
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
  } catch (const std::exception& exception) {  // Standard_Failure included (8.x)
    return fail(GEOSPEC_OCCT_NATIVE_ERROR, exception.what(), error);
  } catch (...) {
    return fail(GEOSPEC_OCCT_NATIVE_ERROR, "Unknown OCCT failure.", error);
  }
}

// A process-unique document serial: a memo compares serials, which a later
// document at a released one's address cannot reuse (R3 O1).
uint64_t next_document_serial() {
  static std::atomic<uint64_t> serial{0};
  return ++serial;
}

}  // namespace

struct geospec_occt_document {
  const uint64_t serial = next_document_serial();
  occ::handle<TDocStd_Document> document;
  TopoDS_Shape shape;
  std::string schema;
  size_t source_byte_length = 0;
  size_t free_shape_count = 0;
  // Ruling 32: located faces admitted without a surface, i.e. tessellated-only
  // products that the OnNoBRep read profile keeps; exact claims refuse them.
  size_t surfaceless_face_count = 0;
  std::string source_length_unit;
  bool all_source_length_contexts_mm = false;
  double source_unit_to_millimeters = 1.0;
  std::vector<ProductFacts> products;
  std::vector<OccurrenceFacts> occurrences;
  std::vector<SourceFaceFacts> source_faces;
  // Private whole-shape faces: shape and label only; numerics are a slot.
  std::vector<FaceFacts> faces;
  std::vector<FaceView> public_faces;
  std::vector<SubshapeFacts> subshapes;
  std::vector<SemanticDatumFacts> semantic_datums;
  std::vector<DatumPlacementFacts> datum_placements;
  mutable std::optional<ReportData> report;
  // Copy+mesh generations built by MESH prepares; each lives for its call.
  mutable size_t report_generation_builds = 0;
  // Diagnostic counts: occurrence operands qualified (regular_solid_operand
  // behind occurrence_operand) and bore interiors the S3 certificate cleared.
  mutable size_t occurrence_qualifications = 0;
  mutable size_t certified_clear_bores = 0;
  mutable std::optional<std::pair<MeshKey, MeshData>> transfer_mesh;
  mutable std::optional<std::vector<geospec_occt_circular_bore_candidate>>
      circular_bores;
  mutable std::unique_ptr<EdgeTreatmentTransferData> edge_treatments;
  // N2-LAZY source numeric slots. Admission keeps XDE identity, order,
  // placements and private/public face addresses only; occurrence edge
  // addresses are a slot too. Each slot is computed once
  // from this admitted source shape on first demand and stored only after it
  // succeeds. Every Boolean is non-destructive, so no query modifies inputs.
  // Const getters write these unsynchronized slots: the document is confined
  // to one thread at a time (its Rust owner is neither Send nor Sync).
  // The source validity proof.
  mutable std::optional<SourceValidity> shape_valid;
  // V1: the shell-closure facet, shared by validity and STEP watertightness.
  mutable std::optional<ClosureFacet> closure;
  // O3-02: one AddOptimal box per located face (IsSame: TShape + Location),
  // shared by whole-shape bounds (V2), occurrence bounds (F4) and whole-face
  // boxes (F6). Only a granted BOUNDS prepare fills it in parallel.
  mutable NCollection_DataMap<TopoDS_Shape, Bnd_Box, TopTools_ShapeMapHasher>
      face_boxes;
  // F1: whole-shape report facts of this shape; `source_shape_parts` holds
  // the REPORT_VOLUME/AREA/BOUNDS/COUNTS bits already measured.
  mutable geospec_occt_shape_facts source_shape{};
  mutable uint32_t source_shape_parts = 0;
  mutable std::vector<std::optional<geospec_occt_bounds>> occurrence_bounds;
  // Each occurrence's private edge-address count (its MapShapes extent); the
  // edge handles themselves are not retained.
  mutable std::vector<std::optional<size_t>> occurrence_edge_counts;
  mutable std::vector<std::optional<FaceFacts>> query_faces;
};

// C7: one claim's qualified occurrence operands and scoped bore inventories,
// each computed once and only after it returns. The caller's evaluation
// context owns the memo and releases it with the claim, so nothing here is
// retained with the document.
struct geospec_occt_operand_memo {
  struct Operand {
    bool qualified = false;
    TopoDS_Solid solid;
    std::string message;
  };
  struct Bores {
    bool built = false;
    bool native_error = false;
    std::string message;
    std::vector<geospec_occt_circular_bore_candidate> candidates;
  };
  uint64_t document_serial = 0;
  std::map<uint32_t, Operand> operands;
  std::map<uint32_t, Bores> bores;
};

namespace {

// N2-LAZY slot fills. Each computes exactly what admission used to compute,
// from the same admitted shapes in the same order, and assigns the slot only
// after the computation has returned. OCCT failures propagate to the guard.
const SourceValidity& source_validity(const geospec_occt_document& document) {
  if (!document.shape_valid) document.shape_valid = shape_is_valid(document.shape);
  return *document.shape_valid;
}

const ClosureFacet& source_closure(const geospec_occt_document& document) {
  if (!document.closure) document.closure = closure_facet(document.shape);
  return *document.closure;
}

// V1 evidence: each failing group's leaf occurrences (no occurrence names
// them as parent), in ordinal order, from one pass that looks every leaf
// shell up by its definition; a leaf with faces outside any shell names the
// free-face group. A leaf is named at most once per group, so the lists hold
// at most the leaf shell instances plus the leaves.
const ClosureFacet& attributed_closure(const geospec_occt_document& document) {
  source_closure(document);
  ClosureFacet& facet = *document.closure;
  if (facet.attributed) return facet;
  NCollection_DataMap<TopoDS_Shape, size_t, TopTools_ShapeMapHasher> groups;
  size_t free_group = facet.failing.size();
  for (size_t index = 0; index < facet.failing.size(); ++index) {
    if (facet.failing[index].key.IsNull()) {
      free_group = index;
    } else {
      groups.Bind(facet.failing[index].key, index);
    }
  }
  std::vector<bool> parents(document.occurrences.size(), false);
  for (const OccurrenceFacts& occurrence : document.occurrences) {
    if (occurrence.parent >= 0 &&
        static_cast<size_t>(occurrence.parent) < parents.size()) {
      parents[static_cast<size_t>(occurrence.parent)] = true;
    }
  }
  std::vector<std::vector<uint32_t>> named(facet.failing.size());
  for (size_t ordinal = 0; ordinal < document.occurrences.size(); ++ordinal) {
    if (parents[ordinal]) continue;
    const uint32_t leaf = static_cast<uint32_t>(ordinal);
    const auto name = [&named, leaf](size_t group) {
      if (named[group].empty() || named[group].back() != leaf) {
        named[group].push_back(leaf);
      }
    };
    const TopoDS_Shape& shape = document.occurrences[ordinal].shape;
    for (TopExp_Explorer shell(shape, TopAbs_SHELL); shell.More(); shell.Next()) {
      const size_t* group = groups.Seek(
          shell.Current().Located(TopLoc_Location()).Oriented(TopAbs_FORWARD));
      if (group != nullptr) name(*group);
    }
    if (free_group != facet.failing.size() &&
        TopExp_Explorer(shape, TopAbs_FACE, TopAbs_SHELL).More()) {
      name(free_group);
    }
  }
  for (size_t index = 0; index < named.size(); ++index) {
    facet.failing[index].occurrences = std::move(named[index]);
  }
  facet.attributed = true;
  return facet;
}

const Bnd_Box& memo_face_box(const geospec_occt_document& document,
                             const TopoDS_Shape& face) {
  if (const Bnd_Box* box = document.face_boxes.Seek(face)) return *box;
  Bnd_Box box;
  BRepBndLib::AddOptimal(face, box, false, false);
  return *document.face_boxes.Bound(face, box);
}

// bounds(shape) decomposed as BRepBndLib::AddOptimal folds it: each face box
// (from the memo), then edges outside faces and vertices outside edges, all
// by Update(Get()). A min/max fold of identical doubles, so bit-equal to
// bounds(); ponytail: a parent re-walks its faces as memo hits instead of
// taking its children's union (L2-8), which needs no parent/child map.
geospec_occt_bounds memo_bounds(const geospec_occt_document& document,
                                const TopoDS_Shape& shape) {
  Bnd_Box box;
  for (TopExp_Explorer face(shape, TopAbs_FACE); face.More(); face.Next()) {
    const Bnd_Box& local = memo_face_box(document, face.Current());
    if (local.IsVoid()) continue;
    double xmin, ymin, zmin, xmax, ymax, zmax;
    local.Get(xmin, ymin, zmin, xmax, ymax, zmax);
    box.Update(xmin, ymin, zmin, xmax, ymax, zmax);
  }
  for (TopExp_Explorer edge(shape, TopAbs_EDGE, TopAbs_FACE); edge.More();
       edge.Next()) {
    BRepBndLib::AddOptimal(edge.Current(), box, false, false);
  }
  for (TopExp_Explorer vertex(shape, TopAbs_VERTEX, TopAbs_EDGE); vertex.More();
       vertex.Next()) {
    BRepBndLib::AddOptimal(vertex.Current(), box, false, false);
  }
  if (box.IsVoid()) throw Standard_Failure("Shape has no finite bounds.");
  geospec_occt_bounds result{};
  box.Get(result.min[0], result.min[1], result.min[2], result.max[0],
          result.max[1], result.max[2]);
  return result;
}

// BRepBndLib's CanUseEdges (pinned BRepBndLib.cxx): the surfaces whose face
// box AddOptimal folds from the edge curves alone, which is cheap.
bool edge_path_surface(const Adaptor3d_Surface& surface) {
  switch (surface.GetType()) {
    case GeomAbs_Plane:
    case GeomAbs_Cylinder:
    case GeomAbs_Cone:
    case GeomAbs_SurfaceOfExtrusion:
      return true;
    case GeomAbs_SurfaceOfRevolution:
      return surface.BasisCurve()->GetType() == GeomAbs_Line;
    case GeomAbs_OffsetSurface:
      return edge_path_surface(*surface.BasisSurface());
    case GeomAbs_BSplineSurface:
      return (surface.UDegree() == 1 && surface.NbUKnots() == 2) ||
             (surface.VDegree() == 1 && surface.NbVKnots() == 2);
    case GeomAbs_BezierSurface:
      return surface.UDegree() == 1 || surface.VDegree() == 1;
    default:
      return false;
  }
}

// V2 under the grant (ruling 24): the AddOptimal box of every located face of
// the document not yet in the memo, computed in OSD_Parallel::For when at least
// 16 of them are off the edge path (O3-02: planar documents are slower in
// parallel). `document.faces` holds the shape's located faces once each, in
// explorer order. Each face TShape is classified once (its surface type does
// not depend on the placement), and nothing is listed unless the pass can run,
// so a granted call costs no more than the serial fold (O3-02 acceptance (3)).
// Each box is that face's own AddOptimal and memo_bounds keeps the serial
// fold, so the bits equal the serial path. ponytail: a pure prefill; a face
// whose box throws, or any failure here, is left to the serial fold, which
// then fails exactly as it would have without a grant.
void prefill_face_boxes(const geospec_occt_document& document) {
  try {
    std::map<const TopoDS_TShape*, bool> classified;
    const auto off_edge_path = [&](const TopoDS_Face& face) {
      const auto [slot, added] = classified.try_emplace(face.TShape().get(), false);
      if (added) {
        TopLoc_Location location;
        slot->second = !BRep_Tool::Surface(face, location).IsNull() &&
                       !edge_path_surface(BRepAdaptor_Surface(face, false));
      }
      return slot->second;
    };
    // An upper bound first: every face off the edge path, memoized or not.
    size_t off_path = 0;
    for (const FaceFacts& face : document.faces) {
      if (off_edge_path(face.shape) && ++off_path == 16) break;
    }
    // ponytail: O3-02's fixed gate; tune it if a corpus measures slower above it.
    if (off_path < 16) return;
    std::vector<const TopoDS_Face*> pending;
    off_path = 0;
    for (const FaceFacts& face : document.faces) {
      if (document.face_boxes.IsBound(face.shape)) continue;
      pending.push_back(&face.shape);
      if (off_edge_path(face.shape)) ++off_path;
    }
    if (off_path < 16) return;
    std::vector<Bnd_Box> boxes(pending.size());
    std::vector<char> measured(pending.size(), 0);
    OSD_Parallel::For(0, static_cast<int>(pending.size()), [&](int index) {
      const size_t face = static_cast<size_t>(index);
      try {
        BRepBndLib::AddOptimal(*pending[face], boxes[face], false, false);
        measured[face] = 1;
      } catch (...) {
      }
    });
    for (size_t face = 0; face < pending.size(); ++face) {
      if (measured[face] != 0) document.face_boxes.Bind(*pending[face], boxes[face]);
    }
  } catch (...) {
  }
}

// F1: whole-shape report facts on the admitted source shape (no copy, no
// mesh). Each part is measured once per document and kept only after it
// returns; the result carries exactly the requested `parts` (the others NaN,
// counts zero), so its bytes never depend on what earlier calls measured.
// Bounds are V2's exact AddOptimal (ruling 4 (A)), folded from the memo.
geospec_occt_shape_facts source_shape_facts(const geospec_occt_document& document,
                                            uint32_t parts) {
  const TopoDS_Shape& shape = document.shape;
  geospec_occt_shape_facts& slot = document.source_shape;
  const auto missing = [&](uint32_t part) {
    return (parts & part) != 0 && (document.source_shape_parts & part) == 0;
  };
  if (missing(GEOSPEC_OCCT_REPORT_VOLUME)) {
    GProp_GProps volume;
    BRepGProp::VolumeProperties(shape, volume);
    slot.volume = volume.Mass();
    if (std::abs(slot.volume) > std::numeric_limits<double>::epsilon()) {
      point(slot.center_of_mass, volume.CentreOfMass());
    }
    document.source_shape_parts |= GEOSPEC_OCCT_REPORT_VOLUME;
  }
  if (missing(GEOSPEC_OCCT_REPORT_AREA)) {
    slot.surface_area = surface_area(shape);
    document.source_shape_parts |= GEOSPEC_OCCT_REPORT_AREA;
  }
  if (missing(GEOSPEC_OCCT_REPORT_BOUNDS)) {
    slot.bounds = memo_bounds(document, shape);
    document.source_shape_parts |= GEOSPEC_OCCT_REPORT_BOUNDS;
  }
  if (missing(GEOSPEC_OCCT_REPORT_COUNTS)) {
    slot.compounds = shape_count(shape, TopAbs_COMPOUND);
    slot.solids = shape_count(shape, TopAbs_SOLID);
    slot.shells = shape_count(shape, TopAbs_SHELL);
    slot.faces = shape_count(shape, TopAbs_FACE);
    slot.wires = shape_count(shape, TopAbs_WIRE);
    slot.edges = shape_count(shape, TopAbs_EDGE);
    slot.vertices = shape_count(shape, TopAbs_VERTEX);
    document.source_shape_parts |= GEOSPEC_OCCT_REPORT_COUNTS;
  }

  geospec_occt_shape_facts result = slot;
  constexpr double unmeasured = std::numeric_limits<double>::quiet_NaN();
  if ((parts & GEOSPEC_OCCT_REPORT_VOLUME) == 0) {
    result.volume = unmeasured;
    std::fill(std::begin(result.center_of_mass), std::end(result.center_of_mass),
              unmeasured);
  }
  if ((parts & GEOSPEC_OCCT_REPORT_AREA) == 0) result.surface_area = unmeasured;
  if ((parts & GEOSPEC_OCCT_REPORT_BOUNDS) == 0) {
    std::fill(std::begin(result.bounds.min), std::end(result.bounds.min), unmeasured);
    std::fill(std::begin(result.bounds.max), std::end(result.bounds.max), unmeasured);
  }
  if ((parts & GEOSPEC_OCCT_REPORT_COUNTS) == 0) {
    result.compounds = result.solids = result.shells = result.faces =
        result.wires = result.edges = result.vertices = 0;
  }
  return result;
}

const geospec_occt_bounds& source_occurrence_bounds(
    const geospec_occt_document& document, size_t occurrence) {
  std::optional<geospec_occt_bounds>& slot =
      document.occurrence_bounds[occurrence];
  if (!slot) slot = memo_bounds(document, document.occurrences[occurrence].shape);
  return *slot;
}

// The number of private edge addresses admission used to map for every
// occurrence (the same MapShapes); only edge consumers pay for it.
size_t source_occurrence_edge_count(const geospec_occt_document& document,
                                    size_t occurrence) {
  std::optional<size_t>& slot = document.occurrence_edge_counts[occurrence];
  if (!slot) {
    const occ::handle<NCollection_BaseAllocator> allocator =
        new NCollection_IncAllocator;
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> edges(
        size_t(1), allocator);
    TopExp::MapShapes(document.occurrences[occurrence].shape, TopAbs_EDGE,
                      edges);
    slot = static_cast<size_t>(edges.Extent());
  }
  return *slot;
}

// Without its box (F6): `source_query_bounds` reads the memo on demand.
const FaceFacts& source_query_face(const geospec_occt_document& document,
                                   uint32_t query_index) {
  std::optional<FaceFacts>& slot = document.query_faces[query_index - 1];
  if (!slot) {
    slot = face_facts(document.faces[query_index - 1].shape, query_index,
                      query_index, false);
  }
  return *slot;
}

geospec_occt_bounds source_query_bounds(const geospec_occt_document& document,
                                        uint32_t query_index) {
  return memo_bounds(document, document.faces[query_index - 1].shape);
}

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
      // Computed edge-use parity, not the stored flag a healer may write;
      // closed non-manifold shells stay admissible r-set boundaries.
      if (!BRep_Tool::IsClosed(explorer.Current())) {
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

// regular_solid_operand(occurrence.shape), once per occurrence per memo.
bool occurrence_operand(const geospec_occt_document& document,
                        uint32_t occurrence, geospec_occt_operand_memo* memo,
                        TopoDS_Solid& solid, std::string& message) {
  const TopoDS_Shape& shape = document.occurrences[occurrence].shape;
  if (memo == nullptr) {
    ++document.occurrence_qualifications;
    return regular_solid_operand(shape, solid, message);
  }
  auto found = memo->operands.find(occurrence);
  if (found == memo->operands.end()) {
    ++document.occurrence_qualifications;
    geospec_occt_operand_memo::Operand value;
    value.qualified = regular_solid_operand(shape, value.solid, value.message);
    found = memo->operands.emplace(occurrence, std::move(value)).first;
  }
  if (!found->second.qualified) {
    message = found->second.message;
    return false;
  }
  solid = found->second.solid;
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

// True only when every face of the owning solid other than the band provably
// stays out of the open bore cylinder r x (from, to), which is all the bore
// Common decides: the band bounds that connected cylinder laterally with
// material outside it, so no other boundary inside means no material inside.
// Exact face boxes (geometry plus tolerance, never triangulation) mapped into
// the bore frame, or closed-form separation of parallel cylinders, tori around
// the bore and planes, beyond every owner tolerance. Separations are measured
// where the band and the face are, never at a stored surface Location, which a
// source may place anywhere on its axis or plane: a tilt allowance only covers
// the lever it is taken over. False means "not proven": the caller runs the
// Common, so this shortcut never decides a byte.
bool bore_interior_certified_clear(
    const geospec_occt_document& document, const BoreSolidContext& owner,
    const TopoDS_Face& band,
    const geospec_occt_circular_bore_candidate& candidate,
    const gp_Pnt& origin, const gp_Dir& axis) {
  gp_Trsf to_local;
  to_local.SetTransformation(gp_Ax3(origin, axis));
  const double r = candidate.band.radius;
  const double from = candidate.band.from;
  const double to = candidate.band.to;
  const double margin = owner.maximum_tolerance + Precision::Confusion();
  const gp_Pnt from_point = origin.Translated(gp_Vec(axis).Multiplied(from));
  const gp_Pnt to_point = origin.Translated(gp_Vec(axis).Multiplied(to));
  const TopoDS_Shape& first_end =
      document.public_faces[candidate.ends[0].adjacent_public_face_ordinal].shape;
  const TopoDS_Shape& second_end =
      document.public_faces[candidate.ends[1].adjacent_public_face_ordinal].shape;
  const auto outside = [&](const double lo[3], const double hi[3]) {
    if (hi[2] <= from || lo[2] >= to) return true;  // beyond the open band
    const double dx = lo[0] > 0 ? lo[0] : (hi[0] < 0 ? -hi[0] : 0.0);
    const double dy = lo[1] > 0 ? lo[1] : (hi[1] < 0 ? -hi[1] : 0.0);
    return std::hypot(dx, dy) >= r;  // beyond the closed disk
  };
  // The tilt between another axis and the bore axis, and the bore-axis offset
  // of the point on the other axis nearest `near`.
  const auto parallel_offset = [&](const gp_Ax1& other, const gp_Pnt& near,
                                   double& tilt, double& distance) {
    const double angle = other.Direction().Angle(axis);
    tilt = std::min(angle, M_PI - angle);
    const gp_Vec along(other.Direction());
    const gp_Vec offset(origin, other.Location().Translated(along.Multiplied(
                                    gp_Vec(other.Location(), near).Dot(along))));
    const gp_Vec direction(axis);
    distance = (offset - direction.Multiplied(offset.Dot(direction))).Magnitude();
  };
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faces;
  TopExp::MapShapes(owner.solid, TopAbs_FACE, faces);
  for (int index = 1; index <= faces.Extent(); ++index) {
    const TopoDS_Face face = TopoDS::Face(faces(index));
    if (face.IsSame(band)) continue;
    Bnd_Box world;
    BRepBndLib::Add(face, world, false);
    if (world.IsVoid() || world.IsOpen()) return false;
    double x0, y0, z0, x1, y1, z1, lo[3], hi[3];
    world.Get(x0, y0, z0, x1, y1, z1);
    for (int a = 0; a < 3; ++a) {
      lo[a] = std::numeric_limits<double>::max();
      hi[a] = -lo[a];
    }
    for (int corner = 0; corner < 8; ++corner) {  // world corners, bore frame
      gp_Pnt p((corner & 1) ? x1 : x0, (corner & 2) ? y1 : y0,
               (corner & 4) ? z1 : z0);
      p.Transform(to_local);
      const double q[3] = {p.X(), p.Y(), p.Z()};
      for (int a = 0; a < 3; ++a) {
        lo[a] = std::min(lo[a], q[a]);
        hi[a] = std::max(hi[a], q[a]);
      }
    }
    // Type and analytic parameters only: the unrestricted adaptor is exact.
    const BRepAdaptor_Surface surface(face, false);
    if (face.IsSame(first_end) || face.IsSame(second_end)) {  // mouth or bottom
      if (surface.GetType() != GeomAbs_Plane) return false;
      const double station = face.IsSame(first_end) ? from : to;
      const double zone = 2.0 * BRep_Tool::Tolerance(face) + Precision::Confusion();
      if (lo[2] < station - zone || hi[2] > station + zone) {
        const gp_Pln plane = surface.Plane();
        if (!plane.Axis().Direction().IsParallel(axis, Precision::Angular()) ||
            plane.Distance(origin.Translated(gp_Vec(axis).Multiplied(station))) >
                Precision::Confusion()) {
          return false;
        }
      }
      continue;
    }
    if (outside(lo, hi)) continue;
    Bnd_Box local;  // the same box family, computed in the bore frame
    BRepBndLib::Add(face.Moved(TopLoc_Location(to_local)), local, false);
    if (!local.IsVoid() && !local.IsOpen()) {
      local.Get(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
      if (outside(lo, hi)) continue;
    }
    // Every face point lies within half the box diagonal of the box centre, so
    // its foot on a tilted axis moves the offset by at most that times
    // sin(tilt); a circle of radius rho about the tilted axis projects no
    // nearer than rho cos(tilt) >= rho - rho sin(tilt).
    const double diagonal = std::sqrt(world.SquareExtent());
    const gp_Pnt centre(0.5 * (x0 + x1), 0.5 * (y0 + y1), 0.5 * (z0 + z1));
    double tilt = 0.0, distance = 0.0;
    if (surface.GetType() == GeomAbs_Cylinder) {
      const gp_Cylinder cylinder = surface.Cylinder();
      parallel_offset(cylinder.Axis(), centre, tilt, distance);
      if (tilt < 1e-6 &&
          std::abs(distance - cylinder.Radius()) >=
              r + margin + (diagonal + cylinder.Radius()) * std::sin(tilt)) {
        continue;
      }
    } else if (surface.GetType() == GeomAbs_Torus) {  // bore through its hole
      // Measured at the centre the hole test is about; the tube circle
      // projects no nearer than R cos(tilt).
      const gp_Torus torus = surface.Torus();
      parallel_offset(torus.Axis(), torus.Location(), tilt, distance);
      if (tilt < 1e-6 &&
          torus.MajorRadius() - torus.MinorRadius() - distance >=
              r + margin + (diagonal + torus.MajorRadius()) * std::sin(tilt)) {
        continue;
      }
    } else if (surface.GetType() == GeomAbs_Plane) {
      // The closed band cylinder spans the plane offsets of its end centres
      // widened by r |normal x axis|, so beyond margin on one side is clear.
      const gp_Pln plane = surface.Plane();
      const gp_Vec normal(plane.Axis().Direction());
      const double from_offset = gp_Vec(plane.Location(), from_point).Dot(normal);
      const double to_offset = gp_Vec(plane.Location(), to_point).Dot(normal);
      const double spread = r * normal.Crossed(gp_Vec(axis)).Magnitude();
      if (std::min(from_offset, to_offset) - spread >= margin ||
          std::max(from_offset, to_offset) + spread <= -margin) {
        continue;
      }
      if (plane.Axis().Direction().IsParallel(axis, Precision::Angular())) {  // across the band
        bool analytic = true;  // extrema are trusted on lines and circles only
        for (TopExp_Explorer edges(face, TopAbs_EDGE); edges.More() && analytic;
             edges.Next()) {
          const TopoDS_Edge edge = TopoDS::Edge(edges.Current());
          if (BRep_Tool::Degenerated(edge)) continue;
          const GeomAbs_CurveType type = BRepAdaptor_Curve(edge).GetType();
          analytic = type == GeomAbs_Line || type == GeomAbs_Circle;
        }
        if (analytic) {
          // Where the plane meets the axis: its offset is affine along it.
          const double crossing =
              from + from_offset / (from_offset - to_offset) * (to - from);
          BRepExtrema_DistShapeShape clearance(
              BRepBuilderAPI_MakeVertex(
                  origin.Translated(gp_Vec(axis).Multiplied(crossing)))
                  .Vertex(),
              face);
          if (clearance.IsDone() && clearance.NbSolution() > 0 &&
              clearance.Value() >= r + margin) {
            continue;
          }
        }
      }
    }
    return false;  // not proven: run the Common
  }
  ++document.certified_clear_bores;
  return true;
}

// A non-empty CSF_DEBUG_BOP makes every OCCT Boolean run two BRepAlgoAPI_Check
// passes and write BREP files (BRepAlgoAPI_BooleanOperation.cxx). GeoSpec
// refuses rather than run an environment-dependent path (policy §16).
bool boolean_debug_requested(std::string& message) {
  const char* value = std::getenv("CSF_DEBUG_BOP");
  if (value == nullptr || value[0] == '\0') return false;
  message = "CSF_DEBUG_BOP is set; GeoSpec does not run OCCT Booleans that "
            "check and dump their arguments.";
  return true;
}

bool build_circular_bores(
    const geospec_occt_document& document, size_t max_candidates,
    size_t retained_candidate_size, size_t retained_inventory_size,
    std::vector<geospec_occt_circular_bore_candidate>& output,
    std::string& message, bool& native_error, bool run_parallel = false,
    const TopoDS_Solid* qualified_owner = nullptr) {
  constexpr size_t kMaximumCandidates = 4096;
  constexpr size_t kMaximumOwnedBytes = 1024 * 1024;
  const size_t limit = std::min(max_candidates, kMaximumCandidates);
  size_t count = 0;
  for (const FaceView& view : document.public_faces) {
    if (BRepAdaptor_Surface(view.shape, false).GetType() != GeomAbs_Plane) ++count;
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
    const BRepAdaptor_Surface surface(view.shape, false);  // type only
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
      // A scoped caller that already qualified this exact solid passes it:
      // qualification is a pure function of the solid (one BRepCheck, C7).
      const bool prequalified = qualified_owner != nullptr && solids.Extent() == 1 &&
                                qualified_owner->IsEqual(solids(owner_ordinal));
      if (prequalified) qualified = *qualified_owner;
      slot->valid = (prequalified || regular_solid_operand(solids(owner_ordinal),
                                                           qualified, qualification)) &&
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
    if (bore_interior_certified_clear(document, owner, view.shape, candidate,
                                      origin, axis)) {
      candidate.disposition = GEOSPEC_OCCT_CIRCULAR_BORE_QUALIFIED;
      candidate.reason = 0;
      output.push_back(candidate);
      continue;
    }
    if (boolean_debug_requested(message)) return false;

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
    // A regular_solid_operand-qualified owner (finite positive volume, closed
    // shells) and a primitive cylinder are never inverted, so the inverted
    // check cannot widen their boxes; it only costs two classifier builds.
    common.SetCheckInverted(false);
    common.SetRunParallel(run_parallel);
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
  const GeomAbs_SurfaceType type = BRepAdaptor_Surface(face, false).GetType();
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
    if (BRepAdaptor_Surface(use.adjacent, false).GetType() == type &&
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

      const GeomAbs_SurfaceType type = BRepAdaptor_Surface(view.shape, false).GetType();
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
  // The operand gate closed every shell by computed edge-use parity (S4),
  // never by the stored flag a healer may write: one closure definition.
  if (shells.Extent() != 1) {
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

void mesh_shape(const TopoDS_Shape& shape, double linear, double angular,
                bool run_parallel = false) {
  // DEFAULT would read CSF_MeshAlgo on every Perform (GeoSpec policy section 16);
  // the other fields are the five-argument constructor's.
  IMeshTools_Parameters parameters;
  parameters.MeshAlgo = IMeshTools_MeshAlgoType_Watson;
  parameters.Deflection = linear;
  parameters.Angle = angular;
  parameters.Relative = false;
  parameters.InParallel = run_parallel;
  BRepMesh_IncrementalMesh mesher(shape, parameters);
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
                      double angular, bool run_parallel = false) {
  BRepBuilderAPI_Copy copy(shape, false, false);
  if (!copy.IsDone()) throw Standard_Failure("Tessellation shape copy failed.");
  const TopoDS_Shape isolated = copy.Shape();
  mesh_shape(isolated, linear, angular, run_parallel);

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
    std::vector<std::optional<std::array<double, 3>>> placed_nodes(
        static_cast<size_t>(mesh->NbNodes()) + 1);
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
        const size_t index = static_cast<size_t>(node);
        if (index > 0 && index < placed_nodes.size() && placed_nodes[index]) {
          result.positions.push_back(*placed_nodes[index]);
          continue;
        }
        const gp_Pnt placed = mesh->Node(node).Transformed(transform);
        const std::array<double, 3> position{
            static_cast<double>(static_cast<float>(placed.X())),
            static_cast<double>(static_cast<float>(placed.Y())),
            static_cast<double>(static_cast<float>(placed.Z())),
        };
        if (index > 0 && index < placed_nodes.size()) placed_nodes[index] = position;
        result.positions.push_back(position);
      }
      result.triangles.push_back({first, first + 1, first + 2});
    }
  }
  return result;
}

// S5 (ruling 25): the located leaves of nonempty compounds, where a leaf is
// any non-compound shape (a compsolid is one leaf).
bool collect_prototype_leaves(const TopoDS_Shape& shape,
                              std::vector<TopoDS_Shape>& leaves) {
  if (shape.IsNull()) return false;
  if (shape.ShapeType() != TopAbs_COMPOUND) {
    leaves.push_back(shape);
    return true;
  }
  TopoDS_Iterator child(shape, true, true);
  if (!child.More()) return false;
  for (; child.More(); child.Next()) {
    if (!collect_prototype_leaves(child.Value(), leaves)) return false;
  }
  return true;
}

// A72's qualified domain, widened by S5 from solids to any leaf: a compound
// of at least two located-disjoint leaves, whose different definitions do
// not share even an unlocated descendant.
bool prototype_copy_eligible(const TopoDS_Shape& source) {
  std::vector<TopoDS_Shape> leaves;
  if (source.ShapeType() != TopAbs_COMPOUND ||
      !collect_prototype_leaves(source, leaves) || leaves.size() < 2 ||
      !disjoint_validation_solids(leaves)) return false;

  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> definitions;
  NCollection_IndexedDataMap<TopoDS_Shape, size_t, TopTools_ShapeMapHasher> owners;
  for (const TopoDS_Shape& leaf : leaves) {
    const TopoDS_Shape definition =
        leaf.Located(TopLoc_Location()).Oriented(TopAbs_FORWARD);
    if (definitions.FindIndex(definition) != 0) continue;
    const int owner = definitions.Add(definition);
    std::vector<TopoDS_Shape> pending{definition};
    while (!pending.empty()) {
      const TopoDS_Shape current = pending.back();
      pending.pop_back();
      const TopoDS_Shape key = current.Located(TopLoc_Location());
      const int index = owners.FindIndex(key);
      if (index != 0) {
        if (owners.FindFromIndex(index) != owner) return false;
        continue;
      }
      owners.Add(key, owner);
      for (TopoDS_Iterator child(current, true, true); child.More(); child.Next())
        pending.push_back(child.Value());
    }
  }
  return true;
}

struct PrototypeReportCopy {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> definitions;
  std::vector<std::unique_ptr<BRepBuilderAPI_Copy>> copies;
  NCollection_IndexedDataMap<TopoDS_Shape, TopoDS_Shape, TopTools_ShapeMapHasher> history;
  TopoDS_Shape shape;

  static bool copied_history_matches(const TopoDS_Shape& source,
                                     const TopoDS_Shape& copied,
                                     const BRepBuilderAPI_Copy& copy) {
    TopoDS_Shape mapped = copy.ModifiedShape(source);
    mapped.Orientation(source.Orientation());
    if (!mapped.IsEqual(copied) || source.IsPartner(copied)) return false;
    TopoDS_Iterator original_child(source, true, true);
    TopoDS_Iterator copied_child(copied, true, true);
    for (; original_child.More() && copied_child.More();
         original_child.Next(), copied_child.Next()) {
      if (!copied_history_matches(original_child.Value(), copied_child.Value(), copy))
        return false;
    }
    return original_child.More() == copied_child.More();
  }

  TopoDS_Shape rebuild(const TopoDS_Shape& source) {
    if (source.ShapeType() != TopAbs_COMPOUND) {
      const TopoDS_Shape definition =
          source.Located(TopLoc_Location()).Oriented(TopAbs_FORWARD);
      int index = definitions.FindIndex(definition);
      if (index == 0) {
        index = definitions.Add(definition);
        copies.emplace_back(std::make_unique<BRepBuilderAPI_Copy>(definition, false, false));
        if (!copies.back()->IsDone() || copies.back()->Shape().IsNull() ||
            !copied_history_matches(definition, copies.back()->Shape(), *copies.back()))
          return {};
      }
      return copies[static_cast<size_t>(index - 1)]->Shape()
          .Located(source.Location()).Oriented(source.Orientation());
    }
    BRep_Builder builder;
    TopoDS_Compound compound;
    builder.MakeCompound(compound);
    for (TopoDS_Iterator child(source, false, false); child.More(); child.Next()) {
      const TopoDS_Shape copied = rebuild(child.Value());
      if (copied.IsNull()) return {};
      builder.Add(compound, copied);
    }
    return compound.Located(source.Location()).Oriented(source.Orientation());
  }

  // Every node rebuild produced (the compounds and their leaves) keeps its
  // source placement bits; a leaf's descendants come from its definition copy.
  bool join(const TopoDS_Shape& source, const TopoDS_Shape& copied,
            bool produced = true) {
    if (source.ShapeType() != copied.ShapeType() ||
        source.Orientation() != copied.Orientation() || source.IsPartner(copied))
      return false;
    if (produced) {
      double original_location[12], copied_location[12];
      placement(original_location, source.Location());
      placement(copied_location, copied.Location());
      for (size_t i = 0; i < 12; ++i)
        if (float_bits(original_location[i]) != float_bits(copied_location[i]))
          return false;
    }
    const int index = history.FindIndex(source);
    if (index != 0) {
      if (!history.FindFromIndex(index).IsSame(copied)) return false;
    } else {
      history.Add(source, copied);
    }
    const bool children_produced = source.ShapeType() == TopAbs_COMPOUND;
    TopoDS_Iterator original_child(source, true, true);
    TopoDS_Iterator copied_child(copied, true, true);
    for (; original_child.More() && copied_child.More();
         original_child.Next(), copied_child.Next()) {
      if (!join(original_child.Value(), copied_child.Value(), children_produced))
        return false;
    }
    return original_child.More() == copied_child.More();
  }

  bool build(const TopoDS_Shape& source) {
    if (!prototype_copy_eligible(source)) return false;
    shape = rebuild(source);
    return !shape.IsNull() && join(source, shape);
  }
};

// Same located face in the same orientation (IsEqual): one report record.
struct OrientedShapeHasher {
  size_t operator()(const TopoDS_Shape& shape) const noexcept {
    return std::hash<TopoDS_Shape>{}(shape);
  }
  bool operator()(const TopoDS_Shape& a, const TopoDS_Shape& b) const noexcept {
    return a.IsEqual(b);
  }
};

// The address part always (F5); integrals and the selector box only when
// measured. Index and query index are per record.
geospec_occt_located_face_facts reported_face(const TopoDS_Face& face,
                                              bool measured) {
  const FaceFacts value = face_facts(face, 0, 0, false, measured);
  geospec_occt_located_face_facts result{};
  result.face = value.facts;
  result.reversed = value.reversed;
  if (!measured) return result;
  // The source XDE face report explicitly excludes triangulation. Whole-shape
  // reporting retains its separate triangulation-enabled source rule.
  Bnd_Box box;
  BRepBndLib::Add(face, box, false);
  if (box.IsVoid()) throw Standard_Failure("Face has no finite reporting bounds.");
  box.Get(result.bounds.min[0], result.bounds.min[1], result.bounds.min[2],
          result.bounds.max[0], result.bounds.max[1], result.bounds.max[2]);
  return result;
}

// Face tables from the source public faces. The report copy shares their
// geometry and locations, so these equal the former copy-mapped records (L2:
// 111,788 whole and 113,812 occurrence faces bit-equal). Records repeat across
// parents and the whole table; each located, oriented face is computed once
// per build (F7). No report generation is needed.
bool build_report_faces(const geospec_occt_document& document, bool measured,
                        ReportData& report, std::string& message) {
  NCollection_DataMap<TopoDS_Shape, geospec_occt_located_face_facts,
                      OrientedShapeHasher>
      records;
  const auto record = [&](const FaceView& face, size_t public_index) {
    const geospec_occt_located_face_facts* known = records.Seek(face.shape);
    geospec_occt_located_face_facts value =
        known != nullptr
            ? *known
            : *records.Bound(face.shape, reported_face(face.shape, measured));
    value.face.index = static_cast<uint32_t>(public_index);
    value.face.query_index = face.query_index;
    return value;
  };
  report.occurrence_faces.reserve(document.occurrences.size());
  for (const OccurrenceFacts& occurrence : document.occurrences) {
    std::vector<geospec_occt_located_face_facts> faces;
    faces.reserve(occurrence.public_faces.size());
    for (size_t index = 0; index < occurrence.public_faces.size(); ++index) {
      if (occurrence.public_faces[index].query_index == 0) {
        message = "Occurrence public face has no unique private query address.";
        return false;
      }
      faces.push_back(record(occurrence.public_faces[index], index));
    }
    report.occurrence_faces.push_back(std::move(faces));
  }
  report.whole_faces.reserve(document.public_faces.size());
  for (size_t index = 0; index < document.public_faces.size(); ++index) {
    if (document.public_faces[index].query_index == 0) {
      message = "Public face has no unique private query address.";
      return false;
    }
    report.whole_faces.push_back(record(document.public_faces[index], index));
  }
  return true;
}

// The mesh facet's isolated meshed shape, its soup's only source (F1 moved
// the facts to the source shape): the prototype share copy when eligible (S5),
// else a whole copy, so meshing never writes onto the admitted faces. A
// dedicated caller may select the mesher's parallel mode under its grant.
bool build_report_generation(const geospec_occt_document& document,
                             TopoDS_Shape& generation, std::string& message,
                             bool run_parallel) {
  std::optional<PrototypeReportCopy> prototype;
  prototype.emplace();
  // No report address reads the generation any more (F5, F1), so the XDE
  // address mapping it once had to resolve is not checked.
  const bool use_prototype = prototype->build(document.shape);
  // The copy histories stay alive through meshing, as before; only the
  // meshed shape outlives this call.
  std::unique_ptr<BRepBuilderAPI_Copy> copy;
  if (!use_prototype) {
    prototype.reset();
    copy = std::make_unique<BRepBuilderAPI_Copy>(document.shape, false, false);
    if (!copy->IsDone() || copy->Shape().IsNull()) {
      message = "OCCT report shape copy failed.";
      return false;
    }
  }
  generation = use_prototype ? prototype->shape : copy->Shape();
  constexpr double pi = 3.141592653589793238462643383279502884;
  mesh_shape(generation, 0.01, 15.0 * pi / 180.0, run_parallel);
  return true;
}

geospec_occt_validity_facts compute_validity(const geospec_occt_document& document,
                                             std::string& reason) {
  const TopoDS_Shape& shape = document.shape;
  geospec_occt_validity_facts result{};
  // The source proof uses the same analyzer settings. Every Boolean is
  // non-destructive, so it holds for the document's life; a failed proof
  // already carries its analyzer's per-solid statuses (V3).
  const SourceValidity& source = source_validity(document);
  result.valid = source.valid ? 1 : 0;
  result.same_parameter = 1;
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

  // V1: free bounds are the facet's open edges; closed shells are closed and
  // manifold. Degenerated edges and edges in no face are not free bounds.
  const ClosureFacet& closure = source_closure(document);
  result.free_bounds = closure.open_edges;
  result.open_edge_count = closure.open_edges;
  result.nonmanifold_edge_count = closure.nonmanifold_edges;
  result.closed_shells = closure.shells_closed ? 1 : 0;
  for (TopExp_Explorer explorer(shape, TopAbs_WIRE); explorer.More();
       explorer.Next()) {
    if (!TopoDS::Wire(explorer.Current()).Closed()) result.closed_wires = 0;
  }
  for (TopExp_Explorer explorer(shape, TopAbs_SOLID); explorer.More();
       explorer.Next()) {
    ++result.solid_count;
  }
  result.invalid_solid_count = source.invalid_solid_count;
  if (result.solid_count == 0) {
    result.closed_solids = 0;
    reason = "no-closed-solid";
  } else if (result.invalid_solid_count != 0) {
    result.closed_solids = 0;
    reason = "invalid-solid";
  } else if (result.open_edge_count != 0) {
    result.closed_solids = 0;
    reason = "open-edge";
  } else if (!result.closed_shells) {
    result.closed_solids = 0;
    reason = "non-manifold-edge";
  }
  if (!result.valid && reason.empty()) reason = "invalid-shape";
  return result;
}

int point_state(TopAbs_State state) {
  if (state == TopAbs_IN) return GEOSPEC_OCCT_POINT_IN;
  if (state == TopAbs_ON) return GEOSPEC_OCCT_POINT_ON;
  return GEOSPEC_OCCT_POINT_OUT;
}

}  // namespace

int geospec_occt_thread_pool_width(int requested, int* actual,
                                   geospec_occt_string* error) noexcept {
  if (requested < 1 || requested > OSD_Parallel::NbLogicalProcessors() ||
      actual == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Thread-pool width must be between one and the logical CPU count, including the caller.",
                error);
  }
  return guarded(error, [&]() -> int {
    static std::once_flag first_init;
    static int first_requested = 0;
    static int first_actual = 0;
    std::call_once(first_init, [&] {
      first_requested = requested;
      first_actual = OSD_ThreadPool::DefaultPool(requested)->NbThreads();
    });
    *actual = first_actual;
    if (first_requested != requested || first_actual != requested) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "OCCT thread pool was initialized with a different width.",
                  error);
    }
    return GEOSPEC_OCCT_OK;
  });
}

// Pin workers outside the caller-inclusive grant for the entire inner call.
// OCCT's For/Boolean launchers pass explicit range sizes, so changing the
// pool's default-launch width would not cap them. A retained Launcher locks
// the unused workers without starting jobs, including across nested loops.
static int dedicated_pool_scope(
    int grant_width, int* used_parallel,
    std::unique_ptr<OSD_ThreadPool::Launcher>& reservation,
    geospec_occt_string* error) {
  *used_parallel = 0;
  if (grant_width == 0) return GEOSPEC_OCCT_OK;
  const occ::handle<OSD_ThreadPool>& pool = OSD_ThreadPool::DefaultPool();
  const int cap = pool->NbThreads();
  int actual = 0;
  if (grant_width < 1 || grant_width > cap ||
      geospec_occt_thread_pool_width(cap, &actual, nullptr) != GEOSPEC_OCCT_OK ||
      (grant_width >= 2 && !OSD_Parallel::ToUseOcctThreads())) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "OCCT grant exceeds the owned pool or OCCT parallelism is unavailable.",
                error);
  }
  const int unused_workers = cap - grant_width;
  if (unused_workers > 0) {
    reservation = std::make_unique<OSD_ThreadPool::Launcher>(
        *pool, unused_workers + 1);
    if (reservation->NbThreads() != unused_workers + 1) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "OCCT could not reserve every worker outside the grant.", error);
    }
  }
  *used_parallel = grant_width >= 2 ? 1 : 0;
  return GEOSPEC_OCCT_OK;
}

// The STEP read profile, pinned field by field to the Interface_Static values
// admission read before, so a header-default change cannot move bytes. Never
// default-construct it: ReadSubshapeNames is false there and drops subshape
// names. OnNoBRep keeps a file's tessellation off exact faces (policy §16).
// The XCAF mode fields are inert on this reader; the reader setters govern.
static DESTEP_Parameters step_read_parameters() {
  DESTEP_Parameters p;
  p.ReadBSplineContinuity = DESTEP_Parameters::ReadMode_BSplineContinuity_C0;
  p.ReadPrecisionMode = DESTEP_Parameters::ReadMode_Precision_File;
  p.ReadPrecisionVal = 1.e-3;  // used when a file has no length uncertainty
  p.ReadMaxPrecisionMode = DESTEP_Parameters::ReadMode_MaxPrecision_Preferred;
  p.ReadMaxPrecisionVal = 1.0;
  p.ReadSameParamMode = false;
  p.ReadSurfaceCurveMode = DESTEP_Parameters::ReadMode_SurfaceCurve_Default;
  p.EncodeRegAngle = 0.57295779513082323;  // 0.01 rad in degrees; unread on STEP
  p.AngleUnit = DESTEP_Parameters::AngleUnitMode_File;
  p.ReadProductMode = true;
  p.ReadProductContext = DESTEP_Parameters::ReadMode_ProductContext_All;
  p.ReadShapeRepr = DESTEP_Parameters::ReadMode_ShapeRepr_All;
  p.ReadTessellated = DESTEP_Parameters::RWMode_Tessellated_OnNoBRep;
  p.ReadAssemblyLevel = DESTEP_Parameters::ReadMode_AssemblyLevel_All;
  p.ReadRelationship = true;
  p.ReadShapeAspect = true;
  p.ReadConstrRelation = false;
  p.ReadSubshapeNames = true;
  p.ReadCodePage = Resource_FormatType_UTF8;
  p.ReadNonmanifold = false;
  p.ReadIdeas = false;
  p.ReadAllShapes = false;
  p.ReadRootTransformation = true;
  return p;
}

// The authored healing profile (ruling 1): shape processing completes the
// translation (pcurves, same-parameter, seams, wire order) but never repairs
// authored geometry, so an invalid model is evaluated as the model it is. The
// 13 repair modes and face/shell reorientation are off, and a solid with an
// open shell stays the open solid it was authored as instead of becoming a
// shell. Every other field keeps the STEP default an empty map would get.
static DE_ShapeFixParameters authored_fix_parameters() {
  using Mode = DE_ShapeFixParameters::FixMode;
  DE_ShapeFixParameters p = DESTEP_Parameters::GetDefaultShapeFixParameters();
  p.FixSelfIntersectionMode = Mode::NotFix;
  p.FixSelfIntersectingEdgeMode = Mode::NotFix;
  p.FixIntersectingEdgesMode = Mode::NotFix;
  p.FixNonAdjacentIntersectingEdgesMode = Mode::NotFix;
  p.FixIntersectingWiresMode = Mode::NotFix;
  p.FixSmallMode = Mode::NotFix;
  p.FixSmallAreaWireMode = Mode::NotFix;
  p.RemoveSmallAreaFaceMode = Mode::NotFix;
  p.FixNotchedEdgesMode = Mode::NotFix;
  p.FixLackingMode = Mode::NotFix;
  p.FixConnectedMode = Mode::NotFix;
  p.FixLoopWiresMode = Mode::NotFix;
  p.FixSplitFaceMode = Mode::NotFix;
  p.FixFaceOrientationMode = Mode::NotFix;
  p.FixShellOrientationMode = Mode::NotFix;
  p.CreateOpenSolidMode = Mode::Fix;
  return p;
}

// Initialize the data-exchange globals once while the admission lock is held.
// OCCT also accesses mutable globals during transfer, so warm-up alone does
// not make concurrent reads safe.
static void step_reader_warmup() {
  static std::once_flag once;
  std::call_once(once, [] {
    const STEPCAFControl_Reader warmup;
    // No edge-continuity consumer reads the regularity flags: skip encoding.
    Interface_Static::SetRVal("read.encoderegularity.angle", 0.0);
  });
}

// ReadStream's SetModel -> ComputeGraph runs the semantic ComputeCheck, which
// nothing reads, unless the session has finished one. A finished ComputeGraph
// on a one-entity seed leaves it finished; the real SetModel re-arms it.
static void skip_semantic_check(STEPCAFControl_Reader& reader) {
  const occ::handle<XSControl_WorkSession> session = reader.ChangeReader().WS();
  const occ::handle<StepData_StepModel> seed = new StepData_StepModel;
  seed->AddEntity(new StepBasic_ApplicationContext);
  session->SetModel(seed);
  session->ComputeGraph(true);
}

// Transfer fails only when no shape results. An entity that fails on its own
// (an exception, a dead loop, a surface it cannot build) is recorded as a fail
// on a transfer binder while the rest transfers without it. Returns the first
// recorded fail as "<entity type>: <text>", or its text alone when OCCT
// recorded it against no entity (a face surface that did not read is null).
static std::optional<std::string> first_transfer_fail(STEPCAFControl_Reader& reader) {
  const auto transfer_reader = reader.ChangeReader().WS()->TransferReader();
  const auto process = transfer_reader.IsNull()
                           ? occ::handle<Transfer_TransientProcess>{}
                           : transfer_reader->TransientProcess();
  for (int index = 1; !process.IsNull() && index <= process->NbMapped(); ++index) {
    const occ::handle<Transfer_Binder> binder = process->MapItem(index);
    if (binder.IsNull() || binder->Check()->NbFails() == 0) continue;
    std::string text = binder->Check()->CFail(1, false);
    text.erase(0, text.find_first_not_of(' '));  // OCCT texts start with a space
    const occ::handle<Standard_Transient>& entity = process->Mapped(index);
    return entity.IsNull() ? text : std::string(entity->DynamicType()->Name()) + ": " + text;
  }
  return std::nullopt;
}

int geospec_occt_open_step(const uint8_t* bytes, size_t length,
                           geospec_occt_document** output,
                           geospec_occt_string* error) noexcept {
  if (bytes == nullptr || length == 0 || output == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "STEP bytes/out is empty or null.", error);
  }
  *output = nullptr;
  return guarded(error, [&]() -> int {
    // OCCT's STEP reader and transfer use process globals, including after
    // first use. Keep the lock through reader destruction on every exit path.
    static std::mutex admission_mutex;
    const std::lock_guard<std::mutex> admission_lock(admission_mutex);
    // Validation can initialize the global pool even with parallelism off.
    // Default to one physical thread unless an explicit earlier grant won.
    int pool_width = 0;
    const int pool_status =
        geospec_occt_thread_pool_width(1, &pool_width, nullptr);
    if (pool_status != GEOSPEC_OCCT_OK && pool_status != GEOSPEC_OCCT_UNSUPPORTED)
      return pool_status;
    step_reader_warmup();
    STEPCAFControl_Reader reader;
    reader.SetNameMode(true);
    // GDT and layer reading create consumed subshape labels, so they stay on.
    reader.SetGDTMode(true);
    // No reader of these XCAF attributes: re-enable a mode when one exists.
    reader.SetPropsMode(false);
    reader.SetMatMode(false);
    reader.SetViewMode(false);
    reader.SetMetaMode(false);
    reader.SetColorMode(false);
    skip_semantic_check(reader);
    // Zero-copy: the caller's bytes stay borrowed until ReadStream has parsed them.
    Standard_ArrayStreamBuffer buffer(reinterpret_cast<const char*>(bytes), length);
    std::istream stream(&buffer);
    if (reader.ReadStream("memory.step", step_read_parameters(), stream) != IFSelect_RetDone) {
      return fail(GEOSPEC_OCCT_READ_FAILED, "STEP read failed.", error);
    }
    // ReadStream replaces the transfer actor, so parameters set before it land
    // on nothing; set now they reach the actor that Transfer uses.
    reader.SetShapeFixParameters(authored_fix_parameters(), XSAlgo_ShapeProcessor::ParameterMap());

    auto result = std::make_unique<geospec_occt_document>();
    result->schema = step_schema(reader);
    result->source_byte_length = length;
    result->document = new TDocStd_Document("BinXCAF");
    XCAFDoc_DocumentTool::Set(result->document->Main());

    NCollection_Sequence<TCollection_AsciiString> lengths;
    NCollection_Sequence<TCollection_AsciiString> angles;
    NCollection_Sequence<TCollection_AsciiString> solid_angles;
    reader.ChangeReader().FileUnits(lengths, angles, solid_angles);
    result->all_source_length_contexts_mm =
        all_source_length_contexts_are_millimeters(reader.ChangeReader());
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
    // A partial transfer is a degraded subject, never evidence (policy §16).
    if (const auto lost = first_transfer_fail(reader)) {
      return fail(GEOSPEC_OCCT_TRANSFER_FAILED, "STEP transfer lost an entity: " + *lost, error);
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

    NCollection_Sequence<TDF_Label> products;
    shape_tool->GetShapes(products);
    const ProductIdentityIndex identity = product_identity(reader);
    result->products.reserve(static_cast<size_t>(products.Length()));
    for (const TDF_Label& product : products) {
      result->products.push_back(
          {label_entry(product), resolved_product_name(product, identity)});
    }
    const auto product_indices = index_products(result->products);
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
                                     identity, product_indices,
                                     result->occurrences);
      }
      append_occurrences(shape_tool, root, XCAFDoc_ShapeTool::GetLocation(root),
                         "", {}, -1, identity, product_indices,
                         result->occurrences);
      ++root_index;
    }
    prepare_source_associations(reader, shape_tool, result->occurrences,
                                result->source_faces);
    // The private face map also keys the named-subshape and datum lookups.
    FaceLookups lookups;
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>& faces =
        lookups.whole.map;
    TopExp::MapShapes(result->shape, TopAbs_FACE, faces);
    result->faces.reserve(static_cast<size_t>(faces.Extent()));
    for (int index = 1; index <= faces.Extent(); ++index) {
      FaceFacts face;
      face.shape = TopoDS::Face(faces(index));
      TopLoc_Location location;
      if (BRep_Tool::Surface(face.shape, location).IsNull()) {
        ++result->surfaceless_face_count;
      }
      result->faces.push_back(std::move(face));
    }
    result->public_faces.reserve(static_cast<size_t>(faces.Extent()));
    for (TopExp_Explorer explorer(result->shape, TopAbs_FACE); explorer.More();
         explorer.Next()) {
      const TopoDS_Face face = TopoDS::Face(explorer.Current());
      const int query_index =
          exact_mapped_face_index(faces, result->faces, face);
      lookups.whole.add(face, result->public_faces.size());
      result->public_faces.push_back(
          {query_index > 0 ? static_cast<uint32_t>(query_index) : 0, face});
    }
    lookups.products.resize(static_cast<size_t>(products.Length()));
    lookups.occurrences.resize(result->occurrences.size());
    append_subshapes(shape_tool, products, result->occurrences,
                     result->faces, result->public_faces, lookups,
                     result->subshapes);
    append_semantic_datums(reader, shape_tool, products, result->occurrences,
                           result->public_faces, lookups,
                           result->semantic_datums);
    append_datum_placements(reader, result->occurrences,
                            result->datum_placements);
    result->occurrence_bounds.resize(result->occurrences.size());
    result->occurrence_edge_counts.resize(result->occurrences.size());
    result->query_faces.resize(result->faces.size());

    *output = result.release();
    return GEOSPEC_OCCT_OK;
  });
}

void geospec_occt_release(geospec_occt_document* document) noexcept { delete document; }

size_t geospec_occt_triangulated_face_count(
    const geospec_occt_document* document) noexcept {
  if (document == nullptr) return 0;
  size_t count = 0;
  for (const FaceFacts& face : document->faces) {
    TopLoc_Location location;
    if (!BRep_Tool::Triangulation(face.shape, location).IsNull()) ++count;
  }
  return count;
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
    // The qualified domains are one solid with six (box) or three (cylinder)
    // faces. Refuse on those counts before validation, the classifier and the
    // tolerance scans; the wall matcher maps every refusal to one fixed text.
    ShapeIndex solids, counted, faces, edges;
    TopExp::MapShapes(document->shape, TopAbs_SOLID, solids);
    TopExp::MapShapes(document->shape, TopAbs_FACE, counted);
    if (solids.Extent() != 1 || (counted.Extent() != 6 && counted.Extent() != 3)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "Continuous wall requires one solid with six or three faces.",
                  error);
    }
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
    size_t* surfaceless_face_count, int* all_source_length_contexts_mm,
    geospec_occt_string* source_unit,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || unit_to_millimeters == nullptr ||
      occurrence_count == nullptr || surfaceless_face_count == nullptr ||
      all_source_length_contexts_mm == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/admission output is null.", error);
  }
  *unit_to_millimeters = document->source_unit_to_millimeters;
  *occurrence_count = document->occurrences.size();
  *surfaceless_face_count = document->surfaceless_face_count;
  *all_source_length_contexts_mm = document->all_source_length_contexts_mm ? 1 : 0;
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
    const geospec_occt_document* document, uint32_t facets,
    geospec_occt_report_sizes* sizes,
    geospec_occt_string* error) noexcept {
  int used_parallel = 0;
  return geospec_occt_report_prepare_dedicated(document, facets, 0,
                                               &used_parallel, sizes, error);
}

int geospec_occt_report_prepare_dedicated(
    const geospec_occt_document* document, uint32_t facets, int grant_width,
    int* used_parallel, geospec_occt_report_sizes* sizes,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || sizes == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/report sizes output is null.", error);
  }
  if (used_parallel == nullptr || grant_width < 0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Report grant arguments are invalid.", error);
  }
  constexpr uint32_t shape_facets =
      GEOSPEC_OCCT_REPORT_VOLUME | GEOSPEC_OCCT_REPORT_AREA |
      GEOSPEC_OCCT_REPORT_BOUNDS | GEOSPEC_OCCT_REPORT_COUNTS;
  constexpr uint32_t granted_facets =
      GEOSPEC_OCCT_REPORT_MESH | GEOSPEC_OCCT_REPORT_BOUNDS;
  constexpr uint32_t all_facets = GEOSPEC_OCCT_REPORT_MESH | shape_facets |
                                  GEOSPEC_OCCT_REPORT_FACES |
                                  GEOSPEC_OCCT_REPORT_FACE_MEASURES;
  if (facets == 0 || (facets & ~all_facets) != 0 ||
      ((facets & GEOSPEC_OCCT_REPORT_FACE_MEASURES) != 0 &&
       (facets & GEOSPEC_OCCT_REPORT_FACES) == 0)) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Report facets are invalid.",
                error);
  }
  document->report.reset();
  return guarded(error, [&]() -> int {
    *used_parallel = 0;
    std::string message;
    ReportData report;
    report.facets = facets;
    // F9 after F1: a MESH call's copy+mesh generation; its soup is its one
    // consumer, so it is released right after the soup is read.
    TopoDS_Shape generation;
    if ((facets & granted_facets) != 0) {
      // F11 and ruling 24: the grant's worker reservation covers only the
      // copy+mesh build and the per-face box pass.
      // ponytail: the serial copy (<= 0.16 s on the corpus) stays inside it.
      std::unique_ptr<OSD_ThreadPool::Launcher> reservation;
      const int scope_status = dedicated_pool_scope(
          grant_width, used_parallel, reservation, error);
      if (scope_status != GEOSPEC_OCCT_OK) return scope_status;
      if ((facets & GEOSPEC_OCCT_REPORT_MESH) != 0) {
        if (!build_report_generation(*document, generation, message,
                                     *used_parallel != 0)) {
          return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
        }
        ++document->report_generation_builds;
      }
      if ((facets & GEOSPEC_OCCT_REPORT_BOUNDS) != 0 && *used_parallel != 0 &&
          (document->source_shape_parts & GEOSPEC_OCCT_REPORT_BOUNDS) == 0) {
        prefill_face_boxes(*document);
      }
    }
    if ((facets & GEOSPEC_OCCT_REPORT_MESH) != 0) {
      report.mesh = report_triangle_soup(generation);
      generation.Nullify();
    }
    if ((facets & shape_facets) != 0) {
      report.shape = source_shape_facts(*document, facets & shape_facets);
    }
    if ((facets & GEOSPEC_OCCT_REPORT_FACES) != 0 &&
        !build_report_faces(*document,
                            (facets & GEOSPEC_OCCT_REPORT_FACE_MEASURES) != 0,
                            report, message)) {
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
    sizes->occurrence_count = report.occurrence_faces.size();
    sizes->whole_face_count = report.whole_faces.size();
    sizes->occurrence_face_count = occurrence_face_count;
    sizes->position_count = report.mesh.positions.size();
    sizes->triangle_count = report.mesh.triangles.size();
    sizes->shape_bytes =
        (facets & shape_facets) != 0 ? sizeof(report.shape) : 0;
    if (!bytes(report.whole_faces.size(), sizeof(geospec_occt_located_face_facts),
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

size_t geospec_occt_report_generation_builds(
    const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->report_generation_builds;
}

int geospec_occt_report_shape_facts(const geospec_occt_document* document,
                                    geospec_occt_shape_facts* shape,
                                    geospec_occt_string* error) noexcept {
  if (document == nullptr || !document->report.has_value() ||
      (document->report->facets &
       (GEOSPEC_OCCT_REPORT_VOLUME | GEOSPEC_OCCT_REPORT_AREA |
        GEOSPEC_OCCT_REPORT_BOUNDS | GEOSPEC_OCCT_REPORT_COUNTS)) == 0 ||
      shape == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Prepared report shape facts output is unavailable.", error);
  }
  *shape = document->report->shape;
  return GEOSPEC_OCCT_OK;
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
      (document->report->facets & GEOSPEC_OCCT_REPORT_MESH) == 0 ||
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

size_t geospec_occt_occurrence_count(const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->occurrences.size();
}

static int write_occurrence(const geospec_occt_document* document, size_t index,
                            bool with_bounds,
                            geospec_occt_occurrence_facts* occurrence,
                            geospec_occt_string* label,
                            geospec_occt_string* product_label,
                            geospec_occt_string* name,
                            geospec_occt_string* error) noexcept {
  if (document == nullptr || occurrence == nullptr || index >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Occurrence index/output is invalid.", error);
  }
  return guarded(error, [&]() -> int {
    const OccurrenceFacts& value = document->occurrences[index];
    geospec_occt_occurrence_facts facts = value.facts;
    if (with_bounds) facts.bounds = source_occurrence_bounds(*document, index);
    *occurrence = facts;
    int status = write_string(value.label, label);
    status = copy_result(status, write_string(value.product_label, product_label));
    return copy_result(status, write_string(value.name, name));
  });
}

int geospec_occt_occurrence(const geospec_occt_document* document, size_t index,
                            geospec_occt_occurrence_facts* occurrence,
                            geospec_occt_string* label,
                            geospec_occt_string* product_label,
                            geospec_occt_string* name,
                            geospec_occt_string* error) noexcept {
  return write_occurrence(document, index, true, occurrence, label,
                          product_label, name, error);
}

int geospec_occt_occurrence_structure(
    const geospec_occt_document* document, size_t index,
    geospec_occt_occurrence_facts* occurrence, geospec_occt_string* label,
    geospec_occt_string* product_label, geospec_occt_string* name,
    geospec_occt_string* error) noexcept {
  return write_occurrence(document, index, false, occurrence, label,
                          product_label, name, error);
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
  return guarded(error, [&]() -> int {
    *face = source_query_face(*document, query_index).facts;
    face->index = static_cast<uint32_t>(index);
    face->query_index = query_index;
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_face_location(const geospec_occt_document* document,
                               size_t index, geospec_occt_bounds* out_bounds,
                               int* out_reversed,
                               geospec_occt_string* error) noexcept {
  if (document == nullptr || out_reversed == nullptr ||
      index >= document->public_faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Face location index/output is invalid.", error);
  }
  const uint32_t query_index = document->public_faces[index].query_index;
  if (query_index == 0) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED,
                "Public face has no unique private query address.", error);
  }
  return guarded(error, [&]() -> int {
    // The AddOptimal box only when requested (F6), from the memo.
    if (out_bounds != nullptr) {
      *out_bounds = source_query_bounds(*document, query_index);
    }
    *out_reversed = source_query_face(*document, query_index).reversed;
    return GEOSPEC_OCCT_OK;
  });
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

int geospec_occt_occurrence_edge_count(const geospec_occt_document* document,
                                       uint32_t occurrence, size_t* count,
                                       geospec_occt_string* error) noexcept {
  if (document == nullptr || count == nullptr ||
      occurrence >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence edge-count index/output is invalid.", error);
  }
  return guarded(error, [&]() -> int {
    *count = source_occurrence_edge_count(*document, occurrence);
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_validity(const geospec_occt_document* document,
                          geospec_occt_validity_facts* validity,
                          geospec_occt_string* reason,
                          geospec_occt_string* error) noexcept {
  int used_parallel = 0;
  return geospec_occt_validity_dedicated(
      document, 0, &used_parallel, validity, reason, error);
}

int geospec_occt_validity_dedicated(
    const geospec_occt_document* document, int grant_width,
    int* used_parallel, geospec_occt_validity_facts* validity,
    geospec_occt_string* reason, geospec_occt_string* error) noexcept {
  if (document == nullptr || validity == nullptr || used_parallel == nullptr ||
      grant_width < 0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/validity control is invalid.", error);
  }
  return guarded(error, [&]() -> int {
    std::unique_ptr<OSD_ThreadPool::Launcher> reservation;
    const int scope_status = dedicated_pool_scope(
        grant_width, used_parallel, reservation, error);
    if (scope_status != GEOSPEC_OCCT_OK) return scope_status;
    // F11: validity reads the serial source proof and closure facet, so it
    // uses no workers and holds no reservation.
    reservation.reset();
    *used_parallel = 0;
    std::string message;
    *validity = compute_validity(*document, message);
    return write_string(message, reason);
  });
}

int geospec_occt_validity_closure(const geospec_occt_document* document,
                                  geospec_occt_closure_facts* closure,
                                  geospec_occt_string* error) noexcept {
  if (document == nullptr || closure == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/closure output is null.", error);
  }
  return guarded(error, [&]() -> int {
    const ClosureFacet& facet = source_closure(*document);
    *closure = {};
    closure->shell_count = facet.shells;
    closure->free_face_count = facet.free_faces;
    closure->open_edge_count = facet.open_edges;
    closure->nonmanifold_edge_count = facet.nonmanifold_edges;
    closure->failing_group_count = facet.failing.size();
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_validity_closure_group(
    const geospec_occt_document* document, size_t index,
    geospec_occt_closure_group* group, uint32_t* occurrences,
    size_t capacity, geospec_occt_string* error) noexcept {
  if (document == nullptr || group == nullptr ||
      (occurrences == nullptr && capacity != 0)) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/closure group output is invalid.", error);
  }
  return guarded(error, [&]() -> int {
    const ClosureFacet& facet = attributed_closure(*document);
    if (index >= facet.failing.size()) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                  "Closure group index is out of range.", error);
    }
    const ClosureGroup& failing = facet.failing[index];
    if (failing.occurrences.size() > capacity) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                  "Closure group occurrence capacity is exhausted.", error);
    }
    *group = {};
    group->free_faces = failing.key.IsNull() ? 1 : 0;
    group->open_edge_count = failing.open;
    group->nonmanifold_edge_count = failing.nonmanifold;
    group->sample_count = failing.sample_count;
    for (uint32_t sample = 0; sample < failing.sample_count; ++sample) {
      const BRepAdaptor_Curve curve(
          TopoDS::Edge(failing.samples[sample].Moved(failing.instance)));
      const double first = curve.FirstParameter(), last = curve.LastParameter();
      geospec_occt_closure_edge_sample& output = group->samples[sample];
      output.face_uses = failing.sample_uses[sample];
      point(output.start, curve.Value(first));
      point(output.end, curve.Value(last));
      point(output.center, curve.Value((first + last) / 2.0));
    }
    std::copy(failing.occurrences.begin(), failing.occurrences.end(),
              occurrences);
    group->occurrence_count = failing.occurrences.size();
    return GEOSPEC_OCCT_OK;
  });
}

// M2 narrow phase: the bodies of exact connected components and their
// distance verdicts. Face boxes come from the per-located-face memo, so the
// body boxes fold exactly as bounds() does.
struct geospec_occt_component_bodies {
  struct Body {
    TopoDS_Shape shape;
    std::vector<TopoDS_Face> faces;
    std::vector<geospec_occt_bounds> boxes;
    geospec_occt_component_body facts{};
  };
  const geospec_occt_document* document = nullptr;
  std::vector<Body> bodies;
  size_t face_count = 0;
};

namespace {

// Ruling 28: every piece of component work asks the caller's charge callback
// before it runs. A unit is about 20 us of one core at load 50-70, fitted per
// kind of work on the 140 corpus STEP files (W2-COMP a2 calib.tsv, where the
// gearboxes' candidate pairs land within 1% of each other in us per unit).
// The costs that scale with the geometry are a face's edges (UV bounds and
// point classification walk them) and free-form curves and surfaces (their
// extrema and bounds sample or optimize).
constexpr uint64_t kComponentBoxTestsPerUnit = 1024;

uint32_t component_edge_count(const TopoDS_Shape& face) {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> edges;
  TopExp::MapShapes(face, TopAbs_EDGE, edges);
  return static_cast<uint32_t>(edges.Extent());
}

// A face's box (BRepBndLib::AddOptimal) walks its edges on a plane,
// cylinder, cone, extrusion or ruled B-spline surface and optimizes over any
// other surface.
uint64_t component_box_units(const TopoDS_Face& face) {
  const uint64_t edges = component_edge_count(face);
  const BRepAdaptor_Surface surface(face, false);
  switch (surface.GetType()) {
    case GeomAbs_Plane:
    case GeomAbs_Cylinder:
    case GeomAbs_Cone:
    case GeomAbs_SurfaceOfExtrusion:
      return 1 + edges / 8;
    case GeomAbs_BSplineSurface: {
      const auto spline = surface.BSpline();
      const bool ruled = (spline->UDegree() == 1 && spline->NbUKnots() == 2) ||
                         (spline->VDegree() == 1 && spline->NbVKnots() == 2);
      return ruled ? 8 + edges / 8 : 256;
    }
    case GeomAbs_Sphere:
      return 128;
    case GeomAbs_Torus:
      return 1024;
    default:
      return 256;
  }
}

// The largest tolerance of a face, its edges and its vertices. The exact
// distances measure vertex points and edge curves, which may lie that far off
// the face's surface, and so outside its memo box.
double component_face_tolerance(const TopoDS_Face& face) {
  double tolerance = BRep_Tool::Tolerance(face);
  for (TopExp_Explorer edge(face, TopAbs_EDGE); edge.More(); edge.Next()) {
    tolerance = std::max(tolerance, BRep_Tool::Tolerance(TopoDS::Edge(edge.Current())));
  }
  for (TopExp_Explorer vertex(face, TopAbs_VERTEX); vertex.More(); vertex.Next()) {
    tolerance =
        std::max(tolerance, BRep_Tool::Tolerance(TopoDS::Vertex(vertex.Current())));
  }
  return tolerance;
}

// A solid classifier builds one intersector per face (UV bounds over its
// edges, a sampled polyhedron on free-form surfaces).
uint64_t component_classifier_units(const TopoDS_Face& face) {
  const uint64_t edges = component_edge_count(face);
  switch (BRepAdaptor_Surface(face, false).GetType()) {
    case GeomAbs_Plane:
    case GeomAbs_Cylinder:
    case GeomAbs_Cone:
    case GeomAbs_Sphere:
    case GeomAbs_Torus:
      return 1 + edges / 8;
    default:
      return 17 + edges / 8;
  }
}

// One vertex, edge or face of a listed face set, decomposed and boxed as the
// exact shape distance decomposes and boxes its shapes, with its cost class:
// a vertex; a line, conic or free-form edge; a plane, elementary or
// free-form face.
struct ComponentPiece {
  TopoDS_Shape shape;
  Bnd_Box box;
  double low = 0.0;
  double high = 0.0;
  int kind = 0;
  uint32_t edges = 0;
  uint32_t edge_poles = 0;
};

int component_curve_kind(const TopoDS_Edge& edge) {
  if (BRep_Tool::Degenerated(edge)) return 1;
  switch (BRepAdaptor_Curve(edge).GetType()) {
    case GeomAbs_Line:
      return 1;
    case GeomAbs_Circle:
    case GeomAbs_Ellipse:
    case GeomAbs_Hyperbola:
    case GeomAbs_Parabola:
      return 2;
    default:
      return 3;
  }
}

int component_surface_kind(const TopoDS_Face& face) {
  switch (BRepAdaptor_Surface(face, false).GetType()) {
    case GeomAbs_Plane:
      return 4;
    case GeomAbs_Cylinder:
    case GeomAbs_Cone:
    case GeomAbs_Sphere:
    case GeomAbs_Torus:
      return 5;
    default:
      return 6;
  }
}

// Units of one pair's extrema by the pieces' classes (vertex, line, conic,
// free-form edge, plane, elementary, free-form face), before the faces'
// edges and edge poles.
constexpr uint16_t kComponentPairUnits[7][7] = {
    {1, 1, 1, 1, 1, 16, 64},       {1, 1, 1, 128, 1, 16, 64},
    {1, 1, 512, 128, 4, 32, 64},   {1, 128, 128, 64, 64, 64, 128},
    {1, 1, 4, 64, 1, 64, 64},      {16, 16, 32, 64, 64, 64, 64},
    {64, 64, 64, 128, 64, 64, 64},
};

std::vector<ComponentPiece> component_pieces(
    const geospec_occt_component_bodies::Body& body, const uint32_t* faces,
    size_t count) {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> vertices, edges, listed;
  for (size_t index = 0; index < count; ++index) {
    const TopoDS_Face& face = body.faces[faces[index]];
    TopExp::MapShapes(face, TopAbs_VERTEX, vertices);
    TopExp::MapShapes(face, TopAbs_EDGE, edges);
    listed.Add(face);
  }
  std::vector<ComponentPiece> pieces;
  for (const auto* map : {&vertices, &edges, &listed}) {
    for (int index = 1; index <= map->Extent(); ++index) {
      ComponentPiece piece;
      piece.shape = (*map)(index);
      BRepBndLib::Add(piece.shape, piece.box);
      if (piece.box.IsVoid()) continue;
      double ymin, zmin, ymax, zmax;
      piece.box.Get(piece.low, ymin, zmin, piece.high, ymax, zmax);
      if (piece.shape.ShapeType() == TopAbs_EDGE) {
        piece.kind = component_curve_kind(TopoDS::Edge(piece.shape));
      } else if (piece.shape.ShapeType() == TopAbs_FACE) {
        piece.kind = component_surface_kind(TopoDS::Face(piece.shape));
        NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> bounding;
        TopExp::MapShapes(piece.shape, TopAbs_EDGE, bounding);
        piece.edges = static_cast<uint32_t>(bounding.Extent());
        for (int edge = 1; edge <= bounding.Extent(); ++edge) {
          if (BRep_Tool::Degenerated(TopoDS::Edge(bounding(edge)))) continue;
          const BRepAdaptor_Curve curve(TopoDS::Edge(bounding(edge)));
          if (curve.GetType() == GeomAbs_BSplineCurve ||
              curve.GetType() == GeomAbs_BezierCurve) {
            piece.edge_poles += static_cast<uint32_t>(curve.NbPoles());
          }
        }
      }
      pieces.push_back(std::move(piece));
    }
  }
  return pieces;
}

uint64_t component_pair_units(const ComponentPiece& left,
                              const ComponentPiece& right) {
  return kComponentPairUnits[left.kind][right.kind] + (left.edges + right.edges) / 4 +
         (left.edge_poles + right.edge_poles) / 4;
}

// One vertex per vertex-connected set of faces: a set whose faces all lie
// beyond the tolerance of another solid's boundary is wholly inside or wholly
// outside that solid, so one vertex classifies all of its vertices.
std::vector<gp_Pnt> component_points(const TopoDS_Shape& shape) {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faces;
  TopExp::MapShapes(shape, TopAbs_FACE, faces);
  NCollection_IndexedDataMap<TopoDS_Shape, NCollection_List<TopoDS_Shape>,
                             TopTools_ShapeMapHasher>
      vertex_faces;
  TopExp::MapShapesAndAncestors(shape, TopAbs_VERTEX, TopAbs_FACE, vertex_faces);
  std::vector<int> parent(static_cast<size_t>(faces.Extent()));
  for (size_t index = 0; index < parent.size(); ++index) {
    parent[index] = static_cast<int>(index);
  }
  auto root = [&](int face) {
    while (parent[face] != face) face = parent[face] = parent[parent[face]];
    return face;
  };
  for (int vertex = 1; vertex <= vertex_faces.Extent(); ++vertex) {
    int first = -1;
    for (const TopoDS_Shape& face : vertex_faces(vertex)) {
      const int index = faces.FindIndex(face) - 1;
      if (index < 0) continue;
      if (first < 0) {
        first = root(index);
      } else {
        parent[root(index)] = first;
      }
    }
  }
  std::vector<bool> taken(parent.size(), false);
  std::vector<gp_Pnt> points;
  for (int vertex = 1; vertex <= vertex_faces.Extent(); ++vertex) {
    const NCollection_List<TopoDS_Shape>& owners = vertex_faces(vertex);
    if (owners.IsEmpty()) continue;
    const int index = faces.FindIndex(owners.First()) - 1;
    if (index < 0 || taken[root(index)]) continue;
    taken[root(index)] = true;
    points.push_back(BRep_Tool::Pnt(TopoDS::Vertex(vertex_faces.FindKey(vertex))));
  }
  return points;
}

}  // namespace

int geospec_occt_component_bodies_new(
    const geospec_occt_document* document, const uint32_t* occurrences,
    size_t occurrence_count, geospec_occt_charge charge, void* context,
    geospec_occt_component_bodies** out_bodies, size_t* out_body_count,
    size_t* out_face_count, geospec_occt_string* error) noexcept {
  if (document == nullptr || charge == nullptr || out_bodies == nullptr ||
      out_body_count == nullptr || out_face_count == nullptr ||
      (occurrence_count != 0 && occurrences == nullptr)) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Component-body request is invalid.", error);
  }
  *out_bodies = nullptr;
  *out_body_count = 0;
  *out_face_count = 0;
  for (size_t index = 0; index < occurrence_count; ++index) {
    if (occurrences[index] >= document->occurrences.size()) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                  "Component occurrence is out of range.", error);
    }
  }
  return guarded(error, [&]() -> int {
    struct Candidate {
      TopoDS_Shape shape;
      uint32_t occurrence;
      bool solid;
    };
    std::vector<Candidate> candidates;
    auto explode = [&](const TopoDS_Shape& shape, uint32_t occurrence) {
      for (TopExp_Explorer solid(shape, TopAbs_SOLID); solid.More(); solid.Next()) {
        candidates.push_back({solid.Current(), occurrence, true});
      }
      for (TopExp_Explorer shell(shape, TopAbs_SHELL, TopAbs_SOLID); shell.More();
           shell.Next()) {
        candidates.push_back({shell.Current(), occurrence, false});
      }
      for (TopExp_Explorer face(shape, TopAbs_FACE, TopAbs_SHELL); face.More();
           face.Next()) {
        candidates.push_back({face.Current(), occurrence, false});
      }
    };
    if (occurrence_count == 0) explode(document->shape, UINT32_MAX);
    for (size_t index = 0; index < occurrence_count; ++index) {
      explode(document->occurrences[occurrences[index]].shape, occurrences[index]);
    }
    uint64_t units = 0;
    for (const Candidate& candidate : candidates) {
      for (TopExp_Explorer face(candidate.shape, TopAbs_FACE); face.More(); face.Next()) {
        units += component_box_units(TopoDS::Face(face.Current()));
      }
    }
    if (charge(context, units) != 0) return GEOSPEC_OCCT_STOPPED;
    auto result = std::make_unique<geospec_occt_component_bodies>();
    result->document = document;
    for (const Candidate& candidate : candidates) {
      geospec_occt_component_bodies::Body body;
      Bnd_Box box;
      for (TopExp_Explorer face(candidate.shape, TopAbs_FACE); face.More(); face.Next()) {
        const Bnd_Box& local = memo_face_box(*document, face.Current());
        if (local.IsVoid()) continue;
        geospec_occt_bounds bounds{};
        local.Get(bounds.min[0], bounds.min[1], bounds.min[2], bounds.max[0],
                  bounds.max[1], bounds.max[2]);
        box.Update(bounds.min[0], bounds.min[1], bounds.min[2], bounds.max[0],
                   bounds.max[1], bounds.max[2]);
        // The filters read the face boxes, grown by the face's tolerances so
        // they enclose what the exact distances measure; the body bounds fold
        // them ungrown, bit-equal to bounds().
        const double grow = component_face_tolerance(TopoDS::Face(face.Current()));
        for (int axis = 0; axis < 3; ++axis) {
          bounds.min[axis] -= grow;
          bounds.max[axis] += grow;
        }
        body.faces.push_back(TopoDS::Face(face.Current()));
        body.boxes.push_back(bounds);
      }
      if (body.faces.empty()) continue;
      NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> vertices;
      TopExp::MapShapes(candidate.shape, TopAbs_VERTEX, vertices);
      body.shape = candidate.shape;
      body.facts.occurrence = candidate.occurrence;
      body.facts.solid = candidate.solid ? 1 : 0;
      body.facts.vertex_count = static_cast<uint32_t>(vertices.Extent());
      body.facts.face_count = static_cast<uint32_t>(body.faces.size());
      box.Get(body.facts.bounds.min[0], body.facts.bounds.min[1],
              body.facts.bounds.min[2], body.facts.bounds.max[0],
              body.facts.bounds.max[1], body.facts.bounds.max[2]);
      result->face_count += body.faces.size();
      result->bodies.push_back(std::move(body));
    }
    *out_body_count = result->bodies.size();
    *out_face_count = result->face_count;
    *out_bodies = result.release();
    return GEOSPEC_OCCT_OK;
  });
}

void geospec_occt_component_bodies_release(
    geospec_occt_component_bodies* bodies) noexcept {
  delete bodies;
}

int geospec_occt_component_bodies_facts(
    const geospec_occt_component_bodies* bodies,
    geospec_occt_component_body* out_bodies, size_t body_capacity,
    geospec_occt_bounds* out_face_bounds, size_t face_capacity,
    geospec_occt_string* error) noexcept {
  if (bodies == nullptr || (body_capacity != 0 && out_bodies == nullptr) ||
      (face_capacity != 0 && out_face_bounds == nullptr)) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Component-body facts output is invalid.", error);
  }
  if (body_capacity < bodies->bodies.size() || face_capacity < bodies->face_count) {
    return fail(GEOSPEC_OCCT_BUFFER_TOO_SMALL,
                "Component-body facts output is too small.", error);
  }
  size_t face = 0;
  for (size_t index = 0; index < bodies->bodies.size(); ++index) {
    const geospec_occt_component_bodies::Body& body = bodies->bodies[index];
    out_bodies[index] = body.facts;
    for (const geospec_occt_bounds& bounds : body.boxes) out_face_bounds[face++] = bounds;
  }
  return GEOSPEC_OCCT_OK;
}

int geospec_occt_component_faces_within(
    const geospec_occt_component_bodies* bodies, size_t left,
    const uint32_t* left_faces, size_t left_count, size_t right,
    const uint32_t* right_faces, size_t right_count, double tolerance,
    geospec_occt_charge charge, void* context, int* out_within,
    geospec_occt_string* error) noexcept {
  auto listed = [&](size_t body, const uint32_t* faces, size_t count) {
    if (body >= bodies->bodies.size() || count == 0 || faces == nullptr) return false;
    for (size_t index = 0; index < count; ++index) {
      if (faces[index] >= bodies->bodies[body].faces.size()) return false;
    }
    return true;
  };
  if (bodies == nullptr || charge == nullptr || out_within == nullptr ||
      !listed(left, left_faces, left_count) || !listed(right, right_faces, right_count) ||
      !(tolerance >= 0.0) || !std::isfinite(tolerance)) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Component face sets are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    *out_within = 0;
    const auto& lbody = bodies->bodies[left];
    const auto& rbody = bodies->bodies[right];
    // The decomposition and its boxes walk each listed face's edges.
    uint64_t units = 0;
    for (size_t index = 0; index < left_count; ++index) {
      units += 1 + component_edge_count(lbody.faces[left_faces[index]]) / 8;
    }
    for (size_t index = 0; index < right_count; ++index) {
      units += 1 + component_edge_count(rbody.faces[right_faces[index]]) / 8;
    }
    if (charge(context, units) != 0) return GEOSPEC_OCCT_STOPPED;
    const std::vector<ComponentPiece> lpieces = component_pieces(lbody, left_faces, left_count);
    const std::vector<ComponentPiece> rpieces = component_pieces(rbody, right_faces, right_count);
    // The shape distance's per-pair reference: every pair whose boxes lie
    // farther apart is proven beyond the tolerance, and a pair within it
    // reports its own distance.
    const double reference = tolerance + 1.0e-6;
    const double eps = Precision::Confusion();
    // Sort-and-sweep on x: each box meets the other side's boxes still open
    // within reach, one unit per kComponentBoxTestsPerUnit tests, charged in
    // advance of each batch.
    struct Event {
      double x;
      int side;
      size_t piece;
    };
    std::vector<Event> events;
    events.reserve(lpieces.size() + rpieces.size());
    for (size_t index = 0; index < lpieces.size(); ++index) {
      events.push_back({lpieces[index].low, 0, index});
    }
    for (size_t index = 0; index < rpieces.size(); ++index) {
      events.push_back({rpieces[index].low, 1, index});
    }
    std::sort(events.begin(), events.end(), [](const Event& a, const Event& b) {
      return std::tie(a.x, a.side, a.piece) < std::tie(b.x, b.side, b.piece);
    });
    std::vector<size_t> open[2];
    std::vector<std::tuple<double, size_t, size_t>> pairs;
    uint64_t tests = 0;
    for (const Event& event : events) {
      const std::vector<ComponentPiece>& mine = event.side == 0 ? lpieces : rpieces;
      const std::vector<ComponentPiece>& theirs = event.side == 0 ? rpieces : lpieces;
      std::vector<size_t>& others = open[1 - event.side];
      others.erase(std::remove_if(others.begin(), others.end(),
                                  [&](size_t index) {
                                    return theirs[index].high + reference + eps < event.x;
                                  }),
                   others.end());
      for (const size_t other : others) {
        if (tests++ % kComponentBoxTestsPerUnit == 0 && charge(context, 1) != 0) {
          return GEOSPEC_OCCT_STOPPED;
        }
        const double gap = mine[event.piece].box.Distance(theirs[other].box);
        if (gap - reference < eps) {
          if (event.side == 0) {
            pairs.emplace_back(gap, event.piece, other);
          } else {
            pairs.emplace_back(gap, other, event.piece);
          }
        }
      }
      open[event.side].push_back(event.piece);
    }
    std::sort(pairs.begin(), pairs.end());
    for (const auto& [gap, lindex, rindex] : pairs) {
      const ComponentPiece& lpiece = lpieces[lindex];
      const ComponentPiece& rpiece = rpieces[rindex];
      if (charge(context, component_pair_units(lpiece, rpiece)) != 0) {
        return GEOSPEC_OCCT_STOPPED;
      }
      BRepExtrema_DistanceSS distance(lpiece.shape, rpiece.shape, lpiece.box, rpiece.box,
                                      reference, eps);
      if (distance.IsDone() && distance.DistValue() <= tolerance) {
        *out_within = 1;
        break;
      }
    }
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_component_body_inside(
    const geospec_occt_component_bodies* bodies, size_t outer, size_t inner,
    geospec_occt_charge charge, void* context, int* out_state,
    geospec_occt_string* error) noexcept {
  if (bodies == nullptr || charge == nullptr || out_state == nullptr ||
      outer >= bodies->bodies.size() || inner >= bodies->bodies.size() ||
      !bodies->bodies[outer].facts.solid) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Component classification needs a solid and a body.", error);
  }
  return guarded(error, [&]() -> int {
    const auto& solid = bodies->bodies[outer];
    // Priced here, not per body at setup, since only nested pairs classify;
    // the pricing walks faces and vertices whose boxes setup already charged.
    const std::vector<gp_Pnt> points = component_points(bodies->bodies[inner].shape);
    uint64_t classifier_units = 0;
    for (const TopoDS_Face& face : solid.faces) {
      classifier_units += component_classifier_units(face);
    }
    // Building the classifier prepares every face; each point's ray may
    // meet any of them.
    if (charge(context, (1 + points.size()) * classifier_units) != 0) {
      return GEOSPEC_OCCT_STOPPED;
    }
    // ponytail: one classifier, points and price per call; cache them per
    // body if many nested pairs share one outer solid.
    BRepClass3d_SolidClassifier classifier(solid.shape);
    *out_state = 0;
    for (const gp_Pnt& point : points) {
      classifier.Perform(point, 0.001);
      const TopAbs_State state = classifier.State();
      if (state == TopAbs_IN) {
        *out_state = 1;
        break;
      }
      if (state != TopAbs_OUT) *out_state = 2;
    }
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_component_bodies_within_dedicated(
    const geospec_occt_component_bodies* bodies, size_t left, size_t right,
    double tolerance, int grant_width, int* out_used_parallel, int* out_within,
    geospec_occt_string* error) noexcept {
  if (bodies == nullptr || out_within == nullptr || out_used_parallel == nullptr ||
      left >= bodies->bodies.size() || right >= bodies->bodies.size() ||
      !(tolerance >= 0.0) || grant_width < 0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Component body pair is invalid.", error);
  }
  return guarded(error, [&]() -> int {
    std::unique_ptr<OSD_ThreadPool::Launcher> reservation;
    const int scope_status = dedicated_pool_scope(
        grant_width, out_used_parallel, reservation, error);
    if (scope_status != GEOSPEC_OCCT_OK) return scope_status;
    BRepExtrema_DistShapeShape distance;
    // O3-07: Value() is bit-identical under OSD_Parallel; solutions are not,
    // so only this verdict reads the parallel result.
    distance.SetMultiThread(*out_used_parallel != 0);
    distance.LoadS1(bodies->bodies[left].shape);
    distance.LoadS2(bodies->bodies[right].shape);
    distance.Perform();
    if (!distance.IsDone()) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT extrema computation did not converge.", error);
    }
    *out_within = distance.Value() <= tolerance ? 1 : 0;
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_occurrence_minimum_distance(
    const geospec_occt_document* document, uint32_t a, uint32_t b,
    geospec_occt_charge charge, void* context,
    geospec_occt_minimum_distance* out_result,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || out_result == nullptr || charge == nullptr || a == b ||
      a >= document->occurrences.size() ||
      b >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Minimum distance needs two distinct occurrences.", error);
  }
  return guarded(error, [&]() -> int {
    // Charge the setup traversal before it reads topology. The second charge
    // prices the synchronous extrema from the counted whole occurrences.
    if (charge(context, 1) != 0) return GEOSPEC_OCCT_STOPPED;
    TopTools_IndexedMapOfShape parts_a;
    TopTools_IndexedMapOfShape parts_b;
    TopExp::MapShapes(document->occurrences[a].shape, parts_a);
    TopExp::MapShapes(document->occurrences[b].shape, parts_b);
    const uint64_t units_a = static_cast<uint64_t>(parts_a.Extent());
    const uint64_t units_b = static_cast<uint64_t>(parts_b.Extent());
    const uint64_t units = units_a == 0 || units_b == 0
        ? 1
        : units_a > UINT64_MAX / units_b ? UINT64_MAX : units_a * units_b;
    if (charge(context, units) != 0) return GEOSPEC_OCCT_STOPPED;
    // The legacy AP242 reader publishes solution 1 from this serial OCCT
    // operation. Parallel extrema may change the solution set/order.
    BRepExtrema_DistShapeShape distance(
        document->occurrences[a].shape, document->occurrences[b].shape);
    if (!distance.IsDone() || distance.NbSolution() < 1) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT extrema computation did not converge.", error);
    }
    const gp_Pnt first = distance.PointOnShape1(1);
    const gp_Pnt second = distance.PointOnShape2(1);
    const double value = distance.Value();
    if (!std::isfinite(value) || value < 0.0 ||
        !std::isfinite(first.X()) || !std::isfinite(first.Y()) ||
        !std::isfinite(first.Z()) || !std::isfinite(second.X()) ||
        !std::isfinite(second.Y()) || !std::isfinite(second.Z())) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT extrema returned a non-finite witness.", error);
    }
    out_result->distance = value;
    out_result->point_a[0] = first.X();
    out_result->point_a[1] = first.Y();
    out_result->point_a[2] = first.Z();
    out_result->point_b[0] = second.X();
    out_result->point_b[1] = second.Y();
    out_result->point_b[2] = second.Z();
    return GEOSPEC_OCCT_OK;
  });
}

int geospec_occt_regular_solid_containment(
    const geospec_occt_document* document, geospec_occt_entity subject_entity,
    geospec_occt_entity target_entity,
    geospec_occt_regular_solid_containment_result* result,
    geospec_occt_string* error) noexcept {
  int used_parallel = 0;
  return geospec_occt_regular_solid_containment_dedicated(
      document, subject_entity, target_entity, nullptr, 0, &used_parallel, result,
      error);
}

geospec_occt_operand_memo* geospec_occt_operand_memo_new(
    const geospec_occt_document* document) noexcept {
  if (document == nullptr) return nullptr;
  try {
    auto* memo = new geospec_occt_operand_memo();
    memo->document_serial = document->serial;
    return memo;
  } catch (...) {
    return nullptr;
  }
}

void geospec_occt_operand_memo_release(geospec_occt_operand_memo* memo) noexcept {
  delete memo;
}

size_t geospec_occt_occurrence_qualifications(
    const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->occurrence_qualifications;
}

int geospec_occt_regular_solid_containment_dedicated(
    const geospec_occt_document* document, geospec_occt_entity subject_entity,
    geospec_occt_entity target_entity, geospec_occt_operand_memo* memo,
    int grant_width, int* used_parallel,
    geospec_occt_regular_solid_containment_result* result,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || result == nullptr || used_parallel == nullptr ||
      grant_width < 0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/containment output is null.", error);
  }
  if (memo != nullptr && memo->document_serial != document->serial) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Operand memo belongs to another document.", error);
  }
  return guarded(error, [&]() -> int {
    *result = {};
    *used_parallel = 0;
    TopoDS_Shape subject_shape;
    TopoDS_Shape target_shape;
    std::string message;
    if (!resolve_entity(*document, subject_entity, subject_shape, message) ||
        !resolve_entity(*document, target_entity, target_shape, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    // Occurrence operands come from the claim's memo (C7), in the same order.
    auto operand = [&](geospec_occt_entity entity, const TopoDS_Shape& shape,
                       TopoDS_Solid& solid) {
      return entity.kind == GEOSPEC_OCCT_ENTITY_OCCURRENCE
                 ? occurrence_operand(*document, entity.occurrence, memo, solid, message)
                 : regular_solid_operand(shape, solid, message);
    };
    TopoDS_Solid subject;
    TopoDS_Solid target;
    if (!operand(subject_entity, subject_shape, subject) ||
        !operand(target_entity, target_shape, target)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    if (boolean_debug_requested(message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    std::unique_ptr<OSD_ThreadPool::Launcher> reservation;
    const int scope_status = dedicated_pool_scope(
        grant_width, used_parallel, reservation, error);
    if (scope_status != GEOSPEC_OCCT_OK) return scope_status;

    NCollection_List<TopoDS_Shape> arguments;
    arguments.Append(subject);
    NCollection_List<TopoDS_Shape> tools;
    tools.Append(target);
    BRepAlgoAPI_Cut cut;
    cut.SetArguments(arguments);
    cut.SetTools(tools);
    cut.SetNonDestructive(true);
    // Both operands are regular_solid_operand-qualified, never inverted.
    cut.SetCheckInverted(false);
    cut.SetRunParallel(*used_parallel != 0);
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

namespace {

// S10 (ruling 23) prices each step of a candidate pair in M2's unit, about
// 20 us of one core, before it runs. The prices are fitted to the serial
// thread-CPU time of every candidate pair of the corpus STEP files (W2-BUDGET
// a1 calibration): the face-box pre-count by M2's tests per unit, an
// operand's qualification by its edges, and the Common by both operands'
// faces and the face pairs whose boxes meet. A pair is dearer for a plane
// against an elementary surface, for two free-form surfaces, for the poles of
// the faces' B-spline edges, and where the surfaces nearly coincide, which
// makes the Boolean's intersections degenerate: coplanar faces' curved edges,
// and parallel cylinders that nearly coincide or touch.
constexpr uint64_t kOverlapBoxTestsPerUnit = 4096;

// regular_solid_operand's analyzer checks every edge and face.
uint64_t overlap_qualification_units(const TopoDS_Shape& shape) {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> edges;
  TopExp::MapShapes(shape, TopAbs_EDGE, edges);
  return 14 * static_cast<uint64_t>(edges.Extent());
}

// A face of a face-box pair: its surface, how many of its edges are curved,
// and the poles of its B-spline and Bezier edges.
struct OverlapFace {
  bool priced = false;
  GeomAbs_SurfaceType type = GeomAbs_OtherSurface;
  gp_Pln plane;
  gp_Cylinder cylinder;
  uint64_t curved = 0;
  uint64_t edge_poles = 0;
};

OverlapFace overlap_face(const TopoDS_Face& face) {
  OverlapFace value;
  value.priced = true;
  const BRepAdaptor_Surface surface(face, false);
  value.type = surface.GetType();
  if (value.type == GeomAbs_Plane) value.plane = surface.Plane();
  if (value.type == GeomAbs_Cylinder) value.cylinder = surface.Cylinder();
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> edges;
  TopExp::MapShapes(face, TopAbs_EDGE, edges);
  for (int index = 1; index <= edges.Extent(); ++index) {
    const TopoDS_Edge& edge = TopoDS::Edge(edges(index));
    if (BRep_Tool::Degenerated(edge)) continue;
    const BRepAdaptor_Curve curve(edge);
    if (curve.GetType() != GeomAbs_Line) ++value.curved;
    if (curve.GetType() == GeomAbs_BSplineCurve ||
        curve.GetType() == GeomAbs_BezierCurve) {
      value.edge_poles += static_cast<uint64_t>(curve.NbPoles());
    }
  }
  return value;
}

// 0 plane, 1 elementary (cylinder, cone, sphere, torus), 2 free-form.
int overlap_kind(GeomAbs_SurfaceType type) {
  switch (type) {
    case GeomAbs_Plane:
      return 0;
    case GeomAbs_Cylinder:
    case GeomAbs_Cone:
    case GeomAbs_Sphere:
    case GeomAbs_Torus:
      return 1;
    default:
      return 2;
  }
}

// ponytail: fixed thresholds (the calibration's); they only price.
bool overlap_coplanar(const gp_Pln& left, const gp_Pln& right) {
  return left.Axis().Direction().IsParallel(right.Axis().Direction(), 1e-9) &&
         left.Distance(right.Location()) <= 1e-4;
}

// Parallel cylinders whose surfaces come within 2% of the larger radius of
// coinciding or touching.
bool overlap_near_cylinders(const gp_Cylinder& left, const gp_Cylinder& right) {
  if (!left.Axis().Direction().IsParallel(right.Axis().Direction(), 1e-6)) {
    return false;
  }
  const double axes = gp_Lin(left.Axis()).Distance(right.Axis().Location());
  const double slack = 0.02 * std::max(left.Radius(), right.Radius());
  return std::abs(std::abs(left.Radius() - right.Radius()) - axes) <= slack ||
         std::abs(left.Radius() + right.Radius() - axes) <= slack;
}

// The Common's counts: both operands' faces, the face pairs whose enlarged
// memo boxes meet, and among those the plane-elementary and free-form pairs,
// their faces' edge poles, coplanar pairs' curved edges (left x right) and
// near-coincident cylinder pairs.
struct OverlapBoolean {
  uint64_t faces = 0;
  uint64_t pairs = 0;
  uint64_t plane_elementary = 0;
  uint64_t free_form = 0;
  uint64_t edge_poles = 0;
  uint64_t coplanar_curves = 0;
  uint64_t near_cylinders = 0;
};

uint64_t overlap_boolean_units(const OverlapBoolean& common) {
  return 4 * common.faces + 12 * common.pairs + 52 * common.plane_elementary +
         160 * common.free_form + 2 * common.edge_poles +
         10 * common.coplanar_curves + 64 * common.near_cylinders;
}

// The pre-count over every face pair's enlarged memo boxes (F4/F6), and the
// counts the Common is priced from.
OverlapBoolean overlap_boolean(const geospec_occt_document& document,
                               uint32_t left, uint32_t right,
                               double tolerance) {
  const auto& lfaces = document.occurrences[left].public_faces;
  const auto& rfaces = document.occurrences[right].public_faces;
  const auto enlarged = [&](const FaceView& face) {
    Bnd_Box box = memo_face_box(document, face.shape);
    if (!box.IsVoid()) box.Enlarge(tolerance);
    return box;
  };
  std::vector<Bnd_Box> right_boxes;
  right_boxes.reserve(rfaces.size());
  for (const FaceView& face : rfaces) right_boxes.push_back(enlarged(face));
  std::vector<OverlapFace> lpriced(lfaces.size()), rpriced(rfaces.size());
  const auto priced = [](std::vector<OverlapFace>& faces, size_t index,
                         const FaceView& face) -> const OverlapFace& {
    if (!faces[index].priced) faces[index] = overlap_face(face.shape);
    return faces[index];
  };
  OverlapBoolean common;
  common.faces = lfaces.size() + rfaces.size();
  for (size_t lindex = 0; lindex < lfaces.size(); ++lindex) {
    const Bnd_Box box = enlarged(lfaces[lindex]);
    if (box.IsVoid()) continue;
    for (size_t rindex = 0; rindex < rfaces.size(); ++rindex) {
      if (right_boxes[rindex].IsVoid() || box.IsOut(right_boxes[rindex])) continue;
      const OverlapFace& left_face = priced(lpriced, lindex, lfaces[lindex]);
      const OverlapFace& right_face = priced(rpriced, rindex, rfaces[rindex]);
      const int kinds[2] = {overlap_kind(left_face.type), overlap_kind(right_face.type)};
      ++common.pairs;
      common.plane_elementary += kinds[0] + kinds[1] == 1 ? 1 : 0;
      common.free_form += kinds[0] == 2 && kinds[1] == 2 ? 1 : 0;
      common.edge_poles += left_face.edge_poles + right_face.edge_poles;
      if (left_face.type == GeomAbs_Plane && right_face.type == GeomAbs_Plane &&
          overlap_coplanar(left_face.plane, right_face.plane)) {
        common.coplanar_curves += left_face.curved * right_face.curved;
      }
      if (left_face.type == GeomAbs_Cylinder && right_face.type == GeomAbs_Cylinder &&
          overlap_near_cylinders(left_face.cylinder, right_face.cylinder)) {
        ++common.near_cylinders;
      }
    }
  }
  return common;
}

}  // namespace

int geospec_occt_occurrence_box_units(const geospec_occt_document* document,
                                      uint32_t occurrence, uint64_t* out_units,
                                      geospec_occt_string* error) noexcept {
  if (document == nullptr || out_units == nullptr ||
      occurrence >= document->occurrences.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence box-price arguments are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    uint64_t units = 0;
    for (TopExp_Explorer face(document->occurrences[occurrence].shape, TopAbs_FACE);
         face.More(); face.Next()) {
      units += component_box_units(TopoDS::Face(face.Current()));
    }
    *out_units = units;
    return GEOSPEC_OCCT_OK;
  });
}

// S10 (ruling 23, INTERFERENCE-EXACT-01): one candidate pair of leaf
// occurrences, each step charged before it runs (ruling 28): the face-box
// pre-count, each operand's first qualification in the claim memo (C7), and
// the Common, priced from the face pairs whose exact memo boxes (F4/F6), each
// enlarged by the tolerance, intersect: the face-face intersections a Boolean
// may need. A refused charge stops the pair before the step it prices.
int geospec_occt_occurrence_overlap_dedicated(
    const geospec_occt_document* document, uint32_t left, uint32_t right,
    double tolerance, geospec_occt_operand_memo* memo, int grant_width,
    geospec_occt_charge charge, void* context, int* used_parallel,
    geospec_occt_occurrence_overlap_result* result, geospec_occt_string* reason,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || result == nullptr || used_parallel == nullptr ||
      charge == nullptr || grant_width < 0 || left == right ||
      left >= document->occurrences.size() ||
      right >= document->occurrences.size() || !std::isfinite(tolerance) ||
      tolerance < 0.0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Occurrence overlap arguments are invalid.", error);
  }
  if (memo != nullptr && memo->document_serial != document->serial) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Operand memo belongs to another document.", error);
  }
  return guarded(error, [&]() -> int {
    *result = {};
    *used_parallel = 0;
    const uint64_t tests =
        static_cast<uint64_t>(document->occurrences[left].public_faces.size()) *
        document->occurrences[right].public_faces.size();
    if (charge(context, 1 + tests / kOverlapBoxTestsPerUnit) != 0) {
      return GEOSPEC_OCCT_STOPPED;
    }
    const OverlapBoolean counts = overlap_boolean(*document, left, right, tolerance);
    std::string message;
    TopoDS_Solid solids[2];
    const uint32_t operands[2] = {left, right};
    for (int side = 0; side < 2; ++side) {
      const uint32_t occurrence = operands[side];
      if ((memo == nullptr || memo->operands.count(occurrence) == 0) &&
          charge(context, overlap_qualification_units(
                              document->occurrences[occurrence].shape)) != 0) {
        return GEOSPEC_OCCT_STOPPED;
      }
      if (!occurrence_operand(*document, occurrence, memo, solids[side], message)) {
        result->unqualified = side + 1;
        return write_string(message, reason);
      }
    }
    const TopoDS_Solid& left_solid = solids[0];
    const TopoDS_Solid& right_solid = solids[1];
    if (boolean_debug_requested(message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED, message, error);
    }
    if (charge(context, overlap_boolean_units(counts)) != 0) {
      return GEOSPEC_OCCT_STOPPED;
    }
    std::unique_ptr<OSD_ThreadPool::Launcher> reservation;
    const int scope_status = dedicated_pool_scope(
        grant_width, used_parallel, reservation, error);
    if (scope_status != GEOSPEC_OCCT_OK) return scope_status;

    NCollection_List<TopoDS_Shape> arguments;
    arguments.Append(left_solid);
    NCollection_List<TopoDS_Shape> tools;
    tools.Append(right_solid);
    BRepAlgoAPI_Common common;
    common.SetArguments(arguments);
    common.SetTools(tools);
    common.SetNonDestructive(true);
    // Both operands are regular_solid_operand-qualified, never inverted.
    common.SetCheckInverted(false);
    common.SetRunParallel(*used_parallel != 0);
    common.Build();
    if (!common.IsDone() || common.HasErrors()) {
      std::ostringstream details;
      common.DumpErrors(details);
      const std::string reported = details.str();
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  reported.empty()
                      ? "OCCT exact overlap Common failed."
                      : "OCCT exact overlap Common failed: " + reported,
                  error);
    }
    const TopoDS_Shape residual = common.Shape();
    std::vector<TopoDS_Solid> residual_solids;
    if (!regular_solid_set(residual, true, residual_solids, message)) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT exact overlap Common returned invalid topology: " + message,
                  error);
    }
    if (residual_solids.size() > std::numeric_limits<uint32_t>::max()) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT exact overlap Common returned too many solids.", error);
    }
    result->residual_solid_count = static_cast<uint32_t>(residual_solids.size());
    if (residual_solids.empty()) return GEOSPEC_OCCT_OK;
    GProp_GProps properties;
    BRepGProp::VolumeProperties(residual, properties);
    result->residual_volume = properties.Mass();
    result->residual_bounds = bounds(residual);
    for (size_t axis = 0; axis < 3; ++axis) {
      if (!std::isfinite(result->residual_bounds.min[axis]) ||
          !std::isfinite(result->residual_bounds.max[axis]) ||
          result->residual_bounds.min[axis] > result->residual_bounds.max[axis]) {
        return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                    "OCCT exact overlap residual has invalid bounds.", error);
      }
    }
    if (!std::isfinite(result->residual_volume) || result->residual_volume <= 0.0) {
      return fail(GEOSPEC_OCCT_NATIVE_ERROR,
                  "OCCT exact overlap residual has non-positive or non-finite volume.",
                  error);
    }
    result->has_residual_bounds = 1;
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

// The selected-bore certificate after the band and the material solid are
// established; `solid` is `regular_solid_operand(occurrence.shape)`. A memo
// keeps one scoped inventory per occurrence for the claim (C7).
static int selected_bore_void(
    const geospec_occt_document* document, geospec_occt_entity face,
    const geospec_occt_nominal_cylindrical_band& associated, const TopoDS_Solid& solid,
    geospec_occt_operand_memo* memo, geospec_occt_nominal_cylindrical_band* band,
    geospec_occt_circular_bore_candidate* clear_interior, geospec_occt_string* error) {
  const auto& occurrence = document->occurrences[face.occurrence];
  if (occurrence.public_faces.size() > 4096) {
    return fail(GEOSPEC_OCCT_UNSUPPORTED, "Selected bore material has too many faces.", error);
  }
  geospec_occt_operand_memo::Bores fresh;
  const geospec_occt_operand_memo::Bores* inventory = &fresh;
  if (memo != nullptr) {
    const auto found = memo->bores.find(face.occurrence);
    if (found != memo->bores.end()) inventory = &found->second;
  }
  if (inventory == &fresh) {
    // A scoped view reuses A7 without changing its document-local semantics.
    // Its sole solid is the ENTIRE selected material, never just a face owner.
    geospec_occt_document scoped;
    scoped.shape = occurrence.shape;
    scoped.public_faces = occurrence.public_faces;
    fresh.built = build_circular_bores(scoped, 4096, 0, 0, fresh.candidates, fresh.message,
                                       fresh.native_error, false, &solid);
    if (memo != nullptr) {
      inventory = &memo->bores.emplace(face.occurrence, std::move(fresh)).first->second;
    }
  }
  if (!inventory->built) {
    return fail(inventory->native_error ? GEOSPEC_OCCT_NATIVE_ERROR : GEOSPEC_OCCT_UNSUPPORTED,
                inventory->message, error);
  }
  for (const auto& candidate : inventory->candidates) {
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
}

int geospec_occt_selected_bore_void_query(
    const geospec_occt_document* document, geospec_occt_entity face,
    geospec_occt_operand_memo* memo, geospec_occt_nominal_cylindrical_band* band,
    geospec_occt_circular_bore_candidate* clear_interior,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || band == nullptr || clear_interior == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Selected bore output/document is null.", error);
  }
  if (memo != nullptr && memo->document_serial != document->serial) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Operand memo belongs to another document.", error);
  }
  *band = {};
  *clear_interior = {};
  return guarded(error, [&]() -> int {
    geospec_occt_nominal_cylindrical_band associated{};
    const int status = geospec_occt_nominal_cylindrical_band_query(
        document, face, &associated, error);
    if (status != GEOSPEC_OCCT_OK) return status;
    TopoDS_Solid solid;
    std::string message;
    if (!occurrence_operand(*document, face.occurrence, memo, solid, message)) {
      return fail(GEOSPEC_OCCT_UNSUPPORTED,
                  "Selected bore requires one complete regular material solid: " + message, error);
    }
    return selected_bore_void(document, face, associated, solid, memo, band, clear_interior,
                              error);
  });
}

int geospec_occt_selected_interference_material_query(
    const geospec_occt_document* document, geospec_occt_entity face,
    geospec_occt_operand_memo* memo, geospec_occt_nominal_cylindrical_band* output,
    uint32_t* kind, geospec_occt_string* error) noexcept {
  if (!document || !output || !kind) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Material output/document is null.", error);
  }
  if (memo != nullptr && memo->document_serial != document->serial) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Operand memo belongs to another document.", error);
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
    if (!occurrence_operand(*document, face.occurrence, memo, solid, message))
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
      // The band and material solid above are exactly what the bore query
      // would re-establish (same inputs, pure functions), so it reuses them.
      geospec_occt_nominal_cylindrical_band certified{};
      geospec_occt_circular_bore_candidate clear{};
      status = selected_bore_void(document, face, band, solid, memo, &certified, &clear, error);
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
  int used_parallel = 0;
  return geospec_occt_circular_bores_prepare_dedicated(
      document, max_candidates, retained_candidate_size, retained_inventory_size,
      0, &used_parallel, count, error);
}

int geospec_occt_circular_bores_prepare_dedicated(
    const geospec_occt_document* document, size_t max_candidates,
    size_t retained_candidate_size, size_t retained_inventory_size,
    int grant_width, int* used_parallel, size_t* count,
    geospec_occt_string* error) noexcept {
  if (document == nullptr || count == nullptr || used_parallel == nullptr ||
      grant_width < 0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT,
                "Document/circular bore count output is null.", error);
  }
  document->circular_bores.reset();
  return guarded(error, [&]() -> int {
    std::unique_ptr<OSD_ThreadPool::Launcher> reservation;
    const int scope_status = dedicated_pool_scope(
        grant_width, used_parallel, reservation, error);
    if (scope_status != GEOSPEC_OCCT_OK) return scope_status;
    std::vector<geospec_occt_circular_bore_candidate> candidates;
    std::string message;
    bool native_error = false;
    if (!build_circular_bores(*document, max_candidates,
                              retained_candidate_size,
                              retained_inventory_size, candidates, message,
                              native_error, *used_parallel != 0)) {
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

size_t geospec_occt_certified_clear_bores(
    const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->certified_clear_bores;
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

int geospec_occt_tessellate(const geospec_occt_document* document,
                            geospec_occt_entity entity,
                            double linear_deflection, double angular_deflection,
                            double* positions, size_t position_capacity,
                            uint32_t* triangles, size_t triangle_capacity,
                            size_t* position_count, size_t* triangle_count,
                            geospec_occt_string* error) noexcept {
  int used_parallel = 0;
  return geospec_occt_tessellate_dedicated(
      document, entity, linear_deflection, angular_deflection, 0,
      &used_parallel, positions, position_capacity, triangles,
      triangle_capacity, position_count, triangle_count, error);
}

int geospec_occt_tessellate_dedicated(const geospec_occt_document* document,
                            geospec_occt_entity entity,
                            double linear_deflection, double angular_deflection,
                            int grant_width, int* used_parallel,
                            double* positions, size_t position_capacity,
                            uint32_t* triangles, size_t triangle_capacity,
                            size_t* position_count, size_t* triangle_count,
                            geospec_occt_string* error) noexcept {
  if (document == nullptr || position_count == nullptr || triangle_count == nullptr ||
      used_parallel == nullptr || grant_width < 0 ||
      !std::isfinite(linear_deflection) || !std::isfinite(angular_deflection) ||
      linear_deflection <= 0.0 || angular_deflection <= 0.0) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Tessellation arguments are invalid.", error);
  }
  return guarded(error, [&]() -> int {
    *used_parallel = 0;
    TopoDS_Shape shape;
    std::string message;
    if (!resolve_entity(*document, entity, shape, message)) {
      return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, message, error);
    }
    const MeshKey key{entity.kind, entity.occurrence, entity.face,
                      float_bits(linear_deflection),
                      float_bits(angular_deflection)};
    // A dedicated sizing call must execute the requested mesher, not reuse a
    // prior serial transfer left by an interrupted two-phase query.
    if (grant_width != 0 && positions == nullptr && triangles == nullptr)
      document->transfer_mesh.reset();
    if (!document->transfer_mesh.has_value() ||
        !(document->transfer_mesh->first == key)) {
      std::unique_ptr<OSD_ThreadPool::Launcher> reservation;
      const int scope_status = dedicated_pool_scope(
          grant_width, used_parallel, reservation, error);
      if (scope_status != GEOSPEC_OCCT_OK) return scope_status;
      document->transfer_mesh = std::make_pair(
          key, compute_mesh(shape, linear_deflection, angular_deflection,
                            *used_parallel != 0));
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
