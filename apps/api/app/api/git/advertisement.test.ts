import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { advertiseReferences, dialectFromAdvertisements } from '#api/git/advertisement.js';
import { installedGitDialect } from '#api/git/advertisement-probe.js';
import type { AdvertisementDialect } from '#api/git/advertisement.js';
import type { GitService } from '#api/git/git.constants.js';
import { readLeaseReferences } from '#api/git/store/lease.js';
import { decodeManifest, encodeManifest, succeedManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';

/**
 * DB1's byte-identity suite (W6 risk "DB1 diverges from stock git's
 * advertisement"): `info/refs` is answered from the manifest, and every byte of
 * that answer must be what stock `git upload-pack|receive-pack --stateless-rpc
 * --advertise-refs` writes over the lease the same manifest hydrates — for both
 * services, over every ref shape a Tau repository holds.
 *
 * The comparison runs against the git on `PATH`, because that is the binary
 * that serves the RPC which follows the advertisement on the same Machine. The
 * deployed image pins 2.39.5 (`apps/api/Dockerfile`), and a second block holds
 * that release's exact bytes, so the pinned dialect is proved even where the
 * installed git is newer.
 */

const scratchDirectories: string[] = [];

const scratch = (label: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), `tau-db1-${label}-`));
  scratchDirectories.push(directory);
  return directory;
};

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
/** No developer configuration reaches a fixture: the lease's children see none either. */
const gitEnvironment = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: tmpdir(),
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'DB1',
  GIT_AUTHOR_EMAIL: 'db1@tau.test',
  GIT_COMMITTER_NAME: 'DB1',
  GIT_COMMITTER_EMAIL: 'db1@tau.test',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, args: readonly string[], input?: string): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitEnvironment,
    maxBuffer: 64 * 1024 * 1024,
    ...(input === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] } : { input }),
  });

/** What stock git advertises over `directory`, byte for byte (`latin1` maps each byte to one code unit). */
const stockAdvertisement = (directory: string, service: GitService): string =>
  execFileSync('git', [service.replace('git-', ''), '--stateless-rpc', '--advertise-refs', directory], {
    encoding: 'latin1',
    env: gitEnvironment,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** The served advertisement, decoded the same way. */
const served = (args: Parameters<typeof advertiseReferences>[0]): string =>
  Buffer.from(advertiseReferences(args)).toString('latin1');

/**
 * A bare repository built the way `hydrateLease` builds one: `--template=`,
 * `main` as the initial branch, and the lease's receive settings, which are the
 * only configuration a lease's `receive-pack` reads.
 */
const leaseShapedRepository = (label: string): string => {
  const directory = scratch(label);
  git(directory, ['init', '--bare', '--quiet', '--template=', '--initial-branch=main', '.']);
  for (const [key, value] of [
    ['transfer.unpackLimit', '1'],
    ['receive.autogc', 'false'],
    ['gc.auto', '0'],
    ['maintenance.auto', 'false'],
    ['receive.denyDeletes', 'true'],
    ['receive.denyNonFastForwards', 'true'],
    ['receive.fsckObjects', 'true'],
  ] as const) {
    git(directory, ['config', key, value]);
  }
  return directory;
};

/**
 * The ref map a commit writes into the manifest, read the way `commitLease`
 * reads it, then encoded and decoded so the advertisement is computed from the
 * bytes the store would hold.
 */
const manifestOf = async (directory: string): Promise<Manifest> => {
  const references = await readLeaseReferences(directory);
  return decodeManifest(
    encodeManifest(succeedManifest(undefined, { refs: references, packs: [], committedBy: 'user-db1' })),
  );
};

const services: readonly GitService[] = ['git-upload-pack', 'git-receive-pack'];

describe('the advertisement served from the manifest (DB1)', () => {
  let dialect: AdvertisementDialect;
  let source: string;
  let commits: { first: string; second: string; tree: string };

  beforeAll(async () => {
    dialect = await installedGitDialect();
    source = scratch('source');
    git(source, ['init', '--quiet', '--initial-branch=main', '.']);
    git(source, ['commit', '--quiet', '--allow-empty', '-m', 'first revision']);
    const first = git(source, ['rev-parse', 'HEAD']).trim();
    git(source, ['commit', '--quiet', '--allow-empty', '-m', 'second revision']);
    const second = git(source, ['rev-parse', 'HEAD']).trim();
    const tree = git(source, ['rev-parse', 'HEAD^{tree}']).trim();
    commits = { first, second, tree };
  }, 60_000);

  afterAll(() => {
    for (const directory of scratchDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  /** A lease-shaped repository holding every object the source does, and exactly the case's refs. */
  const repositoryWith = (label: string, references: Readonly<Record<string, string>>): string => {
    const directory = leaseShapedRepository(label);
    if (Object.keys(references).length > 0) {
      /* Every object the source holds, under names the case then removes. */
      git(source, ['push', '--quiet', directory, 'refs/*:refs/fixture/*']);
      const carried = git(directory, ['for-each-ref', '--format=%(refname)', 'refs/fixture/'])
        .split('\n')
        .filter((name) => name !== '');
      git(
        directory,
        ['update-ref', '--stdin'],
        [
          ...carried.map((name) => `delete ${name}`),
          ...Object.entries(references).map(([name, target]) => `create ${name} ${target}`),
          '',
        ].join('\n'),
      );
      /* A lease's refs are all packed, as `hydrateLease` writes them. */
      git(directory, ['pack-refs', '--all']);
    }
    return directory;
  };

  const expectIdentical = async (directory: string): Promise<void> => {
    const manifest = await manifestOf(directory);
    for (const service of services) {
      expect(served({ service, refs: manifest.refs, dialect }), `${service} over ${path.basename(directory)}`).toBe(
        stockAdvertisement(directory, service),
      );
    }
  };

  it('matches stock git over an empty repository', async () => {
    await expectIdentical(repositoryWith('empty', {}));
  });

  it('matches stock git over a repository whose HEAD is unborn', async () => {
    await expectIdentical(
      repositoryWith('unborn', {
        'refs/heads/drafts': commits.second,
        'refs/heads/conflicts/main/device-b': commits.first,
      }),
    );
  });

  it('matches stock git over main, annotated and lightweight tags, refs/tau/* and conflict lines', async () => {
    git(source, ['tag', '-a', 'v1', '-m', 'release one', commits.first]);
    git(source, ['tag', 'v2', commits.second]);
    git(source, ['tag', '-a', 'v3', '-m', 'release three', commits.second]);
    git(source, ['tag', '-a', 'tree-tag', '-m', 'a tag of a tree', commits.tree]);
    const tag = (name: string): string => git(source, ['rev-parse', `refs/tags/${name}`]).trim();
    await expectIdentical(
      repositoryWith('shapes', {
        'refs/heads/main': commits.second,
        'refs/heads/conflicts/main/device-a': commits.first,
        'refs/heads/conflicts/main/device-b': commits.second,
        'refs/tags/v1': tag('v1'),
        'refs/tags/v2': tag('v2'),
        'refs/tags/v3': tag('v3'),
        'refs/tags/tree-tag': tag('tree-tag'),
        'refs/tau/chats/chat-0001': commits.first,
        'refs/tau/chats/chat-0002': commits.second,
        'refs/tau/publications/pub-a': commits.first,
      }),
    );
  });

  it('matches stock git over thousands of refs, in git’s byte order', async () => {
    const references: Record<string, string> = { 'refs/heads/main': commits.second };
    for (let index = 0; index < 3000; index += 1) {
      /* Unpadded numbers and mixed separators, so the order is git's byte order and not insertion order. */
      references[`refs/tau/chats/chat-${String((index * 7919) % 3000)}`] =
        index % 2 === 0 ? commits.first : commits.second;
      if (index % 10 === 0) {
        references[`refs/heads/conflicts/main/device-${String(index)}`] = commits.first;
      }
    }
    references['refs/heads/main-2'] = commits.first;
    references['refs/heads/main.next'] = commits.first;
    references['refs/heads/main_old'] = commits.first;
    references['refs/heads/Main'] = commits.first;
    await expectIdentical(repositoryWith('thousands', references));
  }, 120_000);
});

/**
 * Git 2.39.5's own bytes, captured from the Debian bookworm build the image
 * pins (`git=1:2.39.5-0+deb12u3`), so the pinned dialect is proved on any
 * runner. The object ids are the capture's; an advertisement never reads the
 * objects it names.
 */
describe('the pinned git 2.39.5 advertisement', () => {
  const receiveCapabilities =
    'report-status report-status-v2 delete-refs side-band-64k quiet atomic ofs-delta object-format=sha1 agent=git/2.39.5';
  /* What 2.39.5 writes over an empty bare repository: the probe's input on the deployed image. */
  const emptyUploadPack = '0000';
  const emptyReceivePack = `00b1${'0'.repeat(40)} capabilities^{}\0${receiveCapabilities}\n0000`;
  const pinned = dialectFromAdvertisements({ uploadPack: emptyUploadPack, receivePack: emptyReceivePack });
  const commit = '9a78875d96aea884af31fe7f1e85019e11d79cff';
  const annotated = '12773c56409db96de618125189f26afa03130fd5';
  const uploadCapabilities =
    'multi_ack thin-pack side-band side-band-64k ofs-delta shallow deepen-since deepen-not deepen-relative no-progress include-tag multi_ack_detailed no-done';
  const text = (service: GitService, references: Manifest['refs']): string =>
    served({ service, refs: references, dialect: pinned });

  it('is the dialect the deployed image installs', () => {
    const dockerfile = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../Dockerfile'),
      'utf8',
    );
    expect(dockerfile).toMatch(/^ARG GIT_VERSION=1:2\.39\.5-/mu);
    expect(pinned).toStrictEqual({ agent: 'git/2.39.5', capabilitiesWhenEmpty: false });
  });

  it('answers an empty repository with a bare flush on upload-pack and capabilities^{} on receive-pack', () => {
    expect(text('git-upload-pack', {})).toBe(emptyUploadPack);
    expect(text('git-receive-pack', {})).toBe(emptyReceivePack);
  });

  it('answers an unborn HEAD without a HEAD line or a symref', () => {
    const references = {
      'refs/heads/other': { oid: commit },
      'refs/tags/ann': { oid: annotated, peeled: commit },
      'refs/tags/light': { oid: commit },
    };
    expect(text('git-upload-pack', references)).toBe(
      [
        `00fb${commit} refs/heads/other\0${uploadCapabilities} object-format=sha1 agent=git/2.39.5\n`,
        `003b${annotated} refs/tags/ann\n`,
        `003e${commit} refs/tags/ann^{}\n`,
        `003d${commit} refs/tags/light\n`,
        '0000',
      ].join(''),
    );
    expect(text('git-receive-pack', references)).toBe(
      [
        `00b2${commit} refs/heads/other\0${receiveCapabilities}\n`,
        `003b${annotated} refs/tags/ann\n`,
        `003d${commit} refs/tags/light\n`,
        '0000',
      ].join(''),
    );
  });

  it('answers a born HEAD with HEAD first and its symref, and peels tags for upload-pack only', () => {
    const references = {
      'refs/tags/light': { oid: commit },
      'refs/heads/other': { oid: commit },
      'refs/tags/ann': { oid: annotated, peeled: commit },
      'refs/heads/main': { oid: commit },
    };
    expect(text('git-upload-pack', references)).toBe(
      [
        `010b${commit} HEAD\0${uploadCapabilities} symref=HEAD:refs/heads/main object-format=sha1 agent=git/2.39.5\n`,
        `003d${commit} refs/heads/main\n`,
        `003e${commit} refs/heads/other\n`,
        `003b${annotated} refs/tags/ann\n`,
        `003e${commit} refs/tags/ann^{}\n`,
        `003d${commit} refs/tags/light\n`,
        '0000',
      ].join(''),
    );
    expect(text('git-receive-pack', references)).toBe(
      [
        `00b1${commit} refs/heads/main\0${receiveCapabilities}\n`,
        `003e${commit} refs/heads/other\n`,
        `003b${annotated} refs/tags/ann\n`,
        `003d${commit} refs/tags/light\n`,
        '0000',
      ].join(''),
    );
  });
});

/** An empty repository's `capabilities^{}` pkt-line naming `capabilities`. */
const emptyLine = (capabilities: string): string => {
  const payload = `${'0'.repeat(40)} capabilities^{}\0${capabilities}\n`;
  return `${(payload.length + 4).toString(16).padStart(4, '0')}${payload}`;
};

describe('dialectFromAdvertisements', () => {
  const upload =
    'multi_ack thin-pack side-band side-band-64k ofs-delta shallow deepen-since deepen-not deepen-relative no-progress include-tag multi_ack_detailed no-done object-format=sha1';
  const receive = 'report-status report-status-v2 delete-refs side-band-64k quiet atomic ofs-delta object-format=sha1';

  it.each([
    ['2.39.5, which answers upload-pack with a bare flush', 'git/2.39.5', false],
    ['2.43.0, which names upload-pack capabilities on capabilities^{}', 'git/2.43.0', true],
    /* `transfer.advertiseOSInfo` (on by default): the agent carries the OS, which `git version` never prints. */
    ['2.55.0, which appends the operating system to its agent', 'git/2.55.0-Linux', true],
    ['an Apple build, whose agent git has already sanitised', 'git/2.39.3.(Apple.Git-146)', false],
  ] as const)('reads %s', (_label, agent, capabilitiesWhenEmpty) => {
    const uploadPack = capabilitiesWhenEmpty ? `${emptyLine(`${upload} agent=${agent}`)}0000` : '0000';
    expect(
      dialectFromAdvertisements({ uploadPack, receivePack: `${emptyLine(`${receive} agent=${agent}`)}0000` }),
    ).toStrictEqual({ agent, capabilitiesWhenEmpty });
  });

  it('refuses a receive-pack advertisement that names no agent', () => {
    expect(() => dialectFromAdvertisements({ uploadPack: '0000', receivePack: `${emptyLine(receive)}0000` })).toThrow(
      'name its agent',
    );
  });

  it('refuses output that is not an advertisement', () => {
    expect(() =>
      dialectFromAdvertisements({ uploadPack: '0000', receivePack: 'fatal: not a git repository\n' }),
    ).toThrow('pkt-line');
    expect(() =>
      dialectFromAdvertisements({
        uploadPack: `003c${'1'.repeat(40)} refs/heads/main\n0000`,
        receivePack: `${emptyLine(`${receive} agent=git/2.43.0`)}0000`,
      }),
    ).toThrow('flush or capabilities^{}');
  });
});

describe('installedGitDialect', () => {
  it('names the agent the git on PATH advertises, which may carry more than `git version` prints', async () => {
    const version = execFileSync('git', ['version'], { encoding: 'utf8', env: gitEnvironment }).trim();
    const dialect = await installedGitDialect();
    expect(dialect.agent.startsWith(`git/${version.slice('git version '.length).replaceAll(/[^!-~]/gu, '.')}`)).toBe(
      true,
    );
    await expect(installedGitDialect()).resolves.toBe(dialect);
  });
});
