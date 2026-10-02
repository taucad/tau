import { describe, expect, it } from 'vitest';
import { asKnownArtifact } from '#types/runtime-artifact.js';

describe('known artifact admission', () => {
  it('validates and narrows complete SVG and nonempty GLB content', () => {
    expect(asKnownArtifact({ mimeType: 'image/svg+xml', content: ' <svg></svg> ' })).toEqual({
      mimeType: 'image/svg+xml',
      content: '<svg></svg>',
    });
    expect(
      asKnownArtifact({ mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' })?.content,
    ).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(
      asKnownArtifact({ mimeType: 'image/svg+xml', content: '<?xml version="1.0"?><svg><path/></svg>' })?.content,
    ).toBe('<?xml version="1.0"?><svg><path/></svg>');
    const bytes = new Uint8Array([1]);
    expect(asKnownArtifact({ mimeType: 'model/gltf-binary', content: bytes })?.content).toBe(bytes);
  });

  it('rejects malformed known media and leaves unknown media opaque', () => {
    expect(() => asKnownArtifact({ mimeType: 'image/svg+xml', content: new Uint8Array([1]) })).toThrow(TypeError);
    expect(() => asKnownArtifact({ mimeType: 'image/svg+xml', content: '<svg>' })).toThrow(TypeError);
    expect(() => asKnownArtifact({ mimeType: 'image/svg+xml', content: '<svgx/>' })).toThrow(TypeError);
    expect(() => asKnownArtifact({ mimeType: 'model/gltf-binary', content: 'glb' })).toThrow(TypeError);
    expect(() => asKnownArtifact({ mimeType: 'model/gltf-binary', content: new Uint8Array() })).toThrow(TypeError);
    expect(asKnownArtifact({ mimeType: 'application/x-cad', content: 'opaque' })).toBeUndefined();
  });
});
