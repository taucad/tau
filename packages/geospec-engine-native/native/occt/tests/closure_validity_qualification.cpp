// Synthetic controls for the V1 shell-closure facet and V3 per-definition
// validity. STEP carries none of them (its writer refuses INTERNAL uses), so
// they are built in OCCT. Compile this translation unit with the pinned OCCT
// static closure, as for prototype_qualification.cpp; it exits non-zero on
// the first failed check and prints one line per passed control.
#include "../bridge/geospec_occt_bridge.cpp"

#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepPrimAPI_MakeBox.hxx>

#include <cstdio>
#include <cstdlib>
#include <initializer_list>

namespace {

void check(bool condition, const char* message) {
  if (!condition) {
    std::fprintf(stderr, "FAILED: %s\n", message);
    std::exit(1);
  }
}

TopoDS_Compound compound(std::initializer_list<TopoDS_Shape> children) {
  BRep_Builder builder;
  TopoDS_Compound result;
  builder.MakeCompound(result);
  for (const TopoDS_Shape& child : children) builder.Add(result, child);
  return result;
}

TopoDS_Shape place(const TopoDS_Shape& shape, double x) {
  gp_Trsf transform;
  transform.SetTranslation(gp_Vec(x, 0, 0));
  return shape.Located(TopLoc_Location(transform));
}

std::vector<TopoDS_Face> box_faces() {
  std::vector<TopoDS_Face> faces;
  for (TopExp_Explorer face(BRepPrimAPI_MakeBox(1, 2, 3).Shell(), TopAbs_FACE);
       face.More(); face.Next()) {
    faces.push_back(TopoDS::Face(face.Current()));
  }
  return faces;
}

TopoDS_Shell shell_of(const std::vector<TopoDS_Face>& faces) {
  BRep_Builder builder;
  TopoDS_Shell shell;
  builder.MakeShell(shell);
  for (const TopoDS_Face& face : faces) builder.Add(shell, face);
  return shell;
}

// A document whose leaf occurrences are `leaves`, as admission places them.
geospec_occt_document document_for(const TopoDS_Shape& shape,
                                   std::initializer_list<TopoDS_Shape> leaves = {}) {
  geospec_occt_document document;
  document.shape = shape;
  for (const TopoDS_Shape& leaf : leaves) {
    OccurrenceFacts occurrence;
    occurrence.shape = leaf;
    document.occurrences.push_back(std::move(occurrence));
  }
  return document;
}

// The public closure FFI, as the Rust connector reads it.
geospec_occt_closure_facts closure_of(const geospec_occt_document& document) {
  geospec_occt_closure_facts facts{};
  check(geospec_occt_validity_closure(&document, &facts, nullptr) == GEOSPEC_OCCT_OK,
        "closure facet call failed");
  return facts;
}

geospec_occt_closure_group group_of(const geospec_occt_document& document,
                                    size_t index, std::vector<uint32_t>& occurrences) {
  geospec_occt_closure_group group{};
  occurrences.assign(document.occurrences.size(), 0);
  check(geospec_occt_validity_closure_group(&document, index, &group,
                                            occurrences.data(), occurrences.size(),
                                            nullptr) == GEOSPEC_OCCT_OK,
        "closure group call failed");
  occurrences.resize(group.occurrence_count);
  return group;
}

void internal_edge_is_skipped() {
  // A closed box whose first face also carries an INTERNAL edge in its own
  // wire: counted, that single use would open the shell.
  std::vector<TopoDS_Face> faces = box_faces();
  BRep_Builder builder;
  TopoDS_Face with_internal = TopoDS::Face(faces[0].EmptyCopied());
  for (TopoDS_Iterator wire(faces[0], false, false); wire.More(); wire.Next()) {
    builder.Add(with_internal, wire.Value());
  }
  TopoDS_Wire internal;
  builder.MakeWire(internal);
  builder.Add(internal, BRepBuilderAPI_MakeEdge(gp_Pnt(0, 0.5, 1), gp_Pnt(0, 1.5, 2))
                            .Edge()
                            .Oriented(TopAbs_INTERNAL));
  builder.Add(with_internal, internal);
  faces[0] = with_internal;
  const TopoDS_Shell shell = shell_of(faces);
  uint32_t internal_uses = 0;
  for (TopExp_Explorer edge(shell, TopAbs_EDGE); edge.More(); edge.Next()) {
    if (edge.Current().Orientation() == TopAbs_INTERNAL) ++internal_uses;
  }
  check(internal_uses == 1, "the control must carry one INTERNAL edge use");
  const geospec_occt_document document = document_for(shell);
  const geospec_occt_closure_facts facts = closure_of(document);
  check(facts.shell_count == 1 && facts.open_edge_count == 0 &&
            facts.nonmanifold_edge_count == 0 && facts.failing_group_count == 0,
        "an INTERNAL edge use must not open or over-share the shell");
  std::string reason;
  const geospec_occt_validity_facts validity = compute_validity(document, reason);
  check(validity.free_bounds == 0 && validity.closed_shells == 1,
        "validity must read the facet for an INTERNAL edge");
  std::puts("internal-edge: closed, 1 INTERNAL use skipped");
}

void face_used_twice_counts_every_use() {
  // A closed box listing its first face twice: that face's four edges have
  // three uses, odd and non-manifold at once.
  std::vector<TopoDS_Face> faces = box_faces();
  faces.push_back(faces[0]);
  const geospec_occt_document document = document_for(shell_of(faces));
  const geospec_occt_closure_facts facts = closure_of(document);
  check(facts.open_edge_count == 4 && facts.nonmanifold_edge_count == 4 &&
            facts.failing_group_count == 1,
        "a face used twice must make its four edges open and non-manifold");
  std::vector<uint32_t> occurrences;
  const geospec_occt_closure_group group = group_of(document, 0, occurrences);
  check(!group.free_faces && group.sample_count == 4, "four samples of the shell");
  for (uint32_t sample = 0; sample < group.sample_count; ++sample) {
    check(group.samples[sample].face_uses == 3, "each sample edge has three face uses");
  }
  std::string reason;
  const geospec_occt_validity_facts validity = compute_validity(document, reason);
  check(validity.free_bounds == 4 && validity.nonmanifold_edge_count == 4 &&
            validity.closed_shells == 0 && validity.closed_solids == 0,
        "validity must report the over-used face");
  std::puts("face-used-twice: 4 open, 4 non-manifold, 3 uses each");
}

void free_faces_are_one_group() {
  // Two adjacent box faces outside any shell, beside a closed box: their
  // shared edge has two uses only when the free faces are one group.
  const std::vector<TopoDS_Face> faces = box_faces();
  TopoDS_Face first = faces[0], second;
  for (size_t index = 1; index < faces.size() && second.IsNull(); ++index) {
    for (TopExp_Explorer a(first, TopAbs_EDGE); a.More() && second.IsNull(); a.Next()) {
      for (TopExp_Explorer b(faces[index], TopAbs_EDGE); b.More(); b.Next()) {
        if (a.Current().IsSame(b.Current())) {
          second = faces[index];
          break;
        }
      }
    }
  }
  check(!second.IsNull(), "the control needs two adjacent faces");
  const TopoDS_Shape box = place(BRepPrimAPI_MakeBox(1, 2, 3).Solid(), 10);
  const TopoDS_Shape sheet = compound({first, second});
  const geospec_occt_document document =
      document_for(compound({sheet, box}), {sheet, box});
  const geospec_occt_closure_facts facts = closure_of(document);
  check(facts.shell_count == 1 && facts.free_face_count == 2 &&
            facts.open_edge_count == 6 && facts.nonmanifold_edge_count == 0 &&
            facts.failing_group_count == 1,
        "two free faces sharing an edge must be one group with six open edges");
  std::vector<uint32_t> occurrences;
  const geospec_occt_closure_group group = group_of(document, 0, occurrences);
  check(group.free_faces == 1 && group.open_edge_count == 6 &&
            occurrences == std::vector<uint32_t>{0},
        "the free-face group names the occurrence that holds it");
  std::puts("free-faces: one group, 6 open edges, occurrence 0");
}

void instanced_open_shell_counts_once() {
  // An open box shell (five faces) placed twice as two leaf occurrences.
  std::vector<TopoDS_Face> faces = box_faces();
  faces.pop_back();
  const TopoDS_Shell open = shell_of(faces);
  const TopoDS_Shape first = place(open, 0), second = place(open, 10);
  const geospec_occt_document document =
      document_for(compound({first, second}), {first, second});
  const geospec_occt_closure_facts facts = closure_of(document);
  check(facts.shell_count == 1 && facts.open_edge_count == 4 &&
            facts.failing_group_count == 1,
        "an instanced open shell is one definition with four open edges");
  std::vector<uint32_t> occurrences;
  const geospec_occt_closure_group group = group_of(document, 0, occurrences);
  check(!group.free_faces && group.open_edge_count == 4 &&
            occurrences == std::vector<uint32_t>{0, 1},
        "the failing shell names both occurrences");
  for (uint32_t sample = 0; sample < group.sample_count; ++sample) {
    const double* center = group.samples[sample].center;
    check(center[0] >= -1e-9 && center[0] <= 1 + 1e-9,
          "samples are placed at the first instance");
  }
  std::string reason;
  const geospec_occt_validity_facts validity = compute_validity(document, reason);
  check(validity.free_bounds == 4 && validity.closed_shells == 0,
        "validity counts the definition once");
  std::puts("instanced-open-shell: 4 open edges once, occurrences 0 and 1");
}

void scale_two_falls_through() {
  // R5's control: a definition-valid box placed rigidly and at scale two.
  const TopoDS_Shape box = BRepPrimAPI_MakeBox(1, 2, 3).Solid();
  gp_Trsf scale;
  scale.SetScale(gp_Pnt(0, 0, 0), 2.0);
  scale.SetTranslationPart(gp_Vec(10, 0, 0));
  const TopoDS_Shape scaled = compound({box, box.Located(TopLoc_Location(scale))});
  std::vector<TopoDS_Shape> solids;
  check(collect_validation_solids(scaled, solids) && solids.size() == 2 &&
            disjoint_validation_solids(solids),
        "the scale-two control reaches the leaf branch");
  check(!rigid_placements(solids), "a scale-two placement is not rigid");
  check(BRepCheck_Analyzer(box, true, false, false).IsValid(),
        "the definition itself is valid, so only the fall-through can refuse it");
  bool located = true;
  for (const TopoDS_Shape& solid : solids) {
    located = located && BRepCheck_Analyzer(solid, true, false, false).IsValid();
  }
  const SourceValidity source = shape_is_valid(scaled);
  const bool whole = BRepCheck_Analyzer(scaled, true, false, false).IsValid();
  check(source.valid == (located || whole),
        "the scale-two verdict is the located loop's, not the definition's");

  // Three rigid instances of one definition answer from one analysis.
  const TopoDS_Shape rigid = compound({place(box, 0), place(box, 5), place(box, 10)});
  solids.clear();
  check(collect_validation_solids(rigid, solids) && rigid_placements(solids),
        "translated instances are rigid");
  check(shape_is_valid(rigid).valid, "rigid instances of a valid definition are valid");
  std::printf("scale-two: falls through (valid=%d); rigid: valid\n", source.valid ? 1 : 0);
}

}  // namespace

int main() {
  try {
    internal_edge_is_skipped();
    face_used_twice_counts_every_use();
    free_faces_are_one_group();
    instanced_open_shell_counts_once();
    scale_two_falls_through();
  } catch (const std::exception& error) {
    std::fprintf(stderr, "FAILED: %s\n", error.what());
    return 1;
  }
  return 0;
}
