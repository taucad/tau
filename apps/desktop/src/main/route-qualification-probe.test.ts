import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareRouteQualificationProbe } from '#main/route-qualification-probe.js';
import type { RouteQualificationRequest } from '#main/route-qualification-probe.js';

const roots: string[] = [];
const project = 'export default () => drawBox(10, 20, 30);\n';
const fixture = () => {
  const profile = realpathSync(mkdtempSync(join(tmpdir(), 'tau-route-qualification-')));
  const installedPath = realpathSync(mkdtempSync(join(tmpdir(), 'tau-route-installation-')));
  roots.push(profile, installedPath);
  const savedProject = { path: 'model.ts', sha256: createHash('sha256').update(project).digest('hex') };
  const request: RouteQualificationRequest = {
    schemaVersion: 1,
    nonce: randomUUID(),
    profile,
    route: 'linux-appimage',
    target: 'linux-x64',
    channel: 'production',
    installedPath,
    mirrorOrigin: 'https://127.0.0.1:4443',
    startedAt: Date.now(),

    a: { tag: 'desktop@1.0.0', version: '1.0.0', sourceCommit: 'a'.repeat(40) },
    b: { tag: 'desktop@1.0.1', version: '1.0.1', sourceCommit: 'b'.repeat(40) },
    c: { tag: 'desktop@1.0.2', version: '1.0.2', sourceCommit: 'c'.repeat(40) },
  };
  writeFileSync(join(profile, 'route-qualification.request.json'), JSON.stringify(request));
  const options: Parameters<typeof prepareRouteQualificationProbe>[0] = {
    arguments: [`--tau-route-qualification=${request.nonce}`],
    profile,
    defaultProfile: profile,
    packaged: true,
    platform: 'linux',
    arch: 'x64',
    channel: 'production',
    ...request.a,
    route: request.route,
    installedPath,
    pid: 101,
    mirrorOrigin: request.mirrorOrigin,
  };
  const command = (stage: 'a' | 'b' | 'c', pid: number, action: 'observe' | 'install') => {
    writeFileSync(
      join(profile, 'route-qualification.command.json'),
      JSON.stringify({ schemaVersion: 1, nonce: request.nonce, stage, pid, action, project: savedProject }),
    );
  };
  return { request, options, command, savedProject };
};
const native = () => ({ rendererPid: 201, children: [{ pid: 202, type: 'Utility' }] });
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('installed route qualification diagnostics', () => {
  it('retains actual saved project bytes through pinned A to B and normal-feed B to C with distinct source and PID', async () => {
    const { request, options, command, savedProject } = fixture();
    const a = prepareRouteQualificationProbe(options);
    // The native harness saves this project through the renderer; this unit exercises its persisted bytes.
    writeFileSync(join(options.profile, savedProject.path), project);
    command('a', 101, 'install');
    expect(await a?.complete(native)).toEqual({ installForProbe: true });
    expect(a?.candidateTag).toBe(request.b.tag);
    const b = prepareRouteQualificationProbe({ ...options, arguments: [], ...request.b, pid: 102 });
    expect(b?.candidateTag).toBeUndefined();
    expect(b?.expectedUpdate).toEqual(request.c);
    command('b', 102, 'install');
    expect(await b?.complete(native)).toEqual({ installForProbe: true });
    const c = prepareRouteQualificationProbe({ ...options, arguments: [], ...request.c, pid: 103 });
    command('c', 103, 'observe');
    expect(await c?.complete(native)).toEqual({ installForProbe: false });
    expect(c?.expectedUpdate).toBeUndefined();
    expect(
      prepareRouteQualificationProbe({ ...options, arguments: [], ...request.c, pid: 104, mirrorOrigin: undefined }),
    ).toBeUndefined();
    expect(readFileSync(join(options.profile, savedProject.path), 'utf8')).toBe(project);
    expect(JSON.parse(readFileSync(join(options.profile, 'route-qualification.c.json'), 'utf8'))).toMatchObject({
      diagnosticOnly: true,
      pid: 103,
      sourceCommit: request.c.sourceCommit,
      projectSha256: savedProject.sha256,
      installedPath: options.installedPath,
      rendererPid: 201,
    });
  });
  it('freezes the first real project binding and rejects a replacement binding after restart', async () => {
    const { options, request, command, savedProject } = fixture();
    const a = prepareRouteQualificationProbe(options);
    writeFileSync(join(options.profile, savedProject.path), project);
    command('a', 101, 'install');
    await a?.complete(native);
    const b = prepareRouteQualificationProbe({ ...options, arguments: [], ...request.b, pid: 102 });
    writeFileSync(
      join(options.profile, 'route-qualification.command.json'),
      JSON.stringify({
        schemaVersion: 1,
        nonce: request.nonce,
        pid: 102,
        stage: 'b',
        action: 'install',
        project: { path: 'different.ts', sha256: savedProject.sha256 },
      }),
    );
    await expect(b?.complete(native)).rejects.toThrow('changed the saved project binding');
  });
  it('rejects request tampering, expired runs and reused PIDs at replacement', async () => {
    const { options, request, command, savedProject } = fixture();
    expect(() =>
      prepareRouteQualificationProbe({ ...options, now: () => request.startedAt + 3 * 60 * 60 * 1000 }),
    ).toThrow('expiry mismatch');
    const a = prepareRouteQualificationProbe(options);
    writeFileSync(join(options.profile, savedProject.path), project);
    command('a', 101, 'install');
    await a?.complete(native);
    expect(() => prepareRouteQualificationProbe({ ...options, arguments: [], ...request.b })).toThrow(
      'different installed process',
    );
    writeFileSync(join(options.profile, 'route-qualification.sentinel'), 'changed');
    expect(() => prepareRouteQualificationProbe({ ...options, arguments: [], ...request.b, pid: 102 })).toThrow(
      'sentinel changed',
    );
  });
  it('restores only the admitted loopback mirror on argument-free resume and rejects request rewrites', () => {
    const { options, request } = fixture();
    prepareRouteQualificationProbe(options);
    expect(prepareRouteQualificationProbe({ ...options, arguments: [], mirrorOrigin: undefined })?.mirrorOrigin).toBe(
      request.mirrorOrigin,
    );
    expect(() =>
      prepareRouteQualificationProbe({ ...options, arguments: [], mirrorOrigin: 'https://example.com' }),
    ).toThrow('admitted loopback origin');
    writeFileSync(
      join(options.profile, 'route-qualification.request.json'),
      JSON.stringify({ ...request, mirrorOrigin: 'https://127.0.0.1:4444' }),
    );
    expect(() => prepareRouteQualificationProbe({ ...options, arguments: [], mirrorOrigin: undefined })).toThrow(
      'request changed after admission',
    );
  });
  it('refuses a nondefault profile and existing user data without modifying it', () => {
    const { options } = fixture();
    expect(() => prepareRouteQualificationProbe({ ...options, defaultProfile: '/another/profile' })).toThrow(
      'disposable default profile',
    );
    writeFileSync(join(options.profile, 'user-document'), 'retained');
    expect(() => prepareRouteQualificationProbe(options)).toThrow('empty disposable default profile');
    expect(readFileSync(join(options.profile, 'user-document'), 'utf8')).toBe('retained');
  });
  it('rejects wrong running source, wrong stable outer path and a skipped B process', () => {
    const { request, options } = fixture();
    expect(() => prepareRouteQualificationProbe({ ...options, sourceCommit: request.b.sourceCommit })).toThrow(
      'version or source',
    );
    expect(() => prepareRouteQualificationProbe({ ...options, installedPath: options.profile })).toThrow(
      'identity, profile or expiry',
    );
    prepareRouteQualificationProbe(options);
    expect(() => prepareRouteQualificationProbe({ ...options, arguments: [], ...request.c, pid: 103 })).toThrow(
      'stage advanced',
    );
  });
  it('refuses changed project bytes after a verified A process', async () => {
    const { request, options, command, savedProject } = fixture();
    const a = prepareRouteQualificationProbe(options);
    writeFileSync(join(options.profile, savedProject.path), project);
    command('a', 101, 'install');
    await a?.complete(native);
    const b = prepareRouteQualificationProbe({ ...options, arguments: [], ...request.b, pid: 102 });
    writeFileSync(join(options.profile, savedProject.path), 'lost project');
    command('b', 102, 'install');
    await expect(b?.complete(native)).rejects.toThrow('saved project bytes changed');
    expect(readFileSync(join(options.profile, savedProject.path), 'utf8')).toBe('lost project');
  });
  it('rejects project symlinks outside the profile', async () => {
    const { options, command, savedProject } = fixture();
    const a = prepareRouteQualificationProbe(options);
    const external = join(options.installedPath, 'model.ts');
    writeFileSync(external, project);
    symlinkSync(external, join(options.profile, savedProject.path));
    command('a', 101, 'install');
    await expect(a?.complete(native)).rejects.toThrow('escaped the disposable profile');
  });
  it('observation does not authorize replacement on ordinary quit', async () => {
    const { options, request, command, savedProject } = fixture();
    const a = prepareRouteQualificationProbe(options);
    writeFileSync(join(options.profile, savedProject.path), project);
    command('a', 101, 'observe');
    expect(await a?.complete(native)).toEqual({ installForProbe: false });
    expect(() => prepareRouteQualificationProbe({ ...options, arguments: [], ...request.b, pid: 102 })).toThrow(
      'stage advanced',
    );
  });
});
