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
#include <utility>
#include <vector>

#include <Bnd_Box.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepExtrema_SupportType.hxx>
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
#include <TopAbs_State.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Solid.hxx>
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

struct WallSolidValidation {
  bool valid = false;
  bool wholeShapeValid = false;
  bool closedSolids = false;
  int solidCount = 0;
  int invalidSolidCount = 0;
  int openEdgeCount = 0;
  std::string reason;
  std::vector<TopoDS_Solid> solids;
};

struct WallFace {
  TopoDS_Face face;
  Bnd_Box bounds;
  bool planar = false;
  std::string surfaceType;
};

struct WallThicknessResult {
  bool supported = false;
  double value = std::numeric_limits<double>::infinity();
  GeoSpecNativeVec3 pointA{0.0, 0.0, 0.0};
  GeoSpecNativeVec3 pointB{0.0, 0.0, 0.0};
  GeoSpecNativeVec3 location{0.0, 0.0, 0.0};
  int solidIndex = -1;
  int faceA = -1;
  int faceB = -1;
  int tieCount = 0;
  std::string surfaceA;
  std::string surfaceB;
  std::string supportTypeA;
  std::string supportTypeB;
  int checkedPairs = 0;
  int extremaFailed = 0;
  int zeroLength = 0;
  int noMaterialInterval = 0;
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
      meshTrianglesPtr_(nullptr),
      meshTriangleCount_(other.meshTriangleCount_) {
    if (other.meshTrianglesPtr_ != nullptr && other.meshTriangleCount_ > 0) {
      const std::size_t byteLength = static_cast<std::size_t>(other.meshTriangleCount_) * 9 * sizeof(double);
      meshTrianglesPtr_ = static_cast<double*>(std::malloc(byteLength));
      if (!meshTrianglesPtr_) throw std::bad_alloc();
      std::copy(other.meshTrianglesPtr_, other.meshTrianglesPtr_ + other.meshTriangleCount_ * 9, meshTrianglesPtr_);
    }
  }

  GeoSpecStepReadResult& operator=(const GeoSpecStepReadResult& other) {
    if (this == &other) return *this;
    double* copiedTriangles = nullptr;
    if (other.meshTrianglesPtr_ != nullptr && other.meshTriangleCount_ > 0) {
      const std::size_t byteLength = static_cast<std::size_t>(other.meshTriangleCount_) * 9 * sizeof(double);
      copiedTriangles = static_cast<double*>(std::malloc(byteLength));
      if (!copiedTriangles) throw std::bad_alloc();
      std::copy(other.meshTrianglesPtr_, other.meshTrianglesPtr_ + other.meshTriangleCount_ * 9, copiedTriangles);
    }
    std::free(meshTrianglesPtr_);
    success = other.success;
    evidenceJson_ = other.evidenceJson_;
    meshTrianglesPtr_ = copiedTriangles;
    meshTriangleCount_ = other.meshTriangleCount_;
    return *this;
  }

  GeoSpecStepReadResult(GeoSpecStepReadResult&& other) noexcept
    : success(other.success),
      evidenceJson_(std::move(other.evidenceJson_)),
      meshTrianglesPtr_(other.meshTrianglesPtr_),
      meshTriangleCount_(other.meshTriangleCount_) {
    other.meshTrianglesPtr_ = nullptr;
    other.meshTriangleCount_ = 0;
  }

  GeoSpecStepReadResult& operator=(GeoSpecStepReadResult&& other) noexcept {
    if (this == &other) return *this;
    std::free(meshTrianglesPtr_);
    success = other.success;
    evidenceJson_ = std::move(other.evidenceJson_);
    meshTrianglesPtr_ = other.meshTrianglesPtr_;
    meshTriangleCount_ = other.meshTriangleCount_;
    other.meshTrianglesPtr_ = nullptr;
    other.meshTriangleCount_ = 0;
    return *this;
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

static GeoSpecNativeVec3 geospecMidpoint(const gp_Pnt& a, const gp_Pnt& b) {
  return {(a.X() + b.X()) / 2.0, (a.Y() + b.Y()) / 2.0, (a.Z() + b.Z()) / 2.0};
}

static GeoSpecNativeVec3 geospecDirToVec3(const gp_Dir& direction) {
  return {direction.X(), direction.Y(), direction.Z()};
}

static double geospecDot(const GeoSpecNativeVec3& left, const GeoSpecNativeVec3& right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

static std::string geospecSurfaceTypeName(GeomAbs_SurfaceType type) {
  switch (type) {
    case GeomAbs_Plane: return "plane";
    case GeomAbs_Cylinder: return "cylinder";
    case GeomAbs_Cone: return "cone";
    case GeomAbs_Sphere: return "sphere";
    case GeomAbs_Torus: return "torus";
    case GeomAbs_BezierSurface: return "bezier-surface";
    case GeomAbs_BSplineSurface: return "bspline-surface";
    case GeomAbs_SurfaceOfRevolution: return "revolution-surface";
    case GeomAbs_SurfaceOfExtrusion: return "extrusion-surface";
    case GeomAbs_OffsetSurface: return "offset-surface";
    case GeomAbs_OtherSurface: return "other-surface";
  }
  return "unknown";
}

static std::string geospecSupportTypeName(BRepExtrema_SupportType type) {
  switch (type) {
    case BRepExtrema_IsVertex: return "vertex";
    case BRepExtrema_IsOnEdge: return "edge";
    case BRepExtrema_IsInFace: return "face";
  }
  return "unknown";
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

static bool geospecSolidHasClosedEdges(const TopoDS_Solid& solid, int& openEdgeCount) {
  openEdgeCount = 0;
  TopTools_IndexedDataMapOfShapeListOfShape edgeFaces;
  TopExp::MapShapesAndAncestors(solid, TopAbs_EDGE, TopAbs_FACE, edgeFaces);
  for (int index = 1; index <= edgeFaces.Extent(); index++) {
    const TopTools_ListOfShape& faces = edgeFaces.FindFromIndex(index);
    if (faces.Extent() < 2) {
      openEdgeCount++;
    }
  }
  return openEdgeCount == 0;
}

static WallSolidValidation geospecValidateClosedSolids(const TopoDS_Shape& shape) {
  WallSolidValidation validation;
  validation.wholeShapeValid = BRepCheck_Analyzer(shape).IsValid();
  validation.valid = true;
  validation.closedSolids = true;
  validation.reason = "";

  for (TopExp_Explorer explorer(shape, TopAbs_SOLID); explorer.More(); explorer.Next()) {
    validation.solids.push_back(TopoDS::Solid(explorer.Current()));
  }
  validation.solidCount = static_cast<int>(validation.solids.size());
  if (validation.solids.empty()) {
    validation.valid = false;
    validation.closedSolids = false;
    validation.reason = "no-closed-solid";
    return validation;
  }

  for (const TopoDS_Solid& solid : validation.solids) {
    if (!BRepCheck_Analyzer(solid).IsValid()) {
      validation.invalidSolidCount++;
      validation.valid = false;
      if (validation.reason.empty()) validation.reason = "invalid-solid";
    }
    int openEdges = 0;
    geospecSolidHasClosedEdges(solid, openEdges);
    validation.openEdgeCount += openEdges;
  }

  return validation;
}

static double geospecSegmentParameter(const gp_Pnt& start, const gp_Pnt& end, const gp_Pnt& point) {
  const double dx = end.X() - start.X();
  const double dy = end.Y() - start.Y();
  const double dz = end.Z() - start.Z();
  const double lengthSquared = dx * dx + dy * dy + dz * dz;
  if (lengthSquared <= 0.0) return 0.0;
  return ((point.X() - start.X()) * dx + (point.Y() - start.Y()) * dy + (point.Z() - start.Z()) * dz) / lengthSquared;
}

static gp_Pnt geospecPointAtParameter(const gp_Pnt& start, const gp_Pnt& end, double parameter) {
  return gp_Pnt(
    start.X() + (end.X() - start.X()) * parameter,
    start.Y() + (end.Y() - start.Y()) * parameter,
    start.Z() + (end.Z() - start.Z()) * parameter
  );
}

static void geospecAddUniqueParameter(std::vector<double>& parameters, double parameter, double tolerance) {
  if (parameter < -tolerance || parameter > 1.0 + tolerance) return;
  parameter = std::max(0.0, std::min(1.0, parameter));
  for (const double existing : parameters) {
    if (std::abs(existing - parameter) <= tolerance) return;
  }
  parameters.push_back(parameter);
}

static bool geospecPointHasMaterialNeighborhood(
  BRepClass3d_SolidClassifier& classifier,
  const gp_Pnt& point,
  double tolerance
) {
  classifier.Perform(point, tolerance);
  if (classifier.State() == TopAbs_IN) return true;
  if (classifier.State() != TopAbs_ON) return false;

  const double offset = std::max(1e-4, tolerance * 100.0);
  const gp_Pnt probes[6] = {
    gp_Pnt(point.X() + offset, point.Y(), point.Z()),
    gp_Pnt(point.X() - offset, point.Y(), point.Z()),
    gp_Pnt(point.X(), point.Y() + offset, point.Z()),
    gp_Pnt(point.X(), point.Y() - offset, point.Z()),
    gp_Pnt(point.X(), point.Y(), point.Z() + offset),
    gp_Pnt(point.X(), point.Y(), point.Z() - offset),
  };
  for (const gp_Pnt& probe : probes) {
    classifier.Perform(probe, tolerance);
    if (classifier.State() == TopAbs_IN) return true;
  }
  return false;
}

static bool geospecProveMaterialInterval(
  const TopoDS_Solid& solid,
  const std::vector<WallFace>& faces,
  const gp_Pnt& pointA,
  const gp_Pnt& pointB,
  double tolerance
) {
  if (pointA.Distance(pointB) <= tolerance) return false;

  BRepBuilderAPI_MakeEdge edgeBuilder(pointA, pointB);
  if (!edgeBuilder.IsDone()) return false;
  const TopoDS_Edge segment = edgeBuilder.Edge();

  std::vector<double> parameters{0.0, 1.0};
  const double parameterTolerance = 1e-6;
  for (const WallFace& face : faces) {
    try {
      BRepExtrema_DistShapeShape distance(segment, face.face);
      if (!distance.IsDone() || distance.NbSolution() < 1 || distance.Value() > tolerance) continue;
      for (int solution = 1; solution <= distance.NbSolution(); solution++) {
        geospecAddUniqueParameter(
          parameters,
          geospecSegmentParameter(pointA, pointB, distance.PointOnShape1(solution)),
          parameterTolerance
        );
      }
    } catch (...) {
      return false;
    }
  }

  std::sort(parameters.begin(), parameters.end());
  BRepClass3d_SolidClassifier classifier(solid);
  for (std::size_t index = 0; index + 1 < parameters.size(); index++) {
    const double left = parameters[index];
    const double right = parameters[index + 1];
    if (right - left <= parameterTolerance) continue;
    const double mid = (left + right) / 2.0;
    if (mid <= parameterTolerance || mid >= 1.0 - parameterTolerance) continue;
    if (!geospecPointHasMaterialNeighborhood(classifier, geospecPointAtParameter(pointA, pointB, mid), tolerance)) {
      return false;
    }
  }

  if (parameters.size() <= 2) {
    return geospecPointHasMaterialNeighborhood(classifier, geospecPointAtParameter(pointA, pointB, 0.5), tolerance);
  }
  return true;
}

static double geospecBoundsDistance(const WallFace& left, const WallFace& right) {
  return left.bounds.Distance(right.bounds);
}

static std::vector<WallFace> geospecCollectWallFaces(const TopoDS_Solid& solid) {
  std::vector<WallFace> faces;
  for (TopExp_Explorer explorer(solid, TopAbs_FACE); explorer.More(); explorer.Next()) {
    const TopoDS_Face face = TopoDS::Face(explorer.Current());
    Bnd_Box bounds;
    BRepBndLib::Add(face, bounds);
    BRepAdaptor_Surface surface(face, false);
    const bool planar = surface.GetType() == GeomAbs_Plane;
    faces.push_back({
      face,
      bounds,
      planar,
      geospecSurfaceTypeName(surface.GetType()),
    });
  }
  return faces;
}

static gp_Pnt geospecBoundsCenter(const WallFace& face) {
  double minX = 0.0;
  double minY = 0.0;
  double minZ = 0.0;
  double maxX = 0.0;
  double maxY = 0.0;
  double maxZ = 0.0;
  face.bounds.Get(minX, minY, minZ, maxX, maxY, maxZ);
  return gp_Pnt((minX + maxX) / 2.0, (minY + maxY) / 2.0, (minZ + maxZ) / 2.0);
}

static GeoSpecNativeVec3 geospecPlanarFaceNormal(const TopoDS_Face& face) {
  BRepAdaptor_Surface surface(face, false);
  gp_Pln plane = surface.Plane();
  gp_Dir normalDirection = plane.Axis().Direction();
  if (face.Orientation() == TopAbs_REVERSED) {
    normalDirection.Reverse();
  }
  return geospecDirToVec3(normalDirection);
}

static void geospecRecordAcceptedWallCandidate(
  WallThicknessResult& result,
  double value,
  const gp_Pnt& pointA,
  const gp_Pnt& pointB,
  int solidIndex,
  int faceA,
  int faceB,
  const WallFace& left,
  const WallFace& right,
  BRepExtrema_SupportType supportTypeA,
  BRepExtrema_SupportType supportTypeB
) {
  const double tieTolerance = 1e-6;
  if (!result.supported || value < result.value - tieTolerance) {
    result.supported = true;
    result.value = value;
    result.pointA = geospecPointToVec3(pointA);
    result.pointB = geospecPointToVec3(pointB);
    result.location = geospecMidpoint(pointA, pointB);
    result.solidIndex = solidIndex;
    result.faceA = faceA;
    result.faceB = faceB;
    result.surfaceA = left.surfaceType;
    result.surfaceB = right.surfaceType;
    result.supportTypeA = geospecSupportTypeName(supportTypeA);
    result.supportTypeB = geospecSupportTypeName(supportTypeB);
    result.tieCount = 1;
  } else if (std::abs(value - result.value) <= tieTolerance) {
    result.tieCount++;
  }
}

static void geospecTryPlanarCenterCandidate(
  WallThicknessResult& result,
  const TopoDS_Solid& solid,
  const std::vector<WallFace>& faces,
  int solidIndex,
  int faceA,
  int faceB,
  const WallFace& left,
  const WallFace& right,
  bool usePlanarCenterFallback,
  double tolerance
) {
  if (!usePlanarCenterFallback) return;
  if (!left.planar || !right.planar) return;
  const GeoSpecNativeVec3 leftNormal = geospecPlanarFaceNormal(left.face);
  const GeoSpecNativeVec3 rightNormal = geospecPlanarFaceNormal(right.face);
  if (std::abs(std::abs(geospecDot(leftNormal, rightNormal)) - 1.0) > 1e-4) return;

  const gp_Pnt pointA = geospecBoundsCenter(left);
  const gp_Pnt pointB = geospecBoundsCenter(right);
  const double value = pointA.Distance(pointB);
  if (value <= tolerance) return;
  if (result.supported && value > result.value + tolerance) return;
  if (!geospecProveMaterialInterval(solid, faces, pointA, pointB, tolerance)) return;

  geospecRecordAcceptedWallCandidate(
    result,
    value,
    pointA,
    pointB,
    solidIndex,
    faceA,
    faceB,
    left,
    right,
    BRepExtrema_IsInFace,
    BRepExtrema_IsInFace
  );
}

static WallThicknessResult geospecAnalyzeMinimumWallThickness(
  const std::vector<TopoDS_Solid>& solids
) {
  WallThicknessResult result;
  const double tolerance = 1e-6;
  for (std::size_t solidIndex = 0; solidIndex < solids.size(); solidIndex++) {
    const std::vector<WallFace> faces = geospecCollectWallFaces(solids[solidIndex]);
    const bool allFacesPlanar = std::all_of(faces.begin(), faces.end(), [](const WallFace& face) {
      return face.planar;
    });
    const bool usePlanarCenterFallback = allFacesPlanar && faces.size() == 6;
    for (std::size_t leftIndex = 0; leftIndex < faces.size(); leftIndex++) {
      for (std::size_t rightIndex = leftIndex + 1; rightIndex < faces.size(); rightIndex++) {
        if (result.supported && geospecBoundsDistance(faces[leftIndex], faces[rightIndex]) > result.value + tolerance) {
          continue;
        }
        result.checkedPairs++;
        geospecTryPlanarCenterCandidate(
          result,
          solids[solidIndex],
          faces,
          static_cast<int>(solidIndex),
          static_cast<int>(leftIndex),
          static_cast<int>(rightIndex),
          faces[leftIndex],
          faces[rightIndex],
          usePlanarCenterFallback,
          tolerance
        );
        try {
          BRepExtrema_DistShapeShape distance(faces[leftIndex].face, faces[rightIndex].face);
          if (!distance.IsDone() || distance.NbSolution() < 1) {
            result.extremaFailed++;
            continue;
          }
          const double value = distance.Value();
          if (value <= tolerance) {
            result.zeroLength++;
            continue;
          }
          if (result.supported && value > result.value + tolerance) {
            continue;
          }
          for (int solution = 1; solution <= distance.NbSolution(); solution++) {
            const gp_Pnt pointA = distance.PointOnShape1(solution);
            const gp_Pnt pointB = distance.PointOnShape2(solution);
            if (pointA.Distance(pointB) <= tolerance) {
              result.zeroLength++;
              continue;
            }
            if (!geospecProveMaterialInterval(solids[solidIndex], faces, pointA, pointB, tolerance)) {
              result.noMaterialInterval++;
              continue;
            }
            geospecRecordAcceptedWallCandidate(
              result,
              value,
              pointA,
              pointB,
              static_cast<int>(solidIndex),
              static_cast<int>(leftIndex),
              static_cast<int>(rightIndex),
              faces[leftIndex],
              faces[rightIndex],
              distance.SupportTypeShape1(solution),
              distance.SupportTypeShape2(solution)
            );
          }
        } catch (...) {
          result.extremaFailed++;
          continue;
        }
      }
    }
  }
  return result;
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
  const WallSolidValidation solidValidation = geospecValidateClosedSolids(shape);
  const WallThicknessResult wallThickness = solidValidation.valid
    ? geospecAnalyzeMinimumWallThickness(solidValidation.solids)
    : WallThicknessResult{};

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

  std::ostringstream json;
  json << std::setprecision(17);
  json << "{\"brep\":{";
  json << "\"validity\":{\"valid\":" << (solidValidation.valid ? "true" : "false")
    << ",\"closedSolids\":" << (solidValidation.closedSolids ? "true" : "false")
    << ",\"solidCount\":" << solidValidation.solidCount
    << ",\"invalidSolidCount\":" << solidValidation.invalidSolidCount
    << ",\"openEdgeCount\":" << solidValidation.openEdgeCount;
  if (!solidValidation.reason.empty()) {
    json << ",\"reason\":\"" << geospecEscapeJson(solidValidation.reason) << "\"";
  }
  json << "},";
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
  json << "]";

  if (wallThickness.supported) {
    json << ",\"minimumWallThickness\":{\"value\":" << wallThickness.value << ",\"location\":";
    geospecAppendVec3(json, wallThickness.location);
    json << ",\"pointA\":";
    geospecAppendVec3(json, wallThickness.pointA);
    json << ",\"pointB\":";
    geospecAppendVec3(json, wallThickness.pointB);
    json << ",\"solidIndex\":" << wallThickness.solidIndex
      << ",\"tieCount\":" << wallThickness.tieCount
      << ",\"algorithm\":\"occt-brep-extrema-material-interval\""
      << ",\"tolerance\":1e-06"
      << ",\"supportA\":{\"faceIndex\":" << wallThickness.faceA
      << ",\"surfaceType\":\"" << wallThickness.surfaceA
      << "\",\"supportType\":\"" << wallThickness.supportTypeA << "\"}"
      << ",\"supportB\":{\"faceIndex\":" << wallThickness.faceB
      << ",\"surfaceType\":\"" << wallThickness.surfaceB
      << "\",\"supportType\":\"" << wallThickness.supportTypeB << "\"}"
      << ",\"rejections\":{\"checkedPairs\":" << wallThickness.checkedPairs
      << ",\"extremaFailed\":" << wallThickness.extremaFailed
      << ",\"zeroLength\":" << wallThickness.zeroLength
      << ",\"noMaterialInterval\":" << wallThickness.noMaterialInterval << "}}";
  }
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
