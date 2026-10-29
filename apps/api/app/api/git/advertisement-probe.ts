import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { dialectFromAdvertisements } from '#api/git/advertisement.js';
import type { AdvertisementDialect } from '#api/git/advertisement.js';
import type { GitService } from '#api/git/git.constants.js';
import { gitChildEnvironment, runGit } from '#api/git/store/lease.js';

/**
 * Probes the installed git for its {@link AdvertisementDialect} (DB1). It
 * spawns git, so it lives apart from the advertisement writer: tau-storage
 * runs it, and tau-api, which has no git child (DC1), reaches only the writer.
 */

const execFileAsync = promisify(execFile);

/**
 * Asks the installed git for both advertisements over a throwaway empty bare
 * repository, initialised as `hydrateLease` initialises a lease and run with
 * the environment every lease child gets.
 *
 * @returns The installed git's dialect.
 */
const probeInstalledGit = async (): Promise<AdvertisementDialect> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tau-advertise-probe-'));
  try {
    await runGit(directory, ['init', '--bare', '--quiet', '--template=', '--initial-branch=main', '.']);
    const advertise = async (service: GitService): Promise<string> => {
      const { stdout } = await execFileAsync(
        'git',
        [service.replace('git-', ''), '--stateless-rpc', '--advertise-refs', directory],
        { encoding: 'latin1', timeout: 10_000, env: gitChildEnvironment(directory) },
      );
      return stdout;
    };
    const [uploadPack, receivePack] = await Promise.all([advertise('git-upload-pack'), advertise('git-receive-pack')]);
    return dialectFromAdvertisements({ uploadPack, receivePack });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

let installed: Promise<AdvertisementDialect> | undefined;

/**
 * The dialect of the git this process spawns for every RPC, asked once per
 * process. The advertisement promises capabilities the following
 * `upload-pack`/`receive-pack` child must honour, and both run on this Machine,
 * so it speaks for that binary, read from that binary's own advertisement. A
 * failed probe is not kept, so the next advertisement asks again.
 *
 * Once per process, because the binary only changes with the image. Since
 * DC1 this runs on tau-storage, and tau-api asks it for the answer.
 *
 * @returns The installed git's dialect.
 */
export const installedGitDialect = async (): Promise<AdvertisementDialect> => {
  installed ??= probeInstalledGit();
  try {
    return await installed;
  } catch (error) {
    installed = undefined;
    throw error;
  }
};
