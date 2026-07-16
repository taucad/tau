// Matcap surface + solid line-edge shading.
//
// Matcap UV convention matches three.js MeshMatcapMaterial sampling a
// default-flipY texture: uv = (n.x * 0.495 + 0.5, 0.5 - n.y * 0.495) where n
// is the normalized view-space normal. Colors multiply in linear space; the
// sRGB render target re-encodes on write.

struct Frame {
    view_projection: mat4x4<f32>,
    view: mat4x4<f32>,
    // xy = viewport size in px, z = edge line width in px, w unused.
    viewport: vec4<f32>,
}

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var matcap_texture: texture_2d<f32>;
@group(0) @binding(2) var matcap_sampler: sampler;

struct Prim {
    color: vec4<f32>,
}

@group(1) @binding(0) var<uniform> prim: Prim;

struct Object {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
}

@group(2) @binding(0) var<uniform> object: Object;

struct MeshOut {
    @builtin(position) position: vec4<f32>,
    @location(0) view_normal: vec3<f32>,
}

@vertex
fn vs_mesh(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> MeshOut {
    var out: MeshOut;
    out.position = frame.view_projection * object.model * vec4<f32>(position, 1.0);
    out.view_normal = (frame.view * object.normal_matrix * vec4<f32>(normal, 0.0)).xyz;
    return out;
}

@fragment
fn fs_mesh(in: MeshOut) -> @location(0) vec4<f32> {
    let n = normalize(in.view_normal);
    let uv = vec2<f32>(n.x * 0.495 + 0.5, 0.5 - n.y * 0.495);
    let matcap = textureSample(matcap_texture, matcap_sampler, uv);
    return vec4<f32>(matcap.rgb * prim.color.rgb, prim.color.a);
}

// Fat lines: each segment instance is an 8-vertex triangle strip — a body
// quad plus one cap row half a width beyond each endpoint, the layout of
// three.js LineSegmentsGeometry. uv.x runs across the stroke and uv.y along
// it, both in half-width units at the caps: the body spans uv.y in [-1, 1]
// and the cap rows sit at ±2, so fs_line can discard outside the endpoint
// circles. Round caps make consecutive segments of an edge loop union into
// a smooth constant-width stroke — square caps left corner bulges poking
// out of every joint of a tessellated curve, reading as a sawtooth.
struct LineOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_line(
    @builtin(vertex_index) index: u32,
    @location(0) start: vec3<f32>,
    @location(1) end: vec3<f32>,
) -> LineOut {
    // Strip rows: 0 = start cap, 1 = start, 2 = end, 3 = end cap.
    let row = index >> 1u;
    let side = select(-1.0, 1.0, (index & 1u) != 0u);
    let at_end = row >= 2u;
    let is_cap = row == 0u || row == 3u;

    let clip_start = frame.view_projection * object.model * vec4<f32>(start, 1.0);
    let clip_end = frame.view_projection * object.model * vec4<f32>(end, 1.0);

    // The fitted camera keeps all geometry inside the frustum, so both
    // endpoints have w > 0 and no near-plane trimming is needed.
    let resolution = frame.viewport.xy;
    let aspect = resolution.x / resolution.y;
    var dir = clip_end.xy / clip_end.w - clip_start.xy / clip_start.w;
    dir.x = dir.x * aspect;
    // A zero-length projected segment (duplicate tessellation point, or a
    // segment aimed dead-on at the camera) still draws as a round dot via
    // its caps instead of a NaN quad.
    dir = select(normalize(dir), vec2<f32>(1.0, 0.0), dot(dir, dir) == 0.0);

    // Perpendicular half-width offset, plus a half-width lengthwise
    // extension on the cap rows. One pixel is 2/resolution.y NDC, so
    // width_px/resolution.y is the half-width per side.
    let cap = select(0.0, select(-1.0, 1.0, at_end), is_cap);
    var offset = vec2<f32>(dir.y, -dir.x) * side + dir * cap;
    offset = offset * frame.viewport.z / resolution.y;
    offset.x = offset.x / aspect;

    let clip = select(clip_start, clip_end, at_end);
    var out: LineOut;
    out.position = vec4<f32>(clip.xy + offset * clip.w, clip.zw);
    let uv_body = select(-1.0, 1.0, at_end);
    out.uv = vec2<f32>(side, select(uv_body, uv_body * 2.0, is_cap));
    return out;
}

@fragment
fn fs_line(in: LineOut) -> @location(0) vec4<f32> {
    // Round caps: outside the body span keep only the endpoint circle
    // (three.js LineMaterial's discard path; MSAA covers the boundary).
    if (abs(in.uv.y) > 1.0) {
        let b = in.uv.y - sign(in.uv.y);
        if (in.uv.x * in.uv.x + b * b > 1.0) {
            discard;
        }
    }
    return prim.color;
}
