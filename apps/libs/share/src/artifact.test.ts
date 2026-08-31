import JSZip from 'jszip';
import { CompactEncrypt } from 'jose';
import { describe, expect, it } from 'vitest';
import { createShareArchive, openShareArchive, shareArtifactCodec } from '#artifact.js';
import type { ShareProjectSnapshot } from '#snapshot.js';

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const password = 'correct horse battery staple 12345';

const snapshot = (): ShareProjectSnapshot => ({
  entryPath: 'main.ts',
  files: [
    {
      path: '.tau/parameters/main.ts.json',
      content: bytes('{"activeGroup":"default","groups":{"default":{"values":{}}}}'),
      sha256: 'parameters',
      role: 'project-metadata',
    },
    { path: 'main.ts', content: bytes('export default 1;'), sha256: 'main', role: 'entry' },
    { path: 'tau.json', content: bytes('{"name":"Demo"}'), sha256: 'manifest', role: 'project-metadata' },
  ],
  warnings: [],
});

describe('portable share artifacts', () => {
  it('creates deterministic archives and round trips plain and password-protected artifacts', async () => {
    const first = await createShareArchive(snapshot());
    const second = await createShareArchive({ ...snapshot(), files: [...snapshot().files].reverse() });
    expect(first).toEqual(second);

    const packed = await shareArtifactCodec.pack(snapshot());
    const plainOpened = await shareArtifactCodec.openPlain(packed.encodedArchive);
    expect(plainOpened.archive).toEqual(packed.archive);

    const sealed = await shareArtifactCodec.sealWithPassword(snapshot(), password);
    const opened = await shareArtifactCodec.openWithPassword({ compactJwe: sealed.compactJwe, password });
    expect(opened.archive).toEqual(sealed.archive);
    expect(opened.files.map(({ path }) => path)).toEqual(['.tau/parameters/main.ts.json', 'main.ts', 'tau.json']);
    await expect(
      shareArtifactCodec.openWithPassword({
        compactJwe: sealed.compactJwe,
        password: 'wrong password value that is long enough',
      }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });
  });

  it('rejects unexpected JWE headers', async () => {
    const archive = await createShareArchive(snapshot());
    const p2s = new Uint8Array(16).fill(4);
    const compactJwe = await new CompactEncrypt(archive)
      .setProtectedHeader({
        alg: 'PBES2-HS512+A256KW',
        enc: 'A256GCM',
        cty: 'application/zip',
        typ: 'unexpected',
      })
      .setKeyManagementParameters({ p2c: 210_000, p2s })
      .encrypt(bytes(password));
    await expect(shareArtifactCodec.openWithPassword({ compactJwe, password })).rejects.toMatchObject({
      code: 'SHARE_ARTIFACT_INVALID',
    });
  });

  it('rejects tampering, unsafe password sizes, and unsupported archive entries', async () => {
    const sealed = await shareArtifactCodec.sealWithPassword(snapshot(), password);
    const segments = sealed.compactJwe.split('.');
    segments[3] = `${segments[3]?.startsWith('A') ? 'B' : 'A'}${segments[3]?.slice(1)}`;
    await expect(
      shareArtifactCodec.openWithPassword({ compactJwe: segments.join('.'), password }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });
    await expect(shareArtifactCodec.sealWithPassword(snapshot(), 'short')).rejects.toMatchObject({
      code: 'SHARE_ARTIFACT_INVALID',
    });

    const missingManifest = new JSZip();
    missingManifest.file('main.ts', 'export default 1;');
    await expect(
      openShareArchive(new Uint8Array(await missingManifest.generateAsync({ type: 'uint8array' }))),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });

    const directory = new JSZip();
    directory.file('tau.json', '{}');
    directory.folder('assets');
    await expect(
      openShareArchive(new Uint8Array(await directory.generateAsync({ type: 'uint8array' }))),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });

    const symlink = new JSZip();
    symlink.file('tau.json', '{}');
    symlink.file('link', 'target', { unixPermissions: 0o12_0777 });
    await expect(
      openShareArchive(new Uint8Array(await symlink.generateAsync({ type: 'uint8array', platform: 'UNIX' }))),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });
  });

  it('honors cancellation before artifact work starts', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(shareArtifactCodec.sealWithPassword(snapshot(), password, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('rejects traversal paths and compression bombs before use', async () => {
    const unsafe = new JSZip();
    unsafe.file('../outside.ts', 'bad');
    unsafe.file('tau.json', '{}');
    await expect(
      openShareArchive(new Uint8Array(await unsafe.generateAsync({ type: 'uint8array' }))),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });

    const bomb = new JSZip();
    bomb.file('tau.json', '{}');
    bomb.file('zeros.bin', new Uint8Array(1024 * 1024));
    await expect(
      openShareArchive(new Uint8Array(await bomb.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_LIMIT' });

    await expect(
      createShareArchive({
        ...snapshot(),
        files: [
          ...snapshot().files,
          { path: '.tau/private', content: bytes('x'), sha256: 'x', role: 'project-metadata' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });

    await expect(
      createShareArchive({
        ...snapshot(),
        files: [
          ...snapshot().files,
          { path: 'assets', content: bytes('x'), sha256: 'x', role: 'project-metadata' },
          { path: 'assets/model.step', content: bytes('x'), sha256: 'x', role: 'project-metadata' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });

    await Promise.all(
      ['/absolute.ts', 'C:/drive.ts', String.raw`nested\escape.ts`, 'nul\0byte.ts', 'a//b.ts'].map(async (path) =>
        expect(
          createShareArchive({
            ...snapshot(),
            files: [...snapshot().files, { path, content: bytes('x'), sha256: 'x', role: 'project-metadata' }],
          }),
        ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' }),
      ),
    );

    await expect(
      createShareArchive({
        ...snapshot(),
        files: [...snapshot().files, { path: 'MAIN.ts', content: bytes('x'), sha256: 'x', role: 'project-metadata' }],
      }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_INVALID' });

    await expect(
      createShareArchive({
        ...snapshot(),
        files: Array.from({ length: 201 }, (_, index): ShareProjectSnapshot['files'][number] => ({
          path: index === 0 ? 'tau.json' : `file-${index}.ts`,
          content: bytes('x'),
          sha256: 'x',
          role: 'project-metadata',
        })),
      }),
    ).rejects.toMatchObject({ code: 'SHARE_ARTIFACT_LIMIT' });
  });
});
