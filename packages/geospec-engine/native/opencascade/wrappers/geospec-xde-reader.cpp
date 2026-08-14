// GeoSpec AP242 STEP-XDE structure reader for custom libcascade builds.
//
// Implements SB1 of the GeoSpec verification-kernel blueprint: one STEP-XDE
// read yields occurrence structure, product/subshape names, and native AP242
// datum placements together with retained placed shapes so exact BRep proof
// queries (extrema, classification, boolean common, face facts) run without a
// second parse. JavaScript receives compact JSON only.
//
// Deterministic orderings relied on by consumers (SB3 selector index):
// - `faceIndex` is the 0-based position of a face in
//   `TopExp_Explorer(productShape, TopAbs_FACE)` traversal order over the
//   owning product shape. The placed occurrence shape preserves that order
//   (a TopLoc_Location move does not reorder traversal), so proof calls may
//   address faces of the placed shape with the same index.
// - Occurrence paths are dot-joined instance-name segments from the root
//   (root omitted). When the same segment name repeats under one parent, the
//   segments are disambiguated `name[k]` (1-based) in the parent's stored
//   XCAF component-label order, which mirrors NAUO order in the file.
//
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <limits>
#include <map>
#include <memory>
#include <sstream>
#include <unordered_map>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <utility>
#include <vector>

#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepExtrema_SupportType.hxx>
#include <BRepExtrema_TriangleSet.hxx>
#include <BVH_PairDistance.hxx>
#include <BRepGProp.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepTools.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Poly_Triangle.hxx>
#include <Poly_Triangulation.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <Interface_EntityIterator.hxx>
#include <Interface_Graph.hxx>
#include <Interface_InterfaceModel.hxx>
#include <Interface_Static.hxx>
#include <NCollection_DynamicArray.hxx>
#include <NCollection_Sequence.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <STEPConstruct_UnitContext.hxx>
#include <StepBasic_Product.hxx>
#include <StepBasic_ProductDefinition.hxx>
#include <StepBasic_ProductDefinitionFormation.hxx>
#include <StepDimTol_Datum.hxx>
#include <StepDimTol_DatumOrCommonDatum.hxx>
#include <StepDimTol_DatumReferenceCompartment.hxx>
#include <StepDimTol_DatumReferenceElement.hxx>
#include <StepDimTol_DatumSystem.hxx>
#include <StepDimTol_HArray1OfDatumReferenceCompartment.hxx>
#include <StepDimTol_HArray1OfDatumReferenceElement.hxx>
#include <StepGeom_Axis2Placement3d.hxx>
#include <StepGeom_CartesianPoint.hxx>
#include <StepGeom_Direction.hxx>
#include <StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.hxx>
#include <StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.hxx>
#include <StepGeom_Plane.hxx>
#include <StepRepr_ConstructiveGeometryRepresentation.hxx>
#include <StepRepr_ConstructiveGeometryRepresentationRelationship.hxx>
#include <StepRepr_GlobalUnitAssignedContext.hxx>
#include <StepRepr_ProductDefinitionShape.hxx>
#include <StepRepr_PropertyDefinition.hxx>
#include <StepRepr_Representation.hxx>
#include <StepRepr_RepresentationContext.hxx>
#include <StepRepr_RepresentationItem.hxx>
#include <StepRepr_RepresentationRelationship.hxx>
#include <StepRepr_ShapeAspect.hxx>
#include <StepAP242_DraughtingModelItemAssociation.hxx>
#include <StepAP242_ItemIdentifiedRepresentationUsage.hxx>
#include <StepRepr_ShapeAspectRelationship.hxx>
#include <StepShape_ShapeDefinitionRepresentation.hxx>
#include <TCollection_AsciiString.hxx>
#include <TCollection_ExtendedString.hxx>
#include <TDF_Label.hxx>
#include <TDF_Tool.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopAbs_State.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_ListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Solid.hxx>
#include <TransferBRep.hxx>
#include <Transfer_TransientProcess.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <XSControl_TransferReader.hxx>
#include <XSControl_WorkSession.hxx>
#include <gp_Cone.hxx>
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

// Native operations are timed by the TypeScript protocol boundary. Native
// code never selects telemetry or writes directly to a host stream.
constexpr bool geospecForensicEnabled = false;
static double geospecForensicNowMs() { return 0.0; }
static void geospecForensicLog(const char*, double) {}
static void geospecForensicValue(const char*, double) {}

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

static WallSolidValidation geospecValidateClosedSolids(const TopoDS_Shape& shape, bool geomControls) {
  WallSolidValidation validation;
  const double wholeShapeStart = geospecForensicNowMs();
  // R5: one analysis of the root; the whole-shape verdict and every per-solid
  // verdict are queries against the same BRepCheck result map (the eager
  // reader built a fresh analyzer per solid - duplicate work, same checks).
  BRepCheck_Analyzer analyzer(shape, geomControls);
  validation.wholeShapeValid = analyzer.IsValid();
  geospecForensicLog("native.facet.validity.wholeShape", wholeShapeStart);
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

  double perSolidCheckMs = 0.0;
  double closedEdgesMs = 0.0;
  for (const TopoDS_Solid& solid : validation.solids) {
    const double solidCheckStart = geospecForensicNowMs();
    if (!analyzer.IsValid(solid)) {
      validation.invalidSolidCount++;
      validation.valid = false;
      if (validation.reason.empty()) validation.reason = "invalid-solid";
    }
    const double closedEdgesStart = geospecForensicNowMs();
    perSolidCheckMs += closedEdgesStart - solidCheckStart;
    int openEdges = 0;
    geospecSolidHasClosedEdges(solid, openEdges);
    closedEdgesMs += geospecForensicNowMs() - closedEdgesStart;
    validation.openEdgeCount += openEdges;
  }
  geospecForensicValue("native.facet.validity.perSolid", perSolidCheckMs);
  geospecForensicValue("native.facet.validity.closedEdges", closedEdgesMs);
  geospecForensicValue("native.facet.validity.solidCount", validation.solidCount);

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

// Forensic accounting for the scoped material-interval boundary scan (R4
// tier 1): proofs and mean scanned-face counts ride the forensic channel.
// Per-TU statics are safe here: every use sits on one call chain from a
// single facet entry point (wrapper-hygiene note, blueprint C2).
static double geospecForensicScopeFaceSum = 0.0;
static long long geospecForensicScopeCalls = 0;

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

  // R4 tier 1: scope the boundary scan to faces whose AABB meets the
  // tolerance-inflated segment AABB. Superset-safe: a face contributes
  // interval parameters only when its exact distance to the segment is
  // <= tolerance, and any such face's AABB then intersects the inflated
  // segment AABB (blueprint A6; 0 violations measured across 227 proofs at
  // three model scales, B4/C7). An exception on a scanned face still rejects
  // the whole candidate; out-of-scope faces are provably non-contributing.
  Bnd_Box segmentBounds;
  segmentBounds.Add(pointA);
  segmentBounds.Add(pointB);
  if (geospecForensicEnabled) geospecForensicScopeCalls++;

  std::vector<double> parameters{0.0, 1.0};
  const double parameterTolerance = 1e-6;
  for (const WallFace& face : faces) {
    if (face.bounds.Distance(segmentBounds) > tolerance) continue;
    if (geospecForensicEnabled) geospecForensicScopeFaceSum += 1.0;
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

// R13: facet budget in work units (one unit = one exact face-pair extrema or
// one material-interval proof) checked inside the native loops. Deterministic
// firing, unlike wall-clock (geospec-policy section 16); on exhaustion the facet
// reports a bounded budget-exceeded error and no partial minimum (a partial
// minimum is not a verdict). Wall-clock budgets remain the outer safety net.
struct WallWorkBudget {
  long long limit = 250000;
  long long consumed = 0;
  bool exceeded = false;

  bool charge() {
    if (consumed >= limit) {
      exceeded = true;
      return false;
    }
    consumed++;
    return true;
  }
};

// ===== R4 tier 2: certified mesh lower bounds =====
// Exact distance between two faces is lower-bounded by the distance between
// their triangulations minus the achieved deflections: every surface point
// lies within its face's deflection of the mesh, so
//   exact >= meshDistance - deflectionA - deflectionB.
// The bound is floored by the (unconditionally sound) AABB distance, so a
// tessellation that violates its deflection promise can cost performance but
// can never prune below the AABB floor (blueprint A5). Mesh values order and
// prune only - every reported number remains an exact extremum plus an exact
// material-interval classification (geospec-policy sections 6, 17).

static double geospecVecDot(const BVH_Vec3d& a, const BVH_Vec3d& b) {
  return a.x() * b.x() + a.y() * b.y() + a.z() * b.z();
}

static BVH_Vec3d geospecVecSub(const BVH_Vec3d& a, const BVH_Vec3d& b) {
  return BVH_Vec3d(a.x() - b.x(), a.y() - b.y(), a.z() - b.z());
}

static BVH_Vec3d geospecVecCross(const BVH_Vec3d& a, const BVH_Vec3d& b) {
  return BVH_Vec3d(
    a.y() * b.z() - a.z() * b.y(),
    a.z() * b.x() - a.x() * b.z(),
    a.x() * b.y() - a.y() * b.x());
}

// Closest-point distance from a point to a triangle (Ericson, RTCD 5.1.5).
static double geospecPointTriangleDistanceSquared(
  const BVH_Vec3d& p, const BVH_Vec3d& a, const BVH_Vec3d& b, const BVH_Vec3d& c
) {
  const BVH_Vec3d ab = geospecVecSub(b, a);
  const BVH_Vec3d ac = geospecVecSub(c, a);
  const BVH_Vec3d ap = geospecVecSub(p, a);
  const double d1 = geospecVecDot(ab, ap);
  const double d2 = geospecVecDot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) {
    return geospecVecDot(ap, ap);
  }
  const BVH_Vec3d bp = geospecVecSub(p, b);
  const double d3 = geospecVecDot(ab, bp);
  const double d4 = geospecVecDot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) {
    return geospecVecDot(bp, bp);
  }
  const double vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
    const double v = d1 / (d1 - d3);
    const BVH_Vec3d q = geospecVecSub(ap, BVH_Vec3d(ab.x() * v, ab.y() * v, ab.z() * v));
    return geospecVecDot(q, q);
  }
  const BVH_Vec3d cp = geospecVecSub(p, c);
  const double d5 = geospecVecDot(ab, cp);
  const double d6 = geospecVecDot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) {
    return geospecVecDot(cp, cp);
  }
  const double vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
    const double w = d2 / (d2 - d6);
    const BVH_Vec3d q = geospecVecSub(ap, BVH_Vec3d(ac.x() * w, ac.y() * w, ac.z() * w));
    return geospecVecDot(q, q);
  }
  const double va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
    const double w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const BVH_Vec3d bc = geospecVecSub(c, b);
    const BVH_Vec3d q = geospecVecSub(bp, BVH_Vec3d(bc.x() * w, bc.y() * w, bc.z() * w));
    return geospecVecDot(q, q);
  }
  const double denominator = 1.0 / (va + vb + vc);
  const double v = vb * denominator;
  const double w = vc * denominator;
  const BVH_Vec3d closest(
    a.x() + ab.x() * v + ac.x() * w,
    a.y() + ab.y() * v + ac.y() * w,
    a.z() + ab.z() * v + ac.z() * w);
  const BVH_Vec3d q = geospecVecSub(p, closest);
  return geospecVecDot(q, q);
}

// Closest-point distance between two segments (Ericson, RTCD 5.1.9).
static double geospecSegmentSegmentDistanceSquared(
  const BVH_Vec3d& p1, const BVH_Vec3d& q1, const BVH_Vec3d& p2, const BVH_Vec3d& q2
) {
  const BVH_Vec3d d1 = geospecVecSub(q1, p1);
  const BVH_Vec3d d2 = geospecVecSub(q2, p2);
  const BVH_Vec3d r = geospecVecSub(p1, p2);
  const double a = geospecVecDot(d1, d1);
  const double e = geospecVecDot(d2, d2);
  const double f = geospecVecDot(d2, r);
  double s = 0.0;
  double t = 0.0;
  const double epsilon = 1e-30;
  if (a <= epsilon && e <= epsilon) {
    const BVH_Vec3d diff = geospecVecSub(p1, p2);
    return geospecVecDot(diff, diff);
  }
  if (a <= epsilon) {
    t = std::max(0.0, std::min(1.0, f / e));
  } else {
    const double c = geospecVecDot(d1, r);
    if (e <= epsilon) {
      s = std::max(0.0, std::min(1.0, -c / a));
    } else {
      const double b = geospecVecDot(d1, d2);
      const double denominator = a * e - b * b;
      s = denominator > epsilon ? std::max(0.0, std::min(1.0, (b * f - c * e) / denominator)) : 0.0;
      t = (b * s + f) / e;
      if (t < 0.0) {
        t = 0.0;
        s = std::max(0.0, std::min(1.0, -c / a));
      } else if (t > 1.0) {
        t = 1.0;
        s = std::max(0.0, std::min(1.0, (b - c) / a));
      }
    }
  }
  const BVH_Vec3d c1(p1.x() + d1.x() * s, p1.y() + d1.y() * s, p1.z() + d1.z() * s);
  const BVH_Vec3d c2(p2.x() + d2.x() * t, p2.y() + d2.y() * t, p2.z() + d2.z() * t);
  const BVH_Vec3d diff = geospecVecSub(c1, c2);
  return geospecVecDot(diff, diff);
}

// Does the open segment pierce the triangle's interior? Covers the crossing
// configuration the feature-feature minimum cannot see (a piercing pair has
// distance 0). Coplanar overlap is covered by the point-triangle terms.
static bool geospecSegmentPiercesTriangle(
  const BVH_Vec3d& p, const BVH_Vec3d& q, const BVH_Vec3d& a, const BVH_Vec3d& b, const BVH_Vec3d& c
) {
  const BVH_Vec3d ab = geospecVecSub(b, a);
  const BVH_Vec3d ac = geospecVecSub(c, a);
  const BVH_Vec3d normal = geospecVecCross(ab, ac);
  const double denominator = geospecVecDot(normal, geospecVecSub(q, p));
  if (std::abs(denominator) <= 1e-30) {
    return false;
  }
  const double t = geospecVecDot(normal, geospecVecSub(a, p)) / denominator;
  if (t < 0.0 || t > 1.0) {
    return false;
  }
  const BVH_Vec3d hit(
    p.x() + (q.x() - p.x()) * t,
    p.y() + (q.y() - p.y()) * t,
    p.z() + (q.z() - p.z()) * t);
  // Barycentric containment.
  const BVH_Vec3d ah = geospecVecSub(hit, a);
  const double d00 = geospecVecDot(ab, ab);
  const double d01 = geospecVecDot(ab, ac);
  const double d11 = geospecVecDot(ac, ac);
  const double d20 = geospecVecDot(ah, ab);
  const double d21 = geospecVecDot(ah, ac);
  const double denom = d00 * d11 - d01 * d01;
  if (std::abs(denom) <= 1e-30) {
    return false;
  }
  const double v = (d11 * d20 - d01 * d21) / denom;
  const double w = (d00 * d21 - d01 * d20) / denom;
  return v >= 0.0 && w >= 0.0 && (v + w) <= 1.0;
}

// Exact triangle-triangle minimum distance: 0 when any edge pierces the
// other triangle, else the minimum over the 9 edge-edge and 6 vertex-face
// feature pairs (complete for non-piercing configurations).
static double geospecTriangleDistanceSquared(
  const BVH_Vec3d& a1, const BVH_Vec3d& b1, const BVH_Vec3d& c1,
  const BVH_Vec3d& a2, const BVH_Vec3d& b2, const BVH_Vec3d& c2
) {
  const BVH_Vec3d first[3] = {a1, b1, c1};
  const BVH_Vec3d second[3] = {a2, b2, c2};
  for (int edge = 0; edge < 3; edge++) {
    if (geospecSegmentPiercesTriangle(first[edge], first[(edge + 1) % 3], a2, b2, c2)) return 0.0;
    if (geospecSegmentPiercesTriangle(second[edge], second[(edge + 1) % 3], a1, b1, c1)) return 0.0;
  }
  double best = std::numeric_limits<double>::infinity();
  for (int i = 0; i < 3; i++) {
    best = std::min(best, geospecPointTriangleDistanceSquared(first[i], a2, b2, c2));
    best = std::min(best, geospecPointTriangleDistanceSquared(second[i], a1, b1, c1));
    for (int j = 0; j < 3; j++) {
      best = std::min(
        best,
        geospecSegmentSegmentDistanceSquared(
          first[i], first[(i + 1) % 3], second[j], second[(j + 1) % 3]));
    }
  }
  return best;
}

// Minimum distance between two face triangulations via their BVH trees.
class GeoSpecFacePairMeshDistance : public BVH_PairDistance<Standard_Real, 3, BRepExtrema_TriangleSet> {
public:
  GeoSpecFacePairMeshDistance(BRepExtrema_TriangleSet& left, BRepExtrema_TriangleSet& right)
    : left_(&left), right_(&right) {
    SetBVHSets(left_, right_);
  }

  bool Accept(const int indexLeft, const int indexRight) override {
    BVH_Vec3d a1;
    BVH_Vec3d b1;
    BVH_Vec3d c1;
    BVH_Vec3d a2;
    BVH_Vec3d b2;
    BVH_Vec3d c2;
    left_->GetVertices(indexLeft, a1, b1, c1);
    right_->GetVertices(indexRight, a2, b2, c2);
    const double distanceSquared = geospecTriangleDistanceSquared(a1, b1, c1, a2, b2, c2);
    if (distanceSquared < myDistance) {
      myDistance = distanceSquared;
      return true;
    }
    return false;
  }

private:
  BRepExtrema_TriangleSet* left_;
  BRepExtrema_TriangleSet* right_;
};

// One accepted (material-proven) wall candidate, buffered during the ordered
// search and fed to the recorder in (solid, faceA, faceB, generation) order so
// the reported value / tieCount / witness stay bit-identical to the eager
// index-order loop under the 1e-6 tie chaining (blueprint A7).
struct AcceptedWallCandidate {
  double value = 0.0;
  gp_Pnt pointA;
  gp_Pnt pointB;
  int solidIndex = -1;
  int faceA = -1;
  int faceB = -1;
  std::string surfaceA;
  std::string surfaceB;
  BRepExtrema_SupportType supportTypeA = BRepExtrema_IsVertex;
  BRepExtrema_SupportType supportTypeB = BRepExtrema_IsVertex;
  long long sequence = 0;
};

static void geospecRecordAcceptedWallCandidate(WallThicknessResult& result, const AcceptedWallCandidate& candidate) {
  const double tieTolerance = 1e-6;
  if (!result.supported || candidate.value < result.value - tieTolerance) {
    result.supported = true;
    result.value = candidate.value;
    result.pointA = geospecPointToVec3(candidate.pointA);
    result.pointB = geospecPointToVec3(candidate.pointB);
    result.location = geospecMidpoint(candidate.pointA, candidate.pointB);
    result.solidIndex = candidate.solidIndex;
    result.faceA = candidate.faceA;
    result.faceB = candidate.faceB;
    result.surfaceA = candidate.surfaceA;
    result.surfaceB = candidate.surfaceB;
    result.supportTypeA = geospecSupportTypeName(candidate.supportTypeA);
    result.supportTypeB = geospecSupportTypeName(candidate.supportTypeB);
    result.tieCount = 1;
  } else if (std::abs(candidate.value - result.value) <= tieTolerance) {
    result.tieCount++;
  }
}

// Accept a candidate into the buffer and tighten the certified upper bound.
// Only material-proven values reach here, so tightening is sound (a
// non-material value must never prune - blueprint A4).
static void geospecAcceptWallCandidate(
  std::vector<AcceptedWallCandidate>& accepted,
  double& upperBound,
  bool& hasUpperBound,
  AcceptedWallCandidate candidate
) {
  candidate.sequence = static_cast<long long>(accepted.size());
  if (!hasUpperBound || candidate.value < upperBound) {
    upperBound = candidate.value;
    hasUpperBound = true;
  }
  accepted.push_back(std::move(candidate));
}

static void geospecTryPlanarCenterCandidate(
  std::vector<AcceptedWallCandidate>& accepted,
  double& upperBound,
  bool& hasUpperBound,
  const TopoDS_Solid& solid,
  const std::vector<WallFace>& faces,
  int solidIndex,
  int faceA,
  int faceB,
  const WallFace& left,
  const WallFace& right,
  bool usePlanarCenterFallback,
  WallWorkBudget& budget,
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
  // Certified skip: a value beyond the running material upper bound can
  // neither win nor tie the final chain, so proving it is pure waste.
  if (hasUpperBound && value > upperBound + tolerance) return;
  if (!budget.charge()) return;
  if (!geospecProveMaterialInterval(solid, faces, pointA, pointB, tolerance)) return;

  AcceptedWallCandidate candidate;
  candidate.value = value;
  candidate.pointA = pointA;
  candidate.pointB = pointB;
  candidate.solidIndex = solidIndex;
  candidate.faceA = faceA;
  candidate.faceB = faceB;
  candidate.surfaceA = left.surfaceType;
  candidate.surfaceB = right.surfaceType;
  candidate.supportTypeA = BRepExtrema_IsInFace;
  candidate.supportTypeB = BRepExtrema_IsInFace;
  geospecAcceptWallCandidate(accepted, upperBound, hasUpperBound, candidate);
}

static long long geospecPairKey(int left, int right) {
  const long long low = left < right ? left : right;
  const long long high = left < right ? right : left;
  return low * 1000000LL + high;
}

// Collect local-index face pairs sharing a subshape of the given type
// (TopAbs_EDGE = edge-adjacent, TopAbs_VERTEX = vertex-sharing). R4 tier 1:
// a shared subshape forces exact extrema distance 0 <= tolerance, which the
// eager loop paid full extrema to discard as zeroLength (measured: 99.86 to
// 100 percent of all zeroLength pairs across three model scales, B2/C7) -
// these pairs are skipped outright, verdict-identically.
static void geospecCollectTopologyPairs(
  const TopoDS_Solid& solid,
  const std::vector<WallFace>& faces,
  TopAbs_ShapeEnum subshapeType,
  std::unordered_set<long long>& pairs
) {
  TopTools_IndexedMapOfShape faceMap;
  std::vector<int> mapIndexToLocal;
  for (std::size_t index = 0; index < faces.size(); index++) {
    const int mapIndex = faceMap.Add(faces[index].face);
    if (static_cast<std::size_t>(mapIndex) > mapIndexToLocal.size()) {
      mapIndexToLocal.push_back(static_cast<int>(index));
    }
  }
  TopTools_IndexedDataMapOfShapeListOfShape subshapeToFaces;
  TopExp::MapShapesAndAncestors(solid, subshapeType, TopAbs_FACE, subshapeToFaces);
  for (int subshapeIndex = 1; subshapeIndex <= subshapeToFaces.Extent(); subshapeIndex++) {
    const TopTools_ListOfShape& ancestorFaces = subshapeToFaces.FindFromIndex(subshapeIndex);
    std::vector<int> localIndices;
    for (TopTools_ListOfShape::Iterator iterator(ancestorFaces); iterator.More(); iterator.Next()) {
      const int mapIndex = faceMap.FindIndex(iterator.Value());
      if (mapIndex > 0) {
        localIndices.push_back(mapIndexToLocal[static_cast<std::size_t>(mapIndex) - 1]);
      }
    }
    for (std::size_t left = 0; left < localIndices.size(); left++) {
      for (std::size_t right = left + 1; right < localIndices.size(); right++) {
        if (localIndices[left] != localIndices[right]) {
          pairs.insert(geospecPairKey(localIndices[left], localIndices[right]));
        }
      }
    }
  }
}

static WallThicknessResult geospecAnalyzeMinimumWallThickness(
  const std::vector<TopoDS_Solid>& solids,
  WallWorkBudget& budget,
  double meshLinearDeflection,
  double meshAngularDeflectionRadians
) {
  // Per-solid tier-2 state is local to this analysis. Keeping it local also
  // keeps its non-copyable unique ownership out of the custom Embind surface.
  struct WallMeshContext {
    bool ready = false;
    std::vector<std::unique_ptr<BRepExtrema_TriangleSet>> faceSets;
    std::vector<double> faceDeflections;

    void build(
      const TopoDS_Solid& solid,
      const std::vector<WallFace>& faces,
      double linearDeflection,
      double angularDeflectionRadians
    ) {
      ready = true;
      faceSets.resize(faces.size());
      faceDeflections.assign(faces.size(), 0.0);
      BRepTools::Clean(solid, false);
      BRepMesh_IncrementalMesh mesher(solid, linearDeflection, false, angularDeflectionRadians, false);
      for (std::size_t index = 0; index < faces.size(); index++) {
        TopLoc_Location location;
        const Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(faces[index].face, location);
        if (triangulation.IsNull() || triangulation->NbTriangles() <= 0) {
          continue;
        }
        // Slack must cover the full mesh-vs-face Hausdorff deviation. The
        // stored triangulation deflection is the surface deviation only; a
        // planar face's curved trim-boundary chords can still deviate by the
        // requested linear deflection.
        faceDeflections[index] = std::max(triangulation->Deflection(), linearDeflection);
        NCollection_DynamicArray<TopoDS_Shape> shapes;
        shapes.Append(faces[index].face);
        auto set = std::make_unique<BRepExtrema_TriangleSet>();
        if (set->Init(shapes)) {
          faceSets[index] = std::move(set);
        }
      }
    }
  };

  WallThicknessResult result;
  const double tolerance = 1e-6;
  // R4 tier 1 (blueprint): adjacency skip + AABB-distance-ordered candidates
  // with certified termination + buffered acceptance replayed in index order.
  // The per-pair verdict machinery (planar-center fallback, exact extrema
  // over every solution, zero-length discard, scoped material-interval
  // proofs) is byte-identical to the eager loop; only the pair *selection*
  // changed, and every skipped pair is provably non-minimal:
  //  - adjacency skip: shared edge/vertex forces exact distance 0 (today's
  //    zeroLength discard, paid for free);
  //  - ordered pruning: AABB distance lower-bounds exact distance, so once
  //    pairAabb > upperBound + tolerance every later pair in the ascending
  //    order can neither win nor tie (upperBound only ever holds
  //    material-proven values - A4).
  // Forensic accumulators; the per-pair clock reads only run when enabled.
  double extremaMs = 0.0;
  double materialIntervalMs = 0.0;
  long long materialIntervalCalls = 0;
  long long totalPairs = 0;
  long long adjacentSkipped = 0;
  long long orderedPruned = 0;
  long long meshPruned = 0;
  long long meshQueries = 0;
  double meshBuildMs = 0.0;
  if (geospecForensicEnabled) {
    geospecForensicScopeFaceSum = 0.0;
    geospecForensicScopeCalls = 0;
  }

  std::vector<AcceptedWallCandidate> accepted;
  double upperBound = std::numeric_limits<double>::infinity();
  bool hasUpperBound = false;

  for (std::size_t solidIndex = 0; solidIndex < solids.size() && !budget.exceeded; solidIndex++) {
    const std::vector<WallFace> faces = geospecCollectWallFaces(solids[solidIndex]);
    geospecForensicValue("native.facet.wallThickness.faces", static_cast<double>(faces.size()));
    const bool allFacesPlanar = std::all_of(faces.begin(), faces.end(), [](const WallFace& face) {
      return face.planar;
    });
    const bool usePlanarCenterFallback = allFacesPlanar && faces.size() == 6;

    std::unordered_set<long long> adjacentPairs;
    geospecCollectTopologyPairs(solids[solidIndex], faces, TopAbs_EDGE, adjacentPairs);
    geospecCollectTopologyPairs(solids[solidIndex], faces, TopAbs_VERTEX, adjacentPairs);

    struct WallPairCandidate {
      double aabbDistance;
      int leftIndex;
      int rightIndex;
    };
    std::vector<WallPairCandidate> ordered;
    ordered.reserve(faces.size() * (faces.size() > 0 ? faces.size() - 1 : 0) / 2);
    for (std::size_t leftIndex = 0; leftIndex < faces.size(); leftIndex++) {
      for (std::size_t rightIndex = leftIndex + 1; rightIndex < faces.size(); rightIndex++) {
        totalPairs++;
        if (adjacentPairs.count(geospecPairKey(static_cast<int>(leftIndex), static_cast<int>(rightIndex))) > 0) {
          adjacentSkipped++;
          continue;
        }
        ordered.push_back({
          geospecBoundsDistance(faces[leftIndex], faces[rightIndex]),
          static_cast<int>(leftIndex),
          static_cast<int>(rightIndex),
        });
      }
    }
    // Deterministic order: distance, then today's face-index order (stable
    // cost and stable prune decisions run to run - policy section 16).
    std::sort(ordered.begin(), ordered.end(), [](const WallPairCandidate& a, const WallPairCandidate& b) {
      if (a.aabbDistance != b.aabbDistance) return a.aabbDistance < b.aabbDistance;
      if (a.leftIndex != b.leftIndex) return a.leftIndex < b.leftIndex;
      return a.rightIndex < b.rightIndex;
    });

    // R4 tier 2: certified mesh lower bounds. Engaged only at casting scale
    // (small candidate sets never repay tessellation - a pure perf knob;
    // prune decisions stay certified either way).
    WallMeshContext meshContext;
    std::unordered_map<long long, double> meshLowerBoundByPair;
    const bool useMeshLowerBounds = ordered.size() >= 64;
    const auto pairMeshLowerBound = [&](const WallPairCandidate& pair) -> double {
      if (!useMeshLowerBounds) {
        return pair.aabbDistance;
      }
      const long long key = geospecPairKey(pair.leftIndex, pair.rightIndex);
      const auto memo = meshLowerBoundByPair.find(key);
      if (memo != meshLowerBoundByPair.end()) {
        return memo->second;
      }
      if (!meshContext.ready) {
        const double buildStart = geospecForensicEnabled ? geospecForensicNowMs() : 0.0;
        meshContext.build(solids[solidIndex], faces, meshLinearDeflection, meshAngularDeflectionRadians);
        if (geospecForensicEnabled) {
          meshBuildMs += geospecForensicNowMs() - buildStart;
        }
      }
      double bound = pair.aabbDistance;
      BRepExtrema_TriangleSet* left = meshContext.faceSets[static_cast<std::size_t>(pair.leftIndex)].get();
      BRepExtrema_TriangleSet* right = meshContext.faceSets[static_cast<std::size_t>(pair.rightIndex)].get();
      if (left != nullptr && right != nullptr) {
        GeoSpecFacePairMeshDistance query(*left, *right);
        query.ComputeDistance();
        meshQueries++;
        if (query.IsDone()) {
          const double meshDistance = std::sqrt(query.Distance());
          const double slack =
            meshContext.faceDeflections[static_cast<std::size_t>(pair.leftIndex)] +
            meshContext.faceDeflections[static_cast<std::size_t>(pair.rightIndex)];
          // LB = max(mesh - deflections, aabb): the AABB floor keeps the
          // prune sound even against a deflection-violating tessellation.
          bound = std::max(bound, meshDistance - slack);
        }
      }
      meshLowerBoundByPair.emplace(key, bound);
      return bound;
    };
    if (useMeshLowerBounds) {
      // The AABB zero bucket (overlapping boxes) is where AABB ordering is
      // blind; reorder it by the mesh lower bound so the upper bound
      // tightens with the first exact evaluations (blueprint tier-2 rule 5).
      std::size_t bucketEnd = 0;
      while (bucketEnd < ordered.size() && ordered[bucketEnd].aabbDistance <= tolerance) {
        bucketEnd++;
      }
      if (bucketEnd > 1) {
        std::stable_sort(
          ordered.begin(),
          ordered.begin() + static_cast<std::ptrdiff_t>(bucketEnd),
          [&](const WallPairCandidate& a, const WallPairCandidate& b) {
            const double boundA = pairMeshLowerBound(a);
            const double boundB = pairMeshLowerBound(b);
            if (boundA != boundB) return boundA < boundB;
            if (a.leftIndex != b.leftIndex) return a.leftIndex < b.leftIndex;
            return a.rightIndex < b.rightIndex;
          });
      }
    }

    for (std::size_t position = 0; position < ordered.size() && !budget.exceeded; position++) {
      const WallPairCandidate& pair = ordered[position];
      if (hasUpperBound && pair.aabbDistance > upperBound + tolerance) {
        // Certified termination: AABB distance is a true lower bound on the
        // exact distance, and the order is ascending, so every remaining
        // pair of this solid is provably outside the final tie chain.
        orderedPruned += static_cast<long long>(ordered.size() - position);
        break;
      }
      if (hasUpperBound && pairMeshLowerBound(pair) > upperBound + tolerance) {
        // Certified mesh prune: exact distance >= mesh lower bound, so this
        // pair can neither win nor tie the final chain. No exact call spent.
        meshPruned++;
        continue;
      }
      const std::size_t leftIndex = static_cast<std::size_t>(pair.leftIndex);
      const std::size_t rightIndex = static_cast<std::size_t>(pair.rightIndex);
      result.checkedPairs++;
      geospecTryPlanarCenterCandidate(
        accepted,
        upperBound,
        hasUpperBound,
        solids[solidIndex],
        faces,
        static_cast<int>(solidIndex),
        pair.leftIndex,
        pair.rightIndex,
        faces[leftIndex],
        faces[rightIndex],
        usePlanarCenterFallback,
        budget,
        tolerance
      );
      if (!budget.charge()) break;
      try {
        const double extremaStart = geospecForensicEnabled ? geospecForensicNowMs() : 0.0;
        BRepExtrema_DistShapeShape distance(faces[leftIndex].face, faces[rightIndex].face);
        if (geospecForensicEnabled) {
          extremaMs += geospecForensicNowMs() - extremaStart;
        }
        if (!distance.IsDone() || distance.NbSolution() < 1) {
          result.extremaFailed++;
          continue;
        }
        const double value = distance.Value();
        if (value <= tolerance) {
          result.zeroLength++;
          continue;
        }
        if (hasUpperBound && value > upperBound + tolerance) {
          continue;
        }
        for (int solution = 1; solution <= distance.NbSolution() && !budget.exceeded; solution++) {
          const gp_Pnt pointA = distance.PointOnShape1(solution);
          const gp_Pnt pointB = distance.PointOnShape2(solution);
          if (pointA.Distance(pointB) <= tolerance) {
            result.zeroLength++;
            continue;
          }
          if (!budget.charge()) break;
          const double intervalStart = geospecForensicEnabled ? geospecForensicNowMs() : 0.0;
          const bool hasMaterialInterval =
            geospecProveMaterialInterval(solids[solidIndex], faces, pointA, pointB, tolerance);
          if (geospecForensicEnabled) {
            materialIntervalMs += geospecForensicNowMs() - intervalStart;
            materialIntervalCalls++;
          }
          if (!hasMaterialInterval) {
            result.noMaterialInterval++;
            continue;
          }
          AcceptedWallCandidate candidate;
          candidate.value = value;
          candidate.pointA = pointA;
          candidate.pointB = pointB;
          candidate.solidIndex = static_cast<int>(solidIndex);
          candidate.faceA = pair.leftIndex;
          candidate.faceB = pair.rightIndex;
          candidate.surfaceA = faces[leftIndex].surfaceType;
          candidate.surfaceB = faces[rightIndex].surfaceType;
          candidate.supportTypeA = distance.SupportTypeShape1(solution);
          candidate.supportTypeB = distance.SupportTypeShape2(solution);
          geospecAcceptWallCandidate(accepted, upperBound, hasUpperBound, candidate);
        }
      } catch (...) {
        result.extremaFailed++;
        continue;
      }
    }
  }

  // Acceptance replay in today's traversal order - (solid, faceA, faceB),
  // then generation order within a pair (planar-center candidate first, then
  // extrema solutions 1..N) - so value/tieCount/witness are bit-identical to
  // the eager loop for every pair it could have accepted (A7). Sound because
  // every pair the new pruning dropped has exact distance > final value +
  // tolerance, hence could neither win nor tie.
  std::sort(accepted.begin(), accepted.end(), [](const AcceptedWallCandidate& a, const AcceptedWallCandidate& b) {
    if (a.solidIndex != b.solidIndex) return a.solidIndex < b.solidIndex;
    if (a.faceA != b.faceA) return a.faceA < b.faceA;
    if (a.faceB != b.faceB) return a.faceB < b.faceB;
    return a.sequence < b.sequence;
  });
  for (const AcceptedWallCandidate& candidate : accepted) {
    geospecRecordAcceptedWallCandidate(result, candidate);
  }

  geospecForensicValue("native.facet.wallThickness.extremaMs", extremaMs);
  geospecForensicValue("native.facet.wallThickness.materialIntervalMs", materialIntervalMs);
  geospecForensicValue("native.facet.wallThickness.materialIntervalCalls", static_cast<double>(materialIntervalCalls));
  geospecForensicValue("native.facet.wallThickness.checkedPairs", static_cast<double>(result.checkedPairs));
  geospecForensicValue("native.facet.wallThickness.extremaFailed", static_cast<double>(result.extremaFailed));
  geospecForensicValue("native.facet.wallThickness.zeroLength", static_cast<double>(result.zeroLength));
  geospecForensicValue("native.facet.wallThickness.noMaterialInterval", static_cast<double>(result.noMaterialInterval));
  geospecForensicValue("native.facet.wallThickness.tier1.totalPairs", static_cast<double>(totalPairs));
  geospecForensicValue("native.facet.wallThickness.tier1.adjacentSkipped", static_cast<double>(adjacentSkipped));
  geospecForensicValue("native.facet.wallThickness.tier1.orderedPruned", static_cast<double>(orderedPruned));
  geospecForensicValue("native.facet.wallThickness.tier2.meshPruned", static_cast<double>(meshPruned));
  geospecForensicValue("native.facet.wallThickness.tier2.meshQueries", static_cast<double>(meshQueries));
  geospecForensicValue("native.facet.wallThickness.tier2.meshBuildMs", meshBuildMs);
  geospecForensicValue("native.facet.wallThickness.workUnits", static_cast<double>(budget.consumed));
  if (geospecForensicEnabled) {
    geospecForensicValue("native.facet.wallThickness.scope.calls", static_cast<double>(geospecForensicScopeCalls));
    geospecForensicValue(
      "native.facet.wallThickness.scope.meanFaces",
      geospecForensicScopeCalls > 0 ? geospecForensicScopeFaceSum / static_cast<double>(geospecForensicScopeCalls) : 0.0
    );
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
  int& triangleCount,
  double* achievedDeflection = nullptr
) {
  triangleSoup = nullptr;
  triangleCount = 0;
  // The mesh-vs-BRep Hausdorff bound consumers use to size exactness bands is
  // floored at the REQUESTED deflection (the WallMeshContext lesson, caught by
  // the parity corpus): a planar face stores ~0 surface deviation while its
  // trimmed-boundary chords still deviate by up to the requested deflection.
  if (achievedDeflection != nullptr) *achievedDeflection = options.meshLinearTolerance;
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
      if (achievedDeflection != nullptr) {
        *achievedDeflection = std::max(*achievedDeflection, triangulation->Deflection());
      }
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

// ===== Evidence facets (lazy-evidence blueprint R3) =====
// The eager reader's monolithic analyzeShapeJson is decomposed into
// facet-scoped emitters, one coarse native call each (geospec-policy section 1 / section 18 of geospec-policy). Field names, field order within each object, and numeric precision
// (setprecision(17)) are identical to the eager emission, so parsed evidence
// is byte-equal under the evidence-parity corpus - a move, not a rewrite.

static void geospecComputeBoundingBox(
  const TopoDS_Shape& shape,
  GeoSpecNativeVec3& boxMin,
  GeoSpecNativeVec3& boxMax
) {
  Bnd_Box box;
  BRepBndLib::Add(shape, box);
  double xmin = 0.0;
  double ymin = 0.0;
  double zmin = 0.0;
  double xmax = 0.0;
  double ymax = 0.0;
  double zmax = 0.0;
  box.Get(xmin, ymin, zmin, xmax, ymax, zmax);
  boxMin = {xmin, ymin, zmin};
  boxMax = {xmax, ymax, zmax};
}

static std::string geospecFacetSummaryJson(const TopoDS_Shape& shape) {
  const double start = geospecForensicNowMs();
  GeoSpecNativeVec3 boxMin{0.0, 0.0, 0.0};
  GeoSpecNativeVec3 boxMax{0.0, 0.0, 0.0};
  geospecComputeBoundingBox(shape, boxMin, boxMax);
  const GeoSpecNativeVec3 boxSize{boxMax.x - boxMin.x, boxMax.y - boxMin.y, boxMax.z - boxMin.z};
  const GeoSpecNativeVec3 boxCenter{(boxMin.x + boxMax.x) / 2.0, (boxMin.y + boxMax.y) / 2.0, (boxMin.z + boxMax.z) / 2.0};
  std::ostringstream json;
  json << std::setprecision(17);
  json << "{\"topologyCounts\":{";
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
  json << "}}";
  geospecForensicLog("native.facet.summary", start);
  return json.str();
}

static std::string geospecFacetMassPropertiesJson(const TopoDS_Shape& shape) {
  const double start = geospecForensicNowMs();
  GProp_GProps surfaceProps;
  BRepGProp::SurfaceProperties(shape, surfaceProps);
  GProp_GProps volumeProps;
  BRepGProp::VolumeProperties(shape, volumeProps);
  const gp_Pnt centerOfMass = volumeProps.CentreOfMass();
  std::ostringstream json;
  json << std::setprecision(17);
  json << "{\"massProperties\":{\"surfaceArea\":" << surfaceProps.Mass()
    << ",\"volume\":" << std::abs(volumeProps.Mass()) << ",\"centerOfMass\":";
  geospecAppendVec3(json, geospecPointToVec3(centerOfMass));
  json << "}}";
  geospecForensicLog("native.facet.massProperties", start);
  return json.str();
}

static std::string geospecFacetValidityJson(const WallSolidValidation& solidValidation) {
  std::ostringstream json;
  json << "{\"validity\":{\"valid\":" << (solidValidation.valid ? "true" : "false")
    << ",\"closedSolids\":" << (solidValidation.closedSolids ? "true" : "false")
    << ",\"solidCount\":" << solidValidation.solidCount
    << ",\"invalidSolidCount\":" << solidValidation.invalidSolidCount
    << ",\"openEdgeCount\":" << solidValidation.openEdgeCount;
  if (!solidValidation.reason.empty()) {
    json << ",\"reason\":\"" << geospecEscapeJson(solidValidation.reason) << "\"";
  }
  json << "}}";
  return json.str();
}

// Tracked accuracy frontier (lazy-evidence blueprint R10, pre-existing and
// unchanged by the R4 rewrite): the pair formulation cannot see a thin wall
// whose two sides lie on the SAME face (a folded single surface), and it is
// equally blind to knife-edge wedges - two flanks meeting at a shared edge
// have exact extrema distance 0 and are discarded as zeroLength (the
// adjacency skip preserves, does not widen, that blindness). If either class
// of casting enters the corpus, this facet needs a self-proximity term
// (BRepExtrema_SelfIntersection as broad-phase flag + exact refinement,
// designed in blueprint round 2 - flag, never verdict).
static std::string geospecFacetWallThicknessJson(
  const WallSolidValidation& solidValidation,
  const std::string& optionsJson
) {
  const double wallThicknessStart = geospecForensicNowMs();
  WallWorkBudget budget;
  const double requestedBudget = geospecParseDoubleOption(optionsJson, "workUnitBudget", 250000.0);
  if (requestedBudget >= 1.0) {
    budget.limit = static_cast<long long>(requestedBudget);
  }
  const double meshLinearDeflection =
    geospecParseDoubleOption(optionsJson, "meshLinearTolerance", 0.01);
  constexpr double pi = 3.141592653589793238462643383279502884;
  const double meshAngularDeflectionRadians =
    geospecParseDoubleOption(optionsJson, "meshAngularToleranceDegrees", 15.0) * pi / 180.0;
  // Native validity gate, unchanged from the eager reader: wall thickness is
  // only meaningful over valid closed solids (the facet's dependency edge).
  const WallThicknessResult wallThickness = solidValidation.valid
    ? geospecAnalyzeMinimumWallThickness(
        solidValidation.solids, budget, meshLinearDeflection, meshAngularDeflectionRadians)
    : WallThicknessResult{};
  geospecForensicLog("native.facet.wallThickness", wallThicknessStart);
  std::ostringstream json;
  json << std::setprecision(17);
  if (budget.exceeded) {
    json << "{\"budgetExceeded\":{\"workUnits\":" << budget.consumed
      << ",\"limit\":" << budget.limit << "}}";
    return json.str();
  }
  if (!wallThickness.supported) {
    return "{}";
  }
  json << "{\"minimumWallThickness\":{\"value\":" << wallThickness.value << ",\"location\":";
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
    << ",\"noMaterialInterval\":" << wallThickness.noMaterialInterval << "}}}";
  return json.str();
}

static std::string geospecFacetFaceFeaturesJson(const TopoDS_Shape& shape) {
  const double faceFeaturesStart = geospecForensicNowMs();
  GeoSpecNativeVec3 boxMin{0.0, 0.0, 0.0};
  GeoSpecNativeVec3 boxMax{0.0, 0.0, 0.0};
  geospecComputeBoundingBox(shape, boxMin, boxMax);
  const GeoSpecNativeVec3 boxSize{boxMax.x - boxMin.x, boxMax.y - boxMin.y, boxMax.z - boxMin.z};

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
  std::ostringstream json;
  json << std::setprecision(17);
  json << "{";
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
  json << "}";
  geospecForensicLog("native.facet.faceFeatures", faceFeaturesStart);
  return json.str();
}

struct GeoSpecXdeOccurrenceRecord {
  std::string path;
  std::string productName;
  std::string instanceName;
  bool hasInstanceName = false;
  gp_Trsf transform;
  int shapeIndex = -1;
  std::string productLabelEntry;
  bool hasBounds = false;
  double minX = 0.0;
  double minY = 0.0;
  double minZ = 0.0;
  double maxX = 0.0;
  double maxY = 0.0;
  double maxZ = 0.0;
};

struct GeoSpecXdeSubshapeRow {
  std::string occurrencePath;
  std::string name;
  std::string shapeType;
  int faceIndex = -1;
};

struct GeoSpecXdeDatumPlacementRow {
  std::string occurrencePath;
  std::string name;
  gp_Pnt origin;
  gp_Dir xAxis;
  gp_Dir zAxis;
};

struct GeoSpecXdeSemanticDatumRow {
  std::string occurrencePath;
  std::string label;
  std::string featureName;
  std::vector<int> faceIndexes;
};

struct GeoSpecXdeDatumSystemRow {
  std::string occurrencePath;
  std::string name;
  std::vector<std::vector<std::string>> references;
};

struct GeoSpecXdeSupplementalPlaneRow {
  std::string occurrencePath;
  std::string name;
  gp_Pnt origin;
  gp_Dir normal;
};

struct GeoSpecXdeConstructiveRows {
  std::vector<GeoSpecXdeDatumPlacementRow> placements;
  std::vector<GeoSpecXdeSupplementalPlaneRow> planes;
};

struct GeoSpecXdeRepresentationProductRow {
  Handle(StepRepr_Representation) representation;
  std::string productName;
};

static std::string geospecXdeEscapeJson(const std::string& value) {
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

static std::string geospecXdeErrorJson(const std::string& message) {
  return "{\"error\":\"" + geospecXdeEscapeJson(message) + "\"}";
}


static void geospecXdeAppendPoint(std::ostringstream& output, const gp_Pnt& point) {
  output << "[" << point.X() << "," << point.Y() << "," << point.Z() << "]";
}

static void geospecXdeAppendDir(std::ostringstream& output, const gp_Dir& direction) {
  output << "[" << direction.X() << "," << direction.Y() << "," << direction.Z() << "]";
}

static gp_Dir geospecXdeDirectionOrDefault(
  const Handle(StepGeom_Direction)& direction,
  const gp_Dir& fallback
) {
  if (direction.IsNull() || direction->NbDirectionRatios() < 3) {
    return fallback;
  }
  const double x = direction->DirectionRatiosValue(1);
  const double y = direction->DirectionRatiosValue(2);
  const double z = direction->DirectionRatiosValue(3);
  const double magnitude = std::sqrt(x * x + y * y + z * z);
  if (magnitude <= 1e-12) {
    return fallback;
  }
  return gp_Dir(x, y, z);
}

static std::string geospecXdeLabelName(const TDF_Label& label) {
  Handle(TDataStd_Name) nameAttribute;
  if (label.IsNull() || !label.FindAttribute(TDataStd_Name::GetID(), nameAttribute)) {
    return "";
  }
  // Second argument 0 requests UTF-8 conversion instead of lossy '?' replacement.
  const TCollection_AsciiString ascii(nameAttribute->Get(), 0);
  return ascii.ToCString();
}

static std::string geospecXdeLabelEntry(const TDF_Label& label) {
  TCollection_AsciiString entry;
  TDF_Tool::Entry(label, entry);
  return entry.ToCString();
}

static std::string geospecXdeHAsciiToString(const Handle(TCollection_HAsciiString)& value) {
  return value.IsNull() ? "" : value->ToCString();
}

static std::string geospecXdeShapeTypeName(TopAbs_ShapeEnum shapeType) {
  switch (shapeType) {
    case TopAbs_FACE: return "face";
    case TopAbs_EDGE: return "edge";
    case TopAbs_VERTEX: return "vertex";
    case TopAbs_SOLID: return "solid";
    default: return "";
  }
}

// Applies the profile's `name[k]` disambiguation to sibling segments in
// stored component order; only repeated names receive an index.
static std::vector<std::string> geospecXdeDisambiguateSegments(const std::vector<std::string>& names) {
  std::map<std::string, int> totals;
  for (const std::string& name : names) {
    totals[name]++;
  }
  std::map<std::string, int> counters;
  std::vector<std::string> segments;
  segments.reserve(names.size());
  for (const std::string& name : names) {
    if (totals[name] > 1) {
      counters[name]++;
      segments.push_back(name + "[" + std::to_string(counters[name]) + "]");
    } else {
      segments.push_back(name);
    }
  }
  return segments;
}

// Canonical product identity: the mandatory PRODUCT `id` field (the part
// number), falling back to the optional human `name`. Several corpus writers
// leave `name` empty while `id` always carries the identity.
static std::string geospecXdeProductNameFromProductDefinition(const Handle(StepBasic_ProductDefinition)& productDefinition) {
  if (productDefinition.IsNull() || productDefinition->Formation().IsNull()) {
    return "";
  }
  const Handle(StepBasic_Product) product = productDefinition->Formation()->OfProduct();
  if (product.IsNull()) {
    return "";
  }
  const std::string id = geospecXdeHAsciiToString(product->Id());
  return id.empty() ? geospecXdeHAsciiToString(product->Name()) : id;
}

static std::string geospecXdeProductNameFromShapeDefinition(const Handle(StepRepr_ProductDefinitionShape)& shapeDefinition) {
  if (shapeDefinition.IsNull()) {
    return "";
  }
  return geospecXdeProductNameFromProductDefinition(shapeDefinition->Definition().ProductDefinition());
}

// Product name for any shape-aspect-family entity (DATUM, DATUM_SYSTEM, …)
// through its owning PRODUCT_DEFINITION_SHAPE.
static std::string geospecXdeProductNameFromShapeAspect(const Handle(StepRepr_ShapeAspect)& shapeAspect) {
  if (shapeAspect.IsNull()) {
    return "";
  }
  return geospecXdeProductNameFromShapeDefinition(
    Handle(StepRepr_ProductDefinitionShape)::DownCast(shapeAspect->OfShape()));
}

// Length factor (file context unit -> session millimetres) for the raw
// coordinates of a representation's items. XCAF normalizes *shape* geometry
// to the session unit, but raw StepGeom entity coordinates stay in the
// owning representation context's unit (F5 of the AP242 interop audit) —
// contexts can differ within one file (e.g. inch shapes + mm supplemental).
static double geospecXdeContextLengthFactor(const Handle(StepRepr_Representation)& representation) {
  if (representation.IsNull()) {
    return 1.0;
  }
  const Handle(StepRepr_RepresentationContext) context = representation->ContextOfItems();
  if (context.IsNull()) {
    return 1.0;
  }

  Handle(StepRepr_GlobalUnitAssignedContext) unitContext;
  {
    const Handle(StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext) complexContext =
      Handle(StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext)::DownCast(context);
    if (!complexContext.IsNull()) {
      unitContext = complexContext->GlobalUnitAssignedContext();
    }
  }
  if (unitContext.IsNull()) {
    const Handle(StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx) complexContext =
      Handle(StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx)::DownCast(context);
    if (!complexContext.IsNull()) {
      unitContext = complexContext->GlobalUnitAssignedContext();
    }
  }
  if (unitContext.IsNull()) {
    return 1.0;
  }

  STEPConstruct_UnitContext unitTool;
  if (unitTool.ComputeFactors(unitContext) != 0) {
    return 1.0;
  }
  const double factor = unitTool.LengthFactor();
  return factor > 0.0 ? factor : 1.0;
}

class GeoSpecXdeReadResult {
public:
  GeoSpecXdeReadResult() : success_(false), resultJson_(geospecXdeErrorJson("GeoSpec XDE reader produced no result.")) {}

  bool isSuccess() const {
    return success_;
  }

  std::string resultJson() const {
    return resultJson_;
  }

  // Exact minimum distance between two placed occurrence shapes (or single
  // located faces when faceIndex >= 0). Results are in the subject frame.
  std::string extrema(int occurrenceA, int faceA, int occurrenceB, int faceB) const {
    try {
      std::string error;
      const TopoDS_Shape shapeA = resolveProofShape(occurrenceA, faceA, error);
      if (!error.empty()) return geospecXdeErrorJson(error);
      const TopoDS_Shape shapeB = resolveProofShape(occurrenceB, faceB, error);
      if (!error.empty()) return geospecXdeErrorJson(error);

      BRepExtrema_DistShapeShape distance(shapeA, shapeB);
      if (!distance.IsDone() || distance.NbSolution() < 1) {
        return geospecXdeErrorJson("GeoSpec XDE extrema computation did not converge.");
      }
      std::ostringstream json;
      json << std::setprecision(17);
      json << "{\"distance\":" << distance.Value() << ",\"pointA\":";
      geospecXdeAppendPoint(json, distance.PointOnShape1(1));
      json << ",\"pointB\":";
      geospecXdeAppendPoint(json, distance.PointOnShape2(1));
      json << "}";
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE extrema failed with an unknown native error.");
    }
  }

  // Classifies points (JSON `[[x,y,z],...]`) against the placed occurrence
  // solid with tolerance 1e-7.
  std::string classifyPoints(int occurrence, const std::string& pointsJson) const {
    try {
      std::string error;
      const TopoDS_Shape shape = resolveProofShape(occurrence, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);

      std::vector<double> values;
      const char* cursor = pointsJson.c_str();
      while (*cursor != '\0') {
        if ((*cursor >= '0' && *cursor <= '9') || *cursor == '-' || *cursor == '+' || *cursor == '.') {
          char* end = nullptr;
          const double value = std::strtod(cursor, &end);
          if (end != cursor) {
            values.push_back(value);
            cursor = end;
            continue;
          }
        }
        cursor++;
      }
      if (values.empty() || values.size() % 3 != 0) {
        return geospecXdeErrorJson("GeoSpec XDE classifyPoints expects JSON [[x,y,z],...] triples.");
      }

      BRepClass3d_SolidClassifier classifier(shape);
      std::ostringstream json;
      json << "{\"states\":[";
      for (std::size_t index = 0; index + 2 < values.size(); index += 3) {
        if (index > 0) json << ",";
        classifier.Perform(gp_Pnt(values[index], values[index + 1], values[index + 2]), 1e-7);
        // ponytail: TopAbs_UNKNOWN maps to "out"; a dedicated state can arrive with a consumer.
        const char* state = classifier.State() == TopAbs_IN ? "in" : classifier.State() == TopAbs_ON ? "on" : "out";
        json << "\"" << state << "\"";
      }
      json << "]}";
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE classifyPoints failed with an unknown native error.");
    }
  }

  // Exact boolean-common volume and centroid of two placed occurrence shapes.
  std::string commonVolume(int occurrenceA, int occurrenceB) const {
    try {
      std::string error;
      const TopoDS_Shape shapeA = resolveProofShape(occurrenceA, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);
      const TopoDS_Shape shapeB = resolveProofShape(occurrenceB, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);

      BRepAlgoAPI_Common common(shapeA, shapeB);
      common.Build();
      if (!common.IsDone()) {
        return geospecXdeErrorJson("GeoSpec XDE boolean common failed.");
      }
      GProp_GProps properties;
      BRepGProp::VolumeProperties(common.Shape(), properties);
      const double volume = std::abs(properties.Mass());
      gp_Pnt centroid(0.0, 0.0, 0.0);
      if (volume > 1e-12) {
        centroid = properties.CentreOfMass();
      }
      std::ostringstream json;
      json << std::setprecision(17);
      json << "{\"volume\":" << volume << ",\"centroid\":";
      geospecXdeAppendPoint(json, centroid);
      json << "}";
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE commonVolume failed with an unknown native error.");
    }
  }

  // Analytic per-face facts for the placed occurrence shape in deterministic
  // face traversal order (see header comment). Subject frame.
  std::string faceFacts(int occurrence) const {
    try {
      std::string error;
      const TopoDS_Shape shape = resolveProofShape(occurrence, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);

      std::ostringstream json;
      json << std::setprecision(17);
      json << "{\"faces\":[";
      int faceIndex = 0;
      for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next(), faceIndex++) {
        const TopoDS_Face& face = TopoDS::Face(explorer.Current());
        if (faceIndex > 0) json << ",";
        json << "{\"faceIndex\":" << faceIndex;

        BRepAdaptor_Surface surface(face, false);
        const GeomAbs_SurfaceType surfaceType = surface.GetType();
        const char* surfaceTypeName =
          surfaceType == GeomAbs_Plane ? "plane"
          : surfaceType == GeomAbs_Cylinder ? "cylinder"
          : surfaceType == GeomAbs_Cone ? "cone"
          : surfaceType == GeomAbs_Sphere ? "sphere"
          : surfaceType == GeomAbs_Torus ? "torus"
          : (surfaceType == GeomAbs_BSplineSurface || surfaceType == GeomAbs_BezierSurface) ? "bspline"
          : "other";
        json << ",\"surfaceType\":\"" << surfaceTypeName << "\"";

        if (surfaceType == GeomAbs_Plane) {
          const gp_Pln plane = surface.Plane();
          gp_Dir normal = plane.Axis().Direction();
          if (face.Orientation() == TopAbs_REVERSED) {
            normal.Reverse();
          }
          const gp_Pnt planePoint = plane.Location();
          const double offset =
            normal.X() * planePoint.X() + normal.Y() * planePoint.Y() + normal.Z() * planePoint.Z();
          json << ",\"normal\":";
          geospecXdeAppendDir(json, normal);
          json << ",\"offset\":" << offset;
        } else if (surfaceType == GeomAbs_Cylinder) {
          const gp_Cylinder cylinder = surface.Cylinder();
          json << ",\"axisOrigin\":";
          geospecXdeAppendPoint(json, cylinder.Axis().Location());
          json << ",\"axisDirection\":";
          geospecXdeAppendDir(json, cylinder.Axis().Direction());
          json << ",\"radius\":" << cylinder.Radius();
        } else if (surfaceType == GeomAbs_Cone) {
          const gp_Cone cone = surface.Cone();
          json << ",\"axisOrigin\":";
          geospecXdeAppendPoint(json, cone.Axis().Location());
          json << ",\"axisDirection\":";
          geospecXdeAppendDir(json, cone.Axis().Direction());
          json << ",\"radius\":" << cone.RefRadius();
        }

        GProp_GProps faceProperties;
        BRepGProp::SurfaceProperties(face, faceProperties);
        json << ",\"area\":" << faceProperties.Mass() << ",\"centroid\":";
        geospecXdeAppendPoint(json, faceProperties.CentreOfMass());

        Bnd_Box box;
        // Triangulation-independent bounds (useTriangulation=false): the
        // eager architecture computed face facts on never-tessellated XDE
        // shapes, so selector/feature evidence saw analytic boxes. The mesh
        // facet now tessellates the shared TShapes, and BRepBndLib prefers
        // triangulation when present - which shifted derived revolved-chamfer
        // spans on 7 parity fixtures. Pinning the analytic path keeps face
        // facts identical regardless of which facets ran first.
        BRepBndLib::Add(face, box, false);
        double xmin = 0.0, ymin = 0.0, zmin = 0.0, xmax = 0.0, ymax = 0.0, zmax = 0.0;
        if (!box.IsVoid()) {
          box.Get(xmin, ymin, zmin, xmax, ymax, zmax);
        }
        json << ",\"bounds\":{\"min\":[" << xmin << "," << ymin << "," << zmin << "],\"max\":[" << xmax << ","
             << ymax << "," << zmax << "]}}";
      }
      json << "]}";
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE faceFacts failed with an unknown native error.");
    }
  }

  // ===== Evidence facets (lazy-evidence blueprint R3) =====
  // One coarse sync native call per facet over the retained root shape (the
  // OneShape-equivalent union of free shapes captured at read time; round-3
  // C1 measured the two readers' roots bit-equal across 29 loads).
  // Memoization lives in the TS evidence ledger; the only native memo is
  // validity, because wall thickness natively gates on it (dependency edge).
  // A facet failure returns {"error": ...}; the ledger memoizes a diagnostic.

  std::string analysisSummaryJson() {
    try {
      return geospecFacetSummaryJson(analysisRootShape());
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec summary facet failed with an unknown native error.");
    }
  }

  std::string analysisMassPropertiesJson() {
    try {
      return geospecFacetMassPropertiesJson(analysisRootShape());
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec mass-properties facet failed with an unknown native error.");
    }
  }

  std::string analysisFaceFeaturesJson() {
    try {
      return geospecFacetFaceFeaturesJson(analysisRootShape());
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec face-features facet failed with an unknown native error.");
    }
  }

  std::string analysisValidityJson(const std::string& optionsJson) {
    try {
      return geospecFacetValidityJson(ensureValidity(optionsJson));
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec validity facet failed with an unknown native error.");
    }
  }

  std::string analysisWallThicknessJson(const std::string& optionsJson) {
    try {
      return geospecFacetWallThicknessJson(ensureValidity(optionsJson), optionsJson);
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec wall-thickness facet failed with an unknown native error.");
    }
  }

  // Tessellates the root shape and retains the triangle soup for HEAPF64
  // copy-out via meshTrianglePointer/meshTriangleCount (the same transfer
  // contract the deleted step reader used). BRepMesh mutates shared TShape
  // triangulation state, so every consumer that needs a specific deflection
  // re-meshes for itself; facet order cannot change results.
  std::string meshTriangles(const std::string& optionsJson) {
    try {
      const double start = geospecForensicNowMs();
      const GeoSpecStepOptions options = geospecParseOptions(optionsJson);
      double* triangleSoup = nullptr;
      int triangleCount = 0;
      geospecExtractTriangleSoup(analysisRootShape(), options, triangleSoup, triangleCount);
      if (triangleSoup != nullptr && triangleCount > 0) {
        meshTriangles_.assign(triangleSoup, triangleSoup + static_cast<std::size_t>(triangleCount) * 9);
      } else {
        meshTriangles_.clear();
      }
      std::free(triangleSoup);
      meshTriangleCount_ = static_cast<int>(meshTriangles_.size() / 9);
      geospecForensicLog("native.facet.meshTriangles", start);
      return "{\"triangleCount\":" + std::to_string(meshTriangleCount_) + "}";
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec mesh facet failed with an unknown native error.");
    }
  }

  uintptr_t meshTrianglePointer() const {
    return reinterpret_cast<uintptr_t>(meshTriangles_.data());
  }

  int meshTriangleCount() const {
    return meshTriangleCount_;
  }

  // Tessellates ONE placed occurrence shape (subject frame, same winding and
  // location handling as the root facet) into the retained triangle buffer,
  // for the canonical topological void proof. Reports the achieved deflection floored at the requested
  // linear tolerance so the caller can size a sound exactness band. Clobbers
  // the root meshTriangles buffer by design: consumers copy out immediately
  // (the same transfer contract as meshTriangles).
  std::string occurrenceMeshTriangles(int occurrence, const std::string& optionsJson) {
    try {
      const double start = geospecForensicNowMs();
      std::string error;
      const TopoDS_Shape shape = resolveProofShape(occurrence, -1, error);
      if (!error.empty()) return geospecXdeErrorJson(error);
      const GeoSpecStepOptions options = geospecParseOptions(optionsJson);
      double* triangleSoup = nullptr;
      int triangleCount = 0;
      double achievedDeflection = options.meshLinearTolerance;
      geospecExtractTriangleSoup(shape, options, triangleSoup, triangleCount, &achievedDeflection);
      if (triangleSoup != nullptr && triangleCount > 0) {
        meshTriangles_.assign(triangleSoup, triangleSoup + static_cast<std::size_t>(triangleCount) * 9);
      } else {
        meshTriangles_.clear();
      }
      std::free(triangleSoup);
      meshTriangleCount_ = static_cast<int>(meshTriangles_.size() / 9);
      std::ostringstream json;
      json << std::setprecision(17);
      json << "{\"triangleCount\":" << meshTriangleCount_ << ",\"deflection\":" << achievedDeflection << "}";
      geospecForensicLog("native.facet.occurrenceMeshTriangles", start);
      return json.str();
    } catch (const std::exception& error) {
      return geospecXdeErrorJson(error.what());
    } catch (...) {
      return geospecXdeErrorJson("GeoSpec XDE occurrenceMeshTriangles failed with an unknown native error.");
    }
  }

private:
  friend class GeoSpecXdeReader;

  const TopoDS_Shape& analysisRootShape() const {
    if (rootShape_.IsNull()) {
      throw std::runtime_error("GeoSpec XDE read retained no analyzable root shape.");
    }
    return rootShape_;
  }

  const WallSolidValidation& ensureValidity(const std::string& optionsJson) {
    const bool geomControls = optionsJson.find("\"geomControls\":false") == std::string::npos;
    if (!validityComputed_ || validityGeomControls_ != geomControls) {
      const double validityStart = geospecForensicNowMs();
      validity_ = geospecValidateClosedSolids(analysisRootShape(), geomControls);
      geospecForensicLog("native.facet.validity", validityStart);
      validityComputed_ = true;
      validityGeomControls_ = geomControls;
    }
    return validity_;
  }

  TopoDS_Shape resolveProofShape(int occurrence, int faceIndex, std::string& error) const {
    error.clear();
    if (occurrence < 0 || static_cast<std::size_t>(occurrence) >= placedShapes_.size()) {
      error = "GeoSpec XDE occurrence index " + std::to_string(occurrence) + " is out of range.";
      return TopoDS_Shape();
    }
    const TopoDS_Shape& placed = placedShapes_[static_cast<std::size_t>(occurrence)];
    if (faceIndex < 0) {
      return placed;
    }
    int index = 0;
    for (TopExp_Explorer explorer(placed, TopAbs_FACE); explorer.More(); explorer.Next(), index++) {
      if (index == faceIndex) {
        return explorer.Current();
      }
    }
    error = "GeoSpec XDE face index " + std::to_string(faceIndex) + " is out of range for occurrence " +
      std::to_string(occurrence) + ".";
    return TopoDS_Shape();
  }

  bool success_;
  std::string resultJson_;
  std::vector<TopoDS_Shape> placedShapes_;
  TopoDS_Shape rootShape_;
  bool validityComputed_ = false;
  bool validityGeomControls_ = true;
  WallSolidValidation validity_;
  std::vector<double> meshTriangles_;
  int meshTriangleCount_ = 0;
};

class GeoSpecXdeReader {
public:
  static GeoSpecXdeReadResult readText(const std::string& data, const std::string& optionsJson) {
    try {
      std::istringstream stream(data);
      // The reader constructor runs STEPCAFControl_Controller::Init(), which
      // registers (and zeroes) this static — setting it earlier is a silent
      // no-op on the first read in a fresh module.
      STEPCAFControl_Reader reader;
      Interface_Static::SetIVal("read.stepcaf.subshapes.name", 1);
      reader.SetNameMode(true);
      // GDT mode transfers the semantic DATUM family alongside shapes for
      // AP242 e1-e3; evidence is collected from the raw model graph.
      reader.SetGDTMode(true);
      const IFSelect_ReturnStatus status = reader.ReadStream("memory.step", stream);
      return finishRead(reader, status);
    } catch (const std::exception& error) {
      return failure(error.what());
    } catch (...) {
      return failure("GeoSpec XDE reader failed with an unknown native error.");
    }
  }

  static GeoSpecXdeReadResult readFile(const std::string& path, const std::string& optionsJson) {
    try {
      // Reader construction first — see readText for the registration order.
      STEPCAFControl_Reader reader;
      Interface_Static::SetIVal("read.stepcaf.subshapes.name", 1);
      reader.SetNameMode(true);
      // See readText — semantic GD&T datums require GDT mode.
      reader.SetGDTMode(true);
      const IFSelect_ReturnStatus status = reader.ReadFile(path.c_str());
      return finishRead(reader, status);
    } catch (const std::exception& error) {
      return failure(error.what());
    } catch (...) {
      return failure("GeoSpec XDE reader failed with an unknown native error.");
    }
  }

private:
  static GeoSpecXdeReadResult failure(const std::string& message) {
    GeoSpecXdeReadResult result;
    result.success_ = false;
    result.resultJson_ = geospecXdeErrorJson(message);
    return result;
  }

  // Maps transferred shapes (by TShape identity, location-independent) back
  // to STEP PRODUCT names via SHAPE_DEFINITION_REPRESENTATION transfer
  // results. This is the label<->product association: occurrence identity
  // comes from the STEP product graph, never from XCAF label-name equality
  // (F3/F4 of the AP242 interop audit).
  struct ProductIdentityIndex {
    std::map<const void*, std::string> namesByShape;
    // Set when the model declares exactly one PRODUCT — the standard
    // single-part profile identity, used when XCAF rebuilt the root compound
    // so its TShape no longer matches any transfer result.
    std::string soleProductName;
  };

  static ProductIdentityIndex buildProductIdentityIndex(STEPCAFControl_Reader& reader) {
    ProductIdentityIndex index;
    const Handle(XSControl_WorkSession) session = reader.Reader().WS();
    if (session.IsNull()) {
      return index;
    }
    const Handle(Interface_InterfaceModel) model = session->Model();
    const Handle(XSControl_TransferReader) transferReader = session->TransferReader();
    if (model.IsNull() || transferReader.IsNull()) {
      return index;
    }
    const Handle(Transfer_TransientProcess) process = transferReader->TransientProcess();
    if (process.IsNull()) {
      return index;
    }

    int productCount = 0;
    for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
      const Handle(StepBasic_Product) product = Handle(StepBasic_Product)::DownCast(model->Value(entityIndex));
      if (!product.IsNull()) {
        productCount++;
        const std::string id = geospecXdeHAsciiToString(product->Id());
        index.soleProductName = id.empty() ? geospecXdeHAsciiToString(product->Name()) : id;
      }

      const Handle(StepShape_ShapeDefinitionRepresentation) shapeDefinition =
        Handle(StepShape_ShapeDefinitionRepresentation)::DownCast(model->Value(entityIndex));
      if (shapeDefinition.IsNull()) {
        continue;
      }
      const std::string productName = geospecXdeProductNameFromShapeDefinition(
        Handle(StepRepr_ProductDefinitionShape)::DownCast(shapeDefinition->Definition().PropertyDefinition()));
      if (productName.empty()) {
        continue;
      }
      TopoDS_Shape shape = TransferBRep::ShapeResult(process, shapeDefinition);
      if (shape.IsNull() && !shapeDefinition->UsedRepresentation().IsNull()) {
        shape = TransferBRep::ShapeResult(process, shapeDefinition->UsedRepresentation());
      }
      if (!shape.IsNull() && !shape.TShape().IsNull()) {
        index.namesByShape.emplace(shape.TShape().get(), productName);
      }
    }
    if (productCount != 1) {
      index.soleProductName.clear();
    }
    return index;
  }

  static std::string resolveProductName(
    const TDF_Label& productLabel,
    const ProductIdentityIndex& productIdentity
  ) {
    const TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(productLabel);
    if (!shape.IsNull() && !shape.TShape().IsNull()) {
      const auto found = productIdentity.namesByShape.find(shape.TShape().get());
      if (found != productIdentity.namesByShape.end() && !found->second.empty()) {
        return found->second;
      }
    }
    if (!productIdentity.soleProductName.empty()) {
      return productIdentity.soleProductName;
    }
    return geospecXdeLabelName(productLabel);
  }

  static bool shapeHasFaces(const TopoDS_Shape& shape) {
    return !shape.IsNull() && TopExp_Explorer(shape, TopAbs_FACE).More();
  }

  // Whether any component of an assembly label refers to a real STEP product.
  // XCAF also presents a single product whose shape is a mixed compound
  // (solid + annotation curve sets) as an "assembly" of geometry splits; those
  // splits are not products, and the root itself is the part occurrence.
  static bool componentsAreProducts(
    const TDF_Label& assemblyLabel,
    const ProductIdentityIndex& productIdentity
  ) {
    NCollection_Sequence<TDF_Label> components;
    if (!XCAFDoc_ShapeTool::GetComponents(assemblyLabel, components)) {
      return false;
    }
    for (int index = 1; index <= components.Length(); index++) {
      TDF_Label productLabel;
      if (!XCAFDoc_ShapeTool::GetReferredShape(components.Value(index), productLabel)) {
        continue;
      }
      const TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(productLabel);
      if (shape.IsNull() || shape.TShape().IsNull()) {
        continue;
      }
      if (productIdentity.namesByShape.find(shape.TShape().get()) != productIdentity.namesByShape.end()) {
        return true;
      }
    }
    return false;
  }

  static GeoSpecXdeReadResult finishRead(STEPCAFControl_Reader& reader, IFSelect_ReturnStatus status) {
    if (status != IFSelect_RetDone) {
      return failure("GeoSpec XDE reader could not parse the STEP source.");
    }

    // Deliberately no XCAFApp_Application: its constructor registers the
    // XCAFPrs presentation driver (TPrsStd_DriverTable + XCAFPrs_Driver),
    // which this visualization-stripped verification-kernel build links as
    // dormant abort stubs. Creating the document directly keeps the whole
    // presentation stack out of the wasm and out of the runtime path.
    Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
    XCAFDoc_DocumentTool::Set(document->Main());
    if (!reader.Transfer(document)) {
      return failure("GeoSpec XDE reader did not transfer any STEP roots.");
    }

    const Handle(XCAFDoc_ShapeTool) shapeTool = XCAFDoc_DocumentTool::ShapeTool(document->Main());
    if (shapeTool.IsNull()) {
      return failure("GeoSpec XDE reader could not access the XCAF shape tool.");
    }

    GeoSpecXdeReadResult result;
    std::vector<GeoSpecXdeOccurrenceRecord> occurrences;
    std::vector<TopoDS_Shape> productShapes;
    std::vector<TDF_Label> productLabels;
    std::map<std::string, int> productShapeIndexByEntry;
    int freeShapeCount = 0;

    const ProductIdentityIndex productIdentity = buildProductIdentityIndex(reader);

    NCollection_Sequence<TDF_Label> freeLabels;
    shapeTool->GetFreeShapes(freeLabels);
    // Root shape for the whole-subject analysis facets, mirroring the deleted
    // step reader's STEPControl_Reader::OneShape wrapping rule: one free
    // shape is the root itself; several unite under one compound (round-3
    // C1: 29/29 loads bit-equal between the two readers' roots).
    if (freeLabels.Length() == 1) {
      result.rootShape_ = XCAFDoc_ShapeTool::GetShape(freeLabels.Value(1));
    } else if (freeLabels.Length() > 1) {
      TopoDS_Compound analysisRoot;
      BRep_Builder compoundBuilder;
      compoundBuilder.MakeCompound(analysisRoot);
      for (int index = 1; index <= freeLabels.Length(); index++) {
        const TopoDS_Shape freeShape = XCAFDoc_ShapeTool::GetShape(freeLabels.Value(index));
        if (!freeShape.IsNull()) {
          compoundBuilder.Add(analysisRoot, freeShape);
        }
      }
      result.rootShape_ = analysisRoot;
    }

    // Free non-assembly shapes: the flat-export degenerate case. Real
    // assemblies recurse into components (the assembly root itself is
    // path-omitted); single products presented as geometry-split "assemblies"
    // become one root part occurrence (the standard single-part profile).
    // ponytail: multiple root assemblies would share the path namespace; the
    // profile mandates one root product, so no cross-root disambiguation here.
    std::vector<std::string> freeNames;
    std::vector<TDF_Label> flatLabels;
    for (int index = 1; index <= freeLabels.Length(); index++) {
      const TDF_Label& label = freeLabels.Value(index);
      const bool isAssembly = XCAFDoc_ShapeTool::IsAssembly(label);
      if (!isAssembly || !componentsAreProducts(label, productIdentity)) {
        flatLabels.push_back(label);
        std::string name = resolveProductName(label, productIdentity);
        if (name.empty()) {
          name = "shape-" + std::to_string(flatLabels.size());
        }
        freeNames.push_back(name);
      }
    }
    const std::vector<std::string> flatSegments = geospecXdeDisambiguateSegments(freeNames);
    for (std::size_t index = 0; index < flatLabels.size(); index++) {
      const TDF_Label& label = flatLabels[index];
      // Annotation-only roots (graphical PMI curve sets, supplemental
      // shells without faces) are not parts; they carry no matchable BRep
      // evidence and are excluded from the occurrence table.
      if (!shapeHasFaces(XCAFDoc_ShapeTool::GetShape(label))) {
        continue;
      }
      if (!XCAFDoc_ShapeTool::IsAssembly(label)) {
        freeShapeCount++;
      }
      GeoSpecXdeOccurrenceRecord record;
      record.path = flatSegments[index];
      record.productName = freeNames[index];
      record.hasInstanceName = false;
      record.transform = XCAFDoc_ShapeTool::GetLocation(label).Transformation();
      record.shapeIndex = internProductShape(label, productShapes, productLabels, productShapeIndexByEntry);
      record.productLabelEntry = geospecXdeLabelEntry(label);
      occurrences.push_back(record);
    }
    for (int index = 1; index <= freeLabels.Length(); index++) {
      const TDF_Label& label = freeLabels.Value(index);
      if (XCAFDoc_ShapeTool::IsAssembly(label) && componentsAreProducts(label, productIdentity)) {
        walkComponents(
          label, "", gp_Trsf(), productIdentity, occurrences, productShapes, productLabels,
          productShapeIndexByEntry);
      }
    }

    result.placedShapes_.reserve(occurrences.size());
    for (GeoSpecXdeOccurrenceRecord& record : occurrences) {
      const TopoDS_Shape& productShape = productShapes[static_cast<std::size_t>(record.shapeIndex)];
      const TopoDS_Shape placedShape = productShape.Moved(TopLoc_Location(record.transform));
      result.placedShapes_.push_back(placedShape);
      Bnd_Box bounds;
      BRepBndLib::AddOptimal(placedShape, bounds, false, false);
      if (!bounds.IsVoid()) {
        bounds.Get(record.minX, record.minY, record.minZ, record.maxX, record.maxY, record.maxZ);
        record.hasBounds = true;
      }
    }

    const std::vector<GeoSpecXdeSubshapeRow> subshapeRows =
      collectSubshapeRows(occurrences, productShapes, productLabels);
    const GeoSpecXdeConstructiveRows constructiveRows = collectConstructiveRows(reader, occurrences);
    const std::vector<GeoSpecXdeSemanticDatumRow> semanticDatumRows =
      collectSemanticDatumRows(reader, occurrences, productShapes);
    const std::vector<GeoSpecXdeDatumSystemRow> datumSystemRows = collectDatumSystemRows(reader, occurrences);

    result.success_ = true;
    result.resultJson_ = emitResultJson(
      occurrences, subshapeRows, constructiveRows, semanticDatumRows, datumSystemRows, freeShapeCount);
    return result;
  }

  static int internProductShape(
    const TDF_Label& productLabel,
    std::vector<TopoDS_Shape>& productShapes,
    std::vector<TDF_Label>& productLabels,
    std::map<std::string, int>& productShapeIndexByEntry
  ) {
    const std::string entry = geospecXdeLabelEntry(productLabel);
    const auto existing = productShapeIndexByEntry.find(entry);
    if (existing != productShapeIndexByEntry.end()) {
      return existing->second;
    }
    const int index = static_cast<int>(productShapes.size());
    productShapes.push_back(XCAFDoc_ShapeTool::GetShape(productLabel));
    productLabels.push_back(productLabel);
    productShapeIndexByEntry[entry] = index;
    return index;
  }

  // XCAF names unnamed reference labels '=>[entry]'; those are auto-names,
  // not addressable identities.
  static bool isXcafAutoName(const std::string& name) {
    return name.size() >= 2 && name[0] == '=' && name[1] == '>';
  }

  static void walkComponents(
    const TDF_Label& assemblyLabel,
    const std::string& pathPrefix,
    const gp_Trsf& parentTransform,
    const ProductIdentityIndex& productIdentity,
    std::vector<GeoSpecXdeOccurrenceRecord>& occurrences,
    std::vector<TopoDS_Shape>& productShapes,
    std::vector<TDF_Label>& productLabels,
    std::map<std::string, int>& productShapeIndexByEntry
  ) {
    NCollection_Sequence<TDF_Label> components;
    if (!XCAFDoc_ShapeTool::GetComponents(assemblyLabel, components)) {
      return;
    }

    std::vector<std::string> segmentNames;
    for (int index = 1; index <= components.Length(); index++) {
      const TDF_Label& instanceLabel = components.Value(index);
      std::string instanceName = geospecXdeLabelName(instanceLabel);
      if (instanceName.empty() || isXcafAutoName(instanceName)) {
        TDF_Label productLabel;
        instanceName = XCAFDoc_ShapeTool::GetReferredShape(instanceLabel, productLabel)
          ? resolveProductName(productLabel, productIdentity)
          : "";
      }
      segmentNames.push_back(instanceName);
    }
    const std::vector<std::string> segments = geospecXdeDisambiguateSegments(segmentNames);

    for (int index = 1; index <= components.Length(); index++) {
      const TDF_Label& instanceLabel = components.Value(index);
      TDF_Label productLabel;
      if (!XCAFDoc_ShapeTool::GetReferredShape(instanceLabel, productLabel)) {
        continue;
      }
      if (!shapeHasFaces(XCAFDoc_ShapeTool::GetShape(productLabel)) && !XCAFDoc_ShapeTool::IsAssembly(productLabel)) {
        continue;
      }
      const std::string rawInstanceName = geospecXdeLabelName(instanceLabel);
      const std::string instanceName = isXcafAutoName(rawInstanceName) ? "" : rawInstanceName;
      const std::string& segment = segments[static_cast<std::size_t>(index - 1)];
      const std::string path = pathPrefix.empty() ? segment : pathPrefix + "." + segment;
      const gp_Trsf transform =
        parentTransform.Multiplied(XCAFDoc_ShapeTool::GetLocation(instanceLabel).Transformation());

      GeoSpecXdeOccurrenceRecord record;
      record.path = path;
      record.productName = resolveProductName(productLabel, productIdentity);
      record.instanceName = instanceName;
      record.hasInstanceName = !instanceName.empty();
      record.transform = transform;
      record.shapeIndex = internProductShape(productLabel, productShapes, productLabels, productShapeIndexByEntry);
      record.productLabelEntry = geospecXdeLabelEntry(productLabel);
      occurrences.push_back(record);

      if (XCAFDoc_ShapeTool::IsAssembly(productLabel)) {
        walkComponents(
          productLabel, path, transform, productIdentity, occurrences, productShapes, productLabels,
          productShapeIndexByEntry);
      }
    }
  }

  // Product-level subshape names expanded to one row per occurrence of the
  // owning product, so consumers compose `<occurrencePath>.<name>` directly.
  static std::vector<GeoSpecXdeSubshapeRow> collectSubshapeRows(
    const std::vector<GeoSpecXdeOccurrenceRecord>& occurrences,
    const std::vector<TopoDS_Shape>& productShapes,
    const std::vector<TDF_Label>& productLabels
  ) {
    std::vector<GeoSpecXdeSubshapeRow> rows;
    for (std::size_t productIndex = 0; productIndex < productLabels.size(); productIndex++) {
      NCollection_Sequence<TDF_Label> subshapeLabels;
      if (!XCAFDoc_ShapeTool::GetSubShapes(productLabels[productIndex], subshapeLabels)) {
        continue;
      }
      const TopoDS_Shape& productShape = productShapes[productIndex];
      for (int index = 1; index <= subshapeLabels.Length(); index++) {
        const TDF_Label& subshapeLabel = subshapeLabels.Value(index);
        const std::string name = geospecXdeLabelName(subshapeLabel);
        if (name.empty()) {
          continue;
        }
        const TopoDS_Shape subshape = XCAFDoc_ShapeTool::GetShape(subshapeLabel);
        if (subshape.IsNull()) {
          continue;
        }
        const std::string shapeType = geospecXdeShapeTypeName(subshape.ShapeType());
        if (shapeType.empty()) {
          continue;
        }
        int faceIndex = -1;
        if (subshape.ShapeType() == TopAbs_FACE) {
          int candidate = 0;
          for (TopExp_Explorer explorer(productShape, TopAbs_FACE); explorer.More(); explorer.Next(), candidate++) {
            if (explorer.Current().IsSame(subshape)) {
              faceIndex = candidate;
              break;
            }
          }
        }
        for (const GeoSpecXdeOccurrenceRecord& occurrence : occurrences) {
          if (occurrence.shapeIndex == static_cast<int>(productIndex)) {
            rows.push_back({occurrence.path, name, shapeType, faceIndex});
          }
        }
      }
    }
    return rows;
  }

  static std::vector<GeoSpecXdeRepresentationProductRow> collectRepresentationProducts(
    const Handle(Interface_InterfaceModel)& model
  ) {
    std::vector<GeoSpecXdeRepresentationProductRow> rows;
    if (model.IsNull()) {
      return rows;
    }
    for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
      const Handle(StepShape_ShapeDefinitionRepresentation) shapeDefinition =
        Handle(StepShape_ShapeDefinitionRepresentation)::DownCast(model->Value(entityIndex));
      if (shapeDefinition.IsNull() || shapeDefinition->UsedRepresentation().IsNull()) {
        continue;
      }
      const Handle(StepRepr_PropertyDefinition) propertyDefinition =
        shapeDefinition->Definition().PropertyDefinition();
      const Handle(StepRepr_ProductDefinitionShape) productShape =
        Handle(StepRepr_ProductDefinitionShape)::DownCast(propertyDefinition);
      const std::string productName = geospecXdeProductNameFromShapeDefinition(productShape);
      if (!productName.empty()) {
        rows.push_back({shapeDefinition->UsedRepresentation(), productName});
      }
    }
    return rows;
  }

  static std::string productNameForRepresentation(
    const Handle(StepRepr_Representation)& representation,
    const std::vector<GeoSpecXdeRepresentationProductRow>& products
  ) {
    if (representation.IsNull()) {
      return "";
    }
    for (const GeoSpecXdeRepresentationProductRow& product : products) {
      if (!product.representation.IsNull() && product.representation == representation) {
        return product.productName;
      }
    }
    return "";
  }

  // Decompose an AXIS2_PLACEMENT_3D entity into unit-resolved local frame
  // vectors. Returns false when the placement carries no usable location.
  static bool readPlacementFrame(
    const Handle(StepGeom_Axis2Placement3d)& placement,
    double unitFactor,
    gp_Pnt& origin,
    gp_Dir& zAxis,
    gp_Dir& xAxis
  ) {
    if (placement.IsNull() || placement->Location().IsNull() || placement->Location()->NbCoordinates() < 3) {
      return false;
    }
    const Handle(StepGeom_CartesianPoint) location = placement->Location();
    origin = gp_Pnt(
      location->CoordinatesValue(1) * unitFactor,
      location->CoordinatesValue(2) * unitFactor,
      location->CoordinatesValue(3) * unitFactor
    );
    Handle(StepGeom_Direction) axis;
    if (placement->HasAxis()) {
      axis = placement->Axis();
    }
    Handle(StepGeom_Direction) refDirection;
    if (placement->HasRefDirection()) {
      refDirection = placement->RefDirection();
    }
    zAxis = geospecXdeDirectionOrDefault(axis, gp_Dir(0, 0, 1));
    xAxis = geospecXdeDirectionOrDefault(refDirection, gp_Dir(1, 0, 0));
    return true;
  }

  // Reads supplemental geometry (CONSTRUCTIVE_GEOMETRY_REPRESENTATION items)
  // and relates it to product shape representations through constructive
  // representation relationships. Identity lives on the items per the CAx-IF
  // rec practice: named AXIS2_PLACEMENT_3D items become datum-frame placements,
  // named PLANE items become supplemental planes, and unnamed items under the
  // literal 'supplemental geometry' channel name are plumbing, not evidence.
  // Raw entity coordinates are resolved through the owning representation
  // context's unit before the occurrence transform is applied (F5).
  static GeoSpecXdeConstructiveRows collectConstructiveRows(
    STEPCAFControl_Reader& reader,
    const std::vector<GeoSpecXdeOccurrenceRecord>& occurrences
  ) {
    GeoSpecXdeConstructiveRows rows;
    const Handle(XSControl_WorkSession) session = reader.Reader().WS();
    if (session.IsNull()) {
      return rows;
    }
    const Handle(Interface_InterfaceModel) model = session->Model();
    if (model.IsNull()) {
      return rows;
    }
    const Interface_Graph& graph = session->Graph();
    const std::vector<GeoSpecXdeRepresentationProductRow> representationProducts =
      collectRepresentationProducts(model);

    for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
      const Handle(StepRepr_ConstructiveGeometryRepresentation) representation =
        Handle(StepRepr_ConstructiveGeometryRepresentation)::DownCast(model->Value(entityIndex));
      if (representation.IsNull() || representation->Items().IsNull()) {
        continue;
      }

      std::vector<std::string> productNames;
      Interface_EntityIterator sharings = graph.Sharings(representation);
      const Handle(StepRepr_Representation) constructiveRepresentation = representation;
      for (sharings.Start(); sharings.More(); sharings.Next()) {
        const Handle(StepRepr_RepresentationRelationship) relationship =
          Handle(StepRepr_RepresentationRelationship)::DownCast(sharings.Value());
        if (relationship.IsNull()) {
          continue;
        }
        Handle(StepRepr_Representation) productRepresentation;
        if (relationship->Rep1() == constructiveRepresentation) {
          productRepresentation = relationship->Rep2();
        } else if (relationship->Rep2() == constructiveRepresentation) {
          productRepresentation = relationship->Rep1();
        }
        const std::string productName = productNameForRepresentation(productRepresentation, representationProducts);
        if (!productName.empty() && std::find(productNames.begin(), productNames.end(), productName) == productNames.end()) {
          productNames.push_back(productName);
        }
      }
      if (productNames.empty()) {
        continue;
      }

      const std::string representationName = geospecXdeHAsciiToString(representation->Name());
      const bool channelName = representationName == "supplemental geometry";
      const double unitFactor = geospecXdeContextLengthFactor(representation);

      for (int itemIndex = 1; itemIndex <= representation->NbItems(); itemIndex++) {
        const Handle(StepRepr_RepresentationItem) item =
          Handle(StepRepr_RepresentationItem)::DownCast(representation->ItemsValue(itemIndex));
        if (item.IsNull()) {
          continue;
        }
        const std::string itemName = geospecXdeHAsciiToString(item->Name());
        const std::string evidenceName = !itemName.empty() ? itemName : (channelName ? "" : representationName);
        if (evidenceName.empty()) {
          continue;
        }

        const Handle(StepGeom_Axis2Placement3d) placement = Handle(StepGeom_Axis2Placement3d)::DownCast(item);
        const Handle(StepGeom_Plane) plane = Handle(StepGeom_Plane)::DownCast(item);
        gp_Pnt localOrigin;
        gp_Dir localZ;
        gp_Dir localX;
        bool isPlane = false;
        if (!placement.IsNull()) {
          if (!readPlacementFrame(placement, unitFactor, localOrigin, localZ, localX)) {
            continue;
          }
        } else if (!plane.IsNull()) {
          if (!readPlacementFrame(plane->Position(), unitFactor, localOrigin, localZ, localX)) {
            continue;
          }
          isPlane = true;
        } else {
          // Curve sets and other supplemental content carry no frame evidence.
          continue;
        }

        for (const std::string& productName : productNames) {
          for (const GeoSpecXdeOccurrenceRecord& occurrence : occurrences) {
            if (occurrence.productName != productName) {
              continue;
            }
            gp_Pnt origin = localOrigin;
            gp_Dir zAxis = localZ;
            gp_Dir xAxis = localX;
            origin.Transform(occurrence.transform);
            zAxis.Transform(occurrence.transform);
            xAxis.Transform(occurrence.transform);
            if (isPlane) {
              rows.planes.push_back({occurrence.path, evidenceName, origin, zAxis});
            } else {
              rows.placements.push_back({occurrence.path, evidenceName, origin, xAxis, zAxis});
            }
          }
        }
      }
    }
    return rows;
  }

  // Semantic GD&T datums (the DATUM family). Letters and product ownership
  // come from a raw model scan (exact, per entity); face attachment follows
  // the raw AP242 graph: DATUM <- SHAPE_ASPECT_RELATIONSHIP <- DATUM_FEATURE
  // <- ITEM_IDENTIFIED_REPRESENTATION_USAGE (or its GEOMETRIC_ITEM_SPECIFIC_
  // USAGE subtype) -> ADVANCED_FACE items, resolved to transferred faces.
  static std::vector<GeoSpecXdeSemanticDatumRow> collectSemanticDatumRows(
    STEPCAFControl_Reader& reader,
    const std::vector<GeoSpecXdeOccurrenceRecord>& occurrences,
    const std::vector<TopoDS_Shape>& productShapes
  ) {
    std::vector<GeoSpecXdeSemanticDatumRow> rows;
    const Handle(XSControl_WorkSession) session = reader.Reader().WS();
    if (session.IsNull()) {
      return rows;
    }
    const Handle(Interface_InterfaceModel) model = session->Model();
    if (model.IsNull()) {
      return rows;
    }

    // Aspect entity -> datum letters. A datum aspect names itself; letters
    // then flow transitively from the `related` side to the `relating` side
    // of shape-aspect relationships (feature -> datum, placed-datum-target
    // aspect -> datum, FEATURE_FOR_DATUM_TARGET geometry -> target aspect),
    // which covers plain features, composites, and placed datum targets.
    std::map<const void*, std::vector<std::string>> lettersByAspect;
    const auto appendLetters = [&lettersByAspect](const void* aspect, const std::vector<std::string>& letters) {
      bool changed = false;
      std::vector<std::string>& existing = lettersByAspect[aspect];
      for (const std::string& letter : letters) {
        if (std::find(existing.begin(), existing.end(), letter) == existing.end()) {
          existing.push_back(letter);
          changed = true;
        }
      }
      return changed;
    };
    for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
      const Handle(StepDimTol_Datum) datum = Handle(StepDimTol_Datum)::DownCast(model->Value(entityIndex));
      if (datum.IsNull()) {
        continue;
      }
      const std::string letter = geospecXdeHAsciiToString(datum->Identification());
      if (!letter.empty()) {
        appendLetters(datum.get(), {letter});
      }
    }
    std::vector<std::pair<const void*, const void*>> aspectEdges;  // receiver <- source
    for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
      const Handle(StepRepr_ShapeAspectRelationship) relationship =
        Handle(StepRepr_ShapeAspectRelationship)::DownCast(model->Value(entityIndex));
      if (relationship.IsNull()) {
        continue;
      }
      const Handle(StepRepr_ShapeAspect) relating = relationship->RelatingShapeAspect();
      const Handle(StepRepr_ShapeAspect) related = relationship->RelatedShapeAspect();
      if (relating.IsNull() || related.IsNull()) {
        continue;
      }
      aspectEdges.emplace_back(relating.get(), related.get());
      // Writers that put the datum on the relating side still propagate one hop.
      if (!Handle(StepDimTol_Datum)::DownCast(relating).IsNull()) {
        aspectEdges.emplace_back(related.get(), relating.get());
      }
    }
    for (int round = 0; round < 8; round++) {
      bool changed = false;
      for (const auto& [receiver, source] : aspectEdges) {
        const auto sourceLetters = lettersByAspect.find(source);
        if (sourceLetters != lettersByAspect.end() && appendLetters(receiver, sourceLetters->second)) {
          changed = true;
        }
      }
      if (!changed) {
        break;
      }
    }

    // Identified items of datum-linked aspects, resolved to transferred faces.
    std::map<std::string, std::vector<TopoDS_Shape>> facesByLetter;
    const Handle(XSControl_TransferReader) transferReader = session->TransferReader();
    const Handle(Transfer_TransientProcess) process =
      transferReader.IsNull() ? Handle(Transfer_TransientProcess)() : transferReader->TransientProcess();
    if (!process.IsNull()) {
      const Interface_Graph& graph = session->Graph();
      const auto collectBoundFaces = [&process](
        const Handle(StepRepr_RepresentationItem)& item,
        std::vector<TopoDS_Shape>& faces
      ) {
        if (item.IsNull()) {
          return;
        }
        const TopoDS_Shape bound = TransferBRep::ShapeResult(process, item);
        if (bound.IsNull()) {
          return;
        }
        if (bound.ShapeType() == TopAbs_FACE) {
          faces.push_back(bound);
        } else {
          for (TopExp_Explorer explorer(bound, TopAbs_FACE); explorer.More(); explorer.Next()) {
            faces.push_back(explorer.Current());
          }
        }
      };

      for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
        const Handle(StepAP242_ItemIdentifiedRepresentationUsage) usage =
          Handle(StepAP242_ItemIdentifiedRepresentationUsage)::DownCast(model->Value(entityIndex));
        if (usage.IsNull()) {
          continue;
        }
        // Draughting associations are presentation links (annotation
        // callouts), never datum face evidence.
        if (!Handle(StepAP242_DraughtingModelItemAssociation)::DownCast(usage).IsNull()) {
          continue;
        }
        const Handle(Standard_Transient) definition = usage->Definition().Value();
        if (definition.IsNull()) {
          continue;
        }
        const auto letters = lettersByAspect.find(definition.get());
        if (letters == lettersByAspect.end()) {
          continue;
        }

        std::vector<TopoDS_Shape> faces;
        for (int itemIndex = 1; itemIndex <= usage->NbIdentifiedItem(); itemIndex++) {
          collectBoundFaces(usage->IdentifiedItemValue(itemIndex), faces);
        }
        if (faces.empty()) {
          // Some writers serialize identified_item as a typed aggregate
          // (SET_REPRESENTATION_ITEM((...))) the field reader cannot bind;
          // the reference graph still records the shared entities.
          Interface_EntityIterator shareds = graph.Shareds(usage);
          for (shareds.Start(); shareds.More(); shareds.Next()) {
            collectBoundFaces(Handle(StepRepr_RepresentationItem)::DownCast(shareds.Value()), faces);
          }
        }
        for (const TopoDS_Shape& face : faces) {
          for (const std::string& letter : letters->second) {
            facesByLetter[letter].push_back(face);
          }
        }
      }
    }

    // Resolve attached faces to per-occurrence face indexes by traversal.
    std::map<std::string, std::map<std::string, std::vector<int>>> faceIndexesByLetterAndPath;
    for (const auto& [letter, faces] : facesByLetter) {
      for (const GeoSpecXdeOccurrenceRecord& occurrence : occurrences) {
        const TopoDS_Shape& productShape = productShapes[static_cast<std::size_t>(occurrence.shapeIndex)];
        std::vector<int> indexes;
        for (const TopoDS_Shape& attached : faces) {
          int candidate = 0;
          for (TopExp_Explorer explorer(productShape, TopAbs_FACE); explorer.More(); explorer.Next(), candidate++) {
            if (explorer.Current().IsSame(attached)) {
              indexes.push_back(candidate);
              break;
            }
          }
        }
        if (!indexes.empty()) {
          faceIndexesByLetterAndPath[letter][occurrence.path] = indexes;
        }
      }
    }

    // Raw DATUM entities: identification letters plus owning product names.
    std::map<std::string, bool> emittedByLetterAndPath;
    for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
      const Handle(StepDimTol_Datum) datum = Handle(StepDimTol_Datum)::DownCast(model->Value(entityIndex));
      if (datum.IsNull()) {
        continue;
      }
      const std::string letter = geospecXdeHAsciiToString(datum->Identification());
      if (letter.empty()) {
        continue;
      }
      const std::string featureName = geospecXdeHAsciiToString(datum->Name());
      const std::string productName = geospecXdeProductNameFromShapeAspect(datum);

      const auto faceIndexesByPath = faceIndexesByLetterAndPath.find(letter);
      std::vector<std::pair<std::string, std::vector<int>>> targets;
      if (faceIndexesByPath != faceIndexesByLetterAndPath.end()) {
        for (const auto& [path, faceIndexes] : faceIndexesByPath->second) {
          targets.emplace_back(path, faceIndexes);
        }
      }
      if (targets.empty()) {
        for (const GeoSpecXdeOccurrenceRecord& occurrence : occurrences) {
          if (!productName.empty() && occurrence.productName == productName) {
            targets.emplace_back(occurrence.path, std::vector<int>{});
          }
        }
      }
      if (targets.empty() && occurrences.size() == 1) {
        // Standard single-part profile: with exactly one part occurrence,
        // GD&T evidence unambiguously belongs to it even when the product
        // join cannot be made (e.g. label naming quirks).
        targets.emplace_back(occurrences.front().path, std::vector<int>{});
      }

      for (const auto& [path, faceIndexes] : targets) {
        const std::string key = letter + "\x1f" + path;
        if (emittedByLetterAndPath.emplace(key, true).second) {
          std::vector<int> sortedFaces = faceIndexes;
          std::sort(sortedFaces.begin(), sortedFaces.end());
          sortedFaces.erase(std::unique(sortedFaces.begin(), sortedFaces.end()), sortedFaces.end());
          rows.push_back({path, letter, featureName, sortedFaces});
        }
      }
    }
    return rows;
  }

  static void appendDatumLettersFromReference(
    const StepDimTol_DatumOrCommonDatum& base,
    std::vector<std::string>& letters
  ) {
    const Handle(StepDimTol_Datum) datum = base.Datum();
    if (!datum.IsNull()) {
      const std::string letter = geospecXdeHAsciiToString(datum->Identification());
      if (!letter.empty()) {
        letters.push_back(letter);
      }
      return;
    }
    const Handle(StepDimTol_HArray1OfDatumReferenceElement) common = base.CommonDatumList();
    if (common.IsNull()) {
      return;
    }
    for (int index = common->Lower(); index <= common->Upper(); index++) {
      const Handle(StepDimTol_DatumReferenceElement) element = common->Value(index);
      if (element.IsNull()) {
        continue;
      }
      appendDatumLettersFromReference(element->Base(), letters);
    }
  }

  // GD&T datum reference frames (DATUM_SYSTEM) with precedence compartments,
  // read from the raw model where the entity graph is exact.
  static std::vector<GeoSpecXdeDatumSystemRow> collectDatumSystemRows(
    STEPCAFControl_Reader& reader,
    const std::vector<GeoSpecXdeOccurrenceRecord>& occurrences
  ) {
    std::vector<GeoSpecXdeDatumSystemRow> rows;
    const Handle(XSControl_WorkSession) session = reader.Reader().WS();
    if (session.IsNull()) {
      return rows;
    }
    const Handle(Interface_InterfaceModel) model = session->Model();
    if (model.IsNull()) {
      return rows;
    }

    for (int entityIndex = 1; entityIndex <= model->NbEntities(); entityIndex++) {
      const Handle(StepDimTol_DatumSystem) system =
        Handle(StepDimTol_DatumSystem)::DownCast(model->Value(entityIndex));
      if (system.IsNull()) {
        continue;
      }

      std::vector<std::vector<std::string>> references;
      const Handle(StepDimTol_HArray1OfDatumReferenceCompartment) constituents = system->Constituents();
      if (!constituents.IsNull()) {
        for (int index = constituents->Lower(); index <= constituents->Upper(); index++) {
          const Handle(StepDimTol_DatumReferenceCompartment) compartment = constituents->Value(index);
          if (compartment.IsNull()) {
            continue;
          }
          std::vector<std::string> letters;
          appendDatumLettersFromReference(compartment->Base(), letters);
          if (!letters.empty()) {
            references.push_back(letters);
          }
        }
      }

      const std::string name = geospecXdeHAsciiToString(system->Name());
      const std::string productName = geospecXdeProductNameFromShapeAspect(system);

      std::vector<std::string> paths;
      for (const GeoSpecXdeOccurrenceRecord& occurrence : occurrences) {
        if (!productName.empty() && occurrence.productName == productName) {
          paths.push_back(occurrence.path);
        }
      }
      if (paths.empty() && occurrences.size() == 1) {
        paths.push_back(occurrences.front().path);
      }
      for (const std::string& path : paths) {
        rows.push_back({path, name, references});
      }
    }
    return rows;
  }

  static std::string emitResultJson(
    const std::vector<GeoSpecXdeOccurrenceRecord>& occurrences,
    const std::vector<GeoSpecXdeSubshapeRow>& subshapeRows,
    const GeoSpecXdeConstructiveRows& constructiveRows,
    const std::vector<GeoSpecXdeSemanticDatumRow>& semanticDatumRows,
    const std::vector<GeoSpecXdeDatumSystemRow>& datumSystemRows,
    int freeShapeCount
  ) {
    std::ostringstream json;
    json << std::setprecision(17);
    json << "{\"occurrences\":[";
    for (std::size_t index = 0; index < occurrences.size(); index++) {
      const GeoSpecXdeOccurrenceRecord& record = occurrences[index];
      if (index > 0) json << ",";
      json << "{\"path\":\"" << geospecXdeEscapeJson(record.path) << "\",\"productName\":\""
           << geospecXdeEscapeJson(record.productName) << "\"";
      if (record.hasInstanceName) {
        json << ",\"instanceName\":\"" << geospecXdeEscapeJson(record.instanceName) << "\"";
      }
      json << ",\"transform\":[";
      for (int row = 1; row <= 3; row++) {
        for (int column = 1; column <= 4; column++) {
          if (row > 1 || column > 1) json << ",";
          json << record.transform.Value(row, column);
        }
      }
      json << ",0,0,0,1],\"shapeIndex\":" << record.shapeIndex;
      if (record.hasBounds) {
        json << ",\"bounds\":{\"min\":[" << record.minX << "," << record.minY << "," << record.minZ
             << "],\"max\":[" << record.maxX << "," << record.maxY << "," << record.maxZ << "]}";
      }
      json << "}";
    }
    json << "],\"subshapeNames\":[";
    for (std::size_t index = 0; index < subshapeRows.size(); index++) {
      const GeoSpecXdeSubshapeRow& row = subshapeRows[index];
      if (index > 0) json << ",";
      json << "{\"occurrencePath\":\"" << geospecXdeEscapeJson(row.occurrencePath) << "\",\"name\":\""
           << geospecXdeEscapeJson(row.name) << "\",\"shapeType\":\"" << row.shapeType
           << "\",\"faceIndex\":" << row.faceIndex << "}";
    }
    json << "],\"datumPlacements\":[";
    for (std::size_t index = 0; index < constructiveRows.placements.size(); index++) {
      const GeoSpecXdeDatumPlacementRow& row = constructiveRows.placements[index];
      if (index > 0) json << ",";
      json << "{\"occurrencePath\":\"" << geospecXdeEscapeJson(row.occurrencePath) << "\",\"name\":\""
           << geospecXdeEscapeJson(row.name) << "\",\"origin\":";
      geospecXdeAppendPoint(json, row.origin);
      json << ",\"xAxis\":";
      geospecXdeAppendDir(json, row.xAxis);
      json << ",\"zAxis\":";
      geospecXdeAppendDir(json, row.zAxis);
      json << "}";
    }
    json << "],\"semanticDatums\":[";
    for (std::size_t index = 0; index < semanticDatumRows.size(); index++) {
      const GeoSpecXdeSemanticDatumRow& row = semanticDatumRows[index];
      if (index > 0) json << ",";
      json << "{\"occurrencePath\":\"" << geospecXdeEscapeJson(row.occurrencePath) << "\",\"label\":\""
           << geospecXdeEscapeJson(row.label) << "\"";
      if (!row.featureName.empty()) {
        json << ",\"featureName\":\"" << geospecXdeEscapeJson(row.featureName) << "\"";
      }
      json << ",\"faceIndexes\":[";
      for (std::size_t faceIndex = 0; faceIndex < row.faceIndexes.size(); faceIndex++) {
        if (faceIndex > 0) json << ",";
        json << row.faceIndexes[faceIndex];
      }
      json << "]}";
    }
    json << "],\"datumSystems\":[";
    for (std::size_t index = 0; index < datumSystemRows.size(); index++) {
      const GeoSpecXdeDatumSystemRow& row = datumSystemRows[index];
      if (index > 0) json << ",";
      json << "{\"occurrencePath\":\"" << geospecXdeEscapeJson(row.occurrencePath) << "\",\"name\":\""
           << geospecXdeEscapeJson(row.name) << "\",\"references\":[";
      for (std::size_t compartmentIndex = 0; compartmentIndex < row.references.size(); compartmentIndex++) {
        if (compartmentIndex > 0) json << ",";
        json << "[";
        const std::vector<std::string>& letters = row.references[compartmentIndex];
        for (std::size_t letterIndex = 0; letterIndex < letters.size(); letterIndex++) {
          if (letterIndex > 0) json << ",";
          json << "\"" << geospecXdeEscapeJson(letters[letterIndex]) << "\"";
        }
        json << "]";
      }
      json << "]}";
    }
    json << "],\"supplementalPlanes\":[";
    for (std::size_t index = 0; index < constructiveRows.planes.size(); index++) {
      const GeoSpecXdeSupplementalPlaneRow& row = constructiveRows.planes[index];
      if (index > 0) json << ",";
      json << "{\"occurrencePath\":\"" << geospecXdeEscapeJson(row.occurrencePath) << "\",\"name\":\""
           << geospecXdeEscapeJson(row.name) << "\",\"origin\":";
      geospecXdeAppendPoint(json, row.origin);
      json << ",\"normal\":";
      geospecXdeAppendDir(json, row.normal);
      json << "}";
    }
    json << "],\"freeShapeCount\":" << freeShapeCount << "}";
    return json.str();
  }
};
