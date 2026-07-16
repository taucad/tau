//! Surface-less wgpu render path: adapter with `compatible_surface: None`,
//! 4x MSAA into an sRGB resolve texture, `copy_texture_to_buffer` readback
//! with 256-byte row alignment. No canvas anywhere — the same code runs on
//! native backends and browser WebGPU.

use crate::glb::{MODE_TRIANGLES, Scene};
use crate::{DEFAULT_HEIGHT, Projection, RenderError, RenderOptions, UpAxis};
use glam::{Mat4, Vec3};
use wgpu::util::DeviceExt;

const MATCAP_PNG: &[u8] = include_bytes!("../assets/matcap-soft.png");
const MSAA_SAMPLES: u32 = 4;
const COLOR_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;
const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;

pub struct Rendered {
    /// Straight-alpha, sRGB-encoded RGBA8 rows, tightly packed.
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy)]
pub(crate) struct CameraState {
    pub(crate) projection: Mat4,
    pub(crate) view: Mat4,
    pub(crate) forward: Vec3,
}

struct GpuMesh {
    positions: wgpu::Buffer,
    normals: wgpu::Buffer,
    indices: wgpu::Buffer,
    index_count: u32,
    bind_group: wgpu::BindGroup,
}

struct GpuLines {
    segments: wgpu::Buffer,
    segment_count: u32,
    bind_group: wgpu::BindGroup,
}

struct GpuMeshAsset {
    surfaces: Vec<GpuMesh>,
    lines: Vec<GpuLines>,
}

struct GpuInstance {
    mesh_index: usize,
    bind_group: wgpu::BindGroup,
}

pub(crate) struct RenderSession {
    device: wgpu::Device,
    queue: wgpu::Queue,
    frame_buffer: wgpu::Buffer,
    frame_bind_group: wgpu::BindGroup,
    mesh_pipeline: wgpu::RenderPipeline,
    line_pipeline: wgpu::RenderPipeline,
    gpu_assets: Vec<GpuMeshAsset>,
    gpu_instances: Vec<GpuInstance>,
    msaa_view: wgpu::TextureView,
    depth_view: wgpu::TextureView,
    resolve_texture: wgpu::Texture,
    resolve_view: wgpu::TextureView,
    readback_buffer: wgpu::Buffer,
    extent: wgpu::Extent3d,
    unpadded_bytes_per_row: u32,
    padded_bytes_per_row: u32,
    clear_color: wgpu::Color,
}

pub(crate) async fn request_adapter() -> Result<wgpu::Adapter, RenderError> {
    let backends = if cfg!(target_arch = "wasm32") {
        wgpu::Backends::BROWSER_WEBGPU
    } else {
        wgpu::Backends::PRIMARY
    };
    // Surface-less by construction: no display handle, ever.
    let mut instance_descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    instance_descriptor.backends = backends;
    let instance = wgpu::Instance::new(instance_descriptor);
    instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            ..Default::default()
        })
        .await
        .map_err(|e| RenderError::AdapterUnavailable(e.to_string()))
}

/// Canonical camera framing: fov 45, spherical placement at
/// distance = radius * 2 * tan(30 deg) / tan(22.5 deg), then per-corner fit
/// zoom (computeViewFittingZoom) with the padding factor.
pub(crate) fn camera_state(scene: &Scene, options: &RenderOptions) -> CameraState {
    let (min, max) = scene.bounds.unwrap_or(([-1.0; 3], [1.0; 3]));
    let min = Vec3::from(min);
    let max = Vec3::from(max);
    let center = (min + max) * 0.5;
    let mut radius = (max - center).length();
    if !(radius > 0.0) {
        // Matches resetCamera's degenerate-geometry fallback.
        radius = 1000.0;
    }

    let fov = 45f32.to_radians();
    let standard_fov = 60f32.to_radians();
    let offset_ratio = 2.0 * ((standard_fov / 2.0).tan() / (fov / 2.0).tan());
    let distance = radius * offset_ratio;

    let phi = options.phi_deg.to_radians();
    let theta = options.theta_deg.to_radians();
    let (offset, world_up) = spherical_eye(distance, phi, theta, options.up);
    let eye = center + offset;
    let up = stable_camera_up(offset, world_up);

    let view = glam::camera::rh::view::look_at_mat4(eye, center, up);
    let aspect = options.width as f32 / options.height as f32;
    let near = (distance - 2.0 * radius).max(distance * 0.001);
    let far = distance + 2.0 * radius;
    if options.projection == Projection::Orthographic {
        let (half_width, half_height) =
            orthographic_half_extents(view, min, max, aspect, options.padding_factor);
        let projection = glam::camera::rh::proj::directx::orthographic(
            -half_width,
            half_width,
            -half_height,
            half_height,
            near,
            far,
        );
        return CameraState {
            projection,
            view,
            forward: (center - eye).normalize_or_zero(),
        };
    }

    // DirectX/WebGPU NDC convention: Z in [0, 1], Y-up.
    let mut projection = glam::camera::rh::proj::directx::perspective(fov, aspect, near, far);
    let zoom = fit_zoom(
        eye,
        center,
        min,
        max,
        fov,
        aspect,
        options.padding_factor,
        up,
    );
    // three.js PerspectiveCamera.zoom divides the frustum extents.
    projection.x_axis.x *= zoom;
    projection.y_axis.y *= zoom;
    CameraState {
        projection,
        view,
        forward: (center - eye).normalize_or_zero(),
    }
}

fn stable_camera_up(offset: Vec3, world_up: Vec3) -> Vec3 {
    let view_axis = offset.normalize_or_zero();
    if view_axis.dot(world_up).abs() < 0.999 {
        return world_up;
    }
    if world_up == Vec3::Y {
        Vec3::NEG_Z
    } else {
        Vec3::Y
    }
}

fn orthographic_half_extents(
    view: Mat4,
    min: Vec3,
    max: Vec3,
    aspect: f32,
    padding: f32,
) -> (f32, f32) {
    let mut max_x = 0.0_f32;
    let mut max_y = 0.0_f32;
    for corner in aabb_corners(min, max) {
        let camera = view.transform_point3(corner);
        max_x = max_x.max(camera.x.abs());
        max_y = max_y.max(camera.y.abs());
    }
    let safe_padding = padding.max(0.001);
    let mut half_width = (max_x / safe_padding).max(0.001);
    let mut half_height = (max_y / safe_padding).max(0.001);
    if half_width / half_height < aspect {
        half_width = half_height * aspect;
    } else {
        half_height = half_width / aspect;
    }
    (half_width, half_height)
}

fn aabb_corners(min: Vec3, max: Vec3) -> [Vec3; 8] {
    std::array::from_fn(|index| {
        Vec3::new(
            if index & 1 != 0 { max.x } else { min.x },
            if index & 2 != 0 { max.y } else { min.y },
            if index & 4 != 0 { max.z } else { min.z },
        )
    })
}

/// Spherical eye offset + world-up vector for the given up axis.
fn spherical_eye(distance: f32, phi: f32, theta: f32, up: UpAxis) -> (Vec3, Vec3) {
    let planar = distance * phi.sin();
    let axial = distance * phi.cos();
    match up {
        UpAxis::X => (
            Vec3::new(axial, planar * theta.cos(), planar * theta.sin()),
            Vec3::X,
        ),
        UpAxis::Y => (
            Vec3::new(planar * theta.cos(), axial, -planar * theta.sin()),
            Vec3::Y,
        ),
        UpAxis::Z => (
            Vec3::new(planar * theta.cos(), planar * theta.sin(), axial),
            Vec3::Z,
        ),
    }
}

/// Equivalent to `computeViewFittingZoom` (`camera.utils.ts`): perspective-correct
/// per-corner angular extents against the frustum. `world_up` is the explicit
/// spherical-placement up axis.
fn fit_zoom(
    eye: Vec3,
    target: Vec3,
    min: Vec3,
    max: Vec3,
    fov: f32,
    aspect: f32,
    padding: f32,
    world_up: Vec3,
) -> f32 {
    const EPSILON: f32 = 1e-6;
    let to_target = target - eye;
    if to_target.length_squared() < EPSILON
        || !fov.is_finite()
        || !aspect.is_finite()
        || aspect <= EPSILON
        || !padding.is_finite()
        || padding <= 0.0
    {
        return 1.0;
    }
    let forward = to_target.normalize();
    let mut right = forward.cross(world_up);
    if right.length_squared() < 1e-6 {
        let fx = forward.x.abs();
        let fy = forward.y.abs();
        let fz = forward.z.abs();
        let fallback = if fx <= fy && fx <= fz {
            Vec3::X
        } else if fy <= fz {
            Vec3::Y
        } else {
            Vec3::Z
        };
        right = forward.cross(fallback);
    }
    let right = right.normalize();
    let up = right.cross(forward).normalize();

    let tan_half_fov = (fov / 2.0).tan();
    if !tan_half_fov.is_finite() || tan_half_fov < EPSILON {
        return 1.0;
    }

    let mut max_right_tan = 0f32;
    let mut max_up_tan = 0f32;
    let mut valid_corners = 0u32;
    for i in 0..8u32 {
        let corner = Vec3::new(
            if i & 1 != 0 { max.x } else { min.x },
            if i & 2 != 0 { max.y } else { min.y },
            if i & 4 != 0 { max.z } else { min.z },
        );
        let to_corner = corner - eye;
        let forward_distance = to_corner.dot(forward);
        if forward_distance <= EPSILON {
            continue;
        }
        max_right_tan = max_right_tan.max((to_corner.dot(right) / forward_distance).abs());
        max_up_tan = max_up_tan.max((to_corner.dot(up) / forward_distance).abs());
        valid_corners += 1;
    }
    let has_horizontal_extent = max_right_tan >= EPSILON;
    let has_vertical_extent = max_up_tan >= EPSILON;
    if valid_corners == 0 || (!has_horizontal_extent && !has_vertical_extent) {
        return 1.0;
    }
    let zoom_vertical = if has_vertical_extent {
        tan_half_fov / max_up_tan
    } else {
        f32::INFINITY
    };
    let zoom_horizontal = if has_horizontal_extent {
        aspect * tan_half_fov / max_right_tan
    } else {
        f32::INFINITY
    };
    (zoom_vertical.min(zoom_horizontal) * padding).max(EPSILON)
}

/// sRGB EOTF: `RenderOptions::background` is authored in sRGB, but wgpu clear
/// colors are linear (the sRGB target re-encodes on write).
fn srgb_to_linear(channel: f32) -> f64 {
    let channel = f64::from(channel.clamp(0.0, 1.0));
    if channel <= 0.040_45 {
        channel / 12.92
    } else {
        ((channel + 0.055) / 1.055).powf(2.4)
    }
}

fn decode_matcap() -> Result<(Vec<u8>, u32, u32), RenderError> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(MATCAP_PNG));
    // Normalize palette/16-bit/low-bit-depth variants to 8-bit channels.
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder
        .read_info()
        .map_err(|e| RenderError::Encode(format!("matcap: {e}")))?;
    let buffer_size = reader
        .output_buffer_size()
        .ok_or_else(|| RenderError::Encode("matcap: output size overflow".into()))?;
    let mut buffer = vec![0u8; buffer_size];
    let info = reader
        .next_frame(&mut buffer)
        .map_err(|e| RenderError::Encode(format!("matcap: {e}")))?;
    buffer.truncate(info.buffer_size());
    let rgba = match info.color_type {
        png::ColorType::Rgba => buffer,
        png::ColorType::Rgb => buffer
            .chunks_exact(3)
            .flat_map(|px| [px[0], px[1], px[2], 255])
            .collect(),
        png::ColorType::Grayscale => buffer.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        png::ColorType::GrayscaleAlpha => buffer
            .chunks_exact(2)
            .flat_map(|px| [px[0], px[0], px[0], px[1]])
            .collect(),
        other => {
            return Err(RenderError::Encode(format!(
                "matcap: unsupported color type {other:?}"
            )));
        }
    };
    Ok((rgba, info.width, info.height))
}

impl RenderSession {
    pub(crate) async fn new(scene: &Scene, options: &RenderOptions) -> Result<Self, RenderError> {
        let adapter = request_adapter().await?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("render-core"),
                ..Default::default()
            })
            .await
            .map_err(|e| RenderError::Gpu(format!("request_device: {e}")))?;

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("render-core"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
        });

        // Matcap texture (sRGB so sampling linearizes).
        let (matcap_rgba, matcap_width, matcap_height) = decode_matcap()?;
        let matcap_texture = device.create_texture_with_data(
            &queue,
            &wgpu::TextureDescriptor {
                label: Some("matcap"),
                size: wgpu::Extent3d {
                    width: matcap_width,
                    height: matcap_height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8UnormSrgb,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            },
            wgpu::util::TextureDataOrder::LayerMajor,
            &matcap_rgba,
        );
        let matcap_view = matcap_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let matcap_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("matcap"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        // line_width is specified at the default height and scales with output
        // height so edge weight is resolution-independent (2x render = 2x pixels).
        let line_width_px = options.line_width * options.height as f32 / DEFAULT_HEIGHT as f32;
        let mut frame_data = [0f32; 36];
        frame_data[32..].copy_from_slice(&[
            options.width as f32,
            options.height as f32,
            line_width_px,
            0.0,
        ]);
        let frame_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("frame"),
            contents: bytemuck::cast_slice(&frame_data),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let frame_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("frame"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let frame_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("frame"),
            layout: &frame_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: frame_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&matcap_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&matcap_sampler),
                },
            ],
        });

        let prim_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("prim"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let object_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("object"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("render-core"),
            bind_group_layouts: &[
                Some(&frame_layout),
                Some(&prim_layout),
                Some(&object_layout),
            ],
            immediate_size: 0,
        });

        let position_layout = wgpu::VertexBufferLayout {
            array_stride: 12,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &wgpu::vertex_attr_array![0 => Float32x3],
        };
        let normal_layout = wgpu::VertexBufferLayout {
            array_stride: 12,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &wgpu::vertex_attr_array![1 => Float32x3],
        };
        // Fat lines: one instance per segment carrying both endpoints; the vertex
        // shader expands each into a screen-space body quad plus two round-cap
        // rows (8-vertex triangle strip).
        let segment_layout = wgpu::VertexBufferLayout {
            array_stride: 24,
            step_mode: wgpu::VertexStepMode::Instance,
            attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3],
        };

        let color_target = Some(wgpu::ColorTargetState {
            format: COLOR_FORMAT,
            // Straight-alpha over on a transparent clear.
            blend: Some(wgpu::BlendState::ALPHA_BLENDING),
            write_mask: wgpu::ColorWrites::ALL,
        });
        let line_depth_state = Some(wgpu::DepthStencilState {
            format: DEPTH_FORMAT,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::Less),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        });
        // Surfaces take a slope-scaled polygon offset (the classic CAD
        // shaded+wireframe move) instead of lines being pulled forward: the edge
        // quad is expanded in screen space at the segment's depth, so wherever it
        // overhangs a nearer surface — grazing walls near silhouettes, bores,
        // ridges seen edge-on — a constant line-side bias loses to the surface's
        // depth gradient and the stroke gets chewed to a hairline. Pushing each
        // surface back by its own screen-space depth slope times the stroke's
        // half-width covers exactly that overhang at any resolution; `clamp`
        // bounds the push on near-tangent surfaces so hidden edges behind them
        // stay hidden.
        let mesh_depth_state = Some(wgpu::DepthStencilState {
            format: DEPTH_FORMAT,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::Less),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState {
                constant: 2,
                slope_scale: line_width_px * 0.5 + 1.0,
                clamp: 0.01,
            },
        });
        let multisample = wgpu::MultisampleState {
            count: MSAA_SAMPLES,
            mask: !0,
            alpha_to_coverage_enabled: false,
        };

        let mesh_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("mesh"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_mesh"),
                compilation_options: Default::default(),
                buffers: &[Some(position_layout.clone()), Some(normal_layout)],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_mesh"),
                compilation_options: Default::default(),
                targets: std::slice::from_ref(&color_target),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                // CAD solids are frequently marked doubleSided by the kernels.
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: mesh_depth_state,
            multisample,
            multiview_mask: None,
            cache: None,
        });

        // ponytail: pipelines compiled sequentially on purpose — llvmpipe SIGSEGVs
        // under concurrent pipeline compilation (bevy #13708).
        let line_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("line"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_line"),
                compilation_options: Default::default(),
                buffers: &[Some(segment_layout)],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_line"),
                compilation_options: Default::default(),
                targets: std::slice::from_ref(&color_target),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleStrip,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: line_depth_state,
            multisample,
            multiview_mask: None,
            cache: None,
        });

        // Each source mesh is uploaded once. Lines are de-indexed into segment
        // endpoint pairs for the fat-line quad expansion.
        let make_bind_group = |color: &[f32; 4]| {
            // The bind group keeps the uniform buffer alive; the handle can drop.
            let color_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("color"),
                contents: bytemuck::cast_slice(color),
                usage: wgpu::BufferUsages::UNIFORM,
            });
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("prim"),
                layout: &prim_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: color_buffer.as_entire_binding(),
                }],
            })
        };
        let gpu_assets = scene
            .meshes
            .iter()
            .map(|mesh| {
                let mut surfaces = Vec::new();
                let mut lines = Vec::new();
                for primitive in &mesh.primitives {
                    let bind_group = make_bind_group(&primitive.color);
                    if primitive.mode == MODE_TRIANGLES {
                        surfaces.push(GpuMesh {
                            positions: device.create_buffer_init(
                                &wgpu::util::BufferInitDescriptor {
                                    label: Some("positions"),
                                    contents: bytemuck::cast_slice(&primitive.positions),
                                    usage: wgpu::BufferUsages::VERTEX,
                                },
                            ),
                            normals: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                                label: Some("normals"),
                                contents: bytemuck::cast_slice(&primitive.normals),
                                usage: wgpu::BufferUsages::VERTEX,
                            }),
                            indices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                                label: Some("indices"),
                                contents: bytemuck::cast_slice(&primitive.indices),
                                usage: wgpu::BufferUsages::INDEX,
                            }),
                            index_count: primitive.indices.len() as u32,
                            bind_group,
                        });
                        continue;
                    }
                    let segments: Vec<f32> = primitive
                        .indices
                        .iter()
                        .flat_map(|&index| {
                            let base = index as usize * 3;
                            primitive.positions[base..base + 3].iter().copied()
                        })
                        .collect();
                    lines.push(GpuLines {
                        segments: device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                            label: Some("segments"),
                            contents: bytemuck::cast_slice(&segments),
                            usage: wgpu::BufferUsages::VERTEX,
                        }),
                        segment_count: (primitive.indices.len() / 2) as u32,
                        bind_group,
                    });
                }
                GpuMeshAsset { surfaces, lines }
            })
            .collect();

        let gpu_instances = scene
            .instances
            .iter()
            .map(|instance| {
                let mut data = [0.0f32; 32];
                data[..16].copy_from_slice(&instance.model.to_cols_array());
                data[16..].copy_from_slice(&instance.normal_matrix.to_cols_array());
                let buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("object"),
                    contents: bytemuck::cast_slice(&data),
                    usage: wgpu::BufferUsages::UNIFORM,
                });
                GpuInstance {
                    mesh_index: instance.mesh_index,
                    bind_group: device.create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("object"),
                        layout: &object_layout,
                        entries: &[wgpu::BindGroupEntry {
                            binding: 0,
                            resource: buffer.as_entire_binding(),
                        }],
                    }),
                }
            })
            .collect();

        // Render targets: MSAA color + depth, single-sample sRGB resolve target.
        let extent = wgpu::Extent3d {
            width: options.width,
            height: options.height,
            depth_or_array_layers: 1,
        };
        let msaa_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("msaa"),
            size: extent,
            mip_level_count: 1,
            sample_count: MSAA_SAMPLES,
            dimension: wgpu::TextureDimension::D2,
            format: COLOR_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let depth_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("depth"),
            size: extent,
            mip_level_count: 1,
            sample_count: MSAA_SAMPLES,
            dimension: wgpu::TextureDimension::D2,
            format: DEPTH_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let resolve_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("resolve"),
            size: extent,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: COLOR_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let msaa_view = msaa_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let depth_view = depth_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let resolve_view = resolve_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Readback buffer with 256-byte-aligned rows.
        let unpadded_bytes_per_row = options.width * 4;
        let padded_bytes_per_row = unpadded_bytes_per_row
            .div_ceil(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT)
            * wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
        let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: (padded_bytes_per_row * options.height) as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let clear_color = options
            .background
            .map_or(wgpu::Color::TRANSPARENT, |bg| wgpu::Color {
                r: srgb_to_linear(bg[0]),
                g: srgb_to_linear(bg[1]),
                b: srgb_to_linear(bg[2]),
                a: f64::from(bg[3].clamp(0.0, 1.0)),
            });

        Ok(Self {
            device,
            queue,
            frame_buffer,
            frame_bind_group,
            mesh_pipeline,
            line_pipeline,
            gpu_assets,
            gpu_instances,
            msaa_view,
            depth_view,
            resolve_texture,
            resolve_view,
            readback_buffer,
            extent,
            unpadded_bytes_per_row,
            padded_bytes_per_row,
            clear_color,
        })
    }

    pub(crate) async fn render_view(
        &self,
        scene: &Scene,
        options: &RenderOptions,
    ) -> Result<(Rendered, CameraState), RenderError> {
        let camera = camera_state(scene, options);
        let mvp = camera.projection * camera.view;
        let line_width_px = options.line_width * options.height as f32 / DEFAULT_HEIGHT as f32;
        let mut frame_data = [0f32; 36];
        frame_data[..16].copy_from_slice(&mvp.to_cols_array());
        frame_data[16..32].copy_from_slice(&camera.view.to_cols_array());
        frame_data[32..].copy_from_slice(&[
            options.width as f32,
            options.height as f32,
            line_width_px,
            0.0,
        ]);
        self.queue
            .write_buffer(&self.frame_buffer, 0, bytemuck::cast_slice(&frame_data));

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("render"),
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("render"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.msaa_view,
                    depth_slice: None,
                    resolve_target: Some(&self.resolve_view),
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(self.clear_color),
                        store: wgpu::StoreOp::Discard,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Discard,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            pass.set_bind_group(0, &self.frame_bind_group, &[]);
            pass.set_pipeline(&self.mesh_pipeline);
            for instance in &self.gpu_instances {
                pass.set_bind_group(2, &instance.bind_group, &[]);
                for mesh in &self.gpu_assets[instance.mesh_index].surfaces {
                    pass.set_bind_group(1, &mesh.bind_group, &[]);
                    pass.set_vertex_buffer(0, mesh.positions.slice(..));
                    pass.set_vertex_buffer(1, mesh.normals.slice(..));
                    pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint32);
                    pass.draw_indexed(0..mesh.index_count, 0, 0..1);
                }
            }
            pass.set_pipeline(&self.line_pipeline);
            for instance in &self.gpu_instances {
                pass.set_bind_group(2, &instance.bind_group, &[]);
                for lines in &self.gpu_assets[instance.mesh_index].lines {
                    pass.set_bind_group(1, &lines.bind_group, &[]);
                    pass.set_vertex_buffer(0, lines.segments.slice(..));
                    pass.draw(0..8, 0..lines.segment_count);
                }
            }
        }
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &self.resolve_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &self.readback_buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(self.padded_bytes_per_row),
                    rows_per_image: Some(options.height),
                },
            },
            self.extent,
        );
        self.queue.submit(Some(encoder.finish()));

        let slice = self.readback_buffer.slice(..);
        let (tx, rx) = futures_channel::oneshot::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });
        #[cfg(not(target_arch = "wasm32"))]
        self.device
            .poll(wgpu::PollType::wait_indefinitely())
            .map_err(|error| RenderError::Gpu(format!("poll: {error}")))?;
        rx.await
            .map_err(|_| RenderError::Gpu("map_async callback dropped (device lost?)".into()))?
            .map_err(|error| RenderError::Gpu(format!("map_async: {error}")))?;

        let mut rgba = Vec::with_capacity((self.unpadded_bytes_per_row * options.height) as usize);
        {
            let data = slice
                .get_mapped_range()
                .map_err(|error| RenderError::Gpu(format!("mapped range: {error}")))?;
            for row in 0..options.height {
                let start = (row * self.padded_bytes_per_row) as usize;
                rgba.extend_from_slice(&data[start..start + self.unpadded_bytes_per_row as usize]);
            }
        }
        self.readback_buffer.unmap();

        Ok((
            Rendered {
                rgba,
                width: options.width,
                height: options.height,
            },
            camera,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(actual: Vec3, expected: Vec3) {
        assert!(
            (actual - expected).length() < 1e-5,
            "expected {expected:?}, got {actual:?}"
        );
    }

    #[test]
    fn spherical_eye_is_right_handed_for_each_up_axis() {
        let phi = 90f32.to_radians();
        let theta = 90f32.to_radians();
        let (offset, up) = spherical_eye(10.0, phi, theta, UpAxis::Y);
        assert_close(offset, Vec3::new(0.0, 0.0, -10.0));
        assert_eq!(up, Vec3::Y);
        let (offset, up) = spherical_eye(10.0, phi, theta, UpAxis::Z);
        assert_close(offset, Vec3::new(0.0, 10.0, 0.0));
        assert_eq!(up, Vec3::Z);
        let (offset, up) = spherical_eye(10.0, phi, theta, UpAxis::X);
        assert_close(offset, Vec3::new(0.0, 0.0, 10.0));
        assert_eq!(up, Vec3::X);
    }

    #[test]
    fn spherical_eye_commutes_with_basis_conversion() {
        for (phi, theta) in [
            (60f32.to_radians(), -45f32.to_radians()),
            (37f32.to_radians(), 23f32.to_radians()),
        ] {
            let canonical = spherical_eye(8.0, phi, theta, UpAxis::Z).0;
            for (axis, expected) in [
                (UpAxis::X, Vec3::new(canonical.z, canonical.x, canonical.y)),
                (UpAxis::Y, Vec3::new(canonical.x, canonical.z, -canonical.y)),
                (UpAxis::Z, canonical),
            ] {
                assert_close(spherical_eye(8.0, phi, theta, axis).0, expected);
            }
        }
    }

    #[test]
    fn fit_zoom_is_up_axis_invariant_for_a_cube() {
        // A cube is symmetric under axis relabeling, so the same (phi, theta)
        // must produce the same fit regardless of which axis is up.
        let (min, max) = (Vec3::splat(-1.0), Vec3::splat(1.0));
        let fov = 45f32.to_radians();
        let (phi, theta) = (60f32.to_radians(), -45f32.to_radians());
        let zooms: Vec<f32> = [UpAxis::X, UpAxis::Y, UpAxis::Z]
            .into_iter()
            .map(|axis| {
                let (offset, up) = spherical_eye(8.0, phi, theta, axis);
                fit_zoom(offset, Vec3::ZERO, min, max, fov, 16.0 / 9.0, 0.9, up)
            })
            .collect();
        assert!(zooms[0] > 0.0);
        assert!((zooms[0] - zooms[1]).abs() < 1e-4, "{zooms:?}");
        assert!((zooms[1] - zooms[2]).abs() < 1e-4, "{zooms:?}");
    }

    #[test]
    fn fit_zoom_scales_linearly_with_padding() {
        let (min, max) = (Vec3::splat(-1.0), Vec3::splat(1.0));
        let fov = 45f32.to_radians();
        let (offset, up) = spherical_eye(8.0, 60f32.to_radians(), -45f32.to_radians(), UpAxis::Y);
        let full = fit_zoom(offset, Vec3::ZERO, min, max, fov, 16.0 / 9.0, 0.9, up);
        let half = fit_zoom(offset, Vec3::ZERO, min, max, fov, 16.0 / 9.0, 0.45, up);
        assert!((half - full * 0.5).abs() < 1e-5);
    }

    #[test]
    fn fit_zoom_handles_top_down_degenerate_view() {
        // Camera looking straight down the up axis: forward is parallel to
        // world up, exercising the fallback basis branch.
        let (min, max) = (Vec3::splat(-1.0), Vec3::splat(1.0));
        let (offset, up) = spherical_eye(8.0, 0.0, 0.0, UpAxis::Y);
        let zoom = fit_zoom(
            offset,
            Vec3::ZERO,
            min,
            max,
            45f32.to_radians(),
            16.0 / 9.0,
            0.9,
            up,
        );
        assert!(zoom > 0.0 && zoom.is_finite());
    }

    #[test]
    fn fit_zoom_constrains_each_line_by_its_non_degenerate_axis() {
        let fov = 45f32.to_radians();
        let expected = 10.0 * (fov / 2.0).tan() / 2.0;
        for (min, max) in [
            (Vec3::new(0.0, -2.0, 0.0), Vec3::new(0.0, 2.0, 0.0)),
            (Vec3::new(-2.0, 0.0, 0.0), Vec3::new(2.0, 0.0, 0.0)),
        ] {
            let zoom = fit_zoom(
                Vec3::new(0.0, 0.0, 10.0),
                Vec3::ZERO,
                min,
                max,
                fov,
                1.0,
                1.0,
                Vec3::Y,
            );
            assert!(
                (zoom - expected).abs() < 1e-5,
                "expected {expected}, got {zoom}"
            );
        }
    }

    #[test]
    fn fit_zoom_uses_explicit_non_default_up_axis() {
        let fov = 45f32.to_radians();
        let zoom = fit_zoom(
            Vec3::new(0.0, 0.0, 10.0),
            Vec3::ZERO,
            Vec3::new(-2.0, -1.0, 0.0),
            Vec3::new(2.0, 1.0, 0.0),
            fov,
            1.0,
            1.0,
            Vec3::X,
        );
        let expected = 10.0 * (fov / 2.0).tan() / 2.0;
        assert!(
            (zoom - expected).abs() < 1e-5,
            "expected {expected}, got {zoom}"
        );
    }

    #[test]
    fn fit_zoom_agrees_with_typescript_for_shared_asymmetric_fixture() {
        let zoom = fit_zoom(
            Vec3::new(6.0, 7.0, 8.0),
            Vec3::new(1.0, -2.0, 0.5),
            Vec3::new(-3.0, -1.0, -2.0),
            Vec3::new(4.0, 5.0, 3.0),
            47f32.to_radians(),
            4.0 / 3.0,
            0.9,
            Vec3::Z,
        );

        assert!((zoom - 0.488_220_08).abs() < 1e-5, "got {zoom}");
    }

    #[test]
    fn fit_zoom_uses_safe_fallback_for_invalid_projection_inputs() {
        let arguments = (
            Vec3::new(0.0, 0.0, 10.0),
            Vec3::ZERO,
            Vec3::splat(-1.0),
            Vec3::splat(1.0),
        );
        for (fov, aspect) in [(0.0, 1.0), (f32::NAN, 1.0), (45f32.to_radians(), 0.0)] {
            assert_eq!(
                fit_zoom(
                    arguments.0,
                    arguments.1,
                    arguments.2,
                    arguments.3,
                    fov,
                    aspect,
                    0.9,
                    Vec3::Y,
                ),
                1.0
            );
        }
    }
}
