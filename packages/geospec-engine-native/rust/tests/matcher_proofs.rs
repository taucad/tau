use std::{
    cell::{Cell, RefCell},
    collections::{BTreeMap, HashMap},
    rc::Rc,
};

use geospec_engine_native_core::{
    backend::{
        brep::{
            Bounds, BrepAdmissionFacts, BrepConnector, BrepEntity, BrepIdentityProfile,
            BrepSubject, CommonVolume, ContinuousWallDomain, ContinuousWallShape, DocumentFacts,
            EdgeFacts, Extrema, LocatedFace, OccurrenceFacts, PointState, ProductFacts,
            ReportedBrepBundle, ShapeFacts, TessellationProfile, TopologyCounts, ValidityFacts,
            WallOptions, WallSupport, WallThickness, WallThicknessOutcome,
        },
        csg::{
            BooleanOp, CsgConnector, FillRule, MeshExport, Section, SectionComponent, SectionOp,
            SolidId, SolidProperties,
        },
        BackendError, BackendErrorKind, TriangleMesh,
    },
    registry::Capability,
    Engine, EngineConfig,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

#[test]
fn assigned_proof_capabilities_keep_the_registry_spelling() {
    let names = [
        Capability::ToHaveNoComponentInterference,
        Capability::ToHaveSpatialRelationships,
        Capability::ToHaveMinimumWallThickness,
        Capability::ToHaveVoidContinuity,
        Capability::AnalyzeMeshOverlap,
    ]
    .map(Capability::name);

    assert_eq!(
        names,
        [
            "toHaveNoComponentInterference",
            "toHaveSpatialRelationships",
            "toHaveMinimumWallThickness",
            "toHaveVoidContinuity",
            "analyzeMeshOverlap",
        ]
    );
}

fn backend_unused() -> BackendError {
    BackendError {
        kind: BackendErrorKind::Unsupported,
        message: "unused proof-control operation".into(),
    }
}

fn bounds(min: [f64; 3], max: [f64; 3]) -> Bounds {
    Bounds { min, max }
}

fn cube(bounds: Bounds) -> TriangleMesh {
    let [x0, y0, z0] = bounds.min;
    let [x1, y1, z1] = bounds.max;
    TriangleMesh {
        positions: vec![
            [x0, y0, z0],
            [x1, y0, z0],
            [x1, y1, z0],
            [x0, y1, z0],
            [x0, y0, z1],
            [x1, y0, z1],
            [x1, y1, z1],
            [x0, y1, z1],
        ],
        triangles: vec![
            [0, 2, 1],
            [0, 3, 2],
            [4, 5, 6],
            [4, 6, 7],
            [0, 1, 5],
            [0, 5, 4],
            [1, 2, 6],
            [1, 6, 5],
            [2, 3, 7],
            [2, 7, 6],
            [3, 0, 4],
            [3, 4, 7],
        ],
    }
}

fn occurrence() -> OccurrenceFacts {
    OccurrenceFacts {
        label: "wall".into(),
        product_label: "wall-product".into(),
        name: "wall".into(),
        placement: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        bounds: bounds([0.0; 3], [1.0; 3]),
        path: "wall".into(),
        parent: None,
        product: 0,
        product_name: "wall".into(),
        instance_name: Some("wall".into()),
        ordinal_path: vec![1],
    }
}

fn facts() -> Rc<DocumentFacts> {
    Rc::new(DocumentFacts {
        source_length_unit: "millimetre".into(),
        source_unit_to_millimeters: 1.0,
        products: vec![ProductFacts {
            label: "wall-product".into(),
            name: "wall".into(),
        }],
        occurrences: vec![occurrence()],
        shape: ShapeFacts {
            valid: true,
            bounds: bounds([0.0; 3], [1.0; 3]),
            volume: 1.0,
            surface_area: 6.0,
            center_of_mass: [0.5; 3],
            topology: TopologyCounts {
                compounds: 1,
                solids: 1,
                shells: 1,
                faces: 6,
                wires: 6,
                edges: 12,
                vertices: 8,
            },
        },
        faces: Vec::new(),
        pmi: Vec::new(),
        subshapes: Vec::new(),
        datum_placements: Vec::new(),
        semantic_datums: Vec::new(),
    })
}

fn box_domain(edge_lengths: [f64; 3]) -> ContinuousWallDomain {
    let [x, y, z] = edge_lengths;
    ContinuousWallDomain {
        maximum_topology_tolerance_mm: 0.007,
        domain: ContinuousWallShape::AxisAlignedBox {
            corners: [
                [10.0, 20.0, 30.0],
                [10.0, 20.0, 30.0 + z],
                [10.0, 20.0 + y, 30.0],
                [10.0, 20.0 + y, 30.0 + z],
                [10.0 + x, 20.0, 30.0],
                [10.0 + x, 20.0, 30.0 + z],
                [10.0 + x, 20.0 + y, 30.0],
                [10.0 + x, 20.0 + y, 30.0 + z],
            ],
            face_indices: [10, 11, 20, 21, 30, 31],
            face_corner_indices: [
                [0, 2, 3, 1],
                [4, 5, 7, 6],
                [0, 1, 5, 4],
                [2, 6, 7, 3],
                [0, 4, 6, 2],
                [1, 3, 7, 5],
            ],
            outward_normals: [
                [-1.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, -1.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, -1.0],
                [0.0, 0.0, 1.0],
            ],
            opposite_face_pairs: [[10, 11], [20, 21], [30, 31]],
            edge_lengths,
        },
    }
}

fn cylinder_domain(radius: f64, from: f64, to: f64) -> ContinuousWallDomain {
    use geospec_engine_native_core::backend::brep::{
        CylinderAttachmentProfile, CylinderBoundaryOrientation as Orientation,
        CylinderBoundarySide as Side, CylinderBoundaryUse, CylinderPeriodicAttachment,
        CylinderVertex,
    };
    let period = std::f64::consts::TAU;
    // Authored neutral algebra successor, not observations of an imported STEP.
    let boundary =
        |edge_index, orientation, side, curve_range, parameter_endpoints| CylinderBoundaryUse {
            edge_index,
            orientation,
            side,
            curve_range,
            pcurve_stored: true,
            parameter_endpoints,
        };
    ContinuousWallDomain {
        maximum_topology_tolerance_mm: 0.009,
        domain: ContinuousWallShape::RightCircularCylinder {
            origin: [10.0, 20.0, 30.0],
            axis: [0.0, 0.0, 1.0],
            radius,
            from,
            to,
            lateral_face: 7,
            cap_faces: [8, 9],
            lateral_parameter_bounds: [0.0, std::f64::consts::TAU, from, to],
            rim_centers: [[10.0, 20.0, 30.0 + from], [10.0, 20.0, 30.0 + to]],
            rim_radii: [radius, radius],
            rim_edge_indices: [10, 11],
            seam_edge_index: 12,
            periodic_attachment: CylinderPeriodicAttachment {
                profile: CylinderAttachmentProfile::PhaseZeroV1,
                phase_x: [1.0, 0.0, 0.0],
                phase_y: [0.0, 1.0, 0.0],
                surface_period: period,
                rim_curve_ranges: [[0.0, period]; 2],
                rim_curve_periods: [period; 2],
                cap_pcurve_ranges: [[0.0, period]; 2],
                cap_pcurve_periods: [period; 2],
                cap_pcurve_stored: [true; 2],
                seam_curve_range: [from, to],
                lateral_boundary: [
                    boundary(
                        10,
                        Orientation::Forward,
                        Side::V0,
                        [0.0, period],
                        [[0.0, from], [period, from]],
                    ),
                    boundary(
                        12,
                        Orientation::Forward,
                        Side::U1,
                        [from, to],
                        [[period, from], [period, to]],
                    ),
                    boundary(
                        11,
                        Orientation::Reversed,
                        Side::V1,
                        [0.0, period],
                        [[0.0, to], [period, to]],
                    ),
                    boundary(
                        12,
                        Orientation::Reversed,
                        Side::U0,
                        [from, to],
                        [[0.0, from], [0.0, to]],
                    ),
                ],
                vertices: [
                    CylinderVertex {
                        vertex_index: 1,
                        point: [10.0 + radius, 20.0, 30.0 + from],
                    },
                    CylinderVertex {
                        vertex_index: 2,
                        point: [10.0 + radius, 20.0, 30.0 + to],
                    },
                ],
                seam_vertex_indices: [1, 2],
                rim_vertex_indices: [[1, 1], [2, 2]],
            },
        },
    }
}

struct ProofBrepConnector {
    budgets: Rc<RefCell<Vec<u64>>>,
    tessellations: Rc<Cell<u32>>,
    continuous_wall: Result<ContinuousWallDomain, BackendError>,
    continuous_wall_queries: Rc<Cell<u32>>,
}

impl BrepConnector for ProofBrepConnector {
    fn identity_profile(&self) -> BrepIdentityProfile {
        BrepIdentityProfile {
            ingest_profile: "proof-control-step-v1",
            backend_profile: "proof-control-brep-v1",
        }
    }

    fn open_step(&self, _: &[u8]) -> Result<Box<dyn BrepSubject>, BackendError> {
        Ok(Box::new(ProofBrep {
            budgets: Rc::clone(&self.budgets),
            tessellations: Rc::clone(&self.tessellations),
            continuous_wall: self.continuous_wall.clone(),
            continuous_wall_queries: Rc::clone(&self.continuous_wall_queries),
        }))
    }
}

struct ProofBrep {
    budgets: Rc<RefCell<Vec<u64>>>,
    tessellations: Rc<Cell<u32>>,
    continuous_wall: Result<ContinuousWallDomain, BackendError>,
    continuous_wall_queries: Rc<Cell<u32>>,
}

impl BrepSubject for ProofBrep {
    fn admission_facts(&self) -> Result<BrepAdmissionFacts, BackendError> {
        Ok(BrepAdmissionFacts {
            source_length_unit: "millimetre".into(),
            source_unit_to_millimeters: 1.0,
            occurrence_count: 1,
        })
    }

    fn reported_facts_and_mesh(&self) -> Result<ReportedBrepBundle, BackendError> {
        Ok(ReportedBrepBundle {
            facts: facts(),
            whole_faces: Rc::from(Vec::<LocatedFace>::new()),
            occurrence_faces: vec![Rc::from(Vec::<LocatedFace>::new())],
            mesh: Rc::new(cube(bounds([0.0; 3], [1.0; 3]))),
        })
    }

    fn continuous_wall_domain(&self, _: BrepEntity) -> Result<ContinuousWallDomain, BackendError> {
        self.continuous_wall_queries
            .set(self.continuous_wall_queries.get() + 1);
        self.continuous_wall.clone()
    }

    fn facts(&self) -> Result<Rc<DocumentFacts>, BackendError> {
        Ok(facts())
    }

    fn faces(&self) -> Result<Rc<[LocatedFace]>, BackendError> {
        Ok(Rc::from(Vec::<LocatedFace>::new()))
    }

    fn occurrence_faces(&self, _: u32) -> Result<Rc<[LocatedFace]>, BackendError> {
        Ok(Rc::from(Vec::<LocatedFace>::new()))
    }

    fn occurrence_edges(&self, _: u32) -> Result<Rc<[EdgeFacts]>, BackendError> {
        Err(backend_unused())
    }

    fn validity(&self) -> Result<Rc<ValidityFacts>, BackendError> {
        Err(backend_unused())
    }

    fn extrema(&self, _: BrepEntity, _: BrepEntity) -> Result<Extrema, BackendError> {
        Err(backend_unused())
    }

    fn classify_points(&self, _: u32, _: &[[f64; 3]]) -> Result<Vec<PointState>, BackendError> {
        Err(backend_unused())
    }

    fn common_volume(&self, _: u32, _: u32) -> Result<CommonVolume, BackendError> {
        Err(backend_unused())
    }

    fn classify_face_points(
        &self,
        _: BrepEntity,
        _: &[[f64; 3]],
        _: f64,
    ) -> Result<Vec<PointState>, BackendError> {
        Err(backend_unused())
    }

    fn minimum_wall_thickness(
        &self,
        options: &WallOptions,
    ) -> Result<WallThicknessOutcome, BackendError> {
        self.budgets.borrow_mut().push(options.work_unit_budget);
        if options.work_unit_budget < 3 {
            return Ok(WallThicknessOutcome::BudgetExceeded {
                consumed: 3,
                limit: options.work_unit_budget,
            });
        }
        Ok(WallThicknessOutcome::Measured(WallThickness {
            consumed: 3,
            value: 2.0,
            location: Some([0.5, 0.5, 0.5]),
            point_a: Some([0.0, 0.5, 0.5]),
            point_b: Some([2.0, 0.5, 0.5]),
            solid_index: Some(0),
            tie_count: Some(2),
            algorithm: "source-wall-control".into(),
            tolerance: 0.01,
            support_a: Some(WallSupport {
                face_index: Some(4),
                surface_type: Some("plane".into()),
                support_type: Some("face".into()),
            }),
            support_b: Some(WallSupport {
                face_index: Some(9),
                surface_type: Some("plane".into()),
                support_type: Some("face".into()),
            }),
            rejections: BTreeMap::from([("parallel".into(), 1)]),
        }))
    }

    fn tessellate(
        &self,
        _: BrepEntity,
        _: TessellationProfile,
    ) -> Result<Rc<TriangleMesh>, BackendError> {
        self.tessellations.set(self.tessellations.get() + 1);
        Ok(Rc::new(cube(bounds([0.0; 3], [1.0; 3]))))
    }
}

#[derive(Clone)]
struct Solid {
    bounds: Option<Bounds>,
    mesh: TriangleMesh,
    volume: f64,
}

struct ProofCsg {
    next: Cell<u32>,
    solids: RefCell<HashMap<SolidId, Solid>>,
    intersections: Rc<Cell<u32>>,
    calls: Rc<Cell<u32>>,
}

impl ProofCsg {
    fn new(intersections: Rc<Cell<u32>>, calls: Rc<Cell<u32>>) -> Self {
        Self {
            next: Cell::new(0),
            solids: RefCell::new(HashMap::new()),
            intersections,
            calls,
        }
    }

    fn allocate(&self, solid: Solid) -> SolidId {
        let slot = self.next.get();
        self.next.set(slot + 1);
        let id = SolidId::new(slot, 1);
        self.solids.borrow_mut().insert(id, solid);
        id
    }

    fn copy(&self, id: SolidId) -> Result<Solid, BackendError> {
        self.solids
            .borrow()
            .get(&id)
            .cloned()
            .ok_or_else(backend_unused)
    }
}

fn mesh_bounds(mesh: &TriangleMesh) -> Bounds {
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for point in &mesh.positions {
        for axis in 0..3 {
            min[axis] = min[axis].min(point[axis]);
            max[axis] = max[axis].max(point[axis]);
        }
    }
    Bounds { min, max }
}

fn volume(bounds: Bounds) -> f64 {
    (0..3)
        .map(|axis| (bounds.max[axis] - bounds.min[axis]).max(0.0))
        .product()
}

impl CsgConnector for ProofCsg {
    fn release(&mut self, solid: SolidId) -> Result<(), BackendError> {
        self.solids.borrow_mut().remove(&solid);
        Ok(())
    }

    fn admit(&mut self, mesh: &TriangleMesh, _: &[[u32; 2]]) -> Result<SolidId, BackendError> {
        self.calls.set(self.calls.get() + 1);
        let bounds = mesh_bounds(mesh);
        Ok(self.allocate(Solid {
            bounds: Some(bounds),
            mesh: mesh.clone(),
            volume: volume(bounds),
        }))
    }

    fn boolean(
        &mut self,
        operation: BooleanOp,
        operands: &[SolidId],
    ) -> Result<SolidId, BackendError> {
        self.calls.set(self.calls.get() + 1);
        let solids = operands
            .iter()
            .map(|id| self.copy(*id))
            .collect::<Result<Vec<_>, _>>()?;
        let result = match operation {
            BooleanOp::Intersection => {
                self.intersections.set(self.intersections.get() + 1);
                let left = solids[0].bounds.expect("left bounds");
                let right = solids[1].bounds.expect("right bounds");
                let intersection = Bounds {
                    min: std::array::from_fn(|axis| left.min[axis].max(right.min[axis])),
                    max: std::array::from_fn(|axis| left.max[axis].min(right.max[axis])),
                };
                let volume = volume(intersection);
                Solid {
                    bounds: (volume > 0.0).then_some(intersection),
                    mesh: if volume > 0.0 {
                        cube(intersection)
                    } else {
                        TriangleMesh {
                            positions: Vec::new(),
                            triangles: Vec::new(),
                        }
                    },
                    volume,
                }
            }
            BooleanOp::Difference => solids[0].clone(),
            BooleanOp::Union => {
                let union = solids
                    .iter()
                    .fold(solids[0].bounds.unwrap(), |union, solid| {
                        let other = solid.bounds.unwrap();
                        Bounds {
                            min: std::array::from_fn(|axis| union.min[axis].min(other.min[axis])),
                            max: std::array::from_fn(|axis| union.max[axis].max(other.max[axis])),
                        }
                    });
                Solid {
                    bounds: Some(union),
                    mesh: cube(union),
                    volume: solids.iter().map(|solid| solid.volume).sum(),
                }
            }
        };
        Ok(self.allocate(result))
    }

    fn transform(&mut self, solid: SolidId, _: [f64; 12]) -> Result<SolidId, BackendError> {
        self.calls.set(self.calls.get() + 1);
        Ok(self.allocate(self.copy(solid)?))
    }

    fn decompose(&mut self, solid: SolidId) -> Result<Vec<SolidId>, BackendError> {
        self.calls.set(self.calls.get() + 1);
        Ok(vec![self.allocate(self.copy(solid)?)])
    }

    fn properties(&self, solid: SolidId) -> Result<SolidProperties, BackendError> {
        let solid = self.copy(solid)?;
        Ok(SolidProperties {
            signed_volume: solid.volume,
            surface_area: 0.0,
            bounds: solid.bounds,
            is_empty: solid.bounds.is_none(),
        })
    }

    fn export(&self, solid: SolidId) -> Result<MeshExport, BackendError> {
        Ok(MeshExport {
            mesh: self.copy(solid)?.mesh,
            merge_from: Vec::new(),
            merge_to: Vec::new(),
        })
    }

    fn slice(&self, _: SolidId, _: f64) -> Result<Section, BackendError> {
        self.calls.set(self.calls.get() + 1);
        let outer = vec![[-2.0, -2.0], [2.0, -2.0], [2.0, 2.0], [-2.0, 2.0]];
        Ok(Section {
            contours: vec![outer.clone()],
            signed_area: 16.0,
            components: vec![SectionComponent {
                outer,
                holes: Vec::new(),
                signed_area: 16.0,
            }],
        })
    }

    fn section(&self, _: &[Vec<[f64; 2]>], _: FillRule) -> Result<Section, BackendError> {
        Err(backend_unused())
    }

    fn section_boolean(
        &self,
        _: SectionOp,
        _: &Section,
        _: &Section,
    ) -> Result<Section, BackendError> {
        Err(backend_unused())
    }
}

type EngineSignals = (
    Engine,
    Rc<RefCell<Vec<u64>>>,
    Rc<Cell<u32>>,
    Rc<Cell<u32>>,
    Rc<Cell<u32>>,
);

type EngineWallSignals = (
    Engine,
    Rc<RefCell<Vec<u64>>>,
    Rc<Cell<u32>>,
    Rc<Cell<u32>>,
    Rc<Cell<u32>>,
    Rc<Cell<u32>>,
);

fn engine() -> EngineSignals {
    let (engine, budgets, intersections, csg_calls, tessellations, _) =
        engine_with_wall(Ok(box_domain([2.0, 3.0, 4.0])));
    (engine, budgets, intersections, csg_calls, tessellations)
}

fn engine_with_wall(
    continuous_wall: Result<ContinuousWallDomain, BackendError>,
) -> EngineWallSignals {
    let budgets = Rc::new(RefCell::new(Vec::new()));
    let intersections = Rc::new(Cell::new(0));
    let csg_calls = Rc::new(Cell::new(0));
    let tessellations = Rc::new(Cell::new(0));
    let continuous_wall_queries = Rc::new(Cell::new(0));
    let engine = Engine::with_backends(
        EngineConfig::entry(),
        Box::new(ProofBrepConnector {
            budgets: Rc::clone(&budgets),
            tessellations: Rc::clone(&tessellations),
            continuous_wall,
            continuous_wall_queries: Rc::clone(&continuous_wall_queries),
        }),
        Box::new(ProofCsg::new(
            Rc::clone(&intersections),
            Rc::clone(&csg_calls),
        )),
    );
    (
        engine,
        budgets,
        intersections,
        csg_calls,
        tessellations,
        continuous_wall_queries,
    )
}

fn ingest_step(engine: &mut Engine) -> (String, String) {
    let bytes = b"source-authored proof control".to_vec();
    let request = json!({
        "method": "ingestSubject",
        "requestId": "step-admit",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "format": "step",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "auto", "outputUnit": "mm"},
        "ingestOptions": {},
        "primaryByteLength": bytes.len(),
        "resources": []
    });
    let response: Value = serde_json::from_slice(
        &engine
            .ingest_subject(
                &serde_json::to_vec(&request).unwrap(),
                bytes.clone(),
                Vec::new(),
            )
            .unwrap(),
    )
    .unwrap();
    (
        response["result"]["subject"]["subjectHash"]
            .as_str()
            .unwrap()
            .into(),
        format!("{:x}", Sha256::digest(bytes)),
    )
}

fn gltf_buffer() -> Vec<u8> {
    let mut bytes = cube(bounds([0.0; 3], [1.0; 3]))
        .positions
        .into_iter()
        .flatten()
        .map(|value| value as f32)
        .flat_map(f32::to_le_bytes)
        .collect::<Vec<_>>();
    bytes.extend(
        cube(bounds([0.0; 3], [1.0; 3]))
            .triangles
            .into_iter()
            .flatten()
            .map(|value| value as u16)
            .flat_map(u16::to_le_bytes),
    );
    bytes
}

fn ingest_gltf(engine: &mut Engine) -> (String, String) {
    let primary = serde_json::to_vec(&json!({
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0, 1]}],
        "nodes": [
            {"mesh": 0, "name": "A"},
            {"mesh": 0, "name": "B", "translation": [0.5, 0, 0]}
        ],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "buffers": [{"uri": "mesh.bin", "byteLength": 168}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 96},
            {"buffer": 0, "byteOffset": 96, "byteLength": 72}
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 8, "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 1]},
            {"bufferView": 1, "componentType": 5123, "count": 36, "type": "SCALAR"}
        ]
    }))
    .unwrap();
    let buffer = gltf_buffer();
    let request = json!({
        "method": "ingestSubject",
        "requestId": "gltf-admit",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "format": "gltf",
        "frame": {"coordinateSystem": "z-up", "sourceUnit": "mm", "outputUnit": "mm"},
        "ingestOptions": {},
        "primaryByteLength": primary.len(),
        "resources": [{"name": "mesh.bin", "byteLength": buffer.len()}]
    });
    let response: Value = serde_json::from_slice(
        &engine
            .ingest_subject(
                &serde_json::to_vec(&request).unwrap(),
                primary.clone(),
                vec![buffer],
            )
            .unwrap(),
    )
    .unwrap();
    (
        response["result"]["subject"]["subjectHash"]
            .as_str()
            .unwrap()
            .into(),
        format!("{:x}", Sha256::digest(primary)),
    )
}

fn claims(engine: &Engine, subject_hash: &str, claims: Vec<Value>) -> Value {
    let request = json!({
        "method": "submitClaims",
        "requestId": "proofs",
        "protocolVersion": 3,
        "registryVersion": 5,
        "canonicalProfile": "geospec-jcs-v1",
        "plan": {
            "subjects": [{"slot": "part", "subjectHash": subject_hash}],
            "claims": claims
        }
    });
    serde_json::from_slice(
        &engine
            .process_request(&serde_json::to_vec(&request).unwrap())
            .unwrap(),
    )
    .unwrap()
}

fn claim(id: &str, capability: &str, payload: Value, polarity: &str, budget: u64) -> Value {
    json!({
        "claimId": id,
        "capability": capability,
        "subjectSlots": ["part"],
        "payload": payload,
        "polarity": polarity,
        "workUnitBudget": budget
    })
}

#[test]
fn sampled_gltf_interference_and_required_pairs_refuse_before_geometry() {
    let (mut engine, _, intersections, _, _) = engine();
    let (subject_hash, _) = ingest_gltf(&mut engine);
    let unsupported = json!([{
        "code": "GEOSPEC_EVIDENCE_UNSUPPORTED",
        "severity": "error",
        "message": "This selected component pair has no bounded complete-material noninterference certificate."
    }]);
    for polarity in ["positive", "negative"] {
        for budget in [87, 88, 179, 180] {
            let response = claims(
                &engine,
                &subject_hash,
                vec![claim(
                    "sampled-interference",
                    "toHaveNoComponentInterference",
                    json!({
                        "kind": "componentInterference",
                        "expected": {"pairs": [{"left": "A#0", "right": "B#0"}]}
                    }),
                    polarity,
                    budget,
                )],
            );
            assert_eq!(
                response["result"]["numericProfile"],
                "geospec-st-logical-requests-v3"
            );
            let result = &response["result"]["results"][0];
            assert_eq!(result["status"], "refused");
            assert_eq!(result["diagnostics"], unsupported);
        }
    }
    let required = claims(
        &engine,
        &subject_hash,
        ["positive", "negative"]
            .into_iter()
            .map(|polarity| {
                claim(
                    polarity,
                    "toHaveNoComponentInterference",
                    json!({
                        "kind": "componentInterference",
                        "expected": {"pairs": [{"left": "missing-a", "right": "missing-b"}]}
                    }),
                    polarity,
                    180,
                )
            })
            .collect(),
    );
    let expected = json!([{
        "code": "GEOSPEC_SELECTOR_UNMATCHED",
        "severity": "error",
        "message": "Requested component pair at index 0 did not match two distinct components.",
        "details": {
            "matcher": "toHaveNoComponentInterference",
            "pair": {"left": "missing-a", "right": "missing-b"},
            "pairIndex": 0
        }
    }]);
    for result in required["result"]["results"].as_array().unwrap() {
        assert_eq!(result["status"], "refused");
        assert_eq!(result["diagnostics"], expected);
    }
    assert_eq!(intersections.get(), 0);
}

fn wall_result(domain: ContinuousWallDomain, expected: Value) -> Value {
    let (mut engine, _, _, _, _, _) = engine_with_wall(Ok(domain));
    let (subject_hash, _) = ingest_step(&mut engine);
    claims(
        &engine,
        &subject_hash,
        vec![claim(
            "wall",
            "toHaveMinimumWallThickness",
            json!({"kind": "minimumWallThickness", "expected": expected}),
            "positive",
            2,
        )],
    )["result"]["results"][0]
        .clone()
}

// W3-WALL-CONTINUOUS-02 evolves the snapshotted interim support-pair stage.
#[test]
fn continuous_wall_box_algebra_uses_actual_corner_centers_and_xyz_ties() {
    let unequal_domain = box_domain([4.0, 2.0, 3.0]);
    let expected_certificate: Value = serde_json::from_slice(
        &geospec_engine_native_core::canonicalize(&serde_json::to_vec(&unequal_domain).unwrap())
            .unwrap(),
    )
    .unwrap();
    let unequal = wall_result(unequal_domain, json!({"value": {"greaterThanOrEqual": 2}}));
    assert_eq!(unequal["status"], "passed");
    assert_eq!(
        unequal["evidence"]["measured"],
        json!({
            "value": 2,
            "criterion": "minimum-antiparallel-smooth-support-material-chord-v1",
            "domain": "axis-aligned-box",
            "maximumTopologyToleranceMm": 0.007
        })
    );
    assert_eq!(
        unequal["evidence"]["witnesses"],
        json!({
            "domainCertificate": expected_certificate,
            "attainingSupports": {
                "pointA": [12, 20, 31.5],
                "pointB": [12, 22, 31.5],
                "normalA": [0, -1, 0],
                "normalB": [0, 1, 0],
                "faceA": 20,
                "faceB": 21
            },
            "materialInterval": {"from": 0, "to": 1, "method": "validated-convex-domain"},
            "formula": {"kind": "minimum-edge-length", "operands": [4, 2, 3]}
        })
    );
    assert!(unequal["evidence"]["witnesses"]
        .get("normalizedExpected")
        .is_none());

    let tied = wall_result(
        box_domain([2.0, 2.0, 3.0]),
        json!({"value": {"greaterThanOrEqual": 2}}),
    );
    assert_eq!(
        tied["evidence"]["witnesses"]["attainingSupports"],
        json!({
            "pointA": [10, 21, 31.5],
            "pointB": [12, 21, 31.5],
            "normalA": [-1, 0, 0],
            "normalB": [1, 0, 0],
            "faceA": 10,
            "faceB": 11
        })
    );
}

#[test]
fn continuous_wall_cylinder_algebra_covers_axial_diametric_and_equal_ties() {
    // This exact neutral certificate checks core algebra only; the OCCT cylinder remains Unsupported.
    let axial = wall_result(cylinder_domain(4.0, -1.0, 2.0), json!({"value": 3}));
    assert_eq!(
        axial["evidence"]["witnesses"]["attainingSupports"],
        json!({
            "pointA": [10, 20, 29], "pointB": [10, 20, 32],
            "normalA": [0, 0, -1], "normalB": [0, 0, 1],
            "faceA": 8, "faceB": 9
        })
    );
    assert_eq!(
        axial["evidence"]["witnesses"]["formula"],
        json!({"kind": "minimum-height-diameter", "operands": [3, 8]})
    );

    let equal = wall_result(cylinder_domain(1.5, -1.0, 2.0), json!({"value": 3}));
    assert_eq!(
        equal["evidence"]["witnesses"]["attainingSupports"]["faceA"],
        8
    );
    assert_eq!(
        equal["evidence"]["witnesses"]["attainingSupports"]["faceB"],
        9
    );

    let diametric = wall_result(cylinder_domain(1.0, -1.0, 4.0), json!({"value": 2}));
    assert_eq!(
        diametric["evidence"]["witnesses"]["attainingSupports"],
        json!({
            "pointA": [9, 20, 31.5], "pointB": [11, 20, 31.5],
            "normalA": [-1, 0, 0], "normalB": [1, 0, 0],
            "faceA": 7, "faceB": 7
        })
    );
}

#[test]
fn continuous_wall_numeric_expectations_preserve_polarity_and_tolerance_boundaries() {
    let (mut engine, budgets, _, _, _, queries) = engine_with_wall(Ok(box_domain([2.0, 3.0, 4.0])));
    let (subject_hash, content_hash) = ingest_step(&mut engine);
    let response = claims(
        &engine,
        &subject_hash,
        vec![
            claim(
                "inclusive-positive",
                "toHaveMinimumWallThickness",
                json!({"kind":"minimumWallThickness","expected":{"value":2.25,"tolerance":0.25}}),
                "positive",
                2,
            ),
            claim(
                "inclusive-negative",
                "toHaveMinimumWallThickness",
                json!({"kind":"minimumWallThickness","expected":{"value":2.25,"tolerance":0.25}}),
                "negative",
                2,
            ),
            claim(
                "strict-positive",
                "toHaveMinimumWallThickness",
                json!({"kind":"minimumWallThickness","expected":{"value":{"greaterThan":2}}}),
                "positive",
                2,
            ),
            claim(
                "strict-negative",
                "toHaveMinimumWallThickness",
                json!({"kind":"minimumWallThickness","expected":{"value":{"greaterThan":2}}}),
                "negative",
                2,
            ),
        ],
    );
    let results = response["result"]["results"].as_array().unwrap();
    assert_eq!(
        results
            .iter()
            .map(|result| result["status"].as_str().unwrap())
            .collect::<Vec<_>>(),
        vec!["passed", "failed", "failed", "passed"]
    );
    assert_eq!(results[0]["evidence"]["subjectContentHash"], content_hash);
    assert_eq!(
        results[1]["diagnostics"][0]["code"],
        "GEOSPEC_NEGATED_MATCH"
    );
    assert_eq!(
        results[2]["diagnostics"][0]["message"],
        "The minimum wall thickness is 2 mm, which does not satisfy > 2."
    );
    assert_eq!(
        results[2]["diagnostics"][0]["details"]["measured"],
        results[2]["evidence"]["measured"]
    );
    assert!(results[3]["diagnostics"].as_array().unwrap().is_empty());
    assert_eq!(queries.get(), 1);
    assert!(
        budgets.borrow().is_empty(),
        "the historical support-pair query is unused"
    );
}

#[test]
fn sampled_step_voids_keep_csg_and_minimum_cross_section_refusals_distinct() {
    for min_cross_section in [None, Some(1)] {
        let (mut engine, _, _, csg_calls, tessellations) = engine();
        let (subject_hash, _) = ingest_step(&mut engine);
        let path = if min_cross_section.is_some() {
            json!([{"occurrence": "wall"}])
        } else {
            json!([[0, 0, -1], [0, 0, 1]])
        };
        let mut expected = json!({
            "path": path,
            "material": ["wall"],
            "bounds": {"min": [-2, -2, -2], "max": [2, 2, 2]}
        });
        if let Some(value) = min_cross_section {
            expected["minCrossSection"] = json!(value);
        }
        let response = claims(
            &engine,
            &subject_hash,
            ["positive", "negative"]
                .into_iter()
                .map(|polarity| {
                    claim(
                        polarity,
                        "toHaveVoidContinuity",
                        json!({"kind": "voidContinuity", "expected": expected}),
                        polarity,
                        180,
                    )
                })
                .collect(),
        );
        let diagnostic = if min_cross_section.is_some() {
            json!([{
                "code": "GEOSPEC_EVIDENCE_UNSUPPORTED",
                "severity": "error",
                "message": "The void profile samples cross-sections; a continuous minimum cross-section is not qualified.",
                "suggestion": "Use a qualified continuous section proof for the declared geometry representation.",
                "details": {
                    "matcher": "toHaveVoidContinuity",
                    "profile": "geospec-void-sampled-sections-v1",
                    "continuousMinimumQualified": false
                }
            }])
        } else {
            json!([{
                "code": "GEOSPEC_UNSUPPORTED_EVIDENCE",
                "severity": "error",
                "message": "The BRep connector has no qualified selected continuous domain query."
            }])
        };
        let results = response["result"]["results"].as_array().unwrap();
        for result in results {
            assert_eq!(result["status"], "refused");
            assert_eq!(result["diagnostics"], diagnostic);
        }
        assert_eq!(results[0]["diagnostics"], results[1]["diagnostics"]);
        assert_eq!(csg_calls.get(), 0);
        assert_eq!(tessellations.get(), 0);
    }
}

// Successor controls predeclared by W2.C-LOGICAL-BUDGET-02. Old evidence above
// retains its earlier budget assertions; these tests do not rewrite that corpus.

// W3-WALL-CONTINUOUS-02 supersedes the snapshotted CONTINUOUS01 interim refusal.
#[test]
fn continuous_wall_outside_domain_refuses_both_polarities() {
    for polarity in ["positive", "negative"] {
        let (mut engine, budgets, _, _, _, queries) = engine_with_wall(Err(BackendError {
            kind: BackendErrorKind::Unsupported,
            message: "ordinary outside-domain control".into(),
        }));
        let (subject_hash, _) = ingest_step(&mut engine);
        let response = claims(
            &engine,
            &subject_hash,
            vec![claim(
                "wall-outside-domain",
                "toHaveMinimumWallThickness",
                json!({"kind":"minimumWallThickness","expected":{"value":{"greaterThanOrEqual":1}}}),
                polarity,
                2,
            )],
        );
        assert_eq!(
            response["result"]["results"][0],
            json!({
                "claimId":"wall-outside-domain",
                "status":"refused",
                "diagnostics":[{
                    "code":"GEOSPEC_EVIDENCE_UNSUPPORTED",
                    "severity":"error",
                    "message":"The subject is outside the qualified continuous wall-thickness domains.",
                    "suggestion":"Use a complete validated box or cylinder supported by the declared continuous wall profile.",
                    "details":{
                        "matcher":"toHaveMinimumWallThickness",
                        "profile":"geospec-wall-convex-analytic-v1",
                        "continuousMinimumQualified":false
                    }
                }]
            })
        );
        assert_eq!(queries.get(), 1);
        assert!(budgets.borrow().is_empty());
    }
}

#[test]
fn continuous_wall_budget_charges_report_and_query_on_cold_and_warm_claims() {
    let (mut engine, budgets, _, _, _, queries) = engine_with_wall(Ok(box_domain([2.0, 3.0, 4.0])));
    let (subject_hash, _) = ingest_step(&mut engine);
    for (budget, expected_status, expected_queries) in [
        (1, "refused", 0),
        (2, "passed", 1),
        (1, "refused", 1),
        (2, "passed", 1),
    ] {
        let response = claims(
            &engine,
            &subject_hash,
            vec![claim(
                "wall-budget",
                "toHaveMinimumWallThickness",
                json!({"kind":"minimumWallThickness","expected":{"value":2}}),
                "positive",
                budget,
            )],
        );
        let result = &response["result"]["results"][0];
        assert_eq!(result["status"], expected_status);
        if budget == 1 {
            assert_eq!(result["diagnostics"][0]["code"], "MATCHER_TIMEOUT");
            assert_eq!(result["diagnostics"][0]["details"]["budget"], 1);
            assert_eq!(result["diagnostics"][0]["details"]["unitsUsed"], 2);
        }
        assert_eq!(queries.get(), expected_queries);
    }
    assert!(
        budgets.borrow().is_empty(),
        "no historical wall query is issued"
    );
}
