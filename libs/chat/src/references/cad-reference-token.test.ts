import { describe, expect, it } from 'vitest';
import type { GeometryComponentReference } from '@taucad/types';
import { entryPatchSchema } from '#schemas/tools/arrange-workbench.parts.js';
import { cadReferenceSchema } from '#references/cad-reference.schema.js';
import {
  cadReferenceFromGeometryComponent,
  cadReferenceFromToken,
  cadReferenceToken,
  formatCadReferenceToken,
  parseCadReferenceTokens,
} from '#references/cad-reference-token.js';

const sunGear: GeometryComponentReference = {
  scheme: 'tau-cad',
  filePath: 'gears/main.ts',
  componentId: 'component:sun_gear',
  selector: 'node/3',
  geometryHash: 'abc123',
  label: 'Sun gear',
  kind: 'part',
};

describe('cadReferenceFromGeometryComponent', () => {
  it('keeps every field the viewer built, as the D6 shape', () => {
    const reference = cadReferenceFromGeometryComponent(sunGear);
    expect(reference).toEqual({
      resource: { kind: 'workspace-file', path: 'gears/main.ts', revision: 'abc123' },
      target: {
        kind: 'component',
        componentId: 'component:sun_gear',
        selector: 'node/3',
        label: 'Sun gear',
        componentKind: 'part',
      },
    });
    expect(cadReferenceSchema.parse(reference)).toEqual(reference);
  });

  it('names the component by the id arrange_workbench hides and isolates', () => {
    const { target, resource } = cadReferenceFromGeometryComponent(sunGear);
    const patch = entryPatchSchema.parse({
      path: resource.path,
      components: { hidden: [target.componentId], isolated: [target.componentId] },
    });
    expect(patch.components?.isolated).toEqual(['component:sun_gear']);
  });
});

describe('cad reference tokens', () => {
  it('renders the token the workbench chip always wrote', () => {
    expect(cadReferenceToken(cadReferenceFromGeometryComponent(sunGear))).toBe(
      '@cad[gears/main.ts#component:sun_gear]',
    );
  });

  it('parses tokens out of text and keeps the rest as text', () => {
    const text = 'Make @cad[gears/main.ts#component:sun_gear] wider than @cad[b.ts#x], not foo@cad[c.ts#y].';
    const segments = parseCadReferenceTokens(text);
    expect(segments).toEqual([
      { type: 'text', value: 'Make ' },
      {
        type: 'cadReference',
        token: '@cad[gears/main.ts#component:sun_gear]',
        target: { path: 'gears/main.ts', componentId: 'component:sun_gear' },
      },
      { type: 'text', value: ' wider than ' },
      { type: 'cadReference', token: '@cad[b.ts#x]', target: { path: 'b.ts', componentId: 'x' } },
      { type: 'text', value: ', not foo@cad[c.ts#y].' },
    ]);
    expect(segments.map((segment) => (segment.type === 'text' ? segment.value : segment.token)).join('')).toBe(text);
  });

  it('round-trips paths and ids that contain the delimiters', () => {
    const target = { path: 'odd [v2]#/main.ts', componentId: 'node]#1' };
    const token = formatCadReferenceToken(target);
    expect(token).toBe(String.raw`@cad[odd \[v2\]\#/main.ts#node\]#1]`);
    expect(parseCadReferenceTokens(`(${token})`)[1]).toEqual({ type: 'cadReference', token, target });
  });

  it('leaves malformed tokens as text', () => {
    expect(parseCadReferenceTokens('@cad[no-hash] @cad[a.ts#] @cad[#x]')).toEqual([
      { type: 'text', value: '@cad[no-hash] @cad[a.ts#] @cad[#x]' },
    ]);
  });

  it('builds a minimal reference from a bare token', () => {
    expect(cadReferenceFromToken({ path: 'a.ts', componentId: 'component:sun_gear' })).toEqual({
      resource: { kind: 'workspace-file', path: 'a.ts' },
      target: { kind: 'component', componentId: 'component:sun_gear', label: 'sun_gear', componentKind: 'unknown' },
    });
  });
});
