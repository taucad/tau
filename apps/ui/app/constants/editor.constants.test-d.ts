import { describe, expectTypeOf, it } from 'vitest';
import type {
  CadOwnedSettings,
  CameraOwnedSettings,
  GraphicsOwnedSettings,
  GraphicsViewSettings,
  PersistedUnitSettings,
} from '#constants/editor.constants.js';

/**
 * Law 1 of the persisted view settings ownership blueprint: every persisted field has exactly one
 * live owner. A durable key added without an owner fails this row, naming the key.
 */
describe('persisted graphics view settings ownership', () => {
  it('should partition every durable view key between the graphics actor and the camera', () => {
    type OwnedViewKeys = keyof (GraphicsOwnedSettings & CameraOwnedSettings);

    expectTypeOf<OwnedViewKeys>().toEqualTypeOf<keyof Omit<GraphicsViewSettings, 'schemaVersion'>>();
  });

  it('should give every durable per-entry key to the entry CAD actor', () => {
    expectTypeOf<keyof CadOwnedSettings>().toEqualTypeOf<keyof PersistedUnitSettings>();
  });
});
