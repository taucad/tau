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

int geospec_occt_open_step(const uint8_t* bytes, size_t length,
                           geospec_occt_document** out_document,
                           geospec_occt_string* error) GEOSPEC_OCCT_NOEXCEPT;
void geospec_occt_release(geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;

int geospec_occt_document_facts(const geospec_occt_document* document,
                                geospec_occt_shape_facts* out_shape,
                                double* out_source_unit_to_millimeters,
                                geospec_occt_string* source_unit,
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

size_t geospec_occt_face_count(const geospec_occt_document* document) GEOSPEC_OCCT_NOEXCEPT;
int geospec_occt_face(const geospec_occt_document* document, size_t index,
                      geospec_occt_face_facts* out_face,
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

int geospec_occt_tessellate(const geospec_occt_document* document,
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
