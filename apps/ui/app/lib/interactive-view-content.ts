import type { RuntimeContentInput } from '@taucad/runtime';
import type { AppCapabilitiesManifest } from '#types/runtime-client.alias.js';

/**
 * Content for an interactive view: on a GLB route that advertises auxiliary lines, ask for them
 * exactly when a viewer shows them, so hidden edges cost no edge pass. The answer is explicit
 * either way, so a view can switch lines on and off by updating its request.
 */
export function interactiveViewContent({
  mimeType,
  kernelId,
  capabilities,
  edgesShown,
}: Readonly<{
  mimeType: string | undefined;
  kernelId: string | undefined;
  capabilities: Pick<AppCapabilitiesManifest, 'renderCapabilities'> | undefined;
  /** Whether a viewer shows the lines. */
  edgesShown: boolean;
}>): RuntimeContentInput | undefined {
  return mimeType === 'model/gltf-binary' &&
    kernelId !== undefined &&
    capabilities?.renderCapabilities[kernelId]?.content?.schema.properties?.['includeEdges'] !== undefined
    ? { includeEdges: edgesShown }
    : undefined;
}
