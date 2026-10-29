/** Admit the complete native host matrix; CLI aggregation binds candidate source separately from its trusted main dispatch. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { parseDesktopAcceptanceReceipt, parseDesktopArtifactManifest } from '#shared/desktop-release.js';
import type { DesktopAcceptanceReceipt } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Share the installed runner's trusted source admission and the publication gate's exact Mac-only candidate shape. */
import { desktopCandidateRoutes } from './desktop-route-publication.mjs';
import { fetchInstallerCandidate } from './fetch-desktop-installer-candidate.mjs';
import { usesQualificationBinding, createQualificationBinding } from './qualification-binding.mjs';
import { assertQualificationSource } from './qualification-candidates.mjs';
/* oxlint-enable no-restricted-imports */

const rows = [
  ['macos-zip-arm64', 'macos-zip', 'darwin-arm64'],
  ['macos-dmg-arm64', 'macos-dmg', 'darwin-arm64'],
  ['macos-zip-x64', 'macos-zip', 'darwin-x64'],
  ['macos-dmg-x64', 'macos-dmg', 'darwin-x64'],
  ['windows-nsis-x64', 'windows-nsis', 'win32-x64'],
  ['ubuntu-apt-x11', 'linux-apt', 'linux-x64'],
  ['ubuntu-appimage-x11', 'linux-appimage', 'linux-x64'],
  ['debian-apt-x11', 'linux-apt', 'linux-x64'],
  ['debian-appimage-x11', 'linux-appimage', 'linux-x64'],
] as const;
const scopes = ['all', 'linux', 'macos', 'windows'] as const;
type QualificationScope = (typeof scopes)[number];
/** Rows each explicit scope must produce; a scoped run can neither omit nor add another platform's host. */
const scopeRows = (scope: QualificationScope) =>
  scope === 'all' ? rows : rows.filter(([, route]) => route.startsWith(`${scope}-`));
const inputSchema = z.strictObject({
  scope: z.enum(scopes).default('all'),
  /** `vm` collects clean-host acceptance rows from the Mac- or Windows-scoped staging producer; never inferred from receipts. */
  kind: z.enum(['ci', 'vm']).default('ci'),
  candidate: z.unknown(),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
  channel: z.enum(['staging', 'production']),
  runId: z.string().regex(/^[1-9]\d*$/u),
  trustIdentities: z.strictObject({
    'macos-zip': z.string().min(1).optional(),
    'macos-dmg': z.string().min(1).optional(),
    'windows-nsis': z.string().min(1).optional(),
    'linux-apt': z.string().min(1).optional(),
    'linux-appimage': z.string().min(1).optional(),
  }),
  rows: z.array(z.strictObject({ id: z.string(), receipts: z.unknown() })),
});

const assertOperatingSystem = (id: string, target: string, receipt: DesktopAcceptanceReceipt): void => {
  const { os } = receipt.environment;
  const distribution = os.split(/\r?\n/u).filter((line) => line.startsWith('ID='));
  if (
    (target.startsWith('darwin-') && !/^Darwin \d+\.\d+\.\d+$/u.test(os)) ||
    (target === 'win32-x64' && !/^Microsoft Windows\b/u.test(os)) ||
    (id.startsWith('ubuntu') && (distribution.length !== 1 || !/^ID=(?:ubuntu|"ubuntu")$/u.test(distribution[0]!))) ||
    (id.startsWith('debian') && (distribution.length !== 1 || !/^ID=(?:debian|"debian")$/u.test(distribution[0]!)))
  ) {
    throw new Error('Native row does not observe its declared operating system');
  }
};

/** Pure admission only: callers separately own authenticated artifact retrieval and output publication. */
export const collectQualificationRows = (
  input: unknown,
): { hostMatrix: Array<{ id: string; receipt: DesktopAcceptanceReceipt }>; receipts: DesktopAcceptanceReceipt[] } => {
  const request = inputSchema.parse(input);
  const manifest = parseDesktopArtifactManifest(request.candidate);
  if (manifest.sourceCommit !== request.sourceCommit || manifest.channel !== request.channel) {
    throw new Error('Final candidate differs from workflow source/channel');
  }
  if (request.scope !== 'all' && manifest.channel !== 'staging') {
    throw new Error('Platform-scoped evidence is staging qualification only');
  }
  if (request.kind === 'vm' && (!['macos', 'windows'].includes(request.scope) || manifest.channel !== 'staging')) {
    throw new Error('Clean-host receipts come only from a Mac- or Windows-scoped staging producer');
  }
  if (request.scope === 'windows' && request.kind !== 'vm') {
    throw new Error('Windows scope requires consumer VM evidence');
  }
  if (request.scope === 'macos') {
    // The final candidate must be exactly the Mac-only candidate that publication will later admit.
    desktopCandidateRoutes(manifest, 'macos');
  }
  const selectedRows = scopeRows(request.scope);
  const expected = selectedRows.map(([id]) => id).sort();
  const actual = request.rows.map(({ id }) => id).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Qualification host matrix is incomplete, duplicated or has unexpected rows');
  }
  const hostMatrix = selectedRows.map(([id, route, target]) => {
    const inputReceipts = request.rows.find((row) => row.id === id)?.receipts;
    if (!Array.isArray(inputReceipts) || inputReceipts.length !== 1) {
      throw new Error('Each native row must contain exactly one receipt');
    }
    const receipt = parseDesktopAcceptanceReceipt(inputReceipts[0], manifest);
    if (
      receipt.route !== route ||
      receipt.target !== target ||
      receipt.environment.kind !== request.kind ||
      (request.kind === 'vm') !== (receipt.environment.host !== undefined) ||
      receipt.trust.kind !== 'release' ||
      !request.trustIdentities[route] ||
      receipt.trust.identity !== request.trustIdentities[route] ||
      receipt.suite !== (request.kind === 'vm' ? 'clean-host-route-a-b-c-v1' : 'installed-route-a-b-c-v1') ||
      receipt.logs !== `https://github.com/taucad/tau/actions/runs/${request.runId}`
    ) {
      throw new Error('Native row identity, signer or workflow evidence differs');
    }
    assertOperatingSystem(id, target, receipt);
    return { id, receipt };
  });
  const receipts = hostMatrix
    .map(({ receipt }) => receipt)
    .filter(
      (receipt, index, all) =>
        all.findIndex((other) => other.route === receipt.route && other.target === receipt.target) === index,
    );
  return { hostMatrix, receipts };
};

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}`);
  }
  return value;
};
const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));
const main = async (): Promise<void> => {
  if (process.env['GITHUB_REF'] !== 'refs/heads/main' || process.env['GITHUB_EVENT_NAME'] !== 'workflow_dispatch') {
    throw new Error('Receipt aggregation requires the trusted main dispatch');
  }
  const scope = z.enum(scopes).parse(process.env['TAU_DESKTOP_QUALIFICATION_SCOPE'] ?? 'all');
  const selectedRows = scopeRows(scope);
  const root = 'out/qualification-rows';
  const directories = await readdir(root);
  const expected = selectedRows.map(([id]) => `desktop-route-row-${id}`).sort();
  if (JSON.stringify([...directories].sort()) !== JSON.stringify(expected)) {
    throw new Error('Qualification artifact directories differ from the complete host matrix');
  }
  const kind = z.enum(['ci', 'vm']).parse(process.env['TAU_DESKTOP_ACCEPTANCE_KIND'] ?? 'ci');
  const candidateProvenance =
    kind === 'ci'
      ? await fetchInstallerCandidate({
          runId: required('TAU_INSTALLER_CANDIDATE_RUN_ID'),
          workflowCommit: required('GITHUB_SHA'),
          scope,
          directory: 'out/qualification-candidate',
        })
      : undefined;
  const candidate = parseDesktopArtifactManifest(await readJson('out/qualification-candidate/desktop-artifacts.json'));
  assertQualificationSource({
    sourceCommit: candidate.sourceCommit,
    workflowCommit: required('GITHUB_SHA'),
    scope,
    channel: required('TAU_QUALIFICATION_CHANNEL'),
    kind,
  });
  const result = collectQualificationRows({
    scope,
    kind,
    candidate,
    sourceCommit: candidate.sourceCommit,
    channel: required('TAU_QUALIFICATION_CHANNEL'),
    runId: required('GITHUB_RUN_ID'),
    // Only the selected platforms' protected identities are read; a Mac-only run needs no Linux or Windows trust.
    trustIdentities: {
      ...(scope === 'linux' || scope === 'windows'
        ? {}
        : {
            'macos-zip': required('APPLE_TEAM_ID'),
            'macos-dmg': required('APPLE_TEAM_ID'),
          }),
      ...(scope === 'all' || scope === 'windows' ? { 'windows-nsis': required('TAU_WINDOWS_PUBLISHER') } : {}),
      ...(scope === 'macos' || scope === 'windows'
        ? {}
        : {
            'linux-apt': `${required('TAU_APT_PRIMARY_FINGERPRINT')}/${required('TAU_APT_SIGNING_FINGERPRINT')}`,
            'linux-appimage': required('TAU_APPIMAGE_KEY_ID'),
          }),
    },
    rows: await Promise.all(
      directories.map(async (directory) => ({
        id: directory.startsWith('desktop-route-row-') ? directory.slice('desktop-route-row-'.length) : directory,
        receipts: await readJson(join(root, directory, 'route-receipts.json')),
      })),
    ),
  });
  await mkdir('out/qualification-receipts', { recursive: false });
  if (usesQualificationBinding(scope, candidate.channel, kind)) {
    if (!candidateProvenance) {
      throw new Error('Missing authenticated CI candidate');
    }
    const binding = createQualificationBinding({
      manifest: candidate,
      candidate: candidateProvenance,
      workflowCommit: required('GITHUB_SHA'),
      runId: Number(required('GITHUB_RUN_ID')),
    });
    await writeFile('out/qualification-receipts/qualification-binding.json', JSON.stringify(binding), { flag: 'wx' });
  }
  await writeFile('out/qualification-receipts/host-matrix.json', JSON.stringify(result.hostMatrix, undefined, 2), {
    flag: 'wx',
  });
  await writeFile('out/qualification-receipts/route-receipts.json', JSON.stringify(result.receipts, undefined, 2), {
    flag: 'wx',
  });
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
