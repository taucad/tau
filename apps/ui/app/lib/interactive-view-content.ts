import type { RuntimeContentInput } from '@taucad/runtime';
import type { AppCapabilitiesManifest } from '#types/runtime-client.alias.js';

/** Request auxiliary lines only for a GLB route that advertises them. */
export function interactiveViewContent(
  mimeType: string | undefined,
  kernelId: string | undefined,
  capabilities: Pick<AppCapabilitiesManifest, 'renderCapabilities'> | undefined,
): RuntimeContentInput | undefined {
  return mimeType === 'model/gltf-binary' &&
    kernelId !== undefined &&
    capabilities?.renderCapabilities[kernelId]?.content?.schema.properties?.['includeEdges'] !== undefined
    ? { includeEdges: true }
    : undefined;
}
