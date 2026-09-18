import { describe, expectTypeOf, it } from 'vitest';
import type {
  CadOwnedSettings,
  CameraOwnedSettings,
  GraphicsOwnedSettings,
  GraphicsViewSettings,
} from '#constants/editor.constants.js';

/**
 * Law 1 of the persisted view settings ownership blueprint: every persisted field has exactly one
 * live owner. A durable key added without an owner fails this row, naming the key.
 */
describe('persisted graphics view settings ownership', () => {
  it('should partition every durable key across the three live owners', () => {
    type OwnedKeys = keyof (GraphicsOwnedSettings & CameraOwnedSettings & CadOwnedSettings);

    expectTypeOf<OwnedKeys>().toEqualTypeOf<keyof Omit<GraphicsViewSettings, 'schemaVersion'>>();
  });
});
