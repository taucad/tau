import type { GeometryComponentManifest, GeometryComponentNode, GeometryComponentReference } from '@taucad/types';

/**
 * The structured reference to one rendered component: the node's own reference when the kernel supplied one,
 * otherwise one built from the manifest's source file. A manifest without a source file cannot be referenced.
 *
 * @param manifest - The component manifest of the rendered geometry.
 * @param node - The component to reference.
 * @returns The reference, or `undefined` when the geometry has no source file.
 * @public
 */
export function buildGeometryComponentReference(
  manifest: GeometryComponentManifest,
  node: GeometryComponentNode,
): GeometryComponentReference | undefined {
  if (node.reference) {
    return node.reference;
  }
  if (!manifest.sourceFile) {
    return undefined;
  }
  return {
    scheme: 'tau-cad',
    filePath: manifest.sourceFile,
    componentId: node.id,
    selector: node.selector,
    geometryHash: manifest.geometryHash,
    label: node.name,
    kind: node.kind,
  };
}
