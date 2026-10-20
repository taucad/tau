import { describe, expect, it } from 'vitest';
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import type { GeometryComponentReference } from '@taucad/types';
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

const sunGear: GeometryComponentReference = {
  scheme: 'tau-cad',
  filePath: 'gears/main.ts',
  componentId: 'component:sun_gear',
  selector: 'node/3',
  label: 'Sun gear',
  kind: 'part',
};

describe('chatReferenceOf', () => {
  it('carries the workbench reference object and its token for a picked component', () => {
    expect(chatReferenceOf(model, [sunGear])).toEqual({
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
    expect(chatReferenceOf(model, [])).toEqual({ text: 'Gearbox (gears/main.ts)', references: [] });
  });

  it('lists every added part, in the order added, with one token each', () => {
    const carrier: GeometryComponentReference = {
      scheme: 'tau-cad',
      filePath: 'gears/main.ts',
      componentId: 'component:carrier',
      selector: '',
      label: 'Carrier',
      kind: 'assembly',
    };

    const { text, references } = chatReferenceOf(model, [sunGear, carrier]);

    expect(text).toBe(
      'Sun gear, Carrier in Gearbox @cad[gears/main.ts#component:sun_gear] @cad[gears/main.ts#component:carrier]',
    );
    expect(references.map((reference) => reference.target.componentId)).toEqual([
      'component:sun_gear',
      'component:carrier',
    ]);
  });
});
