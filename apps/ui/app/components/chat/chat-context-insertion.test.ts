import { describe, expect, it } from 'vitest';
import { geometryReferenceToToken } from '#components/chat/chat-context-insertion.js';

describe('geometryReferenceToToken', () => {
  it('should serialize geometry references as @cad[file#component] tokens', () => {
    expect(
      geometryReferenceToToken({
        scheme: 'tau-cad',
        filePath: 'main.ts',
        componentId: 'component:sun_gear',
        selector: '/nodes/3',
        label: 'Sun Gear',
        kind: 'part',
      }),
    ).toBe('@cad[main.ts#component:sun_gear]');
  });
});
