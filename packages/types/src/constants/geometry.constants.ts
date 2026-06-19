/**
 * Tau glTF extension carrying CAD component and topology metadata.
 *
 * The extension is optional for mesh-only consumers. Tau uses it when present
 * to map rendered meshes back to CAD components, BRep face/edge ids, and
 * component-level capabilities.
 *
 * @public
 */
export const tauCadTopologyExtension = 'TAU_cad_topology';

/**
 * Zoo/KittyCAD glTF extension carrying source BREP topology.
 *
 * Tau preserves this provider-authored extension and translates it into
 * `TAU_cad_topology` for render-time component interaction.
 *
 * @public
 */
export const kittyCadBoundaryRepresentationExtension = 'KITTYCAD_boundary_representation';
