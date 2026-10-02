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
  it('requests supported GLB edges independently from their runtime default', () => {
    expect(interactiveViewContent('model/gltf-binary', 'native', capabilities)).toEqual({ includeEdges: true });
  });
  it('preserves SVG and unsupported routes without GLB-only content', () => {
    expect(interactiveViewContent('image/svg+xml', 'native', capabilities)).toBeUndefined();
    expect(interactiveViewContent('model/gltf-binary', 'plain', capabilities)).toBeUndefined();
    expect(interactiveViewContent('model/gltf-binary', undefined, capabilities)).toBeUndefined();
  });
});
