import { Extension } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

// NOTE: Stub implementation to suppress gltf-transform warnings.
class FbNgonEncodingExtension extends Extension {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- valid property
  public static override EXTENSION_NAME = 'FB_ngon_encoding';
  public override extensionName = 'FB_ngon_encoding';
  public override write(): this {
    return this;
  }

  public override read(): this {
    return this;
  }
}

export const allExtensions = [...KHRONOS_EXTENSIONS, FbNgonEncodingExtension];
