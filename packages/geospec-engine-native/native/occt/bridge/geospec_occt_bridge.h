#ifndef GEOSPEC_OCCT_BRIDGE_H
#define GEOSPEC_OCCT_BRIDGE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
#define GEOSPEC_OCCT_NOEXCEPT noexcept
extern "C" {
#else
#define GEOSPEC_OCCT_NOEXCEPT
#endif

typedef struct geospec_occt_document geospec_occt_document;

enum geospec_occt_status {
  GEOSPEC_OCCT_OK = 0,
  GEOSPEC_OCCT_INVALID_ARGUMENT = 1,
  GEOSPEC_OCCT_READ_FAILED = 2,
  GEOSPEC_OCCT_TRANSFER_FAILED = 3,
  GEOSPEC_OCCT_NO_SHAPE = 4,
  GEOSPEC_OCCT_NATIVE_ERROR = 5,
  GEOSPEC_OCCT_BUFFER_TOO_SMALL = 6,
  GEOSPEC_OCCT_UNSUPPORTED = 7
};

enum geospec_occt_surface_type {
  GEOSPEC_OCCT_SURFACE_PLANE = 0,
  GEOSPEC_OCCT_SURFACE_CYLINDER = 1,
  GEOSPEC_OCCT_SURFACE_CONE = 2,
  GEOSPEC_OCCT_SURFACE_SPHERE = 3,
  GEOSPEC_OCCT_SURFACE_TORUS = 4,
  GEOSPEC_OCCT_SURFACE_BEZIER = 5,
  GEOSPEC_OCCT_SURFACE_BSPLINE = 6,
  GEOSPEC_OCCT_SURFACE_REVOLUTION = 7,
  GEOSPEC_OCCT_SURFACE_EXTRUSION = 8,
  GEOSPEC_OCCT_SURFACE_OFFSET = 9,
  GEOSPEC_OCCT_SURFACE_OTHER = 10
};

enum geospec_occt_pmi_kind {
  GEOSPEC_OCCT_PMI_DIMENSION = 0,
  GEOSPEC_OCCT_PMI_GEOMETRIC_TOLERANCE = 1,
  GEOSPEC_OCCT_PMI_DATUM = 2
};

enum geospec_occt_entity_kind {
  GEOSPEC_OCCT_ENTITY_WHOLE = 0,
  GEOSPEC_OCCT_ENTITY_OCCURRENCE = 1,
  GEOSPEC_OCCT_ENTITY_FACE = 2,
  GEOSPEC_OCCT_ENTITY_WHOLE_FACE = 3
};

enum geospec_occt_curve_type {
  GEOSPEC_OCCT_CURVE_LINE = 0,
  GEOSPEC_OCCT_CURVE_CIRCLE = 1,
  GEOSPEC_OCCT_CURVE_ELLIPSE = 2,
  GEOSPEC_OCCT_CURVE_BSPLINE = 3,
  GEOSPEC_OCCT_CURVE_OTHER = 4
};

enum geospec_occt_point_state {
  GEOSPEC_OCCT_POINT_IN = 0,
  GEOSPEC_OCCT_POINT_ON = 1,
  GEOSPEC_OCCT_POINT_OUT = 2
};

enum geospec_occt_support_type {
  GEOSPEC_OCCT_SUPPORT_VERTEX = 0,
  GEOSPEC_OCCT_SUPPORT_EDGE = 1,
  GEOSPEC_OCCT_SUPPORT_FACE = 2,
  GEOSPEC_OCCT_SUPPORT_UNKNOWN = 3
};

enum geospec_occt_subshape_type {
  GEOSPEC_OCCT_SUBSHAPE_FACE = 0,
  GEOSPEC_OCCT_SUBSHAPE_EDGE = 1,
  GEOSPEC_OCCT_SUBSHAPE_VERTEX = 2,
  GEOSPEC_OCCT_SUBSHAPE_SOLID = 3
};

// Fact strings report required length. Error strings report copied length and
// preserve a NUL terminator; oversized diagnostics use a bounded prefix plus "...".
typedef struct geospec_occt_string {
  char* data;
  size_t capacity;
  size_t length;
} geospec_occt_string;

typedef struct geospec_occt_bounds {
  double min[3];
  double max[3];
} geospec_occt_bounds;

typedef struct geospec_occt_shape_facts {
  int valid;
  geospec_occt_bounds bounds;
  double volume;
  double surface_area;
  double center_of_mass[3];
  size_t compounds;
  size_t solids;
  size_t shells;
  size_t faces;
  size_t wires;
  size_t edges;
  size_t vertices;
} geospec_occt_shape_facts;

typedef struct geospec_occt_occurrence_facts {
  double placement[12];
  geospec_occt_bounds bounds;
  int64_t parent;
  uint32_t product;
  size_t ordinal_count;
} geospec_occt_occurrence_facts;

typedef struct geospec_occt_face_facts {
  uint32_t index;
  int surface_type;
  double parameter_bounds[4];
  double area;
  double center_of_mass[3];
  double origin[3];
  double direction[3];
  double radius;
  double secondary_radius;
  double semi_angle;
  uint32_t u_degree;
  uint32_t v_degree;
  uint32_t u_poles;
  uint32_t v_poles;
  uint32_t u_knots;
  uint32_t v_knots;
  int u_rational;
  int v_rational;
} geospec_occt_face_facts;

typedef struct geospec_occt_pmi_facts {
  int kind;
  size_t association_count;
} geospec_occt_pmi_facts;

typedef struct geospec_occt_subshape_facts {
  int64_t occurrence;
  int shape_type;
  uint32_t face_index;
  int has_face_index;
} geospec_occt_subshape_facts;

typedef struct geospec_occt_semantic_datum_facts {
  int64_t occurrence;
  size_t face_count;
} geospec_occt_semantic_datum_facts;

typedef struct geospec_occt_datum_placement_facts {
  int64_t occurrence;
  double origin[3];
  double x_axis[3];
  double z_axis[3];
} geospec_occt_datum_placement_facts;

typedef struct geospec_occt_entity {
  int kind;
  uint32_t occurrence;
  uint32_t face;
} geospec_occt_entity;

typedef struct geospec_occt_located_face_facts {
  geospec_occt_face_facts face;
  geospec_occt_bounds bounds;
  int reversed;
  size_t edge_count;
} geospec_occt_located_face_facts;

typedef struct geospec_occt_edge_facts {
  uint32_t index;
  int curve_type;
  double length;
  geospec_occt_bounds bounds;
  double start[3];
  double end[3];
  double origin[3];
  double direction[3];
  double radius;
  double secondary_radius;
} geospec_occt_edge_facts;

typedef struct geospec_occt_validity_facts {
  int valid;
  double max_tolerance;
  uint32_t free_bounds;
  int same_parameter;
  int closed_shells;
  int closed_solids;
  uint32_t solid_count;
  uint32_t invalid_solid_count;
  uint32_t open_edge_count;
  int closed_wires;
} geospec_occt_validity_facts;

typedef struct geospec_occt_extrema_result {
  double distance;
  double point_a[3];
  double point_b[3];
} geospec_occt_extrema_result;

typedef struct geospec_occt_common_volume_result {
  double volume;
  double centroid[3];
} geospec_occt_common_volume_result;

typedef struct geospec_occt_regular_solid_containment_result {
  int contained;
  uint32_t residual_solid_count;
  double residual_volume;
  int has_residual_bounds;
  geospec_occt_bounds residual_bounds;
  int has_residual_center_of_mass;
  double residual_center_of_mass[3];
} geospec_occt_regular_solid_containment_result;

typedef struct geospec_occt_cylinder_axial_extent_result {
  double origin[3];
  double axis[3];
  double radius;
  double from;
  double to;
} geospec_occt_cylinder_axial_extent_result;

typedef struct geospec_occt_wall_options {
  uint64_t work_unit_budget;
  double mesh_linear_tolerance_mm;
  double mesh_angular_tolerance_degrees;
} geospec_occt_wall_options;

typedef struct geospec_occt_wall_result {
  int outcome;
  uint64_t consumed;
  uint64_t limit;
  double value;
  double location[3];
  double point_a[3];
  double point_b[3];
  uint32_t solid_index;
  uint32_t tie_count;
  uint32_t face_a;
  uint32_t face_b;
  int surface_a;
  int surface_b;
  int support_a;
  int support_b;
  uint32_t checked_pairs;
  uint32_t extrema_failed;
  uint32_t zero_length;
  uint32_t no_material_interval;
} geospec_occt_wall_result;

typedef struct geospec_occt_report_sizes {
  size_t occurrence_count;
  size_t whole_face_count;
  size_t occurrence_face_count;
  size_t position_count;
  size_t triangle_count;
  size_t shape_bytes;
  size_t occurrence_bytes;
  size_t whole_face_bytes;
  size_t occurrence_face_bytes;
  size_t position_bytes;
  size_t triangle_bytes;
} geospec_occt_report_sizes;

typedef struct geospec_occt_cylinder_boundary_use {
  uint32_t edge_index;
  int32_t orientation;
  int32_t side;
  double curve_range[2];
  int32_t pcurve_stored;
  double parameter_endpoints[2][2];
} geospec_occt_cylinder_boundary_use;

typedef struct geospec_occt_cylinder_vertex {
  uint32_t vertex_index;
  double point[3];
} geospec_occt_cylinder_vertex;

/* Owned fixed-size certificate; kind 0 is box, kind 1 is cylinder. */
typedef struct geospec_occt_continuous_wall_domain {
  int32_t kind;
  double maximum_topology_tolerance_mm;
  double corners[8][3];
  uint32_t face_indices[6];
  uint32_t face_corner_indices[6][4];
  double outward_normals[6][3];
  uint32_t opposite_face_pairs[3][2];
  double edge_lengths[3];
  double origin[3];
  double axis[3];
  double radius;
  double from;
  double to;
  uint32_t lateral_face;
  uint32_t cap_faces[2];
  double lateral_parameter_bounds[4];
  double rim_centers[2][3];
  double rim_radii[2];
  uint32_t rim_edge_indices[2];
  uint32_t seam_edge_index;
  int32_t attachment_profile;
  double phase_x[3];
  double phase_y[3];
  double surface_period;
  double rim_curve_ranges[2][2];
  double rim_curve_periods[2];
  double cap_pcurve_ranges[2][2];
  double cap_pcurve_periods[2];
  int32_t cap_pcurve_stored[2];
  double seam_curve_range[2];
  geospec_occt_cylinder_boundary_use lateral_boundary[4];
  geospec_occt_cylinder_vertex vertices[2];
  uint32_t seam_vertex_indices[2];
  uint32_t rim_vertex_indices[2][2];
} geospec_occt_continuous_wall_domain;

typedef struct geospec_occt_selected_continuous_domain_result {
  uint32_t occurrence;
  geospec_occt_continuous_wall_domain domain;
  uint32_t face_count;
  uint32_t face_map[6];
  uint32_t edge_count;
  uint32_t edge_map[12];
} geospec_occt_selected_continuous_domain_result;

int geospec_occt_continuous_wall(
    const geospec_occt_document* document,
    geospec_occt_continuous_wall_domain* output,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_selected_continuous_domain(
    const geospec_occt_document* document, uint32_t occurrence,
    geospec_occt_selected_continuous_domain_result* output,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

int geospec_occt_open_step(const uint8_t* bytes, size_t length,
                           geospec_occt_document** out_document,
                           geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
void geospec_occt_release(geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;

int geospec_occt_document_facts(const geospec_occt_document* document,
                                geospec_occt_shape_facts* out_shape,
                                double* out_source_unit_to_millimeters,
                                geospec_occt_string* source_unit,
                                geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_admission_facts(
    const geospec_occt_document* document,
    double* out_source_unit_to_millimeters, size_t* out_occurrence_count,
    geospec_occt_string* source_unit,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

int geospec_occt_report_prepare(
    const geospec_occt_document* document,
    geospec_occt_report_sizes* out_sizes,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
void geospec_occt_report_discard(
    const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_report_document_facts(
    const geospec_occt_document* document,
    geospec_occt_shape_facts* out_shape,
    double* out_source_unit_to_millimeters,
    geospec_occt_string* source_unit,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_report_occurrence(
    const geospec_occt_document* document, size_t index,
    geospec_occt_occurrence_facts* out_occurrence,
    geospec_occt_string* label, geospec_occt_string* product_label,
    geospec_occt_string* name,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_report_face(
    const geospec_occt_document* document, size_t index,
    geospec_occt_located_face_facts* out_face,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
size_t geospec_occt_report_occurrence_face_count(
    const geospec_occt_document* document,
    uint32_t occurrence) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_report_occurrence_face(
    const geospec_occt_document* document, uint32_t occurrence, size_t index,
    geospec_occt_located_face_facts* out_face,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_report_mesh(
    const geospec_occt_document* document,
    double* positions, size_t position_capacity,
    uint32_t* triangles, size_t triangle_capacity,
    size_t* out_position_count, size_t* out_triangle_count,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

size_t geospec_occt_product_count(const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_product(const geospec_occt_document* document, size_t index,
                         geospec_occt_string* label, geospec_occt_string* name,
                         geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

size_t geospec_occt_occurrence_count(const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_occurrence(const geospec_occt_document* document, size_t index,
                            geospec_occt_occurrence_facts* out_occurrence,
                            geospec_occt_string* label,
                            geospec_occt_string* product_label,
                            geospec_occt_string* name,
                            geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_occurrence_identity(
    const geospec_occt_document* document, size_t index,
    geospec_occt_string* path, geospec_occt_string* product_name,
    geospec_occt_string* instance_name,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_occurrence_ordinal(
    const geospec_occt_document* document, size_t index, size_t ordinal_index,
    uint32_t* ordinal, geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

size_t geospec_occt_face_count(const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_face(const geospec_occt_document* document, size_t index,
                      geospec_occt_face_facts* out_face,
                      geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_face_location(const geospec_occt_document* document,
                               size_t index, geospec_occt_bounds* out_bounds,
                               int* out_reversed,
                               geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_face_label(const geospec_occt_document* document,
                            size_t index, geospec_occt_string* shape_label,
                            geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

size_t geospec_occt_pmi_count(const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_pmi(const geospec_occt_document* document, size_t index,
                     geospec_occt_pmi_facts* out_pmi,
                     geospec_occt_string* label, geospec_occt_string* name,
                     geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_pmi_association(const geospec_occt_document* document,
                                 size_t pmi_index, size_t association_index,
                                 geospec_occt_string* shape_label,
                                 geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

size_t geospec_occt_subshape_count(
    const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_subshape(
    const geospec_occt_document* document, size_t index,
    geospec_occt_subshape_facts* out_subshape,
    geospec_occt_string* occurrence_path, geospec_occt_string* name,
    geospec_occt_string* shape_label,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
size_t geospec_occt_semantic_datum_count(
    const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_semantic_datum(
    const geospec_occt_document* document, size_t index,
    geospec_occt_semantic_datum_facts* out_datum,
    geospec_occt_string* occurrence_path, geospec_occt_string* label,
    geospec_occt_string* feature_name,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_semantic_datum_face(
    const geospec_occt_document* document, size_t index, size_t face_index,
    uint32_t* out_face,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
size_t geospec_occt_datum_placement_count(
    const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_datum_placement(
    const geospec_occt_document* document, size_t index,
    geospec_occt_datum_placement_facts* out_placement,
    geospec_occt_string* occurrence_path, geospec_occt_string* name,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

size_t geospec_occt_occurrence_face_count(
    const geospec_occt_document* document, uint32_t occurrence) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_occurrence_face(
    const geospec_occt_document* document, uint32_t occurrence, size_t index,
    geospec_occt_located_face_facts* out_face,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_occurrence_face_label(
    const geospec_occt_document* document, uint32_t occurrence, size_t index,
    geospec_occt_string* shape_label,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_occurrence_face_edge(
    const geospec_occt_document* document, uint32_t occurrence, size_t face_index,
    size_t edge_index, uint32_t* out_edge,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

size_t geospec_occt_occurrence_edge_count(
    const geospec_occt_document* document, uint32_t occurrence) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_occurrence_edge(
    const geospec_occt_document* document, uint32_t occurrence, size_t index,
    geospec_occt_edge_facts* out_edge,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

int geospec_occt_validity(const geospec_occt_document* document,
                          geospec_occt_validity_facts* out_validity,
                          geospec_occt_string* reason,
                          geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_extrema(const geospec_occt_document* document,
                         geospec_occt_entity a, geospec_occt_entity b,
                         geospec_occt_extrema_result* out_extrema,
                         geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_classify_points(
    const geospec_occt_document* document, uint32_t occurrence,
    const double* points, size_t point_count, int* states, size_t state_capacity,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_common_volume(
    const geospec_occt_document* document, uint32_t occurrence_a,
    uint32_t occurrence_b, geospec_occt_common_volume_result* out_common,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_regular_solid_containment(
    const geospec_occt_document* document, geospec_occt_entity subject,
    geospec_occt_entity target,
    geospec_occt_regular_solid_containment_result* out_result,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_cylinder_axial_extent(
    const geospec_occt_document* document, geospec_occt_entity face,
    geospec_occt_cylinder_axial_extent_result* out_extent,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_classify_face_points(
    const geospec_occt_document* document, geospec_occt_entity face,
    const double* points, size_t point_count, double tolerance,
    int* states, size_t state_capacity,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_minimum_wall_thickness(
    const geospec_occt_document* document,
    const geospec_occt_wall_options* options,
    geospec_occt_wall_result* out_wall,
    geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

int geospec_occt_tessellate(const geospec_occt_document* document,
                            geospec_occt_entity entity,
                            double linear_deflection, double angular_deflection,
                            double* positions, size_t position_capacity,
                            uint32_t* triangles, size_t triangle_capacity,
                            size_t* out_position_count, size_t* out_triangle_count,
                            geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;

#ifdef __cplusplus
}
#endif

#undef GEOSPEC_OCCT_NOEXCEPT
#endif
