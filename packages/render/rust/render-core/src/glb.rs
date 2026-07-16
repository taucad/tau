//! Validated GLB adapter for Tau's deliberately narrow headless render profile.
//! gltf-rs owns container, accessor, stride, offset, and sparse decoding; this
//! module only maps supported glTF semantics into the renderer's scene model.

use glam::{Mat4, Vec3};
use gltf::accessor::{DataType, Dimensions};
use gltf::mesh::{Mode, Semantic};

pub(crate) const MODE_TRIANGLES: u32 = 4;
pub(crate) const MODE_LINES: u32 = 1;

#[derive(Debug, PartialEq)]
pub(crate) struct Primitive {
    /// 4 = TRIANGLES, 1 = LINES.
    pub(crate) mode: u32,
    pub(crate) positions: Vec<f32>,
    /// Empty for LINES primitives without authored normals.
    pub(crate) normals: Vec<f32>,
    pub(crate) indices: Vec<u32>,
    /// Linear-space straight-alpha color from material baseColorFactor.
    pub(crate) color: [f32; 4],
}

#[derive(Debug, PartialEq)]
pub(crate) struct MeshAsset {
    pub(crate) primitives: Vec<Primitive>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct MeshInstance {
    pub(crate) mesh_index: usize,
    pub(crate) model: Mat4,
    pub(crate) normal_matrix: Mat4,
}

#[derive(Debug, PartialEq)]
pub(crate) struct Scene {
    pub(crate) meshes: Vec<MeshAsset>,
    pub(crate) instances: Vec<MeshInstance>,
    /// Exact world-space bounds over vertices referenced by draw indices.
    pub(crate) bounds: Option<([f32; 3], [f32; 3])>,
}

fn validate_document(document: &gltf::Document, bin: &[u8]) -> Result<(), String> {
    if let Some(extension) = document.extensions_required().next() {
        return Err(format!("unsupported required extension {extension}"));
    }
    if document.animations().next().is_some() {
        return Err("animations are not supported".into());
    }
    if document.skins().next().is_some() {
        return Err("skins are not supported".into());
    }

    let buffers: Vec<_> = document.buffers().collect();
    if buffers.len() > 1 {
        return Err("only one embedded BIN buffer is supported".into());
    }
    for buffer in buffers {
        if matches!(buffer.source(), gltf::buffer::Source::Uri(_)) {
            return Err("external and data URI buffers are not supported".into());
        }
        let declared = buffer.length();
        if bin.len() < declared || bin.len() > declared.saturating_add(3) {
            return Err(format!(
                "embedded BIN length {} does not match declared buffer length {declared}",
                bin.len()
            ));
        }
    }
    Ok(())
}

fn validate_vec3(accessor: gltf::Accessor<'_>, semantic: &str) -> Result<(), String> {
    if accessor.data_type() != DataType::F32 || accessor.dimensions() != Dimensions::Vec3 {
        return Err(format!("{semantic} must be a float32 VEC3 accessor"));
    }
    Ok(())
}

fn validate_material(material: &gltf::Material<'_>) -> Result<[f32; 4], String> {
    let pbr = material.pbr_metallic_roughness();
    if pbr.base_color_texture().is_some()
        || pbr.metallic_roughness_texture().is_some()
        || material.normal_texture().is_some()
        || material.occlusion_texture().is_some()
        || material.emissive_texture().is_some()
    {
        return Err("texture-backed materials are not supported".into());
    }
    let color = pbr.base_color_factor();
    if color.iter().any(|value| !value.is_finite()) {
        return Err("material baseColorFactor must be finite".into());
    }
    Ok(color)
}

fn decode_mesh(mesh: gltf::Mesh<'_>, bin: &[u8]) -> Result<MeshAsset, String> {
    let mut primitives = Vec::new();
    for primitive in mesh.primitives() {
        let mode = match primitive.mode() {
            Mode::Triangles => MODE_TRIANGLES,
            Mode::Lines => MODE_LINES,
            other => return Err(format!("unsupported primitive mode {other:?}")),
        };
        if primitive.morph_targets().next().is_some() {
            return Err("morph targets are not supported".into());
        }
        for (semantic, _) in primitive.attributes() {
            if !matches!(semantic, Semantic::Positions | Semantic::Normals) {
                return Err(format!("unsupported vertex attribute {semantic:?}"));
            }
        }

        let position_accessor = primitive
            .get(&Semantic::Positions)
            .ok_or("primitive missing POSITION")?;
        validate_vec3(position_accessor, "POSITION")?;
        let normal_accessor = primitive.get(&Semantic::Normals);
        if let Some(accessor) = normal_accessor.clone() {
            validate_vec3(accessor, "NORMAL")?;
        } else if mode == MODE_TRIANGLES {
            return Err("TRIANGLES primitive missing NORMAL".into());
        }
        if let Some(accessor) = primitive.indices() {
            if accessor.dimensions() != Dimensions::Scalar
                || !matches!(
                    accessor.data_type(),
                    DataType::U8 | DataType::U16 | DataType::U32
                )
            {
                return Err("indices must be unsigned SCALAR values".into());
            }
        }

        let reader = primitive.reader(|buffer| (buffer.index() == 0).then_some(bin));
        let positions: Vec<f32> = reader
            .read_positions()
            .ok_or("POSITION accessor could not be read")?
            .flatten()
            .collect();
        let normals: Vec<f32> = reader
            .read_normals()
            .map(|values| values.flatten().collect())
            .unwrap_or_default();
        if positions.iter().any(|value| !value.is_finite()) {
            return Err("POSITION values must be finite".into());
        }
        if normals.iter().any(|value| !value.is_finite()) {
            return Err("NORMAL values must be finite".into());
        }
        if !normals.is_empty() && normals.len() != positions.len() {
            return Err("NORMAL count does not match POSITION count".into());
        }

        let vertex_count = positions.len() / 3;
        let indices: Vec<u32> = reader.read_indices().map_or_else(
            || (0..vertex_count as u32).collect(),
            |values| values.into_u32().collect(),
        );
        let cardinality = if mode == MODE_TRIANGLES { 3 } else { 2 };
        if indices.len() % cardinality != 0 {
            return Err(format!(
                "{} index count must be divisible by {cardinality}",
                if mode == MODE_TRIANGLES {
                    "TRIANGLES"
                } else {
                    "LINES"
                }
            ));
        }
        if indices.iter().any(|&index| index as usize >= vertex_count) {
            return Err("index out of range".into());
        }
        if indices.is_empty() {
            continue;
        }

        primitives.push(Primitive {
            mode,
            positions,
            normals,
            indices,
            color: validate_material(&primitive.material())?,
        });
    }
    Ok(MeshAsset { primitives })
}

fn validate_transform(model: Mat4) -> Result<Mat4, String> {
    if !model.is_finite() {
        return Err("node transform must be finite".into());
    }
    if model.determinant() == 0.0 {
        return Err("node transform must be invertible".into());
    }
    let normal_matrix = model.inverse().transpose();
    if !normal_matrix.is_finite() {
        return Err("node normal transform must be finite".into());
    }
    Ok(normal_matrix)
}

fn extend_bounds(
    bounds: &mut Option<(Vec3, Vec3)>,
    mesh: &MeshAsset,
    model: Mat4,
) -> Result<(), String> {
    for primitive in &mesh.primitives {
        for &index in &primitive.indices {
            let offset = index as usize * 3;
            let local = Vec3::from_slice(&primitive.positions[offset..offset + 3]);
            let world = model.transform_point3(local);
            if !world.is_finite() {
                return Err("transformed POSITION values must be finite".into());
            }
            match bounds {
                Some((min, max)) => {
                    *min = min.min(world);
                    *max = max.max(world);
                }
                None => *bounds = Some((world, world)),
            }
        }
    }
    Ok(())
}

/// Parse a GLB into shared mesh assets plus deterministic core-node instances.
pub(crate) fn parse_glb(bytes: &[u8]) -> Result<Scene, String> {
    let glb = gltf::binary::Glb::from_slice(bytes).map_err(|error| error.to_string())?;
    let json: gltf::json::Root = gltf::json::deserialize::from_slice(&glb.json)
        .map_err(|error| format!("glTF JSON: {error}"))?;
    if let Some(extension) = json.extensions_required.first() {
        return Err(format!("unsupported required extension {extension}"));
    }
    let document = gltf::Document::from_json(json).map_err(|error| error.to_string())?;
    let bin = glb.bin.as_deref().unwrap_or_default();
    validate_document(&document, bin)?;

    let Some(scene) = document
        .default_scene()
        .or_else(|| document.scenes().next())
    else {
        return Ok(Scene {
            meshes: Vec::new(),
            instances: Vec::new(),
            bounds: None,
        });
    };

    let node_count = document.nodes().count();
    let mesh_count = document.meshes().count();
    let mut visited = vec![false; node_count];
    let mut mesh_map = vec![None; mesh_count];
    let mut meshes = Vec::new();
    let mut instances = Vec::new();
    let mut bounds = None;
    let mut roots: Vec<_> = scene.nodes().collect();
    roots.reverse();
    let mut stack: Vec<_> = roots
        .into_iter()
        .map(|node| (node, Mat4::IDENTITY))
        .collect();

    while let Some((node, parent)) = stack.pop() {
        if std::mem::replace(&mut visited[node.index()], true) {
            return Err(format!(
                "node {} appears more than once in the scene hierarchy",
                node.index()
            ));
        }
        if node.skin().is_some() || node.weights().is_some() {
            return Err("skinned and morph-weighted nodes are not supported".into());
        }
        let local = Mat4::from_cols_array_2d(&node.transform().matrix());
        let model = parent * local;
        let normal_matrix = validate_transform(model)?;

        if let Some(mesh) = node.mesh() {
            let source_index = mesh.index();
            let mesh_index = match mesh_map[source_index] {
                Some(index) => index,
                None => {
                    let index = meshes.len();
                    meshes.push(decode_mesh(mesh, bin)?);
                    mesh_map[source_index] = Some(index);
                    index
                }
            };
            extend_bounds(&mut bounds, &meshes[mesh_index], model)?;
            instances.push(MeshInstance {
                mesh_index,
                model,
                normal_matrix,
            });
        }

        let mut children: Vec<_> = node.children().collect();
        children.reverse();
        stack.extend(children.into_iter().map(|child| (child, model)));
    }

    Ok(Scene {
        meshes,
        instances,
        bounds: bounds.map(|(min, max)| (min.to_array(), max.to_array())),
    })
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use serde_json::{Value, json};

    use super::*;

    #[derive(Clone, Copy)]
    enum Layout {
        Packed,
        Offset,
        Interleaved,
        Sparse,
    }

    fn append(bin: &mut Vec<u8>, bytes: &[u8]) -> (usize, usize) {
        let offset = bin.len();
        bin.extend_from_slice(bytes);
        let length = bytes.len();
        while bin.len() % 4 != 0 {
            bin.push(0);
        }
        (offset, length)
    }

    fn glb(json: Value, bin: Vec<u8>) -> Vec<u8> {
        gltf::binary::Glb {
            header: gltf::binary::Header {
                magic: *b"glTF",
                version: 2,
                length: 0,
            },
            json: Cow::Owned(serde_json::to_vec(&json).expect("json")),
            bin: Some(Cow::Owned(bin)),
        }
        .to_vec()
        .expect("glb")
    }

    fn fixture(layout: Layout, index_component: u32, indexed: bool) -> Vec<u8> {
        let positions = [[0.0f32, 0.0, 0.0], [2.0, 0.0, 0.0], [0.0, 3.0, 0.0]];
        let normals = [[0.0f32, 0.0, 1.0]; 3];
        let mut bin = Vec::new();
        let mut views = Vec::new();
        let (position_view, normal_view, sparse) = match layout {
            Layout::Packed => {
                let position = append(&mut bin, bytemuck::cast_slice(&positions));
                let normal = append(&mut bin, bytemuck::cast_slice(&normals));
                views
                    .push(json!({"buffer": 0, "byteOffset": position.0, "byteLength": position.1}));
                views.push(json!({"buffer": 0, "byteOffset": normal.0, "byteLength": normal.1}));
                (0, 1, None)
            }
            Layout::Offset => {
                let mut position_bytes = vec![0; 4];
                position_bytes.extend_from_slice(bytemuck::cast_slice(&positions));
                let mut normal_bytes = vec![0; 4];
                normal_bytes.extend_from_slice(bytemuck::cast_slice(&normals));
                let position = append(&mut bin, &position_bytes);
                let normal = append(&mut bin, &normal_bytes);
                views
                    .push(json!({"buffer": 0, "byteOffset": position.0, "byteLength": position.1}));
                views.push(json!({"buffer": 0, "byteOffset": normal.0, "byteLength": normal.1}));
                (0, 1, None)
            }
            Layout::Interleaved => {
                let interleaved: Vec<f32> = positions
                    .iter()
                    .zip(normals.iter())
                    .flat_map(|(position, normal)| position.iter().chain(normal).copied())
                    .collect();
                let view = append(&mut bin, bytemuck::cast_slice(&interleaved));
                views.push(json!({"buffer": 0, "byteOffset": view.0, "byteLength": view.1, "byteStride": 24}));
                (0, 0, None)
            }
            Layout::Sparse => {
                let zeros = [[0.0f32; 3]; 3];
                let base = append(&mut bin, bytemuck::cast_slice(&zeros));
                let sparse_indices = append(&mut bin, &[0, 1, 2]);
                let sparse_values = append(&mut bin, bytemuck::cast_slice(&positions));
                let normal = append(&mut bin, bytemuck::cast_slice(&normals));
                views.push(json!({"buffer": 0, "byteOffset": base.0, "byteLength": base.1}));
                views.push(json!({"buffer": 0, "byteOffset": sparse_indices.0, "byteLength": sparse_indices.1}));
                views.push(json!({"buffer": 0, "byteOffset": sparse_values.0, "byteLength": sparse_values.1}));
                views.push(json!({"buffer": 0, "byteOffset": normal.0, "byteLength": normal.1}));
                (
                    0,
                    3,
                    Some(json!({
                        "count": 3,
                        "indices": {"bufferView": 1, "componentType": 5121},
                        "values": {"bufferView": 2}
                    })),
                )
            }
        };

        let index_bytes: Vec<u8> = match index_component {
            5121 => vec![0, 1, 2],
            5123 => [0u16, 1, 2]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect(),
            5125 => [0u32, 1, 2]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect(),
            _ => unreachable!(),
        };
        let index_view = if indexed {
            let index = append(&mut bin, &index_bytes);
            views.push(json!({"buffer": 0, "byteOffset": index.0, "byteLength": index.1}));
            Some(views.len() - 1)
        } else {
            None
        };

        let position_offset = if matches!(layout, Layout::Offset) {
            4
        } else {
            0
        };
        let normal_offset = if matches!(layout, Layout::Interleaved) {
            12
        } else if matches!(layout, Layout::Offset) {
            4
        } else {
            0
        };
        let mut position_accessor = json!({
            "bufferView": position_view,
            "byteOffset": position_offset,
            "componentType": 5126,
            "count": 3,
            "type": "VEC3",
            "min": [0, 0, 0],
            "max": [2, 3, 0]
        });
        if let Some(sparse) = sparse {
            position_accessor["sparse"] = sparse;
        }
        let mut accessors = vec![
            position_accessor,
            json!({
                "bufferView": normal_view,
                "byteOffset": normal_offset,
                "componentType": 5126,
                "count": 3,
                "type": "VEC3"
            }),
        ];
        let indices = index_view.map(|view| {
            accessors.push(json!({
                "bufferView": view,
                "componentType": index_component,
                "count": 3,
                "type": "SCALAR"
            }));
            accessors.len() - 1
        });
        let mut primitive = json!({
            "attributes": {"POSITION": 0, "NORMAL": 1},
            "mode": 4,
            "material": 0
        });
        if let Some(indices) = indices {
            primitive["indices"] = json!(indices);
        }
        glb(
            json!({
                "asset": {"version": "2.0"},
                "extensionsUsed": ["KHR_materials_unlit"],
                "scene": 0,
                "scenes": [{"nodes": [0]}],
                "nodes": [{"mesh": 0}],
                "meshes": [{"primitives": [primitive]}],
                "accessors": accessors,
                "bufferViews": views,
                "buffers": [{"byteLength": bin.len()}],
                "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [0.25, 0.5, 0.75, 1]}}]
            }),
            bin,
        )
    }

    #[test]
    fn standard_accessor_layouts_decode_to_identical_geometry() {
        let expected = parse_glb(&fixture(Layout::Packed, 5125, true)).expect("packed");
        for bytes in [
            fixture(Layout::Offset, 5125, true),
            fixture(Layout::Interleaved, 5125, true),
            fixture(Layout::Sparse, 5125, true),
        ] {
            assert_eq!(parse_glb(&bytes).expect("variant"), expected);
        }
    }

    #[test]
    fn standard_index_widths_and_absent_indices_share_draw_semantics() {
        let expected = parse_glb(&fixture(Layout::Packed, 5125, true)).expect("u32");
        for bytes in [
            fixture(Layout::Packed, 5121, true),
            fixture(Layout::Packed, 5123, true),
            fixture(Layout::Packed, 5125, false),
        ] {
            assert_eq!(parse_glb(&bytes).expect("variant"), expected);
        }
    }

    #[test]
    fn hierarchy_reuses_mesh_and_composes_world_transforms() {
        let source = fixture(Layout::Interleaved, 5125, true);
        let parsed = gltf::binary::Glb::from_slice(&source).expect("fixture");
        let mut json: Value = serde_json::from_slice(&parsed.json).expect("json");
        json["scenes"][0]["nodes"] = json!([0, 2]);
        json["nodes"] = json!([
            {"translation": [10, 0, 0], "children": [1]},
            {"mesh": 0, "scale": [2, 1, 1]},
            {"mesh": 0, "translation": [-5, 0, 0]}
        ]);
        let scene = parse_glb(&glb(json, parsed.bin.expect("bin").into_owned())).expect("scene");

        assert_eq!(scene.meshes.len(), 1);
        assert_eq!(scene.instances.len(), 2);
        assert_eq!(
            scene.instances[0].model.transform_point3(Vec3::ZERO),
            Vec3::X * 10.0
        );
        assert_eq!(
            scene.instances[1].model.transform_point3(Vec3::ZERO),
            Vec3::X * -5.0
        );
        assert_eq!(scene.bounds, Some(([-5.0, 0.0, 0.0], [14.0, 3.0, 0.0])));
    }

    #[test]
    fn composed_fixture_covers_interleaving_instancing_and_lines() {
        let scene = parse_glb(include_bytes!(
            "../../../spike/fixtures/interleaved-instanced-lines.glb"
        ))
        .expect("fixture");

        assert_eq!(scene.meshes.len(), 1);
        assert_eq!(scene.instances.len(), 2);
        assert_eq!(scene.meshes[0].primitives.len(), 2);
        assert_eq!(scene.meshes[0].primitives[0].mode, MODE_TRIANGLES);
        assert_eq!(scene.meshes[0].primitives[1].mode, MODE_LINES);
        assert_eq!(scene.meshes[0].primitives[1].color, [0.0, 0.0, 0.0, 1.0]);
        assert_eq!(scene.bounds, Some(([-4.5, -1.95, 0.0], [4.2, 2.15, 0.0])));
    }

    #[test]
    fn bounds_only_include_vertices_referenced_by_indices() {
        let source = fixture(Layout::Packed, 5125, true);
        let parsed = gltf::binary::Glb::from_slice(&source).expect("fixture");
        let mut json: Value = serde_json::from_slice(&parsed.json).expect("json");
        json["nodes"][0]["translation"] = json!([4, 5, 6]);
        let scene = parse_glb(&glb(json, parsed.bin.expect("bin").into_owned())).expect("scene");
        assert_eq!(scene.bounds, Some(([4.0, 5.0, 6.0], [6.0, 8.0, 6.0])));
    }

    #[test]
    fn empty_scene_is_valid() {
        let scene = parse_glb(&glb(
            json!({"asset": {"version": "2.0"}, "scenes": [{"nodes": []}], "scene": 0}),
            Vec::new(),
        ))
        .expect("empty");
        assert!(scene.meshes.is_empty());
        assert!(scene.instances.is_empty());
        assert!(scene.bounds.is_none());
    }

    #[test]
    fn unsupported_profile_features_fail_deterministically() {
        let source = fixture(Layout::Packed, 5125, true);
        let parsed = gltf::binary::Glb::from_slice(&source).expect("fixture");
        let base: Value = serde_json::from_slice(&parsed.json).expect("json");
        let bin = parsed.bin.expect("bin").into_owned();

        let cases = [
            (
                "extensionsRequired",
                json!(["EXT_mesh_gpu_instancing"]),
                "unsupported required extension",
            ),
            (
                "animations",
                json!([{"channels": [], "samplers": []}]),
                "animations are not supported",
            ),
        ];
        for (field, value, expected) in cases {
            let mut json = base.clone();
            json[field] = value;
            let error = parse_glb(&glb(json, bin.clone())).unwrap_err();
            assert!(
                error.contains(expected),
                "expected {expected:?}, got {error:?}"
            );
        }
    }

    #[test]
    fn unsupported_geometry_and_material_semantics_fail_deterministically() {
        let source = fixture(Layout::Packed, 5125, true);
        let parsed = gltf::binary::Glb::from_slice(&source).expect("fixture");
        let base: Value = serde_json::from_slice(&parsed.json).expect("json");
        let bin = parsed.bin.expect("bin").into_owned();

        let mut missing_normal = base.clone();
        missing_normal["meshes"][0]["primitives"][0]["attributes"] = json!({"POSITION": 0});
        assert_eq!(
            parse_glb(&glb(missing_normal, bin.clone())).unwrap_err(),
            "TRIANGLES primitive missing NORMAL"
        );

        let mut invalid_cardinality = base.clone();
        invalid_cardinality["accessors"][2]["count"] = json!(2);
        assert_eq!(
            parse_glb(&glb(invalid_cardinality, bin.clone())).unwrap_err(),
            "TRIANGLES index count must be divisible by 3"
        );

        let mut texture = base.clone();
        texture["images"] = json!([{"uri": "data:image/png;base64,iVBORw0KGgo="}]);
        texture["textures"] = json!([{"source": 0}]);
        texture["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"] = json!({"index": 0});
        assert_eq!(
            parse_glb(&glb(texture, bin.clone())).unwrap_err(),
            "texture-backed materials are not supported"
        );

        let mut morph = base.clone();
        morph["meshes"][0]["primitives"][0]["targets"] = json!([{"POSITION": 0}]);
        assert_eq!(
            parse_glb(&glb(morph, bin.clone())).unwrap_err(),
            "morph targets are not supported"
        );

        let mut skin = base;
        skin["skins"] = json!([{"joints": [0]}]);
        assert_eq!(
            parse_glb(&glb(skin, bin)).unwrap_err(),
            "skins are not supported"
        );
    }

    #[test]
    fn rejects_external_buffers_and_invalid_transforms() {
        let external = glb(
            json!({
                "asset": {"version": "2.0"},
                "buffers": [{"byteLength": 12, "uri": "mesh.bin"}]
            }),
            Vec::new(),
        );
        assert_eq!(
            parse_glb(&external).unwrap_err(),
            "external and data URI buffers are not supported"
        );

        let source = fixture(Layout::Packed, 5125, true);
        let parsed = gltf::binary::Glb::from_slice(&source).expect("fixture");
        let mut json: Value = serde_json::from_slice(&parsed.json).expect("json");
        json["nodes"][0]["scale"] = json!([0, 1, 1]);
        assert_eq!(
            parse_glb(&glb(json, parsed.bin.expect("bin").into_owned())).unwrap_err(),
            "node transform must be invertible"
        );
    }

    #[test]
    fn rejects_non_glb() {
        assert!(parse_glb(b"not a glb at all").is_err());
    }
}
