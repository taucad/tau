// GeoSpec STEP/BRep evidence reader for custom opencascade.js builds.
//
// The wrapper keeps STEP import, BRep analysis, and BRep-to-mesh extraction
// inside OCCT. JavaScript receives compact serializable evidence plus a
// triangle soup pointer for mesh matchers.

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <limits>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <Bnd_Box.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <GProp_GProps.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Message_ProgressRange.hxx>
#include <Poly_Triangle.hxx>
#include <Poly_Triangulation.hxx>
#include <STEPControl_Reader.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Dir.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Trsf.hxx>

struct GeoSpecStepOptions {
  bool mesh = true;
  double meshLinearTolerance = 0.01;
  double meshAngularToleranceDegrees = 15.0;
};

struct GeoSpecNativeVec3 {
  double x;
  double y;
  double z;
};

struct GeoSpecNativeFaceEvidence {
  GeoSpecNativeVec3 normal;
  double offset;
  double area;
  GeoSpecNativeVec3 center;
};

struct GeoSpecNativeCylinderEvidence {
  double radius;
  std::string axis;
  GeoSpecNativeVec3 center;
  double axisMin;
  double axisMax;
  bool reversed;
};

class GeoSpecStepReadResult {
public:
  bool success;

  GeoSpecStepReadResult()
    : success(false), evidenceJson_("{}"), meshTrianglesPtr_(nullptr), meshTriangleCount_(0) {}

  GeoSpecStepReadResult(bool ok, const std::string& evidenceJson, double* meshTrianglesPtr, int meshTriangleCount)
    : success(ok), evidenceJson_(evidenceJson), meshTrianglesPtr_(meshTrianglesPtr), meshTriangleCount_(meshTriangleCount) {}

  ~GeoSpecStepReadResult() {
    std::free(meshTrianglesPtr_);
  }

  GeoSpecStepReadResult(const GeoSpecStepReadResult& other)
    : success(other.success),
      evidenceJson_(other.evidenceJson_),
      meshTrianglesPtr_(other.meshTrianglesPtr_),
      meshTriangleCount_(other.meshTriangleCount_) {
    auto& mutableOther = const_cast<GeoSpecStepReadResult&>(other);
    mutableOther.meshTrianglesPtr_ = nullptr;
    mutableOther.meshTriangleCount_ = 0;
  }

  std::string evidenceJson() const {
    return evidenceJson_;
  }

  uintptr_t meshTrianglePointer() const {
    return reinterpret_cast<uintptr_t>(meshTrianglesPtr_);
  }

  int meshTriangleCount() const {
    return meshTriangleCount_;
  }

private:
  std::string evidenceJson_;
  double* meshTrianglesPtr_;
  int meshTriangleCount_;
};

static double geospecParseDoubleOption(const std::string& optionsJson, const std::string& key, double fallback) {
  const std::string needle = "\"" + key + "\"";
  const std::size_t keyIndex = optionsJson.find(needle);
  if (keyIndex == std::string::npos) return fallback;
  const std::size_t colonIndex = optionsJson.find(':', keyIndex + needle.size());
  if (colonIndex == std::string::npos) return fallback;
  const std::size_t start = optionsJson.find_first_of("-0123456789.", colonIndex + 1);
  if (start == std::string::npos) return fallback;
  const std::size_t end = optionsJson.find_first_not_of("-0123456789.eE+", start);
  try {
    return std::stod(optionsJson.substr(start, end == std::string::npos ? std::string::npos : end - start));
  } catch (...) {
    return fallback;
  }
}

static GeoSpecStepOptions geospecParseOptions(const std::string& optionsJson) {
  GeoSpecStepOptions options;
  options.mesh = optionsJson.find("\"mesh\":false") == std::string::npos;
  options.meshLinearTolerance = geospecParseDoubleOption(optionsJson, "meshLinearTolerance", options.meshLinearTolerance);
  options.meshAngularToleranceDegrees = geospecParseDoubleOption(
    optionsJson,
    "meshAngularToleranceDegrees",
    options.meshAngularToleranceDegrees
  );
  return options;
}

static std::string geospecEscapeJson(const std::string& value) {
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

static void geospecAppendVec3(std::ostringstream& output, const GeoSpecNativeVec3& value) {
  output << "[" << value.x << "," << value.y << "," << value.z << "]";
}

static GeoSpecNativeVec3 geospecPointToVec3(const gp_Pnt& point) {
  return {point.X(), point.Y(), point.Z()};
}

static GeoSpecNativeVec3 geospecDirToVec3(const gp_Dir& direction) {
  return {direction.X(), direction.Y(), direction.Z()};
}

static double geospecDot(const GeoSpecNativeVec3& left, const GeoSpecNativeVec3& right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

static std::string geospecAxisName(const gp_Dir& direction) {
  const double x = std::abs(direction.X());
  const double y = std::abs(direction.Y());
  const double z = std::abs(direction.Z());
  if (x >= y && x >= z) return "x";
  if (y >= x && y >= z) return "y";
  return "z";
}

static double geospecAxisValue(const GeoSpecNativeVec3& value, const std::string& axis) {
  if (axis == "x") return value.x;
  if (axis == "y") return value.y;
  return value.z;
}

static bool geospecCylinderTouchesBothExtents(
  const GeoSpecNativeCylinderEvidence& cylinder,
  const GeoSpecNativeVec3& boxMin,
  const GeoSpecNativeVec3& boxMax
) {
  const double tolerance = 0.1;
  return cylinder.axisMin <= geospecAxisValue(boxMin, cylinder.axis) + tolerance &&
    cylinder.axisMax >= geospecAxisValue(boxMax, cylinder.axis) - tolerance;
}

static int geospecCountShapes(const TopoDS_Shape& shape, TopAbs_ShapeEnum kind) {
  int count = 0;
  for (TopExp_Explorer explorer(shape, kind); explorer.More(); explorer.Next()) {
    count++;
  }
  return count;
}

static bool geospecIsAxisAligned(const GeoSpecNativeVec3& normal) {
  const double tolerance = 1e-4;
  const int nonZero =
    (std::abs(normal.x) > tolerance ? 1 : 0) +
    (std::abs(normal.y) > tolerance ? 1 : 0) +
    (std::abs(normal.z) > tolerance ? 1 : 0);
  return nonZero <= 1;
}

static double geospecEstimateChamferDistance(
  const GeoSpecNativeFaceEvidence& face,
  const GeoSpecNativeVec3& boxMin,
  const GeoSpecNativeVec3& boxMax
) {
  const double values[3] = {face.normal.x, face.normal.y, face.normal.z};
  const double mins[3] = {boxMin.x, boxMin.y, boxMin.z};
  const double maxes[3] = {boxMax.x, boxMax.y, boxMax.z};
  double extremeOffset = 0.0;
  double maxNormal = 0.0;
  int activeAxes = 0;
  for (int axis = 0; axis < 3; axis++) {
    if (std::abs(values[axis]) < 1e-4) continue;
    activeAxes++;
    maxNormal = std::max(maxNormal, std::abs(values[axis]));
    extremeOffset += values[axis] * (values[axis] >= 0.0 ? maxes[axis] : mins[axis]);
  }
  if (activeAxes < 2 || maxNormal <= 0.0) return 0.0;
  return std::abs(extremeOffset - face.offset) / maxNormal;
}

static void geospecExtractTriangleSoup(
  const TopoDS_Shape& shape,
  const GeoSpecStepOptions& options,
  double*& triangleSoup,
  int& triangleCount
) {
  triangleSoup = nullptr;
  triangleCount = 0;
  if (!options.mesh) return;

  BRepTools::Clean(shape, false);
  constexpr double pi = 3.141592653589793238462643383279502884;
  const double angularRadians = options.meshAngularToleranceDegrees * pi / 180.0;
  BRepMesh_IncrementalMesh mesher(shape, options.meshLinearTolerance, false, angularRadians, false);

  int totalTriangles = 0;
  for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
    TopLoc_Location location;
    Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(TopoDS::Face(explorer.Current()), location);
    if (!triangulation.IsNull()) {
      totalTriangles += triangulation->NbTriangles();
    }
  }
  if (totalTriangles <= 0) return;

  triangleSoup = static_cast<double*>(std::malloc(static_cast<size_t>(totalTriangles) * 9 * sizeof(double)));
  if (!triangleSoup) throw std::bad_alloc();

  int outputTriangle = 0;
  for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
    const TopoDS_Face& face = TopoDS::Face(explorer.Current());
    TopLoc_Location location;
    Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, location);
    if (triangulation.IsNull()) continue;

    const gp_Trsf& transform = location.Transformation();
    const bool reversed = face.Orientation() == TopAbs_REVERSED;
    const bool mirrored = transform.VectorialPart().Determinant() < 0.0;

    for (int triangleIndex = 1; triangleIndex <= triangulation->NbTriangles(); triangleIndex++) {
      const Poly_Triangle& triangle = triangulation->Triangle(triangleIndex);
      int n1 = triangle.Value(1);
      int n2 = triangle.Value(2);
      int n3 = triangle.Value(3);
      if (reversed ^ mirrored) {
        std::swap(n2, n3);
      }
      const gp_Pnt p1 = triangulation->Node(n1).Transformed(transform);
      const gp_Pnt p2 = triangulation->Node(n2).Transformed(transform);
      const gp_Pnt p3 = triangulation->Node(n3).Transformed(transform);
      double* base = triangleSoup + outputTriangle * 9;
      base[0] = p1.X(); base[1] = p1.Y(); base[2] = p1.Z();
      base[3] = p2.X(); base[4] = p2.Y(); base[5] = p2.Z();
      base[6] = p3.X(); base[7] = p3.Y(); base[8] = p3.Z();
      outputTriangle++;
    }
  }
  triangleCount = outputTriangle;
}

static std::string geospecAnalyzeShapeJson(const TopoDS_Shape& shape) {
  Bnd_Box box;
  BRepBndLib::Add(shape, box);
  double xmin = 0.0;
  double ymin = 0.0;
  double zmin = 0.0;
  double xmax = 0.0;
  double ymax = 0.0;
  double zmax = 0.0;
  box.Get(xmin, ymin, zmin, xmax, ymax, zmax);
  const GeoSpecNativeVec3 boxMin{xmin, ymin, zmin};
  const GeoSpecNativeVec3 boxMax{xmax, ymax, zmax};
  const GeoSpecNativeVec3 boxSize{xmax - xmin, ymax - ymin, zmax - zmin};
  const GeoSpecNativeVec3 boxCenter{(xmin + xmax) / 2.0, (ymin + ymax) / 2.0, (zmin + zmax) / 2.0};

  GProp_GProps surfaceProps;
  BRepGProp::SurfaceProperties(shape, surfaceProps);
  GProp_GProps volumeProps;
  BRepGProp::VolumeProperties(shape, volumeProps);
  const gp_Pnt centerOfMass = volumeProps.CentreOfMass();

  std::vector<GeoSpecNativeFaceEvidence> planarFaces;
  std::vector<GeoSpecNativeCylinderEvidence> cylinders;
  std::vector<GeoSpecNativeCylinderEvidence> holes;

  for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
    const TopoDS_Face& face = TopoDS::Face(explorer.Current());
    BRepAdaptor_Surface surface(face, false);
    GProp_GProps faceProps;
    BRepGProp::SurfaceProperties(face, faceProps);
    const gp_Pnt faceCenter = faceProps.CentreOfMass();

    if (surface.GetType() == GeomAbs_Plane) {
      gp_Pln plane = surface.Plane();
      gp_Dir normal = plane.Axis().Direction();
      if (face.Orientation() == TopAbs_REVERSED) {
        normal.Reverse();
      }
      const GeoSpecNativeVec3 normalVec = geospecDirToVec3(normal);
      const GeoSpecNativeVec3 planePoint = geospecPointToVec3(plane.Location());
      planarFaces.push_back({
        normalVec,
        geospecDot(normalVec, planePoint),
        faceProps.Mass(),
        geospecPointToVec3(faceCenter),
      });
    } else if (surface.GetType() == GeomAbs_Cylinder) {
      gp_Cylinder cylinder = surface.Cylinder();
      const bool reversed = face.Orientation() == TopAbs_REVERSED;
      Bnd_Box faceBox;
      BRepBndLib::Add(face, faceBox);
      double fxmin = 0.0;
      double fymin = 0.0;
      double fzmin = 0.0;
      double fxmax = 0.0;
      double fymax = 0.0;
      double fzmax = 0.0;
      faceBox.Get(fxmin, fymin, fzmin, fxmax, fymax, fzmax);
      const std::string axisName = geospecAxisName(cylinder.Axis().Direction());
      GeoSpecNativeCylinderEvidence evidence{
        cylinder.Radius(),
        axisName,
        geospecPointToVec3(faceCenter),
        axisName == "x" ? fxmin : axisName == "y" ? fymin : fzmin,
        axisName == "x" ? fxmax : axisName == "y" ? fymax : fzmax,
        reversed,
      };
      cylinders.push_back(evidence);
      if (reversed) {
        holes.push_back(evidence);
      }
    }
  }

  double minimumWallThickness = std::numeric_limits<double>::infinity();
  for (std::size_t left = 0; left < planarFaces.size(); left++) {
    for (std::size_t right = left + 1; right < planarFaces.size(); right++) {
      const GeoSpecNativeVec3& a = planarFaces[left].normal;
      const GeoSpecNativeVec3& b = planarFaces[right].normal;
      const double dot = a.x * b.x + a.y * b.y + a.z * b.z;
      if (dot < -0.999) {
        minimumWallThickness = std::min(minimumWallThickness, std::abs(planarFaces[left].offset + planarFaces[right].offset));
      }
    }
  }
  if (!std::isfinite(minimumWallThickness)) {
    minimumWallThickness = 0.0;
  }

  std::ostringstream json;
  json << std::setprecision(17);
  json << "{\"brep\":{";
  json << "\"validity\":{\"valid\":" << (BRepCheck_Analyzer(shape).IsValid() ? "true" : "false") << "},";
  json << "\"topologyCounts\":{";
  json << "\"vertices\":" << geospecCountShapes(shape, TopAbs_VERTEX) << ",";
  json << "\"edges\":" << geospecCountShapes(shape, TopAbs_EDGE) << ",";
  json << "\"wires\":" << geospecCountShapes(shape, TopAbs_WIRE) << ",";
  json << "\"faces\":" << geospecCountShapes(shape, TopAbs_FACE) << ",";
  json << "\"shells\":" << geospecCountShapes(shape, TopAbs_SHELL) << ",";
  json << "\"solids\":" << geospecCountShapes(shape, TopAbs_SOLID) << ",";
  json << "\"compounds\":" << geospecCountShapes(shape, TopAbs_COMPOUND) << "},";
  json << "\"boundingBox\":{\"min\":";
  geospecAppendVec3(json, boxMin);
  json << ",\"max\":";
  geospecAppendVec3(json, boxMax);
  json << ",\"size\":";
  geospecAppendVec3(json, boxSize);
  json << ",\"center\":";
  geospecAppendVec3(json, boxCenter);
  json << "},";
  json << "\"massProperties\":{\"surfaceArea\":" << surfaceProps.Mass() << ",\"volume\":" << std::abs(volumeProps.Mass()) << ",\"centerOfMass\":";
  geospecAppendVec3(json, geospecPointToVec3(centerOfMass));
  json << "},";

  json << "\"planarFaces\":[";
  for (std::size_t index = 0; index < planarFaces.size(); index++) {
    if (index > 0) json << ",";
    json << "{\"normal\":";
    geospecAppendVec3(json, planarFaces[index].normal);
    json << ",\"offset\":" << planarFaces[index].offset << ",\"area\":" << planarFaces[index].area << ",\"center\":";
    geospecAppendVec3(json, planarFaces[index].center);
    json << "}";
  }
  json << "],";

  json << "\"cylindricalFaces\":[";
  for (std::size_t index = 0; index < cylinders.size(); index++) {
    if (index > 0) json << ",";
    json << "{\"radius\":" << cylinders[index].radius << ",\"axis\":\"" << cylinders[index].axis << "\",\"center\":";
    geospecAppendVec3(json, cylinders[index].center);
    json << ",\"axisRange\":{\"min\":" << cylinders[index].axisMin << ",\"max\":" << cylinders[index].axisMax << "}}";
  }
  json << "],";

  json << "\"circularHoles\":[";
  for (std::size_t index = 0; index < holes.size(); index++) {
    if (index > 0) json << ",";
    json << "{\"diameter\":" << (holes[index].radius * 2.0)
      << ",\"through\":" << (geospecCylinderTouchesBothExtents(holes[index], boxMin, boxMax) ? "true" : "false")
      << ",\"axis\":\"" << holes[index].axis << "\",\"center\":";
    geospecAppendVec3(json, holes[index].center);
    json << ",\"axisRange\":{\"min\":" << holes[index].axisMin << ",\"max\":" << holes[index].axisMax << "}}";
  }
  json << "],";

  json << "\"circularHolePatterns\":[";
  bool wrotePattern = false;
  std::map<std::string, std::vector<GeoSpecNativeCylinderEvidence>> groups;
  for (const GeoSpecNativeCylinderEvidence& hole : holes) {
    std::ostringstream key;
    key << hole.axis << ":" << std::round(hole.radius * 2000.0) / 1000.0;
    groups[key.str()].push_back(hole);
  }
  for (const auto& entry : groups) {
    const auto& group = entry.second;
    if (group.size() < 2) continue;
    GeoSpecNativeVec3 center{0.0, 0.0, 0.0};
    for (const GeoSpecNativeCylinderEvidence& hole : group) {
      center.x += hole.center.x;
      center.y += hole.center.y;
      center.z += hole.center.z;
    }
    center.x /= static_cast<double>(group.size());
    center.y /= static_cast<double>(group.size());
    center.z /= static_cast<double>(group.size());
    double radialSum = 0.0;
    for (const GeoSpecNativeCylinderEvidence& hole : group) {
      const double dx = hole.center.x - center.x;
      const double dy = hole.center.y - center.y;
      const double dz = hole.center.z - center.z;
      if (hole.axis == "x") radialSum += std::sqrt(dy * dy + dz * dz);
      else if (hole.axis == "y") radialSum += std::sqrt(dx * dx + dz * dz);
      else radialSum += std::sqrt(dx * dx + dy * dy);
    }
    if (wrotePattern) json << ",";
    wrotePattern = true;
    json << "{\"count\":" << group.size() << ",\"holeDiameter\":" << (group.front().radius * 2.0)
      << ",\"boltCircleDiameter\":" << (2.0 * radialSum / static_cast<double>(group.size()))
      << ",\"axis\":\"" << group.front().axis << "\",\"center\":";
    geospecAppendVec3(json, center);
    json << "}";
  }
  json << "],";

  json << "\"chamferFeatures\":[";
  bool wroteChamfer = false;
  for (const GeoSpecNativeFaceEvidence& face : planarFaces) {
    if (geospecIsAxisAligned(face.normal)) continue;
    const double distance = geospecEstimateChamferDistance(face, boxMin, boxMax);
    if (distance <= 1e-6) continue;
    if (wroteChamfer) json << ",";
    wroteChamfer = true;
    json << "{\"distance\":" << distance << "}";
  }
  json << "],";

  json << "\"filletFeatures\":[";
  bool wroteFillet = false;
  const double minExtent = std::min({boxSize.x, boxSize.y, boxSize.z});
  for (const GeoSpecNativeCylinderEvidence& cylinder : cylinders) {
    if (cylinder.reversed || cylinder.radius <= 0.0 || cylinder.radius >= minExtent / 2.0) continue;
    if (wroteFillet) json << ",";
    wroteFillet = true;
    json << "{\"radius\":" << cylinder.radius << "}";
  }
  json << "],";

  json << "\"minimumWallThickness\":{\"value\":" << minimumWallThickness << "}";
  json << "},\"diagnostics\":[]}";
  return json.str();
}

static GeoSpecStepReadResult geospecFailure(const std::string& code, const std::string& message) {
  std::ostringstream json;
  json << "{\"diagnostics\":[{\"code\":\"" << geospecEscapeJson(code)
    << "\",\"severity\":\"error\",\"message\":\"" << geospecEscapeJson(message) << "\"}]}";
  return GeoSpecStepReadResult(false, json.str(), nullptr, 0);
}

class GeoSpecStepStreamReader {
public:
  static GeoSpecStepReadResult readText(const std::string& data, const std::string& optionsJson) {
    std::istringstream stream(data);
    return readStream(stream, "memory.step", optionsJson);
  }

  static GeoSpecStepReadResult readFile(const std::string& path, const std::string& optionsJson) {
    STEPControl_Reader reader;
    const IFSelect_ReturnStatus status = reader.ReadFile(path.c_str());
    return finishRead(reader, status, optionsJson);
  }

private:
  static GeoSpecStepReadResult readStream(std::istream& stream, const std::string& name, const std::string& optionsJson) {
    STEPControl_Reader reader;
    const IFSelect_ReturnStatus status = reader.ReadStream(name.c_str(), stream);
    return finishRead(reader, status, optionsJson);
  }

  static GeoSpecStepReadResult finishRead(STEPControl_Reader& reader, IFSelect_ReturnStatus status, const std::string& optionsJson) {
    if (status != IFSelect_RetDone) {
      return geospecFailure("GEOSPEC_STEP_PARSE_FAILED", "GeoSpec OpenCascade STEP reader could not parse the source.");
    }

    Message_ProgressRange progress;
    const Standard_Integer transferred = reader.TransferRoots(progress);
    if (transferred <= 0) {
      return geospecFailure("GEOSPEC_STEP_TRANSFER_FAILED", "GeoSpec OpenCascade STEP reader did not transfer any STEP roots.");
    }

    TopoDS_Shape shape = reader.OneShape();
    if (shape.IsNull()) {
      return geospecFailure("GEOSPEC_STEP_EMPTY_SHAPE", "GeoSpec OpenCascade STEP reader produced an empty shape.");
    }

    try {
      const GeoSpecStepOptions options = geospecParseOptions(optionsJson);
      double* triangleSoup = nullptr;
      int triangleCount = 0;
      geospecExtractTriangleSoup(shape, options, triangleSoup, triangleCount);
      return GeoSpecStepReadResult(true, geospecAnalyzeShapeJson(shape), triangleSoup, triangleCount);
    } catch (const std::exception& error) {
      return geospecFailure("GEOSPEC_STEP_ANALYZE_FAILED", error.what());
    } catch (...) {
      return geospecFailure("GEOSPEC_STEP_ANALYZE_FAILED", "GeoSpec OpenCascade STEP analysis failed with an unknown native error.");
    }
  }
};
