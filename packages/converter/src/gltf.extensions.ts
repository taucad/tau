import { Extension } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

// NOTE: Stub implementation to suppress gltf-transform warnings.
class FbNgonEncodingExtension extends Extension {
  static override EXTENSION_NAME = 'FB_ngon_encoding';
  override extensionName = 'FB_ngon_encoding';
  override write() {
    return this;
  }

  override read() {
    return this;
  }
}

export const allExtensions = [...KHRONOS_EXTENSIONS, FbNgonEncodingExtension];
