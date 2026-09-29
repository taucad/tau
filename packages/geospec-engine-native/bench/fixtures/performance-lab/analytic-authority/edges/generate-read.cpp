#define main hole_topology_fixture_unused_main
#include "../hole-topology-fixtures/generate-read.cpp"
#undef main

#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Geom2d_Curve.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <TopTools_ListOfShape.hxx>
#include <TopoDS_Vertex.hxx>
#include <gp.hxx>
#include <gp_Cone.hxx>
#include <gp_Elips.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>
#include <cmath>
#include <optional>

namespace edge_fixture {
struct BuiltShape {
  TopoDS_Shape shape;
  TopoDS_Face transition_face;
};

struct EdgeComponent {
  std::string occurrence;
  std::string definition_key;
  std::string definition_name;
  TopoDS_Shape shape;
  gp_Trsf location;
  TopoDS_Face labelled_face;
};

struct EdgeFixture {
  std::string id;
  std::string file;
  std::string root;
  std::vector<EdgeComponent> components;
  bool shared_definition = false;
};

struct EdgeFixtureSpec {
  const char* id;
  const char* file;
  const char* root;
  std::vector<std::string> occurrences;
  bool shared_definition;
};

const std::vector<EdgeFixtureSpec> kEdgeSpecs = {
    {"planar-chamfer", "01-planar-chamfer.step", "m3-edge-planar-chamfer", {"planar-chamfer-part"}, false},
    {"cylindrical-fillet", "02-cylindrical-fillet.step", "m3-edge-cylindrical-fillet", {"cylindrical-fillet-part"}, false},
    {"conical-chamfer", "03-conical-chamfer.step", "m3-edge-conical-chamfer", {"conical-chamfer-part"}, false},
    {"toroidal-fillet", "04-toroidal-fillet.step", "m3-edge-toroidal-fillet", {"toroidal-fillet-part"}, false},
    {"plain-box", "05-plain-box.step", "m3-edge-plain-box", {"plain-box-part"}, false},
    {"full-cylinder", "06-full-cylinder.step", "m3-edge-full-cylinder", {"full-cylinder-part"}, false},
    {"rotated-planar-chamfer", "07-rotated-planar-chamfer.step", "m3-edge-rotated-planar-chamfer", {"rotated-planar-chamfer-part"}, false},
    {"rotated-plain-box", "08-rotated-plain-box.step", "m3-edge-rotated-plain-box", {"rotated-plain-box-part"}, false},
    {"unrelated-planar-assembly", "09-unrelated-planar-assembly.step", "m3-edge-unrelated-planar-assembly", {"planar-chamfer-part", "unrelated-box"}, false},
    {"unrelated-cylinder-assembly", "10-unrelated-cylinder-assembly.step", "m3-edge-unrelated-cylinder-assembly", {"full-cylinder-part", "unrelated-box"}, false},
    {"shared-fillet-instances", "11-shared-fillet-instances.step", "m3-edge-shared-fillet-instances", {"fillet-instance-a", "fillet-instance-b"}, true},
};

TopoDS_Shape base_box() {
  return box(0, 0, 0, 10, 12, 14, "edge-treatment-base-box");
}

TopoDS_Shape base_cylinder() {
  const TopoDS_Shape shape =
      BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), gp::DZ()), 5, 10).Shape();
  require_valid(shape, "edge-treatment-base-cylinder");
  return shape;
}

TopoDS_Face unique_generated_face(const NCollection_List<TopoDS_Shape>& generated,
                                  GeomAbs_SurfaceType expected,
                                  std::string_view name) {
  TopoDS_Face selected;
  int count = 0;
  for (const TopoDS_Shape& item : generated) {
    if (item.ShapeType() == TopAbs_FACE) {
      const TopoDS_Face face = TopoDS::Face(item);
      if (BRepAdaptor_Surface(face, true).GetType() == expected) {
        selected = face;
        ++count;
      }
      continue;
    }
    for (TopExp_Explorer explorer(item, TopAbs_FACE); explorer.More(); explorer.Next()) {
      const TopoDS_Face face = TopoDS::Face(explorer.Current());
      if (BRepAdaptor_Surface(face, true).GetType() != expected) continue;
      selected = face;
      ++count;
    }
  }
  if (count != 1) {
    throw std::runtime_error(std::string(name) + " generated analytic face count=" +
                             std::to_string(count));
  }
  return selected;
}

TopoDS_Edge face_edge(const TopoDS_Face& face, const TopoDS_Edge& source,
                      std::string_view name) {
  for (TopExp_Explorer explorer(face, TopAbs_EDGE); explorer.More(); explorer.Next()) {
    const TopoDS_Edge candidate = TopoDS::Edge(explorer.Current());
    if (candidate.IsSame(source)) return candidate;
  }
  throw std::runtime_error(std::string(name) + " source edge missing from profile face");
}

TopoDS_Edge wire_edge_at(const TopoDS_Wire& wire, int wanted,
                         std::string_view name) {
  int index = 0;
  for (BRepTools_WireExplorer explorer(wire); explorer.More(); explorer.Next(), ++index) {
    if (index == wanted) return explorer.Current();
  }
  throw std::runtime_error(std::string(name) + " source edge slot missing from profile wire");
}

BuiltShape planar_chamfer() {
  const TopoDS_Edge e1 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0, 0), gp_Pnt(10, 0, 0));
  const TopoDS_Edge e2 = BRepBuilderAPI_MakeEdge(gp_Pnt(10, 0, 0), gp_Pnt(10, 11, 0));
  const TopoDS_Edge bevel = BRepBuilderAPI_MakeEdge(gp_Pnt(10, 11, 0), gp_Pnt(9, 12, 0));
  const TopoDS_Edge e4 = BRepBuilderAPI_MakeEdge(gp_Pnt(9, 12, 0), gp_Pnt(0, 12, 0));
  const TopoDS_Edge e5 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 12, 0), gp_Pnt(0, 0, 0));
  BRepBuilderAPI_MakeWire wire;
  wire.Add(e1);
  wire.Add(e2);
  wire.Add(bevel);
  wire.Add(e4);
  wire.Add(e5);
  const TopoDS_Wire profile_wire = wire.Wire();
  const TopoDS_Edge wire_bevel = wire_edge_at(profile_wire, 2, "planar chamfer");
  const TopoDS_Face profile = BRepBuilderAPI_MakeFace(profile_wire);
  const TopoDS_Edge profile_bevel = face_edge(profile, wire_bevel, "planar chamfer");
  BRepPrimAPI_MakePrism operation(profile, gp_Vec(0, 0, 14));
  const TopoDS_Shape result = operation.Shape();
  require_valid(result, "planar chamfer");
  return {result, unique_generated_face(operation.Generated(profile_bevel), GeomAbs_Plane,
                                        "planar chamfer")};
}

BuiltShape cylindrical_fillet() {
  const TopoDS_Edge e1 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0, 0), gp_Pnt(10, 0, 0));
  const TopoDS_Edge e2 = BRepBuilderAPI_MakeEdge(gp_Pnt(10, 0, 0), gp_Pnt(10, 10, 0));
  const double diagonal = std::sqrt(2.0);
  const Handle(Geom_TrimmedCurve) arc_curve =
      GC_MakeArcOfCircle(gp_Pnt(10, 10, 0), gp_Pnt(8 + diagonal, 10 + diagonal, 0),
                         gp_Pnt(8, 12, 0));
  const TopoDS_Edge arc = BRepBuilderAPI_MakeEdge(arc_curve);
  const TopoDS_Edge e4 = BRepBuilderAPI_MakeEdge(gp_Pnt(8, 12, 0), gp_Pnt(0, 12, 0));
  const TopoDS_Edge e5 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 12, 0), gp_Pnt(0, 0, 0));
  BRepBuilderAPI_MakeWire wire;
  wire.Add(e1);
  wire.Add(e2);
  wire.Add(arc);
  wire.Add(e4);
  wire.Add(e5);
  const TopoDS_Wire profile_wire = wire.Wire();
  const TopoDS_Edge wire_arc = wire_edge_at(profile_wire, 2, "cylindrical fillet");
  const TopoDS_Face profile = BRepBuilderAPI_MakeFace(profile_wire);
  const TopoDS_Edge profile_arc = face_edge(profile, wire_arc, "cylindrical fillet");
  BRepPrimAPI_MakePrism operation(profile, gp_Vec(0, 0, 14));
  const TopoDS_Shape result = operation.Shape();
  require_valid(result, "cylindrical fillet");
  return {result, unique_generated_face(operation.Generated(profile_arc), GeomAbs_Cylinder,
                                        "cylindrical fillet")};
}

BuiltShape conical_chamfer() {
  const TopoDS_Edge e1 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0, 0), gp_Pnt(5, 0, 0));
  const TopoDS_Edge e2 = BRepBuilderAPI_MakeEdge(gp_Pnt(5, 0, 0), gp_Pnt(5, 0, 9));
  const TopoDS_Edge bevel = BRepBuilderAPI_MakeEdge(gp_Pnt(5, 0, 9), gp_Pnt(4, 0, 10));
  const TopoDS_Edge e4 = BRepBuilderAPI_MakeEdge(gp_Pnt(4, 0, 10), gp_Pnt(0, 0, 10));
  const TopoDS_Edge e5 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0, 10), gp_Pnt(0, 0, 0));
  BRepBuilderAPI_MakeWire wire;
  wire.Add(e1);
  wire.Add(e2);
  wire.Add(bevel);
  wire.Add(e4);
  wire.Add(e5);
  const TopoDS_Wire profile_wire = wire.Wire();
  const TopoDS_Edge wire_bevel = wire_edge_at(profile_wire, 2, "conical chamfer");
  const TopoDS_Face profile = BRepBuilderAPI_MakeFace(profile_wire);
  const TopoDS_Edge profile_bevel = face_edge(profile, wire_bevel, "conical chamfer");
  BRepPrimAPI_MakeRevol operation(profile, gp_Ax1(gp_Pnt(0, 0, 0), gp::DZ()));
  const TopoDS_Shape result = operation.Shape();
  require_valid(result, "conical chamfer");
  return {result, unique_generated_face(operation.Generated(profile_bevel), GeomAbs_Cone,
                                        "conical chamfer")};
}

BuiltShape toroidal_fillet() {
  const TopoDS_Edge e1 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0, 0), gp_Pnt(5, 0, 0));
  const TopoDS_Edge e2 = BRepBuilderAPI_MakeEdge(gp_Pnt(5, 0, 0), gp_Pnt(5, 0, 9));
  const double half_diagonal = std::sqrt(0.5);
  const Handle(Geom_TrimmedCurve) arc_curve =
      GC_MakeArcOfCircle(gp_Pnt(5, 0, 9), gp_Pnt(4 + half_diagonal, 0, 9 + half_diagonal),
                         gp_Pnt(4, 0, 10));
  const TopoDS_Edge arc = BRepBuilderAPI_MakeEdge(arc_curve);
  const TopoDS_Edge e4 = BRepBuilderAPI_MakeEdge(gp_Pnt(4, 0, 10), gp_Pnt(0, 0, 10));
  const TopoDS_Edge e5 = BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0, 10), gp_Pnt(0, 0, 0));
  BRepBuilderAPI_MakeWire wire;
  wire.Add(e1);
  wire.Add(e2);
  wire.Add(arc);
  wire.Add(e4);
  wire.Add(e5);
  const TopoDS_Wire profile_wire = wire.Wire();
  const TopoDS_Edge wire_arc = wire_edge_at(profile_wire, 2, "toroidal fillet");
  const TopoDS_Face profile = BRepBuilderAPI_MakeFace(profile_wire);
  const TopoDS_Edge profile_arc = face_edge(profile, wire_arc, "toroidal fillet");
  BRepPrimAPI_MakeRevol operation(profile, gp_Ax1(gp_Pnt(0, 0, 0), gp::DZ()));
  const TopoDS_Shape result = operation.Shape();
  require_valid(result, "toroidal fillet");
  return {result, unique_generated_face(operation.Generated(profile_arc), GeomAbs_Torus,
                                        "toroidal fillet")};
}

gp_Trsf rational_transform() {
  gp_Trsf transform;
  transform.SetValues(3.0 / 5.0, -4.0 / 5.0, 0, 20, 4.0 / 5.0, 3.0 / 5.0,
                      0, 30, 0, 0, 1, 40);
  return transform;
}

std::vector<EdgeFixture> build_edge_fixtures() {
  const BuiltShape chamfer = planar_chamfer();
  const BuiltShape fillet = cylindrical_fillet();
  const BuiltShape cone = conical_chamfer();
  const BuiltShape torus = toroidal_fillet();
  const TopoDS_Shape plain_box = base_box();
  const TopoDS_Shape full_cylinder = base_cylinder();
  const TopoDS_Shape unrelated = box(100, 0, 0, 120, 20, 30, "unrelated-box");
  const gp_Trsf rotated = rational_transform();
  const gp_Trsf moved = translation(30, 0, 0);
  return {
      {"planar-chamfer", "01-planar-chamfer.step", "m3-edge-planar-chamfer",
       {{"planar-chamfer-part", "planar-chamfer-definition", "planar-chamfer-definition", chamfer.shape, gp_Trsf(), chamfer.transition_face}}},
      {"cylindrical-fillet", "02-cylindrical-fillet.step", "m3-edge-cylindrical-fillet",
       {{"cylindrical-fillet-part", "cylindrical-fillet-definition", "cylindrical-fillet-definition", fillet.shape, gp_Trsf(), TopoDS_Face()}}},
      {"conical-chamfer", "03-conical-chamfer.step", "m3-edge-conical-chamfer",
       {{"conical-chamfer-part", "conical-chamfer-definition", "conical-chamfer-definition", cone.shape, gp_Trsf(), TopoDS_Face()}}},
      {"toroidal-fillet", "04-toroidal-fillet.step", "m3-edge-toroidal-fillet",
       {{"toroidal-fillet-part", "toroidal-fillet-definition", "toroidal-fillet-definition", torus.shape, gp_Trsf(), TopoDS_Face()}}},
      {"plain-box", "05-plain-box.step", "m3-edge-plain-box",
       {{"plain-box-part", "plain-box-definition", "plain-box-definition", plain_box, gp_Trsf(), TopoDS_Face()}}},
      {"full-cylinder", "06-full-cylinder.step", "m3-edge-full-cylinder",
       {{"full-cylinder-part", "full-cylinder-definition", "full-cylinder-definition", full_cylinder, gp_Trsf(), TopoDS_Face()}}},
      {"rotated-planar-chamfer", "07-rotated-planar-chamfer.step", "m3-edge-rotated-planar-chamfer",
       {{"rotated-planar-chamfer-part", "planar-chamfer-definition", "planar-chamfer-definition", chamfer.shape, rotated, TopoDS_Face()}}},
      {"rotated-plain-box", "08-rotated-plain-box.step", "m3-edge-rotated-plain-box",
       {{"rotated-plain-box-part", "plain-box-definition", "plain-box-definition", plain_box, rotated, TopoDS_Face()}}},
      {"unrelated-planar-assembly", "09-unrelated-planar-assembly.step", "m3-edge-unrelated-planar-assembly",
       {{"planar-chamfer-part", "planar-chamfer-definition", "planar-chamfer-definition", chamfer.shape, gp_Trsf(), TopoDS_Face()},
        {"unrelated-box", "unrelated-box-definition", "unrelated-box-definition", unrelated, gp_Trsf(), TopoDS_Face()}}},
      {"unrelated-cylinder-assembly", "10-unrelated-cylinder-assembly.step", "m3-edge-unrelated-cylinder-assembly",
       {{"full-cylinder-part", "full-cylinder-definition", "full-cylinder-definition", full_cylinder, gp_Trsf(), TopoDS_Face()},
        {"unrelated-box", "unrelated-box-definition", "unrelated-box-definition", unrelated, gp_Trsf(), TopoDS_Face()}}},
      {"shared-fillet-instances", "11-shared-fillet-instances.step", "m3-edge-shared-fillet-instances",
       {{"fillet-instance-a", "shared-fillet-definition", "shared-fillet-definition", fillet.shape, gp_Trsf(), TopoDS_Face()},
        {"fillet-instance-b", "shared-fillet-definition", "shared-fillet-definition", fillet.shape, moved, TopoDS_Face()}}, true},
  };
}

Handle(TDocStd_Document) make_edge_document(const EdgeFixture& fixture) {
  Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
  XCAFDoc_DocumentTool::SetLengthUnit(document, 1.0,
                                      UnitsMethods_LengthUnit_Millimeter);
  const auto shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
  const TDF_Label assembly = shapes->NewShape();
  set_name(assembly, fixture.root);
  std::map<std::string, TDF_Label> definitions;
  for (const EdgeComponent& component : fixture.components) {
    auto found = definitions.find(component.definition_key);
    if (found == definitions.end()) {
      const TDF_Label definition = shapes->AddShape(component.shape, false);
      set_name(definition, component.definition_name);
      if (!component.labelled_face.IsNull()) {
        const TDF_Label face_label = shapes->AddSubShape(definition, component.labelled_face);
        if (face_label.IsNull()) throw std::runtime_error("failed to label transition face");
        set_name(face_label, "qualified transition");
      }
      found = definitions.emplace(component.definition_key, definition).first;
    }
    const TDF_Label occurrence = shapes->AddComponent(
        assembly, found->second, TopLoc_Location(component.location));
    set_name(occurrence, component.occurrence);
  }
  shapes->UpdateAssemblies();
  return document;
}

void export_edge_fixtures(const std::filesystem::path& directory) {
  std::filesystem::create_directories(directory);
  for (const EdgeFixture& fixture : build_edge_fixtures()) {
    write_document(make_edge_document(fixture), directory / fixture.file);
  }
}

const char* material_side(const TopoDS_Face& face) {
  if (face.Orientation() == TopAbs_FORWARD) return "negative-underlying-normal";
  if (face.Orientation() == TopAbs_REVERSED) return "positive-underlying-normal";
  return "unresolved-nonboundary-orientation";
}

void write_surface(std::ostream& output, const TopoDS_Face& face) {
  const BRepAdaptor_Surface surface(face, true);
  output << "{\"parameters\":[" << surface.FirstUParameter() << ','
         << surface.LastUParameter() << ',' << surface.FirstVParameter() << ','
         << surface.LastVParameter() << ']';
  if (surface.GetType() == GeomAbs_Plane) {
    const gp_Pln value = surface.Plane();
    output << ",\"type\":\"plane\",\"origin\":";
    write_point(output, value.Location());
    output << ",\"normal\":";
    write_direction(output, value.Axis().Direction());
    output << ",\"xDirection\":";
    write_direction(output, value.XAxis().Direction());
  } else if (surface.GetType() == GeomAbs_Cylinder) {
    const gp_Cylinder value = surface.Cylinder();
    output << ",\"type\":\"cylinder\",\"origin\":";
    write_point(output, value.Location());
    output << ",\"axis\":";
    write_direction(output, value.Axis().Direction());
    output << ",\"xDirection\":";
    write_direction(output, value.XAxis().Direction());
    output << ",\"radius\":" << value.Radius();
  } else if (surface.GetType() == GeomAbs_Cone) {
    const gp_Cone value = surface.Cone();
    output << ",\"type\":\"cone\",\"origin\":";
    write_point(output, value.Location());
    output << ",\"axis\":";
    write_direction(output, value.Axis().Direction());
    output << ",\"xDirection\":";
    write_direction(output, value.XAxis().Direction());
    output << ",\"referenceRadius\":" << value.RefRadius()
           << ",\"semiAngleRadians\":" << value.SemiAngle();
  } else if (surface.GetType() == GeomAbs_Torus) {
    const gp_Torus value = surface.Torus();
    output << ",\"type\":\"torus\",\"center\":";
    write_point(output, value.Location());
    output << ",\"axis\":";
    write_direction(output, value.Axis().Direction());
    output << ",\"xDirection\":";
    write_direction(output, value.XAxis().Direction());
    output << ",\"majorRadius\":" << value.MajorRadius()
           << ",\"minorRadius\":" << value.MinorRadius();
  } else if (surface.GetType() == GeomAbs_Sphere) {
    const gp_Sphere value = surface.Sphere();
    output << ",\"type\":\"sphere\",\"center\":";
    write_point(output, value.Location());
    output << ",\"radius\":" << value.Radius();
  } else {
    output << ",\"type\":\"other\",\"geomAbsType\":"
           << static_cast<int>(surface.GetType());
  }
  output << '}';
}

void inspect_edge_details(std::ostream& output, const TopoDS_Shape& shape) {
  TopTools_IndexedMapOfShape faces;
  TopTools_IndexedMapOfShape wires;
  TopTools_IndexedMapOfShape edges;
  TopTools_IndexedMapOfShape vertices;
  TopExp::MapShapes(shape, TopAbs_FACE, faces);
  TopExp::MapShapes(shape, TopAbs_WIRE, wires);
  TopExp::MapShapes(shape, TopAbs_EDGE, edges);
  TopExp::MapShapes(shape, TopAbs_VERTEX, vertices);
  const auto face_ordinals = explorer_ordinals(shape, TopAbs_FACE, faces);
  const auto wire_ordinals = explorer_ordinals(shape, TopAbs_WIRE, wires);
  const auto edge_ordinals = explorer_ordinals(shape, TopAbs_EDGE, edges);
  const auto vertex_ordinals = explorer_ordinals(shape, TopAbs_VERTEX, vertices);
  double max_tolerance = 0;
  for (int i = 1; i <= faces.Extent(); ++i)
    max_tolerance = std::max(max_tolerance, BRep_Tool::Tolerance(TopoDS::Face(faces.FindKey(i))));
  for (int i = 1; i <= edges.Extent(); ++i)
    max_tolerance = std::max(max_tolerance, BRep_Tool::Tolerance(TopoDS::Edge(edges.FindKey(i))));
  for (int i = 1; i <= vertices.Extent(); ++i)
    max_tolerance = std::max(max_tolerance, BRep_Tool::Tolerance(TopoDS::Vertex(vertices.FindKey(i))));
  output << "{\"maxTopologyTolerance\":" << max_tolerance
         << ",\"vertexCount\":" << vertices.Extent() << ",\"faces\":[";
  for (int i = 1; i <= faces.Extent(); ++i) {
    if (i > 1) output << ',';
    const TopoDS_Face face = TopoDS::Face(faces.FindKey(i));
    const TopoDS_Wire outer = BRepTools::OuterWire(face);
    output << "{\"privateUniqueMapId\":" << i
           << ",\"publicExplorerOrdinal\":" << face_ordinals.at(i)
           << ",\"orientation\":" << json_string(orientation_name(face.Orientation()))
           << ",\"materialSideRelativeToUnderlyingSurface\":"
           << json_string(material_side(face)) << ",\"tolerance\":"
           << BRep_Tool::Tolerance(face) << ",\"surface\":";
    write_surface(output, face);
    output << ",\"wires\":[";
    bool first_wire = true;
    for (TopExp_Explorer wire_explorer(face, TopAbs_WIRE); wire_explorer.More();
         wire_explorer.Next()) {
      const TopoDS_Wire wire = TopoDS::Wire(wire_explorer.Current());
      if (!first_wire) output << ',';
      first_wire = false;
      const int wire_id = wires.FindIndex(wire);
      output << "{\"privateUniqueMapId\":" << wire_id
             << ",\"publicExplorerOrdinal\":" << wire_ordinals.at(wire_id)
             << ",\"membership\":"
             << json_string(!outer.IsNull() && wire.IsSame(outer) ? "outer" : "inner")
             << ",\"uses\":[";
      bool first_use = true;
      int use_index = 0;
      for (BRepTools_WireExplorer use(wire, face); use.More(); use.Next(), ++use_index) {
        const TopoDS_Edge edge = use.Current();
        if (!first_use) output << ',';
        first_use = false;
        double first = 0;
        double last = 0;
        const Handle(Geom2d_Curve) pcurve = BRep_Tool::CurveOnSurface(edge, face, first, last);
        output << "{\"edgeUseIndex\":" << use_index << ",\"edgeId\":"
               << edges.FindIndex(edge) << ",\"orientation\":"
               << json_string(orientation_name(edge.Orientation()))
               << ",\"seamOnFace\":" << (BRep_Tool::IsClosed(edge, face) ? "true" : "false")
               << ",\"pcurveStored\":" << (!pcurve.IsNull() ? "true" : "false")
               << ",\"pcurveRange\":[" << first << ',' << last << "]}";
      }
      output << "]}";
    }
    output << "]}";
  }
  output << "],\"edges\":[";
  for (int i = 1; i <= edges.Extent(); ++i) {
    if (i > 1) output << ',';
    const TopoDS_Edge edge = TopoDS::Edge(edges.FindKey(i));
    TopoDS_Vertex first_vertex;
    TopoDS_Vertex last_vertex;
    TopExp::Vertices(edge, first_vertex, last_vertex, true);
    output << "{\"privateUniqueMapId\":" << i
           << ",\"publicExplorerOrdinal\":" << edge_ordinals.at(i)
           << ",\"tolerance\":" << BRep_Tool::Tolerance(edge)
           << ",\"firstVertexId\":" << vertices.FindIndex(first_vertex)
           << ",\"lastVertexId\":" << vertices.FindIndex(last_vertex) << '}';
  }
  output << "],\"vertices\":[";
  for (int i = 1; i <= vertices.Extent(); ++i) {
    if (i > 1) output << ',';
    const TopoDS_Vertex vertex = TopoDS::Vertex(vertices.FindKey(i));
    output << "{\"privateUniqueMapId\":" << i
           << ",\"publicExplorerOrdinal\":" << vertex_ordinals.at(i)
           << ",\"orientation\":" << json_string(orientation_name(vertex.Orientation()))
           << ",\"tolerance\":" << BRep_Tool::Tolerance(vertex) << ",\"point\":";
    write_point(output, BRep_Tool::Pnt(vertex));
    output << '}';
  }
  output << "]}";
}

void write_label_associations(std::ostream& output,
                              const Handle(XCAFDoc_ShapeTool)& shapes,
                              const TDF_Label& component,
                              const TDF_Label& referred,
                              const TopoDS_Shape& occurrence_shape) {
  TopTools_IndexedMapOfShape definition_faces;
  TopTools_IndexedMapOfShape occurrence_faces;
  const TopoDS_Shape definition_shape = XCAFDoc_ShapeTool::GetShape(referred);
  TopExp::MapShapes(definition_shape, TopAbs_FACE, definition_faces);
  TopExp::MapShapes(occurrence_shape, TopAbs_FACE, occurrence_faces);
  const auto occurrence_ordinals =
      explorer_ordinals(occurrence_shape, TopAbs_FACE, occurrence_faces);
  NCollection_Sequence<TDF_Label> labels;
  XCAFDoc_ShapeTool::GetSubShapes(referred, labels);
  output << '[';
  bool first = true;
  for (int index = 1; index <= labels.Length(); ++index) {
    const TDF_Label label = labels.Value(index);
    const std::string name = label_name(label);
    const TopoDS_Shape local = XCAFDoc_ShapeTool::GetShape(label);
    if (name.empty() || local.ShapeType() != TopAbs_FACE) continue;
    const TopoDS_Shape located = local.Moved(XCAFDoc_ShapeTool::GetLocation(component));
    const int occurrence_id = occurrence_faces.FindIndex(located);
    if (!first) output << ',';
    first = false;
    output << "{\"name\":" << json_string(name) << ",\"labelEntry\":"
           << json_string(label_entry(label)) << ",\"definitionPrivateFaceId\":"
           << definition_faces.FindIndex(local) << ",\"occurrencePrivateFaceId\":"
           << occurrence_id << ",\"occurrencePublicExplorerOrdinal\":"
           << (occurrence_id > 0 ? occurrence_ordinals.at(occurrence_id) : -1) << '}';
  }
  output << ']';
}

void inspect_edge_fixture(std::ostream& output, const std::filesystem::path& path,
                          const EdgeFixtureSpec& spec) {
  const std::string source = read_text(path);
  if (source.find(kAp242Schema) == std::string::npos)
    throw std::runtime_error("generated file is not AP242: " + path.string());
  const Handle(TDocStd_Document) document = read_document(path);
  const auto shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
  NCollection_Sequence<TDF_Label> roots;
  shapes->GetFreeShapes(roots);
  if (roots.Length() != 1 || !XCAFDoc_ShapeTool::IsAssembly(roots.Value(1)) ||
      label_name(roots.Value(1)) != spec.root)
    throw std::runtime_error("round-tripped root mismatch: " + path.string());
  NCollection_Sequence<TDF_Label> components;
  if (!XCAFDoc_ShapeTool::GetComponents(roots.Value(1), components) ||
      components.Length() != static_cast<int>(spec.occurrences.size()))
    throw std::runtime_error("round-tripped occurrence count mismatch: " + path.string());
  std::size_t entity_records = 0;
  for (std::size_t position = 0; (position = source.find("\n#", position)) != std::string::npos;
       position += 2)
    ++entity_records;
  output << "{\"id\":" << json_string(spec.id) << ",\"file\":"
         << json_string(spec.file) << ",\"primary\":{\"sha256\":"
         << json_string(sha256_hex(source)) << ",\"byteLength\":" << source.size()
         << ",\"entityRecordCount\":" << entity_records << "},\"fileSchema\":"
         << json_string(kAp242Schema) << ",\"sourceUnitLabel\":\"mm\","
            "\"sourceUnitToMillimeters\":"
         << document_unit_mm(document) << ",\"root\":{\"name\":"
         << json_string(label_name(roots.Value(1))) << ",\"labelEntry\":"
         << json_string(label_entry(roots.Value(1))) << "},\"occurrences\":[";
  std::vector<std::string> referred_entries;
  for (int index = 1; index <= components.Length(); ++index) {
    const TDF_Label component = components.Value(index);
    if (label_name(component) != spec.occurrences.at(index - 1))
      throw std::runtime_error("round-tripped occurrence order/name mismatch: " +
                               std::string(spec.id));
    TDF_Label referred;
    if (!XCAFDoc_ShapeTool::GetReferredShape(component, referred))
      throw std::runtime_error("missing referred definition: " + std::string(spec.id));
    referred_entries.push_back(label_entry(referred));
    const TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(component);
    if (index > 1) output << ',';
    output << "{\"order\":" << index - 1 << ",\"name\":"
           << json_string(label_name(component)) << ",\"path\":"
           << json_string(std::string(spec.root) + "/" + label_name(component))
           << ",\"selector\":"
           << json_string("path:" + std::string(spec.root) + "/" + label_name(component))
           << ",\"componentLabelEntry\":" << json_string(label_entry(component))
           << ",\"referredLabelEntry\":" << json_string(label_entry(referred))
           << ",\"referredName\":" << json_string(label_name(referred))
           << ",\"location3x4RowMajor\":";
    write_transform(output, XCAFDoc_ShapeTool::GetLocation(component).Transformation());
    output << ",\"sourceFaceLabels\":";
    write_label_associations(output, shapes, component, referred, shape);
    output << ',';
    inspect_component(output, shape);
    output << ",\"edgeTreatmentRaw\":";
    inspect_edge_details(output, shape);
    output << '}';
  }
  if (spec.shared_definition &&
      (referred_entries.size() != 2 || referred_entries[0] != referred_entries[1]))
    throw std::runtime_error("shared instance did not preserve one referred definition");
  output << "],\"sharedDefinitionVerified\":"
         << (spec.shared_definition ? "true" : "false") << '}';
}

void inspect_edge_fixtures(const std::filesystem::path& directory,
                           const std::filesystem::path& output_path) {
  std::ofstream output(output_path);
  output << std::setprecision(std::numeric_limits<double>::max_digits10)
         << "{\"schemaVersion\":1,\"taskId\":\"M3-EDGE-TREATMENT-FIXTURES-A1\","
            "\"observationClass\":\"nominal AP242 imported raw topology; independent fixture evidence, not candidate classification or exact-real authority\","
            "\"topologyApis\":[\"STEPCAFControl_Writer\",\"STEPCAFControl_Reader\",\"TopExp::MapShapes\",\"TopExp::MapShapesAndAncestors\",\"BRepTools::OuterWire\",\"BRepTools_WireExplorer\",\"BRep_Tool\",\"BRepAdaptor_Surface\",\"BRepAdaptor_Curve\"],\"fixtures\":[";
  for (std::size_t index = 0; index < kEdgeSpecs.size(); ++index) {
    if (index) output << ',';
    inspect_edge_fixture(output, directory / kEdgeSpecs[index].file, kEdgeSpecs[index]);
  }
  output << "],\"candidateReadOrExecuted\":false}\n";
  if (!output) throw std::runtime_error("observation write failed");
}
}  // namespace edge_fixture

int main(int argc, char** argv) {
  if (argc < 3) return 2;
  try {
    const std::string mode = argv[1];
    if (mode == "export" && argc == 3) {
      edge_fixture::export_edge_fixtures(argv[2]);
    } else if (mode == "inspect" && argc == 4) {
      edge_fixture::inspect_edge_fixtures(argv[2], argv[3]);
    } else {
      return 2;
    }
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
