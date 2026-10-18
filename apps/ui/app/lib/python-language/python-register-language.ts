import { codeLanguages } from '@taucad/types/constants';
import type * as Monaco from 'monaco-editor';
import type { ActivationResult, LanguageContribution } from '#lib/monaco-language-registry.js';

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

const createKernelCompletionProvider = (monaco: typeof Monaco): Monaco.languages.CompletionItemProvider => ({
  provideCompletionItems(model, position) {
    const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    const match = /(?:\bfrom\s+(build123d|smlibpy)\s+import\s+[\w, ]*|\b(build123d|smlibpy)\.\w*)$/u.exec(line);
    // The kernel module completes its own stubs after `from <module> import` or `<module>.`.
    const module = match?.[1] ?? match?.[2];
    const kernel =
      module === 'smlibpy'
        ? { module, stubs: smlibpyAuthoringStubs }
        : module === 'build123d'
          ? { module, stubs: build123dAuthoringStubs }
          : undefined;
    if (kernel === undefined) {
      return { suggestions: [] };
    }
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
    return {
      suggestions: kernel.stubs.map(([label, documentation]) => ({
        label,
        insertText: label,
        detail: `${kernel.module}.${label}`,
        documentation,
        kind: /^[a-z]/u.test(label)
          ? monaco.languages.CompletionItemKind.Function
          : monaco.languages.CompletionItemKind.Class,
        range,
      })),
    };
  },
});

/** Monaco's installed Python contribution owns syntax and language configuration. */
export const pythonContribution: LanguageContribution = {
  languageId: codeLanguages.python,
  activationLanguageIds: [codeLanguages.python],
  register: () => undefined,
  activate: ({ monaco }): ActivationResult => ({
    disposables: [
      monaco.languages.registerCompletionItemProvider(codeLanguages.python, createKernelCompletionProvider(monaco)),
    ],
  }),
  dispose: () => undefined,
};
