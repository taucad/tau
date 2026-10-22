/** Recognize only administrator-owned immutable AppImages for package-manager updates. */
import { lstat, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';
import { linuxInstallation } from '#shared/linux-installation.js';

/** A portable image stays portable; an image inside the managed tree must pass every ownership check. */
export const isManagedAppImage = async (options: {
  path: string | undefined;
  channel: 'production' | 'staging';
  version: string;
}): Promise<boolean> => {
  const { root, executable } = linuxInstallation(options.channel, true);
  if (!options.path?.startsWith(`${root}/`)) {
    return false;
  }
  const expected = `${root}/releases/${options.version}/${executable}`;
  if (options.path !== expected || (await realpath(expected)) !== expected) {
    throw new Error('Managed AppImage is outside its canonical immutable generation');
  }
  let path = expected;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Check every ancestor before granting system-managed update behavior.
    const info = await lstat(path);
    // oxlint-disable-next-line no-bitwise -- POSIX group/other write permissions.
    if (info.uid !== 0 || (info.mode & 0o022) !== 0 || (path === expected ? !info.isFile() : !info.isDirectory())) {
      throw new Error('Managed AppImage and ancestors must be root-owned and not user-writable');
    }
    if (path === '/') {
      break;
    }
    path = dirname(path);
  }
  return true;
};
