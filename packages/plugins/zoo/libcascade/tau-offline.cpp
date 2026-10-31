// Native helpers for Tau's offline KCL engine: work that would otherwise cross the JS/WASM boundary per node,
// per edge or per sub-shape runs here in one call.
#include <BRepAdaptor_Curve.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GCPnts_TangentialDeflection.hxx>
#include <GProp_GProps.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Message.hxx>
#include <Message_Messenger.hxx>
#include <Message_Printer.hxx>
#include <Message_ProgressRange.hxx>
#include <Poly_PolygonOnTriangulation.hxx>
#include <Poly_Triangulation.hxx>
#include <RWGltf_CafReader.hxx>
#include <RWMesh_CafReader.hxx>
#include <RWObj_CafReader.hxx>
#include <RWStl.hxx>
#include <STEPControl_Reader.hxx>
#include <TCollection_AsciiString.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <gp_Trsf.hxx>
#include <gp_XYZ.hxx>
#include <emscripten/bind.h>
#include <cstdint>
#include <cstdlib>
#include <string>
#include <utility>
#include <vector>

using namespace emscripten;

namespace {

// Results larger than a scalar are left here and read by JS straight from `wasmMemory`, so no embind value types
// are needed: `TauOffline.doubles()` / `TauOffline.ints()` give the address and `doubleCount()` / `intCount()` the
// length of the last result.
std::vector<double> doubleOut;
std::vector<int> intOut;

// Samples of an edge on a meshed face's triangulation, in the shape's own frame.
bool polygonPoints(const TopoDS_Edge& edge, std::vector<double>& points) {
  Handle(Poly_PolygonOnTriangulation) polygon;
  Handle(Poly_Triangulation) triangulation;
  TopLoc_Location location;
  BRep_Tool::PolygonOnTriangulation(edge, polygon, triangulation, location);
  if (polygon.IsNull() || triangulation.IsNull()) {
    return false;
  }
  const gp_Trsf trsf = location.Transformation();
  const bool identity = location.IsIdentity();
  for (int index = 1; index <= polygon->NbNodes(); ++index) {
    gp_Pnt node = triangulation->Node(polygon->Node(index));
    if (!identity) {
      node.Transform(trsf);
    }
    points.push_back(node.X());
    points.push_back(node.Y());
    points.push_back(node.Z());
  }
  return true;
}

void curvePoints(const TopoDS_Edge& edge, double linear, double angular, std::vector<double>& points) {
  BRepAdaptor_Curve curve(edge);
  GCPnts_TangentialDeflection sampler(curve, curve.FirstParameter(), curve.LastParameter(), angular, linear, 2,
                                      1e-9, 1e-7);
  for (int index = 1; index <= sampler.NbPoints(); ++index) {
    const gp_Pnt point = sampler.Value(index);
    points.push_back(point.X());
    points.push_back(point.Y());
    points.push_back(point.Z());
  }
}


// Keeps the readers' progress and info messages off stdout while it lives; failures still print.
struct QuietMessenger {
  std::vector<std::pair<Handle(Message_Printer), Message_Gravity>> saved;
  QuietMessenger() {
    for (const Handle(Message_Printer)& printer : Message::DefaultMessenger()->Printers()) {
      saved.emplace_back(printer, printer->GetTraceLevel());
      printer->SetTraceLevel(Message_Fail);
    }
  }
  ~QuietMessenger() {
    for (auto& [printer, level] : saved) {
      printer->SetTraceLevel(level);
    }
  }
};

// Reads a mesh with no unit or axis conversion: the file's own coordinates come through, and the caller maps them.
TopoDS_Shape readMesh(RWMesh_CafReader& reader, const std::string& path) {
  reader.SetFileLengthUnit(1.0);
  reader.SetSystemLengthUnit(1.0);
  reader.SetFileCoordinateSystem(RWMesh_CoordinateSystem_Zup);
  reader.SetSystemCoordinateSystem(RWMesh_CoordinateSystem_Zup);
  if (!reader.Perform(TCollection_AsciiString(path.c_str()), Message_ProgressRange())) {
    return TopoDS_Shape();
  }
  return reader.SingleShape();
}

// Every triangulated face of a mesh body rebuilt as a surface-less face whose nodes are mapped by `trsf`, with the
// face's location and orientation baked in, so the result is a plain compound of triangle meshes in engine space.
TopoDS_Shape bakeMesh(const TopoDS_Shape& shape, const gp_Trsf& trsf) {
  BRep_Builder builder;
  TopoDS_Compound result;
  builder.MakeCompound(result);
  for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
    const TopoDS_Face& face = TopoDS::Face(explorer.Current());
    TopLoc_Location location;
    const Handle(Poly_Triangulation)& source = BRep_Tool::Triangulation(face, location);
    if (source.IsNull() || source->NbTriangles() < 1) {
      continue;
    }
    const gp_Trsf placed = trsf.Multiplied(location.Transformation());
    const bool flip = face.Orientation() == TopAbs_REVERSED;
    Handle(Poly_Triangulation) mesh = new Poly_Triangulation(source->NbNodes(), source->NbTriangles(), false);
    for (int index = 1; index <= source->NbNodes(); ++index) {
      mesh->SetNode(index, source->Node(index).Transformed(placed));
    }
    for (int index = 1; index <= source->NbTriangles(); ++index) {
      int a, b, c;
      source->Triangle(index).Get(a, b, c);
      mesh->SetTriangle(index, flip ? Poly_Triangle(a, c, b) : Poly_Triangle(a, b, c));
    }
    TopoDS_Face baked;
    builder.MakeFace(baked, mesh);
    builder.Add(result, baked);
  }
  return result;
}

}  // namespace

struct TauOffline {
  // Meshes a shape in OCCT's absolute mode; returns false when the mesher reports nothing was done.
  static bool mesh(const TopoDS_Shape& shape, double linear, double angular, bool parallel) {
    BRepMesh_IncrementalMesh mesher(shape, linear, false, angular, parallel);
    return mesher.IsDone();
  }

  // B-rep edges of a meshed shape as a de-indexed segment soup in the shape's root frame (double buffer), each edge
  // once and degenerate edges skipped, plus [start, count, edge] per edge (int buffer): the span counted in XYZ
  // scalars and the edge's 0-based index in `TopExp::MapShapes` order, which `topology` uses too. Returns the number
  // of edges.
  static int edges(const TopoDS_Shape& shape, double linear, double angular) {
    const TopoDS_Shape root = shape.Located(TopLoc_Location(), false);
    TopTools_IndexedMapOfShape map;
    TopExp::MapShapes(root, TopAbs_EDGE, map);
    std::vector<double>& lines = doubleOut;
    std::vector<int>& groups = intOut;
    lines.clear();
    groups.clear();
    std::vector<double> points;
    for (int index = 1; index <= map.Extent(); ++index) {
      const TopoDS_Edge& edge = TopoDS::Edge(map.FindKey(index));
      if (BRep_Tool::Degenerated(edge)) {
        continue;
      }
      points.clear();
      if (!polygonPoints(edge, points)) {
        try {
          curvePoints(edge, linear, angular, points);
        } catch (...) {
          continue;
        }
      }
      const int start = static_cast<int>(lines.size());
      for (size_t point = 3; point < points.size(); point += 3) {
        lines.insert(lines.end(), points.begin() + (point - 3), points.begin() + (point + 3));
      }
      groups.push_back(start);
      groups.push_back(static_cast<int>(lines.size()) - start);
      groups.push_back(index - 1);
    }
    return static_cast<int>(groups.size() / 3);
  }

  // Shell, face, loop and edge structure of a meshed solid, in the face order glTF writers emit primitives: faces
  // without triangles are skipped, as `RWGltf_CafWriter` skips them. The int buffer holds
  // [shells, (faces, (loops, (edges, edge...)...)...)...] with edges as 0-based `TopExp::MapShapes` indices. Faces
  // outside any shell form one shell. Returns the number of faces.
  static int topology(const TopoDS_Shape& shape) {
    TopTools_IndexedMapOfShape edgeMap;
    TopExp::MapShapes(shape, TopAbs_EDGE, edgeMap);
    std::vector<int>& out = intOut;
    out.clear();
    std::vector<TopoDS_Shape> shells;
    for (TopExp_Explorer explorer(shape, TopAbs_SHELL); explorer.More(); explorer.Next()) {
      shells.push_back(explorer.Current());
    }
    if (shells.empty()) {
      shells.push_back(shape);
    }
    int faceTotal = 0;
    out.push_back(static_cast<int>(shells.size()));
    for (const TopoDS_Shape& shell : shells) {
      const size_t faceCountAt = out.size();
      out.push_back(0);
      for (TopExp_Explorer faces(shell, TopAbs_FACE); faces.More(); faces.Next()) {
        const TopoDS_Face& face = TopoDS::Face(faces.Current());
        TopLoc_Location location;
        const Handle(Poly_Triangulation)& triangulation = BRep_Tool::Triangulation(face, location);
        if (triangulation.IsNull() || triangulation->NbTriangles() < 1) {
          continue;
        }
        ++out[faceCountAt];
        ++faceTotal;
        const size_t loopCountAt = out.size();
        out.push_back(0);
        for (TopExp_Explorer wires(face, TopAbs_WIRE); wires.More(); wires.Next()) {
          ++out[loopCountAt];
          const size_t edgeCountAt = out.size();
          out.push_back(0);
          for (TopExp_Explorer edges(wires.Current(), TopAbs_EDGE); edges.More(); edges.Next()) {
            ++out[edgeCountAt];
            out.push_back(edgeMap.FindIndex(edges.Current()) - 1);
          }
        }
      }
    }
    return faceTotal;
  }

  // Enclosed volume: the sum over the shape's solids, so open surface bodies count as zero.
  static double volume(const TopoDS_Shape& shape) {
    double total = 0;
    for (TopExp_Explorer explorer(shape, TopAbs_SOLID); explorer.More(); explorer.Next()) {
      GProp_GProps props;
      BRepGProp::VolumeProperties(explorer.Current(), props, false, false, false);
      total += props.Mass();
    }
    return total;
  }

  // Surface area of the B-rep faces. Surface-less faces (imported meshes) count as zero, as Zoo's mass properties
  // leave mesh bodies out.
  static double area(const TopoDS_Shape& shape) {
    GProp_GProps props;
    bool meshFaces = false;
    for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More() && !meshFaces; explorer.Next()) {
      meshFaces = !BRep_Tool::IsGeometric(TopoDS::Face(explorer.Current()));
    }
    if (!meshFaces) {
      BRepGProp::SurfaceProperties(shape, props, false, false);
      return props.Mass();
    }
    double total = 0;
    for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
      const TopoDS_Face& face = TopoDS::Face(explorer.Current());
      if (BRep_Tool::IsGeometric(face)) {
        GProp_GProps faceProps;
        BRepGProp::SurfaceProperties(face, faceProps, false, false);
        total += faceProps.Mass();
      }
    }
    return total;
  }

  // Area and area-weighted centre, left in the double buffer as [area, x, y, z].
  static double surfaceCentroid(const TopoDS_Shape& shape) {
    GProp_GProps props;
    BRepGProp::SurfaceProperties(shape, props, false, false);
    const gp_Pnt center = props.CentreOfMass();
    doubleOut.assign({props.Mass(), center.X(), center.Y(), center.Z()});
    return props.Mass();
  }

  // Cheap axis-aligned box left in the double buffer as [xmin, ymin, zmin, xmax, ymax, zmax]; false when the shape
  // has no extent.
  static bool bounds(const TopoDS_Shape& shape) {
    Bnd_Box box;
    BRepBndLib::Add(shape, box, false);
    doubleOut.clear();
    if (box.IsVoid()) {
      return false;
    }
    double x0, y0, z0, x1, y1, z1;
    box.Get(x0, y0, z0, x1, y1, z1);
    doubleOut.assign({x0, y0, z0, x1, y1, z1});
    return true;
  }

  static unsigned int doubles() { return reinterpret_cast<uintptr_t>(doubleOut.data()); }
  static int doubleCount() { return static_cast<int>(doubleOut.size()); }
  static unsigned int ints() { return reinterpret_cast<uintptr_t>(intOut.data()); }
  static int intCount() { return static_cast<int>(intOut.size()); }

  // Topological validity of a boolean or offset result, without computing mass properties.
  static bool isValid(const TopoDS_Shape& shape) {
    if (shape.IsNull()) {
      return false;
    }
    BRepCheck_Analyzer analyzer(shape, false);
    return analyzer.IsValid();
  }

  // Reads a file written to the in-memory filesystem, for KCL `import`, by its `InputFormat3d` type: "step" gives a
  // B-rep (read in millimetres); "gltf" (glTF or GLB), "obj" and "stl" give meshes, kept as surface-less triangle
  // faces. The result is mapped into engine space (millimetres, Z up, -Y forward) from the file's axes, given as axis
  // codes (1, 2, 3 for +X, +Y, +Z; negative for the opposite direction), and its unit in millimetres. glTF ignores
  // both: its frame is fixed by the spec (Y up, +Z forward, metres). Returns a null shape when the file cannot be read.
  static TopoDS_Shape importFile(const std::string& path, const std::string& format, int forward, int up,
                                 double millimetresPerUnit) {
    const QuietMessenger quiet;
    if (format == "gltf") {
      forward = 3;
      up = 2;
      millimetresPerUnit = 1000;
    } else if (format == "step") {
      millimetresPerUnit = 1;
    }
    // Rows of the map: the engine's X = back x up, Y = back (the opposite of forward), Z = up, in file coordinates.
    const auto axis = [](int code) {
      gp_XYZ vector(0, 0, 0);
      vector.SetCoord(std::abs(code), code < 0 ? -1 : 1);
      return vector;
    };
    const gp_XYZ back = axis(forward).Reversed(), upward = axis(up), side = back.Crossed(upward);
    const double k = millimetresPerUnit;
    gp_Trsf trsf;
    trsf.SetValues(k * side.X(), k * side.Y(), k * side.Z(), 0, k * back.X(), k * back.Y(), k * back.Z(), 0,
                   k * upward.X(), k * upward.Y(), k * upward.Z(), 0);
    if (format == "step") {
      STEPControl_Reader reader;
      if (reader.ReadFile(path.c_str()) != IFSelect_RetDone || reader.TransferRoots(Message_ProgressRange()) < 1) {
        return TopoDS_Shape();
      }
      return BRepBuilderAPI_Transform(reader.OneShape(), trsf, true).Shape();
    }
    TopoDS_Shape mesh;
    if (format == "gltf") {
      RWGltf_CafReader reader;
      mesh = readMesh(reader, path);
    } else if (format == "obj") {
      RWObj_CafReader reader;
      mesh = readMesh(reader, path);
    } else if (format == "stl") {
      const Handle(Poly_Triangulation) triangles = RWStl::ReadFile(path.c_str());
      if (!triangles.IsNull()) {
        TopoDS_Face face;
        BRep_Builder().MakeFace(face, triangles);
        mesh = face;
      }
    }
    return mesh.IsNull() ? mesh : bakeMesh(mesh, trsf);
  }

  // Number of sub-shapes of one type, counting each shared sub-shape once.
  static int count(const TopoDS_Shape& shape, int type) {
    TopTools_IndexedMapOfShape map;
    TopExp::MapShapes(shape, static_cast<TopAbs_ShapeEnum>(type), map);
    return map.Extent();
  }
};

EMSCRIPTEN_BINDINGS(tau_offline) {
  class_<TauOffline>("TauOffline")
    .class_function("mesh", &TauOffline::mesh)
    .class_function("edges", &TauOffline::edges)
    .class_function("topology", &TauOffline::topology)
    .class_function("volume", &TauOffline::volume)
    .class_function("area", &TauOffline::area)
    .class_function("surfaceCentroid", &TauOffline::surfaceCentroid)
    .class_function("bounds", &TauOffline::bounds)
    .class_function("isValid", &TauOffline::isValid)
    .class_function("count", &TauOffline::count)
    .class_function("importFile", &TauOffline::importFile)
    .class_function("doubles", &TauOffline::doubles)
    .class_function("doubleCount", &TauOffline::doubleCount)
    .class_function("ints", &TauOffline::ints)
    .class_function("intCount", &TauOffline::intCount);
}
