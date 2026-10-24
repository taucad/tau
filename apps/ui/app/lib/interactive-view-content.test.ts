import { describe, expect, it } from 'vitest';
import type { AppCapabilitiesManifest } from '#types/runtime-client.alias.js';
import { interactiveViewContent } from '#lib/interactive-view-content.js';

const capabilities: Pick<AppCapabilitiesManifest, 'renderCapabilities'> = {
  renderCapabilities: {
    native: {
      renderOptions: { schema: {}, defaults: {} },
      content: {
        schema: { properties: { includeEdges: { type: 'boolean' } } },
        defaults: { includeEdges: false },
      },
    },
    plain: { renderOptions: { schema: {}, defaults: {} } },
  },
};

describe('interactiveViewContent', () => {
  it('requests supported GLB edges exactly when they are shown, independently from their runtime default', () => {
    expect(
      interactiveViewContent({ mimeType: 'model/gltf-binary', kernelId: 'native', capabilities, edgesShown: true }),
    ).toEqual({ includeEdges: true });
    expect(
      interactiveViewContent({ mimeType: 'model/gltf-binary', kernelId: 'native', capabilities, edgesShown: false }),
    ).toEqual({ includeEdges: false });
  });
  it('preserves SVG and unsupported routes without GLB-only content', () => {
    expect(
      interactiveViewContent({ mimeType: 'image/svg+xml', kernelId: 'native', capabilities, edgesShown: true }),
    ).toBeUndefined();
    expect(
      interactiveViewContent({ mimeType: 'model/gltf-binary', kernelId: 'plain', capabilities, edgesShown: true }),
    ).toBeUndefined();
    expect(
      interactiveViewContent({ mimeType: 'model/gltf-binary', kernelId: undefined, capabilities, edgesShown: true }),
    ).toBeUndefined();
  });
});
