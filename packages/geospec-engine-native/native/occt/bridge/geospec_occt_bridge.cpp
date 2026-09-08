#include "geospec_occt_bridge.h"

#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Interface_InterfaceModel.hxx>
#include <NCollection_Sequence.hxx>
#include <NCollection_IndexedMap.hxx>
#include <Poly_Triangulation.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <STEPConstruct_ExternRefs.hxx>
#include <STEPConstruct_UnitContext.hxx>
#include <Standard_Failure.hxx>
#include <StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.hxx>
#include <StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.hxx>
#include <StepRepr_GlobalUnitAssignedContext.hxx>
#include <TCollection_AsciiString.hxx>
#include <TCollection_ExtendedString.hxx>
#include <TDF_Label.hxx>
#include <TDF_Tool.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_ShapeMapHasher.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <XCAFDoc_DimTolTool.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <gp_Ax1.hxx>
#include <gp_Cone.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Dir.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>
#include <gp_Trsf.hxx>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <exception>
#include <limits>
#include <map>
#include <memory>
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

struct OccurrenceFacts {
  std::string label;
  std::string product_label;
  std::string name;
  geospec_occt_occurrence_facts facts{};
};

struct FaceFacts {
  geospec_occt_face_facts facts{};
};

struct PmiFacts {
  int kind = GEOSPEC_OCCT_PMI_DIMENSION;
  std::string label;
  std::string name;
  std::vector<std::string> shape_labels;
};

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

size_t shape_count(const TopoDS_Shape& shape, TopAbs_ShapeEnum kind) {
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> values;
  TopExp::MapShapes(shape, kind, values);
  return static_cast<size_t>(values.Extent());
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

FaceFacts face_facts(const TopoDS_Face& face, uint32_t index) {
  BRepAdaptor_Surface surface(face);
  FaceFacts result;
  result.facts.index = index;
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

void append_occurrences(const occ::handle<XCAFDoc_ShapeTool>& shape_tool,
                        const TDF_Label& assembly,
                        const TopLoc_Location& parent,
                        std::vector<OccurrenceFacts>& output) {
  NCollection_Sequence<TDF_Label> components;
  if (!XCAFDoc_ShapeTool::GetComponents(assembly, components)) return;
  for (const TDF_Label& component : components) {
    TDF_Label product;
    if (!XCAFDoc_ShapeTool::GetReferredShape(component, product)) continue;
    const TopLoc_Location composed = parent * XCAFDoc_ShapeTool::GetLocation(component);
    TopoDS_Shape placed = shape_tool->GetShape(product);
    placed.Location(composed);

    OccurrenceFacts occurrence;
    occurrence.label = label_entry(component);
    occurrence.product_label = label_entry(product);
    occurrence.name = label_name(component);
    if (occurrence.name.empty()) occurrence.name = label_name(product);
    placement(occurrence.facts.placement, composed);
    occurrence.facts.bounds = bounds(placed);
    output.push_back(std::move(occurrence));

    append_occurrences(shape_tool, product, composed, output);
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
      for (const TDF_Label& shape : second) record.shape_labels.push_back(label_entry(shape));
    }
    output.push_back(std::move(record));
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
  std::string source_length_unit;
  double source_unit_to_millimeters = 1.0;
  geospec_occt_shape_facts shape_facts{};
  std::vector<ProductFacts> products;
  std::vector<OccurrenceFacts> occurrences;
  std::vector<FaceFacts> faces;
  std::vector<PmiFacts> pmi;
};

int geospec_occt_open_step(const uint8_t* bytes, size_t length,
                           geospec_occt_document** output,
                           geospec_occt_string* error) noexcept {
  if (bytes == nullptr || length == 0 || output == nullptr) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "STEP bytes/out is empty or null.", error);
  }
  *output = nullptr;
  return guarded(error, [&]() -> int {
    STEPCAFControl_Reader reader;
    reader.SetNameMode(true);
    reader.SetGDTMode(true);
    std::istringstream stream(std::string(reinterpret_cast<const char*>(bytes), length));
    if (reader.ReadStream("memory.step", stream) != IFSelect_RetDone) {
      return fail(GEOSPEC_OCCT_READ_FAILED, "STEP read failed.", error);
    }

    auto result = std::make_unique<geospec_occt_document>();
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
    result->shape = shape_tool->GetOneShape();
    if (result->shape.IsNull()) return fail(GEOSPEC_OCCT_NO_SHAPE, "STEP has no shape.", error);
    result->shape_facts = shape_facts(result->shape);

    NCollection_Sequence<TDF_Label> products;
    shape_tool->GetShapes(products);
    result->products.reserve(static_cast<size_t>(products.Length()));
    for (const TDF_Label& product : products) {
      result->products.push_back({label_entry(product), label_name(product)});
    }
    for (const TDF_Label& root : roots) {
      append_occurrences(shape_tool, root, XCAFDoc_ShapeTool::GetLocation(root), result->occurrences);
    }

    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> faces;
    TopExp::MapShapes(result->shape, TopAbs_FACE, faces);
    result->faces.reserve(static_cast<size_t>(faces.Extent()));
    for (int index = 1; index <= faces.Extent(); ++index) {
      result->faces.push_back(face_facts(TopoDS::Face(faces(index)), static_cast<uint32_t>(index)));
    }

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

size_t geospec_occt_face_count(const geospec_occt_document* document) noexcept {
  return document == nullptr ? 0 : document->faces.size();
}

int geospec_occt_face(const geospec_occt_document* document, size_t index,
                      geospec_occt_face_facts* face,
                      geospec_occt_string* error) noexcept {
  if (document == nullptr || face == nullptr || index >= document->faces.size()) {
    return fail(GEOSPEC_OCCT_INVALID_ARGUMENT, "Face index/output is invalid.", error);
  }
  *face = document->faces[index].facts;
  return GEOSPEC_OCCT_OK;
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

int geospec_occt_tessellate(const geospec_occt_document* document,
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
    BRepMesh_IncrementalMesh mesher(document->shape, linear_deflection, false,
                                    angular_deflection, false);
    if (!mesher.IsDone()) return fail(GEOSPEC_OCCT_NATIVE_ERROR, "Tessellation failed.", error);

    std::vector<std::array<double, 3>> vertices;
    std::vector<std::array<uint32_t, 3>> facets;
    std::map<std::tuple<double, double, double>, uint32_t> index_by_point;
    for (TopExp_Explorer explorer(document->shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
      const TopoDS_Face face = TopoDS::Face(explorer.Current());
      TopLoc_Location location;
      const occ::handle<Poly_Triangulation> mesh = BRep_Tool::Triangulation(face, location);
      if (mesh.IsNull()) continue;
      std::vector<uint32_t> local_indices;
      local_indices.reserve(static_cast<size_t>(mesh->NbNodes()));
      for (int node = 1; node <= mesh->NbNodes(); ++node) {
        const gp_Pnt placed = mesh->Node(node).Transformed(location.Transformation());
        const auto key = std::make_tuple(placed.X(), placed.Y(), placed.Z());
        auto [iterator, inserted] = index_by_point.emplace(key, static_cast<uint32_t>(vertices.size()));
        if (inserted) vertices.push_back({placed.X(), placed.Y(), placed.Z()});
        local_indices.push_back(iterator->second);
      }
      for (int triangle = 1; triangle <= mesh->NbTriangles(); ++triangle) {
        int first = 0;
        int second = 0;
        int third = 0;
        mesh->Triangle(triangle).Get(first, second, third);
        if (face.Orientation() == TopAbs_REVERSED) std::swap(second, third);
        facets.push_back({local_indices[static_cast<size_t>(first - 1)],
                          local_indices[static_cast<size_t>(second - 1)],
                          local_indices[static_cast<size_t>(third - 1)]});
      }
    }

    *position_count = vertices.size();
    *triangle_count = facets.size();
    if (positions == nullptr && triangles == nullptr) return GEOSPEC_OCCT_OK;
    if (positions == nullptr || triangles == nullptr || position_capacity < vertices.size() ||
        triangle_capacity < facets.size()) {
      return fail(GEOSPEC_OCCT_BUFFER_TOO_SMALL, "Tessellation output buffer is too small.", error);
    }
    for (size_t index = 0; index < vertices.size(); ++index) {
      std::copy(vertices[index].begin(), vertices[index].end(), positions + index * 3);
    }
    for (size_t index = 0; index < facets.size(); ++index) {
      std::copy(facets[index].begin(), facets[index].end(), triangles + index * 3);
    }
    return GEOSPEC_OCCT_OK;
  });
}
