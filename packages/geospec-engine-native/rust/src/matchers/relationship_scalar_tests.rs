//! Ordinary source-expression controls, frozen before candidate execution.

use super::*;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub(crate) fn oracle() -> Value {
    let path = std::env::var_os("GEOSPEC_RELATIONSHIP_SCALAR_ORACLE")
        .expect("Lead must supply the frozen Node24 scalar oracle in the copied closure");
    let bytes = std::fs::read(path).unwrap();
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        "00bafc084df907d00ce008466ab7b0eb933cd38eed5df6d6569165c738bc6dd4"
    );
    serde_json::from_slice(&bytes).unwrap()
}

pub(crate) fn vector(value: &Value) -> [f64; 3] {
    std::array::from_fn(|index| value[index].as_f64().unwrap())
}

pub(crate) fn observe(
    rows: &mut Vec<Value>,
    control: &str,
    operation: &str,
    actual: &[f64],
    expected: &Value,
) {
    let actual_bits: Vec<_> = actual
        .iter()
        .map(|v| format!("{:016x}", v.to_bits()))
        .collect();
    let expected_bits = match &expected["bits"] {
        Value::Array(bits) => bits.iter().map(|v| v.as_str().unwrap()).collect::<Vec<_>>(),
        Value::String(bits) => vec![bits.as_str()],
        _ => panic!("oracle operation must have frozen IEEE bits"),
    };
    rows.push(
        json!({"control":control,"operation":operation,"actual":actual,
        "actualBits":actual_bits,"expected":expected,"passed":actual_bits==expected_bits}),
    );
}

pub(crate) fn finish(name: &str, rows: Vec<Value>) {
    let passed = rows.iter().all(|row| row["passed"] == true);
    let report =
        json!({"test":name,"observationCount":rows.len(),"passed":passed,"observations":rows});
    println!("{report}");
    if let Some(root) = std::env::var_os("GEOSPEC_RELATIONSHIP_SCALARS_EVIDENCE_DIR") {
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            std::path::Path::new(&root).join(format!("{name}.json")),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
    }
    assert!(
        passed,
        "{name}: exact Node24 scalar gate failed; all observations printed first"
    );
}

fn relationship(kind: &str) -> Relationship {
    parse_relationship(
        &Json::object([
            ("kind", Json::string(kind)),
            ("subject", Json::string("subject")),
            ("target", Json::string("target")),
        ]),
        0,
    )
    .unwrap()
}

fn endpoint(origin: [f64; 3], direction: [f64; 3]) -> Endpoint {
    Endpoint {
        occurrence: Some(0),
        entity: BrepEntity::Face {
            occurrence: 0,
            face: 0,
        },
        facts: EntityFacts {
            axis_origin: Some(origin),
            axis_direction: Some(direction),
            ..EntityFacts::default()
        },
        bore: None,
    }
}

fn measured(proof: &Proof, key: &str) -> f64 {
    let measured = json_field(&proof.final_evidence, "measured").unwrap();
    let Some(Json::Number(value)) = json_field(&measured, key) else {
        panic!("numeric measured value required")
    };
    value
}

#[test]
fn relationship_scalar_orders_match_frozen_node24() {
    let oracle = oracle();
    let mut rows = Vec::new();
    for row in oracle["vectors"].as_array().unwrap() {
        let id = row["id"].as_str().unwrap();
        let a = vector(&row["a"]);
        let b = vector(&row["b"]);
        let expected = &row["expected"];
        let lengths = length(a) * length(b);
        let cosine = if lengths == 0.0 {
            1.0
        } else {
            (dot(a, b).abs() / lengths).min(1.0)
        };
        let contact_cosine = dot(unit(a), unit(b)).clamp(-1.0, 1.0);
        for (key, actual) in [
            ("lengthA", length(a)),
            ("lengthB", length(b)),
            ("dot", dot(a, b)),
            ("lengths", lengths),
            ("cosine", cosine),
            ("folded", folded_angle(a, b)),
            ("contactCosine", contact_cosine),
            (
                "contactAngle",
                relationship_degrees((-contact_cosine).acos()),
            ),
        ] {
            observe(&mut rows, id, key, &[actual], &expected[key]);
        }
        observe(&mut rows, id, "unitA", &unit(a), &expected["unitA"]);
        observe(&mut rows, id, "unitB", &unit(b), &expected["unitB"]);
        // Isolate acos/degrees from any earlier norm mismatch using the frozen source cosine.
        observe(
            &mut rows,
            id,
            "sourceCosine.folded",
            &[relationship_degrees(
                expected["cosine"]["value"].as_f64().unwrap().acos(),
            )],
            &expected["folded"],
        );
        let proof = prove_direction_angle(
            &relationship("parallel"),
            &[endpoint([0.0; 3], a)],
            &[endpoint([0.0; 3], b)],
        )
        .unwrap_or_else(|_| panic!("ordinary analytic directions must be measurable"));
        observe(
            &mut rows,
            id,
            "proof.angle",
            &[measured(&proof, "angle")],
            &expected["folded"],
        );
        // Diagnostic only: binary std hypot composition is not substituted for Math.hypot3.
        println!(
            "std-hypot-chain {id} a={:016x} b={:016x}",
            a[0].hypot(a[1]).hypot(a[2]).to_bits(),
            b[0].hypot(b[1]).hypot(b[2]).to_bits()
        );
    }
    finish("relationship-scalar-orders", rows);
}

#[test]
fn coaxial_original_axis_intermediates_match_frozen_node24() {
    let oracle = oracle();
    let mut rows = Vec::new();
    for row in oracle["axes"].as_array().unwrap() {
        let id = row["id"].as_str().unwrap();
        let a = vector(&row["originA"]);
        let b = vector(&row["originB"]);
        let direction = vector(&row["direction"]);
        let expected = &row["expected"];
        let offset = subtract(b, a);
        let denominator = dot(direction, direction);
        let denominator = if denominator == 0.0 { 1.0 } else { denominator };
        let along = dot(offset, direction) / denominator;
        let residual = subtract(offset, scale(direction, along));
        observe(&mut rows, id, "offset", &offset, &expected["offset"]);
        observe(
            &mut rows,
            id,
            "denominator",
            &[denominator],
            &expected["denominator"],
        );
        observe(&mut rows, id, "along", &[along], &expected["along"]);
        observe(&mut rows, id, "residual", &residual, &expected["residual"]);
        let proof = prove_coaxial(
            &relationship("coaxial"),
            &[endpoint(a, direction)],
            &[endpoint(b, direction)],
        )
        .unwrap_or_else(|_| panic!("ordinary analytic axes must be measurable"));
        observe(
            &mut rows,
            id,
            "proof.radialOffset",
            &[measured(&proof, "radialOffset")],
            &expected["radial"],
        );
    }
    finish("coaxial-original-axis", rows);
}
