// Synthetic OCCT controls for the bridge: shapes STEP cannot carry (INTERNAL
// edge uses, instance scales, faces without edges), built here and run
// against the bridge's own functions. The `qualification` feature compiles
// the bridge through this translation unit, and tests/qualification.rs runs
// each control by name.
#include "../bridge/geospec_occt_bridge.cpp"

#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepPrimAPI_MakeBox.hxx>

#include <cstdio>
#include <cstring>
#include <initializer_list>
#include <stdexcept>

namespace {

void check(bool condition, const std::string& message) {
  if (!condition) throw std::runtime_error(message);
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

// A document whose occurrences are `leaves`, as admission places them.
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

bool analyzer_valid(const TopoDS_Shape& shape) {
  return BRepCheck_Analyzer(shape, true, false, false).IsValid();
}

// V1: an INTERNAL edge use is skipped.
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
}

// V1: every use of a face counts.
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
}

// V1: the faces outside any shell are one group.
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
}

// V1: an instanced open shell is one definition.
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
}

// V1: one pass names each failing group's leaves.
void attribution_names_each_leaf_once() {
  // An open shell and a face-used-twice shell, placed under a parent
  // occurrence: leaf 1 holds the open shell twice, leaf 2 holds it once and
  // the other shell once. Each group names its leaves in ordinal order, a
  // leaf once however many instances it holds, and never the parent.
  std::vector<TopoDS_Face> faces = box_faces();
  std::vector<TopoDS_Face> overused = faces;
  overused.push_back(faces[0]);
  faces.pop_back();
  const TopoDS_Shell open = shell_of(faces), twice = shell_of(overused);
  const TopoDS_Shape pair = compound({place(open, 0), place(open, 10)});
  const TopoDS_Shape mixed = compound({place(open, 20), place(twice, 30)});
  const TopoDS_Shape root = compound({pair, mixed});
  geospec_occt_document document = document_for(root, {root, pair, mixed});
  document.occurrences[1].parent = 0;
  document.occurrences[2].parent = 0;
  const geospec_occt_closure_facts facts = closure_of(document);
  check(facts.shell_count == 2 && facts.failing_group_count == 2,
        "two failing shell definitions");
  std::vector<uint32_t> occurrences;
  check(group_of(document, 0, occurrences).open_edge_count == 4 &&
            occurrences == std::vector<uint32_t>{1, 2},
        "the open shell names leaves 1 and 2 once each");
  check(group_of(document, 1, occurrences).nonmanifold_edge_count == 4 &&
            occurrences == std::vector<uint32_t>{2},
        "the over-used shell names leaf 2 only");
  std::vector<uint32_t> short_buffer(1, 0);
  geospec_occt_closure_group group{};
  check(geospec_occt_validity_closure_group(&document, 0, &group, short_buffer.data(),
                                            short_buffer.size(), nullptr) ==
            GEOSPEC_OCCT_INVALID_ARGUMENT,
        "a buffer shorter than the group's leaves is refused");
}

// V1: a group with no counted edge use, or a shape with no face, proves
// nothing closed.
void edgeless_and_faceless_prove_nothing_closed() {
  // An unbounded plane face has no wire, as a surfaceless face has none.
  const TopoDS_Face face = BRepBuilderAPI_MakeFace(gp_Pln()).Face();
  check(!TopExp_Explorer(face, TopAbs_EDGE).More(), "the control face has no edge");
  const TopoDS_Shell shell = shell_of({face});
  const geospec_occt_document document = document_for(shell, {shell});
  const geospec_occt_closure_facts facts = closure_of(document);
  check(facts.shell_count == 1 && facts.open_edge_count == 0 &&
            facts.nonmanifold_edge_count == 0 && facts.failing_group_count == 1,
        "an edgeless shell fails with no open or non-manifold edge");
  std::vector<uint32_t> occurrences;
  const geospec_occt_closure_group group = group_of(document, 0, occurrences);
  check(!group.free_faces && group.sample_count == 0 &&
            occurrences == std::vector<uint32_t>{0},
        "the edgeless shell names its occurrence, with no sample");
  std::string reason;
  check(compute_validity(document, reason).closed_shells == 0,
        "validity never calls an edgeless shell closed");
  const geospec_occt_document free_face = document_for(compound({face}));
  const geospec_occt_closure_facts free_facts = closure_of(free_face);
  check(free_facts.free_face_count == 1 && free_facts.failing_group_count == 1,
        "an edgeless free face fails as the free-face group");
  const geospec_occt_closure_facts none = closure_of(document_for(compound({})));
  check(none.shell_count == 0 && none.free_face_count == 0 &&
            none.failing_group_count == 0,
        "a shape with no face has no closure group; the claim fails it");
}

// V3: a scaled placement falls through to the located analyses.
void scale_two_falls_through() {
  // A definition-valid box placed rigidly and at scale two.
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
  check(analyzer_valid(box),
        "the definition itself is valid, so only the fall-through can refuse it");
  bool located = true;
  for (const TopoDS_Shape& solid : solids) located = located && analyzer_valid(solid);
  check(shape_is_valid(scaled).valid == (located || analyzer_valid(scaled)),
        "the scale-two verdict is the located loop's, not the definition's");
}

// V3: rigid instances of one definition answer from one analysis.
void rigid_instances_answer_from_one_analysis() {
  const TopoDS_Shape box = BRepPrimAPI_MakeBox(1, 2, 3).Solid();
  const TopoDS_Shape rigid = compound({place(box, 0), place(box, 5), place(box, 10)});
  std::vector<TopoDS_Shape> solids;
  check(collect_validation_solids(rigid, solids) && rigid_placements(solids),
        "translated instances are rigid");
  uint32_t analyses = 0;
  check(shape_is_valid(rigid, &analyses).valid && analyses == 1,
        "three rigid instances of one valid definition answer from one analysis");
}

// S4: the continuous-wall path judges its outer shell by computed edge-use
// parity, never by the stored Closed() flag a healer may write. A box whose
// shell stores Closed()=false still closes by parity; before this gate W2B
// refused it with "Continuous wall requires one closed outer shell without
// cavities." (M0, before S4: "A regular-solid shape contains an open shell.").
std::string wall_domain(bool stored_closed) {
  const TopoDS_Shape box = BRepPrimAPI_MakeBox(10.0, 20.0, 30.0).Shape();
  TopExp_Explorer explorer(box, TopAbs_SHELL);
  TopoDS_Shape shell = explorer.Current();
  shell.Closed(stored_closed);  // on the TShape the solid shares
  check(BRep_Tool::IsClosed(shell), "the box shell closes by edge-use parity");
  geospec_occt_continuous_wall_domain domain;
  std::memset(&domain, 0, sizeof domain);  // padding compares too
  ShapeIndex faces, edges;
  std::string message;
  check(classify_continuous_wall(box, domain, faces, edges, message), message);
  return std::string(reinterpret_cast<const char*>(&domain), sizeof domain);
}

void wall_closure_ignores_the_stored_flag() {
  check(wall_domain(false) == wall_domain(true),
        "the stored Closed() flag moves no continuous-wall byte");
}

// The admission product index and the ordered owner joins.
void product_owner_joins() {
  const std::vector<ProductFacts> products = {
      {"0:1", "first"}, {"0:2", "second"}, {"0:1", "duplicate"}};
  const auto indices = index_products(products);
  check(product_index(indices, "0:1") == 0 && product_index(indices, "0:2") == 1,
        "products index by label, the first duplicate winning");
  bool refused = false;
  try {
    (void)product_index(indices, "missing");
  } catch (const Standard_Failure& failure) {
    refused = std::strcmp(failure.what(),
                          "Occurrence product is absent from product facts.") == 0;
  }
  check(refused, "a missing product fails with its message");
  std::vector<OccurrenceFacts> occurrences(5);
  occurrences[0].product = 1;
  occurrences[1].product = 0;
  occurrences[2].product = 1;
  occurrences[3].product = 1;
  occurrences[4].product = 4;  // Outside the product sequence: no owner.
  const auto owners = index_product_owners(products.size(), occurrences);
  check(owners[0] == std::vector<int>{1} && owners[1] == std::vector<int>{0, 2, 3} &&
            owners[2].empty(),
        "owners join in occurrence order, and an outside product owns nothing");
}

// The report prototype copy: only a compound of located-disjoint leaves
// whose definitions share no descendant is eligible.
void prototype_copy_eligibility() {
  const TopoDS_Shape box = BRepPrimAPI_MakeBox(1, 2, 3).Solid();
  check(prototype_copy_eligible(compound({place(box, 0), place(box, 5)})),
        "two placed instances of one solid are eligible");
  check(!prototype_copy_eligible(box), "a single solid takes the general copy");
  // Two distinct solids on one shell: disjoint placements, one shared
  // unlocated descendant.
  TopoDS_Shape shell;
  for (TopoDS_Iterator child(box, true, true); child.More(); child.Next()) {
    if (child.Value().ShapeType() == TopAbs_SHELL) shell = child.Value();
  }
  BRep_Builder builder;
  TopoDS_Solid other;
  builder.MakeSolid(other);
  builder.Add(other, shell);
  const TopoDS_Shape shared = compound({box, place(other, 10)});
  std::vector<TopoDS_Shape> solids;
  check(collect_validation_solids(shared, solids) && disjoint_validation_solids(solids),
        "the shared-descendant control passes the placement gate");
  check(!prototype_copy_eligible(shared), "definitions sharing a descendant are refused");
  check(!prototype_copy_eligible(compound({box, box})), "one placed leaf twice is refused");
  check(!prototype_copy_eligible(compound({box, shell})),
        "a leaf inside another leaf is refused");
}

struct Control {
  const char* name;
  void (*run)();
};

constexpr Control kControls[] = {
    {"internal-edge-is-skipped", internal_edge_is_skipped},
    {"face-used-twice-counts-every-use", face_used_twice_counts_every_use},
    {"free-faces-are-one-group", free_faces_are_one_group},
    {"instanced-open-shell-counts-once", instanced_open_shell_counts_once},
    {"attribution-names-each-leaf-once", attribution_names_each_leaf_once},
    {"edgeless-and-faceless-prove-nothing-closed",
     edgeless_and_faceless_prove_nothing_closed},
    {"scale-two-falls-through", scale_two_falls_through},
    {"rigid-instances-answer-from-one-analysis", rigid_instances_answer_from_one_analysis},
    {"wall-closure-ignores-the-stored-flag", wall_closure_ignores_the_stored_flag},
    {"product-owner-joins", product_owner_joins},
    {"prototype-copy-eligibility", prototype_copy_eligibility},
};

}  // namespace

// Runs control `name`: 0 when it holds, 1 with the failed check in `message`,
// 2 for an unknown name.
extern "C" int geospec_occt_qualify(const char* name, char* message,
                                    size_t capacity) noexcept {
  const auto report = [&](const char* text) {
    if (capacity != 0) std::snprintf(message, capacity, "%s", text);
  };
  for (const Control& control : kControls) {
    if (std::strcmp(control.name, name) != 0) continue;
    try {
      control.run();
      return 0;
    } catch (const Standard_Failure& failure) {
      report(failure.what());
    } catch (const std::exception& error) {
      report(error.what());
    }
    return 1;
  }
  report("unknown qualification control");
  return 2;
}
