import { readFileSync } from 'node:fs';

import { Document, NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import type { JSONObject } from '@taucad/runtime/types';
import { TauCadTopology } from '#extensions/tau-cad-topology.js';
import type { TauCadTopologyRoot } from '#extensions/tau-cad-topology.js';

describe('TauCadTopology', () => {
  it('should read back a payload carrying a mechanism unchanged through GLB bytes', async () => {
    const payload = JSON.parse(
      readFileSync(new URL('../../schema/tau-cad-topology.v1.fixture.json', import.meta.url), 'utf8'),
    ) as JSONObject;
    const document = new Document();
    const extension = document.createExtension(TauCadTopology);
    document.getRoot().setExtension(tauCadTopologyExtension, extension.createRoot().setPayload(payload));
    const io = new NodeIO().registerExtensions([TauCadTopology]);

    const read = await io.readBinary(await io.writeBinary(document));

    expect(payload['mechanism']).toMatchObject({ root: 'cover', units: { length: 'm', angle: 'deg' } });
    expect(read.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension)?.getPayload()).toEqual(payload);
  });
});
