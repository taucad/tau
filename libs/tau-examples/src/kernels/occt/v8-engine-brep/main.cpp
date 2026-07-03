#include <algorithm>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>

#include <BOPAlgo_Options.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <BRepTools.hxx>
#include <BRep_Tool.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Geom_Circle.hxx>
#include <Message_ProgressRange.hxx>
#include <NCollection_Array1.hxx>
#include <OSD_ThreadPool.hxx>
#include <Poly_Triangulation.hxx>
#include <Precision.hxx>
#include <Standard_Failure.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopTools_ListOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Ax1.hxx>
#include <gp_Ax2.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <gp_Trsf.hxx>
#include <gp_Vec.hxx>

namespace {

constexpr double kPi = 3.141592653589793238462643383279502884;

struct Point2 {
  double x;
  double y;
};

struct Point3 {
  double x;
  double y;
  double z;
};

enum class PlaneName { XY, YZ, XZ };
enum class SegmentKind { Line, Arc };

struct CurveSegment {
  SegmentKind kind;
  Point2 to;
  Point2 via;
};

struct Params {
  double bankAngle = 90.0;
  double bore = 94.0;
  double stroke = 90.0;
  double deckHeight = 232.0;

  double mainJournalDia = 60.0;
  double mainJournalLen = 28.0;
  double crankpinDia = 52.0;
  double crankpinLen = 30.0;
  double crankThrow = 45.0;
  double webThickness = 22.0;
  double webHubMainDia = 68.0;
  double webHubPinDia = 60.0;
  double counterweightDia = 150.0;
  double counterweightOffset = 30.0;
  double snoutDia = 38.0;
  double snoutLen = 60.0;
  double flangeDia = 120.0;
  double flangeThk = 16.0;
  int flangeBolts = 8;
  double flangeBoltDia = 11.0;
  double flangeBoltCircle = 90.0;
  double oilGalleryDia = 6.0;
  double endChamfer = 2.0;

  double crownDia = 93.6;
  double domeRise = 3.5;
  double pistonCompHeight = 32.0;
  double pistonSkirtLen = 30.0;
  double ringGrooveDepth = 1.2;
  double ringGrooveWidth = 2.0;
  double pinBoreDia = 22.0;
  double wristPinOuterDia = 22.0;
  double wristPinInnerDia = 12.0;
  double wristPinLen = 64.0;
  double rodBigEndDia = 56.0;
  double rodBigEndBoreDia = 52.0;
  double rodSmallEndDia = 30.0;
  double rodSmallEndBoreDia = 22.0;
  double rodLength = 155.0;
  double rodBeamWidth = 18.0;
  double rodBeamThk = 10.0;

  int bores = 4;
  double borePitch = 102.0;
  double blockDeckThk = 12.0;
  double blockWallThk = 7.0;
  double mainWebThk = 18.0;

  double headThk = 110.0;
  double valveCoverHeight = 55.0;
  double plenumDia = 90.0;
  double runnerDia = 34.0;
  double throttleDia = 70.0;

  double damperOuterDia = 170.0;
  double damperThk = 34.0;
  int damperGrooves = 6;
  double flywheelOuterDia = 320.0;
  double flywheelThk = 28.0;
  double flywheelClutchDia = 240.0;
  int ringGearTeeth = 120;
  bool flywheelExactTeeth = false;

  double plugThreadDia = 14.0;
  double plugReach = 19.0;
  double plugHexAcross = 16.0;
};

struct CrankStations {
  double snoutStart = 0.0;
  std::vector<double> mainStart;
  std::vector<double> pinStart;
  std::vector<double> pinCenter;
  std::vector<double> webStart;
  double flangeStart = 0.0;
  double totalLen = 0.0;
  std::vector<double> mainCenter;
};

struct BankLayout {
  std::string side;
  double deckAngle;
  double xShift;
};

struct Part {
  std::string name;
  TopoDS_Shape shape;
};

struct MeshCounts {
  long long vertices = 0;
  long long triangles = 0;
};

struct IterationTiming {
  double buildMs = 0.0;
  double tessellateMs = 0.0;
  double totalMs = 0.0;
  MeshCounts counts;
};

double degToRad(double deg) { return deg * kPi / 180.0; }
double cosd(double deg) { return std::cos(degToRad(deg)); }
double sind(double deg) { return std::sin(degToRad(deg)); }

CurveSegment lineTo(Point2 to) { return {SegmentKind::Line, to, {0.0, 0.0}}; }
CurveSegment arcTo(Point2 to, Point2 via) { return {SegmentKind::Arc, to, via}; }

TopoDS_Shape assertShape(const TopoDS_Shape& shape, const std::string& label) {
  if (shape.IsNull()) {
    throw std::runtime_error(label + " produced a null shape");
  }
  return shape;
}

std::vector<BankLayout> bankLayouts(const Params& p) {
  const double halfAngle = p.bankAngle / 2.0;
  return {
    {"L", 90.0 + halfAngle, 0.0},
    {"R", 90.0 - halfAngle, p.borePitch * 0.147},
  };
}

CrankStations crankStations(const Params& p) {
  CrankStations st;
  double x = 0.0;
  st.snoutStart = x;
  x += p.snoutLen;

  for (int i = 0; i <= p.bores; ++i) {
    st.mainStart.push_back(x);
    x += p.mainJournalLen;
    if (i < p.bores) {
      st.webStart.push_back(x);
      x += p.webThickness;
      st.pinStart.push_back(x);
      st.pinCenter.push_back(x + p.crankpinLen / 2.0);
      x += p.crankpinLen;
      st.webStart.push_back(x);
      x += p.webThickness;
    }
  }

  st.flangeStart = x;
  x += p.flangeThk;
  st.totalLen = x;
  for (const double start : st.mainStart) {
    st.mainCenter.push_back(start + p.mainJournalLen / 2.0);
  }
  return st;
}

gp_Pnt pointOnPlane(Point2 point, PlaneName plane, Point3 origin = {0.0, 0.0, 0.0}) {
  if (plane == PlaneName::XY) {
    return gp_Pnt(origin.x + point.x, origin.y + point.y, origin.z);
  }
  if (plane == PlaneName::YZ) {
    return gp_Pnt(origin.x, origin.y + point.x, origin.z + point.y);
  }
  return gp_Pnt(origin.x + point.x, origin.y, origin.z + point.y);
}

bool samePoint(const gp_Pnt& a, const gp_Pnt& b) {
  return a.Distance(b) <= Precision::Confusion();
}

TopoDS_Wire profileWireFromPoints(const std::vector<Point2>& source, PlaneName plane, Point3 origin = {0.0, 0.0, 0.0}) {
  if (source.size() < 3) {
    throw std::runtime_error("profileWireFromPoints needs at least three points");
  }

  std::vector<gp_Pnt> points;
  points.reserve(source.size());
  for (const auto& point : source) {
    points.push_back(pointOnPlane(point, plane, origin));
  }
  if (points.size() > 1 && samePoint(points.front(), points.back())) {
    points.pop_back();
  }

  BRepBuilderAPI_MakeWire wireMaker;
  for (std::size_t i = 0; i < points.size(); ++i) {
    const gp_Pnt& a = points[i];
    const gp_Pnt& b = points[(i + 1) % points.size()];
    if (samePoint(a, b)) {
      continue;
    }
    wireMaker.Add(BRepBuilderAPI_MakeEdge(a, b).Edge());
  }
  return TopoDS::Wire(assertShape(wireMaker.Wire(), "wire"));
}

TopoDS_Wire profileWireFromCurvePath(
  Point2 start,
  const std::vector<CurveSegment>& segments,
  PlaneName plane,
  Point3 origin = {0.0, 0.0, 0.0}
) {
  gp_Pnt first = pointOnPlane(start, plane, origin);
  gp_Pnt current = first;
  BRepBuilderAPI_MakeWire wireMaker;

  for (const auto& segment : segments) {
    const gp_Pnt end = pointOnPlane(segment.to, plane, origin);
    if (segment.kind == SegmentKind::Line) {
      if (!samePoint(current, end)) {
        wireMaker.Add(BRepBuilderAPI_MakeEdge(current, end).Edge());
      }
      current = end;
      continue;
    }

    const gp_Pnt via = pointOnPlane(segment.via, plane, origin);
    wireMaker.Add(BRepBuilderAPI_MakeEdge(GC_MakeArcOfCircle(current, via, end).Value()).Edge());
    current = end;
  }

  if (!samePoint(current, first)) {
    wireMaker.Add(BRepBuilderAPI_MakeEdge(current, first).Edge());
  }

  return TopoDS::Wire(assertShape(wireMaker.Wire(), "curve wire"));
}

TopoDS_Wire circleWire(double radius, PlaneName plane, Point3 origin = {0.0, 0.0, 0.0}, Point2 center = {0.0, 0.0}) {
  const gp_Pnt center3 = pointOnPlane(center, plane, origin);
  gp_Dir normal(0, 0, 1);
  if (plane == PlaneName::YZ) {
    normal = gp_Dir(1, 0, 0);
  } else if (plane == PlaneName::XZ) {
    normal = gp_Dir(0, 1, 0);
  }
  const Handle(Geom_Circle) circle = new Geom_Circle(gp_Ax2(center3, normal), radius);
  BRepBuilderAPI_MakeWire wireMaker;
  wireMaker.Add(BRepBuilderAPI_MakeEdge(circle).Edge());
  return TopoDS::Wire(assertShape(wireMaker.Wire(), "circle wire"));
}

TopoDS_Wire rectangleWire(Point2 minimum, Point2 maximum, PlaneName plane, Point3 origin = {0.0, 0.0, 0.0}) {
  return profileWireFromPoints(
    {
      {minimum.x, minimum.y},
      {maximum.x, minimum.y},
      {maximum.x, maximum.y},
      {minimum.x, maximum.y},
    },
    plane,
    origin
  );
}

gp_Vec extrudeDirection(PlaneName plane, double height) {
  if (plane == PlaneName::XY) {
    return gp_Vec(0, 0, height);
  }
  if (plane == PlaneName::YZ) {
    return gp_Vec(height, 0, 0);
  }
  return gp_Vec(0, height, 0);
}

TopoDS_Face faceFromWires(const TopoDS_Wire& outer, const std::vector<TopoDS_Wire>& holes = {}) {
  BRepBuilderAPI_MakeFace faceMaker(outer, true);
  for (auto hole : holes) {
    hole.Reverse();
    faceMaker.Add(hole);
  }
  return TopoDS::Face(assertShape(faceMaker.Face(), "face"));
}

TopoDS_Shape prism(const TopoDS_Shape& source, const gp_Vec& vec) {
  return assertShape(BRepPrimAPI_MakePrism(source, vec, true, true).Shape(), "prism");
}

TopoDS_Shape compoundExtrude(const TopoDS_Wire& outer, const std::vector<TopoDS_Wire>& holes, PlaneName plane, double height) {
  const TopoDS_Face face = faceFromWires(outer, holes);
  return prism(face, extrudeDirection(plane, height));
}

TopoDS_Shape revolvedX(const std::vector<Point2>& points) {
  const TopoDS_Face face = faceFromWires(profileWireFromPoints(points, PlaneName::XZ));
  return assertShape(BRepPrimAPI_MakeRevol(face, gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)), 2.0 * kPi, true).Shape(), "revolve X");
}

TopoDS_Shape revolvedZFromCurvePath(Point2 start, const std::vector<CurveSegment>& segments) {
  const TopoDS_Face face = faceFromWires(profileWireFromCurvePath(start, segments, PlaneName::XZ));
  return assertShape(BRepPrimAPI_MakeRevol(face, gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 2.0 * kPi, true).Shape(), "revolve Z");
}

TopoDS_Shape tubeX(double outerRadius, double innerRadius, double length) {
  return revolvedX({{0, innerRadius}, {0, outerRadius}, {length, outerRadius}, {length, innerRadius}});
}

TopoDS_Shape tubeZ(double outerRadius, double innerRadius, double zStart, double zEnd) {
  const TopoDS_Face face = faceFromWires(profileWireFromPoints(
    {
      {innerRadius, zStart},
      {outerRadius, zStart},
      {outerRadius, zEnd},
      {innerRadius, zEnd},
    },
    PlaneName::XZ
  ));
  return assertShape(BRepPrimAPI_MakeRevol(face, gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 2.0 * kPi, true).Shape(), "tube Z");
}

TopoDS_Wire capsuleWire(
  Point2 firstCenter,
  double firstRadius,
  Point2 secondCenter,
  double secondRadius,
  PlaneName plane,
  Point3 origin = {0.0, 0.0, 0.0}
) {
  const double dx = secondCenter.x - firstCenter.x;
  const double dy = secondCenter.y - firstCenter.y;
  const double distance = std::hypot(dx, dy);
  if (distance <= std::abs(firstRadius - secondRadius)) {
    throw std::runtime_error("invalid capsule");
  }

  const double ux = dx / distance;
  const double uy = dy / distance;
  const double radiusDelta = (firstRadius - secondRadius) / distance;
  const double side = std::sqrt(std::max(0.0, 1.0 - radiusDelta * radiusDelta));
  const Point2 normals[2] = {
    {ux * radiusDelta - uy * side, uy * radiusDelta + ux * side},
    {ux * radiusDelta + uy * side, uy * radiusDelta - ux * side},
  };
  const Point2 firstA{firstCenter.x + normals[0].x * firstRadius, firstCenter.y + normals[0].y * firstRadius};
  const Point2 secondA{secondCenter.x + normals[0].x * secondRadius, secondCenter.y + normals[0].y * secondRadius};
  const Point2 firstB{firstCenter.x + normals[1].x * firstRadius, firstCenter.y + normals[1].y * firstRadius};
  const Point2 secondB{secondCenter.x + normals[1].x * secondRadius, secondCenter.y + normals[1].y * secondRadius};
  const Point2 secondOuter{secondCenter.x + ux * secondRadius, secondCenter.y + uy * secondRadius};
  const Point2 firstOuter{firstCenter.x - ux * firstRadius, firstCenter.y - uy * firstRadius};

  return profileWireFromCurvePath(
    firstA,
    {
      lineTo(secondA),
      arcTo(secondB, secondOuter),
      lineTo(firstB),
      arcTo(firstA, firstOuter),
    },
    plane,
    origin
  );
}

TopoDS_Shape capsuleExtrude(
  Point2 firstCenter,
  double firstRadius,
  Point2 secondCenter,
  double secondRadius,
  PlaneName plane,
  Point3 origin,
  double height
) {
  return prism(faceFromWires(capsuleWire(firstCenter, firstRadius, secondCenter, secondRadius, plane, origin)), extrudeDirection(plane, height));
}

TopoDS_Shape box(Point3 minimum, Point3 maximum) {
  const double x0 = std::min(minimum.x, maximum.x);
  const double y0 = std::min(minimum.y, maximum.y);
  const double z0 = std::min(minimum.z, maximum.z);
  const double x1 = std::max(minimum.x, maximum.x);
  const double y1 = std::max(minimum.y, maximum.y);
  const double z1 = std::max(minimum.z, maximum.z);
  return assertShape(BRepPrimAPI_MakeBox(gp_Pnt(x0, y0, z0), x1 - x0, y1 - y0, z1 - z0).Shape(), "box");
}

TopoDS_Shape cylinder(double radius, double height, Point3 start, Point3 direction) {
  const gp_Ax2 axis(gp_Pnt(start.x, start.y, start.z), gp_Dir(direction.x, direction.y, direction.z));
  return assertShape(BRepPrimAPI_MakeCylinder(axis, radius, height).Shape(), "cylinder");
}

void appendList(TopTools_ListOfShape& list, const std::vector<TopoDS_Shape>& shapes) {
  for (const auto& shape : shapes) {
    if (shape.IsNull()) {
      throw std::runtime_error("boolean input contained null shape");
    }
    list.Append(shape);
  }
}

template <typename Algo>
TopoDS_Shape booleanOp(const std::string& label, const std::vector<TopoDS_Shape>& args, const std::vector<TopoDS_Shape>& tools) {
  if (args.empty()) {
    throw std::runtime_error(label + " needs at least one argument");
  }
  if (tools.empty()) {
    return args.front();
  }

  TopTools_ListOfShape argList;
  TopTools_ListOfShape toolList;
  appendList(argList, args);
  appendList(toolList, tools);

  Algo algo;
  algo.SetArguments(argList);
  algo.SetTools(toolList);
  algo.SetRunParallel(true);
  algo.SetToFillHistory(false);
  algo.SetNonDestructive(false);
  algo.SetUseOBB(false);
  algo.SetCheckInverted(false);
  Message_ProgressRange progress;
  algo.Build(progress);
  if (algo.HasErrors() || !algo.IsDone()) {
    throw std::runtime_error(label + " failed");
  }
  return assertShape(algo.Shape(), label);
}

TopoDS_Shape fuseAll(const std::vector<TopoDS_Shape>& shapes) {
  if (shapes.size() == 1) {
    return shapes.front();
  }
  return booleanOp<BRepAlgoAPI_Fuse>("fuse", {shapes.front()}, std::vector<TopoDS_Shape>(shapes.begin() + 1, shapes.end()));
}

TopoDS_Shape cutAll(const TopoDS_Shape& base, const std::vector<TopoDS_Shape>& tools) {
  return booleanOp<BRepAlgoAPI_Cut>("cut", {base}, tools);
}

TopoDS_Shape common(const TopoDS_Shape& a, const TopoDS_Shape& b) {
  return booleanOp<BRepAlgoAPI_Common>("common", {a}, {b});
}

TopoDS_Shape translate(const TopoDS_Shape& shape, Point3 delta) {
  gp_Trsf trsf;
  trsf.SetTranslation(gp_Vec(delta.x, delta.y, delta.z));
  TopoDS_Shape out = shape;
  out.Move(TopLoc_Location(trsf));
  return out;
}

TopoDS_Shape rotate(const TopoDS_Shape& shape, double angleDeg, Point3 origin, Point3 axisDirection) {
  gp_Trsf trsf;
  trsf.SetRotation(
    gp_Ax1(gp_Pnt(origin.x, origin.y, origin.z), gp_Dir(axisDirection.x, axisDirection.y, axisDirection.z)),
    degToRad(angleDeg)
  );
  TopoDS_Shape out = shape;
  out.Move(TopLoc_Location(trsf));
  return out;
}

TopoDS_Shape tubeBetween(Point3 a, Point3 b, double radius) {
  const double dx = b.x - a.x;
  const double dy = b.y - a.y;
  const double dz = b.z - a.z;
  const double length = std::sqrt(dx * dx + dy * dy + dz * dz);
  return cylinder(radius, length, a, {dx / length, dy / length, dz / length});
}

TopoDS_Shape rectangularTubeZ(double x0, double x1, double y0, double y1, double z0, double z1, double wall) {
  return compoundExtrude(
    rectangleWire({x0, y0}, {x1, y1}, PlaneName::XY, {0, 0, z0}),
    {rectangleWire({x0 + wall, y0 + wall}, {x1 - wall, y1 - wall}, PlaneName::XY, {0, 0, z0})},
    PlaneName::XY,
    z1 - z0
  );
}

TopoDS_Shape hexPrismZ(double acrossFlats, double zStart, double height) {
  const double radius = acrossFlats / std::sqrt(3.0);
  std::vector<Point2> points;
  for (int i = 0; i < 6; ++i) {
    const double angle = 60.0 * i + 30.0;
    points.push_back({radius * cosd(angle), radius * sind(angle)});
  }
  return prism(faceFromWires(profileWireFromPoints(points, PlaneName::XY, {0, 0, zStart})), gp_Vec(0, 0, height));
}

TopoDS_Shape makeWeb(const Params& p, double xStart, double phaseDeg) {
  const double dirY = cosd(phaseDeg);
  const double dirZ = sind(phaseDeg);
  return capsuleExtrude(
    {-p.counterweightOffset * dirY, -p.counterweightOffset * dirZ},
    p.counterweightDia / 2.0,
    {p.crankThrow * dirY, p.crankThrow * dirZ},
    p.webHubPinDia / 2.0,
    PlaneName::YZ,
    {xStart, 0, 0},
    p.webThickness
  );
}

TopoDS_Shape makeCrankshaft(const Params& p) {
  const auto st = crankStations(p);
  const std::vector<double> phases = {0.0, 90.0, 270.0, 180.0};
  std::vector<TopoDS_Shape> crankParts = {
    cylinder(p.snoutDia / 2.0, p.snoutLen, {st.snoutStart, 0, 0}, {1, 0, 0}),
  };

  for (int i = 0; i <= p.bores; ++i) {
    crankParts.push_back(cylinder(p.mainJournalDia / 2.0, p.mainJournalLen, {st.mainStart[i], 0, 0}, {1, 0, 0}));
  }

  for (int i = 0; i < p.bores; ++i) {
    const double phase = phases[i % phases.size()];
    const double pinY = p.crankThrow * cosd(phase);
    const double pinZ = p.crankThrow * sind(phase);
    crankParts.push_back(makeWeb(p, st.webStart[2 * i], phase));
    crankParts.push_back(cylinder(p.crankpinDia / 2.0, p.crankpinLen, {st.pinStart[i], pinY, pinZ}, {1, 0, 0}));
    crankParts.push_back(makeWeb(p, st.webStart[2 * i + 1], phase));
  }

  TopoDS_Shape flange = cylinder(p.flangeDia / 2.0, p.flangeThk, {st.flangeStart, 0, 0}, {1, 0, 0});
  std::vector<TopoDS_Shape> flangeCuts = {
    cylinder(11.0, p.flangeThk + 4.0, {st.flangeStart - 2.0, 0, 0}, {1, 0, 0}),
  };
  for (int bolt = 0; bolt < p.flangeBolts; ++bolt) {
    const double angle = 360.0 / p.flangeBolts * bolt;
    flangeCuts.push_back(cylinder(
      p.flangeBoltDia / 2.0,
      p.flangeThk + 4.0,
      {st.flangeStart - 2.0, (p.flangeBoltCircle / 2.0) * cosd(angle), (p.flangeBoltCircle / 2.0) * sind(angle)},
      {1, 0, 0}
    ));
  }
  crankParts.push_back(cutAll(flange, flangeCuts));

  TopoDS_Shape crank = fuseAll(crankParts);
  std::vector<TopoDS_Shape> oilGalleryTools;
  for (int i = 0; i < p.bores; ++i) {
    const double phase = phases[i % phases.size()];
    const double pinY = p.crankThrow * cosd(phase);
    const double pinZ = p.crankThrow * sind(phase);
    oilGalleryTools.push_back(cylinder(
      p.oilGalleryDia / 2.0,
      p.crankThrow + p.crankpinDia,
      {st.pinCenter[i], pinY / 2.0, pinZ / 2.0},
      {0, pinY == 0.0 ? 1.0 : pinY, pinZ}
    ));
  }
  return cutAll(crank, oilGalleryTools);
}

TopoDS_Shape makeBlock(const Params& p) {
  const auto st = crankStations(p);
  const double xFront = -10.0;
  const double xRear = st.totalLen + 10.0;
  const double blockLen = xRear - xFront;
  const double caseWidth = 200.0;
  const double caseTop = 30.0;
  const double caseBot = -110.0;
  const double halfBank = p.bankAngle / 2.0;
  const double deckRise = p.deckHeight * sind(halfBank);
  const double deckReach = p.deckHeight * cosd(halfBank);
  const double valleyHalf = 44.0;
  const double deckShoulder = caseWidth / 2.0 + 42.0;
  const double deckOuter = deckReach + 58.0;
  const double deckTop = deckRise + 28.0;
  const double valleyTop = caseTop + 38.0;

  const TopoDS_Shape block = prism(
    faceFromWires(profileWireFromPoints(
      {
        {-caseWidth / 2.0, caseBot},
        {caseWidth / 2.0, caseBot},
        {caseWidth / 2.0, caseTop},
        {deckShoulder, valleyTop},
        {deckOuter, deckTop},
        {deckOuter - 52.0, deckTop + 32.0},
        {valleyHalf, valleyTop + 24.0},
        {0.0, valleyTop + 10.0},
        {-valleyHalf, valleyTop + 24.0},
        {-deckOuter + 52.0, deckTop + 32.0},
        {-deckOuter, deckTop},
        {-deckShoulder, valleyTop},
        {-caseWidth / 2.0, caseTop},
      },
      PlaneName::YZ,
      {xFront, 0, 0}
    )),
    gp_Vec(blockLen, 0, 0)
  );

  std::vector<TopoDS_Shape> cutTools;
  for (const auto& bank : bankLayouts(p)) {
    const double ny = cosd(bank.deckAngle);
    const double nz = sind(bank.deckAngle);
    for (int bore = 0; bore < p.bores; ++bore) {
      const double x = st.pinCenter[bore] + bank.xShift - 7.0;
      cutTools.push_back(cylinder(p.bore / 2.0, p.deckHeight + 30.0, {x, ny * 15.0, nz * 15.0 + 10.0}, {0, ny, nz}));
    }
  }
  cutTools.push_back(cylinder(p.mainJournalDia / 2.0 + 1.0, blockLen + 20.0, {xFront - 10.0, 0, 0}, {1, 0, 0}));
  const double crankClearR = p.counterweightDia / 2.0 + 4.0;
  cutTools.push_back(prism(
    faceFromWires(profileWireFromCurvePath(
      {-caseWidth / 2.0, caseBot - 6.0},
      {
        lineTo({caseWidth / 2.0, caseBot - 6.0}),
        lineTo({caseWidth / 2.0, 0.0}),
        lineTo({crankClearR, 0.0}),
        arcTo({-crankClearR, 0.0}, {0.0, -crankClearR}),
        lineTo({-caseWidth / 2.0, 0.0}),
      },
      PlaneName::YZ,
      {xFront - 12.0, 0, 0}
    )),
    gp_Vec(blockLen + 24.0, 0, 0)
  ));
  cutTools.push_back(box({xFront + 6.0, -70.0, caseBot - 1.0}, {xRear - 6.0, 70.0, caseBot + 25.0}));
  return cutAll(block, cutTools);
}

TopoDS_Shape makeConrod(const Params& p) {
  const double bigR = p.rodBigEndDia / 2.0;
  const double smallR = p.rodSmallEndDia / 2.0;
  const double bossW = p.rodBeamThk + 18.0;
  const double zBoss = (p.rodBeamThk - bossW) / 2.0;

  TopoDS_Shape rod = compoundExtrude(
    capsuleWire({0, 0}, bigR, {0, p.rodLength}, smallR, PlaneName::XY),
    {
      circleWire(p.rodBigEndBoreDia / 2.0, PlaneName::XY),
      circleWire(p.rodSmallEndBoreDia / 2.0, PlaneName::XY, {0, 0, 0}, {0, p.rodLength}),
    },
    PlaneName::XY,
    p.rodBeamThk
  );
  const TopoDS_Shape bigBoss = tubeZ(bigR, p.rodBigEndBoreDia / 2.0, zBoss, zBoss + bossW);
  const TopoDS_Shape smallBoss = translate(tubeZ(smallR, p.rodSmallEndBoreDia / 2.0, zBoss, zBoss + bossW), {0, p.rodLength, 0});
  rod = fuseAll({rod, bigBoss, smallBoss});

  std::vector<TopoDS_Shape> boltTools;
  for (const double side : {-1.0, 1.0}) {
    boltTools.push_back(cylinder(2.5, bigR * 2.0 + 6.0, {side * (bigR - 2.0), -bigR - 3.0, p.rodBeamThk / 2.0}, {0, 1, 0}));
  }
  return cutAll(rod, boltTools);
}

TopoDS_Shape makeCylinderHead(const Params& p) {
  const auto st = crankStations(p);
  const double length = st.totalLen - p.snoutLen - p.flangeThk + 40.0;
  const double width = 150.0;
  const double x0 = st.mainStart[0] - 10.0;
  TopoDS_Shape head = box({x0, -width / 2.0, 0}, {x0 + length, width / 2.0, p.headThk});
  std::vector<TopoDS_Shape> fuseParts = {
    box({x0, -58.0, p.headThk}, {x0 + length, -22.0, p.headThk + 28.0}),
    box({x0, 22.0, p.headThk}, {x0 + length, 58.0, p.headThk + 28.0}),
  };
  std::vector<TopoDS_Shape> cutTools;
  for (int bore = 0; bore < p.bores; ++bore) {
    const double x = st.pinCenter[bore] - 7.0;
    fuseParts.push_back(translate(tubeZ(13.0, p.plugThreadDia / 2.0, p.headThk, p.headThk + 26.0), {x, 0, 0}));
    cutTools.push_back(cylinder(p.plugThreadDia / 2.0, p.headThk + 30.0, {x, 0, -1.0}, {0, 0, 1}));
    cutTools.push_back(cylinder(p.bore / 2.0 - 4.0, 8.0, {x, 0, -1.0}, {0, 0, 1}));
    for (const double valveY : {-22.0, 22.0}) {
      cutTools.push_back(cylinder(15.0, 6.0, {x, valveY, -1.0}, {0, 0, 1}));
    }
  }
  head = fuseAll([&]() {
    std::vector<TopoDS_Shape> all = {head};
    all.insert(all.end(), fuseParts.begin(), fuseParts.end());
    return all;
  }());
  cutTools.push_back(box({x0 + 6.0, -width / 2.0 + 8.0, -0.1}, {x0 + length - 6.0, width / 2.0 - 8.0, 10.0}));
  return cutAll(head, cutTools);
}

TopoDS_Shape makeDamper(const Params& p) {
  const double radius = p.damperOuterDia / 2.0;
  const double boreR = p.snoutDia / 2.0;
  const double groovePitch = (p.damperThk - 6.0) / p.damperGrooves;
  std::vector<Point2> points = {{0.0, boreR}, {0.0, radius}};
  for (int groove = 0; groove < p.damperGrooves; ++groove) {
    const double x = 3.0 + groove * groovePitch;
    points.push_back({x, radius});
    points.push_back({x + groovePitch * 0.24, radius - 5.0});
    points.push_back({x + groovePitch * 0.56, radius - 5.0});
    points.push_back({x + groovePitch * 0.8, radius});
  }
  points.push_back({p.damperThk, radius});
  points.push_back({p.damperThk, boreR + 13.0});
  points.push_back({8.0, boreR + 13.0});
  points.push_back({8.0, boreR});
  points.push_back({0.0, boreR});
  return revolvedX(points);
}

TopoDS_Shape toothedRingProfile(const Params& p) {
  const double outerR = p.flywheelOuterDia / 2.0 + 2.0;
  const double rootR = p.flywheelOuterDia / 2.0 - 5.0;
  const double innerR = p.flywheelOuterDia / 2.0 - 13.0;
  std::vector<Point2> points;
  for (int tooth = 0; tooth < p.ringGearTeeth; ++tooth) {
    const double a0 = 360.0 / p.ringGearTeeth * tooth;
    points.push_back({rootR * cosd(a0), rootR * sind(a0)});
    points.push_back({outerR * cosd(a0 + 360.0 / p.ringGearTeeth / 2.0), outerR * sind(a0 + 360.0 / p.ringGearTeeth / 2.0)});
  }
  return compoundExtrude(profileWireFromPoints(points, PlaneName::YZ), {circleWire(innerR, PlaneName::YZ)}, PlaneName::YZ, 12.0);
}

TopoDS_Shape makeFlywheel(const Params& p) {
  const double radius = p.flywheelOuterDia / 2.0;
  const double boreR = 18.0;
  const double hubR = p.flangeBoltCircle / 2.0 + 14.0;
  const double clutchR = p.flywheelClutchDia / 2.0;
  TopoDS_Shape flywheel = revolvedX({
    {0.0, boreR},
    {0.0, radius - 10.0},
    {8.0, radius - 10.0},
    {8.0, radius},
    {p.flywheelThk, radius},
    {p.flywheelThk, clutchR},
    {p.flywheelThk - 6.0, clutchR},
    {p.flywheelThk - 6.0, hubR},
    {p.flywheelThk, hubR},
    {p.flywheelThk, boreR},
  });
  if (p.flywheelExactTeeth) {
    flywheel = fuseAll({flywheel, toothedRingProfile(p)});
  }
  std::vector<TopoDS_Shape> cutTools;
  for (int bolt = 0; bolt < p.flangeBolts; ++bolt) {
    const double angle = 360.0 / p.flangeBolts * bolt;
    cutTools.push_back(cylinder(
      p.flangeBoltDia / 2.0,
      p.flywheelThk + 4.0,
      {-2.0, (p.flangeBoltCircle / 2.0) * cosd(angle), (p.flangeBoltCircle / 2.0) * sind(angle)},
      {1, 0, 0}
    ));
  }
  return cutAll(flywheel, cutTools);
}

std::vector<Part> makeIntakeParts(const Params& p) {
  const auto st = crankStations(p);
  const double plenumR = p.plenumDia / 2.0;
  const double x0 = st.mainStart[0];
  const double length = st.totalLen - p.snoutLen - p.flangeThk;
  const double halfBank = p.bankAngle / 2.0;
  const double plenumZ = p.deckHeight * sind(halfBank) + 40.0;
  std::vector<Part> parts = {
    {"Intake Plenum", cylinder(plenumR, length, {x0, 0, plenumZ}, {1, 0, 0})},
    {"Throttle Body", cylinder(p.throttleDia / 2.0, 40.0, {x0 - 40.0, 0, plenumZ}, {1, 0, 0})},
  };
  for (const double side : {-1.0, 1.0}) {
    for (int bore = 0; bore < p.bores; ++bore) {
      const double x = st.pinCenter[bore] - 7.0;
      const double portY = side * (p.deckHeight * cosd(halfBank) * 0.35 + 25.0);
      const double portZ = plenumZ - 60.0;
      const Point3 start{x, side * plenumR, plenumZ};
      const Point3 mid{x, portY * 0.7, plenumZ - 20.0};
      const Point3 end{x, portY, portZ};
      const std::string runnerName = std::string("Intake Runner ") + (side < 0 ? "L" : "R") + std::to_string(bore + 1);
      parts.push_back({runnerName + " Upper", tubeBetween(start, mid, p.runnerDia / 2.0)});
      parts.push_back({runnerName + " Lower", tubeBetween(mid, end, p.runnerDia / 2.0)});
    }
  }
  return parts;
}

TopoDS_Shape makeOilPan(const Params& p) {
  const auto st = crankStations(p);
  const double x0 = -6.0;
  const double x1 = st.totalLen + 6.0;
  const double railTop = -100.0;
  const double railWidth = 184.0;
  const double wall = 4.0;
  const double sumpX0 = st.totalLen * 0.4;
  const double sumpDepth = 62.0;
  return fuseAll({
    rectangularTubeZ(x0, x1, -railWidth / 2.0, railWidth / 2.0, railTop - 10.0, railTop, wall),
    rectangularTubeZ(sumpX0, sumpX0 + 200.0, -78.0, 78.0, railTop - sumpDepth, railTop, wall),
    box({sumpX0, -78.0, railTop - sumpDepth}, {sumpX0 + 200.0, 78.0, railTop - sumpDepth + wall}),
  });
}

std::pair<Point2, std::vector<CurveSegment>> pistonProfile(const Params& p) {
  const double radius = p.crownDia / 2.0;
  const double top = p.pistonCompHeight;
  const double bottom = -p.pistonSkirtLen;
  const double firstGrooveZ = top - 5.0;
  const std::vector<double> grooves = {
    firstGrooveZ - 2.0 * (p.ringGrooveWidth + 3.0),
    firstGrooveZ - 1.0 * (p.ringGrooveWidth + 3.0),
    firstGrooveZ,
  };
  std::vector<CurveSegment> segments = {
    lineTo({radius * 0.92, bottom}),
    lineTo({radius, bottom + 4.0}),
  };
  for (const double grooveZ : grooves) {
    segments.push_back(lineTo({radius, grooveZ}));
    segments.push_back(lineTo({radius - p.ringGrooveDepth, grooveZ + 0.15}));
    segments.push_back(lineTo({radius - p.ringGrooveDepth, grooveZ + p.ringGrooveWidth - 0.15}));
    segments.push_back(lineTo({radius, grooveZ + p.ringGrooveWidth}));
  }
  segments.push_back(lineTo({radius, top}));
  segments.push_back(arcTo({0.0, top + p.domeRise}, {radius / 2.0, top + p.domeRise * 0.75}));
  return {{0.0, bottom}, segments};
}

TopoDS_Shape makePiston(const Params& p) {
  const auto [start, segments] = pistonProfile(p);
  const TopoDS_Shape piston = revolvedZFromCurvePath(start, segments);
  const TopoDS_Shape pinBore = cylinder(p.pinBoreDia / 2.0, p.crownDia + 8.0, {-p.crownDia / 2.0 - 4.0, 0, 0}, {1, 0, 0});
  return cutAll(piston, {pinBore});
}

TopoDS_Shape makeSparkPlug(const Params& p) {
  const double threadR = p.plugThreadDia / 2.0;
  const double hexZ0 = p.plugReach;
  const double hexZ1 = hexZ0 + 14.0;
  const double ceramicZ1 = hexZ1 + 22.0;
  const double terminalZ1 = ceramicZ1 + 16.0;
  const TopoDS_Shape plug = revolvedZFromCurvePath({0.0, -3.5}, {
    lineTo({1.2, -3.5}),
    lineTo({1.2, 0.0}),
    lineTo({threadR, 0.0}),
    lineTo({threadR, hexZ0}),
    lineTo({6.2, hexZ0}),
    lineTo({6.2, hexZ1}),
    lineTo({5.0, hexZ1}),
    lineTo({5.0, ceramicZ1}),
    lineTo({3.0, ceramicZ1}),
    lineTo({3.0, terminalZ1}),
    lineTo({0.0, terminalZ1}),
  });
  return fuseAll({plug, hexPrismZ(p.plugHexAcross, hexZ0, 14.0)});
}

TopoDS_Shape makeValveCover(const Params& p) {
  const auto st = crankStations(p);
  const double length = st.totalLen - p.snoutLen - p.flangeThk + 30.0;
  const double width = 110.0;
  const double x0 = st.mainStart[0] - 5.0;
  const double wall = 4.0;
  std::vector<TopoDS_Shape> parts = {
    box({x0 - 6.0, -width / 2.0 - 6.0, 0}, {x0 + length + 6.0, width / 2.0 + 6.0, 6.0}),
    rectangularTubeZ(x0, x0 + length, -width / 2.0, width / 2.0, 6.0, p.valveCoverHeight, wall),
    box({x0, -width / 2.0, p.valveCoverHeight - wall}, {x0 + length, width / 2.0, p.valveCoverHeight}),
    box({x0 - 4.0, -width / 2.0 - 4.0, 4.0}, {x0 + length + 4.0, width / 2.0 + 4.0, 12.0}),
  };
  for (int rib = 0; rib < p.bores; ++rib) {
    const double x = x0 + (length * (rib + 0.5)) / p.bores;
    parts.push_back(box({x - 3.0, -width / 2.0 + wall, p.valveCoverHeight - wall}, {x + 3.0, width / 2.0 - wall, p.valveCoverHeight + 4.0}));
  }
  parts.push_back(translate(tubeZ(16.0, 11.0, p.valveCoverHeight, p.valveCoverHeight + 18.0), {x0 + 30.0, 0, 0}));
  return fuseAll(parts);
}

TopoDS_Shape makeWristPin(const Params& p) {
  return translate(tubeX(p.wristPinOuterDia / 2.0, p.wristPinInnerDia / 2.0, p.wristPinLen), {-p.wristPinLen / 2.0, 0, 0});
}

std::vector<Part> makeEngine(const Params& p) {
  const auto st = crankStations(p);
  const auto banks = bankLayouts(p);
  const std::vector<double> phases = {0.0, 90.0, 270.0, 180.0};
  std::vector<Part> parts = {
    {"Crankshaft", makeCrankshaft(p)},
    {"Block", makeBlock(p)},
    {"Harmonic Damper", translate(makeDamper(p), {st.snoutStart - p.damperThk, 0, 0})},
    {"Flywheel", translate(makeFlywheel(p), {st.flangeStart + p.flangeThk, 0, 0})},
    {"Oil Pan", makeOilPan(p)},
  };
  const auto intake = makeIntakeParts(p);
  parts.insert(parts.end(), intake.begin(), intake.end());

  const TopoDS_Shape pistonPrototype = makePiston(p);
  const TopoDS_Shape pinPrototype = makeWristPin(p);
  const TopoDS_Shape rodPrototype = makeConrod(p);
  const TopoDS_Shape plugPrototype = makeSparkPlug(p);
  const TopoDS_Shape headPrototype = makeCylinderHead(p);
  const TopoDS_Shape coverPrototype = makeValveCover(p);

  const double baseZ = 10.0;
  int cylinderIndex = 0;
  for (const auto& bank : banks) {
    const double ny = cosd(bank.deckAngle);
    const double nz = sind(bank.deckAngle);
    for (int bore = 0; bore < p.bores; ++bore) {
      const double x = st.pinCenter[bore] + bank.xShift - 7.0;
      const double phase = phases[bore % phases.size()];
      const double crankY = p.crankThrow * cosd(phase);
      const double crankZ = p.crankThrow * sind(phase);
      const double a = crankY;
      const double b = crankZ - baseZ;
      const double k = ny * a + nz * b;
      const double slider = k + std::sqrt(std::max(0.0, k * k - (a * a + b * b - p.rodLength * p.rodLength)));
      const double pinY = slider * ny;
      const double pinZ = baseZ + slider * nz;
      const double phiDeg = std::atan2(pinZ - crankZ, pinY - crankY) * 180.0 / kPi;

      parts.push_back({"Piston " + std::to_string(cylinderIndex + 1), translate(rotate(pistonPrototype, bank.deckAngle - 90.0, {0, 0, 0}, {1, 0, 0}), {x, pinY, pinZ})});
      parts.push_back({"Wrist Pin " + std::to_string(cylinderIndex + 1), translate(pinPrototype, {x, pinY, pinZ})});
      parts.push_back({"Con Rod " + std::to_string(cylinderIndex + 1), translate(rotate(rotate(rodPrototype, 90.0, {0, 0, 0}, {0, 1, 0}), phiDeg, {0, 0, 0}, {1, 0, 0}), {x, crankY, crankZ})});
      parts.push_back({"Spark Plug " + std::to_string(cylinderIndex + 1), translate(rotate(plugPrototype, bank.deckAngle - 90.0, {0, 0, 0}, {1, 0, 0}), {x, ny * p.deckHeight, baseZ + nz * p.deckHeight})});
      ++cylinderIndex;
    }
  }

  for (const auto& bank : banks) {
    parts.push_back({"Cylinder Head " + bank.side, translate(rotate(headPrototype, bank.deckAngle - 90.0, {0, 0, 0}, {1, 0, 0}), {0, cosd(bank.deckAngle) * p.deckHeight, sind(bank.deckAngle) * p.deckHeight + 10.0})});
    parts.push_back({"Valve Cover " + bank.side, translate(rotate(coverPrototype, bank.deckAngle - 90.0, {0, 0, 0}, {1, 0, 0}), {0, cosd(bank.deckAngle) * (p.deckHeight + p.headThk), sind(bank.deckAngle) * (p.deckHeight + p.headThk) + 10.0})});
  }

  return parts;
}

MeshCounts meshParts(const std::vector<Part>& parts, double linearTolerance, double angularToleranceDeg) {
  MeshCounts counts;
  const double angular = degToRad(angularToleranceDeg);
  for (const auto& part : parts) {
    TopoDS_Shape shape = part.shape;
    BRepTools::Clean(shape, false);
    BRepMesh_IncrementalMesh mesh(shape, linearTolerance, false, angular, true);
    (void)mesh;
    for (TopExp_Explorer explorer(shape, TopAbs_FACE); explorer.More(); explorer.Next()) {
      TopLoc_Location location;
      const Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(TopoDS::Face(explorer.Current()), location);
      if (!triangulation.IsNull()) {
        counts.vertices += triangulation->NbNodes();
        counts.triangles += triangulation->NbTriangles();
      }
    }
  }
  return counts;
}

template <typename Fn>
double timeMs(Fn&& fn) {
  const auto start = std::chrono::steady_clock::now();
  fn();
  const auto end = std::chrono::steady_clock::now();
  return std::chrono::duration<double, std::milli>(end - start).count();
}

double mean(const std::vector<double>& values) {
  return std::accumulate(values.begin(), values.end(), 0.0) / static_cast<double>(values.size());
}

double median(std::vector<double> values) {
  std::sort(values.begin(), values.end());
  const std::size_t mid = values.size() / 2;
  if (values.size() % 2 == 1) {
    return values[mid];
  }
  return (values[mid - 1] + values[mid]) / 2.0;
}

double stddev(const std::vector<double>& values) {
  const double avg = mean(values);
  double total = 0.0;
  for (const double value : values) {
    total += (value - avg) * (value - avg);
  }
  return std::sqrt(total / static_cast<double>(values.size()));
}

void printStats(const std::string& label, const std::vector<double>& values) {
  std::cout << "  \"" << label << "\": {"
            << "\"meanMs\": " << mean(values)
            << ", \"medianMs\": " << median(values)
            << ", \"stddevMs\": " << stddev(values)
            << "}";
}

} // namespace

int main() {
  try {
    BOPAlgo_Options::SetParallelMode(true);
    BRepMesh_IncrementalMesh::SetParallelDefault(true);
    OSD_ThreadPool::DefaultPool()->SetNbDefaultThreadsToLaunch(OSD_ThreadPool::DefaultPool()->NbThreads());

    const Params params;
    constexpr int warmups = 3;
    constexpr int iterations = 5;
    constexpr double linearTolerance = 0.01;
    constexpr double angularToleranceDeg = 20.0;

    std::vector<IterationTiming> measured;
    measured.reserve(iterations);

    for (int i = 0; i < warmups + iterations; ++i) {
      std::vector<Part> parts;
      MeshCounts counts;
      const double buildMs = timeMs([&]() { parts = makeEngine(params); });
      const double tessMs = timeMs([&]() { counts = meshParts(parts, linearTolerance, angularToleranceDeg); });
      const double totalMs = buildMs + tessMs;
      std::cerr << (i < warmups ? "warmup" : "iter") << " " << (i + 1) << "/" << (warmups + iterations)
                << ": build=" << buildMs << "ms tessellate=" << tessMs << "ms total=" << totalMs
                << "ms parts=" << parts.size() << " tris=" << counts.triangles << "\n";
      if (i >= warmups) {
        measured.push_back({buildMs, tessMs, totalMs, counts});
      }
    }

    std::vector<double> buildValues;
    std::vector<double> tessValues;
    std::vector<double> totalValues;
    for (const auto& timing : measured) {
      buildValues.push_back(timing.buildMs);
      tessValues.push_back(timing.tessellateMs);
      totalValues.push_back(timing.totalMs);
    }

    const auto counts = measured.back().counts;
    std::cout << std::fixed << std::setprecision(2);
    std::cout << "{\n"
              << "  \"kernel\": \"native-occt\",\n"
              << "  \"linearTolerance\": " << linearTolerance << ",\n"
              << "  \"angularToleranceDeg\": " << angularToleranceDeg << ",\n"
              << "  \"warmups\": " << warmups << ",\n"
              << "  \"iterations\": " << iterations << ",\n"
              << "  \"vertices\": " << counts.vertices << ",\n"
              << "  \"triangles\": " << counts.triangles << ",\n";
    printStats("build", buildValues);
    std::cout << ",\n";
    printStats("tessellate", tessValues);
    std::cout << ",\n";
    printStats("total", totalValues);
    std::cout << "\n}\n";
    return 0;
  } catch (const Standard_Failure& failure) {
    std::cerr << "OCCT failure: " << failure.GetMessageString() << "\n";
    return 1;
  } catch (const std::exception& error) {
    std::cerr << "Error: " << error.what() << "\n";
    return 1;
  }
}
