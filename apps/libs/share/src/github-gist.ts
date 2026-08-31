import { shareArtifactLimits } from '#artifact.js';
import type { ShareLocatorSecrets } from '#locator.js';
import { ShareError } from '#provider.js';
import type { ShareProvider, ShareProviderContext, ShareProviderDescriptor } from '#provider.js';
import type { ShareProjectSnapshot } from '#snapshot.js';

const githubApiOrigin = 'https://api.github.com';
const canonicalPlainFilename = 'tau-project.zip.base64url';
const canonicalEncryptedFilename = 'tau-project.jwe';
const githubHeaders = {
  accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
} as const;
const sourceExtensionPattern = /\.(?:js|kcl|scad|ts)$/iu;

/** GitHub Gist share provider metadata. @public */
export const githubGistShareProviderDescriptor = {
  id: 'github-gist',
  label: 'GitHub Gist',
  capabilities: ['project.publish', 'project.resolve', 'project.republish', 'project.unpublish'],
  connection: { id: 'github', scopes: ['gist'] },
  maxArtifactCharacters: shareArtifactLimits.maxGistJweCharacters,
} as const satisfies ShareProviderDescriptor;

type GistFileResponse = {
  readonly filename?: unknown;
  readonly content?: unknown;
  readonly truncated?: unknown;
};

const parseJson = async (response: Response, maxBytes: number): Promise<Record<string, unknown>> => {
  try {
    const declaredLength = Number(response.headers.get('Content-Length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error('response too large');
    }
    const reader = response.body?.getReader();
    let text = '';
    if (reader === undefined) {
      text = await response.text();
      if (new TextEncoder().encode(text).byteLength > maxBytes) {
        throw new Error('response too large');
      }
    } else {
      const decoder = new TextDecoder();
      let received = 0;
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- streaming enforces the response limit before JSON allocation.
        const chunk = await reader.read();
        if (chunk.done) {
          text += decoder.decode();
          break;
        }
        received += chunk.value.byteLength;
        if (received > maxBytes) {
          // oxlint-disable-next-line no-await-in-loop -- cancellation releases the oversized response immediately.
          await reader.cancel();
          throw new Error('response too large');
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
    }
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Fall through to one provider-safe error without including response text.
  }
  throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'GitHub returned an invalid Gist response.');
};

const throwForResponse = (response: Response): never => {
  if (response.status === 401) {
    throw new ShareError('SHARE_AUTH_REQUIRED', 'The GitHub connection needs to be renewed.');
  }
  if (response.status === 403) {
    throw new ShareError(
      'SHARE_PERMISSION_REQUIRED',
      'GitHub denied Gist write access. Allow Gist access, then reconnect GitHub.',
    );
  }
  if (response.status === 404 || response.status === 410) {
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'This GitHub Gist is unavailable.');
  }
  if (response.status === 422) {
    throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'GitHub rejected the project artifact.');
  }
  throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub sharing is temporarily unavailable.');
};

const requireString = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

const requireCompleteFile = (file: GistFileResponse | undefined, message: string): string => {
  if (!file || file.truncated === true || typeof file.content !== 'string' || file.content.length === 0) {
    throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', message);
  }
  if (file.content.length > shareArtifactLimits.maxEncodedArchiveCharacters) {
    throw new ShareError('SHARE_ARTIFACT_LIMIT', 'The GitHub Gist project exceeds the supported size.');
  }
  return file.content;
};

const readManifestEntry = (content: Uint8Array<ArrayBuffer>): string | undefined => {
  try {
    const manifest: unknown = JSON.parse(new TextDecoder().decode(content));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return undefined;
    }
    const { assets } = manifest as Record<string, unknown>;
    const main =
      assets && typeof assets === 'object' && !Array.isArray(assets)
        ? (assets as Record<string, unknown>)['main']
        : undefined;
    const entryPath =
      main && typeof main === 'object' && !Array.isArray(main)
        ? (main as Record<string, unknown>)['entryPath']
        : undefined;
    return typeof entryPath === 'string' && entryPath ? entryPath : undefined;
  } catch {
    return undefined;
  }
};

const projectIdForGist = async (gistId: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(gistId)));
  return `proj_${[...digest]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 21)}`;
};

const openOrdinaryGist = async (options: {
  readonly gistId: string;
  readonly body: Record<string, unknown>;
  readonly files: Record<string, GistFileResponse>;
  readonly context: ShareProviderContext;
  readonly signal?: AbortSignal;
}) => {
  const encoder = new TextEncoder();
  const files = Object.entries(options.files).map(([key, file]) => ({
    path: requireString(file.filename) ?? key,
    content: encoder.encode(requireCompleteFile(file, 'The Gist contains an incomplete file.')),
  }));
  const manifest = files.find(({ path }) => path === 'tau.json');
  const sourceFiles = files.filter(({ path }) => sourceExtensionPattern.test(path));
  const namedMain = sourceFiles.filter(({ path }) => /^main\.(?:js|kcl|scad|ts)$/iu.test(path));
  const entryPath = manifest
    ? readManifestEntry(manifest.content)
    : namedMain.length === 1
      ? namedMain[0]?.path
      : sourceFiles.length === 1
        ? sourceFiles[0]?.path
        : undefined;
  if (!entryPath || !files.some(({ path }) => path === entryPath)) {
    throw new ShareError(
      'SHARE_PROVIDER_INVALID_RESPONSE',
      'This Gist needs a valid tau.json or one unambiguous Tau source file.',
    );
  }
  if (!manifest) {
    const description = requireString(options.body['description']);
    files.push({
      path: 'tau.json',
      content: encoder.encode(
        `${JSON.stringify(
          {
            $schema: 'https://tau.new/schemas/tau-schema-v1.json',
            id: await projectIdForGist(options.gistId),
            name: (description ?? `GitHub Gist ${options.gistId}`).slice(0, 200),
            description: '',
            tags: [],
            assets: { main: { entryPath } },
          },
          null,
          2,
        )}\n`,
      ),
    });
  }
  const snapshot: ShareProjectSnapshot = {
    entryPath,
    files: files.map((file) => ({
      ...file,
      sha256: '0'.repeat(64),
      role: file.path === 'tau.json' ? 'project-metadata' : file.path === entryPath ? 'entry' : 'kernel-dependency',
    })),
    warnings: [],
  };
  const packed = await options.context.artifactCodec.pack(snapshot, options.signal);
  return options.context.artifactCodec.openPlain(packed.encodedArchive, options.signal);
};

const createGistArtifact = async (
  input: Parameters<NonNullable<ShareProvider['publish'] | ShareProvider['republish']>>[0],
  context: ShareProviderContext,
) => {
  const protection = input.protection ?? { kind: 'none' };
  const artifact =
    protection.kind === 'password'
      ? await context.artifactCodec.sealWithPassword(input.snapshot, protection.password, input.signal)
      : await context.artifactCodec.pack(input.snapshot, input.signal);
  const filename = protection.kind === 'password' ? canonicalEncryptedFilename : canonicalPlainFilename;
  const content = 'compactJwe' in artifact ? artifact.compactJwe : artifact.encodedArchive;
  if (content.length > shareArtifactLimits.maxGistJweCharacters) {
    throw new ShareError('SHARE_ARTIFACT_LIMIT', 'This project is too large for a GitHub Gist.');
  }
  return { protection, filename, content };
};

const requireGistId = (providerId: string, reference?: string): string => {
  const gistId = reference?.split('.')[0];
  if (providerId !== 'github-gist' || !gistId) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The GitHub Gist share link is malformed.');
  }
  return gistId;
};

const getGithubLease = async (context: ShareProviderContext) => {
  if (!context.credentialBroker) {
    throw new ShareError('SHARE_AUTH_REQUIRED', 'Connect GitHub before managing a Gist.');
  }
  const lease = await context.credentialBroker.getAccessToken({
    connectionId: 'github',
    scopes: ['gist'],
    audience: githubApiOrigin,
  });
  if (!lease.grantedScopes.includes('gist')) {
    throw new ShareError('SHARE_PERMISSION_REQUIRED', 'Allow Gist access before managing a GitHub Gist.');
  }
  return lease;
};

const parsePublication = (
  body: Record<string, unknown>,
  protection: Awaited<ReturnType<typeof createGistArtifact>>['protection'],
) => {
  const id = requireString(body['id']);
  const externalUrl = requireString(body['html_url']);
  const { history } = body;
  const revision =
    Array.isArray(history) && history[0] && typeof history[0] === 'object'
      ? requireString((history[0] as Record<string, unknown>)['version'])
      : undefined;
  if (!id || !/^[0-9a-f]+$/u.test(id) || !revision || !/^[0-9a-f]{40}$/u.test(revision)) {
    throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'GitHub did not return a pinned Gist revision.');
  }
  const secrets: ShareLocatorSecrets =
    protection.kind === 'password' && protection.includePassword ? { p: protection.password } : {};
  return {
    locator: { providerId: 'github-gist', reference: `${id}.${revision}` },
    secrets,
    revision,
    ...(externalUrl ? { externalUrl } : {}),
  };
};

/** Revision-pinned publishing plus latest-or-pinned anonymous Gist resolution. @public */
export const githubGistShareProvider: ShareProvider = {
  descriptor: githubGistShareProviderDescriptor,
  async publish(input, context) {
    const { protection, filename, content } = await createGistArtifact(input, context);
    const lease = await getGithubLease(context);
    let response: Response;
    try {
      response = await context.fetch(`${githubApiOrigin}/gists`, {
        method: 'POST',
        signal: input.signal,
        headers: { ...githubHeaders, authorization: `Bearer ${lease.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public: input.visibility === 'public',
          files: { [filename]: { content } },
        }),
      });
    } catch {
      input.signal?.throwIfAborted();
      throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub sharing is temporarily unavailable.');
    }
    if (!response.ok) {
      return throwForResponse(response);
    }
    const body = await parseJson(response, 64 * 1024);
    return parsePublication(body, protection);
  },
  async resolve(input, context) {
    const { reference } = input.locator;
    if (input.locator.providerId !== 'github-gist' || !reference) {
      throw new ShareError('SHARE_LOCATOR_INVALID', 'The GitHub Gist share link is malformed.');
    }
    const [gistId, revision] = reference.split('.');
    if (!gistId) {
      throw new ShareError('SHARE_LOCATOR_INVALID', 'The GitHub Gist share link is malformed.');
    }
    let response: Response;
    try {
      response = await context.fetch(`${githubApiOrigin}/gists/${gistId}${revision ? `/${revision}` : ''}`, {
        method: 'GET',
        signal: input.signal,
        headers: githubHeaders,
        credentials: 'omit',
      });
    } catch {
      input.signal?.throwIfAborted();
      throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub sharing is temporarily unavailable.');
    }
    if (!response.ok) {
      return throwForResponse(response);
    }
    const body = await parseJson(response, shareArtifactLimits.maxEncodedArchiveCharacters * 2 + 64 * 1024);
    const { files } = body;
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'The Gist does not contain project files.');
    }
    const gistFiles = files as Record<string, GistFileResponse>;
    const entries = Object.entries(gistFiles);
    if (entries.length === 1 && gistFiles[canonicalPlainFilename]) {
      return context.artifactCodec.openPlain(
        requireCompleteFile(gistFiles[canonicalPlainFilename], 'The Gist does not contain a complete Tau project.'),
        input.signal,
      );
    }
    if (entries.length === 1 && gistFiles[canonicalEncryptedFilename]) {
      const password = input.secrets['p'];
      if (!password) {
        throw new ShareError('SHARE_PASSWORD_REQUIRED', 'Enter the password to open this shared project.');
      }
      return context.artifactCodec.openWithPassword(
        {
          compactJwe: requireCompleteFile(
            gistFiles[canonicalEncryptedFilename],
            'The Gist does not contain a complete Tau project.',
          ),
          password,
        },
        input.signal,
      );
    }
    if (gistFiles[canonicalPlainFilename] ?? gistFiles[canonicalEncryptedFilename]) {
      throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'The Gist contains an ambiguous Tau project artifact.');
    }
    return openOrdinaryGist({ gistId, body, files: gistFiles, context, signal: input.signal });
  },
  async republish(input, context) {
    const gistId = requireGistId(input.locator.providerId, input.locator.reference);
    const lease = await getGithubLease(context);
    const authorization = `Bearer ${lease.accessToken}`;
    let currentResponse: Response;
    try {
      currentResponse = await context.fetch(`${githubApiOrigin}/gists/${gistId}`, {
        method: 'GET',
        signal: input.signal,
        headers: { ...githubHeaders, authorization },
      });
    } catch {
      input.signal?.throwIfAborted();
      throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub sharing is temporarily unavailable.');
    }
    if (!currentResponse.ok) {
      return throwForResponse(currentResponse);
    }
    const current = await parseJson(currentResponse, shareArtifactLimits.maxEncodedArchiveCharacters * 2 + 64 * 1024);
    const currentFiles = current['files'];
    if (!currentFiles || typeof currentFiles !== 'object' || Array.isArray(currentFiles)) {
      throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'The Gist does not contain project files.');
    }
    const currentNames = Object.keys(currentFiles);
    const currentFilename = currentNames.length === 1 ? currentNames[0] : undefined;
    if (currentFilename !== canonicalPlainFilename && currentFilename !== canonicalEncryptedFilename) {
      throw new ShareError('SHARE_PROVIDER_INVALID_RESPONSE', 'Only Tau-created Gists can be republished.');
    }
    const { protection, filename, content } = await createGistArtifact(input, context);
    const files: Record<string, unknown> = { [filename]: { content } };
    if (currentFilename !== filename) {
      files[currentFilename] = null;
    }
    let response: Response;
    try {
      response = await context.fetch(`${githubApiOrigin}/gists/${gistId}`, {
        method: 'PATCH',
        signal: input.signal,
        headers: { ...githubHeaders, authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
    } catch {
      input.signal?.throwIfAborted();
      throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub sharing is temporarily unavailable.');
    }
    if (!response.ok) {
      return throwForResponse(response);
    }
    return parsePublication(await parseJson(response, 64 * 1024), protection);
  },
  async unpublish(input, context) {
    const gistId = requireGistId(input.locator.providerId, input.locator.reference);
    const lease = await getGithubLease(context);
    let response: Response;
    try {
      response = await context.fetch(`${githubApiOrigin}/gists/${gistId}`, {
        method: 'DELETE',
        signal: input.signal,
        headers: { ...githubHeaders, authorization: `Bearer ${lease.accessToken}` },
      });
    } catch {
      input.signal?.throwIfAborted();
      throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'GitHub sharing is temporarily unavailable.');
    }
    if (!response.ok) {
      throwForResponse(response);
    }
  },
};
