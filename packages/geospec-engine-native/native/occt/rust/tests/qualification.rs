//! The bridge's synthetic OCCT controls (`native/occt/tests/qualification.cpp`):
//! shapes STEP cannot carry, run against the bridge's own functions. The
//! `qualification` feature compiles the bridge through that translation unit.
extern crate geospec_engine_native_occt as _;

use std::ffi::{c_char, CString};

extern "C" {
    fn geospec_occt_qualify(name: *const c_char, message: *mut c_char, capacity: usize) -> i32;
}

fn qualify(control: &str) {
    let name = CString::new(control).unwrap();
    let mut message = [0 as c_char; 512];
    // SAFETY: both buffers outlive the call, which writes at most `capacity`
    // bytes, NUL-terminated, into `message`.
    let status =
        unsafe { geospec_occt_qualify(name.as_ptr(), message.as_mut_ptr(), message.len()) };
    // SAFETY: the control wrote a NUL-terminated message, or none (all zero).
    let text = unsafe { std::ffi::CStr::from_ptr(message.as_ptr()) }.to_string_lossy();
    assert_eq!(status, 0, "{control}: {text}");
}

#[test]
fn v1_skips_internal_edge_uses() {
    qualify("internal-edge-is-skipped");
}

#[test]
fn v1_counts_every_use_of_a_face() {
    qualify("face-used-twice-counts-every-use");
}

#[test]
fn v1_groups_the_free_faces_once() {
    qualify("free-faces-are-one-group");
}

#[test]
fn v1_counts_an_instanced_open_shell_once() {
    qualify("instanced-open-shell-counts-once");
}

#[test]
fn v1_names_each_failing_leaf_once_in_one_pass() {
    qualify("attribution-names-each-leaf-once");
}

#[test]
fn v1_never_proves_an_edgeless_or_faceless_shape_closed() {
    qualify("edgeless-and-faceless-prove-nothing-closed");
}

#[test]
fn v3_scaled_placements_fall_through_to_the_located_analyses() {
    qualify("scale-two-falls-through");
}

#[test]
fn v3_rigid_instances_answer_from_one_analysis() {
    qualify("rigid-instances-answer-from-one-analysis");
}

#[test]
fn v3_a_reversed_instance_is_not_answered_from_its_definition() {
    qualify("reversed-instance-falls-through");
}

#[test]
fn s4_wall_closure_ignores_the_stored_closed_flag() {
    qualify("wall-closure-ignores-the-stored-flag");
}

#[test]
fn admission_joins_products_and_owners_in_order() {
    qualify("product-owner-joins");
}

#[test]
fn m2_face_boxes_grow_by_their_tolerances_and_the_body_bounds_do_not() {
    qualify("component-face-boxes-grow-by-their-tolerances");
}

#[test]
fn the_report_prototype_copy_admits_only_disjoint_unshared_leaves() {
    qualify("prototype-copy-eligibility");
}
