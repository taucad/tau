import type { RuntimeContentInput } from '@taucad/runtime';
import type { AppCapabilitiesManifest } from '#types/runtime-client.alias.js';

/** Request interactive edges and physical facts only when the selected GLB route advertises them. */
export function interactiveViewContent(
  mimeType: string | undefined,
  kernelId: string | undefined,
  capabilities: Pick<AppCapabilitiesManifest, 'renderCapabilities'> | undefined,
): RuntimeContentInput | undefined {
  if (mimeType !== 'model/gltf-binary' || kernelId === undefined) {
    return undefined;
  }
  const properties = capabilities?.renderCapabilities[kernelId]?.content?.schema.properties;
  const includeEdges = properties?.['includeEdges'] !== undefined;
  const includePhysical = properties?.['includePhysical'] !== undefined;
  return includeEdges || includePhysical
    ? { ...(includeEdges ? { includeEdges: true } : {}), ...(includePhysical ? { includePhysical: true } : {}) }
    : undefined;
}
