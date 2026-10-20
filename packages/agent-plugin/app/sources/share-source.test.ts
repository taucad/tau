import type { TauViewerDirectShare, TauViewerModel } from '@taucad/mcp/viewer-protocol';
import { shareArtifactCodec } from '@taucad/project-core/share-artifact';
import { parseShareUrl } from '@taucad/project-core/share-locator';
import type { ShareProjectSnapshot } from '@taucad/project-core/share-snapshot';
import type { ShareLinkProtection } from '@taucad/workbench-panes/share/share-source';
import { describe, expect, it, vi } from 'vitest';
import type { HostBridge } from '#app/host-bridge.js';
import { appShareLinkTool, createShareSource } from '#app/sources/share-source.js';

const model: TauViewerModel = {
  id: 'model-1',
  title: 'bracket',
  path: '.tau/artifacts/bracket.glb',
  sourceFile: 'bracket.ts',
  mimeType: 'model/gltf-binary',
  byteLength: 10,
  sha256: '0'.repeat(64),
};

const password = 'correct horse battery staple 12345';
const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const snapshot: ShareProjectSnapshot = {
  entryPath: 'main.ts',
  files: [
    { path: 'main.ts', content: bytes('export default 1;'), sha256: 'main', role: 'entry' },
    { path: 'tau.json', content: bytes('{}'), sha256: 'manifest', role: 'project-metadata' },
  ],
  warnings: [],
};
const directAnswer = (encodedArchive: string, warnings: TauViewerDirectShare['warnings']): TauViewerDirectShare => ({
  kind: 'direct',
  origin: 'https://tau.new',
  entryPath: 'main.ts',
  encodedArchive,
  closure: 'project-files',
  fileCount: 2,
  uncompressedBytes: 19,
  archiveBytes: 200,
  warnings,
});

const bridgeAnswering = (answer: () => Promise<unknown>): HostBridge & { callTool: ReturnType<typeof vi.fn> } =>
  ({ callTool: vi.fn(answer) }) as unknown as HostBridge & {
    callTool: ReturnType<typeof vi.fn>;
  };

const request = {
  protection: { kind: 'none' },
  options: {},
  signal: new AbortController().signal,
} as const;

const shareWith = async (
  bridge: HostBridge,
  id = 'direct',
  protection: ShareLinkProtection = request.protection,
): Promise<unknown> => {
  const method = createShareSource(bridge, model).methods.find((candidate) => candidate.id === id);
  if (method?.kind !== 'link') {
    throw new Error(`expected a ${id} link method`);
  }
  return method.share({ ...request, protection });
};

describe('createShareSource', () => {
  it('should offer the direct link, with a password, as its one method', () => {
    const { methods } = createShareSource(
      bridgeAnswering(async () => ({})),
      model,
    );

    expect(methods.map(({ id, label }) => [id, label])).toEqual([['direct', 'Direct link']]);
    expect(methods[0]).toMatchObject({
      kind: 'link',
      description: 'Create a self-contained link that works without a Tau account or storage.',
      notice: { title: 'No upload through Tau' },
      encryption: { minBytes: 32, maxBytes: 128 },
      action: { label: 'Copy direct link' },
      copiedMessage: 'Direct link copied',
    });
  });

  it('should make the direct link from the project the server packed', async () => {
    const { encodedArchive } = await shareArtifactCodec.pack(snapshot);
    const bridge = bridgeAnswering(async () => directAnswer(encodedArchive, []));

    const outcome = (await shareWith(bridge, 'direct')) as { readonly url: string };

    expect(bridge.callTool).toHaveBeenCalledWith(appShareLinkTool, { modelId: 'model-1' });
    expect(outcome).toEqual({ url: `https://tau.new/s/direct#v=2&zip=${encodedArchive}`, warning: undefined });
    const { pathname, hash } = new URL(outcome.url);
    const { locator, secrets } = parseShareUrl({ slug: pathname.slice('/s/'.length), fragment: hash });
    expect(locator).toEqual({ providerId: 'direct' });
    const opened = await shareArtifactCodec.openPlain(secrets['zip']!);
    expect(opened.files.map(({ path }) => path)).toEqual(['main.ts', 'tau.json']);
  });

  it('should seal the direct link under the password in the page, never sending it', async () => {
    const { encodedArchive } = await shareArtifactCodec.pack(snapshot);
    const bridge = bridgeAnswering(async () =>
      directAnswer(encodedArchive, [{ code: 'UNRESOLVED_DEPENDENCY', message: 'x' }]),
    );

    const outcome = (await shareWith(bridge, 'direct', {
      kind: 'password',
      password,
      includePassword: false,
    })) as { readonly url: string; readonly warning?: string };

    expect(JSON.stringify(bridge.callTool.mock.calls)).not.toContain(password);
    expect(outcome.warning).toBe('Shared with 1 unresolved dependency.');
    const { hash } = new URL(outcome.url);
    const { secrets } = parseShareUrl({ slug: 'direct', fragment: hash });
    expect(Object.keys(secrets).sort()).toEqual(['jwe', 'v']);
    const opened = await shareArtifactCodec.openWithPassword({ compactJwe: secrets['jwe']!, password });
    expect(opened.files.map(({ path }) => path)).toEqual(['main.ts', 'tau.json']);
  });

  it('should pass on a direct link refusal as the error sentence', async () => {
    await expect(
      shareWith(
        bridgeAnswering(async () => ({ errorCode: 'SHARE_ARTIFACT_LIMIT', message: 'Too large.' })),
        'direct',
      ),
    ).resolves.toEqual({ error: 'Too large.' });
  });
});
