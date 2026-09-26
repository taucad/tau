//! Concurrent STEP admissions on separate documents return the serial bytes.
//! No process lock: a one-time reader warm-up initializes OCCT's data-exchange
//! globals, and each admission reads its parameters from its own model.

use geospec_engine_native_occt::{BrepSubject, Document};
use std::{
    path::PathBuf,
    sync::{Arc, Barrier},
};

const FIXTURES: [&str; 4] = [
    "two-cube-assembly.step",
    "nist-pmi-bspline.step",
    "inch-cube.step",
    "subject-and-cavity-target.step",
];

fn fixture(name: &str) -> Vec<u8> {
    std::fs::read(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .expect("retained fixture must be readable")
}

// Admission, structure and source numerics. Debug text distinguishes every
// finite f64, including signed zero.
fn admitted(bytes: &[u8]) -> String {
    let document = Document::from_step(bytes).unwrap();
    format!(
        "{:?}\n{:?}\n{:?}\n{:?}",
        document.admission_facts().unwrap(),
        document.step_subject_metadata().unwrap(),
        document.facts().unwrap(),
        document.source_occurrences().unwrap()
    )
}

#[test]
fn concurrent_admissions_return_the_serial_bytes() {
    let inputs: Arc<Vec<Vec<u8>>> = Arc::new(FIXTURES.iter().map(|name| fixture(name)).collect());
    // The first admissions race too: no serial read happens before the threads.
    let barrier = Arc::new(Barrier::new(4));
    let threads: Vec<_> = (0..4)
        .map(|thread| {
            let inputs = Arc::clone(&inputs);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                (0..24)
                    .map(|round| {
                        let index = (thread + round) % inputs.len();
                        (index, admitted(&inputs[index]))
                    })
                    .collect::<Vec<_>>()
            })
        })
        .collect();
    let concurrent: Vec<_> = threads
        .into_iter()
        .flat_map(|thread| thread.join().unwrap())
        .collect();

    let expected: Vec<String> = inputs.iter().map(|bytes| admitted(bytes)).collect();
    for (index, bytes) in &concurrent {
        assert_eq!(bytes, &expected[*index], "{}", FIXTURES[*index]);
    }
}
