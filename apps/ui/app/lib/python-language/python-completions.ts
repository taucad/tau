import type { CompletionSource } from '@codemirror/autocomplete';

const build123dAuthoringStubs = [
  ['Shape', 'Base Build123d topology shape'],
  ['Solid', 'Build and inspect solid BRep geometry'],
  ['Compound', 'Group child shapes into an assembly'],
  ['Part', 'Build123d part container'],
  ['Box', 'Create a parametric box'],
  ['Cylinder', 'Create a parametric cylinder'],
  ['Sphere', 'Create a parametric sphere'],
  ['Plane', 'Construction plane and local coordinate system'],
  ['Sketch', 'Two-dimensional sketch geometry'],
  ['BuildPart', 'Context builder for parts'],
  ['BuildSketch', 'Context builder for sketches'],
  ['Location', 'Rigid placement transform'],
  ['Color', 'Shape display color'],
  ['RigidJoint', 'Attach a named fixed interface to a native part'],
  ['RevoluteJoint', 'Attach a rotary joint with a native reference frame'],
  ['LinearJoint', 'Attach a sliding joint with optional travel limits'],
  ['CylindricalJoint', 'Attach a joint allowing sliding and rotation'],
  ['BallJoint', 'Attach a spherical joint to a native part'],
  ['Select', 'Select topology including native NEW and LAST history'],
  ['export_gltf', 'Export native geometry and materials to glTF'],
  ['export_step', 'Export retained BRep geometry to STEP'],
] as const;

const smlibpyAuthoringStubs = [
  ['Part', 'SMLib NURBS solid with booleans, fillets, chamfers and shells'],
  ['Sketch', 'Planar region to extrude, revolve or sweep'],
  ['Box', 'Create a box centered on the origin'],
  ['Cylinder', 'Create a cylinder centered on the origin'],
  ['Sphere', 'Create a sphere centered on the origin'],
  ['Rectangle', 'Create a rectangle sketch, optionally filleted'],
  ['Circle', 'Create a circle sketch'],
  ['Polygon', 'Create a polygon sketch from points'],
  ['Align', 'Place a new shape by its bounds on each axis'],
  ['Plane', 'Construction plane: Plane.XY, Plane.XZ, offset and placement'],
  ['Pos', 'Translation location; Pos(x, y, z) * shape'],
  ['Rot', 'Rotation location in degrees; Rot(x, y, z) * shape'],
  ['GridLocations', 'Grid of locations; GridLocations(...) * shape'],
  ['PolarLocations', 'Circular pattern of locations'],
  ['Hole', 'Cylindrical cutter for a drilled hole'],
  ['loft', 'Loft a solid through profiles'],
  ['sweep', 'Sweep a profile along a path'],
  ['tessellate', 'Triangulate a shape at chordal and angular tolerances'],
] as const;

/** Local kernel-symbol hints; this is not a Python language server. */
export const pythonKernelCompletions: CompletionSource = (context) => {
  const line = context.state.doc.lineAt(context.pos);
  const prefix = line.text.slice(0, context.pos - line.from);
  const match = /(?:\bfrom\s+(build123d|smlibpy)\s+import\s+[\w, ]*|\b(build123d|smlibpy)\.\w*)$/u.exec(prefix);
  const module = match?.[1] ?? match?.[2];
  const stubs =
    module === 'smlibpy' ? smlibpyAuthoringStubs : module === 'build123d' ? build123dAuthoringStubs : undefined;
  if (!stubs) {
    return null;
  }
  const word = context.matchBefore(/\w*/u);
  return {
    from: word?.from ?? context.pos,
    options: stubs.map(([label, info]) => ({
      label,
      detail: `${module}.${label}`,
      info,
      type: /^[a-z]/u.test(label) ? 'function' : 'class',
    })),
  };
};
