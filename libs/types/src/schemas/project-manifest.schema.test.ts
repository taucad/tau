import { describe, expect, it } from 'vitest';
import * as publicManifest from '@taucad/project-core';
import * as privateManifest from '#schemas/project-manifest.schema.js';

describe('project manifest forwarding', () => {
  it('forwards the exact public project manifest authority', () => {
    expect(privateManifest.parseAdoptableProjectManifestBytes).toBe(publicManifest.parseAdoptableProjectManifestBytes);
    expect(privateManifest.parseProjectManifestBytes).toBe(publicManifest.parseProjectManifestBytes);
    expect(privateManifest.projectIdSchema).toBe(publicManifest.projectIdSchema);
    expect(privateManifest.projectManifestMaxBytes).toBe(publicManifest.projectManifestMaxBytes);
    expect(privateManifest.projectManifestSchema).toBe(publicManifest.projectManifestSchema);
    expect(privateManifest.projectManifestSchemaUrl).toBe(publicManifest.projectManifestSchemaUrl);
    expect(privateManifest.projectRelativePathSchema).toBe(publicManifest.projectRelativePathSchema);
    expect(privateManifest.projectToManifest).toBe(publicManifest.projectToManifest);
    expect(privateManifest.serializeProjectManifest).toBe(publicManifest.serializeProjectManifest);
  });

  it('round-trips through public and private entrypoints', () => {
    const manifest = publicManifest.projectToManifest({
      id: 'proj_0123456789ABCDEFGHIJK',
      name: 'Example',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.ts', thumbnail: 'thumbnail.webp' } },
    });

    expect(privateManifest.parseProjectManifestBytes(publicManifest.serializeProjectManifest(manifest))).toEqual({
      success: true,
      data: manifest,
    });
    expect(publicManifest.parseProjectManifestBytes(privateManifest.serializeProjectManifest(manifest))).toEqual({
      success: true,
      data: manifest,
    });
  });
});
