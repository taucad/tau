import { describe, expect, it } from 'vitest';
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import { chatReferenceOf } from '#app/chat-reference.js';

const model: TauViewerModel = {
  id: 'm1',
  title: 'Gearbox',
  path: '.tau/artifacts/main.glb',
  sourceFile: 'gears/main.ts',
  mimeType: 'model/gltf-binary',
  byteLength: 1024,
  sha256: 'a'.repeat(64),
};

describe('chatReferenceOf', () => {
  it('carries the workbench reference object and its token for a picked component', () => {
    expect(
      chatReferenceOf(model, {
        scheme: 'tau-cad',
        filePath: 'gears/main.ts',
        componentId: 'component:sun_gear',
        selector: 'node/3',
        label: 'Sun gear',
        kind: 'part',
      }),
    ).toEqual({
      text: 'Sun gear in Gearbox @cad[gears/main.ts#component:sun_gear]',
      references: [
        {
          resource: { kind: 'workspace-file', path: 'gears/main.ts' },
          target: {
            kind: 'component',
            componentId: 'component:sun_gear',
            selector: 'node/3',
            label: 'Sun gear',
            componentKind: 'part',
          },
        },
      ],
    });
  });

  it('names the model and its file when nothing is picked', () => {
    expect(chatReferenceOf(model, undefined)).toEqual({ text: 'Gearbox (gears/main.ts)', references: [] });
  });
});
