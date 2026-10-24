/** Bounded installed-route diagnostics. Only the external native collector can qualify a release. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { desktopReleaseIdentity } from '#shared/desktop-release.js';

const identitySchema = z.strictObject({
  tag: z.string(),
  version: z.string(),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
});
const projectSchema = z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[a-f\d]{64}$/u) });
const requestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  nonce: z.uuid(),
  profile: z.string(),
  route: z.enum(['macos-zip', 'macos-dmg', 'windows-nsis', 'linux-appimage', 'linux-apt']),
  target: z.enum(['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64']),
  channel: z.enum(['production', 'staging']),
  installedPath: z.string(),
  mirrorOrigin: z.string().regex(/^https:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u),
  startedAt: z.number(),
  a: identitySchema,
  b: identitySchema,
  c: identitySchema,
});
const stageSchema = z.enum(['a', 'b', 'c']);
const observationSchema = z.strictObject({
  stage: stageSchema,
  pid: z.number().int().positive(),
  action: z.enum(['observe', 'install']),
  version: z.string(),
  sourceCommit: z.string(),
  projectSha256: z.string(),
  observedAt: z.number(),
});
const stateSchema = z.strictObject({
  nonce: z.uuid(),
  sentinel: z.uuid(),
  requestSha256: z.string().regex(/^[a-f\d]{64}$/u),
  project: projectSchema.optional(),
  observations: z.array(observationSchema).max(12),
});
const commandSchema = z.strictObject({
  project: projectSchema.optional(),
  schemaVersion: z.literal(1),
  nonce: z.uuid(),
  pid: z.number().int().positive(),
  stage: stageSchema,
  action: z.enum(['observe', 'install']),
});
export type RouteQualificationRequest = z.infer<typeof requestSchema>;
export type RouteQualificationProbe = {
  stage: 'a' | 'b' | 'c';
  mirrorOrigin: string;
  candidateTag?: string;
  expectedUpdate?: z.infer<typeof identitySchema>;
  complete(
    native: () => {
      rendererPid: number;
      children: ReadonlyArray<{ pid: number; type: string }>;
    },
  ): Promise<{ installForProbe: boolean }>;
};

const readJson = (path: string): unknown => {
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 32_768) {
    throw new Error('Qualification records must be bounded regular files');
  }
  return JSON.parse(readFileSync(path, 'utf8'));
};
const writeJson = (path: string, value: unknown): void => {
  writeFileSync(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
};

/** Activate solely through a nonce-bound CLI or an existing disposable-profile run. */
export const prepareRouteQualificationProbe = (options: {
  arguments: readonly string[];
  profile: string;
  defaultProfile: string;
  packaged: boolean;
  platform: NodeJS.Platform;
  arch: string;
  channel: 'production' | 'staging';
  version: string;
  sourceCommit: string;
  route: RouteQualificationRequest['route'];
  installedPath: string;
  mirrorOrigin?: string;
  pid?: number;
  now?: () => number;
}): RouteQualificationProbe | undefined => {
  const argument = options.arguments.find((value) => value.startsWith('--tau-route-qualification='));
  const requestPath = join(options.profile, 'route-qualification.request.json');
  const statePath = join(options.profile, 'route-qualification.state.json');
  if (!argument && !existsSync(statePath)) {
    return undefined;
  }
  const now = options.now ?? Date.now;
  const pid = options.pid ?? process.pid;
  if (!options.packaged || resolve(options.profile) !== resolve(options.defaultProfile)) {
    throw new Error('Route qualification requires a packaged app and its disposable default profile');
  }
  const request = requestSchema.parse(readJson(requestPath));
  const requestSha256 = createHash('sha256').update(readFileSync(requestPath)).digest('hex');
  const prior = existsSync(statePath) ? stateSchema.parse(readJson(statePath)) : undefined;
  if (prior && prior.requestSha256 !== requestSha256) {
    throw new Error('Qualification request changed after admission');
  }
  if (
    !argument &&
    prior &&
    (prior.observations.at(-1)?.stage === 'c' || now() - request.startedAt > 2 * 60 * 60 * 1000)
  ) {
    return undefined;
  }
  if (prior?.observations.at(-1)?.stage === 'c') {
    throw new Error('Qualification run is already complete');
  }
  const mirror = new URL(request.mirrorOrigin);
  if (
    !mirror.port ||
    mirror.origin !== request.mirrorOrigin ||
    (!prior && options.mirrorOrigin !== request.mirrorOrigin) ||
    (options.mirrorOrigin !== undefined && options.mirrorOrigin !== request.mirrorOrigin)
  ) {
    throw new Error('Qualification mirror differs from the admitted loopback origin');
  }
  if (
    (argument !== undefined && argument.slice('--tau-route-qualification='.length) !== request.nonce) ||
    realpathSync(options.profile) !== request.profile ||
    request.channel !== options.channel ||
    (request.route !== options.route &&
      !(options.platform === 'darwin' && options.route === 'macos-zip' && request.route === 'macos-dmg')) ||
    request.target !== `${options.platform}-${options.arch}` ||
    realpathSync(options.installedPath) !== request.installedPath ||
    request.startedAt > now() ||
    now() - request.startedAt > 2 * 60 * 60 * 1000
  ) {
    throw new Error('Route qualification identity, profile or expiry mismatch');
  }
  for (const identity of [request.a, request.b, request.c]) {
    const release = desktopReleaseIdentity(identity.tag);
    if (release.channel !== request.channel || release.version !== identity.version) {
      throw new Error('Route qualification release identity mismatch');
    }
  }
  if (new Set([request.a.version, request.b.version, request.c.version]).size !== 3) {
    throw new Error('Route qualification requires three distinct versions');
  }
  const stage = (['a', 'b', 'c'] as const).find((value) => request[value].version === options.version);
  if (!stage || request[stage].sourceCommit !== options.sourceCommit) {
    throw new Error('Running qualification version or source differs from the requested candidate');
  }
  if (!existsSync(statePath)) {
    if (
      !argument ||
      stage !== 'a' ||
      readdirSync(options.profile).some((name) => name !== 'route-qualification.request.json')
    ) {
      throw new Error('Qualification initialization requires an empty disposable default profile');
    }
    const sentinel = randomUUID();
    writeFileSync(join(options.profile, 'route-qualification.sentinel'), sentinel, { flag: 'wx', mode: 0o600 });
    writeJson(statePath, { nonce: request.nonce, sentinel, requestSha256, observations: [] });
  }
  const state = stateSchema.parse(readJson(statePath));
  if (
    state.nonce !== request.nonce ||
    readFileSync(join(options.profile, 'route-qualification.sentinel'), 'utf8') !== state.sentinel
  ) {
    throw new Error('Qualification profile sentinel changed');
  }
  const previous = state.observations.at(-1);
  if (stage !== (previous?.stage ?? 'a')) {
    const predecessor = stage === 'b' ? 'a' : 'b';
    if (stage === 'a' || previous?.stage !== predecessor || previous.action !== 'install' || previous.pid === pid) {
      throw new Error('Qualification stage advanced without a different installed process');
    }
  }
  const expectedUpdate = stage === 'a' ? request.b : stage === 'b' ? request.c : undefined;
  return {
    stage,
    mirrorOrigin: request.mirrorOrigin,
    ...(stage === 'a' ? { candidateTag: request.b.tag } : {}),
    ...(expectedUpdate ? { expectedUpdate } : {}),
    /** Called only after the shipping renderer has registered its real save handler. */
    async complete(
      native: () => {
        rendererPid: number;
        children: ReadonlyArray<{ pid: number; type: string }>;
      },
    ): Promise<{ installForProbe: boolean }> {
      writeJson(join(options.profile, 'route-qualification.ready.json'), {
        schemaVersion: 1,
        nonce: request.nonce,
        stage,
        pid,
        profile: request.profile,
        installedPath: request.installedPath,
        route: request.route,
        target: request.target,
        version: options.version,
        sourceCommit: options.sourceCommit,
        ...native(),
      });
      const deadline = now() + 15 * 60 * 1000;
      const commandPath = join(options.profile, 'route-qualification.command.json');
      while (now() < deadline) {
        if (existsSync(commandPath)) {
          const command = commandSchema.parse(readJson(commandPath));
          if (command.nonce !== request.nonce) {
            throw new Error('Qualification command nonce mismatch');
          }
          if (command.pid === pid) {
            if (command.stage !== stage || (stage === 'c' && command.action === 'install')) {
              throw new Error('Qualification command cannot install this stage');
            }
            const project = state.project ?? command.project;
            if (
              !project ||
              (!state.project && stage !== 'a') ||
              (command.project && (command.project.path !== project.path || command.project.sha256 !== project.sha256))
            ) {
              throw new Error('Qualification command changed the saved project binding');
            }
            if (isAbsolute(project.path) || project.path.split(/[\\/]/u).some((part) => part === '..' || part === '')) {
              throw new Error('Qualification project must remain inside the disposable profile');
            }
            const projectPath = realpathSync(join(options.profile, project.path));
            const within = relative(realpathSync(options.profile), projectPath);
            if (
              within.startsWith(`..${sep}`) ||
              isAbsolute(within) ||
              within === '..' ||
              !lstatSync(projectPath).isFile()
            ) {
              throw new Error('Qualification project escaped the disposable profile');
            }
            const projectSha256 = createHash('sha256').update(readFileSync(projectPath)).digest('hex');
            if (projectSha256 !== project.sha256) {
              throw new Error('Qualification saved project bytes changed');
            }
            const observation = {
              stage,
              pid,
              action: command.action,
              version: options.version,
              sourceCommit: options.sourceCommit,
              projectSha256,
              observedAt: now(),
            };
            const updated = stateSchema.parse({
              ...state,
              project,
              observations: [...state.observations, observation],
            });
            writeJson(statePath, updated);
            writeJson(join(options.profile, `route-qualification.${stage}.json`), {
              diagnosticOnly: true,
              discovery: stage === 'a' ? 'candidate' : stage === 'b' ? 'latest' : 'none',
              ...(stage === 'a' ? { candidateTag: request.b.tag } : {}),
              ...request,
              ...observation,
              project,
              profileSentinel: state.sentinel,
              ...native(),
            });
            return { installForProbe: command.action === 'install' };
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- Bounded native-driver command polling after renderer readiness.
        await sleep(100);
      }
      throw new Error('Qualification driver command timed out');
    },
  };
};
