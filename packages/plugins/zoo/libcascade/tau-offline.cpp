// Native helpers for Tau's offline KCL engine: work that would otherwise cross the JS/WASM boundary per node,
// per edge or per sub-shape runs here in one call.
#include <BRepAdaptor_Curve.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GCPnts_TangentialDeflection.hxx>
#include <GProp_GProps.hxx>
#include <Poly_PolygonOnTriangulation.hxx>
#include <Poly_Triangulation.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <emscripten/bind.h>
#include <cstdint>
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

  static double area(const TopoDS_Shape& shape) {
    GProp_GProps props;
    BRepGProp::SurfaceProperties(shape, props, false, false);
    return props.Mass();
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
    .class_function("doubles", &TauOffline::doubles)
    .class_function("doubleCount", &TauOffline::doubleCount)
    .class_function("ints", &TauOffline::ints)
    .class_function("intCount", &TauOffline::intCount);
}
