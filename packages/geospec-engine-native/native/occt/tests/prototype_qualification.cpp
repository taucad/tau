// Ordinary qualification for the report-only prototype copy. Compile this
// single translation unit with the pinned OCCT static closure; no test runner.
#include "../bridge/geospec_occt_bridge.cpp"

#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>

#include <initializer_list>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>

void check(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

TopoDS_Shape place(const TopoDS_Shape& shape, double x, double y, double z) {
  gp_Trsf transform;
  transform.SetTranslation(gp_Vec(x, y, z));
  return shape.Located(TopLoc_Location(transform));
}

TopoDS_Shape rotated(const TopoDS_Shape& shape, double x, double y) {
  gp_Trsf transform;
  transform.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)),
                        3.14159265358979323846 / 2.0);
  transform.SetTranslationPart(gp_Vec(x, y, 0));
  return shape.Located(TopLoc_Location(transform));
}

TopoDS_Compound compound(std::initializer_list<TopoDS_Shape> children) {
  BRep_Builder builder;
  TopoDS_Compound result;
  builder.MakeCompound(result);
  for (const TopoDS_Shape& child : children) builder.Add(result, child);
  return result;
}

void collect_solids(const TopoDS_Shape& shape, std::vector<TopoDS_Shape>& out) {
  if (shape.ShapeType() == TopAbs_SOLID) {
    out.push_back(shape);
    return;
  }
  for (TopoDS_Iterator child(shape, true, true); child.More(); child.Next())
    collect_solids(child.Value(), out);
}

geospec_occt_document document_for(const TopoDS_Shape& shape) {
  geospec_occt_document document;
  document.shape = shape;
  NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> whole_index;
  TopExp::MapShapes(shape, TopAbs_FACE, whole_index);
  for (TopExp_Explorer face(shape, TopAbs_FACE); face.More(); face.Next())
    document.public_faces.push_back(
        {static_cast<uint32_t>(whole_index.FindIndex(face.Current())),
         TopoDS::Face(face.Current())});

  std::vector<TopoDS_Shape> solids;
  collect_solids(shape, solids);
  for (const TopoDS_Shape& solid : solids) {
    OccurrenceFacts occurrence;
    occurrence.shape = solid;
    NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher> face_index;
    TopExp::MapShapes(solid, TopAbs_FACE, face_index);
    for (int i = 1; i <= face_index.Extent(); ++i) {
      LocatedFaceFacts face;
      face.shape = TopoDS::Face(face_index(i));
      face.edge_indices.resize(shape_count(face.shape, TopAbs_EDGE));
      occurrence.faces.push_back(std::move(face));
    }
    for (TopExp_Explorer face(solid, TopAbs_FACE); face.More(); face.Next())
      occurrence.public_faces.push_back(
          {static_cast<uint32_t>(face_index.FindIndex(face.Current())),
           TopoDS::Face(face.Current())});
    document.occurrences.push_back(std::move(occurrence));
  }
  return document;
}

std::string brep_bytes(const TopoDS_Shape& shape) {
  std::ostringstream stream;
  BRepTools::Write(shape, stream, true, true, TopTools_FormatVersion_CURRENT);
  return stream.str();
}

void check_soup_equal(const MeshData& a, const MeshData& b) {
  check(a.positions.size() == b.positions.size(), "soup vertex count changed");
  check(a.triangles == b.triangles, "soup triangle order/winding changed");
  for (size_t i = 0; i < a.positions.size(); ++i)
    for (size_t axis = 0; axis < 3; ++axis)
      check(float_bits(a.positions[i][axis]) == float_bits(b.positions[i][axis]),
            "soup coordinate bits changed");
}

ReportData whole_copy_report(const geospec_occt_document& document) {
  BRepBuilderAPI_Copy copy(document.shape, false, false);
  check(copy.IsDone() && !copy.Shape().IsNull(), "whole-copy control failed");
  const TopoDS_Shape isolated = copy.Shape();
  constexpr double pi = 3.141592653589793238462643383279502884;
  mesh_shape(isolated, 0.01, 15.0 * pi / 180.0);
  ReportData report;
  report.mesh = report_triangle_soup(isolated);
  report.shape = shape_facts(isolated, false);
  report.shape.bounds = reporting_bounds(isolated);
  for (const OccurrenceFacts& source : document.occurrences) {
    TopoDS_Shape mapped = copy.ModifiedShape(source.shape);
    mapped.Orientation(source.shape.Orientation());
    auto occurrence = source.facts;
    occurrence.bounds = bounds(mapped);
    report.occurrences.push_back(occurrence);
    std::vector<geospec_occt_located_face_facts> faces;
    for (size_t i = 0; i < source.public_faces.size(); ++i) {
      const FaceView& face = source.public_faces[i];
      mapped = copy.ModifiedShape(face.shape);
      mapped.Orientation(face.shape.Orientation());
      faces.push_back(reported_face(
          TopoDS::Face(mapped), static_cast<uint32_t>(i), face.query_index,
          source.faces[static_cast<size_t>(face.query_index - 1)].edge_indices.size()));
    }
    report.occurrence_faces.push_back(std::move(faces));
  }
  for (size_t i = 0; i < document.public_faces.size(); ++i) {
    const FaceView& face = document.public_faces[i];
    TopoDS_Shape mapped = copy.ModifiedShape(face.shape);
    mapped.Orientation(face.shape.Orientation());
    report.whole_faces.push_back(reported_face(
        TopoDS::Face(mapped), static_cast<uint32_t>(i), face.query_index, 0));
  }
  return report;
}

// Compare scalar bytes, never struct padding, for two runs of this profile.
std::vector<uint64_t> report_words(const ReportData& report) {
  std::vector<uint64_t> words;
  const auto integer = [&](auto value) { words.push_back(static_cast<uint64_t>(value)); };
  const auto real = [&](double value) { words.push_back(float_bits(value)); };
  const auto report_bounds = [&](const geospec_occt_bounds& value) {
    for (double number : value.min) real(number);
    for (double number : value.max) real(number);
  };
  const auto report_face = [&](const geospec_occt_located_face_facts& value) {
    const auto& face = value.face;
    integer(face.index);
    integer(face.query_index);
    integer(face.surface_type);
    for (double number : face.parameter_bounds) real(number);
    real(face.area);
    for (double number : face.center_of_mass) real(number);
    for (double number : face.origin) real(number);
    for (double number : face.direction) real(number);
    real(face.radius);
    real(face.secondary_radius);
    real(face.semi_angle);
    integer(face.u_degree);
    integer(face.v_degree);
    integer(face.u_poles);
    integer(face.v_poles);
    integer(face.u_knots);
    integer(face.v_knots);
    integer(face.u_rational);
    integer(face.v_rational);
    report_bounds(value.bounds);
    integer(value.reversed);
    integer(value.edge_count);
  };
  integer(report.shape.valid);
  report_bounds(report.shape.bounds);
  real(report.shape.volume);
  real(report.shape.surface_area);
  for (double number : report.shape.center_of_mass) real(number);
  integer(report.shape.compounds);
  integer(report.shape.solids);
  integer(report.shape.shells);
  integer(report.shape.faces);
  integer(report.shape.wires);
  integer(report.shape.edges);
  integer(report.shape.vertices);
  integer(report.occurrences.size());
  for (const auto& occurrence : report.occurrences) {
    for (double number : occurrence.placement) real(number);
    report_bounds(occurrence.bounds);
    integer(occurrence.parent);
    integer(occurrence.product);
    integer(occurrence.ordinal_count);
  }
  integer(report.whole_faces.size());
  for (const auto& face : report.whole_faces) report_face(face);
  integer(report.occurrence_faces.size());
  for (const auto& row : report.occurrence_faces) {
    integer(row.size());
    for (const auto& face : row) report_face(face);
  }
  integer(report.mesh.positions.size());
  for (const auto& position : report.mesh.positions)
    for (double number : position) real(number);
  integer(report.mesh.triangles.size());
  for (const auto& triangle : report.mesh.triangles)
    for (uint32_t index : triangle) integer(index);
  return words;
}

size_t differing_words(const std::vector<uint64_t>& a,
                       const std::vector<uint64_t>& b, size_t count) {
  size_t different = a.size() == b.size() ? 0 : 1;
  for (size_t i = 0; i < std::min({a.size(), b.size(), count}); ++i)
    if (a[i] != b[i]) ++different;
  return different;
}

void compare_profiles(const char* label, const ReportData& report,
                      const ReportData& old) {
  const auto current_words = report_words(report);
  const auto old_words = report_words(old);
  const size_t all_differences =
      differing_words(current_words, old_words, current_words.size());
  // The first 19 words are validity, bounds, volume, area, center and counts.
  const size_t shape_differences = differing_words(current_words, old_words, 19);
  size_t coordinate_differences = 0;
  if (report.mesh.positions.size() == old.mesh.positions.size()) {
    for (size_t i = 0; i < report.mesh.positions.size(); ++i)
      for (size_t axis = 0; axis < 3; ++axis)
        if (float_bits(report.mesh.positions[i][axis]) !=
            float_bits(old.mesh.positions[i][axis])) ++coordinate_differences;
  }
  std::cout << "{\"case\":\"" << label << "\",\"reportWordDiffs\":"
            << all_differences << ",\"shapeWordDiffs\":" << shape_differences
            << ",\"soupCoordinateDiffs\":" << coordinate_differences
            << ",\"soupTriangleOrderEqual\":"
            << (report.mesh.triangles == old.mesh.triangles ? "true" : "false")
            << ",\"volumeBits\":\"" << std::hex << float_bits(report.shape.volume)
            << "\",\"oldVolumeBits\":\"" << float_bits(old.shape.volume)
            << "\",\"centerBits\":[\"" << float_bits(report.shape.center_of_mass[0])
            << "\",\"" << float_bits(report.shape.center_of_mass[1])
            << "\",\"" << float_bits(report.shape.center_of_mass[2])
            << "\"],\"oldCenterBits\":[\"" << float_bits(old.shape.center_of_mass[0])
            << "\",\"" << float_bits(old.shape.center_of_mass[1])
            << "\",\"" << float_bits(old.shape.center_of_mass[2])
            << "\"],\"boundsBits\":[";
  for (size_t axis = 0; axis < 6; ++axis) {
    if (axis != 0) std::cout << ',';
    const double value = axis < 3 ? report.shape.bounds.min[axis]
                                   : report.shape.bounds.max[axis - 3];
    std::cout << '"' << float_bits(value) << '"';
  }
  std::cout << "],\"oldBoundsBits\":[";
  for (size_t axis = 0; axis < 6; ++axis) {
    if (axis != 0) std::cout << ',';
    const double value = axis < 3 ? old.shape.bounds.min[axis]
                                   : old.shape.bounds.max[axis - 3];
    std::cout << '"' << float_bits(value) << '"';
  }
  std::cout << "]}" << std::dec << '\n';
}

void check_box_soup(const TopoDS_Shape& source, const MeshData& mesh) {
  std::vector<TopoDS_Shape> solids;
  collect_solids(source, solids);
  std::vector<gp_Pnt> corners;
  for (const TopoDS_Shape& solid : solids) {
    const gp_Trsf transform = solid.Location().Transformation();
    for (double x : {0.0, 1.0})
      for (double y : {0.0, 2.0})
        for (double z : {0.0, 3.0})
          corners.push_back(gp_Pnt(x, y, z).Transformed(transform));
  }
  for (const auto& position : mesh.positions) {
    const gp_Pnt vertex(position[0], position[1], position[2]);
    bool matched = false;
    for (const gp_Pnt& corner : corners)
      if (vertex.Distance(corner) < 1e-5) matched = true;
    check(matched, "transformed soup vertex misses analytic box corner");
  }
  check(mesh.triangles.size() == 12 * solids.size(),
        "transformed box triangle count changed");
}

void qualify_transform(const char* label, const TopoDS_Shape& source,
                       bool check_mass) {
  check(prototype_copy_eligible(source), "transformed tree rejected by gate");
  const std::string before = brep_bytes(source);
  auto document = document_for(source);
  PrototypeReportCopy prototype;
  check(prototype.build(source), "transformed prototype history failed");
  for (const FaceView& face : document.public_faces) {
    const TopoDS_Shape mapped = prototype.mapped(face.shape);
    check(!mapped.IsNull() && mapped.Orientation() == face.shape.Orientation(),
          "transformed public face orientation/history lost");
  }
  ReportData report;
  std::string message;
  check(build_report(document, report, message), "transformed report failed");
  ReportData repeated;
  check(build_report(document, repeated, message), "transformed repeat failed");
  check(report_words(report) == report_words(repeated),
        "transformed same-profile report bytes changed");
  ReportData old = whole_copy_report(document);
  compare_profiles(label, report, old);
  check(report.shape.valid == 1, "transformed BRep validity changed");
  check(std::abs(report.shape.surface_area - 44.0) < 1e-8,
        "transformed analytic area incorrect");
  if (check_mass) {
    check(std::abs(report.shape.volume - 12.0) < 1e-8,
          "transformed analytic volume incorrect");
    std::vector<TopoDS_Shape> solids;
    collect_solids(source, solids);
    gp_Pnt expected_center;
    double center[3]{};
    for (const TopoDS_Shape& solid : solids) {
      expected_center = gp_Pnt(0.5, 1.0, 1.5).Transformed(
          solid.Location().Transformation());
      center[0] += expected_center.X() / solids.size();
      center[1] += expected_center.Y() / solids.size();
      center[2] += expected_center.Z() / solids.size();
    }
    for (size_t axis = 0; axis < 3; ++axis)
      check(std::abs(report.shape.center_of_mass[axis] - center[axis]) < 1e-8,
            "transformed analytic centroid incorrect");
  }
  check_box_soup(source, report.mesh);
  std::vector<TopoDS_Shape> placed_solids;
  collect_solids(source, placed_solids);
  double minimum[3]{INFINITY, INFINITY, INFINITY};
  double maximum[3]{-INFINITY, -INFINITY, -INFINITY};
  for (const TopoDS_Shape& solid : placed_solids) {
    const gp_Trsf transform = solid.Location().Transformation();
    for (double x : {0.0, 1.0})
      for (double y : {0.0, 2.0})
        for (double z : {0.0, 3.0}) {
          const gp_Pnt corner = gp_Pnt(x, y, z).Transformed(transform);
          minimum[0] = std::min(minimum[0], corner.X());
          minimum[1] = std::min(minimum[1], corner.Y());
          minimum[2] = std::min(minimum[2], corner.Z());
          maximum[0] = std::max(maximum[0], corner.X());
          maximum[1] = std::max(maximum[1], corner.Y());
          maximum[2] = std::max(maximum[2], corner.Z());
        }
  }
  for (size_t axis = 0; axis < 3; ++axis) {
    check(std::abs(report.shape.bounds.min[axis] - minimum[axis]) < 1e-5 &&
              std::abs(report.shape.bounds.max[axis] - maximum[axis]) < 1e-5,
          "transformed analytic bounding box incorrect");
  }
  check(before == brep_bytes(source), "transformed source mutated");
}

void qualify_actual4096(const char* input) {
  std::ifstream stream(input, std::ios::binary);
  check(bool(stream), "actual4096 STEP unavailable");
  const std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(stream)), {});
  geospec_occt_document* raw = nullptr;
  geospec_occt_string error{};
  check(geospec_occt_open_step(bytes.data(), bytes.size(), &raw, &error) == GEOSPEC_OCCT_OK,
        "actual4096 STEP admission failed");
  std::unique_ptr<geospec_occt_document, decltype(&geospec_occt_release)> document(
      raw, geospec_occt_release);
  check(prototype_copy_eligible(document->shape), "actual4096 gate rejected input");
  const std::string before = brep_bytes(document->shape);
  PrototypeReportCopy prototype;
  check(prototype.build(document->shape), "actual4096 history failed");
  check(prototype.definitions.Extent() == 1, "actual4096 definition count changed");
  for (const OccurrenceFacts& occurrence : document->occurrences) {
    check(!prototype.mapped(occurrence.shape).IsNull(), "actual4096 occurrence mapping absent");
    for (const FaceView& face : occurrence.public_faces)
      check(!prototype.mapped(face.shape).IsNull(), "actual4096 occurrence face absent");
  }
  for (const FaceView& face : document->public_faces)
    check(!prototype.mapped(face.shape).IsNull(), "actual4096 whole face absent");
  ReportData report;
  std::string message;
  check(build_report(*document, report, message), "actual4096 production report failed");
  check(report.shape.valid == 1 && report.shape.solids == 4096 &&
            report.shape.faces == 24576 && report.occurrences.size() == 4096,
        "actual4096 structure/validity changed");
  check(std::abs(report.shape.volume - 4096.0) < 1e-8 &&
            std::abs(report.shape.center_of_mass[0] - 63.5) < 1e-8 &&
            std::abs(report.shape.center_of_mass[1] - 63.5) < 1e-8,
        "actual4096 independent mass expectation failed");
  check(report.mesh.triangles.size() == 49152 &&
            report.mesh.positions.size() == 147456,
        "actual4096 soup extent changed");
  ReportData repeated;
  check(build_report(*document, repeated, message), "actual4096 repeat failed");
  check(report_words(report) == report_words(repeated),
        "actual4096 same-profile scalar bytes changed");
  ReportData old = whole_copy_report(*document);
  compare_profiles("actual4096", report, old);
  check(before == brep_bytes(document->shape), "actual4096 original mutated");
}

void qualify(const TopoDS_Shape& source, double expected_volume,
             double expected_area, std::array<double, 3> expected_center,
             size_t expected_solids, size_t expected_faces,
             size_t expected_definitions) {
  check(prototype_copy_eligible(source), "eligible tree rejected");
  const std::string before = brep_bytes(source);
  auto document = document_for(source);
  PrototypeReportCopy prototype;
  check(prototype.build(source), "prototype history failed");
  check(static_cast<size_t>(prototype.definitions.Extent()) == expected_definitions,
        "distinct definition count changed");
  check(prototype.history.Extent() != 0, "source history empty");
  for (const FaceView& face : document.public_faces)
    check(!prototype.mapped(face.shape).IsNull(), "whole-face history missing");
  for (const OccurrenceFacts& occurrence : document.occurrences) {
    check(!prototype.mapped(occurrence.shape).IsNull(), "occurrence history missing");
    for (const FaceView& face : occurrence.public_faces)
      check(!prototype.mapped(face.shape).IsNull(), "occurrence-face history missing");
  }

  ReportData report;
  std::string message;
  check(build_report(document, report, message), "report failed");
  check(report.shape.valid == 1, "reported BRep invalid");
  check(report.shape.solids == expected_solids, "reported solid count changed");
  check(std::abs(report.shape.volume - expected_volume) < 1e-8,
        "analytic volume incorrect");
  check(std::abs(report.shape.surface_area - expected_area) < 1e-8,
        "analytic surface area incorrect");
  check(report.shape.faces == expected_faces, "reported face count changed");
  for (size_t axis = 0; axis < 3; ++axis)
    check(std::abs(report.shape.center_of_mass[axis] - expected_center[axis]) < 1e-8,
          "analytic centroid incorrect");
  check(report.occurrences.size() == expected_solids, "occurrence count changed");
  check(report.occurrence_faces.size() == expected_solids,
        "occurrence-face row count changed");
  check(report.whole_faces.size() == document.public_faces.size(),
        "whole-face count changed");
  for (size_t i = 0; i < document.occurrences.size(); ++i) {
    check(report.occurrence_faces[i].size() ==
              document.occurrences[i].public_faces.size(),
          "occurrence-face count changed");
    const auto expected = bounds(document.occurrences[i].shape);
    for (size_t axis = 0; axis < 3; ++axis)
      check(std::abs(report.occurrences[i].bounds.min[axis] - expected.min[axis]) < 1e-8 &&
                std::abs(report.occurrences[i].bounds.max[axis] - expected.max[axis]) < 1e-8,
            "occurrence bounds changed");
  }

  BRepBuilderAPI_Copy baseline(source, false, false);
  check(baseline.IsDone(), "baseline copy failed");
  const TopoDS_Shape old_copy = baseline.Shape();
  constexpr double pi = 3.141592653589793238462643383279502884;
  mesh_shape(old_copy, 0.01, 15.0 * pi / 180.0);
  check_soup_equal(report.mesh, report_triangle_soup(old_copy));
  for (size_t i = 0; i < document.public_faces.size(); ++i) {
    const FaceView& source_face = document.public_faces[i];
    TopoDS_Shape mapped = baseline.ModifiedShape(source_face.shape);
    mapped.Orientation(source_face.shape.Orientation());
    const auto old_face = reported_face(TopoDS::Face(mapped),
                                        static_cast<uint32_t>(i),
                                        source_face.query_index, 0);
    const auto& new_face = report.whole_faces[i];
    check(old_face.face.surface_type == new_face.face.surface_type &&
              float_bits(old_face.face.area) == float_bits(new_face.face.area),
          "whole-face analytic facts changed");
  }
  check(before == brep_bytes(source), "source BRep or triangulation mutated");
  ReportData repeated;
  check(build_report(document, repeated, message), "repeat report failed");
  check(report_words(report) == report_words(repeated),
        "same-profile report scalar bytes changed");
  check(before == brep_bytes(source), "repeat report mutated source");
}

int main(int argc, char** argv) {
  try {
    constexpr double pi = 3.14159265358979323846;
    const TopoDS_Shape box = BRepPrimAPI_MakeBox(1, 2, 3).Solid();
    const TopoDS_Shape cylinder = BRepPrimAPI_MakeCylinder(1, 2).Solid();
    qualify(compound({place(box, 0, 0, 0), place(box, 5, 0, 0)}),
            12.0, 44.0, {3.0, 1.0, 1.5}, 2, 12, 1);
    const TopoDS_Shape nested = place(
        compound({box, rotated(box, 5, 0)}), 10, 0, 0);
    qualify(compound({nested, place(cylinder, -10, 0, 0)}),
            12.0 + 2.0 * pi, 44.0 + 6.0 * pi,
            {(6.0 * 10.5 + 6.0 * 14.0 - 20.0 * pi) / (12.0 + 2.0 * pi),
             (6.0 * 1.0 + 6.0 * 0.5) / (12.0 + 2.0 * pi),
             (12.0 * 1.5 + 2.0 * pi) / (12.0 + 2.0 * pi)},
            3, 15, 2);
    qualify(compound({box, place(cylinder, 10, 0, 0)}),
            6.0 + 2.0 * pi, 22.0 + 6.0 * pi,
            {(6.0 * 0.5 + 20.0 * pi) / (6.0 + 2.0 * pi),
             6.0 / (6.0 + 2.0 * pi),
             (6.0 * 1.5 + 2.0 * pi) / (6.0 + 2.0 * pi)},
            2, 9, 2);

    check(!prototype_copy_eligible(box), "single solid should use general copy");
    auto single = document_for(box);
    ReportData general_report;
    std::string message;
    check(build_report(single, general_report, message) &&
              std::abs(general_report.shape.volume - 6.0) < 1e-8,
          "general report path changed");

    // Two distinct solids with the same shell are disjoint in placement but
    // share an unlocated descendant. The prototype path must reject them.
    TopoDS_Shape shell;
    for (TopoDS_Iterator child(box, true, true); child.More(); child.Next()) {
      if (child.Value().ShapeType() == TopAbs_SHELL) shell = child.Value();
    }
    check(!shell.IsNull(), "box shell missing");
    BRep_Builder builder;
    TopoDS_Solid other;
    builder.MakeSolid(other);
    builder.Add(other, shell);
    check(!other.IsPartner(box), "distinct solid setup failed");
    const TopoDS_Shape shared_descendant =
        compound({box, place(other, 10, 0, 0)});
    std::vector<TopoDS_Shape> shared_solids;
    check(collect_validation_solids(shared_descendant, shared_solids) &&
              disjoint_validation_solids(shared_solids),
          "shared-descendant setup did not pass placed-disjoint gate");
    check(!prototype_copy_eligible(shared_descendant),
          "cross-definition shared descendant admitted");
    check(!prototype_copy_eligible(compound({box, box})),
          "same placed descendant admitted");
    check(!prototype_copy_eligible(compound({box, shell})),
          "unsupported tree node admitted");

    gp_Trsf angled;
    angled.SetRotation(gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), pi / 7.0);
    angled.SetTranslationPart(gp_Vec(5, 1, 0));
    qualify_transform("nested-pi-over-seven",
                      place(compound({box, box.Located(TopLoc_Location(angled))}),
                            10, 3, 0), true);

    gp_Trsf mirror;
    mirror.SetMirror(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(1, 0, 0)));
    mirror.SetTranslationPart(gp_Vec(10, 0, 0));
    qualify_transform("mirror", compound({box, box.Located(TopLoc_Location(mirror))}),
                      false);
    qualify_transform("reversed-solid",
                      compound({box, place(box.Oriented(TopAbs_REVERSED), 10, 0, 0)}),
                      false);
    if (argc == 2) qualify_actual4096(argv[1]);
    else check(argc == 1, "expected optional actual4096 STEP path");
    std::cout << "prototype qualification passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
