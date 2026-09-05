import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

import { z } from 'zod';

const credentialSchema = z.object({
  v: z.literal(1),
  deviceId: z.string().min(1),
  credential: z.string().min(32),
});

/** Durable device credential stored only by the daemon parent. @public */
export type HostCredential = z.infer<typeof credentialSchema>;

const defaultConfigDirectory = (): string => {
  if (process.env['TAU_CONFIG_DIR']) {
    return process.env['TAU_CONFIG_DIR'];
  }
  if (platform() === 'win32') {
    return join(process.env['APPDATA'] ?? homedir(), 'tau');
  }
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'tau');
  }
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'tau');
};

export const hostCredentialPath = (): string => join(defaultConfigDirectory(), 'host.json');

export const readHostCredential = async (): Promise<HostCredential | undefined> => {
  try {
    return credentialSchema.parse(JSON.parse(await readFile(hostCredentialPath(), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw new Error(`Tau Host credential at ${hostCredentialPath()} is invalid; remove it and pair again.`, {
      cause: error,
    });
  }
};

export const writeHostCredential = async (credential: HostCredential): Promise<void> => {
  const validated = credentialSchema.parse(credential);
  const target = hostCredentialPath();
  const temporary = join(dirname(target), `.host-${randomUUID()}.tmp`);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(validated, undefined, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  await chmod(temporary, 0o600);
  await rename(temporary, target);
  await chmod(target, 0o600);
};

export const removeHostCredential = async (): Promise<void> => {
  await unlink(hostCredentialPath()).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  });
};
