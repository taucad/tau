// robust/cells_extract.rs — Turning the arrangement's cell labels into the
// result's boundary.
//
// Split out of `cells.rs` (which builds the cell complex and propagates the
// winding numbers) purely to keep both files within the project's file-length
// limit; the two halves are re-exported as one `cells` API. Everything here
// depends on `cells` for the complex, the walls, and the per-cell windings,
// and on `intersection_graph` for the pieces it emits.

use super::cells::{CellComplex, Wall, Windings, ANTI, NORMAL};
use super::intersection_graph::{IntersectionGraph, Piece};
use crate::types::{OpType, WindingRule};

/// Does a cell with this winding vector lie inside the operation's result?
///
/// The winding rule decides what "inside an operand" means: under
/// [`WindingRule::Positive`] each operand's solid is `{w ≥ 1}`, so a negative
/// winding is inverted geometry and never material; under
/// [`WindingRule::Nonzero`] it is `{w ≠ 0}`, so an inside-out region counts as
/// solid. Only this predicate changes — the winding numbers themselves are
/// rule-independent.
///
/// Expressing every operation as one predicate on the winding vector is what
/// lets subtraction drop its operand-flip trick: P − Q is just "inside P and
/// not inside Q".
pub fn in_result(op: OpType, rule: WindingRule, w: [i32; 2]) -> bool {
    let inside = |v: i32| match rule {
        WindingRule::Positive => v >= 1,
        WindingRule::Nonzero => v != 0,
    };
    let (a, b) = (inside(w[0]), inside(w[1]));
    match op {
        OpType::Add => a || b,
        OpType::Intersect => a && b,
        OpType::Subtract => a && !b,
    }
}

/// The boundary of the result: every wall whose two cells disagree about
/// containment, wound so its normal points out of the solid.
///
/// Orientation is *derived* from the cell labels rather than inherited from
/// the input face. That is what makes the output closed and consistently
/// oriented no matter how the input was wound — an inverted region of a
/// self-intersecting scan still lands in the right cells, and its emitted
/// orientation is corrected on the way out. One representative per wall is
/// emitted, so a coincident stack contributes a single face.
pub fn extract(
    graph: &IntersectionGraph,
    complex: &CellComplex,
    wind: &Windings,
    op: OpType,
    rule: WindingRule,
) -> Vec<Piece> {
    let mut out = Vec::new();
    for &Wall { rep, .. } in &complex.walls {
        let (cn, ca) = (complex.cell(rep, NORMAL), complex.cell(rep, ANTI));
        if cn == ca || !wind.known[cn] || !wind.known[ca] {
            continue;
        }
        let (in_n, in_a) = (
            in_result(op, rule, wind.w[cn]),
            in_result(op, rule, wind.w[ca]),
        );
        if in_n == in_a {
            continue; // same material both sides: not a boundary
        }
        let piece = &graph.pieces[rep];
        // The representative's normal points from its anti side toward its
        // normal side. Material belongs behind the emitted normal, so the
        // winding reverses when the solid is on the normal side instead.
        let vi = if in_a {
            piece.vi
        } else {
            [piece.vi[0], piece.vi[2], piece.vi[1]]
        };
        out.push(Piece {
            mesh: piece.mesh,
            tri: piece.tri,
            vi,
        });
    }
    out
}
