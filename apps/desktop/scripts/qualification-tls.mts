/** Disposable-host TLS trust with durable exact-run cleanup; never changes application signing trust. */
import { execFileSync } from 'node:child_process';
import { randomUUID, X509Certificate } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile, rm, rename, realpath, lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';

/** Command seam for diagnostic trust-store fixtures; production defaults always use the native host. */
export type QualificationTlsOwner = {
  platform: NodeJS.Platform;
  home: string;
  execute(name: string, args: string[]): string;
};
const nativeOwner = (): QualificationTlsOwner => ({
  platform: process.platform,
  home: process.env['HOME'] ?? process.env['USERPROFILE'] ?? '',
  execute: (name, args) =>
    execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }),
});
const operationSchema = z.enum(['nss', 'windows', 'macTrust', 'macCertificate', 'linuxFile', 'linuxRefresh']);
const journalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  platform: z.enum(['linux', 'win32', 'darwin']),
  home: z.string(),
  fingerprint: z.string().regex(/^[A-F\d]{40}$/u),
  fingerprint256: z.string().regex(/^[A-F\d]{64}$/u),
  pending: z.array(operationSchema),
});
type Journal = z.infer<typeof journalSchema>;
const save = async (directory: string, journal: Journal): Promise<void> => {
  const path = join(directory, 'mirror-trust.json');
  await writeFile(`${path}.tmp`, JSON.stringify(journal), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
};
/** Refuse workstation trust mutation unless the host was explicitly enrolled as disposable. */
export const assertDisposableQualificationHost = (): void => {
  if (process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] !== '1') {
    throw new Error('Qualification requires an explicitly disposable host before trust mutation');
  }
  if (process.env['GITHUB_ACTIONS'] !== 'true' && process.env['TAU_QUALIFICATION_DISPOSABLE_VM'] !== '1') {
    throw new Error('Qualification trust requires a CI runner or explicitly disposable VM');
  }
};
const removeOperation = async (
  operation: z.infer<typeof operationSchema>,
  journal: Journal,
  context: { directory: string; owner: QualificationTlsOwner },
): Promise<void> => {
  const { directory, owner } = context;
  const command = owner.execute;
  const nickname = `tau-qualification-${journal.id}`;
  const caPath = join(directory, 'mirror-ca.crt');
  const nss = `sql:${join(owner.home, '.pki/nssdb')}`;
  const keychain = join(owner.home, 'Library/Keychains/login.keychain-db');
  const linuxPath = `/usr/local/share/ca-certificates/${nickname}.crt`;
  switch (operation) {
    case 'nss': {
      const entries = command('certutil', ['-L', '-d', nss]);
      if (entries.split('\n').some((line) => line.trimStart().startsWith(`${nickname} `))) {
        const certificate = command('certutil', ['-L', '-n', nickname, '-a', '-d', nss]);
        if (new X509Certificate(certificate).fingerprint256.replaceAll(':', '') !== journal.fingerprint256) {
          throw new Error('Refusing changed run NSS certificate');
        }
        command('certutil', ['-D', '-n', nickname, '-d', nss]);
      }
      break;
    }
    case 'windows': {
      const roots = command('certutil', ['-user', '-store', 'Root']).replaceAll(/\s/gu, '').toUpperCase();
      if (roots.includes(journal.fingerprint)) {
        command('certutil', ['-user', '-delstore', 'Root', journal.fingerprint]);
      }
      break;
    }
    case 'macTrust': {
      command('security', ['remove-trusted-cert', caPath]);
      break;
    }
    case 'macCertificate': {
      const entries = command('security', ['find-certificate', '-a', '-Z', keychain]);
      if (entries.includes(journal.fingerprint)) {
        command('security', ['delete-certificate', '-Z', journal.fingerprint, keychain]);
      }
      break;
    }
    case 'linuxFile': {
      const present = command('sudo', [
        '-n',
        'find',
        '/usr/local/share/ca-certificates',
        '-maxdepth',
        '1',
        '-name',
        `${nickname}.crt`,
        '-print',
      ]);
      if (!present.trim()) {
        return;
      }
      if (present.trim() !== linuxPath) {
        throw new Error('Unexpected system certificate lookup');
      }
      const pem = command('sudo', ['-n', 'cat', linuxPath]);
      if (new X509Certificate(pem).fingerprint256.replaceAll(':', '') !== journal.fingerprint256) {
        throw new Error('Refusing changed run system certificate');
      }
      command('sudo', ['-n', 'rm', '--', linuxPath]);
      break;
    }
    case 'linuxRefresh': {
      command('sudo', ['-n', 'update-ca-certificates']);
      break;
    }
  }
};
/** Recover only this run's recorded trust entries; failed operations remain pending for an always-step retry. */
export const cleanupQualificationTls = async (directory: string, owner = nativeOwner()): Promise<void> => {
  assertDisposableQualificationHost();
  const canonical = await realpath(directory);
  const journalPath = join(canonical, 'mirror-trust.json');
  const info = await lstat(journalPath).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (!info) {
    // Trust acquisition cannot start before this journal exists; remove only partial generated private keys.
    const removals = await Promise.allSettled(
      ['mirror-ca.key', 'mirror-server.key'].map(async (name) => rm(join(canonical, name), { force: true })),
    );
    const failures = removals.filter((result) => result.status === 'rejected').map((result): unknown => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Partial qualification TLS key cleanup failed');
    }
    return;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384) {
    throw new Error('Invalid TLS cleanup journal');
  }
  const journal = journalSchema.parse(JSON.parse(await readFile(journalPath, 'utf8')));
  const ca = new X509Certificate(await readFile(join(canonical, 'mirror-ca.crt')));
  if (
    journal.platform !== owner.platform ||
    journal.home !== owner.home ||
    !isAbsolute(owner.home) ||
    ca.fingerprint.replaceAll(':', '') !== journal.fingerprint ||
    ca.fingerprint256.replaceAll(':', '') !== journal.fingerprint256 ||
    ca.subject !== `CN=Tau qualification ${journal.id}`
  ) {
    throw new Error('TLS cleanup ownership differs');
  }
  const failures: unknown[] = [];
  /* oxlint-disable no-await-in-loop -- Each independent cleanup attempt durably records its own completion. */
  for (const operation of journal.pending) {
    // Refresh must remain pending until deletion succeeds; otherwise a retry leaves cached system trust behind.
    if (operation === 'linuxRefresh' && journal.pending.includes('linuxFile')) {
      continue;
    }
    try {
      await removeOperation(operation, journal, { directory: canonical, owner });
      journal.pending = journal.pending.filter((pending) => pending !== operation);
      await save(canonical, journal);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const path of ['mirror-ca.key', 'mirror-server.key']) {
    try {
      await rm(join(canonical, path), { force: true });
    } catch (error) {
      failures.push(error);
    }
  }
  /* oxlint-enable no-await-in-loop */
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Qualification TLS trust cleanup failed; pending operations retained');
  }
};
/** Install a unique run CA, rolling back partial acquisition and retaining a durable recovery record. */
export const prepareQualificationTls = async (
  directory: string,
  owner = nativeOwner(),
): Promise<{
  key: string;
  certificate: string;
  ca: string;
  remove(): Promise<void>;
}> => {
  assertDisposableQualificationHost();
  if (!isAbsolute(owner.home) || !['linux', 'win32', 'darwin'].includes(owner.platform)) {
    throw new Error('Unsupported qualification trust owner');
  }
  const canonical = await realpath(directory);
  for (const name of ['mirror-ca.crt', 'mirror-ca.key', 'mirror-server.key', 'mirror-trust.json']) {
    // oxlint-disable-next-line no-await-in-loop -- Preflight each reserved output before any certificate generation.
    const existing = await lstat(join(canonical, name)).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (existing) {
      throw new Error('Qualification TLS directory already contains owned state');
    }
  }
  const id = randomUUID();
  const caKey = join(canonical, 'mirror-ca.key');
  const caPath = join(canonical, 'mirror-ca.crt');
  const keyPath = join(canonical, 'mirror-server.key');
  const certificatePath = join(canonical, 'mirror-server.crt');
  const request = join(canonical, 'mirror-server.csr');
  const extension = join(canonical, 'mirror-server.ext');
  const command = owner.execute;
  let journal: Journal | undefined;
  try {
    command('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      caKey,
      '-out',
      caPath,
      '-days',
      '1',
      '-subj',
      `/CN=Tau qualification ${id}`,
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
    ]);
    command('openssl', [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      request,
      '-subj',
      '/CN=127.0.0.1',
    ]);
    await chmod(caKey, 0o600);
    await chmod(keyPath, 0o600);
    await writeFile(
      extension,
      'subjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
    );
    command('openssl', [
      'x509',
      '-req',
      '-in',
      request,
      '-CA',
      caPath,
      '-CAkey',
      caKey,
      '-CAcreateserial',
      '-out',
      certificatePath,
      '-days',
      '1',
      '-extfile',
      extension,
    ]);
    const ca = await readFile(caPath, 'utf8');
    const parsed = new X509Certificate(ca);
    journal = journalSchema.parse({
      schemaVersion: 1,
      id,
      platform: owner.platform,
      home: owner.home,
      fingerprint: parsed.fingerprint.replaceAll(':', ''),
      fingerprint256: parsed.fingerprint256.replaceAll(':', ''),
      pending: [],
    });
    await save(canonical, journal);
    const acquire = async (operations: Journal['pending'], action: () => void): Promise<void> => {
      journal!.pending.push(...operations);
      await save(canonical, journal!);
      action();
    };
    switch (owner.platform) {
      case 'win32': {
        await acquire(['windows'], () => {
          command('certutil', ['-user', '-addstore', 'Root', caPath]);
        });
        break;
      }
      case 'darwin': {
        await acquire(['macTrust', 'macCertificate'], () => {
          command('security', [
            'add-trusted-cert',
            '-r',
            'trustRoot',
            '-k',
            join(owner.home, 'Library/Keychains/login.keychain-db'),
            caPath,
          ]);
        });
        break;
      }
      case 'linux': {
        const nssDirectory = join(owner.home, '.pki/nssdb');
        await mkdir(nssDirectory, { recursive: true });
        try {
          command('certutil', ['-L', '-d', `sql:${nssDirectory}`]);
        } catch (error) {
          const existing = await readdir(nssDirectory);
          if (existing.length > 0) {
            throw new Error('Refusing to initialize an existing unreadable NSS trust database', { cause: error });
          }
          command('certutil', ['-N', '--empty-password', '-d', `sql:${nssDirectory}`]);
        }
        await acquire(['nss'], () => {
          command('certutil', [
            '-A',
            '-n',
            `tau-qualification-${id}`,
            '-t',
            'C,,',
            '-i',
            caPath,
            '-d',
            `sql:${nssDirectory}`,
          ]);
        });
        await acquire(['linuxFile', 'linuxRefresh'], () => {
          command('sudo', [
            '-n',
            'install',
            '-m',
            '0644',
            caPath,
            `/usr/local/share/ca-certificates/tau-qualification-${id}.crt`,
          ]);
          command('sudo', ['-n', 'update-ca-certificates']);
        });
        break;
      }
    }
    return {
      key: await readFile(keyPath, 'utf8'),
      certificate: await readFile(certificatePath, 'utf8'),
      ca,
      remove: async () => cleanupQualificationTls(canonical, owner),
    };
  } catch (error) {
    const failures: unknown[] = [error];
    if (journal) {
      try {
        await cleanupQualificationTls(canonical, owner);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    } else {
      for (const path of [caKey, keyPath]) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- Attempt removal of both private keys after partial generation.
          await rm(path, { force: true });
        } catch (cleanupError) {
          failures.push(cleanupError);
        }
      }
    }
    throw new AggregateError(failures, 'Qualification TLS acquisition failed');
  }
};
