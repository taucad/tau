#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <CommonCrypto/CommonDigest.h>
#include <DESTEP_Parameters.hxx>
#include <GProp_GProps.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <NCollection_Sequence.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <TCollection_AsciiString.hxx>
#include <TDF_Label.hxx>
#include <TDF_Tool.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Wire.hxx>
#include <UnitsMethods_LengthUnit.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <array>
#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {
constexpr const char* kAp242Schema =
    "AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF";
constexpr std::uintmax_t kMaxFileBytes = 4ULL * 1024ULL * 1024ULL;

struct Component {
  std::string occurrence;
  std::string definition_key;
  std::string definition_name;
  TopoDS_Shape shape;
  gp_Trsf location;
};

struct Fixture {
  std::string id;
  std::string file;
  std::string root;
  std::vector<Component> components;
};

struct FixtureSpec {
  const char* id;
  const char* file;
  const char* root;
  std::vector<std::string> occurrences;
  bool shared_definition;
};

const std::vector<FixtureSpec> kSpecs = {
    {"through", "01-through.step", "m3-hole-through", {"through-part"}, false},
    {"blind", "02-blind.step", "m3-hole-blind", {"blind-part"}, false},
    {"sealed-cavity", "03-sealed-cavity.step", "m3-hole-sealed-cavity", {"sealed-cavity-part"}, false},
    {"edge-notch", "04-edge-notch.step", "m3-hole-edge-notch", {"edge-notch-part"}, false},
    {"unrelated-assembly", "05-unrelated-assembly.step", "m3-hole-unrelated-assembly", {"through-part", "unrelated-box"}, false},
    {"rigid-transformed", "06-rigid-transformed.step", "m3-hole-rigid-transformed", {"rotated-through-part"}, false},
    {"shared-instance", "07-shared-instance.step", "m3-hole-shared-instance", {"through-instance-a", "through-instance-b"}, true},
    {"obstructed-through", "08-obstructed-through.step", "m3-hole-obstructed-through", {"obstructed-through-part"}, false},
};

std::string label_name(const TDF_Label& label) {
  Handle(TDataStd_Name) attribute;
  if (!label.FindAttribute(TDataStd_Name::GetID(), attribute)) return "";
  return TCollection_AsciiString(attribute->Get(), '?').ToCString();
}

std::string label_entry(const TDF_Label& label) {
  TCollection_AsciiString entry;
  TDF_Tool::Entry(label, entry);
  return entry.ToCString();
}

void set_name(const TDF_Label& label, const std::string& name) {
  TDataStd_Name::Set(label, TCollection_ExtendedString(name.c_str()));
}

void require_valid(const TopoDS_Shape& shape, std::string_view name) {
  if (shape.IsNull() || !BRepCheck_Analyzer(shape).IsValid()) {
    throw std::runtime_error("invalid shape: " + std::string(name));
  }
}

TopoDS_Shape box(double x0, double y0, double z0, double x1, double y1,
                 double z1, std::string_view name) {
  const TopoDS_Shape shape =
      BRepPrimAPI_MakeBox(gp_Pnt(x0, y0, z0), x1 - x0, y1 - y0, z1 - z0)
          .Shape();
  require_valid(shape, name);
  return shape;
}

TopoDS_Shape cylinder(double x, double y, double z0, double height,
                      std::string_view name) {
  const TopoDS_Shape shape = BRepPrimAPI_MakeCylinder(
                                 gp_Ax2(gp_Pnt(x, y, z0), gp_Dir(0, 0, 1)),
                                 1.0, height)
                                 .Shape();
  require_valid(shape, name);
  return shape;
}

TopoDS_Shape cut(const TopoDS_Shape& left, const TopoDS_Shape& right,
                 std::string_view name) {
  BRepAlgoAPI_Cut operation(left, right);
  operation.Build();
  if (!operation.IsDone() || operation.HasErrors()) {
    throw std::runtime_error("Boolean cut failed: " + std::string(name));
  }
  const TopoDS_Shape result = operation.Shape();
  require_valid(result, name);
  return result;
}

TopoDS_Shape fuse(const TopoDS_Shape& left, const TopoDS_Shape& right,
                  std::string_view name) {
  BRepAlgoAPI_Fuse operation(left, right);
  operation.Build();
  if (!operation.IsDone() || operation.HasErrors()) {
    throw std::runtime_error("Boolean fuse failed: " + std::string(name));
  }
  const TopoDS_Shape result = operation.Shape();
  require_valid(result, name);
  return result;
}

TopoDS_Shape through_shape() {
  return cut(box(0, 0, 0, 10, 10, 10, "base"),
             cylinder(5, 5, -1, 12, "through-tool"), "through");
}

gp_Trsf translation(double x, double y, double z) {
  gp_Trsf transform;
  transform.SetTranslation(gp_Vec(x, y, z));
  return transform;
}

std::vector<Fixture> build_fixtures() {
  const TopoDS_Shape through = through_shape();
  const TopoDS_Shape blind =
      cut(box(0, 0, 0, 10, 10, 10, "blind-base"),
          cylinder(5, 5, 2, 9, "blind-tool"), "blind");
  const TopoDS_Shape sealed =
      cut(box(0, 0, 0, 10, 10, 10, "sealed-base"),
          cylinder(5, 5, 2, 6, "sealed-tool"), "sealed-cavity");
  const TopoDS_Shape notch =
      cut(box(0, 0, 0, 10, 10, 10, "notch-base"),
          cylinder(0, 5, -1, 12, "notch-tool"), "edge-notch");

  gp_Trsf rotated;
  rotated.SetValues(0, 0, 1, 20, 0, 1, 0, 30, -1, 0, 0, 40);

  TopoDS_Shape obstructed = through_shape();
  obstructed = fuse(obstructed, box(4.75, 4.75, 5, 5.25, 5.25, 12, "post"),
                    "obstructed-post");
  obstructed = fuse(obstructed, box(4.75, 4.75, 11, 8, 5.25, 12, "bridge"),
                    "obstructed-bridge");
  obstructed = fuse(obstructed, box(7.5, 4.75, 9, 8, 5.25, 12, "anchor"),
                    "obstructed-anchor");

  return {
      {"through", "01-through.step", "m3-hole-through",
       {{"through-part", "through-definition", "through-definition", through, gp_Trsf()}}},
      {"blind", "02-blind.step", "m3-hole-blind",
       {{"blind-part", "blind-definition", "blind-definition", blind, gp_Trsf()}}},
      {"sealed-cavity", "03-sealed-cavity.step", "m3-hole-sealed-cavity",
       {{"sealed-cavity-part", "sealed-definition", "sealed-definition", sealed, gp_Trsf()}}},
      {"edge-notch", "04-edge-notch.step", "m3-hole-edge-notch",
       {{"edge-notch-part", "notch-definition", "notch-definition", notch, gp_Trsf()}}},
      {"unrelated-assembly", "05-unrelated-assembly.step", "m3-hole-unrelated-assembly",
       {{"through-part", "through-definition", "through-definition", through, gp_Trsf()},
        {"unrelated-box", "unrelated-definition", "unrelated-definition",
         box(20, 0, 20, 30, 10, 30, "unrelated-box"), gp_Trsf()}}},
      {"rigid-transformed", "06-rigid-transformed.step", "m3-hole-rigid-transformed",
       {{"rotated-through-part", "through-definition", "through-definition", through, rotated}}},
      {"shared-instance", "07-shared-instance.step", "m3-hole-shared-instance",
       {{"through-instance-a", "shared-through-definition", "shared-through-definition", through, gp_Trsf()},
        {"through-instance-b", "shared-through-definition", "shared-through-definition", through,
         translation(20, 0, 0)}}},
      {"obstructed-through", "08-obstructed-through.step", "m3-hole-obstructed-through",
       {{"obstructed-through-part", "obstructed-definition", "obstructed-definition", obstructed, gp_Trsf()}}},
  };
}

DESTEP_Parameters write_parameters() {
  DESTEP_Parameters parameters;
  parameters.WriteSchema = DESTEP_Parameters::WriteMode_StepSchema_AP242DIS;
  parameters.WriteUnit = UnitsMethods_LengthUnit_Millimeter;
  parameters.WriteAssembly = DESTEP_Parameters::WriteMode_Assembly_On;
  parameters.WriteTessellated = DESTEP_Parameters::RWMode_Tessellated_Off;
  parameters.WriteName = true;
  return parameters;
}

Handle(TDocStd_Document) make_document(const Fixture& fixture) {
  Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
  XCAFDoc_DocumentTool::SetLengthUnit(document, 1.0,
                                      UnitsMethods_LengthUnit_Millimeter);
  const auto shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
  const TDF_Label assembly = shapes->NewShape();
  set_name(assembly, fixture.root);
  std::map<std::string, TDF_Label> definitions;
  for (const Component& component : fixture.components) {
    auto found = definitions.find(component.definition_key);
    if (found == definitions.end()) {
      const TDF_Label definition = shapes->AddShape(component.shape, false);
      set_name(definition, component.definition_name);
      found = definitions.emplace(component.definition_key, definition).first;
    }
    const TDF_Label occurrence = shapes->AddComponent(
        assembly, found->second, TopLoc_Location(component.location));
    set_name(occurrence, component.occurrence);
  }
  shapes->UpdateAssemblies();
  return document;
}

void write_document(const Handle(TDocStd_Document)& document,
                    const std::filesystem::path& path) {
  STEPCAFControl_Writer writer;
  writer.SetNameMode(true);
  if (!writer.Transfer(document, write_parameters(), STEPControl_AsIs)) {
    throw std::runtime_error("AP242 transfer failed: " + path.string());
  }
  if (writer.Write(path.string().c_str()) != IFSelect_RetDone) {
    throw std::runtime_error("AP242 write failed: " + path.string());
  }
  if (std::filesystem::file_size(path) > kMaxFileBytes) {
    throw std::range_error("generated STEP exceeds 4 MiB: " + path.string());
  }
}

void export_all(const std::filesystem::path& directory) {
  std::filesystem::create_directories(directory);
  for (const Fixture& fixture : build_fixtures()) {
    write_document(make_document(fixture), directory / fixture.file);
  }
}

std::string read_text(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  const std::string text((std::istreambuf_iterator<char>(input)),
                         std::istreambuf_iterator<char>());
  if (input.bad()) throw std::runtime_error("file read failed: " + path.string());
  return text;
}

std::string sha256_hex(const std::string& value) {
  std::array<unsigned char, CC_SHA256_DIGEST_LENGTH> digest{};
  CC_SHA256(value.data(), static_cast<CC_LONG>(value.size()), digest.data());
  std::ostringstream output;
  output << std::hex << std::setfill('0');
  for (unsigned char byte : digest) output << std::setw(2) << static_cast<int>(byte);
  return output.str();
}

std::string json_string(std::string_view value) {
  std::ostringstream output;
  output << '"';
  for (unsigned char character : value) {
    switch (character) {
      case '"': output << "\\\""; break;
      case '\\': output << "\\\\"; break;
      case '\b': output << "\\b"; break;
      case '\f': output << "\\f"; break;
      case '\n': output << "\\n"; break;
      case '\r': output << "\\r"; break;
      case '\t': output << "\\t"; break;
      default:
        if (character < 0x20) {
          output << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                 << static_cast<int>(character) << std::dec;
        } else {
          output << character;
        }
    }
  }
  output << '"';
  return output.str();
}

Handle(TDocStd_Document) read_document(const std::filesystem::path& path) {
  Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
  STEPCAFControl_Reader reader;
  reader.SetNameMode(true);
  if (reader.ReadFile(path.string().c_str()) != IFSelect_RetDone ||
      !reader.Transfer(document)) {
    throw std::runtime_error("STEP XDE import failed: " + path.string());
  }
  return document;
}

double document_unit_mm(const Handle(TDocStd_Document)& document) {
  double unit = 0;
  if (!XCAFDoc_DocumentTool::GetLengthUnit(
          document, unit, UnitsMethods_LengthUnit_Millimeter)) {
    throw std::runtime_error("STEP document has no source length unit");
  }
  return unit;
}

const char* orientation_name(TopAbs_Orientation orientation) {
  switch (orientation) {
    case TopAbs_FORWARD: return "FORWARD";
    case TopAbs_REVERSED: return "REVERSED";
    case TopAbs_INTERNAL: return "INTERNAL";
    case TopAbs_EXTERNAL: return "EXTERNAL";
  }
  return "UNKNOWN";
}

void write_xyz(std::ostream& output, const gp_XYZ& point) {
  output << '[' << point.X() << ',' << point.Y() << ',' << point.Z() << ']';
}

void write_point(std::ostream& output, const gp_Pnt& point) {
  write_xyz(output, point.XYZ());
}

void write_direction(std::ostream& output, const gp_Dir& direction) {
  write_xyz(output, direction.XYZ());
}

void write_transform(std::ostream& output, const gp_Trsf& transform) {
  output << '[';
  for (int row = 1; row <= 3; ++row) {
    for (int column = 1; column <= 4; ++column) {
      if (row != 1 || column != 1) output << ',';
      output << transform.Value(row, column);
    }
  }
  output << ']';
}

void write_bounds(std::ostream& output, const TopoDS_Shape& shape) {
  Bnd_Box bounds;
  BRepBndLib::AddOptimal(shape, bounds, false, false);
  double x0, y0, z0, x1, y1, z1;
  bounds.Get(x0, y0, z0, x1, y1, z1);
  output << "{\"min\":[" << x0 << ',' << y0 << ',' << z0
         << "],\"max\":[" << x1 << ',' << y1 << ',' << z1 << "]}";
}

std::vector<int> explorer_ordinals(const TopoDS_Shape& shape,
                                   TopAbs_ShapeEnum kind,
                                   const TopTools_IndexedMapOfShape& map) {
  std::vector<int> ordinals(static_cast<std::size_t>(map.Extent() + 1), -1);
  int ordinal = 0;
  for (TopExp_Explorer explorer(shape, kind); explorer.More(); explorer.Next()) {
    const int id = map.FindIndex(explorer.Current());
    if (id > 0 && ordinals.at(static_cast<std::size_t>(id)) < 0) {
      ordinals.at(static_cast<std::size_t>(id)) = ordinal;
    }
    ++ordinal;
  }
  return ordinals;
}

void write_int_list(std::ostream& output, const std::vector<int>& values) {
  output << '[';
  for (std::size_t index = 0; index < values.size(); ++index) {
    if (index) output << ',';
    output << values[index];
  }
  output << ']';
}

std::vector<int> ancestor_ids(
    const TopoDS_Shape& shape,
    const TopTools_IndexedDataMapOfShapeListOfShape& ancestors,
    const TopTools_IndexedMapOfShape& ids) {
  std::vector<int> result;
  if (!ancestors.Contains(shape)) return result;
  const TopTools_ListOfShape& list = ancestors.FindFromKey(shape);
  for (const TopoDS_Shape& ancestor : list) {
    const int id = ids.FindIndex(ancestor);
    if (id > 0) result.push_back(id);
  }
  return result;
}

void inspect_component(std::ostream& output, const TopoDS_Shape& shape) {
  require_valid(shape, "imported occurrence");
  TopTools_IndexedMapOfShape solids;
  TopTools_IndexedMapOfShape faces;
  TopTools_IndexedMapOfShape wires;
  TopTools_IndexedMapOfShape edges;
  TopExp::MapShapes(shape, TopAbs_SOLID, solids);
  TopExp::MapShapes(shape, TopAbs_FACE, faces);
  TopExp::MapShapes(shape, TopAbs_WIRE, wires);
  TopExp::MapShapes(shape, TopAbs_EDGE, edges);
  const auto solid_ordinals = explorer_ordinals(shape, TopAbs_SOLID, solids);
  const auto face_ordinals = explorer_ordinals(shape, TopAbs_FACE, faces);
  const auto wire_ordinals = explorer_ordinals(shape, TopAbs_WIRE, wires);
  const auto edge_ordinals = explorer_ordinals(shape, TopAbs_EDGE, edges);
  TopTools_IndexedDataMapOfShapeListOfShape face_solids;
  TopTools_IndexedDataMapOfShapeListOfShape edge_faces;
  TopExp::MapShapesAndAncestors(shape, TopAbs_FACE, TopAbs_SOLID, face_solids);
  TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, edge_faces);

  GProp_GProps properties;
  BRepGProp::VolumeProperties(shape, properties);
  output << "\"valid\":true,\"bounds\":";
  write_bounds(output, shape);
  output << ",\"observedNominalVolumeMm3\":" << properties.Mass()
         << ",\"counts\":{\"solids\":" << solids.Extent()
         << ",\"faces\":" << faces.Extent() << ",\"wires\":"
         << wires.Extent() << ",\"edges\":" << edges.Extent() << "}";

  output << ",\"solids\":[";
  for (int index = 1; index <= solids.Extent(); ++index) {
    if (index > 1) output << ',';
    std::vector<int> owned_faces;
    const TopoDS_Shape& solid = solids.FindKey(index);
    for (int face = 1; face <= faces.Extent(); ++face) {
      const auto owners = ancestor_ids(faces.FindKey(face), face_solids, solids);
      if (std::find(owners.begin(), owners.end(), index) != owners.end()) {
        owned_faces.push_back(face);
      }
    }
    output << "{\"privateUniqueMapId\":" << index
           << ",\"publicExplorerOrdinal\":"
           << solid_ordinals.at(static_cast<std::size_t>(index))
           << ",\"faceIds\":";
    write_int_list(output, owned_faces);
    output << '}';
  }
  output << ']';

  output << ",\"faces\":[";
  for (int index = 1; index <= faces.Extent(); ++index) {
    if (index > 1) output << ',';
    const TopoDS_Face face = TopoDS::Face(faces.FindKey(index));
    const BRepAdaptor_Surface surface(face, true);
    output << "{\"privateUniqueMapId\":" << index
           << ",\"publicExplorerOrdinal\":"
           << face_ordinals.at(static_cast<std::size_t>(index))
           << ",\"orientation\":" << json_string(orientation_name(face.Orientation()))
           << ",\"ownerSolidIds\":";
    write_int_list(output, ancestor_ids(face, face_solids, solids));
    output << ",\"surface\":";
    if (surface.GetType() == GeomAbs_Plane) {
      const gp_Pln plane = surface.Plane();
      output << "{\"type\":\"plane\",\"origin\":";
      write_point(output, plane.Location());
      output << ",\"normal\":";
      write_direction(output, plane.Axis().Direction());
      output << ",\"parameters\":[" << surface.FirstUParameter() << ','
             << surface.LastUParameter() << ',' << surface.FirstVParameter()
             << ',' << surface.LastVParameter() << "]}";
    } else if (surface.GetType() == GeomAbs_Cylinder) {
      const gp_Cylinder cylinder = surface.Cylinder();
      output << "{\"type\":\"cylinder\",\"origin\":";
      write_point(output, cylinder.Location());
      output << ",\"axis\":";
      write_direction(output, cylinder.Axis().Direction());
      output << ",\"radius\":" << cylinder.Radius()
             << ",\"parameters\":[" << surface.FirstUParameter() << ','
             << surface.LastUParameter() << ',' << surface.FirstVParameter()
             << ',' << surface.LastVParameter() << "]}";
    } else {
      output << "{\"type\":\"other\",\"geomAbsType\":"
             << static_cast<int>(surface.GetType()) << '}';
    }
    const TopoDS_Wire outer = BRepTools::OuterWire(face);
    output << ",\"wires\":[";
    bool first_wire = true;
    for (TopExp_Explorer explorer(face, TopAbs_WIRE); explorer.More(); explorer.Next()) {
      const TopoDS_Wire wire = TopoDS::Wire(explorer.Current());
      if (!first_wire) output << ',';
      first_wire = false;
      const int wire_id = wires.FindIndex(wire);
      output << "{\"privateUniqueMapId\":" << wire_id
             << ",\"publicExplorerOrdinal\":"
             << wire_ordinals.at(static_cast<std::size_t>(wire_id))
             << ",\"membership\":"
             << json_string(!outer.IsNull() && wire.IsSame(outer) ? "outer" : "inner")
             << ",\"uses\":[";
      bool first_use = true;
      for (BRepTools_WireExplorer wire_explorer(wire, face); wire_explorer.More();
           wire_explorer.Next()) {
        const TopoDS_Edge edge = wire_explorer.Current();
        if (!first_use) output << ',';
        first_use = false;
        output << "{\"edgeId\":" << edges.FindIndex(edge)
               << ",\"orientation\":"
               << json_string(orientation_name(edge.Orientation())) << '}';
      }
      output << "]}";
    }
    output << "]}";
  }
  output << ']';

  output << ",\"edges\":[";
  for (int index = 1; index <= edges.Extent(); ++index) {
    if (index > 1) output << ',';
    const TopoDS_Edge edge = TopoDS::Edge(edges.FindKey(index));
    const BRepAdaptor_Curve curve(edge);
    const auto adjacent = ancestor_ids(edge, edge_faces, faces);
    output << "{\"privateUniqueMapId\":" << index
           << ",\"publicExplorerOrdinal\":"
           << edge_ordinals.at(static_cast<std::size_t>(index))
           << ",\"orientation\":" << json_string(orientation_name(edge.Orientation()))
           << ",\"degenerated\":" << (BRep_Tool::Degenerated(edge) ? "true" : "false")
           << ",\"topologicallyClosed\":" << (BRep_Tool::IsClosed(edge) ? "true" : "false")
           << ",\"adjacentFaceIds\":";
    write_int_list(output, adjacent);
    output << ",\"seamOnFaceIds\":[";
    bool first_seam = true;
    for (int face_id : adjacent) {
      if (!BRep_Tool::IsClosed(edge, TopoDS::Face(faces.FindKey(face_id)))) continue;
      if (!first_seam) output << ',';
      first_seam = false;
      output << face_id;
    }
    output << "],\"curve\":";
    if (curve.GetType() == GeomAbs_Circle) {
      const gp_Circ circle = curve.Circle();
      output << "{\"type\":\"circle\",\"center\":";
      write_point(output, circle.Location());
      output << ",\"axis\":";
      write_direction(output, circle.Axis().Direction());
      output << ",\"radius\":" << circle.Radius() << ",\"parameters\":["
             << curve.FirstParameter() << ',' << curve.LastParameter() << "]}";
    } else if (curve.GetType() == GeomAbs_Line) {
      const gp_Lin line = curve.Line();
      output << "{\"type\":\"line\",\"origin\":";
      write_point(output, line.Location());
      output << ",\"direction\":";
      write_direction(output, line.Direction());
      output << ",\"parameters\":[" << curve.FirstParameter() << ','
             << curve.LastParameter() << "]}";
    } else {
      output << "{\"type\":\"other\",\"geomAbsType\":"
             << static_cast<int>(curve.GetType()) << ",\"parameters\":["
             << curve.FirstParameter() << ',' << curve.LastParameter() << "]}";
    }
    output << '}';
  }
  output << ']';
}

void inspect_fixture(std::ostream& output, const std::filesystem::path& path,
                     const FixtureSpec& spec) {
  const std::string source = read_text(path);
  if (source.find(kAp242Schema) == std::string::npos) {
    throw std::runtime_error("generated file is not AP242: " + path.string());
  }
  for (const std::string& name : spec.occurrences) {
    if (source.find(name) == std::string::npos) {
      throw std::runtime_error("STEP token missing: " + name);
    }
  }
  const Handle(TDocStd_Document) document = read_document(path);
  const auto shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
  NCollection_Sequence<TDF_Label> roots;
  shapes->GetFreeShapes(roots);
  if (roots.Length() != 1 || !XCAFDoc_ShapeTool::IsAssembly(roots.Value(1)) ||
      label_name(roots.Value(1)) != spec.root) {
    throw std::runtime_error("round-tripped root assembly mismatch: " + path.string());
  }
  NCollection_Sequence<TDF_Label> components;
  if (!XCAFDoc_ShapeTool::GetComponents(roots.Value(1), components) ||
      components.Length() != static_cast<int>(spec.occurrences.size())) {
    throw std::runtime_error("round-tripped occurrence count mismatch: " + path.string());
  }

  std::size_t entity_records = 0;
  for (std::size_t position = 0; (position = source.find("\n#", position)) != std::string::npos; position += 2) ++entity_records;
  output << "{\"id\":" << json_string(spec.id) << ",\"file\":"
         << json_string(spec.file) << ",\"primary\":{\"sha256\":"
         << json_string(sha256_hex(source)) << ",\"byteLength\":"
         << source.size() << ",\"entityRecordCount\":" << entity_records
         << "},\"fileSchema\":" << json_string(kAp242Schema)
         << ",\"sourceUnit\":\"mm\",\"sourceUnitToMillimeters\":"
         << document_unit_mm(document) << ",\"root\":{\"name\":"
         << json_string(label_name(roots.Value(1))) << ",\"labelEntry\":"
         << json_string(label_entry(roots.Value(1))) << "},\"occurrences\":[";
  std::vector<std::string> referred_entries;
  for (int index = 1; index <= components.Length(); ++index) {
    const TDF_Label component = components.Value(index);
    if (label_name(component) != spec.occurrences.at(static_cast<std::size_t>(index - 1))) {
      throw std::runtime_error(
          std::string("round-tripped occurrence order/name mismatch: ") + spec.id);
    }
    TDF_Label referred;
    if (!XCAFDoc_ShapeTool::GetReferredShape(component, referred)) {
      throw std::runtime_error(std::string("missing referred definition: ") +
                               spec.id);
    }
    referred_entries.push_back(label_entry(referred));
    const TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(component);
    if (index > 1) output << ',';
    output << "{\"order\":" << index - 1 << ",\"name\":"
           << json_string(label_name(component)) << ",\"selector\":"
           << json_string("path:" + std::string(spec.root) + "/" + label_name(component))
           << ",\"componentLabelEntry\":" << json_string(label_entry(component))
           << ",\"referredLabelEntry\":" << json_string(label_entry(referred))
           << ",\"referredName\":" << json_string(label_name(referred))
           << ",\"location3x4RowMajor\":";
    write_transform(output, XCAFDoc_ShapeTool::GetLocation(component).Transformation());
    output << ',';
    inspect_component(output, shape);
    output << '}';
  }
  if (spec.shared_definition &&
      (referred_entries.size() != 2 || referred_entries[0] != referred_entries[1])) {
    throw std::runtime_error("shared instance did not preserve one referred definition");
  }
  output << "],\"sharedDefinitionVerified\":"
         << (spec.shared_definition ? "true" : "false") << '}';
}

void inspect_all(const std::filesystem::path& directory,
                 const std::filesystem::path& output_path) {
  std::ofstream output(output_path);
  output << std::setprecision(std::numeric_limits<double>::max_digits10)
         << "{\"schemaVersion\":1,\"taskId\":\"M3-HOLE-TOPOLOGY-FIXTURES-A1\","
            "\"observationClass\":\"nominal AP242 imported raw topology facts; not a feature classifier, certificate or mathematical golden\","
            "\"topologyApis\":[\"TopExp::MapShapes\",\"TopExp::MapShapesAndAncestors\",\"TopExp_Explorer\",\"BRepTools::OuterWire\",\"BRepTools_WireExplorer\",\"BRep_Tool::IsClosed\",\"BRepAdaptor_Surface\",\"BRepAdaptor_Curve\"],"
            "\"fixtures\":[";
  for (std::size_t index = 0; index < kSpecs.size(); ++index) {
    if (index) output << ',';
    inspect_fixture(output, directory / kSpecs[index].file, kSpecs[index]);
  }
  output << "],\"candidateReadOrExecuted\":false}\n";
  if (!output) throw std::runtime_error("observation write failed");
}
}  // namespace

int main(int argc, char** argv) {
  if (argc < 3) return 2;
  try {
    const std::string mode = argv[1];
    if (mode == "export" && argc == 3) {
      export_all(argv[2]);
    } else if (mode == "inspect" && argc == 4) {
      inspect_all(argv[2], argv[3]);
    } else {
      return 2;
    }
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
