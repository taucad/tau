// GeoSpec native mesh metrics for opencascade.js custom builds.
//
// The wrapper accepts triangle soups copied into the Emscripten heap as
// Float64 triples (`ax ay az bx by bz cx cy cz` per triangle). It keeps the
// hot sampled-distance loop inside C++ and uses a small BVH so large test
// meshes avoid JavaScript's unbounded `samples * triangles` fallback.

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <queue>
#include <sstream>
#include <string>
#include <vector>

#include <Bnd_Box.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepBuilderAPI_Sewing.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <GProp_GProps.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Shell.hxx>
#include <TopoDS_Solid.hxx>
#include <gp_Pnt.hxx>

struct GeoSpecMeshDistanceStats {
  double min;
  double mean;
  double max;
  double p50;
  double p95;
  double p99;
  double rms;
  int samples;
};

struct GeoSpecPoint {
  double x;
  double y;
  double z;
};

struct GeoSpecTriangle {
  GeoSpecPoint a;
  GeoSpecPoint b;
  GeoSpecPoint c;
  double min[3];
  double max[3];
  double centroid[3];
};

struct GeoSpecBvhNode {
  double min[3];
  double max[3];
  int left;
  int right;
  int start;
  int count;
};

class GeoSpecMeshOverlapResult {
public:
  bool success;

  GeoSpecMeshOverlapResult()
    : success(false), evidenceJson_("{\"success\":false,\"componentCount\":0,\"checkedPairs\":0,\"overlaps\":[],\"diagnostics\":[]}") {}

  GeoSpecMeshOverlapResult(bool ok, const std::string& evidenceJson)
    : success(ok), evidenceJson_(evidenceJson) {}

  std::string evidenceJson() const {
    return evidenceJson_;
  }

private:
  std::string evidenceJson_;
};

static std::string geospecOverlapEscapeJson(const std::string& value) {
  std::ostringstream output;
  for (char character : value) {
    switch (character) {
      case '\\': output << "\\\\"; break;
      case '"': output << "\\\""; break;
      case '\n': output << "\\n"; break;
      case '\r': output << "\\r"; break;
      case '\t': output << "\\t"; break;
      default: output << character; break;
    }
  }
  return output.str();
}

static void geospecOverlapAppendDiagnostics(
  std::ostringstream& output,
  const std::vector<std::pair<std::string, std::string>>& diagnostics
) {
  output << "[";
  for (std::size_t index = 0; index < diagnostics.size(); index++) {
    if (index > 0) output << ",";
    output << "{\"code\":\"" << geospecOverlapEscapeJson(diagnostics[index].first)
      << "\",\"message\":\"" << geospecOverlapEscapeJson(diagnostics[index].second) << "\"}";
  }
  output << "]";
}

static GeoSpecMeshOverlapResult geospecOverlapFailure(
  int componentCount,
  int checkedPairs,
  const std::vector<std::pair<std::string, std::string>>& diagnostics
) {
  std::ostringstream output;
  output << "{\"success\":false,\"componentCount\":" << componentCount
    << ",\"checkedPairs\":" << checkedPairs
    << ",\"overlaps\":[],\"diagnostics\":";
  geospecOverlapAppendDiagnostics(output, diagnostics);
  output << "}";
  return GeoSpecMeshOverlapResult(false, output.str());
}

static TopoDS_Face geospecOverlapTriangleFace(const GeoSpecTriangle& triangle) {
  BRepBuilderAPI_MakePolygon polygon;
  polygon.Add(gp_Pnt(triangle.a.x, triangle.a.y, triangle.a.z));
  polygon.Add(gp_Pnt(triangle.b.x, triangle.b.y, triangle.b.z));
  polygon.Add(gp_Pnt(triangle.c.x, triangle.c.y, triangle.c.z));
  polygon.Close();
  if (!polygon.IsDone()) {
    return TopoDS_Face();
  }
  BRepBuilderAPI_MakeFace faceBuilder(polygon.Wire(), true);
  if (!faceBuilder.IsDone()) {
    return TopoDS_Face();
  }
  return faceBuilder.Face();
}

static TopoDS_Shape geospecOverlapBuildSolid(
  const std::vector<GeoSpecTriangle>& triangles,
  double tolerance,
  int componentId,
  std::vector<std::pair<std::string, std::string>>& diagnostics
) {
  if (triangles.size() < 4) {
    diagnostics.push_back({
      "GEOSPEC_COMPONENT_SOLID_INVALID",
      "component " + std::to_string(componentId) + " has fewer than four triangles"
    });
    return TopoDS_Shape();
  }

  BRepBuilderAPI_Sewing sewing(tolerance);
  int faceCount = 0;
  for (const GeoSpecTriangle& triangle : triangles) {
    TopoDS_Face face = geospecOverlapTriangleFace(triangle);
    if (!face.IsNull()) {
      sewing.Add(face);
      faceCount++;
    }
  }
  if (faceCount < 4) {
    diagnostics.push_back({
      "GEOSPEC_COMPONENT_SOLID_INVALID",
      "component " + std::to_string(componentId) + " did not produce enough valid faces"
    });
    return TopoDS_Shape();
  }

  sewing.Perform();
  TopoDS_Shape sewed = sewing.SewedShape();
  if (sewed.IsNull()) {
    diagnostics.push_back({
      "GEOSPEC_COMPONENT_SOLID_INVALID",
      "component " + std::to_string(componentId) + " could not be sewn into a shell"
    });
    return TopoDS_Shape();
  }

  TopoDS_Shell shell;
  if (sewed.ShapeType() == TopAbs_SHELL) {
    shell = TopoDS::Shell(sewed);
  } else {
    for (TopExp_Explorer explorer(sewed, TopAbs_SHELL); explorer.More(); explorer.Next()) {
      shell = TopoDS::Shell(explorer.Current());
      break;
    }
  }
  if (shell.IsNull()) {
    diagnostics.push_back({
      "GEOSPEC_COMPONENT_SOLID_INVALID",
      "component " + std::to_string(componentId) + " did not contain a closed shell"
    });
    return TopoDS_Shape();
  }

  BRepBuilderAPI_MakeSolid solidBuilder(shell);
  TopoDS_Solid solid = solidBuilder.Solid();
  if (solid.IsNull()) {
    diagnostics.push_back({
      "GEOSPEC_COMPONENT_SOLID_INVALID",
      "component " + std::to_string(componentId) + " could not be converted to a solid"
    });
    return TopoDS_Shape();
  }

  BRepCheck_Analyzer analyzer(solid);
  if (!analyzer.IsValid()) {
    diagnostics.push_back({
      "GEOSPEC_COMPONENT_SOLID_INVALID",
      "component " + std::to_string(componentId) + " is not a valid closed solid"
    });
    return TopoDS_Shape();
  }
  return solid;
}

static double geospecOverlapVolume(const TopoDS_Shape& shape) {
  if (shape.IsNull()) {
    return 0.0;
  }
  GProp_GProps properties;
  BRepGProp::VolumeProperties(shape, properties);
  return std::abs(properties.Mass());
}

static GeoSpecPoint geospecOverlapWitnessPoint(const TopoDS_Shape& shape) {
  Bnd_Box box;
  BRepBndLib::Add(shape, box);
  if (box.IsVoid()) {
    return {0.0, 0.0, 0.0};
  }
  double xmin = 0.0;
  double ymin = 0.0;
  double zmin = 0.0;
  double xmax = 0.0;
  double ymax = 0.0;
  double zmax = 0.0;
  box.Get(xmin, ymin, zmin, xmax, ymax, zmax);
  return {
    (xmin + xmax) / 2.0,
    (ymin + ymax) / 2.0,
    (zmin + zmax) / 2.0,
  };
}

static GeoSpecPoint geospecSub(const GeoSpecPoint& a, const GeoSpecPoint& b) {
  return {a.x - b.x, a.y - b.y, a.z - b.z};
}

static GeoSpecPoint geospecAdd(const GeoSpecPoint& a, const GeoSpecPoint& b) {
  return {a.x + b.x, a.y + b.y, a.z + b.z};
}

static GeoSpecPoint geospecScale(const GeoSpecPoint& a, double value) {
  return {a.x * value, a.y * value, a.z * value};
}

static double geospecDot(const GeoSpecPoint& a, const GeoSpecPoint& b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

static double geospecDistanceSquared(const GeoSpecPoint& a, const GeoSpecPoint& b) {
  const double dx = a.x - b.x;
  const double dy = a.y - b.y;
  const double dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

static double geospecBoxDistanceSquared(const GeoSpecPoint& p, const GeoSpecBvhNode& node) {
  double total = 0.0;
  const double values[3] = {p.x, p.y, p.z};
  for (int axis = 0; axis < 3; axis++) {
    if (values[axis] < node.min[axis]) {
      const double d = node.min[axis] - values[axis];
      total += d * d;
    } else if (values[axis] > node.max[axis]) {
      const double d = values[axis] - node.max[axis];
      total += d * d;
    }
  }
  return total;
}

static GeoSpecPoint geospecClosestPointOnTriangle(
  const GeoSpecPoint& point,
  const GeoSpecTriangle& triangle
) {
  const GeoSpecPoint ab = geospecSub(triangle.b, triangle.a);
  const GeoSpecPoint ac = geospecSub(triangle.c, triangle.a);
  const GeoSpecPoint ap = geospecSub(point, triangle.a);
  const double d1 = geospecDot(ab, ap);
  const double d2 = geospecDot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) return triangle.a;

  const GeoSpecPoint bp = geospecSub(point, triangle.b);
  const double d3 = geospecDot(ab, bp);
  const double d4 = geospecDot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) return triangle.b;

  const double vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
    return geospecAdd(triangle.a, geospecScale(ab, d1 / (d1 - d3)));
  }

  const GeoSpecPoint cp = geospecSub(point, triangle.c);
  const double d5 = geospecDot(ab, cp);
  const double d6 = geospecDot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) return triangle.c;

  const double vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
    return geospecAdd(triangle.a, geospecScale(ac, d2 / (d2 - d6)));
  }

  const double va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
    const GeoSpecPoint bc = geospecSub(triangle.c, triangle.b);
    return geospecAdd(triangle.b, geospecScale(bc, (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  }

  const double denominator = 1.0 / (va + vb + vc);
  const double v = vb * denominator;
  const double w = vc * denominator;
  return geospecAdd(triangle.a, geospecAdd(geospecScale(ab, v), geospecScale(ac, w)));
}

class GeoSpecTriangleBvh {
public:
  explicit GeoSpecTriangleBvh(const double* rawTriangles, int triangleCount) {
    triangles_.reserve(triangleCount);
    indices_.reserve(triangleCount);
    for (int i = 0; i < triangleCount; i++) {
      const double* base = rawTriangles + i * 9;
      GeoSpecTriangle triangle{
        {base[0], base[1], base[2]},
        {base[3], base[4], base[5]},
        {base[6], base[7], base[8]},
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
      };
      triangle.min[0] = std::min({triangle.a.x, triangle.b.x, triangle.c.x});
      triangle.min[1] = std::min({triangle.a.y, triangle.b.y, triangle.c.y});
      triangle.min[2] = std::min({triangle.a.z, triangle.b.z, triangle.c.z});
      triangle.max[0] = std::max({triangle.a.x, triangle.b.x, triangle.c.x});
      triangle.max[1] = std::max({triangle.a.y, triangle.b.y, triangle.c.y});
      triangle.max[2] = std::max({triangle.a.z, triangle.b.z, triangle.c.z});
      triangle.centroid[0] = (triangle.a.x + triangle.b.x + triangle.c.x) / 3.0;
      triangle.centroid[1] = (triangle.a.y + triangle.b.y + triangle.c.y) / 3.0;
      triangle.centroid[2] = (triangle.a.z + triangle.b.z + triangle.c.z) / 3.0;
      triangles_.push_back(triangle);
      indices_.push_back(i);
    }
    if (triangleCount > 0) {
      build(0, triangleCount);
    }
  }

  double distanceTo(const GeoSpecPoint& point) const {
    if (nodes_.empty()) {
      return std::numeric_limits<double>::infinity();
    }
    double bestSquared = std::numeric_limits<double>::infinity();
    query(0, point, bestSquared);
    return std::sqrt(bestSquared);
  }

private:
  static constexpr int leafSize_ = 8;

  std::vector<GeoSpecTriangle> triangles_;
  std::vector<int> indices_;
  std::vector<GeoSpecBvhNode> nodes_;

  int build(int start, int end) {
    GeoSpecBvhNode node{};
    node.left = -1;
    node.right = -1;
    node.start = start;
    node.count = end - start;
    for (int axis = 0; axis < 3; axis++) {
      node.min[axis] = std::numeric_limits<double>::infinity();
      node.max[axis] = -std::numeric_limits<double>::infinity();
    }

    for (int i = start; i < end; i++) {
      const GeoSpecTriangle& triangle = triangles_[indices_[i]];
      for (int axis = 0; axis < 3; axis++) {
        node.min[axis] = std::min(node.min[axis], triangle.min[axis]);
        node.max[axis] = std::max(node.max[axis], triangle.max[axis]);
      }
    }

    const int nodeIndex = static_cast<int>(nodes_.size());
    nodes_.push_back(node);

    if ((end - start) <= leafSize_) {
      return nodeIndex;
    }

    double extent[3] = {
      node.max[0] - node.min[0],
      node.max[1] - node.min[1],
      node.max[2] - node.min[2],
    };
    int axis = 0;
    if (extent[1] > extent[axis]) axis = 1;
    if (extent[2] > extent[axis]) axis = 2;

    const int mid = start + (end - start) / 2;
    std::nth_element(
      indices_.begin() + start,
      indices_.begin() + mid,
      indices_.begin() + end,
      [&](int left, int right) {
        return triangles_[left].centroid[axis] < triangles_[right].centroid[axis];
      }
    );

    nodes_[nodeIndex].left = build(start, mid);
    nodes_[nodeIndex].right = build(mid, end);
    nodes_[nodeIndex].count = 0;
    return nodeIndex;
  }

  void query(int nodeIndex, const GeoSpecPoint& point, double& bestSquared) const {
    const GeoSpecBvhNode& node = nodes_[nodeIndex];
    if (geospecBoxDistanceSquared(point, node) > bestSquared) {
      return;
    }

    if (node.left < 0 && node.right < 0) {
      for (int i = node.start; i < node.start + node.count; i++) {
        const GeoSpecTriangle& triangle = triangles_[indices_[i]];
        const GeoSpecPoint closest = geospecClosestPointOnTriangle(point, triangle);
        bestSquared = std::min(bestSquared, geospecDistanceSquared(point, closest));
      }
      return;
    }

    const int first = node.left;
    const int second = node.right;
    const double firstDistance = geospecBoxDistanceSquared(point, nodes_[first]);
    const double secondDistance = geospecBoxDistanceSquared(point, nodes_[second]);
    if (firstDistance <= secondDistance) {
      query(first, point, bestSquared);
      query(second, point, bestSquared);
    } else {
      query(second, point, bestSquared);
      query(first, point, bestSquared);
    }
  }
};

static GeoSpecPoint geospecSamplePoint(const double* triangles, int triangleIndex, int sampleOrdinal) {
  const double* base = triangles + triangleIndex * 9;
  if (sampleOrdinal == 0) return {base[0], base[1], base[2]};
  if (sampleOrdinal == 1) return {base[3], base[4], base[5]};
  if (sampleOrdinal == 2) return {base[6], base[7], base[8]};
  return {
    (base[0] + base[3] + base[6]) / 3.0,
    (base[1] + base[4] + base[7]) / 3.0,
    (base[2] + base[5] + base[8]) / 3.0,
  };
}

static void geospecAppendDistances(
  std::vector<double>& distances,
  const double* sourceTriangles,
  int sourceTriangleCount,
  int limit,
  const GeoSpecTriangleBvh& target
) {
  for (int triangleIndex = 0; triangleIndex < sourceTriangleCount; triangleIndex++) {
    for (int sampleOrdinal = 0; sampleOrdinal < 4; sampleOrdinal++) {
      if (static_cast<int>(distances.size()) >= limit) return;
      distances.push_back(target.distanceTo(geospecSamplePoint(sourceTriangles, triangleIndex, sampleOrdinal)));
    }
  }
}

class GeoSpecMeshMetrics {
public:
  static GeoSpecMeshOverlapResult componentOverlapFromTrianglePointers(
    uintptr_t trianglePointer,
    int triangleCount,
    uintptr_t componentIdPointer,
    int componentCount,
    double tolerance
  ) {
    std::vector<std::pair<std::string, std::string>> diagnostics;
    if (triangleCount <= 0) {
      diagnostics.push_back({"GEOSPEC_NATIVE_OVERLAP_INVALID_INPUT", "triangleCount must be positive"});
    }
    if (componentCount < 2) {
      diagnostics.push_back({"GEOSPEC_NATIVE_OVERLAP_INVALID_INPUT", "componentCount must be at least two"});
    }
    if (!std::isfinite(tolerance) || tolerance < 0.0) {
      diagnostics.push_back({"GEOSPEC_NATIVE_OVERLAP_INVALID_INPUT", "tolerance must be a non-negative finite number"});
    }
    if (!diagnostics.empty()) {
      return geospecOverlapFailure(componentCount, 0, diagnostics);
    }

    const double* rawTriangles = reinterpret_cast<const double*>(trianglePointer);
    const int* componentIds = reinterpret_cast<const int*>(componentIdPointer);
    std::vector<std::vector<GeoSpecTriangle>> componentTriangles(static_cast<std::size_t>(componentCount));
    for (int triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const int componentId = componentIds[triangleIndex];
      if (componentId < 0 || componentId >= componentCount) {
        diagnostics.push_back({
          "GEOSPEC_NATIVE_OVERLAP_INVALID_INPUT",
          "triangle " + std::to_string(triangleIndex) + " has invalid component id " + std::to_string(componentId)
        });
        continue;
      }
      const double* base = rawTriangles + triangleIndex * 9;
      componentTriangles[static_cast<std::size_t>(componentId)].push_back({
        {base[0], base[1], base[2]},
        {base[3], base[4], base[5]},
        {base[6], base[7], base[8]},
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
        {0.0, 0.0, 0.0},
      });
    }
    if (!diagnostics.empty()) {
      return geospecOverlapFailure(componentCount, 0, diagnostics);
    }

    const double sewingTolerance = std::max(tolerance, 1e-7);
    std::vector<TopoDS_Shape> solids(static_cast<std::size_t>(componentCount));
    for (int componentId = 0; componentId < componentCount; componentId++) {
      solids[static_cast<std::size_t>(componentId)] = geospecOverlapBuildSolid(
        componentTriangles[static_cast<std::size_t>(componentId)],
        sewingTolerance,
        componentId,
        diagnostics
      );
    }
    if (!diagnostics.empty()) {
      return geospecOverlapFailure(componentCount, 0, diagnostics);
    }

    struct OverlapRecord {
      int left;
      int right;
      double volume;
      GeoSpecPoint witness;
    };
    std::vector<OverlapRecord> overlaps;
    int checkedPairs = 0;
    const double volumeEpsilon = std::max(tolerance * tolerance * tolerance, 1e-12);
    for (int left = 0; left < componentCount; left++) {
      for (int right = left + 1; right < componentCount; right++) {
        checkedPairs++;
        BRepAlgoAPI_Common common(solids[static_cast<std::size_t>(left)], solids[static_cast<std::size_t>(right)]);
        common.Build();
        if (!common.IsDone()) {
          diagnostics.push_back({
            "GEOSPEC_NATIVE_OVERLAP_BOOLEAN_FAILED",
            "boolean common failed for component pair " + std::to_string(left) + "/" + std::to_string(right)
          });
          continue;
        }
        const TopoDS_Shape commonShape = common.Shape();
        const double volume = geospecOverlapVolume(commonShape);
        if (volume > volumeEpsilon) {
          overlaps.push_back({left, right, volume, geospecOverlapWitnessPoint(commonShape)});
        }
      }
    }
    if (!diagnostics.empty()) {
      return geospecOverlapFailure(componentCount, checkedPairs, diagnostics);
    }

    std::ostringstream output;
    output << "{\"success\":true,\"componentCount\":" << componentCount
      << ",\"checkedPairs\":" << checkedPairs
      << ",\"overlaps\":[";
    for (std::size_t index = 0; index < overlaps.size(); index++) {
      if (index > 0) output << ",";
      const OverlapRecord& overlap = overlaps[index];
      output << "{\"leftComponentId\":" << overlap.left
        << ",\"rightComponentId\":" << overlap.right
        << ",\"intersectionVolume\":" << overlap.volume
        << ",\"witnessPoint\":[" << overlap.witness.x << "," << overlap.witness.y << "," << overlap.witness.z << "]}";
    }
    output << "],\"diagnostics\":[]}";
    return GeoSpecMeshOverlapResult(true, output.str());
  }

  static GeoSpecMeshDistanceStats chamferDistanceFromTrianglePointers(
    uintptr_t actualPointer,
    int actualTriangleCount,
    uintptr_t expectedPointer,
    int expectedTriangleCount,
    int samples
  ) {
    if (actualTriangleCount <= 0 || expectedTriangleCount <= 0 || samples <= 0) {
      return {
        std::numeric_limits<double>::infinity(),
        std::numeric_limits<double>::infinity(),
        std::numeric_limits<double>::infinity(),
        std::numeric_limits<double>::infinity(),
        std::numeric_limits<double>::infinity(),
        std::numeric_limits<double>::infinity(),
        std::numeric_limits<double>::infinity(),
        0,
      };
    }

    const double* actual = reinterpret_cast<const double*>(actualPointer);
    const double* expected = reinterpret_cast<const double*>(expectedPointer);
    const int actualDirectionLimit = (samples + 1) / 2;
    GeoSpecTriangleBvh expectedBvh(expected, expectedTriangleCount);
    GeoSpecTriangleBvh actualBvh(actual, actualTriangleCount);
    std::vector<double> distances;
    distances.reserve(static_cast<size_t>(samples));

    geospecAppendDistances(distances, actual, actualTriangleCount, actualDirectionLimit, expectedBvh);
    geospecAppendDistances(distances, expected, expectedTriangleCount, samples, actualBvh);

    double sum = 0.0;
    double squaredSum = 0.0;
    double max = 0.0;
    for (double distance : distances) {
      sum += distance;
      squaredSum += distance * distance;
      max = std::max(max, distance);
    }
    std::sort(distances.begin(), distances.end());
    const auto percentileIndex = [&](double percentile) {
      return std::min(
        static_cast<int>(distances.size()) - 1,
        std::max(0, static_cast<int>(std::ceil(static_cast<double>(distances.size()) * percentile)) - 1)
      );
    };
    const int p50Index = percentileIndex(0.50);
    const int p95Index = std::min(
      static_cast<int>(distances.size()) - 1,
      std::max(0, static_cast<int>(std::ceil(static_cast<double>(distances.size()) * 0.95)) - 1)
    );
    const int p99Index = percentileIndex(0.99);

    return {
      distances.front(),
      sum / static_cast<double>(distances.size()),
      max,
      distances[p50Index],
      distances[p95Index],
      distances[p99Index],
      std::sqrt(squaredSum / static_cast<double>(distances.size())),
      static_cast<int>(distances.size()),
    };
  }
};
